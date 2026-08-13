"""Stream-review exploratory WIZARD CRAFT official-SDK books."""

import argparse
import json
import math
from collections import Counter
from fractions import Fraction
from io import TextIOWrapper
from pathlib import Path

import zstandard


MODE_COSTS = {
    "baseBattle": 1,
    "runeSpark": 3,
    "siegeSigns": 10,
    "openGrimoire": 100,
}


def iter_books(path):
    with path.open("rb") as source:
        reader = zstandard.ZstdDecompressor().stream_reader(source)
        with TextIOWrapper(reader, encoding="utf-8") as text:
            for line in text:
                if line.strip():
                    yield json.loads(line)


def iter_lookup(path):
    with path.open("r", encoding="utf-8") as source:
        for line in source:
            sim_id, weight, payout = line.strip().split(",")
            yield int(sim_id), int(weight), int(payout)


def review_mode(publish_path, mode):
    outcomes = 0
    payout_total = 0
    criteria = Counter()
    event_types = Counter()
    tiers = Counter()
    final_stickies = Counter()
    tier_three_failures = 0
    maximum_payout = 0
    payouts = []
    book_rows = []

    for expected_id, book in enumerate(
        iter_books(publish_path / f"books_{mode}.jsonl.zst")
    ):
        if book["id"] != expected_id:
            raise RuntimeError(f"{mode}: non-contiguous book id")
        events = book["events"]
        if [event["index"] for event in events] != list(range(len(events))):
            raise RuntimeError(f"{mode}: non-contiguous event indexes at {expected_id}")
        if not events or events[-1]["type"] != "finalWin":
            raise RuntimeError(f"{mode}: missing terminal finalWin at {expected_id}")
        if events[-1]["amount"] != book["payoutMultiplier"]:
            raise RuntimeError(f"{mode}: final payout mismatch at {expected_id}")
        if book["payoutMultiplier"] > 2_500_000:
            raise RuntimeError(f"{mode}: payout exceeds 25,000x cap at {expected_id}")

        tier = None
        free_spin = 0
        first_sticky_spin = None
        sticky = {}
        temporary = {}
        for event in events:
            event_types[event["type"]] += 1
            if event["type"] == "reveal":
                if event.get("mode") != mode:
                    raise RuntimeError(f"{mode}: reveal missing paid-mode identity at {expected_id}")
                if event["gameType"] == "freegame":
                    free_spin += 1
                elif mode == "siegeSigns":
                    runes = sum(
                        symbol["name"] == "RUNE"
                        for reel in event["board"]
                        for symbol in reel
                    )
                    if runes < 1:
                        raise RuntimeError(
                            f"{mode}: base reveal without guaranteed rune at {expected_id}"
                        )
            elif event["type"] == "startDuel":
                tier = event["tier"]
                tiers[tier] += 1
            elif event["type"] == "freeSpinTrigger":
                if event.get("tier") not in {1, 2, 3}:
                    raise RuntimeError(f"{mode}: feature trigger missing tier at {expected_id}")
            elif event["type"] == "expandVsReel":
                reel = event["reel"]
                if reel in sticky or reel in temporary:
                    raise RuntimeError(f"{mode}: duplicate active VS reel at {expected_id}")
                if event["persistence"] == "sticky":
                    if tier == 1:
                        raise RuntimeError(f"{mode}: Tier I sticky at {expected_id}")
                    sticky[reel] = event["appliedMultiplier"]
                    if first_sticky_spin is None:
                        first_sticky_spin = free_spin
                else:
                    temporary[reel] = event["appliedMultiplier"]
            elif event["type"] == "upgradeStickyReel":
                reel = event["reel"]
                if (
                    sticky.get(reel) != event["previousMultiplier"]
                    or event["appliedMultiplier"] <= event["previousMultiplier"]
                ):
                    raise RuntimeError(f"{mode}: invalid sticky upgrade at {expected_id}")
                sticky[reel] = event["appliedMultiplier"]
            elif event["type"] == "clearSpinReels":
                temporary.clear()

        if temporary:
            raise RuntimeError(f"{mode}: uncleared temporary VS reels at {expected_id}")
        if tier == 3 and (first_sticky_spin is None or first_sticky_spin > 3):
            tier_three_failures += 1
        if tier is not None:
            final_stickies[(tier, len(sticky))] += 1
        outcomes += 1
        criteria[book["criteria"]] += 1
        payout_total += book["payoutMultiplier"]
        payouts.append(book["payoutMultiplier"])
        book_rows.append((book["payoutMultiplier"], book["criteria"], tier))
        maximum_payout = max(maximum_payout, book["payoutMultiplier"])

    if outcomes == 0:
        raise RuntimeError(f"{mode}: no outcomes")
    unit_return = Fraction(payout_total, outcomes * 100 * MODE_COSTS[mode])
    payouts.sort()
    percentile = lambda fraction: payouts[min(int((outcomes - 1) * fraction), outcomes - 1)]
    total_weight = 0
    weighted_payout = 0
    weighted_square = 0
    weighted_nonzero = 0
    weighted_features = 0
    weighted_caps = 0
    weighted_tiers = Counter()
    lookup_rows = list(
        iter_lookup(publish_path / f"lookUpTable_{mode}_0.csv")
    )
    if len(lookup_rows) != outcomes:
        raise RuntimeError(f"{mode}: lookup and book lengths differ")
    for expected_id, ((payout, criterion, selected_tier), lookup) in enumerate(
        zip(book_rows, lookup_rows)
    ):
        sim_id, weight, lookup_payout = lookup
        if sim_id != expected_id or lookup_payout != payout or weight < 0:
            raise RuntimeError(f"{mode}: invalid lookup row at {expected_id}")
        normalized = payout / 100 / MODE_COSTS[mode]
        total_weight += weight
        weighted_payout += weight * payout
        weighted_square += weight * normalized * normalized
        weighted_nonzero += weight * (payout > 0)
        weighted_features += weight * (criterion in {"freegame", "wincap"})
        weighted_caps += weight * (payout == 2_500_000)
        if selected_tier is not None:
            weighted_tiers[selected_tier] += weight
    weighted_rtp = weighted_payout / total_weight / 100 / MODE_COSTS[mode]
    weighted_variance = max(0, weighted_square / total_weight - weighted_rtp ** 2)
    return {
        "mode": mode,
        "outcomes": outcomes,
        "criteria": dict(criteria),
        "unitWeightReturn": float(unit_return),
        "maximumPayoutMultiplier": maximum_payout,
        "minimumPayoutMultiplier": payouts[0],
        "medianPayoutMultiplier": percentile(0.5),
        "p90PayoutMultiplier": percentile(0.9),
        "p99PayoutMultiplier": percentile(0.99),
        "nonZeroOutcomes": sum(payout > 0 for payout in payouts),
        "optimizedMetrics": {
            "rtp": weighted_rtp,
            "standardDeviationPerCost": math.sqrt(weighted_variance),
            "nonZeroProbability": weighted_nonzero / total_weight,
            "featureProbability": weighted_features / total_weight,
            "capProbability": weighted_caps / total_weight,
            "tierShares": {
                str(selected_tier): weight / sum(weighted_tiers.values())
                for selected_tier, weight in sorted(weighted_tiers.items())
            },
            "totalWeight": total_weight,
        },
        "tiers": dict(tiers),
        "finalStickyCounts": {
            f"tier{tier}:{count}": amount
            for (tier, count), amount in sorted(final_stickies.items())
        },
        "tierThreeGuaranteeFailures": tier_three_failures,
        "eventTypes": dict(sorted(event_types.items())),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("publish_path", type=Path)
    args = parser.parse_args()
    print(json.dumps({
        "schemaVersion": 1,
        "approvalClaim": False,
        "lookupWeightsReviewed": True,
        "modes": [
            review_mode(args.publish_path, mode)
            for mode in MODE_COSTS
        ],
    }, indent=2))


if __name__ == "__main__":
    main()
