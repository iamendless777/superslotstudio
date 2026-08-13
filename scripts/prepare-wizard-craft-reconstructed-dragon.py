#!/usr/bin/env python3
"""Split the clean reconstructed Dragon into registered depth layers."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art-src" / "wizard-craft"
SOURCE = ART / "dragon/reconstruction-v1/dragon-master-alpha-v1.png"
TAIL_SOURCE = ART / "dragon/tail-completion-v1/dragon-tail-alpha-v1.png"
OUTPUT = ART / "runtime"
DESIGN_SIZE = (640, 360)
HEAD_LIFT = -48


def export(
    source: Image.Image,
    filename: str,
    regions: tuple[tuple[int, int, int, int], ...],
    occlusions: tuple[tuple[int, int, int, int], ...] = (),
) -> None:
    mask = Image.new("L", DESIGN_SIZE)
    draw = ImageDraw.Draw(mask)
    for region in regions:
        draw.rectangle(region, fill=255)
    for region in occlusions:
        draw.rectangle(region, fill=0)
    source_alpha = source.getchannel("A")
    alpha = Image.frombytes(
        "L",
        DESIGN_SIZE,
        bytes(
            min(source_value, mask_value)
            for source_value, mask_value
            in zip(source_alpha.tobytes(), mask.tobytes())
        ),
    )
    layer = source.copy()
    layer.putalpha(alpha)
    indexed = layer.quantize(
        colors=256,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    )
    indexed.save(OUTPUT / filename, optimize=True, compress_level=9)


def indexed_save(image: Image.Image, filename: str) -> None:
    indexed = image.quantize(
        colors=256,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    )
    indexed.save(OUTPUT / filename, optimize=True, compress_level=9)


def lift_head(image: Image.Image) -> Image.Image:
    """Restore the approved high, cabinet-facing Dragon registration."""

    lifted = Image.new("RGBA", DESIGN_SIZE)
    lifted.alpha_composite(image, (0, HEAD_LIFT))
    return lifted


def assert_transparent(
    filename: str,
    bounds: tuple[int, int, int, int],
) -> None:
    image = Image.open(OUTPUT / filename).convert("RGBA")
    alpha = image.getchannel("A").crop(bounds)
    if alpha.getbbox() is not None:
        raise ValueError(f"{filename} violates transparent occlusion {bounds}")


def isolate(
    source: Image.Image,
    polygon: tuple[tuple[int, int], ...],
) -> Image.Image:
    mask = Image.new("L", DESIGN_SIZE)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    source_alpha = source.getchannel("A")
    alpha = Image.frombytes(
        "L",
        DESIGN_SIZE,
        bytes(
            min(source_value, mask_value)
            for source_value, mask_value
            in zip(source_alpha.tobytes(), mask.tobytes())
        ),
    )
    result = source.copy()
    result.putalpha(alpha)
    return result


def shadow_body(source: Image.Image) -> Image.Image:
    """Recede the long body while preserving its warm spine highlights."""

    alpha = source.getchannel("A")
    toned = ImageEnhance.Color(source.convert("RGB")).enhance(0.78)
    toned = ImageEnhance.Brightness(toned).enhance(0.68).convert("RGBA")
    toned.putalpha(alpha)
    return toned


def completed_rear_tail() -> Image.Image:
    """Fit the continuous cabinet-wrapping tail between tower and stairs."""

    source = Image.open(TAIL_SOURCE).convert("RGBA")
    bounds = source.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Completed Dragon tail has no visible pixels")
    source = source.crop(bounds)
    alpha = source.getchannel("A")
    toned = ImageEnhance.Color(source.convert("RGB")).enhance(0.72)
    toned = ImageEnhance.Brightness(toned).enhance(0.62).convert("RGBA")
    toned.putalpha(alpha)
    toned = toned.resize((108, 220), Image.Resampling.NEAREST)

    registered = Image.new("RGBA", DESIGN_SIZE)
    registered.alpha_composite(toned, (470, 133))
    # The approved composition hides the narrow tip behind the Wizard platform.
    # Keeping it visible above the platform reads as a detached second tail.
    alpha = registered.getchannel("A")
    ImageDraw.Draw(alpha).rectangle((0, 0, 639, 164), fill=0)
    registered.putalpha(alpha)
    return registered


def dragon_eye_mask(source: Image.Image) -> Image.Image:
    """Select only the connected bright eye cluster, then recover its outline."""

    bounds = (122, 154, 152, 181)
    candidates: set[tuple[int, int]] = set()
    brightest: tuple[int, int] | None = None
    brightest_value = -1
    for y in range(bounds[1], bounds[3]):
        for x in range(bounds[0], bounds[2]):
            red, green, blue, alpha = source.getpixel((x, y))
            if (
                alpha > 0
                and red >= 145
                and green >= 48
                and blue <= 92
                and red > blue * 1.7
            ):
                candidates.add((x, y))
                value = red + green * 2 - blue
                if value > brightest_value:
                    brightest = (x, y)
                    brightest_value = value
    if brightest is None:
        raise ValueError("Reconstructed Dragon eye could not be isolated")

    connected: set[tuple[int, int]] = {brightest}
    stack = [brightest]
    while stack:
        x, y = stack.pop()
        for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if neighbor in candidates and neighbor not in connected:
                connected.add(neighbor)
                stack.append(neighbor)

    core = Image.new("L", DESIGN_SIZE)
    pixels = core.load()
    for x, y in connected:
        pixels[x, y] = 255
    outline = core.filter(ImageFilter.MaxFilter(5))
    region = Image.new("L", DESIGN_SIZE)
    ImageDraw.Draw(region).rectangle(bounds, fill=255)
    return Image.frombytes(
        "L",
        DESIGN_SIZE,
        bytes(min(a, b) for a, b in zip(outline.tobytes(), region.tobytes())),
    )


def strengthen_dragon_eye(pose: Image.Image, hot: bool = False) -> Image.Image:
    """Paint one compact, readable slitted eye into a flattened head pose."""

    result = pose.copy()
    draw = ImageDraw.Draw(result)
    # A dark socket keeps the brighter eye separate from nearby red scales.
    draw.polygon(((125, 166), (132, 163), (140, 167), (135, 172), (127, 171)), fill="#210A12")
    draw.polygon(((128, 166), (133, 165), (138, 167), (134, 170), (129, 169)), fill="#E64B25")
    draw.polygon(((130, 166), (135, 166), (136, 168), (132, 169), (130, 168)), fill="#FFC45A")
    draw.line(((133, 165), (133, 170)), fill="#FFF0B3" if hot else "#45101B", width=1)
    return result


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA").resize(
        DESIGN_SIZE,
        Image.Resampling.NEAREST,
    )
    body_source = shadow_body(source)
    rear_tail = completed_rear_tail()
    indexed_save(rear_tail, "reconstructed-dragon-rear.png")

    head = isolate(
        source,
        ((0, 105), (215, 105), (215, 260), (180, 318), (0, 318)),
    )
    complete_idle_head = strengthen_dragon_eye(head)
    indexed_save(lift_head(complete_idle_head), "reconstructed-dragon-pose-idle.png")
    indexed_save(lift_head(complete_idle_head), "reconstructed-dragon-pose-windup.png")
    indexed_save(lift_head(complete_idle_head), "reconstructed-dragon-pose-claim.png")
    indexed_save(lift_head(complete_idle_head), "reconstructed-dragon-pose-block.png")
    jaw_polygon = ((104, 184), (190, 184), (190, 246), (126, 255), (98, 220))
    eye_mask = dragon_eye_mask(source)
    head_alpha = head.getchannel("A")
    head_draw = ImageDraw.Draw(head_alpha)
    head_draw.polygon(jaw_polygon, fill=0)
    head_alpha = Image.frombytes(
        "L",
        DESIGN_SIZE,
        bytes(
            0 if eye_value else head_value
            for head_value, eye_value
            in zip(head_alpha.tobytes(), eye_mask.tobytes())
        ),
    )
    head.putalpha(head_alpha)
    indexed_save(lift_head(head), "reconstructed-dragon-head-neck.png")

    jaw = isolate(source, jaw_polygon)
    closed_jaw = jaw.rotate(
        -14,
        center=(108, 190),
        resample=Image.Resampling.NEAREST,
    )
    indexed_save(lift_head(closed_jaw), "reconstructed-dragon-jaw-closed.png")
    attack_jaw = jaw.rotate(
        7,
        center=(108, 190),
        resample=Image.Resampling.NEAREST,
    )
    indexed_save(lift_head(attack_jaw), "reconstructed-dragon-jaw-attack.png")

    eye = source.copy()
    eye_alpha = Image.frombytes(
        "L",
        DESIGN_SIZE,
        bytes(
            min(source_value, mask_value)
            for source_value, mask_value
            in zip(source.getchannel("A").tobytes(), eye_mask.tobytes())
        ),
    )
    eye.putalpha(eye_alpha)
    indexed_save(lift_head(eye), "reconstructed-dragon-eye-idle.png")
    anticipation_eye = ImageEnhance.Brightness(eye).enhance(1.35)
    indexed_save(lift_head(anticipation_eye), "reconstructed-dragon-eye-anticipation.png")
    attack_eye = ImageEnhance.Contrast(
        ImageEnhance.Brightness(eye).enhance(1.55),
    ).enhance(1.15)
    indexed_save(lift_head(attack_eye), "reconstructed-dragon-eye-attack.png")
    attack_pose = head.copy()
    attack_pose.alpha_composite(attack_jaw)
    attack_pose.alpha_composite(attack_eye)
    attack_pose = strengthen_dragon_eye(attack_pose, hot=True)
    indexed_save(lift_head(attack_pose), "reconstructed-dragon-pose-attack.png")

    # The foreground coil terminates at the Wizard rune tower and travels behind
    # the complete reel cabinet. It remains visible below and outside the frame,
    # but can never obscure a playable symbol.
    export(
        body_source,
        "reconstructed-dragon-foreground-coil.png",
        ((0, 238, 479, 359),),
        ((164, 94, 479, 332),),
    )
    assert_transparent(
        "reconstructed-dragon-foreground-coil.png",
        (164, 94, 480, 333),
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
