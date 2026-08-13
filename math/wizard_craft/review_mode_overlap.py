"""Read-only weighted overlap and replay review for WIZARD CRAFT."""

import argparse
import json
from collections import defaultdict
from fractions import Fraction
from itertools import combinations
from pathlib import Path

from analyze_tier_rebalance import TARGETS, book_tier, iter_books, read_lookup


def anticipation_active(value):
    if isinstance(value, dict):
        return any(anticipation_active(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(anticipation_active(item) for item in value)
    return bool(value)


def event_signature(book):
    counts = defaultdict(int)
    anticipation_count = 0
    for event in book["events"]:
        counts[event["type"]] += 1
        if event["type"] == "reveal" and anticipation_active(
            event.get("anticipation")
        ):
            anticipation_count += 1
    return (
        book["criteria"],
        book_tier(book) or 0,
        counts["reveal"],
        anticipation_count,
        counts["expandVsReel"],
        counts["upgradeStickyReel"],
        counts["freeSpinRetrigger"],
        counts["wincap"],
    )


def replay_candidate(book, weight, cost):
    return {
        "eventId": book["id"],
        "payoutMultiplier": book["payoutMultiplier"] / 100,
        "payoutPerCost": book["payoutMultiplier"] / 100 / cost,
        "criteria": book["criteria"],
        "tier": book_tier(book),
        "weight": weight,
        "eventCount": len(book["events"]),
    }


def better(current, candidate, target=None):
    if current is None:
        return candidate
    if target is None:
        return candidate if candidate["weight"] > current["weight"] else current
    candidate_key = (
        abs(candidate["payoutPerCost"] - target),
        -candidate["weight"],
        candidate["eventId"],
    )
    current_key = (
        abs(current["payoutPerCost"] - target),
        -current["weight"],
        current["eventId"],
    )
    return candidate if candidate_key < current_key else current


def analyze_mode(publish_path, mode):
    cost = TARGETS[mode]["cost"]
    lookup = read_lookup(publish_path / f"lookUpTable_{mode}_0.csv")
    total_weight = sum(weight for _, weight, _ in lookup)
    payout_distribution = defaultdict(int)
    positive_payout_distribution = defaultdict(int)
    signature_distribution = defaultdict(int)
    feature_signature_distribution = defaultdict(int)
    tier_distributions = {
        1: defaultdict(int),
        2: defaultdict(int),
        3: defaultdict(int),
    }
    positive_weight = 0
    feature_weight = 0
    replays = {
        "loss": None,
        "normalWin": None,
        "largeWin": None,
        "maximumWin": None,
        "nearMiss": None,
        "tier1": None,
        "tier2": None,
        "tier3": None,
    }

    books = iter_books(publish_path / f"books_{mode}.jsonl.zst")
    for expected_id, (book, row) in enumerate(zip(books, lookup, strict=True)):
        sim_id, weight, payout = row
        if sim_id != expected_id or payout != book["payoutMultiplier"]:
            raise RuntimeError(f"{mode}: book/LUT mismatch at {expected_id}")
        normalized = Fraction(payout, 100 * cost)
        payout_distribution[normalized] += weight
        signature = event_signature(book)
        signature_distribution[signature] += weight
        if payout > 0:
            positive_payout_distribution[normalized] += weight
            positive_weight += weight
        tier = book_tier(book)
        if tier:
            feature_signature_distribution[signature] += weight
            feature_weight += weight
            tier_distributions[tier][normalized] += weight
        candidate = replay_candidate(book, weight, cost)

        if payout == 0:
            replays["loss"] = better(replays["loss"], candidate)
        elif payout == 2_500_000:
            replays["maximumWin"] = better(replays["maximumWin"], candidate)
        else:
            replays["normalWin"] = better(replays["normalWin"], candidate, 1)
            replays["largeWin"] = better(replays["largeWin"], candidate, 100)

        if tier:
            key = f"tier{tier}"
            replays[key] = better(replays[key], candidate)

        has_anticipation = any(
            event["type"] == "reveal"
            and anticipation_active(event.get("anticipation"))
            for event in book["events"]
        )
        if has_anticipation and tier is None:
            replays["nearMiss"] = better(replays["nearMiss"], candidate)

    return {
        "mode": mode,
        "cost": cost,
        "totalWeight": total_weight,
        "payoutDistribution": payout_distribution,
        "positivePayoutDistribution": positive_payout_distribution,
        "signatureDistribution": signature_distribution,
        "featureSignatureDistribution": feature_signature_distribution,
        "positiveWeight": positive_weight,
        "featureWeight": feature_weight,
        "tierDistributions": tier_distributions,
        "replays": replays,
    }


def tier_review(mode):
    summaries = {}
    for tier, distribution in mode["tierDistributions"].items():
        total = sum(distribution.values())
        mean = float(sum(
            payout * weight
            for payout, weight in distribution.items()
        ) / total)
        running = 0
        median = Fraction(0)
        for payout, weight in sorted(distribution.items()):
            running += weight
            if running * 2 >= total:
                median = payout
                break
        summaries[f"tier{tier}"] = {
            "meanPayoutPerCost": mean,
            "medianPayoutPerCost": float(median),
            "minimumPayoutPerCost": float(min(distribution)),
            "maximumPayoutPerCost": float(max(distribution)),
        }
    overlaps = []
    for left, right in combinations((1, 2, 3), 2):
        left_dist = mode["tierDistributions"][left]
        right_dist = mode["tierDistributions"][right]
        left_total = sum(left_dist.values())
        right_total = sum(right_dist.values())
        shared = sum(
            min(
                Fraction(left_dist[value], left_total),
                Fraction(right_dist[value], right_total),
            )
            for value in left_dist.keys() & right_dist.keys()
        )
        overlaps.append({
            "left": f"tier{left}",
            "right": f"tier{right}",
            "payoutOverlap": float(shared),
        })
    return {
        "tiers": summaries,
        "comparisons": overlaps,
    }


def overlap(left, right, key, total_key="totalWeight"):
    left_dist = left[key]
    right_dist = right[key]
    left_total = left[total_key]
    right_total = right[total_key]
    return float(sum(
        min(
            Fraction(left_dist[value], left_total),
            Fraction(right_dist[value], right_total),
        )
        for value in left_dist.keys() & right_dist.keys()
    ))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("publish_path", type=Path)
    args = parser.parse_args()
    modes = [
        analyze_mode(args.publish_path, mode)
        for mode in TARGETS
    ]
    comparisons = []
    for left, right in combinations(modes, 2):
        comparisons.append({
            "left": left["mode"],
            "right": right["mode"],
            "payoutOverlap": overlap(left, right, "payoutDistribution"),
            "positivePayoutOverlap": overlap(
                left,
                right,
                "positivePayoutDistribution",
                "positiveWeight",
            ),
            "eventSignatureOverlap": overlap(
                left,
                right,
                "signatureDistribution",
            ),
            "featureSignatureOverlap": overlap(
                left,
                right,
                "featureSignatureDistribution",
                "featureWeight",
            ),
        })
    print(json.dumps({
        "schemaVersion": 1,
        "approvalClaim": False,
        "weighted": True,
        "comparisonMeaning": (
            "0 means no shared probability shape; 1 means identical shape"
        ),
        "comparisons": comparisons,
        "replays": {
            mode["mode"]: mode["replays"]
            for mode in modes
        },
        "tierReviews": {
            mode["mode"]: tier_review(mode)
            for mode in modes
        },
    }, indent=2))


if __name__ == "__main__":
    main()
