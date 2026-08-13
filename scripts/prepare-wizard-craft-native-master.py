#!/usr/bin/env python3
"""Derive registered native-grid review layers from the locked WIZARD CRAFT master.

This script never repaints the approved pixels. It only classifies and masks
pixels inside explicit character regions, so every exported layer retains the
master's exact 640x360 coordinate system.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "art-src/wizard-craft/master/wizard-craft-static-master-reference-v3.png"
)
OUTPUT = ROOT / "art-src/wizard-craft/native-master-v1"
CLOSED_JAW_SOURCE = (
    OUTPUT / "source/dragon-jaw-closed-cutout-v1.png"
)
EYE_SOURCE = ROOT / "art-src/wizard-craft/dragon/eye-candidate-v1.png"
WIZARD_SOURCE = (
    ROOT / "art-src/wizard-craft/wizard/corrected-idle-composite-v1.png"
)


def red_material_mask(image: Image.Image) -> Image.Image:
    """Select oxblood, crimson, and warm Dragon underside pixels."""

    pixels = image.convert("RGB")
    mask = Image.new("L", image.size)
    source = pixels.load()
    target = mask.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue = source[x, y]
            warm = red >= 30 and red > green * 1.18 and red > blue * 1.15
            ember = red >= 95 and green >= 38 and red > blue * 1.38
            target[x, y] = 255 if warm or ember else 0
    # Recover the one-pixel dark outlines bordering selected authored clusters.
    return mask.filter(ImageFilter.MaxFilter(3))


def region_mask(
    size: tuple[int, int],
    polygon: list[tuple[int, int]],
) -> Image.Image:
    mask = Image.new("L", size)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    return mask


def intersect(first: Image.Image, second: Image.Image) -> Image.Image:
    return Image.frombytes(
        "L",
        first.size,
        bytes(min(a, b) for a, b in zip(first.tobytes(), second.tobytes())),
    )


def retain_primary_material(
    mask: Image.Image,
    minimum_pixels: int = 24,
) -> Image.Image:
    width, height = mask.size
    source = mask.load()
    kept = Image.new("L", mask.size)
    target = kept.load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if source[x, y] == 0 or (x, y) in visited:
                continue
            stack = [(x, y)]
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                current_x, current_y = stack.pop()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    if source[next_x, next_y] == 0 or (next_x, next_y) in visited:
                        continue
                    visited.add((next_x, next_y))
                    stack.append((next_x, next_y))
            if len(component) >= minimum_pixels:
                components.append(component)
    if components:
        for kept_x, kept_y in max(components, key=len):
            target[kept_x, kept_y] = source[kept_x, kept_y]
    return kept


def apply_clean_alpha(source: Image.Image, alpha: Image.Image) -> Image.Image:
    """Copy visible source pixels without retaining hidden full-scene RGB data."""

    clean = Image.new("RGBA", source.size)
    visible = source.copy()
    visible.putalpha(alpha)
    clean.alpha_composite(visible)
    return clean


def export_layer(
    source: Image.Image,
    material: Image.Image,
    name: str,
    polygon: list[tuple[int, int]],
    exclusions: tuple[list[tuple[int, int]], ...] = (),
) -> None:
    alpha = intersect(material, region_mask(source.size, polygon))
    if exclusions:
        draw = ImageDraw.Draw(alpha)
        for exclusion in exclusions:
            draw.polygon(exclusion, fill=0)
    alpha = retain_primary_material(alpha)
    layer = apply_clean_alpha(source, alpha)
    layer.save(OUTPUT / name, optimize=True)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (640, 360):
        raise ValueError(f"expected native 640x360 master, got {source.size}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (640, 360)).save(
        OUTPUT / "transparent-registered-v1.png",
        optimize=True,
    )
    material = red_material_mask(source)

    export_layer(
        source,
        material,
        "dragon-head-neck-registered-v1.png",
        [
            (0, 62),
            (130, 62),
            (201, 116),
            (199, 180),
            (158, 210),
            (160, 300),
            (0, 327),
        ],
        exclusions=(
            [(108, 174), (202, 166), (202, 235), (103, 241)],
            [(137, 148), (156, 148), (156, 165), (137, 165)],
            [(136, 86), (154, 86), (154, 120), (136, 120)],
            [(141, 232), (172, 232), (172, 294), (141, 294)],
        ),
    )
    export_layer(
        source,
        material,
        "dragon-foreground-coil-registered-v1.png",
        [(0, 270), (174, 270), (238, 307), (421, 319), (421, 360), (0, 360)],
        exclusions=(
            [(246, 300), (268, 300), (268, 323), (246, 323)],
        ),
    )
    export_layer(
        source,
        material,
        "dragon-rear-tail-registered-v1.png",
        [(482, 178), (640, 165), (640, 360), (432, 360), (486, 309)],
    )
    export_layer(
        source,
        material,
        "dragon-jaw-attack-registered-v1.png",
        [(102, 160), (201, 158), (201, 245), (102, 245)],
    )

    # Full registered Dragon layer is useful for exact static-composite QA.
    combined = Image.new("L", source.size)
    for filename in (
        "dragon-head-neck-registered-v1.png",
        "dragon-foreground-coil-registered-v1.png",
        "dragon-rear-tail-registered-v1.png",
    ):
        alpha = Image.open(OUTPUT / filename).getchannel("A")
        combined = Image.frombytes(
            "L",
            source.size,
            bytes(max(a, b) for a, b in zip(combined.tobytes(), alpha.tobytes())),
        )
    dragon = apply_clean_alpha(source, combined)
    dragon.save(OUTPUT / "dragon-static-registered-v1.png", optimize=True)

    preview = Image.new("RGBA", source.size, (20, 28, 42, 255))
    preview.alpha_composite(dragon)
    attack_jaw = Image.open(
        OUTPUT / "dragon-jaw-attack-registered-v1.png",
    ).convert("RGBA")
    preview.alpha_composite(attack_jaw)
    preview.save(OUTPUT / "dragon-static-mask-review-v1.png", optimize=True)

    closed_source = Image.open(CLOSED_JAW_SOURCE).convert("RGBA")
    closed_bounds = closed_source.getchannel("A").getbbox()
    if closed_bounds is None:
        raise ValueError("closed Dragon jaw source has no visible pixels")
    closed_trimmed = closed_source.crop(closed_bounds).resize(
        (92, 38),
        Image.Resampling.NEAREST,
    )
    closed_jaw = Image.new("RGBA", source.size)
    closed_jaw.alpha_composite(closed_trimmed, (105, 169))
    closed_jaw.save(OUTPUT / "dragon-jaw-closed-registered-v1.png", optimize=True)
    # Build the attack pose only from the approved clean registered jaw.
    # The measured hinge rotation avoids the generated source's beam fragment,
    # hard crop edge, and inconsistent anatomy.
    attack_jaw = closed_jaw.rotate(
        -8,
        center=(116, 188),
        resample=Image.Resampling.NEAREST,
    )
    attack_jaw.save(OUTPUT / "dragon-jaw-attack-registered-v1.png", optimize=True)
    closed_preview = Image.new("RGBA", source.size, (20, 28, 42, 255))
    closed_preview.alpha_composite(dragon)
    closed_preview.alpha_composite(closed_jaw)

    eye_source = Image.open(EYE_SOURCE).convert("RGBA")
    eye_bounds = eye_source.getchannel("A").getbbox()
    if eye_bounds is None:
        raise ValueError("Dragon eye source has no visible pixels")
    eye_trimmed = eye_source.crop(eye_bounds)
    eye_specs = {
        "idle": ((18, 12), (137, 150)),
        "anticipation": ((22, 16), (135, 148)),
        "attack": ((20, 14), (136, 149)),
    }
    for state, (size, position) in eye_specs.items():
        eye = eye_trimmed.resize(size, Image.Resampling.NEAREST)
        registered = Image.new("RGBA", source.size)
        registered.alpha_composite(eye, position)
        registered.save(
            OUTPUT / f"dragon-eye-{state}-registered-v1.png",
            optimize=True,
        )
    closed_preview.alpha_composite(
        Image.open(OUTPUT / "dragon-eye-idle-registered-v1.png").convert("RGBA"),
    )
    closed_preview.save(OUTPUT / "dragon-jaw-closed-review-v1.png", optimize=True)
    idle_head = Image.open(
        OUTPUT / "dragon-head-neck-registered-v1.png"
    ).convert("RGBA")
    idle_head.alpha_composite(closed_jaw)
    idle_head.alpha_composite(
        Image.open(OUTPUT / "dragon-eye-idle-registered-v1.png").convert("RGBA")
    )
    idle_head.save(
        OUTPUT / "dragon-head-idle-complete-registered-v1.png",
        optimize=True,
    )
    attack_preview = Image.new("RGBA", source.size, (20, 28, 42, 255))
    attack_preview.alpha_composite(dragon)
    attack_preview.alpha_composite(attack_jaw)
    attack_preview.alpha_composite(
        Image.open(OUTPUT / "dragon-eye-attack-registered-v1.png").convert("RGBA"),
    )
    attack_preview.save(OUTPUT / "dragon-jaw-attack-review-v2.png", optimize=True)

    wizard_source = Image.open(WIZARD_SOURCE).convert("RGBA")
    wizard_bounds = wizard_source.getchannel("A").getbbox()
    if wizard_bounds is None:
        raise ValueError("Wizard source has no visible pixels")
    wizard_trimmed = wizard_source.crop(wizard_bounds)
    wizard_width = 54
    wizard_height = round(wizard_trimmed.height * wizard_width / wizard_trimmed.width)
    wizard_native = wizard_trimmed.resize(
        (wizard_width, wizard_height),
        Image.Resampling.NEAREST,
    )
    wizard_registered = Image.new("RGBA", source.size)
    wizard_registered.alpha_composite(wizard_native, (550, 66))
    wizard_registered.save(
        OUTPUT / "wizard-idle-registered-v1.png",
        optimize=True,
    )

    wizard_hat = wizard_registered.copy()
    hat_alpha = wizard_hat.getchannel("A")
    ImageDraw.Draw(hat_alpha).rectangle((0, 109, 639, 359), fill=0)
    wizard_hat.putalpha(hat_alpha)
    wizard_hat.save(OUTPUT / "wizard-hat-idle-registered-v1.png", optimize=True)

    wizard_body = wizard_registered.copy()
    body_alpha = wizard_body.getchannel("A")
    ImageDraw.Draw(body_alpha).rectangle((0, 0, 639, 104), fill=0)
    wizard_body.putalpha(body_alpha)
    eyes = Image.new("RGBA", source.size)
    body_pixels = wizard_body.load()
    eye_pixels = eyes.load()
    for y in range(106, 113):
        for x in range(560, 591):
            red, green, blue, alpha = body_pixels[x, y]
            if alpha > 0 and blue > 180 and green > 140 and red < 150:
                eye_pixels[x, y] = (red, green, blue, alpha)
                body_pixels[x, y] = (3, 5, 18, alpha)
    wizard_body.save(OUTPUT / "wizard-body-registered-v1.png", optimize=True)
    eyes.save(OUTPUT / "wizard-eyes-idle-registered-v1.png", optimize=True)

    wizard_hat_charge = Image.new("RGBA", source.size)
    wizard_hat_charge.alpha_composite(wizard_hat, (-2, -4))
    wizard_hat_charge.save(
        OUTPUT / "wizard-hat-charge-registered-v1.png",
        optimize=True,
    )
    wizard_hat_cast = wizard_hat.rotate(
        -7,
        resample=Image.Resampling.NEAREST,
        center=(575, 106),
    )
    wizard_hat_cast.save(
        OUTPUT / "wizard-hat-cast-registered-v1.png",
        optimize=True,
    )
    wizard_hat_block = wizard_hat.rotate(
        6,
        resample=Image.Resampling.NEAREST,
        center=(575, 106),
    )
    shifted_block = Image.new("RGBA", source.size)
    shifted_block.alpha_composite(wizard_hat_block, (2, 2))
    wizard_hat_block = shifted_block
    wizard_hat_block.save(
        OUTPUT / "wizard-hat-block-registered-v1.png",
        optimize=True,
    )

    wizard_preview = Image.new("RGBA", source.size, (20, 28, 42, 255))
    wizard_preview.alpha_composite(wizard_body)
    wizard_preview.alpha_composite(wizard_hat)
    wizard_preview.alpha_composite(eyes)
    wizard_preview.save(OUTPUT / "wizard-idle-review-v1.png", optimize=True)


if __name__ == "__main__":
    main()
