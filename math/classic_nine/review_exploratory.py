"""Review exploratory Signal Nine books without granting math approval."""

import argparse
import hashlib
import json
from collections import Counter
from fractions import Fraction
from io import TextIOWrapper
from itertools import zip_longest
from pathlib import Path

import zstandard


MODE_COSTS = {"base": 1, "bonus": 100}


def hash_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(65_536):
            digest.update(chunk)
    return digest.hexdigest()


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
    book_path = publish_path / f"books_{mode}.jsonl.zst"
    lookup_path = publish_path / f"lookUpTable_{mode}_0.csv"
    book_hash = hash_file(book_path)

    event_types = Counter()
    criteria = Counter()
    unique_payouts = set()
    feature_books = 0
    retrigger_books = 0
    capped_books = 0
    outcomes = 0
    non_zero = 0
    total_events = 0
    minimum_events = None
    maximum_events = 0
    minimum_payout = None
    maximum_payout = 0
    total_weight = 0
    weighted_payout = 0
    missing = object()

    paired_rows = zip_longest(
        iter_books(book_path),
        iter_lookup(lookup_path),
        fillvalue=missing,
    )
    for expected_id, (book, lookup_row) in enumerate(paired_rows):
        if book is missing or lookup_row is missing:
            raise RuntimeError(f"{mode}: book and lookup lengths differ")
        sim_id, weight, lookup_payout = lookup_row
        if sim_id != expected_id or book["id"] != expected_id:
            raise RuntimeError(f"{mode}: non-contiguous simulation id")
        if weight <= 0:
            raise RuntimeError(f"{mode}: exploratory weights must be positive")
        if lookup_payout != book["payoutMultiplier"]:
            raise RuntimeError(f"{mode}: payout mismatch at {expected_id}")
        events = book["events"]
        if [event["index"] for event in events] != list(range(len(events))):
            raise RuntimeError(f"{mode}: non-contiguous event index at {expected_id}")
        if events[-1]["type"] != "finalWin":
            raise RuntimeError(f"{mode}: missing terminal event at {expected_id}")
        if events[-1]["amount"] != book["payoutMultiplier"]:
            raise RuntimeError(f"{mode}: terminal payout mismatch at {expected_id}")
        cap_events = [event for event in events if event["type"] == "wincap"]
        if len(cap_events) > 1:
            raise RuntimeError(f"{mode}: repeated win cap at {expected_id}")
        if cap_events and cap_events[0]["amount"] != events[-1]["amount"]:
            raise RuntimeError(f"{mode}: win-cap payout mismatch at {expected_id}")

        types = [event["type"] for event in events]
        for event in events:
            event_types[event["type"]] += 1
            if event["type"] == "updateGlobalMult" and event["globalMult"] > 9:
                raise RuntimeError(f"{mode}: amplifier exceeds 9x")
            if event["type"] == "reveal" and event["gameType"] == "freegame":
                if event["board"][1][1]["name"] != "CORE":
                    raise RuntimeError(f"{mode}: free scan missing central Core")
        criteria[book["criteria"]] += 1
        payout = book["payoutMultiplier"]
        event_count = len(events)
        outcomes += 1
        non_zero += payout > 0
        total_weight += weight
        weighted_payout += weight * payout
        total_events += event_count
        minimum_events = (
            event_count
            if minimum_events is None
            else min(minimum_events, event_count)
        )
        maximum_events = max(maximum_events, event_count)
        minimum_payout = (
            payout if minimum_payout is None else min(minimum_payout, payout)
        )
        maximum_payout = max(maximum_payout, payout)
        unique_payouts.add(payout)
        feature_books += "enterBonus" in types
        retrigger_books += "freeSpinRetrigger" in types
        capped_books += "wincap" in types

    if outcomes == 0:
        raise RuntimeError(f"{mode}: no outcomes")
    return_fraction = Fraction(
        weighted_payout,
        total_weight * 100 * MODE_COSTS[mode],
    )
    return {
        "mode": mode,
        "exploratoryOnly": True,
        "bookSha256": book_hash,
        "outcomes": outcomes,
        "criteria": dict(sorted(criteria.items())),
        "unitWeightReturn": {
            "numerator": str(return_fraction.numerator),
            "denominator": str(return_fraction.denominator),
            "decimal": f"{float(return_fraction):.6f}",
        },
        "nonZeroOutcomes": non_zero,
        "nonZeroRate": f"{non_zero / outcomes:.6f}",
        "minimumPayoutMultiplier": minimum_payout,
        "maximumPayoutMultiplier": maximum_payout,
        "uniquePayoutMultipliers": len(unique_payouts),
        "featureBooks": feature_books,
        "retriggerBooks": retrigger_books,
        "cappedBooks": capped_books,
        "events": {
            "total": total_events,
            "minimumPerBook": minimum_events,
            "maximumPerBook": maximum_events,
            "averagePerBook": f"{total_events / outcomes:.3f}",
            "types": dict(sorted(event_types.items())),
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("publish_path", type=Path)
    args = parser.parse_args()
    report = {
        "schemaVersion": 1,
        "approvalClaim": False,
        "modes": [
            review_mode(args.publish_path, mode)
            for mode in ("base", "bonus")
        ],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
