#!/usr/bin/env python3
"""Full-stream verifier for Stake Engine publish_files.

Reads every compressed book and its lookup row together. The verifier is kept
outside generated games so the same release gate is applied to every project.
"""

from __future__ import annotations

import csv
import io
import json
import os
import sys
import math
from itertools import zip_longest

import zstandard


UINT64_MAX = (1 << 64) - 1
MAX_BOOK_BYTES = 4_200_000_000
MAX_BOOKS_PER_MODE = 10_000_000
PERSISTENT_PROGRESSION_EVENTS = {
    "symbolUpgrade",
    "symbolMultiplierUpgrade",
    "positionMultiplierGridUpdate",
    "expandReelHeight",
}


def fail(message: str) -> None:
    raise ValueError(message)


def safe_file(root: str, value: object, label: str) -> str:
    name = str(value or "")
    if not name or os.path.basename(name) != name or name in {".", ".."}:
        fail(f"{label} must be a filename in publish_files, got {name!r}.")
    path = os.path.join(root, name)
    if not os.path.isfile(path):
        fail(f"Missing {label}: {name}.")
    return path


def event_positions(event: dict):
    if event.get("type") == "winInfo":
        for win_index, win in enumerate(event.get("wins") or []):
            for position_index, position in enumerate(win.get("positions") or []):
                yield f"wins[{win_index}].positions[{position_index}]", position
            overlay = (win.get("meta") or {}).get("overlay")
            if overlay is not None:
                yield f"wins[{win_index}].meta.overlay", overlay
    for key in ("positions", "sources", "explodingSymbols", "updates", "changes", "grid"):
        for position_index, position in enumerate(event.get(key) or []):
            yield f"{key}[{position_index}]", position


def validate_position(position: object, rows: list[int], label: str) -> None:
    if isinstance(position, (list, tuple)) and len(position) >= 2:
        reel, row = position[0], position[1]
    elif isinstance(position, dict):
        reel, row = position.get("reel"), position.get("row")
    else:
        fail(f"{label} must contain a reel/row position.")
    if not isinstance(reel, int) or not isinstance(row, int):
        fail(f"{label} reel and row must be integers.")
    if reel < 0 or reel >= len(rows) or row < 0 or row >= rows[reel]:
        fail(f"{label} ({reel},{row}) is outside the active board {rows}.")


def validate_event_contract(book: dict, label: str) -> None:
    rows = None
    settled_win_since_board = False
    for expected_index, event in enumerate(book["events"]):
        if not isinstance(event, dict):
            fail(f"{label} event {expected_index} must be an object.")
        if event.get("index") != expected_index:
            fail(f"{label} event index {event.get('index')!r} is not sequential at {expected_index}.")
        event_type = event.get("type")
        board = event.get("board")
        if event_type in {"reveal", "boardTransform"} and board is not None:
            if not isinstance(board, list) or not board or any(not isinstance(reel, list) or not reel for reel in board):
                fail(f"{label} event {expected_index} has an invalid board.")
            rows = [len(reel) for reel in board]
        if event_type == "expandReelHeight":
            reel = event.get("reel")
            next_rows = event.get("rows")
            maximum_rows = event.get("maximumRows")
            if rows is None:
                fail(f"{label} event {expected_index} expands a reel before a board is active.")
            if not isinstance(reel, int) or reel < 0 or reel >= len(rows):
                fail(f"{label} event {expected_index} has an invalid expansion reel {reel!r}.")
            if not isinstance(next_rows, int) or next_rows < rows[reel]:
                fail(
                    f"{label} event {expected_index} has invalid expanded rows {next_rows!r} "
                    f"for reel {reel} at height {rows[reel]}."
                )
            if isinstance(maximum_rows, int) and next_rows > maximum_rows:
                fail(
                    f"{label} event {expected_index} expands reel {reel} to {next_rows} "
                    f"above maximumRows {maximum_rows}."
                )
            rows[reel] = next_rows
        if event_type == "reveal":
            settled_win_since_board = False
        if rows is not None:
            for position_label, position in event_positions(event):
                validate_position(position, rows, f"{label} event {expected_index} {position_label}")
        if event_type == "winInfo":
            if int(event.get("totalWin") or 0) <= 0 or not event.get("wins"):
                fail(f"{label} event {expected_index} exposes a non-positive winInfo event.")
            settled_win_since_board = True
        if event_type in PERSISTENT_PROGRESSION_EVENTS and not settled_win_since_board:
            fail(f"{label} event {expected_index} advances {event_type} before a settled visible win.")
        if event_type == "tumbleBoard":
            settled_win_since_board = False


