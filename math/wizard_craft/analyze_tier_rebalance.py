"""Read-only tier-preserving weight feasibility for WIZARD CRAFT."""

import argparse
import json
import math
from io import TextIOWrapper
from pathlib import Path

import zstandard


TARGETS = {
    "baseBattle": {
        "cost": 1,
        "hit": 0.2555556,
        "feature": 1 / 180,
        "tiers": {1: 0.80, 2: 0.17, 3: 0.03},
    },
    "runeSpark": {
        "cost": 3,
        "hit": 0.2611112,
        "feature": 1 / 90,
        "tiers": {1: 0.75, 2: 0.20, 3: 0.05},
    },
    "siegeSigns": {
        "cost": 10,
        "hit": 0.2722226,
        "feature": 1 / 45,
        "tiers": {1: 0.68, 2: 0.24, 3: 0.08},
    },
    "openGrimoire": {
        "cost": 100,
        "hit": 1.0,
        "feature": 1.0,
        "tiers": {1: 0.55, 2: 0.30, 3: 0.15},
    },
}


def iter_books(path):
    with path.open("rb") as source:
        reader = zstandard.ZstdDecompressor().stream_reader(source)
        with TextIOWrapper(reader, encoding="utf-8") as text:
            for line in text:
                if line.strip():
                    yield json.loads(line)


def read_lookup(path):
    rows = []
    with path.open("r", encoding="utf-8") as source:
        for line in source:
            sim_id, weight, payout = line.strip().split(",")
            rows.append((int(sim_id), int(weight), int(payout)))
    return rows


def book_tier(book):
    for event in book["events"]:
        if event["type"] == "startDuel":
            return event["tier"]
    return None


def aggregate_rows(rows):
    payouts = {}
    for payout, weight in rows:
        total, squares = payouts.get(payout, (0, 0))
        payouts[payout] = (total + weight, squares + weight * weight)
    return [
        (payout, total, squares)
        for payout, (total, squares) in sorted(payouts.items())
    ]


def stable_distribution(rows, tilt):
    if not rows:
        raise RuntimeError("empty calibration group")
    scores = [
        math.log(max(total_weight, 1)) + tilt * (payout / 2_500_000)
        for payout, total_weight, _ in rows
    ]
    highest = max(scores)
    raw = [math.exp(score - highest) for score in scores]
    total = sum(raw)
    probabilities = [value / total for value in raw]
    square_probability = 0
    for (_, total_weight, square_weight), probability in zip(rows, probabilities):
        square_probability += probability * probability * (
            square_weight / (total_weight * total_weight)
        )
    return probabilities, 1 / square_probability


def evaluate(groups, masses, tilt, cost):
    mean = 0.0
    second = 0.0
    cap_probability = 0.0
    minimum_ess = None
    for name, rows in groups.items():
        probabilities, ess = stable_distribution(rows, tilt)
        mass = masses[name]
        minimum_ess = ess if minimum_ess is None else min(minimum_ess, ess)
        for (payout, _, _), probability in zip(rows, probabilities):
            normalized = payout / 100 / cost
            weighted = mass * probability
            mean += weighted * normalized
            second += weighted * normalized * normalized
            cap_probability += weighted * (payout == 2_500_000)
    return {
        "rtp": mean,
        "standardDeviationPerCost": math.sqrt(max(0, second - mean * mean)),
        "capProbability": cap_probability,
        "minimumConditionalEffectiveBooks": minimum_ess,
    }


def analyze_mode(publish_path, mode):
    target = TARGETS[mode]
    lookup = read_lookup(publish_path / f"lookUpTable_{mode}_0.csv")

    groups = {}
    book_count = 0
    books = iter_books(publish_path / f"books_{mode}.jsonl.zst")
    for expected_id, (book, row) in enumerate(zip(books, lookup, strict=True)):
        book_count += 1
        sim_id, weight, payout = row
        if sim_id != expected_id or payout != book["payoutMultiplier"]:
            raise RuntimeError(f"{mode}: invalid lookup identity at {expected_id}")
        tier = book_tier(book)
        if tier is not None:
            group = f"tier{tier}"
        elif payout == 0:
            group = "zero"
        else:
            group = "base"
        groups.setdefault(group, []).append((payout, weight))

    groups = {
        name: aggregate_rows(rows)
        for name, rows in groups.items()
    }

    masses = {}
    for tier, share in target["tiers"].items():
        masses[f"tier{tier}"] = target["feature"] * share
    if mode != "openGrimoire":
        masses["zero"] = 1 - target["hit"]
        masses["base"] = target["hit"] - target["feature"]

    if set(groups) != set(masses):
        raise RuntimeError(
            f"{mode}: calibration groups differ; groups={sorted(groups)}, "
            f"targets={sorted(masses)}"
        )

    low, high = -10_000.0, 10_000.0
    low_result = evaluate(groups, masses, low, target["cost"])
    high_result = evaluate(groups, masses, high, target["cost"])
    if not low_result["rtp"] <= 0.965 <= high_result["rtp"]:
        raise RuntimeError(
            f"{mode}: 96.5% outside tier-preserving range "
            f"{low_result['rtp']:.6f}..{high_result['rtp']:.6f}"
        )
    for _ in range(70):
        middle = (low + high) / 2
        result = evaluate(groups, masses, middle, target["cost"])
        if result["rtp"] < 0.965:
            low = middle
        else:
            high = middle
    result = evaluate(groups, masses, (low + high) / 2, target["cost"])
    return {
        "mode": mode,
        "outcomes": book_count,
        "targetHitProbability": target["hit"],
        "targetFeatureProbability": target["feature"],
        "targetTierShares": target["tiers"],
        "achievableRtpRange": {
            "minimum": low_result["rtp"],
            "maximum": high_result["rtp"],
        },
        **result,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("publish_path", type=Path)
    args = parser.parse_args()
    print(json.dumps({
        "schemaVersion": 1,
        "approvalClaim": False,
        "writesLookupTables": False,
        "modes": [
            analyze_mode(args.publish_path, mode)
            for mode in TARGETS
        ],
    }, indent=2))


if __name__ == "__main__":
    main()
