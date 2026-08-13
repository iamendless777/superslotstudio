#!/usr/bin/env python3
"""Build pixel-registered facial reaction accents for the v3 Dragon plate."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art-src/wizard-craft/native-master-v1"
SIZE = (640, 360)


def eye_accent(*, attack: bool) -> Image.Image:
    image = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")

    # Registered against wizard-craft-clean-idle-base-runtime-v3.png. Keep
    # hard whole-pixel clusters so the glow reads as authored pixel animation.
    if attack:
        draw.polygon(
            ((144, 163), (149, 159), (157, 160), (160, 163), (156, 168), (149, 168)),
            fill=(255, 67, 18, 38),
        )
        draw.polygon(
            ((147, 163), (151, 160), (157, 161), (159, 163), (155, 167), (150, 167)),
            fill=(255, 136, 20, 112),
        )
        draw.polygon(
            ((150, 163), (153, 161), (157, 162), (157, 164), (154, 166), (151, 165)),
            fill=(255, 235, 92, 238),
        )
        draw.rectangle((153, 162, 155, 164), fill=(255, 255, 224, 255))
        draw.point((157, 163), fill=(255, 85, 18, 230))
    else:
        draw.polygon(
            ((146, 163), (151, 160), (157, 161), (159, 163), (155, 167), (149, 167)),
            fill=(255, 126, 17, 42),
        )
        draw.polygon(
            ((149, 163), (152, 161), (157, 162), (157, 164), (154, 166), (150, 165)),
            fill=(255, 195, 34, 148),
        )
        draw.rectangle((152, 162, 155, 164), fill=(255, 246, 144, 232))
        draw.point((156, 163), fill=(255, 112, 15, 210))
    return image


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    outputs = {
        "dragon-eye-anticipation-v3-registered.png": eye_accent(attack=False),
        "dragon-eye-attack-v3-registered.png": eye_accent(attack=True),
    }
    for filename, image in outputs.items():
        path = OUTPUT / filename
        image.save(path, optimize=True)
        print(path)


if __name__ == "__main__":
    main()
