#!/usr/bin/env python3
"""Prepare exact-size WIZARD CRAFT browser textures from retained art masters."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art-src" / "wizard-craft"
OUTPUT = ART / "runtime"

TEXTURES: dict[str, tuple[str, tuple[int, int]]] = {
    "environment-sky.png": ("environment/sky-back-candidate-v1.png", (640, 360)),
    "environment-castle.png": (
        "environment/castle-silhouette-candidate-v1.png",
        (640, 360),
    ),
    "environment-fog.png": ("environment/fog-low-candidate-v1.png", (640, 74)),
    "cabinet-title.png": ("cabinet/title-wizard-craft-candidate-v1.png", (320, 64)),
    "cabinet-lintel.png": (
        "cabinet/top-lintel-title-backing-candidate-v1.png",
        (448, 42),
    ),
    "cabinet-pillar-dragon.png": (
        "cabinet/pillar-left-base-candidate-v1.png",
        (76, 218),
    ),
    "cabinet-pillar-wizard.png": (
        "cabinet/pillar-right-base-candidate-v1.png",
        (80, 218),
    ),
    "cabinet-runes-dragon.png": (
        "cabinet/pillar-left-rune-channel-candidate-v1.png",
        (76, 218),
    ),
    "cabinet-runes-wizard.png": (
        "cabinet/pillar-right-rune-channel-candidate-v1.png",
        (80, 218),
    ),
    "cabinet-sill.png": ("cabinet/sill-bottom-candidate-v1.png", (440, 32)),
    "reel-backing.png": ("cabinet/reel-backing-candidate-v1.png", (316, 230)),
    "reel-dividers.png": (
        "cabinet/reel-dividers-5x4-candidate-v1.png",
        (316, 230),
    ),
    "vs-claim.png": ("cabinet/reel-claim-effect-candidate-v1.png", (64, 230)),
    "vs-frame-dragon.png": (
        "cabinet/sticky-frame-dragon-candidate-v1.png",
        (64, 230),
    ),
    "vs-frame-wizard.png": (
        "cabinet/sticky-frame-wizard-candidate-v1.png",
        (64, 230),
    ),
    "vs-frame-balanced.png": (
        "cabinet/sticky-frame-contested-candidate-v1.png",
        (64, 230),
    ),
    "vs-temporary.png": (
        "cabinet/persistence-temporary-candidate-v1.png",
        (64, 230),
    ),
    "vs-sticky.png": (
        "cabinet/persistence-sticky-locks-candidate-v1.png",
        (64, 230),
    ),
    "vs-upgrade.png": (
        "cabinet/sticky-upgrade-effect-candidate-v1.png",
        (64, 230),
    ),
    "vs-release.png": (
        "cabinet/temporary-release-effect-candidate-v1.png",
        (64, 230),
    ),
}


def prepare(
    source: Path,
    destination: Path,
    size: tuple[int, int],
    crop_transparency: bool = False,
) -> None:
    image = Image.open(source).convert("RGBA")
    if crop_transparency:
        bounds = image.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"WIZARD CRAFT texture has no visible pixels: {source}")
        image = image.crop(bounds)
    image = image.resize(size, Image.Resampling.NEAREST)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True, compress_level=9)


def main() -> None:
    for filename, (source, size) in TEXTURES.items():
        prepare(
            ART / source,
            OUTPUT / filename,
            size,
            crop_transparency=filename.startswith("vs-"),
        )
    for tier in (1, 2, 3):
        for frame in range(8):
            source = (
                ART / "effects" / "bonus-tier-reveals" /
                f"tier-{tier}-sequence-v1" / f"frame-{frame:02}.png"
            )
            destination = OUTPUT / "tier-reveals" / (
                f"tier-{tier}-frame-{frame:02}.png"
            )
            prepare(source, destination, (388, 280))
    print(OUTPUT)


if __name__ == "__main__":
    main()
