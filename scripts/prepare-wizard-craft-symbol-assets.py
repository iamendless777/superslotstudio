#!/usr/bin/env python3
"""Prepare character-consistent native WIZARD CRAFT symbol assets."""

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / "art-src" / "wizard-craft" / "native-master-v1"
OUTPUT = ROOT / "art-src" / "wizard-craft" / "symbols" / "dragon-wild"


def dragon_wild() -> None:
    registered = Image.new("RGBA", (640, 360))
    for name in (
        "dragon-head-neck-registered-v1.png",
        "dragon-jaw-closed-registered-v1.png",
        "dragon-eye-idle-registered-v1.png",
    ):
        registered.alpha_composite(Image.open(NATIVE / name).convert("RGBA"))

    face = registered.crop((45, 105, 204, 220))
    alpha_bounds = face.getchannel("A").getbbox()
    if alpha_bounds is None:
        raise ValueError("registered Dragon face has no visible pixels")
    face = face.crop(alpha_bounds)
    scale = min(66 / face.width, 49 / face.height)
    size = (round(face.width * scale), round(face.height * scale))
    face = face.resize(size, Image.Resampling.NEAREST)
    native = Image.new("RGBA", (68, 51))
    native.alpha_composite(face, ((68 - size[0]) // 2, (51 - size[1]) // 2))

    alpha = native.getchannel("A")
    outer = alpha.filter(ImageFilter.MaxFilter(5))
    inner = alpha.filter(ImageFilter.MaxFilter(3))
    glow = Image.new("RGBA", native.size, (105, 0, 28, 0))
    glow.putalpha(outer.point(lambda value: round(value * 0.55)))
    rim = Image.new("RGBA", native.size, (238, 30, 18, 0))
    rim.putalpha(inner.point(lambda value: round(value * 0.5)))

    bright_rgb = ImageEnhance.Brightness(native.convert("RGB")).enhance(1.22)
    bright = Image.merge("RGBA", (*bright_rgb.split(), alpha))
    output = Image.new("RGBA", native.size)
    output.alpha_composite(glow)
    output.alpha_composite(rim)
    output.alpha_composite(bright)
    output.save(OUTPUT / "idle-native-68x51-v4.png", optimize=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    dragon_wild()


if __name__ == "__main__":
    main()
