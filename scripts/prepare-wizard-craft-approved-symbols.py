#!/usr/bin/env python3
"""Prepare clean symbol tiles from the locked WIZARD CRAFT visual master.

The approved master contains the authoritative pixel treatment, lighting, and
reel-cell contrast. Each export is taken from an unobstructed cell interior and
keeps that exact authored texture, avoiding chroma-key fringe and neighboring
artwork that leaked into the earlier generated symbol cutouts.
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art-src/wizard-craft"
SOURCE = ART / "master/wizard-craft-static-master-reference-v3.png"

# Interior rectangles deliberately exclude the metal dividers. The runtime
# divider layer remains independent and is drawn over these opaque cell tiles.
CELL_INTERIORS = {
    (0, 0): (168, 97, 224, 145),
    (1, 0): (231, 97, 287, 145),
    (2, 0): (294, 97, 350, 145),
    (3, 0): (357, 97, 413, 145),
    (4, 0): (420, 97, 476, 145),
    (0, 1): (168, 151, 224, 199),
    (1, 1): (231, 151, 287, 199),
    (2, 1): (294, 151, 350, 199),
    (3, 1): (357, 151, 413, 199),
    (4, 1): (420, 151, 476, 199),
}

SYMBOL_CELLS = {
    "staff": (0, 0),
    "ember": (1, 0),
    "duel-coin": (2, 0),
    "grimoire": (3, 0),
    "potion": (4, 0),
    "dragon-egg": (0, 1),
    "dragon-wild": (1, 1),
    "scroll": (2, 1),
    "wizard-wild": (3, 1),
    "crystal": (4, 1),
}


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    for symbol, cell in SYMBOL_CELLS.items():
        tile = source.crop(CELL_INTERIORS[cell]).resize(
            (68, 51), Image.Resampling.NEAREST
        )
        output = ART / "symbols" / symbol / "approved-native-68x51-v1.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        tile.save(output, optimize=True, compress_level=9)
    print(f"prepared {len(SYMBOL_CELLS)} approved symbol tiles")


if __name__ == "__main__":
    main()
