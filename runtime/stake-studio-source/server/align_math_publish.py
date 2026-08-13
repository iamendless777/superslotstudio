#!/usr/bin/env python3
"""Deterministically align optimized Stake LUT RTP using integer weights only."""

from __future__ import annotations

import csv
import json
import math
import os
import sys
import tempfile
import io
from fractions import Fraction
from pathlib import Path

import zstandard


UINT64_MAX = (1 << 64) - 1
def _solve_additions(primary: int, counter: int, needed: int):
    """Solve primary*x - counter*y = needed for the smallest non-negative x+y."""
    divisor = math.gcd(primary, counter)
    if needed % divisor:
        return None
    p = primary // divisor
    c = counter // divisor
    n = needed // divisor
    residue = 0 if c == 1 else (n * pow(p, -1, c)) % c
    minimum = (needed + primary - 1) // primary
    if residue < minimum:
        residue += ((minimum - residue + c - 1) // c) * c
    correction = (primary * residue - needed) // counter
    if correction < 0:
        return None
    return residue, correction


def protected_wincap_ids(book_path: Path) -> set[int]:
    protected = set()
    decompressor = zstandard.ZstdDecompressor()
    with book_path.open("rb") as compressed:
        with decompressor.stream_reader(compressed) as stream:
            with io.TextIOWrapper(stream, encoding="utf-8") as text:
                for line in text:
                    if not line.strip():
                        continue
                    book = json.loads(line)
                    if book.get("criteria") == "wincap":
                        protected.add(int(book["id"]))
    return protected


def align_mode(table_path: Path, target_rtp, cost, protected_ids=None):
    protected_ids = set(protected_ids or ())
    target = Fraction(str(target_rtp))
    mode_cost = Fraction(str(cost))
    target_units = target * 100 * mode_cost
    target_num = target_units.numerator
    target_den = target_units.denominator

    total_weight = 0
    weighted_payout = 0
    samples = {}
    rows = 0
    with table_path.open(newline="", encoding="utf-8") as source:
        for line_number, row in enumerate(csv.reader(source), start=1):
            if line_number == 1 and [part.strip() for part in row] == ["simId", "weight", "payoutMultiplier"]:
                continue
            if len(row) != 3:
                raise ValueError(f"Invalid LUT row in {table_path}: {row!r}")
            sim_id, weight, payout = map(int, row)
            if min(sim_id, weight, payout) < 0 or max(sim_id, weight, payout) > UINT64_MAX:
                raise ValueError(f"Non-uint64 LUT row in {table_path}: {row!r}")
            total_weight += weight
            weighted_payout += weight * payout
            samples.setdefault(payout, (sim_id, weight))
            rows += 1

    if rows == 0 or total_weight == 0:
        raise ValueError(f"LUT is empty or has zero total weight: {table_path}")

    delta = weighted_payout * target_den - total_weight * target_num
    before = Fraction(weighted_payout, total_weight * 100) / mode_cost
    if delta == 0:
        return {"mode": table_path.stem.removeprefix("lookUpTable_").removesuffix("_0"), "changed": False,
                "rows": rows, "beforeRtp": float(before), "afterRtp": float(before), "exact": True,
                "adjustments": []}

    positive = sorted(
        ((payout * target_den - target_num, payout, sim_id, weight)
         for payout, (sim_id, weight) in samples.items()
         if payout * target_den > target_num and sim_id not in protected_ids),
        reverse=True,
    )[:128]
    negative = sorted(
        ((target_num - payout * target_den, payout, sim_id, weight)
         for payout, (sim_id, weight) in samples.items()
         if payout * target_den < target_num and sim_id not in protected_ids),
        reverse=True,
    )[:128]
    if not positive or not negative:
        raise ValueError(f"LUT must contain payouts on both sides of the target: {table_path}")

    needed = abs(delta)
    best = None
    if delta < 0:
        for primary, ppayout, pid, _ in positive:
            for counter, cpayout, cid, _ in negative:
                solved = _solve_additions(primary, counter, needed)
                if solved is None:
                    continue
                x, y = solved
                candidate = (x + y, x, y, pid, cid, ppayout, cpayout)
                if best is None or candidate < best:
                    best = candidate
    else:
        for primary, ppayout, pid, _ in negative:
            for counter, cpayout, cid, _ in positive:
                solved = _solve_additions(primary, counter, needed)
                if solved is None:
                    continue
                x, y = solved
                candidate = (x + y, x, y, pid, cid, ppayout, cpayout)
                if best is None or candidate < best:
                    best = candidate

    if best is None:
        raise ValueError(f"Could not find an exact non-negative integer weight alignment for {table_path}")

    _, primary_add, counter_add, primary_id, counter_id, primary_payout, counter_payout = best
    adjustments = {primary_id: primary_add, counter_id: counter_add}
    for sim_id, addition in adjustments.items():
        current = next(weight for payout, (row_id, weight) in samples.items() if row_id == sim_id)
        if current + addition > UINT64_MAX:
            raise OverflowError(f"Weight adjustment exceeds uint64 for simulation {sim_id}")

    added_weight = primary_add + counter_add
    added_payout = primary_add * primary_payout + counter_add * counter_payout
    after_weight = total_weight + added_weight
    after_payout = weighted_payout + added_payout
    after_delta = after_payout * target_den - after_weight * target_num
    after = Fraction(after_payout, after_weight * 100) / mode_cost
    if after_weight > UINT64_MAX:
        raise OverflowError(f"Aligned total lookup weight exceeds uint64 for {table_path}")
    if after_delta != 0:
        raise ValueError(f"Aligned LUT is not mathematically exact: {table_path}")

    # Only replace the table after every exactness and range check has passed.
    handle, temp_name = tempfile.mkstemp(prefix=f".{table_path.name}.", suffix=".tmp", dir=table_path.parent)
    os.close(handle)
    try:
        with table_path.open(newline="", encoding="utf-8") as source, open(
            temp_name, "w", newline="", encoding="utf-8"
        ) as target_file:
            reader = csv.reader(source)
            writer = csv.writer(target_file, lineterminator="\n")
            for line_number, row in enumerate(reader, start=1):
                if line_number == 1 and [part.strip() for part in row] == ["simId", "weight", "payoutMultiplier"]:
                    writer.writerow(row)
                    continue
                sim_id, weight, payout = map(int, row)
                writer.writerow((sim_id, weight + adjustments.get(sim_id, 0), payout))
        os.replace(temp_name, table_path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)

    return {
        "mode": table_path.stem.removeprefix("lookUpTable_").removesuffix("_0"),
        "changed": True,
        "rows": rows,
        "beforeRtp": float(before),
        "afterRtp": float(after),
        "exact": True,
        "adjustments": [
            {"simulationId": primary_id, "payout": primary_payout, "weightAdded": primary_add},
            {"simulationId": counter_id, "payout": counter_payout, "weightAdded": counter_add},
        ],
    }


def align_mode_with_criterion(table_path: Path, target_rtp, cost, criterion):
    """Align total RTP and one reserved payout's RTP contribution exactly."""
    target = Fraction(str(target_rtp))
    mode_cost = Fraction(str(cost))
    reserved_payout = int(Fraction(str(criterion["payoutMultiplier"])) * 100)
    criterion_rtp = Fraction(str(criterion["rtp"]))
    reserved_ratio = criterion_rtp * 100 * mode_cost / reserved_payout
    if reserved_ratio <= 0 or reserved_ratio >= 1:
        raise ValueError(f"Reserved criterion ratio must be between zero and one: {table_path}")

    rows = []
    total_weight = weighted_payout = reserved_weight = 0
    ordinary_samples = {}
    with table_path.open(newline="", encoding="utf-8") as source:
        for line_number, row in enumerate(csv.reader(source), start=1):
            if line_number == 1 and [part.strip() for part in row] == ["simId", "weight", "payoutMultiplier"]:
                continue
            sim_id, weight, payout = map(int, row)
            rows.append((sim_id, weight, payout))
            total_weight += weight
            weighted_payout += weight * payout
            if payout == reserved_payout:
                reserved_weight += weight
            else:
                ordinary_samples.setdefault(payout, (sim_id, weight))
    if not rows or not ordinary_samples or reserved_weight <= 0:
        raise ValueError(f"Reserved payout {reserved_payout} is absent from {table_path}")

    before = Fraction(weighted_payout, total_weight * 100) / mode_cost
    before_criterion = Fraction(reserved_payout * reserved_weight, total_weight * 100) / mode_cost
    ratio_num, ratio_den = reserved_ratio.numerator, reserved_ratio.denominator
    minimum_k = max(
        (total_weight + ratio_den - 1) // ratio_den,
        (reserved_weight + ratio_num - 1) // ratio_num,
    )
    solution = None
    payouts = sorted(ordinary_samples)
    for k in range(minimum_k, minimum_k + 100_000):
        final_weight = ratio_den * k
        final_reserved_weight = ratio_num * k
        reserved_add = final_reserved_weight - reserved_weight
        total_add = final_weight - total_weight
        ordinary_add = total_add - reserved_add
        if reserved_add < 0 or ordinary_add < 0:
            continue
        required_total = target * 100 * mode_cost * final_weight
        if required_total.denominator != 1:
            continue
        ordinary_payout_add = int(required_total) - weighted_payout - reserved_add * reserved_payout
        if ordinary_payout_add < 0:
            continue
        for low in payouts:
            for high in reversed(payouts):
                if high <= low:
                    break
                remainder = ordinary_payout_add - low * ordinary_add
                difference = high - low
                if 0 <= remainder <= difference * ordinary_add and remainder % difference == 0:
                    high_add = remainder // difference
                    low_add = ordinary_add - high_add
                    solution = (reserved_add, low, low_add, high, high_add, final_weight)
                    break
            if solution:
                break
        if solution:
            break
    if solution is None:
        raise ValueError(f"Could not jointly align RTP and reserved criterion for {table_path}")

    reserved_add, low, low_add, high, high_add, final_weight = solution
    reserved_id = next(sim_id for sim_id, _, payout in rows if payout == reserved_payout)
    adjustments = {
        reserved_id: reserved_add,
        ordinary_samples[low][0]: low_add,
        ordinary_samples[high][0]: high_add,
    }
    for sim_id, weight, _ in rows:
        if weight + adjustments.get(sim_id, 0) > UINT64_MAX:
            raise OverflowError(f"Weight adjustment exceeds uint64 for simulation {sim_id}")
    if final_weight > UINT64_MAX:
        raise OverflowError(f"Aligned total lookup weight exceeds uint64 for {table_path}")

    handle, temp_name = tempfile.mkstemp(prefix=f".{table_path.name}.", suffix=".tmp", dir=table_path.parent)
    os.close(handle)
    try:
        with table_path.open(newline="", encoding="utf-8") as source, open(
            temp_name, "w", newline="", encoding="utf-8"
        ) as target_file:
            reader = csv.reader(source)
            writer = csv.writer(target_file, lineterminator="\n")
            for line_number, row in enumerate(reader, start=1):
                if line_number == 1 and [part.strip() for part in row] == ["simId", "weight", "payoutMultiplier"]:
                    writer.writerow(row)
                    continue
                sim_id, weight, payout = map(int, row)
                writer.writerow((sim_id, weight + adjustments.get(sim_id, 0), payout))
        os.replace(temp_name, table_path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)

    final_payout = weighted_payout + reserved_add * reserved_payout + low_add * low + high_add * high
    after = Fraction(final_payout, final_weight * 100) / mode_cost
    after_criterion = Fraction(reserved_payout * (reserved_weight + reserved_add), final_weight * 100) / mode_cost
    if after != target or after_criterion != criterion_rtp:
        raise ValueError(f"Joint alignment failed exact postconditions for {table_path}")
    return {
        "mode": table_path.stem.removeprefix("lookUpTable_").removesuffix("_0"),
        "changed": any(adjustments.values()),
        "rows": len(rows),
        "beforeRtp": float(before),
        "afterRtp": float(after),
        "exact": True,
        "criterion": criterion.get("name", "reserved"),
        "beforeCriterionRtp": float(before_criterion),
        "afterCriterionRtp": float(after_criterion),
        "criterionExact": True,
        "adjustments": [
            {"simulationId": sim_id, "payout": payout, "weightAdded": adjustments[sim_id]}
            for sim_id, _, payout in rows if sim_id in adjustments
        ],
    }


def main() -> None:
    if len(sys.argv) not in {3, 4}:
        raise SystemExit("Usage: align_math_publish.py <publish_files> '<targets-json>' ['<criteria-json>']")
    publish_dir = Path(sys.argv[1]).resolve()
    targets = json.loads(sys.argv[2])
    criteria = json.loads(sys.argv[3]) if len(sys.argv) == 4 else {}
    index = json.loads((publish_dir / "index.json").read_text(encoding="utf-8"))
    modes = {mode["name"]: mode for mode in index.get("modes", [])}
    reports = []
    for name, target in targets.items():
        if name not in modes:
            raise ValueError(f"Mode {name!r} is missing from index.json")
        weights_name = modes[name].get("weights") or f"lookUpTable_{name}_0.csv"
        books_name = modes[name].get("events") or f"books_{name}.jsonl.zst"
        protected = protected_wincap_ids(publish_dir / books_name)
        if name in criteria:
            mode_report = align_mode_with_criterion(publish_dir / weights_name, target, modes[name]["cost"], criteria[name])
        else:
            mode_report = align_mode(publish_dir / weights_name, target, modes[name]["cost"], protected)
            mode_report["protectedWincapSimulationIds"] = sorted(protected)
        reports.append(mode_report)
    print(json.dumps({"valid": True, "modes": reports}, separators=(",", ":")))


if __name__ == "__main__":
    main()
