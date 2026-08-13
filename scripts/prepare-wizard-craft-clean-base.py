#!/usr/bin/env python3
"""Register the approved clean WIZARD CRAFT plate on the native 640×360 grid."""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "art-src/wizard-craft/master"
SOURCE = MASTER / "wizard-craft-clean-idle-base-candidate-v3.png"
OUTPUT = MASTER / "wizard-craft-clean-idle-base-runtime-v3.png"


def main() -> None:
    image = Image.open(SOURCE).convert("RGB")
    ImageOps.fit(
        image,
        (640, 360),
        Image.Resampling.NEAREST,
        centering=(0.5, 0.5),
    ).save(
        OUTPUT,
        optimize=True,
    )
    # Semantic slots embedded in the coherent plate remain addressable to the
    # scene contract without shipping obsolete reconstructed character art.
    Image.new("RGBA", (1, 1), (0, 0, 0, 0)).save(
        MASTER.parent / "runtime/empty-layer-v1.png",
        optimize=True,
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
