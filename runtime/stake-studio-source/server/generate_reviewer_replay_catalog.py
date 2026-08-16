#!/usr/bin/env python3
"""Build a compact reviewer replay catalog from final Stake publish artifacts.

The catalog is deliberately derived from the promoted LUTs and compressed books.
It does not simulate, alter weights, or regenerate any math.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import sys

import zstandard


FORMAT = "stake-studio-reviewer-replay-event-catalog-v1"
BIG_WIN_MULTIPLIER = 50


def fail(message: str) -> None:
    raise ValueError(message)


def read_json(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_file(root: str, value: object, label: str) -> str:
    name = str(value or "")
    if not name or os.path.basename(name) != name or name in {".", ".."}:
        fail(f"{label} must be a filename, got {name!r}.")
    path = os.path.join(root, name)
    if not os.path.isfile(path):
        fail(f"Missing {label}: {name}.")
    return path


def lut_candidates(path: str, max_win: float) -> dict:
    candidates = {"loss": None, "normalWin": None, "bigWin": None, "wincap": None}
    with open(path, "r", encoding="utf-8", newline="") as handle:
        for line_number, row in enumerate(csv.reader(handle), start=1):
            if not row:
                continue
            if line_number == 1 and [part.strip() for part in row] == ["simId", "weight", "payoutMultiplier"]:
                continue
            if len(row) != 3:
                fail(f"{os.path.basename(path)}:{line_number} must contain simId,weight,payoutMultiplier.")
            sim_id, weight, payout = (int(part.strip()) for part in row)
            if weight <= 0:
                continue
            multiplier = payout / 100
            candidate = {"bookId": sim_id, "weight": weight, "payoutMultiplier": multiplier}
            if payout == 0 and candidates["loss"] is None:
                candidates["loss"] = candidate
            if 0 < multiplier < BIG_WIN_MULTIPLIER and candidates["normalWin"] is None:
                candidates["normalWin"] = candidate
            if BIG_WIN_MULTIPLIER <= multiplier < max_win and candidates["bigWin"] is None:
                candidates["bigWin"] = candidate
            if multiplier == max_win and candidates["wincap"] is None:
                candidates["wincap"] = candidate
    return candidates


def bonus_candidate(force_path: str) -> int | None:
    records = read_json(force_path)
    if not isinstance(records, list):
        fail(f"{os.path.basename(force_path)} must contain force-record rows.")
    ids = []
    for record in records:
        search = record.get("search") or []
        if any(item.get("name") == "gametype" and item.get("value") == "freegame" for item in search):
            ids.extend(int(value) for value in record.get("bookIds") or [])
    return min(ids) if ids else None


def selected_books(path: str, ids: set[int]) -> dict[int, dict]:
    found = {}
    decompressor = zstandard.ZstdDecompressor()
    with open(path, "rb") as compressed:
        with decompressor.stream_reader(compressed) as stream:
            with io.TextIOWrapper(stream, encoding="utf-8") as text:
                for line in text:
                    if not line.strip():
                        continue
                    book = json.loads(line)
                    book_id = int(book.get("id", -1))
                    if book_id in ids:
                        found[book_id] = book
                    if len(found) == len(ids):
                        break
    missing = sorted(ids - set(found))
    if missing:
        fail(f"{os.path.basename(path)} is missing selected book IDs {missing}.")
    return found


def proof_entry(category: str, candidate: dict, book: dict, events_sha: str) -> dict:
    event_types = [str(event.get("type") or "") for event in book.get("events") or []]
    if int(book.get("payoutMultiplier", -1)) != round(candidate["payoutMultiplier"] * 100):
        fail(f"Book {book.get('id')} payout does not match its final LUT row.")
    if category == "loss" and candidate["payoutMultiplier"] != 0:
        fail(f"Book {book.get('id')} is not a loss.")
    if category == "normalWin" and not 0 < candidate["payoutMultiplier"] < BIG_WIN_MULTIPLIER:
        fail(f"Book {book.get('id')} is not a normal win.")
    if category == "bigWin" and candidate["payoutMultiplier"] < BIG_WIN_MULTIPLIER:
        fail(f"Book {book.get('id')} is not a big win.")
    if category == "wincap":
        if book.get("criteria") != "wincap" or "maxDream" not in event_types or "wincap" not in event_types:
            fail(f"Book {book.get('id')} lacks visible MAX causality.")
    if category == "bonusTrigger" and "freeSpinTrigger" not in event_types:
        fail(f"Book {book.get('id')} does not contain freeSpinTrigger.")
    compact = {
        "status": "selected",
        "bookId": int(book["id"]),
        "payoutMultiplier": candidate["payoutMultiplier"],
        "criteria": str(book.get("criteria") or ""),
        "positiveWeight": int(candidate["weight"]),
        "eventCount": len(event_types),
        "eventTypes": list(dict.fromkeys(event_types)),
        "eventsFileSha256": events_sha,
    }
    compact["bookProofSha256"] = hashlib.sha256(
        json.dumps(book, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return compact


def build_catalog(library: str, policies: dict) -> dict:
    configs = os.path.join(library, "configs")
    publish = os.path.join(library, "publish_files")
    forces = os.path.join(library, "forces")
    config_path = os.path.join(configs, "config.json")
    config = read_json(config_path)
    modes = []
    for mode in config.get("bookShelfConfig") or []:
        name = str(mode.get("name") or "")
        if not name:
            fail("Backend config contains a mode without a name.")
        max_win = float(mode.get("maxWin") or 0)
        events_name = (mode.get("booksFile") or {}).get("file")
        lut_name = ((mode.get("tables") or [{}])[0]).get("file")
        force_name = (mode.get("forceFile") or {}).get("file")
        events_path = safe_file(publish, events_name, f"{name} events file")
        lut_path = safe_file(publish, lut_name, f"{name} lookup file")
        force_path = safe_file(forces, force_name, f"{name} force file")
        declared_events_sha = str((mode.get("booksFile") or {}).get("sha256") or "")
        actual_events_sha = sha256_file(events_path)
        if declared_events_sha != actual_events_sha:
            fail(f"{name} events SHA-256 does not match backend config.")

        picks = lut_candidates(lut_path, max_win)
        policy = policies.get(name) or {}
        bonus_applicable = bool(policy.get("triggerFreeSpins", True) or policy.get("entry") == "freeSpins")
        bonus_id = bonus_candidate(force_path) if bonus_applicable else None
        if bonus_applicable and bonus_id is None:
            fail(f"{name} supports feature entry but has no freegame force record.")
        if bonus_id is not None:
            # Recover the final LUT facts for the chosen bonus book.
            with open(lut_path, "r", encoding="utf-8", newline="") as handle:
                for row in csv.reader(handle):
                    if len(row) == 3 and row[0].strip().isdigit() and int(row[0]) == bonus_id:
                        picks["bonusTrigger"] = {
                            "bookId": bonus_id,
                            "weight": int(row[1]),
                            "payoutMultiplier": int(row[2]) / 100,
                        }
                        break
            if "bonusTrigger" not in picks:
                fail(f"{name} bonus book {bonus_id} is absent from its final LUT.")

        required = ["loss", "normalWin", "bigWin", "wincap"]
        missing = [category for category in required if picks.get(category) is None]
        if missing:
            fail(f"{name} lacks reviewer replay categories {missing}.")
        ids = {int(picks[category]["bookId"]) for category in required}
        if bonus_id is not None:
            ids.add(bonus_id)
        books = selected_books(events_path, ids)
        entries = {
            category: proof_entry(category, picks[category], books[int(picks[category]["bookId"])], actual_events_sha)
            for category in required
        }
        if bonus_id is not None:
            entries["bonusTrigger"] = proof_entry(
                "bonusTrigger", picks["bonusTrigger"], books[bonus_id], actual_events_sha
            )
        else:
            entries["bonusTrigger"] = {
                "status": "notApplicable",
                "bookId": None,
                "reason": "This mode's canonical contract disables free-spin triggering.",
            }
        modes.append({
            "name": name,
            "cost": float(mode.get("cost") or 0),
            "entries": entries,
            "complete": all(entry["status"] in {"selected", "notApplicable"} for entry in entries.values()),
        })

    payload = {
        "format": FORMAT,
        "gameId": str(config.get("gameID") or ""),
        "providerNumber": int(config.get("providerNumber") or 0),
        "mathConfigSha256": sha256_file(config_path),
        "selectionPolicy": {
            "loss": "Lowest positive-weight final-LUT book with a 0x payout.",
            "normalWin": f"Lowest positive-weight final-LUT book above 0x and below {BIG_WIN_MULTIPLIER}x.",
            "bigWin": f"Lowest positive-weight final-LUT book at or above the authored {BIG_WIN_MULTIPLIER}x winBig threshold and below MAX.",
            "wincap": "Lowest positive-weight exact-MAX book with wincap criteria plus visible maxDream and wincap events.",
            "bonusTrigger": "Lowest final-LUT book from the mode's freegame force records containing freeSpinTrigger; explicitly not applicable when the canonical mode disables feature entry.",
        },
        "modes": modes,
        "complete": bool(modes) and all(mode["complete"] for mode in modes),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    payload["catalogSha256"] = hashlib.sha256(encoded).hexdigest()
    return payload


def main() -> None:
    if len(sys.argv) != 3:
        fail("Usage: generate_reviewer_replay_catalog.py <library> <mode-policy-json>.")
    library = os.path.abspath(sys.argv[1])
    policies = json.loads(sys.argv[2])
    print(json.dumps(build_catalog(library, policies), separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"valid": False, "error": str(error)}))
        sys.exit(1)
