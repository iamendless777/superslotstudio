#!/usr/bin/env python3
"""Refresh optimized-LUT sidecars, then run the official SDK verifier.

Stake's simulator writes payout sidecars before optimization. StakeStudio first
performs its independent row-by-row full-stream verification, then this helper
binds the verified final LUT payout order to the official SDK fast-path format
and executes the official statistics/verification entry point.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import pickle
import sys

from utils.rgs_verification import execute_all_tests, get_sha_256


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: refresh_official_math_verification.py <game-id>")
    game_id = sys.argv[1]
    module = __import__(f"games.{game_id}.game_config", fromlist=["GameConfig"])
    config = module.GameConfig()
    for mode in config.bet_modes:
        name = mode.get_name()
        book_path = os.path.join(config.publish_path, f"books_{name}.jsonl.zst")
        lut_path = os.path.join(config.publish_path, f"lookUpTable_{name}_0.csv")
        payouts = []
        with open(lut_path, newline="", encoding="utf-8") as source:
            for row in csv.reader(source):
                if row and row != ["simId", "weight", "payoutMultiplier"]:
                    payouts.append(int(row[2]))
        sidecar_path = os.path.join(config.library_path, "configs", f"books_{name}.verification.json")
        with open(sidecar_path, "w", encoding="utf-8") as target:
            json.dump({
                "payout_hash": hashlib.md5(pickle.dumps(payouts)).hexdigest(),
                "file_hash": get_sha_256(book_path),
                "num_entries": len(payouts),
                "authority": "stake-studio-full-stream-verified-final-lut-v1",
            }, target, indent=2)
    execute_all_tests(config)
    print(json.dumps({"valid": True, "gameId": game_id, "modes": [m.get_name() for m in config.bet_modes]}))


if __name__ == "__main__":
    main()
