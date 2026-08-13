#!/usr/bin/env python3
"""Stream-verify the packaged WIZARD CRAFT Stake Engine release."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import subprocess
from fractions import Fraction
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RELEASE = ROOT / "dist/wizard-craft-stake-release"
ALLOWED_CRITERIA = {"0", "basegame", "freegame", "wincap"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def lookup(path: Path) -> tuple[list[int], list[int]]:
    payouts: list[int] = []
    weights: list[int] = []
    with path.open(newline="", encoding="utf-8") as stream:
        for expected_id, row in enumerate(csv.reader(stream)):
            if len(row) != 3:
                raise RuntimeError(f"Malformed lookup row {expected_id} in {path.name}")
            sim_id, weight, payout = map(int, row)
            if sim_id != expected_id:
                raise RuntimeError(f"Non-sequential sim ID in {path.name}: {sim_id}")
            if weight < 0 or payout < 0 or payout > 2_500_000:
                raise RuntimeError(f"Out-of-range lookup row {sim_id} in {path.name}")
            if payout and (payout < 10 or payout % 10):
                raise RuntimeError(f"Invalid nonzero payout {payout} in {path.name}")
            payouts.append(payout)
            weights.append(weight)
    if sum(weights) <= 0:
        raise RuntimeError(f"Lookup has no positive probability mass: {path.name}")
    return payouts, weights


def verify_books(path: Path, payouts: list[int]) -> None:
    process = subprocess.Popen(
        ["zstd", "-qdc", str(path)],
        stdout=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    assert process.stdout is not None
    count = 0
    try:
        for expected_id, line in enumerate(process.stdout):
            book = json.loads(line)
            if book.get("id") != expected_id:
                raise RuntimeError(f"Non-sequential book ID in {path.name}")
            if expected_id >= len(payouts):
                raise RuntimeError(f"More books than lookup rows in {path.name}")
            payout = book.get("payoutMultiplier")
            if payout != payouts[expected_id]:
                raise RuntimeError(
                    f"Book/LUT payout mismatch in {path.name} at {expected_id}"
                )
            if payout < 0 or payout > 2_500_000:
                raise RuntimeError(f"Book payout exceeds 25,000x in {path.name}")
            if book.get("criteria") not in ALLOWED_CRITERIA:
                raise RuntimeError(f"Invalid criteria in {path.name} at {expected_id}")
            events = book.get("events")
            if not isinstance(events, list) or not events:
                raise RuntimeError(f"Missing events in {path.name} at {expected_id}")
            for event_index, event in enumerate(events):
                if event.get("index") != event_index or not isinstance(event.get("type"), str):
                    raise RuntimeError(
                        f"Invalid event sequence in {path.name} at book {expected_id}"
                    )
            count += 1
    finally:
        process.stdout.close()
    if process.wait() != 0:
        raise RuntimeError(f"Corrupt zstd stream: {path.name}")
    if count != len(payouts):
        raise RuntimeError(
            f"Book/LUT length mismatch in {path.name}: {count} != {len(payouts)}"
        )


def verify_risk(mode: str, payouts: list[int], weights: list[int], cost: float) -> dict[str, float]:
    """Mirror current math-sdk 3-star volatility checks in cost-aware units."""
    total = sum(weights)
    distribution: dict[float, int] = {}
    for payout, weight in zip(payouts, weights):
        value = payout / 100
        distribution[value] = distribution.get(value, 0) + weight
    average = sum(value * weight for value, weight in distribution.items()) / total
    variance = sum(
        (value - average) ** 2 * weight / total
        for value, weight in distribution.items()
    )
    ordered = sorted(distribution.items())
    cumulative = 0
    tail_start = ordered[0][0]
    for value, weight in ordered:
        cumulative += weight
        if cumulative / total >= 0.999:
            tail_start = value
            break
    tail_weight = sum(weight for value, weight in ordered if value >= tail_start)
    tail_value = sum(value * weight for value, weight in ordered if value >= tail_start)
    probability_scale = 0.2 if cost >= 1000 else 0.5 if cost >= 500 else 0.8 if cost >= 200 else 1.0
    metrics = {
        "stdPerCost": math.sqrt(variance) / cost,
        "prob5k": sum(weight for value, weight in ordered if value >= 5_000) / total * probability_scale,
        "prob10k": sum(weight for value, weight in ordered if value >= 10_000) / total * probability_scale,
        "etl40": sum(value * weight for value, weight in ordered if value >= 40 * cost) / total,
        "etl10k": sum(value * weight for value, weight in ordered if value >= 10_000) / total,
        "cvar": tail_value / tail_weight / cost,
        "nonzeroHitRate": sum(weight for value, weight in ordered if value > 0) / total,
        "maxHitRate": sum(weight for value, weight in ordered if value == 25_000) / total,
    }
    limits = {
        "stdPerCost": 60.0,
        "prob5k": 1e-2,
        "prob10k": 0.5e-2,
        "etl40": 0.9,
        "etl10k": 0.8,
        "cvar": 800.0,
    }
    violations = {
        name: (metrics[name], limit)
        for name, limit in limits.items()
        if metrics[name] > limit
    }
    if metrics["nonzeroHitRate"] <= 0.05:
        violations["nonzeroHitRate"] = (metrics["nonzeroHitRate"], 0.05)
    if metrics["maxHitRate"] <= 0 or metrics["maxHitRate"] < 1 / 10_000_000:
        violations["maxHitRate"] = (metrics["maxHitRate"], 1 / 10_000_000)
    if violations:
        raise RuntimeError(f"{mode}: Stake 3-star risk violations {violations}")
    return metrics


def main(release: Path) -> None:
    global RELEASE
    RELEASE = release
    manifest = json.loads((RELEASE / "release-manifest.json").read_text())
    declared = set(manifest["files"])
    actual = {
        str(path.relative_to(RELEASE))
        for path in RELEASE.rglob("*")
        if path.is_file() and path.name != "release-manifest.json"
    }
    if actual != declared:
        raise RuntimeError(
            f"Release file set differs from manifest: missing={declared-actual}, extra={actual-declared}"
        )
    for relative, expected in manifest["files"].items():
        path = RELEASE / relative
        if sha256(path) != expected:
            raise RuntimeError(f"Release hash mismatch: {relative}")

    config = json.loads((RELEASE / "configuration/config.json").read_text())
    for field in ("minDenomination", "providerNumber", "gameID", "rtp"):
        if field not in config:
            raise RuntimeError(f"Backend config is missing {field}")
    if config["gameID"] != manifest["gameID"]:
        raise RuntimeError("Backend gameID differs from release manifest")
    if not manifest.get("providerIdentityExplicit"):
        raise RuntimeError("Release was not built with an explicit provider identity")
    if config["providerNumber"] != manifest.get("providerNumber"):
        raise RuntimeError("Backend providerNumber differs from release manifest")
    frontend = config["frontendConfig"]
    if sha256(RELEASE / "configuration" / frontend["file"]) != frontend["sha256"]:
        raise RuntimeError("Frontend config hash differs from backend declaration")
    force = config["standardForceFile"]
    if sha256(RELEASE / "configuration" / force["file"]) != force["sha256"]:
        raise RuntimeError("Standard force hash differs from backend declaration")

    index = json.loads((RELEASE / "math/index.json").read_text())
    if [mode["name"] for mode in index["modes"]] != manifest["modes"]:
        raise RuntimeError("Release mode order differs between manifest and index")
    shelves = {mode["name"]: mode for mode in config["bookShelfConfig"]}
    if set(shelves) != set(manifest["modes"]):
        raise RuntimeError("Backend mode set differs from release manifest")
    for mode in index["modes"]:
        shelf = shelves[mode["name"]]
        if shelf["cost"] != mode["cost"]:
            raise RuntimeError(f'{mode["name"]}: index/backend cost mismatch')
        table = shelf["tables"][0]
        if table["file"] != mode["weights"]:
            raise RuntimeError(f'{mode["name"]}: backend/index lookup mismatch')
        book = shelf["booksFile"]
        if book["file"] != mode["events"]:
            raise RuntimeError(f'{mode["name"]}: backend/index book mismatch')
        table_path = RELEASE / "math" / mode["weights"]
        book_path = RELEASE / "math" / mode["events"]
        if sha256(table_path) != table["sha256"] or sha256(book_path) != book["sha256"]:
            raise RuntimeError(f'{mode["name"]}: backend math hash mismatch')
        payouts, weights = lookup(table_path)
        if shelf["bookLength"] != len(payouts):
            raise RuntimeError(f'{mode["name"]}: backend bookLength mismatch')
        exact_rtp = Fraction(
            sum(weight * payout for weight, payout in zip(weights, payouts)),
            sum(weights) * 100 * int(round(mode["cost"] * 1_000_000)),
        ) * 1_000_000
        declared_rtp = Fraction(str(shelf["rtp"]))
        if round(float(exact_rtp), 4) != round(float(declared_rtp), 4):
            raise RuntimeError(
                f'{mode["name"]}: exact RTP {float(exact_rtp):.12f} '
                f'differs from {shelf["rtp"]}'
            )
        risk = verify_risk(mode["name"], payouts, weights, mode["cost"])
        verify_books(book_path, payouts)
        print(
            f'{mode["name"]}: {len(payouts)} books verified; '
            f'weighted RTP {float(exact_rtp):.12f}; '
            f'std/cost {risk["stdPerCost"]:.3f}; CVaR {risk["cvar"]:.3f}'
        )
    print(f'{len(manifest["files"])} packaged file hashes verified')


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", type=Path, default=DEFAULT_RELEASE)
    args = parser.parse_args()
    main(args.release.resolve())
