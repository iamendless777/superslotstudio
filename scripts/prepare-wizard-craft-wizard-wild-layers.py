#!/usr/bin/env python3
"""Build aligned Wizard Wild animation layers from the approved source pixels."""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SYMBOL_DIR = ROOT / "art-src/wizard-craft/symbols/wizard-wild"
SOURCE = SYMBOL_DIR / "idle-master-v1.png"
CELL_SIZE = (68, 51)
CONTENT_SIZE = (60, 45)


def eye_mask(image: Image.Image) -> Image.Image:
    width, height = image.size
    mask = Image.new("L", image.size)
    source = image.load()
    target = mask.load()
    for y in range(int(height * 0.40), int(height * 0.56)):
        for x in range(int(width * 0.39), int(width * 0.61)):
            red, green, blue, alpha = source[x, y]
            if (
                alpha
                and blue > 175
                and green > 135
                and red > 75
                and blue > red * 1.25
                and green > red * 1.15
            ):
                target[x, y] = alpha
    return mask


def colored_layer(
    mask: Image.Image,
    color: tuple[int, int, int],
    maximum_alpha: int = 255,
) -> Image.Image:
    layer = Image.new("RGBA", mask.size, (*color, 0))
    layer.putalpha(mask.point(lambda alpha: min(maximum_alpha, alpha)))
    return layer


def inner_glow(mask: Image.Image) -> Image.Image:
    expanded = mask.filter(ImageFilter.MaxFilter(41))
    softened = expanded.filter(ImageFilter.GaussianBlur(9))
    halo = colored_layer(softened, (78, 180, 255), 145)
    core = colored_layer(mask, (225, 250, 255))
    halo.alpha_composite(core)
    return halo


def aura_layer(source_alpha: Image.Image) -> Image.Image:
    expanded = source_alpha.filter(ImageFilter.MaxFilter(51))
    ring = ImageChops.subtract(expanded, source_alpha)
    ring = ring.filter(ImageFilter.GaussianBlur(6))
    aura = Image.new("RGBA", source_alpha.size)
    pixels = aura.load()
    alpha = ring.load()
    width, height = source_alpha.size
    for y in range(height):
        for x in range(width):
            value = alpha[x, y]
            if value == 0:
                continue
            phase = (x * 5 + y * 3) % 19
            color = (78, 188, 255) if phase < 10 else (
                (213, 235, 255) if phase < 15 else (137, 77, 255)
            )
            pixels[x, y] = (*color, min(125, value))
    return aura


def particle_layer(size: tuple[int, int]) -> Image.Image:
    layer = Image.new("RGBA", size)
    draw = ImageDraw.Draw(layer)
    particles = (
        (0.27, 0.26, 17, (91, 202, 255, 235)),
        (0.34, 0.14, 14, (165, 99, 255, 230)),
        (0.70, 0.16, 15, (224, 241, 255, 240)),
        (0.78, 0.30, 17, (103, 199, 255, 235)),
        (0.82, 0.63, 14, (165, 91, 255, 230)),
        (0.68, 0.84, 16, (216, 242, 255, 240)),
        (0.37, 0.85, 15, (112, 205, 255, 235)),
        (0.22, 0.64, 14, (151, 83, 255, 230)),
    )
    for index, (x_ratio, y_ratio, radius, color) in enumerate(particles):
        x = round(size[0] * x_ratio)
        y = round(size[1] * y_ratio)
        if index % 2 == 0:
            draw.rectangle((x - 2, y - radius, x + 2, y + radius), fill=color)
            draw.rectangle((x - radius, y - 2, x + radius, y + 2), fill=color)
        else:
            draw.polygon(
                ((x, y - radius), (x + radius, y), (x, y + radius), (x - radius, y)),
                outline=color,
                width=4,
            )
        draw.point((x, y), fill=(255, 255, 255, 255))
    return layer


def native_layer(layer: Image.Image, bounds: tuple[int, int, int, int]) -> Image.Image:
    cropped = layer.crop(bounds)
    cropped.thumbnail(CONTENT_SIZE, Image.Resampling.NEAREST)
    cell = Image.new("RGBA", CELL_SIZE)
    cell.alpha_composite(
        cropped,
        ((CELL_SIZE[0] - cropped.width) // 2, (CELL_SIZE[1] - cropped.height) // 2),
    )
    return cell


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    bounds = source.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Wizard Wild source has no visible pixels")

    eyes = eye_mask(source)
    layers = {
        "base": source,
        "eyes": colored_layer(eyes, (232, 252, 255)),
        "inner-glow": inner_glow(eyes),
        "aura": aura_layer(source.getchannel("A")),
        "particles": particle_layer(source.size),
    }

    native_layers: dict[str, Image.Image] = {}
    for name, layer in layers.items():
        layer.save(SYMBOL_DIR / f"anim-{name}-master-v1.png")
        native = native_layer(layer, bounds)
        native.save(SYMBOL_DIR / f"anim-{name}-native-68x51-v1.png")
        native_layers[name] = native

    scale = 8
    panel_width = CELL_SIZE[0] * scale
    panel_height = CELL_SIZE[1] * scale + 52
    review = Image.new("RGB", (panel_width * len(layers), panel_height), (7, 10, 20))
    font = ImageFont.truetype(
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22
    )
    for index, (name, native) in enumerate(native_layers.items()):
        panel = Image.new("RGBA", (panel_width, panel_height), (12, 18, 34, 255))
        enlarged = native.resize(
            (CELL_SIZE[0] * scale, CELL_SIZE[1] * scale),
            Image.Resampling.NEAREST,
        )
        panel.alpha_composite(enlarged)
        draw = ImageDraw.Draw(panel)
        label = name.upper()
        text_bounds = draw.textbbox((0, 0), label, font=font)
        draw.text(
            ((panel_width - (text_bounds[2] - text_bounds[0])) // 2, panel_height - 38),
            label,
            font=font,
            fill=(221, 233, 248, 255),
        )
        review.paste(panel.convert("RGB"), (index * panel_width, 0))
    review.save(SYMBOL_DIR / "animation-layers-native-review-v1.png")


if __name__ == "__main__":
    main()
