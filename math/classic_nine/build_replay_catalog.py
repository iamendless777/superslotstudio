"""Select deterministic reviewer replay IDs from frozen Signal Nine artifacts."""

import argparse
import csv
import json
from io import TextIOWrapper
from itertools import zip_longest
from pathlib import Path

import zstandard


WINCAP_PAYOUT = 1_000_000
GAME_VERSION = "1.0.0"


def iter_books(path):
    with path.open("rb") as source:
        reader = zstandard.ZstdDecompressor().stream_reader(source)
        with TextIOWrapper(reader, encoding="utf-8") as text:
            for line in text:
                if line.strip():
                    yield json.loads(line)


def iter_lookup(path):
    with path.open("r", encoding="utf-8") as source:
        for row in csv.reader(source):
            yield {
                "eventID": int(row[0]),
                "weight": int(row[1]),
                "payoutMultiplier": int(row[2]),
            }


def scenario_matches(mode, scenario, book):
    payout = book["payoutMultiplier"]
    event_types = {event["type"] for event in book["events"]}
    if scenario == "loss":
        return mode == "base" and payout == 0
    if scenario == "normalWin":
        if mode == "base":
            return book["criteria"] == "basegame" and 100 <= payout < 1_000
        return 100 <= payout < 10_000
    if scenario == "bigWin":
        threshold = 10_000 if mode == "base" else 50_000
        return threshold <= payout < WINCAP_PAYOUT
    if scenario == "bonusTrigger":
        return book["criteria"] == "freegame" and "enterBonus" in event_types
    if scenario == "retrigger":
        return (
            book["criteria"] == "freegame"
            and "freeSpinRetrigger" in event_types
        )
    if scenario == "winCap":
        return payout == WINCAP_PAYOUT and "wincap" in event_types
    raise ValueError(f"Unknown scenario: {scenario}")


def summarize(book, lookup):
    event_types = [event["type"] for event in book["events"]]
    return {
        "available": True,
        "eventID": book["id"],
        "weight": lookup["weight"],
        "payoutMultiplier": book["payoutMultiplier"] / 100,
        "criteria": book["criteria"],
        "eventCount": len(book["events"]),
        "eventTypes": list(dict.fromkeys(event_types)),
    }


def build_mode_catalog(publish_path, mode):
    scenarios = (
        "loss",
        "normalWin",
        "bigWin",
        "bonusTrigger",
        "retrigger",
        "winCap",
    )
    selected = {}
    missing = object()
    pairs = zip_longest(
        iter_books(publish_path / f"books_{mode}.jsonl.zst"),
        iter_lookup(publish_path / f"lookUpTable_{mode}_0.csv"),
        fillvalue=missing,
    )
    for book, lookup in pairs:
        if book is missing or lookup is missing:
            raise RuntimeError(f"{mode}: book and lookup lengths differ")
        if lookup["eventID"] != book["id"]:
            raise RuntimeError(f"{mode}: non-contiguous event ID")
        if lookup["payoutMultiplier"] != book["payoutMultiplier"]:
            raise RuntimeError(f"{mode}: payout mismatch at {book['id']}")
        if lookup["weight"] <= 0:
            continue
        for scenario in scenarios:
            used_ids = {
                item["eventID"]
                for item in selected.values()
                if item["available"]
            }
            if book["id"] in used_ids:
                break
            if scenario not in selected and scenario_matches(
                mode,
                scenario,
                book,
            ):
                selected[scenario] = summarize(book, lookup)
        expected = len(scenarios) if mode == "base" else len(scenarios) - 1
        if len(selected) == expected:
            break

    if mode == "bonus":
        selected["loss"] = {
            "available": False,
            "reason": "Every frozen bonus-mode outcome has a positive payout.",
        }
    missing_scenarios = set(scenarios) - set(selected)
    if missing_scenarios:
        raise RuntimeError(
            f"{mode}: no positive-weight replay for {sorted(missing_scenarios)}"
        )
    return {scenario: selected[scenario] for scenario in scenarios}


def build_catalog(publish_path):
    return {
        "schemaVersion": 1,
        "game": "classic_nine",
        "version": GAME_VERSION,
        "status": "local-frozen-books-not-yet-deployed",
        "scenarioDefinitions": {
            "baseBigWin": "At least 100x base bet and below the win cap.",
            "bonusBigWin": (
                "At least 500x base bet (5x bonus cost) and below the win cap."
            ),
        },
        "routeTemplate": (
            "/bet/replay/{game}/{version}/{mode}/{eventID}"
        ),
        "modes": {
            mode: build_mode_catalog(publish_path, mode)
            for mode in ("base", "bonus")
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("publish_path", type=Path)
    args = parser.parse_args()
    print(json.dumps(build_catalog(args.publish_path), indent=2))


if __name__ == "__main__":
    main()
