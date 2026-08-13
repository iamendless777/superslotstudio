"""Build non-promoted integer WIZARD CRAFT tier-preserving lookup candidates."""

import argparse
import json
import math
from fractions import Fraction
from pathlib import Path

from analyze_tier_rebalance import TARGETS, book_tier, iter_books, read_lookup


TOTAL_WEIGHT = 10**18
TARGET_RTP = Fraction(193, 200)
MAX_BOOK_WEIGHT = 10**14
MIN_CAP_BUCKET_WEIGHT = 10**11
CENTERED_GROUPS = {
    ("baseBattle", "tier3"): {
        "targetPerCost": 50,
        "strength": 2,
    },
}


def target_masses(mode):
    target = TARGETS[mode]
    feature = Fraction(str(target["feature"]))
    hit = Fraction(str(target["hit"]))
    masses = {
        f"tier{tier}": feature * Fraction(str(share))
        for tier, share in target["tiers"].items()
    }
    if mode != "openGrimoire":
        masses["zero"] = 1 - hit
        masses["base"] = hit - feature
    return masses


def apportion(total, shares):
    """Largest-remainder integer apportionment with an exact total."""
    exact = {name: Fraction(total) * share for name, share in shares.items()}
    result = {name: value.numerator // value.denominator for name, value in exact.items()}
    remaining = total - sum(result.values())
    order = sorted(
        exact,
        key=lambda name: exact[name] - result[name],
        reverse=True,
    )
    for name in order[:remaining]:
        result[name] += 1
    return result


def payout_buckets(rows):
    buckets = {}
    for index, (_, weight, payout) in enumerate(rows):
        bucket = buckets.setdefault(payout, {"weight": 0, "indexes": []})
        bucket["weight"] += weight
        bucket["indexes"].append(index)
    return sorted(buckets.items())


def continuous_bucket_weights(
    rows,
    total,
    tilt,
    center_payout=None,
    center_strength=2,
):
    buckets = payout_buckets(rows)
    uncapped = set(range(len(buckets)))
    allocations = [0.0] * len(buckets)
    remaining = float(total)
    for index, (payout, _) in enumerate(buckets):
        if payout == 2_500_000:
            allocations[index] = float(MIN_CAP_BUCKET_WEIGHT)
            remaining -= allocations[index]
            uncapped.remove(index)
    while uncapped:
        scores = {}
        for index in uncapped:
            payout, bucket = buckets[index]
            score = math.log(max(bucket["weight"], 1))
            if center_payout is None:
                score += tilt * payout / 2_500_000
            else:
                score -= center_strength * (
                    math.log1p(payout / 100)
                    - math.log1p(center_payout / 100)
                ) ** 2
            scores[index] = score
        highest = max(scores.values())
        raw = {index: math.exp(score - highest) for index, score in scores.items()}
        normalizer = sum(raw.values())
        newly_capped = []
        for index in uncapped:
            allocation = remaining * raw[index] / normalizer
            cap = MAX_BOOK_WEIGHT * len(buckets[index][1]["indexes"])
            if allocation > cap:
                allocations[index] = float(cap)
                newly_capped.append(index)
        if not newly_capped:
            for index in uncapped:
                allocations[index] = remaining * raw[index] / normalizer
            break
        for index in newly_capped:
            remaining -= allocations[index]
            uncapped.remove(index)
    return buckets, allocations


def group_policy(mode, name, cost):
    policy = CENTERED_GROUPS.get((mode, name))
    if not policy:
        return {}
    return {
        "center_payout": policy["targetPerCost"] * cost * 100,
        "center_strength": policy["strength"],
    }


def solve_tilt(groups, group_weights, cost, mode):
    def rtp(tilt):
        numerator = 0.0
        for name, rows in groups.items():
            buckets, allocations = continuous_bucket_weights(
                rows,
                group_weights[name],
                tilt,
                **group_policy(mode, name, cost),
            )
            numerator += sum(
                allocation * payout
                for (payout, _), allocation in zip(buckets, allocations)
            )
        return numerator / TOTAL_WEIGHT / 100 / cost

    low, high = -10_000.0, 10_000.0
    if not rtp(low) <= float(TARGET_RTP) <= rtp(high):
        raise RuntimeError("target RTP is outside the integer builder's range")
    for _ in range(70):
        middle = (low + high) / 2
        if rtp(middle) < float(TARGET_RTP):
            low = middle
        else:
            high = middle
    return (low + high) / 2


def apportion_group(rows, total, tilt, policy=None):
    buckets, exact = continuous_bucket_weights(
        rows,
        total,
        tilt,
        **(policy or {}),
    )
    bucket_weights = [math.floor(value) for value in exact]
    remaining = total - sum(bucket_weights)
    order = sorted(
        range(len(buckets)),
        key=lambda index: (exact[index] - bucket_weights[index], -buckets[index][0]),
        reverse=True,
    )
    for index in order[:remaining]:
        bucket_weights[index] += 1

    weights = [0] * len(rows)
    for (_, bucket), bucket_weight in zip(buckets, bucket_weights):
        indexes = bucket["indexes"]
        quotient, remainder = divmod(bucket_weight, len(indexes))
        for index in indexes:
            weights[index] = quotient
        for index in indexes[:remainder]:
            weights[index] += 1
    return weights


def load_groups(publish_path, mode):
    lookup = read_lookup(publish_path / f"lookUpTable_{mode}_0.csv")
    groups = {}
    books = iter_books(publish_path / f"books_{mode}.jsonl.zst")
    for expected_id, (book, row) in enumerate(zip(books, lookup, strict=True)):
        sim_id, weight, payout = row
        if sim_id != expected_id or payout != book["payoutMultiplier"]:
            raise RuntimeError(f"{mode}: invalid lookup identity at {expected_id}")
        tier = book_tier(book)
        group = f"tier{tier}" if tier is not None else ("zero" if payout == 0 else "base")
        # Candidate identity and payout are authoritative. Incoming lookup
        # weights are deliberately ignored so rebuilding an already weighted
        # publish directory cannot compound a previous calibration.
        groups.setdefault(group, []).append((sim_id, 1, payout))
    return groups


def metrics(rows, group_weights, groups, cost):
    total = sum(weight for _, weight, _ in rows)
    numerator = sum(weight * payout for _, weight, payout in rows)
    mean = numerator / total / 100 / cost
    second = sum(
        weight * (payout / 100 / cost) ** 2
        for _, weight, payout in rows
    ) / total
    weighted_groups = {
        name: sum(rows[index][1] for index in indexes) / total
        for name, indexes in groups.items()
    }
    distribution = {}
    for _, weight, payout in rows:
        normalized = payout / 100 / cost
        distribution[normalized] = distribution.get(normalized, 0) + weight
    ordered = sorted(distribution.items())
    cumulative = 0
    tail_start = 0
    for payout, weight in ordered:
        cumulative += weight
        if cumulative / total >= 0.999:
            tail_start = payout
            break
    tail_weight = sum(weight for payout, weight in ordered if payout >= tail_start)
    tail_value = sum(
        payout * weight
        for payout, weight in ordered
        if payout >= tail_start
    )
    return {
        "totalWeight": total,
        "rtp": mean,
        "rtpError": mean - float(TARGET_RTP),
        "standardDeviationPerCost": math.sqrt(max(0, second - mean * mean)),
        "capProbability": sum(
            weight for _, weight, payout in rows if payout == 2_500_000
        ) / total,
        "probabilityAtLeast5000xCost": sum(
            weight for payout, weight in ordered if payout >= 5_000
        ) / total,
        "probabilityAtLeast10000xCost": sum(
            weight for payout, weight in ordered if payout >= 10_000
        ) / total,
        "etlAbove40xCost": sum(
            payout * weight for payout, weight in ordered if payout >= 40
        ) / total,
        "etlAbove10000xCost": sum(
            payout * weight for payout, weight in ordered if payout >= 10_000
        ) / total,
        "cvarTopPointOnePercent": tail_value / tail_weight,
        "largestBookProbability": max(weight for _, weight, _ in rows) / total,
        "largestPayoutBucketProbability": max(distribution.values()) / total,
        "groupProbabilities": weighted_groups,
        "intendedGroupWeights": group_weights,
    }


def build_mode(publish_path, output_dir, mode):
    grouped_rows = load_groups(publish_path, mode)
    masses = target_masses(mode)
    if set(grouped_rows) != set(masses):
        raise RuntimeError(f"{mode}: unexpected calibration groups")
    group_weights = apportion(TOTAL_WEIGHT, masses)
    cost = TARGETS[mode]["cost"]
    tilt = solve_tilt(grouped_rows, group_weights, cost, mode)

    weighted_by_id = {}
    group_indexes = {}
    for name, rows in grouped_rows.items():
        weights = apportion_group(
            rows,
            group_weights[name],
            tilt,
            group_policy(mode, name, cost),
        )
        for row, weight in zip(rows, weights):
            sim_id, _, payout = row
            weighted_by_id[sim_id] = (sim_id, weight, payout)
            group_indexes.setdefault(name, []).append(sim_id)
    rows = [weighted_by_id[sim_id] for sim_id in range(len(weighted_by_id))]

    output_path = output_dir / f"lookUpTable_{mode}_0.csv"
    with output_path.open("w", encoding="utf-8", newline="") as destination:
        for row in rows:
            destination.write(",".join(str(value) for value in row) + "\n")
    return {
        "mode": mode,
        "tilt": tilt,
        "lookup": output_path.name,
        **metrics(rows, group_weights, group_indexes, TARGETS[mode]["cost"]),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("publish_path", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "schemaVersion": 1,
        "approvalClaim": False,
        "promoted": False,
        "sourceShape": "uniformCandidateBooks",
        "targetRtp": float(TARGET_RTP),
        "modes": [
            build_mode(args.publish_path, args.output_dir, mode)
            for mode in TARGETS
        ],
    }
    report_path = args.output_dir / "tier_lookup_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
