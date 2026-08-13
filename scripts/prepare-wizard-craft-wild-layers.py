#!/usr/bin/env python3
"""Build aligned Dragon Wild animation layers from the approved source pixels."""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SYMBOL_DIR = ROOT / "art-src/wizard-craft/symbols/dragon-wild"
SOURCE = SYMBOL_DIR / "idle-master-v3.png"
CELL_SIZE = (68, 51)
CONTENT_SIZE = (66, 49)


def color_mask(
    image: Image.Image,
    region: tuple[float, float, float, float],
    predicate,
) -> Image.Image:
    width, height = image.size
    x0, y0, x1, y1 = (
        int(region[0] * width),
        int(region[1] * height),
        int(region[2] * width),
        int(region[3] * height),
    )
    mask = Image.new("L", image.size)
    source = image.load()
    target = mask.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            red, green, blue, alpha = source[x, y]
            if alpha and predicate(red, green, blue):
                target[x, y] = alpha
    return mask


def glow_layer(
    mask: Image.Image,
    core: tuple[int, int, int],
    halo: tuple[int, int, int],
    radius: int,
) -> Image.Image:
    expanded = mask.filter(ImageFilter.MaxFilter(radius * 2 + 1))
    softened = expanded.filter(ImageFilter.GaussianBlur(radius / 2))
    halo_layer = Image.new("RGBA", mask.size, (*halo, 0))
    halo_layer.putalpha(softened.point(lambda alpha: min(150, alpha)))
    core_layer = Image.new("RGBA", mask.size, (*core, 0))
    core_layer.putalpha(mask)
    halo_layer.alpha_composite(core_layer)
    return halo_layer


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
            phase = (x * 3 + y * 5) % 17
            color = (255, 62, 12) if phase < 9 else (
                (238, 24, 132) if phase < 15 else (104, 76, 255)
            )
            pixels[x, y] = (*color, min(120, value))
    return aura


def particle_layer(size: tuple[int, int]) -> Image.Image:
    layer = Image.new("RGBA", size)
    draw = ImageDraw.Draw(layer)
    particles = (
        (0.13, 0.28, 16, (255, 91, 12, 230)),
        (0.19, 0.17, 13, (241, 36, 139, 220)),
        (0.32, 0.10, 13, (255, 165, 24, 230)),
        (0.71, 0.11, 13, (116, 91, 255, 220)),
        (0.87, 0.25, 16, (255, 89, 12, 230)),
        (0.89, 0.55, 13, (239, 31, 139, 220)),
        (0.80, 0.81, 16, (255, 143, 18, 230)),
        (0.62, 0.88, 13, (107, 86, 255, 220)),
        (0.29, 0.86, 16, (255, 77, 10, 230)),
        (0.11, 0.68, 13, (235, 29, 134, 220)),
    )
    for x_ratio, y_ratio, radius, color in particles:
        x = round(size[0] * x_ratio)
        y = round(size[1] * y_ratio)
        draw.rectangle((x - radius, y - radius, x + radius, y + radius), fill=color)
        draw.point((x, y), fill=(255, 238, 178, 255))
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
        raise ValueError("Dragon Wild source has no visible pixels")

    eye_mask = color_mask(
        source,
        (0.54, 0.29, 0.65, 0.40),
        lambda red, green, blue: (
            red > 200 and green > 90 and blue < 65 and red < green * 2.8
        ),
    )
    mouth_mask = color_mask(
        source,
        (0.57, 0.45, 0.91, 0.76),
        lambda red, green, blue: red > 175 and green > 38 and blue < 65,
    )
    layers = {
        "base": source,
        "eyes": glow_layer(eye_mask, (255, 242, 166), (255, 113, 16), 13),
        "inner-glow": glow_layer(mouth_mask, (255, 211, 104), (255, 65, 8), 17),
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
