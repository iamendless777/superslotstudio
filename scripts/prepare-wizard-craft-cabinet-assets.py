#!/usr/bin/env python3
"""Prepare native-scale reactive WIZARD CRAFT cabinet assets."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CABINET = ROOT / "art-src" / "wizard-craft" / "cabinet"
EFFECTS = ROOT / "art-src" / "wizard-craft" / "effects"
SYMBOLS = ROOT / "art-src" / "wizard-craft" / "symbols"


def fit(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    bounds = source.getchannel("A").getbbox()
    trimmed = source.crop(bounds) if bounds is not None else source
    scale = min(size[0] / trimmed.width, size[1] / trimmed.height)
    fitted_size = (
        max(1, round(trimmed.width * scale)),
        max(1, round(trimmed.height * scale)),
    )
    fitted = trimmed.resize(fitted_size, Image.Resampling.NEAREST)
    output = Image.new("RGBA", size)
    output.alpha_composite(
        fitted,
        ((size[0] - fitted_size[0]) // 2, (size[1] - fitted_size[1]) // 2),
    )
    return output


def main() -> None:
    source = Image.open(
        CABINET / "clash-crest-base-candidate-v1.png",
    ).convert("RGBA")
    base = fit(source, (152, 76))
    duel_faces = Image.open(
        SYMBOLS / "duel-coin/idle-native-68x51-v2.png",
    ).convert("RGBA")
    duel_faces = fit(duel_faces, (30, 24))
    base.alpha_composite(duel_faces, (61, 26))
    base.save(CABINET / "clash-crest-base-runtime-v1.png", optimize=True)

    active = base.copy()
    energy = Image.open(
        EFFECTS / "clash-energy-core-candidate-v1.png",
    ).convert("RGBA")
    energy = fit(energy, (32, 32))
    active.alpha_composite(energy, (60, 22))
    active.save(CABINET / "clash-crest-active-runtime-v1.png", optimize=True)


if __name__ == "__main__":
    main()
