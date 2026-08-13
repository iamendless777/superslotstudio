#!/usr/bin/env python3
"""Prepare transparent WIZARD CRAFT symbol masters for the native reel grid."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SYMBOL_ROOT = ROOT / "art-src/wizard-craft/symbols"
SYMBOLS = (
    ("ember", "v1"),
    ("scroll", "v1"),
    ("potion", "v2"),
    ("crystal", "v2"),
    ("grimoire", "v1"),
    ("staff", "v1"),
    ("dragon-egg", "v1"),
    ("duel-coin", "v2"),
    ("dragon-wild", "v3"),
    ("wizard-wild", "v1"),
)
CELL_SIZE = (68, 51)
CONTENT_SIZE = (60, 45)
CONTENT_SIZE_OVERRIDES = {
    "duel-coin": (66, 49),
    "dragon-wild": (66, 49),
}


def native_symbol(
    master: Image.Image,
    content_size: tuple[int, int] = CONTENT_SIZE,
) -> Image.Image:
    alpha = master.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("Symbol master has no visible pixels")
    cropped = master.crop(bounds)
    cropped.thumbnail(content_size, Image.Resampling.NEAREST)
    cell = Image.new("RGBA", CELL_SIZE)
    cell.alpha_composite(
        cropped,
        ((CELL_SIZE[0] - cropped.width) // 2, (CELL_SIZE[1] - cropped.height) // 2),
    )
    return cell


def main() -> None:
    cells: list[tuple[str, Image.Image]] = []
    for name, version in SYMBOLS:
        master_path = SYMBOL_ROOT / name / f"idle-master-{version}.png"
        master = Image.open(master_path).convert("RGBA")
        native = native_symbol(master, CONTENT_SIZE_OVERRIDES.get(name, CONTENT_SIZE))
        native.save(SYMBOL_ROOT / name / f"idle-native-68x51-{version}.png")
        cells.append((name, native))

    scale = 8
    panel_width = CELL_SIZE[0] * scale
    panel_height = CELL_SIZE[1] * scale + 54
    columns = 5
    rows = (len(cells) + columns - 1) // columns
    review = Image.new(
        "RGB", (panel_width * columns, panel_height * rows), (7, 10, 20)
    )
    font = ImageFont.truetype(
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf", 24
    )
    for index, (name, native) in enumerate(cells):
        panel = Image.new("RGBA", (panel_width, panel_height), (12, 18, 34, 255))
        enlarged = native.resize(
            (CELL_SIZE[0] * scale, CELL_SIZE[1] * scale),
            Image.Resampling.NEAREST,
        )
        panel.alpha_composite(enlarged, (0, 0))
        draw = ImageDraw.Draw(panel)
        label = f"{name.upper()} · 68×51 NATIVE"
        bounds = draw.textbbox((0, 0), label, font=font)
        draw.text(
            ((panel_width - (bounds[2] - bounds[0])) // 2, panel_height - 42),
            label,
            font=font,
            fill=(221, 233, 248, 255),
        )
        review.paste(
            panel.convert("RGB"),
            ((index % columns) * panel_width, (index // columns) * panel_height),
        )
    review.save(SYMBOL_ROOT / "balanced-symbol-native-grid-review-v1.png")


if __name__ == "__main__":
    main()
