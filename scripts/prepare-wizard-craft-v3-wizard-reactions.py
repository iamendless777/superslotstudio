#!/usr/bin/env python3
"""Build pixel-registered Wizard reaction accents for the coherent v3 plate."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art-src/wizard-craft/native-master-v1"
SIZE = (640, 360)


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    return image, ImageDraw.Draw(image, "RGBA")


def eyes(level: str) -> Image.Image:
    image, draw = canvas()
    alpha = {"idle": 178, "charge": 232, "cast": 255, "block": 216}[level]
    halo = {"idle": 28, "charge": 72, "cast": 96, "block": 56}[level]
    draw.rectangle((568, 109, 581, 114), fill=(38, 151, 255, halo))
    draw.rectangle((570, 110, 573, 112), fill=(113, 218, 255, alpha))
    draw.rectangle((577, 110, 580, 112), fill=(113, 218, 255, alpha))
    draw.point((571, 110), fill=(232, 252, 255, min(255, alpha + 24)))
    draw.point((578, 110), fill=(232, 252, 255, min(255, alpha + 24)))

    if level in {"charge", "cast"}:
        # The extended bare hand is already authored in the base plate. This
        # is energy above it, never replacement hand anatomy.
        draw.polygon(
            ((551, 109), (556, 113), (551, 119), (546, 113)),
            fill=(34, 154, 255, 72 if level == "charge" else 126),
        )
        draw.polygon(
            ((551, 111), (554, 113), (551, 117), (548, 113)),
            fill=(91, 218, 255, 188 if level == "charge" else 238),
        )
        draw.rectangle((550, 112, 552, 114), fill=(230, 253, 255, 255))
        if level == "cast":
            draw.point((544, 108), fill=(75, 193, 255, 210))
            draw.point((558, 107), fill=(75, 193, 255, 220))
            draw.point((557, 120), fill=(75, 193, 255, 190))
    return image


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    outputs = {
        "wizard-eyes-v3-registered.png": eyes("idle"),
        "wizard-charge-v3-registered.png": eyes("charge"),
        "wizard-cast-v3-registered.png": eyes("cast"),
        "wizard-block-v3-registered.png": eyes("block"),
    }
    for filename, image in outputs.items():
        path = OUTPUT / filename
        image.save(path, optimize=True)
        print(path)


if __name__ == "__main__":
    main()
