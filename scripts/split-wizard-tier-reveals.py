#!/usr/bin/env python3
"""Split approved WIZARD CRAFT tier-reveal overlays into animation layers."""

from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "art-src/wizard-craft/effects/bonus-tier-reveals"
TIERS = {
    1: "tier-1-open-rune-overlay-v1.png",
    2: "tier-2-interlocked-rune-overlay-v1.png",
    3: "tier-3-anchored-rune-overlay-v1.png",
}
ALPHA_THRESHOLD = 32
PARTICLE_COMPONENT_MAX = 1_000


def connected_components(alpha: Image.Image) -> list[list[tuple[int, int]]]:
    pixels = alpha.load()
    width, height = alpha.size
    seen: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            if pixels[x, y] <= ALPHA_THRESHOLD or (x, y) in seen:
                continue
            component: list[tuple[int, int]] = []
            queue = deque([(x, y)])
            seen.add((x, y))
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                for nx, ny in (
                    (px - 1, py),
                    (px + 1, py),
                    (px, py - 1),
                    (px, py + 1),
                ):
                    if (
                        0 <= nx < width
                        and 0 <= ny < height
                        and (nx, ny) not in seen
                        and pixels[nx, ny] > ALPHA_THRESHOLD
                    ):
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            components.append(component)
    return components


def split_asset(source_path: Path, output_dir: Path) -> None:
    source = Image.open(source_path).convert("RGBA")
    width, height = source.size
    pixels = source.load()
    particle_pixels = {
        point
        for component in connected_components(source.getchannel("A"))
        if len(component) <= PARTICLE_COMPONENT_MAX
        for point in component
    }

    layers = {
        "core-cyan": Image.new("RGBA", source.size),
        "counter-violet": Image.new("RGBA", source.size),
        "flare-highlights": Image.new("RGBA", source.size),
        "particle-field": Image.new("RGBA", source.size),
    }
    layer_pixels = {name: image.load() for name, image in layers.items()}

    for y in range(height):
        for x in range(width):
            rgba = pixels[x, y]
            red, green, blue, alpha = rgba
            if alpha == 0:
                continue
            if (x, y) in particle_pixels:
                layer = "particle-field"
            elif min(red, green, blue) >= 185 and max(red, green, blue) - min(
                red, green, blue
            ) <= 65:
                layer = "flare-highlights"
            elif red >= 90 and blue > green * 1.08 and blue > red * 1.08:
                layer = "counter-violet"
            else:
                layer = "core-cyan"
            layer_pixels[layer][x, y] = rgba

    output_dir.mkdir(parents=True, exist_ok=True)
    for name, image in layers.items():
        image.save(output_dir / f"{name}.png")

    rebuilt = Image.new("RGBA", source.size)
    for image in layers.values():
        rebuilt.alpha_composite(image)
    rebuilt.save(output_dir / "reconstructed-check.png")


def main() -> None:
    for tier, filename in TIERS.items():
        split_asset(ASSET_DIR / filename, ASSET_DIR / f"tier-{tier}-layers")
    create_review_sheet()


def create_review_sheet() -> None:
    names = ("core-cyan", "counter-violet", "flare-highlights", "particle-field")
    labels = ("CORE CYAN", "COUNTER VIOLET", "FLARE HIGHLIGHTS", "PARTICLE FIELD")
    cell_width, cell_height = 360, 390
    sheet = Image.new(
        "RGBA", (cell_width * len(names), cell_height * len(TIERS)), (6, 9, 20, 255)
    )
    font_path = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    font = ImageFont.truetype(str(font_path), 24)

    for row, tier in enumerate(TIERS, start=0):
        for column, (name, label) in enumerate(zip(names, labels)):
            layer = Image.open(
                ASSET_DIR / f"tier-{tier}-layers/{name}.png"
            ).convert("RGBA")
            layer.thumbnail((330, 330), Image.Resampling.NEAREST)
            cell = Image.new("RGBA", (cell_width, cell_height), (12, 18, 39, 255))
            cell.alpha_composite(
                layer, ((cell_width - layer.width) // 2, 48 + (330 - layer.height) // 2)
            )
            draw = ImageDraw.Draw(cell)
            draw.text((16, 12), f"TIER {tier} · {label}", font=font, fill=(225, 239, 255))
            sheet.alpha_composite(cell, (column * cell_width, row * cell_height))

    sheet.convert("RGB").save(ASSET_DIR / "tier-reveal-layer-separation-review-v1.png")


if __name__ == "__main__":
    main()
