#!/usr/bin/env python3
"""Split the approved WIZARD CRAFT clash cutout into registered effect layers."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "art-src"
    / "wizard-craft"
    / "effects"
    / "clash-contact-core-candidate-v1.png"
)
OUTPUT = SOURCE.parent


def save_layer(name: str, include) -> None:
    source = Image.open(SOURCE).convert("RGBA")
    pixels = source.load()
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0 or not include(red, green, blue, alpha):
                pixels[x, y] = (0, 0, 0, 0)
    source.resize((144, 144), Image.Resampling.NEAREST).save(OUTPUT / name)


def is_gold(red: int, green: int, blue: int, _alpha: int) -> bool:
    return red >= 145 and green >= 75 and blue <= 125 and red > blue * 1.35


def is_white_hot(red: int, green: int, blue: int, _alpha: int) -> bool:
    return red >= 225 and green >= 205 and blue >= 205


def main() -> None:
    save_layer(
        "clash-energy-core-candidate-v1.png",
        lambda red, green, blue, alpha: not is_gold(red, green, blue, alpha),
    )
    save_layer("clash-gold-ring-candidate-v1.png", is_gold)
    save_layer(
        "clash-cap-flare-candidate-v1.png",
        lambda red, green, blue, alpha:
            is_gold(red, green, blue, alpha)
            or is_white_hot(red, green, blue, alpha),
    )


if __name__ == "__main__":
    main()
