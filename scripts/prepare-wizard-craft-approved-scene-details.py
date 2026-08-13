#!/usr/bin/env python3
"""Extract independently addressable scene details from the approved master."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art-src/wizard-craft"
SOURCE = ART / "master/wizard-craft-static-master-reference-v3.png"
OUTPUT = ART / "runtime"
SIZE = (640, 360)


def masked_region(
    source: Image.Image,
    name: str,
    polygon: tuple[tuple[int, int], ...],
) -> None:
    mask = Image.new("L", SIZE)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    layer = source.copy()
    layer.putalpha(mask)
    layer.save(OUTPUT / name, optimize=True, compress_level=9)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    # The platform and staircase are one depth object. Their lower section also
    # provides the approved occlusion that makes the Dragon tail pass behind
    # the architecture instead of cutting through its rune tower.
    masked_region(
        source,
        "approved-wizard-platform-v1.png",
        ((531, 158), (640, 158), (640, 360), (531, 360)),
    )
    bolt = Image.open(ART / "effects/wizard-magic-bolt-runtime-v1.png").convert("RGBA")
    bolt.rotate(
        20,
        expand=True,
        resample=Image.Resampling.BICUBIC,
    ).save(
        ART / "effects/wizard-magic-bolt-diagonal-runtime-v1.png",
        optimize=True,
        compress_level=9,
    )
    print(OUTPUT / "approved-wizard-platform-v1.png")


if __name__ == "__main__":
    main()
