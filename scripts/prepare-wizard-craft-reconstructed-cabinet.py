#!/usr/bin/env python3
"""Split the reconstructed cabinet candidate into registered runtime layers."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art-src" / "wizard-craft"
SOURCE = (
    ART
    / "cabinet/reconstruction-v1/cabinet-structure-alpha-v1.png"
)
OUTPUT = ART / "runtime"
DESIGN_SIZE = (640, 360)


def registered_source() -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    return source.resize(DESIGN_SIZE, Image.Resampling.NEAREST)


def export(
    source: Image.Image,
    filename: str,
    regions: tuple[tuple[int, int, int, int], ...],
) -> None:
    mask = Image.new("L", DESIGN_SIZE)
    draw = ImageDraw.Draw(mask)
    for region in regions:
        draw.rectangle(region, fill=255)
    alpha = source.getchannel("A")
    alpha = Image.frombytes(
        "L",
        DESIGN_SIZE,
        bytes(min(a, b) for a, b in zip(alpha.tobytes(), mask.tobytes())),
    )
    layer = source.copy()
    layer.putalpha(alpha)
    # Pixel art uses a deliberately bounded palette. Indexed PNG keeps the
    # authored clusters and alpha while avoiding a multi-megabyte RGBA payload
    # for several mostly transparent full-canvas registration layers.
    indexed = layer.quantize(
        colors=256,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    )
    indexed.save(OUTPUT / filename, optimize=True, compress_level=9)


def export_shifted(
    source: Image.Image,
    filename: str,
    region: tuple[int, int, int, int],
    offset: tuple[int, int],
) -> None:
    isolated = Image.new("RGBA", DESIGN_SIZE)
    left, top, right, bottom = region
    crop = source.crop((left, top, right + 1, bottom + 1))
    isolated.alpha_composite(crop, (left + offset[0], top + offset[1]))
    indexed = isolated.quantize(
        colors=256,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    )
    indexed.save(OUTPUT / filename, optimize=True, compress_level=9)


def export_runes(
    source: Image.Image,
    filename: str,
    region: tuple[int, int, int, int],
    side: str,
) -> None:
    left, top, right, bottom = region
    overlay = Image.new("RGBA", DESIGN_SIZE)
    source_pixels = source.load()
    target_pixels = overlay.load()
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            red, green, blue, alpha = source_pixels[x, y]
            if side == "dragon":
                selected = (
                    alpha > 0
                    and red >= 72
                    and red > green * 1.24
                    and red > blue * 1.14
                )
            else:
                selected = (
                    alpha > 0
                    and blue >= 86
                    and (blue > red * 1.25 or green > red * 1.45)
                )
            if selected:
                target_pixels[x, y] = (red, green, blue, alpha)
    overlay = ImageEnhance.Brightness(overlay).enhance(1.45)
    indexed = overlay.quantize(
        colors=128,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    )
    indexed.save(OUTPUT / filename, optimize=True, compress_level=9)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = registered_source()

    export(source, "reconstructed-cabinet-title.png", ((105, 0, 535, 73),))
    export(source, "reconstructed-cabinet-lintel.png", ((105, 55, 535, 108),))
    export(
        source,
        "reconstructed-cabinet-pillar-dragon.png",
        ((105, 42, 205, 335),),
    )
    export(
        source,
        "reconstructed-cabinet-pillar-wizard.png",
        ((455, 42, 535, 359),),
    )
    export_shifted(
        source,
        "reconstructed-cabinet-staircase-wizard.png",
        (536, 150, 639, 359),
        (12, 0),
    )
    export(source, "reconstructed-cabinet-sill.png", ((105, 300, 639, 359),))
    export(source, "reconstructed-cabinet-crest.png", ((270, 52, 376, 145),))

    export_runes(
        source,
        "reconstructed-cabinet-runes-dragon.png",
        (112, 78, 190, 316),
        "dragon",
    )
    export_runes(
        source,
        "reconstructed-cabinet-runes-wizard.png",
        (470, 78, 535, 316),
        "wizard",
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
