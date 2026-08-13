#!/usr/bin/env python3
"""Prepare trimmed 2x runtime projectile textures from retained alpha masters."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
EFFECTS = ROOT / "art-src" / "wizard-craft" / "effects"

ASSETS = (
    ("dragon-fire-quick-candidate-v1.png", "dragon-fire-quick-runtime-v1.png", (600, 188), None),
    ("dragon-fire-heavy-candidate-v1.png", "dragon-fire-heavy-runtime-v1.png", (600, 188), None),
    ("dragon-mouth-charge-candidate-v1.png", "dragon-mouth-charge-runtime-v1.png", (96, 96), None),
    ("dragon-nostril-charge-candidate-v1.png", "dragon-nostril-charge-runtime-v1.png", (72, 72), None),
    ("wizard-magic-bolt-candidate-v1.png", "wizard-magic-bolt-runtime-v1.png", (540, 180), None),
    (
        "bonus-tier-reveals/tier-1-open-rune-overlay-v1.png",
        "wizard-magic-runes-runtime-v1.png",
        (540, 180),
        (180, 180),
    ),
)


def fit(source: Image.Image, canvas_size: tuple[int, int], limit=None) -> Image.Image:
    alpha_bounds = source.getchannel("A").getbbox()
    trimmed = source.crop(alpha_bounds) if alpha_bounds is not None else source
    available = limit or canvas_size
    scale = min(available[0] / trimmed.width, available[1] / trimmed.height)
    size = (
        max(1, round(trimmed.width * scale)),
        max(1, round(trimmed.height * scale)),
    )
    resized = trimmed.resize(size, Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((canvas_size[0] - size[0]) // 2, (canvas_size[1] - size[1]) // 2),
    )
    return canvas


def slant_toward_dragon(source: Image.Image, rise: int = 30) -> Image.Image:
    """Bend a right-origin horizontal spell downward toward screen-left."""

    result = Image.new("RGBA", source.size)
    midpoint = (source.width - 1) / 2
    for x in range(source.width):
        offset = round(rise * (midpoint - x) / midpoint)
        strip = source.crop((x, 0, x + 1, source.height))
        result.alpha_composite(strip, (x, offset))
    return result


def slant_from_dragon(source: Image.Image, fall: int = 52) -> Image.Image:
    """Keep fire attached at the mouth and bend its far end downward-right."""

    result = Image.new("RGBA", source.size)
    denominator = max(1, source.width - 1)
    for x in range(source.width):
        offset = round(fall * x / denominator)
        strip = source.crop((x, 0, x + 1, source.height))
        result.alpha_composite(strip, (x, offset))
    return result


def main() -> None:
    for source_name, output_name, canvas_size, limit in ASSETS:
        source = Image.open(EFFECTS / source_name).convert("RGBA")
        prepared = fit(source, canvas_size, limit)
        if output_name == "wizard-magic-runes-runtime-v1.png":
            # The source was a vertical bonus-reveal crest. Turn its leading
            # diamond toward the Dragon before matching the projectile slope.
            prepared = prepared.rotate(90, resample=Image.Resampling.NEAREST)
        if output_name.startswith("wizard-magic-"):
            prepared = slant_toward_dragon(prepared)
        if output_name.startswith("dragon-fire-"):
            prepared = slant_from_dragon(prepared)
        prepared.save(EFFECTS / output_name)


if __name__ == "__main__":
    main()
