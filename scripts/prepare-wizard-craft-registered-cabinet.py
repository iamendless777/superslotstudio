#!/usr/bin/env python3
"""Prepare proportion-safe registered WIZARD CRAFT cabinet layers.

Every output is a transparent 640×360 image. Source artwork is trimmed only to
its alpha bounds, scaled with nearest-neighbor sampling while preserving aspect
ratio, and composited into a measured slot. Runtime placement is therefore
always (0, 0) with no per-layer stretching.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art-src" / "wizard-craft"
OUTPUT = ART / "runtime"
DESIGN_SIZE = (640, 360)


@dataclass(frozen=True)
class RegisteredLayer:
    source: str
    output: str
    slot: tuple[int, int, int, int]
    align_x: str = "center"
    align_y: str = "center"


LAYERS = (
    RegisteredLayer(
        "cabinet/top-lintel-title-backing-candidate-v1.png",
        "registered-cabinet-lintel.png",
        (104, 12, 432, 126),
    ),
    RegisteredLayer(
        "cabinet/title-wizard-craft-candidate-v1.png",
        "registered-cabinet-title.png",
        (164, 10, 312, 54),
    ),
    RegisteredLayer(
        "cabinet/pillar-left-base-candidate-v1.png",
        "registered-cabinet-pillar-dragon.png",
        (96, 58, 82, 286),
        align_x="right",
    ),
    RegisteredLayer(
        "cabinet/pillar-right-base-candidate-v1.png",
        "registered-cabinet-pillar-wizard.png",
        (462, 58, 82, 286),
        align_x="left",
    ),
    RegisteredLayer(
        "cabinet/pillar-left-rune-channel-candidate-v1.png",
        "registered-cabinet-runes-dragon.png",
        (120, 92, 28, 214),
    ),
    RegisteredLayer(
        "cabinet/pillar-right-rune-channel-candidate-v1.png",
        "registered-cabinet-runes-wizard.png",
        (492, 92, 28, 214),
    ),
    RegisteredLayer(
        "cabinet/sill-bottom-candidate-v1.png",
        "registered-cabinet-sill.png",
        (96, 278, 448, 80),
        align_y="bottom",
    ),
)


def trim(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"Cabinet source has no visible pixels: {source}")
    return image.crop(bounds)


def contain(
    image: Image.Image,
    slot: tuple[int, int, int, int],
) -> Image.Image:
    _x, _y, width, height = slot
    scale = min(width / image.width, height / image.height)
    output_size = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    return image.resize(output_size, Image.Resampling.NEAREST)


def offset(
    layer: RegisteredLayer,
    image: Image.Image,
) -> tuple[int, int]:
    x, y, width, height = layer.slot
    if layer.align_x == "left":
        placed_x = x
    elif layer.align_x == "right":
        placed_x = x + width - image.width
    else:
        placed_x = x + (width - image.width) // 2
    if layer.align_y == "top":
        placed_y = y
    elif layer.align_y == "bottom":
        placed_y = y + height - image.height
    else:
        placed_y = y + (height - image.height) // 2
    return placed_x, placed_y


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for layer in LAYERS:
        source = trim(ART / layer.source)
        prepared = contain(source, layer.slot)
        registered = Image.new("RGBA", DESIGN_SIZE)
        registered.alpha_composite(prepared, offset(layer, prepared))
        registered.save(OUTPUT / layer.output, optimize=True, compress_level=9)
    print(OUTPUT)


if __name__ == "__main__":
    main()
