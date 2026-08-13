#!/usr/bin/env python3
"""Verify WIZARD CRAFT's final Stake submission handoff without uploading it."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UPLOAD = ROOT / "dist/wizard-craft-upload"
TILES = ROOT / "submission/wizard-craft"


def png_details(path: Path) -> tuple[int, int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise RuntimeError(f"{path.name} is not a valid PNG")
    width, height, _depth, color_type = struct.unpack(">IIBB", data[16:26])
    return width, height, color_type


def verify_zip(path: Path, required: set[str] | None = None) -> None:
    if not path.is_file():
        raise RuntimeError(f"Missing upload archive: {path}")
    with zipfile.ZipFile(path) as bundle:
        corrupt = bundle.testzip()
        if corrupt is not None:
            raise RuntimeError(f"{path.name} contains corrupt member {corrupt}")
        names = set(bundle.namelist())
    if required is not None and names != required:
        raise RuntimeError(
            f"{path.name} content mismatch: "
            f"missing={sorted(required-names)}, unexpected={sorted(names-required)}"
        )


def main(provider_number: int | None) -> None:
    if provider_number is None or provider_number <= 0:
        raise RuntimeError("--provider-number must be the positive value assigned by Stake")

    frontend = UPLOAD / "wizard-craft-frontend.zip"
    math = UPLOAD / "wizard-craft-math.zip"
    verify_zip(frontend)
    verify_zip(math, {
        "index.json",
        "books_baseBattle.jsonl.zst",
        "books_runeSpark.jsonl.zst",
        "books_siegeSigns.jsonl.zst",
        "books_openGrimoire.jsonl.zst",
        "lookUpTable_baseBattle_0.csv",
        "lookUpTable_runeSpark_0.csv",
        "lookUpTable_siegeSigns_0.csv",
        "lookUpTable_openGrimoire_0.csv",
    })

    required_tiles = {
        "GameTitle-BG.png": False,
        "GameTitle-FG.png": True,
        "ProviderName-Logo.png": True,
    }
    details = {}
    for name, requires_alpha in required_tiles.items():
        path = TILES / name
        if not path.is_file():
            raise RuntimeError(f"Missing required Stake submission artwork: {path}")
        width, height, color_type = png_details(path)
        if min(width, height) < 512:
            raise RuntimeError(f"{name} is not high resolution: {width}x{height}")
        if requires_alpha and color_type not in {4, 6}:
            raise RuntimeError(f"{name} must contain an alpha channel")
        details[name] = {"width": width, "height": height, "bytes": path.stat().st_size}

    combined = sum((TILES / name).stat().st_size for name in ("GameTitle-BG.png", "GameTitle-FG.png"))
    if combined > 3_000_000:
        raise RuntimeError(f"Lobby background + foreground exceed 3 MB: {combined} bytes")

    report = {
        "gameID": "wizard_craft",
        "providerNumber": provider_number,
        "frontendSha256": hashlib.sha256(frontend.read_bytes()).hexdigest(),
        "mathSha256": hashlib.sha256(math.read_bytes()).hexdigest(),
        "lobbyArtwork": details,
        "combinedLobbyArtworkBytes": combined,
        "status": "locally verified; not uploaded or externally approved",
    }
    output = UPLOAD / "submission-verification.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider-number", type=int)
    args = parser.parse_args()
    main(args.provider_number)