def lut_rows(path: str):
    with open(path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        for line_number, row in enumerate(reader, start=1):
            if not row:
                continue
            if line_number == 1 and [part.strip() for part in row] == ["simId", "weight", "payoutMultiplier"]:
                continue
            if len(row) != 3:
                fail(f"{os.path.basename(path)}:{line_number} must contain simId,weight,payoutMultiplier.")
            try:
                values = tuple(int(part.strip()) for part in row)
            except ValueError as error:
                fail(f"{os.path.basename(path)}:{line_number} contains a non-integer value: {error}.")
            if any(value < 0 or value > UINT64_MAX for value in values):
                fail(f"{os.path.basename(path)}:{line_number} contains a value outside uint64.")
            yield values


def book_rows(path: str):
    decompressor = zstandard.ZstdDecompressor()
    with open(path, "rb") as compressed:
        with decompressor.stream_reader(compressed) as stream:
            with io.TextIOWrapper(stream, encoding="utf-8") as text:
                for line_number, line in enumerate(text, start=1):
                    if not line.strip():
                        continue
                    try:
                        book = json.loads(line)
                    except json.JSONDecodeError as error:
                        fail(f"{os.path.basename(path)}:{line_number} is invalid JSON: {error}.")
                    for key in ("id", "payoutMultiplier", "events", "criteria", "baseGameWins", "freeGameWins"):
                        if key not in book:
                            fail(f"{os.path.basename(path)}:{line_number} is missing {key}.")
                    if not isinstance(book["id"], int) or book["id"] < 0:
                        fail(f"{os.path.basename(path)}:{line_number} has an invalid id.")
                    if not isinstance(book["payoutMultiplier"], int) or book["payoutMultiplier"] < 0:
                        fail(f"{os.path.basename(path)}:{line_number} has an invalid payoutMultiplier.")
                    if not isinstance(book["events"], list):
                        fail(f"{os.path.basename(path)}:{line_number} events must be an array.")
                    if book["criteria"] not in {"0", "basegame", "freegame", "wincap"}:
                        fail(f"{os.path.basename(path)}:{line_number} has invalid criteria {book['criteria']!r}.")
                    validate_event_contract(book, f"{os.path.basename(path)}:{line_number}")
                    yield book


def verify_mode(root: str, mode: dict, target: dict) -> dict:
    name = str(mode.get("name") or "")
    if not name:
        fail("index.json contains a mode without a name.")
    cost = float(mode.get("cost") or 0)
    if cost <= 0:
        fail(f"Mode {name!r} has an invalid cost.")
    book_path = safe_file(root, mode.get("events"), f"{name} events file")
    lut_path = safe_file(root, mode.get("weights"), f"{name} lookup file")
    if os.path.getsize(book_path) > MAX_BOOK_BYTES:
        fail(f"Mode {name!r} events file exceeds 4.2 GB.")

    count = 0
    total_weight = 0
    weighted_payout = 0
    criteria = {"0": 0, "basegame": 0, "freegame": 0, "wincap": 0}
    criteria_weights = {"0": 0, "basegame": 0, "freegame": 0, "wincap": 0}
    criteria_weighted_payout = {"0": 0, "basegame": 0, "freegame": 0, "wincap": 0}
    payout_distribution = {}
    lucid_value_weights = {"basegame": {}, "freegame": {}}
    wincap_causal_weight = 0
    wincap_weight_without_visible_max = 0
    ordinary_max_payout = 0
    max_payout = 0
    for pair_index, pair in enumerate(zip_longest(book_rows(book_path), lut_rows(lut_path)), start=1):
        book, lookup = pair
        if book is None or lookup is None:
            fail(f"Mode {name!r} book/LUT lengths differ at row {pair_index}.")
        sim_id, weight, payout = lookup
        if sim_id != book["id"]:
            fail(f"Mode {name!r} row {pair_index} id mismatch: book {book['id']} vs LUT {sim_id}.")
        if payout != book["payoutMultiplier"]:
            fail(f"Mode {name!r} row {pair_index} payout mismatch: book {book['payoutMultiplier']} vs LUT {payout}.")
        if payout and (payout < 10 or payout % 10):
            fail(f"Mode {name!r} row {pair_index} payout {payout} violates the 0.1x increment.")
        count += 1
        if count > MAX_BOOKS_PER_MODE:
            fail(f"Mode {name!r} exceeds 10,000,000 books.")
        total_weight += weight
        if total_weight > UINT64_MAX:
            fail(f"Mode {name!r} total lookup weight exceeds uint64.")
        weighted_payout += weight * payout
        payout_distribution[payout] = payout_distribution.get(payout, 0) + weight
        max_payout = max(max_payout, payout)
        if book["criteria"] != "wincap":
            ordinary_max_payout = max(ordinary_max_payout, payout)
        criteria[book["criteria"]] += 1
        criteria_weights[book["criteria"]] += weight
        criteria_weighted_payout[book["criteria"]] += weight * payout
        current_game_type = "basegame"
        observed_lucid_values = {"basegame": set(), "freegame": set()}
        event_types = []
        for event in book["events"]:
            event_type = event.get("type")
            event_types.append(event_type)
            if event_type == "reveal" and event.get("gameType") in {"basegame", "freegame"}:
                current_game_type = event["gameType"]
            if event_type == "winInfo":
                for win in event.get("wins") or []:
                    for value in (win.get("meta") or {}).get("multiplierWildValues") or []:
                        if isinstance(value, (int, float)) and value > 0:
                            observed_lucid_values[current_game_type].add(int(value))
        for game_type, values in observed_lucid_values.items():
            for value in values:
                key = str(value)
                lucid_value_weights[game_type][key] = lucid_value_weights[game_type].get(key, 0) + weight
        if book["criteria"] == "wincap":
            visible = "maxDream" in event_types and "wincap" in event_types
            if visible:
                wincap_causal_weight += weight
            else:
                wincap_weight_without_visible_max += weight

    if count == 0:
        fail(f"Mode {name!r} contains no books.")
    if total_weight == 0:
        fail(f"Mode {name!r} has zero total lookup weight.")
    exact_rtp = weighted_payout / total_weight / 100 / cost
    mean_payout = weighted_payout / total_weight / 100
    variance = sum(
        (((payout / 100) - mean_payout) ** 2) * (weight / total_weight)
        for payout, weight in payout_distribution.items()
    )
    probability_scale = 0.2 if cost >= 1000 else 0.5 if cost >= 500 else 0.8 if cost >= 200 else 1.0
    prob5k = sum(weight for payout, weight in payout_distribution.items() if payout >= 500_000) / total_weight
    prob10k = sum(weight for payout, weight in payout_distribution.items() if payout >= 1_000_000) / total_weight
    etl40 = sum((payout / 100) * weight for payout, weight in payout_distribution.items() if payout / 100 >= 40 * cost) / total_weight
    etl10k = sum((payout / 100) * weight for payout, weight in payout_distribution.items() if payout >= 1_000_000) / total_weight
    ordered = sorted(payout_distribution.items())
    cumulative = 0
    tail_start = ordered[0][0]
    for payout, weight in ordered:
        cumulative += weight / total_weight
        if cumulative >= 0.999:
            tail_start = payout
            break
    tail_weight = sum(weight for payout, weight in ordered if payout >= tail_start)
    cvar = (sum((payout / 100) * weight for payout, weight in ordered if payout >= tail_start) / tail_weight) if tail_weight else 0
    non_zero_probability = sum(weight for payout, weight in payout_distribution.items() if payout > 0) / total_weight
    declared = target.get(name)
    delta = None if declared is None else exact_rtp - float(declared)
    return {
        "name": name,
        "cost": cost,
        "books": count,
        "totalWeight": total_weight,
        "exactRtp": exact_rtp,
        "declaredRtp": declared,
        "delta": delta,
        "maxPayout": max_payout / 100,
        "criteria": criteria,
        "criteriaWeights": criteria_weights,
        "criteriaProbability": {
            key: value / total_weight for key, value in criteria_weights.items()
        },
        "criteriaRtp": {
            key: criteria_weighted_payout[key] / total_weight / 100 / cost for key in criteria_weighted_payout
        },
        "ordinaryMaxPayout": ordinary_max_payout / 100,
        "wincapCausality": {
            "visibleMaxWeight": wincap_causal_weight,
            "missingVisibleMaxWeight": wincap_weight_without_visible_max,
        },
        "lucidValueWeights": lucid_value_weights,
        "finalLutTail": {
            "standardDeviation": math.sqrt(variance) / cost,
            "nonZeroProbability": non_zero_probability,
            "probabilityScale": probability_scale,
            "probabilityAtLeast5000": prob5k * probability_scale,
            "probabilityAtLeast10000": prob10k * probability_scale,
            "expectedTailLossAt40BetsRaw": etl40,
            "expectedTailLossAt10000Raw": etl10k,
            "cvarUpperPointOnePercentRaw": cvar,
            "expectedTailLossAt40BetsCostNormalized": etl40 / cost,
            "expectedTailLossAt10000CostNormalized": etl10k / cost,
            "cvarUpperPointOnePercentCostNormalized": cvar / cost,
        },
        "eventsFile": os.path.basename(book_path),
        "lookupFile": os.path.basename(lut_path),
        "eventsBytes": os.path.getsize(book_path),
    }


def main() -> None:
    if len(sys.argv) != 3:
        fail("Usage: verify_math_publish.py <publish_files> <target-mode-json>.")
    root = os.path.abspath(sys.argv[1])
    target = json.loads(sys.argv[2])
    index_path = safe_file(root, "index.json", "index")
    with open(index_path, "r", encoding="utf-8") as handle:
        index = json.load(handle)
    modes = index.get("modes")
    if not isinstance(modes, list) or not modes:
        fail("index.json must contain at least one mode.")
    names = [str(mode.get("name") or "") for mode in modes]
    if len(names) != len(set(names)):
        fail("index.json contains duplicate mode names.")
    expected = set(target)
    actual = set(names)
    if expected != actual:
        fail(f"Published modes {sorted(actual)} do not match project modes {sorted(expected)}.")
    reports = [verify_mode(root, mode, target) for mode in modes]
    print(json.dumps({
        "valid": True,
        "fullStreamIntegrity": True,
        "totalBooks": sum(mode["books"] for mode in reports),
        "modes": reports,
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"valid": False, "error": str(error)}))
        sys.exit(1)
