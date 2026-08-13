#!/usr/bin/env python3
"""Prepare compact 2x runtime defense sprites from retained alpha masters."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
EFFECTS = ROOT / "art-src" / "wizard-craft" / "effects"

ASSETS = (
    ("wizard-ward-candidate-v1.png", "wizard-ward-runtime-v1.png", (144, 144)),
    (
        "dragon-firewall-candidate-v1.png",
        "dragon-firewall-runtime-v1.png",
        (104, 192),
    ),
)


def main() -> None:
    for source_name, output_name, size in ASSETS:
        source = Image.open(EFFECTS / source_name).convert("RGBA")
        source.resize(size, Image.Resampling.NEAREST).save(EFFECTS / output_name)


if __name__ == "__main__":
    main()
