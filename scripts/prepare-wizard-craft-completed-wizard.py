#!/usr/bin/env python3
"""Prepare the completed Wizard candidate on the native scene grid."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-src/wizard-craft/wizard/completion-v1/wizard-caster-alpha-v1.png"
OUTPUT_DIR = ROOT / "art-src/wizard-craft/runtime"
DESIGN_SIZE = (640, 360)
WIZARD_POSITION = (536, 84)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    bounds = source.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Completed Wizard source has no visible pixels")
    trimmed = source.crop(bounds).resize((82, 88), Image.Resampling.NEAREST)
    registered = Image.new("RGBA", DESIGN_SIZE)
    # Seat the robe on the stone platform. The previous y=68 registration left
    # a visible air gap and made the completed Wizard read as floating.
    registered.alpha_composite(trimmed, WIZARD_POSITION)
    def save(image: Image.Image, filename: str) -> None:
        image.quantize(
            colors=256,
            method=Image.Quantize.FASTOCTREE,
            dither=Image.Dither.NONE,
        ).save(OUTPUT_DIR / filename, optimize=True, compress_level=9)

    save(registered, "wizard-caster-complete-candidate-v1.png")
    save(registered, "wizard-caster-pose-idle-v1.png")

    charge = Image.new("RGBA", DESIGN_SIZE)
    charge.alpha_composite(registered, (0, -1))
    save(charge, "wizard-caster-pose-charge-v1.png")

    cast = Image.new("RGBA", DESIGN_SIZE)
    cast.alpha_composite(registered, (-2, 0))
    save(cast, "wizard-caster-pose-cast-v1.png")

    claim = Image.new("RGBA", DESIGN_SIZE)
    claim.alpha_composite(registered, (0, -2))
    save(claim, "wizard-caster-pose-claim-v1.png")

    block = Image.new("RGBA", DESIGN_SIZE)
    block.alpha_composite(registered, (1, 1))
    save(block, "wizard-caster-pose-block-v1.png")
    print(OUTPUT_DIR)


if __name__ == "__main__":
    main()
