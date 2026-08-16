#!/usr/bin/env python3
"""Deterministic, local visual QA for StakeStudio generated assets."""

import base64
import colorsys
import io
import json
import math
import re
import sys

from PIL import Image, ImageStat


TRANSPARENT_SLOTS = {"foreground", "symbol", "characterPose", "providerLogo"}
MAX_IMAGE_BYTES = 24 * 1024 * 1024


def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def rounded(value, digits=4):
    return round(float(value), digits)


def decode_image(value):
    match = re.match(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$", str(value or ""), re.I)
    if not match:
        raise ValueError("Image must be a PNG, JPEG, or WebP data URL.")
    raw = base64.b64decode(match.group(2), validate=True)
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("Image must be between 1 byte and 24 MB.")
    image = Image.open(io.BytesIO(raw))
    image.load()
    return image.convert("RGBA"), len(raw)


def parse_palette(value):
    source = " ".join(value) if isinstance(value, list) else str(value or "")
    return [tuple(int(code[index:index + 2], 16) for index in (1, 3, 5)) for code in re.findall(r"#[0-9a-fA-F]{6}", source)]


def image_data(image):
    flattened = getattr(image, "get_flattened_data", None)
    return flattened() if flattened else image.getdata()


def samples(image, size=64, alpha_floor=32):
    copy = image.copy()
    copy.thumbnail((size, size), Image.Resampling.LANCZOS)
    return [(r, g, b, a) for r, g, b, a in image_data(copy) if a >= alpha_floor]


def luminance(pixel):
    r, g, b = pixel[:3]
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def hsv_histogram(image):
    histogram = [0.0] * 128
    pixels = samples(image, 56, 48)
    if not pixels:
        return histogram
    for r, g, b, _ in pixels:
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        hi = min(7, int(h * 8))
        si = min(3, int(s * 4))
        vi = min(3, int(v * 4))
        histogram[hi * 16 + si * 4 + vi] += 1
    magnitude = math.sqrt(sum(value * value for value in histogram)) or 1.0
    return [value / magnitude for value in histogram]


def cosine(left, right):
    return clamp(sum(a * b for a, b in zip(left, right)))


def dominant_colors(image):
    copy = image.copy()
    copy.thumbnail((96, 96), Image.Resampling.LANCZOS)
    background = Image.new("RGBA", copy.size, (17, 21, 34, 255))
    background.alpha_composite(copy)
    quantized = background.convert("RGB").quantize(colors=5, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    result = []
    for count, index in sorted(quantized.getcolors() or [], reverse=True)[:5]:
        rgb = tuple(palette[index * 3:index * 3 + 3])
        result.append({"hex": "#%02X%02X%02X" % rgb, "share": rounded(count / max(1, quantized.width * quantized.height), 3)})
    return result


def check(checks, identifier, name, passed, severity, evidence, remedy):
    checks.append({
        "id": identifier,
        "name": name,
        "passed": bool(passed),
        "severity": severity,
        "evidence": evidence,
        "remedy": remedy,
    })


def analyze(payload):
    slot = str(payload.get("slot") or "")
    if slot not in {"background", "foreground", "symbol", "characterPose", "providerLogo"}:
        raise ValueError("Choose a supported visual slot before analysis.")
    image, byte_count = decode_image(payload.get("image"))
    width, height = image.size
    alpha = image.getchannel("A")
    alpha_values = list(image_data(alpha))
    total = max(1, len(alpha_values))
    visible = sum(value > 16 for value in alpha_values)
    opaque = sum(value >= 250 for value in alpha_values)
    partial = sum(16 < value < 250 for value in alpha_values)
    transparent_fraction = 1 - (visible / total)
    partial_fraction = partial / total
    bbox = alpha.point(lambda value: 255 if value > 16 else 0).getbbox()
    if bbox:
        left, top, right, bottom = bbox
        bbox_width = (right - left) / width
        bbox_height = (bottom - top) / height
        bbox_area = ((right - left) * (bottom - top)) / (width * height)
    else:
        left = top = right = bottom = 0
        bbox_width = bbox_height = bbox_area = 0.0

    border = []
    framing_border = []
    if width and height:
        alpha_pixels = alpha.load()
        top_edge = [alpha_pixels[x, 0] for x in range(width)]
        bottom_edge = [alpha_pixels[x, height - 1] for x in range(width)]
        side_edges = [alpha_pixels[0, y] for y in range(1, max(1, height - 1))]
        side_edges.extend(alpha_pixels[width - 1, y] for y in range(1, max(1, height - 1)))
        border.extend(top_edge)
        border.extend(bottom_edge)
        border.extend(side_edges)
        # Reel portraits and badges may intentionally terminate at the bottom of
        # their canvas. Top and side contact are the crop risks that matter.
        framing_border.extend(top_edge)
        if slot != "symbol":
            framing_border.extend(bottom_edge)
        framing_border.extend(side_edges)
    border_touch = sum(value > 16 for value in border) / max(1, len(border))
    framing_border_touch = sum(value > 16 for value in framing_border) / max(1, len(framing_border))

    center_box = (int(width * 0.25), int(height * 0.16), int(width * 0.75), int(height * 0.84))
    center_alpha = alpha.crop(center_box)
    center_values = list(image_data(center_alpha))
    center_coverage = sum(value > 16 for value in center_values) / max(1, len(center_values))

    opaque_samples = samples(image)
    lumas = [luminance(pixel) for pixel in opaque_samples]
    mean_luma = sum(lumas) / max(1, len(lumas))
    luma_std = math.sqrt(sum((value - mean_luma) ** 2 for value in lumas) / max(1, len(lumas)))

    semi_pixels = [(r, g, b) for r, g, b, a in samples(image, 128, 1) if 1 <= a < 250]
    magenta_spill = sum((((r + b) / 2) - g) > 42 and r > 120 and b > 120 for r, g, b in semi_pixels) / max(1, len(semi_pixels))

    palette = parse_palette(payload.get("palette"))
    if palette and opaque_samples:
        palette_distances = [min(math.dist((r, g, b), color) for color in palette) for r, g, b, _ in opaque_samples]
        palette_match = sum(distance <= 125 for distance in palette_distances) / len(palette_distances)
    else:
        palette_match = None

    reference_scores = []
    source_histogram = hsv_histogram(image)
    for reference in list(payload.get("references") or [])[:4]:
        try:
            reference_image, _ = decode_image(reference.get("src") if isinstance(reference, dict) else reference)
            reference_scores.append(cosine(source_histogram, hsv_histogram(reference_image)))
        except (ValueError, OSError, TypeError):
            continue
    reference_similarity = max(reference_scores) if reference_scores else None

    checks = []
    check(checks, "resolution", "Production resolution", width >= 512 and height >= 512, "blocker",
          f"{width}×{height}", "Regenerate at a supported production size of at least 512 px per edge.")
    check(checks, "payload", "Reasonable file payload", byte_count <= MAX_IMAGE_BYTES, "blocker",
          f"{byte_count / (1024 * 1024):.2f} MB", "Reduce the source file before it enters the project.")

    if slot in TRANSPARENT_SLOTS:
        check(checks, "alpha", "True transparent background", transparent_fraction >= 0.03, "blocker",
              f"{transparent_fraction * 100:.1f}% transparent", "Remove the background and preserve real PNG alpha.")
        check(checks, "subject", "Usable visible subject", visible / total >= 0.025, "blocker",
              f"{visible / total * 100:.1f}% visible pixels", "Regenerate with one complete, centered subject.")
        check(checks, "matte-fringe", "Clean alpha edge", magenta_spill <= 0.08, "blocker",
              f"{magenta_spill * 100:.1f}% magenta-biased semi-transparent samples", "Re-run matte cleanup or regenerate without glow touching the matte.")
    else:
        check(checks, "opaque-canvas", "Opaque finished canvas", opaque / total >= 0.985, "blocker",
              f"{opaque / total * 100:.1f}% opaque", "Regenerate the background as a fully opaque environment.")

    if slot in {"symbol", "providerLogo", "characterPose"}:
        minimum_height = 0.48 if slot == "characterPose" else 0.28
        maximum_area = {"symbol": 0.96, "characterPose": 0.92, "providerLogo": 0.84}[slot]
        framing_ok = bbox_height >= minimum_height and bbox_area <= maximum_area and framing_border_touch <= 0.18
        check(checks, "framing", "Safe crop and padding", framing_ok, "warning",
              f"bbox {bbox_width * 100:.0f}%×{bbox_height * 100:.0f}%, crop-risk edge contact {framing_border_touch * 100:.1f}%",
              "Center the complete silhouette with breathing room around every edge.")
    elif slot == "foreground":
        check(checks, "center-clearance", "Gameplay center remains clear", center_coverage <= 0.28, "blocker",
              f"{center_coverage * 100:.1f}% center obstruction", "Move ornament to the outside frame and keep the reel window unobstructed.")

    contrast_floor = {"background": 0.07, "foreground": 0.06, "symbol": 0.095}.get(slot, 0.08)
    check(checks, "thumbnail-contrast", "Readable thumbnail contrast", luma_std >= contrast_floor, "warning",
          f"luminance spread {luma_std:.3f}", "Increase separation between the main silhouette, internal forms, and surrounding space.")
    if slot == "background":
        center_rgb = image.crop(center_box).convert("RGB")
        center_std = (ImageStat.Stat(center_rgb.convert("L")).stddev[0] / 255.0) if center_rgb.width and center_rgb.height else 0
        check(checks, "reel-readability", "Calm central gameplay zone", center_std <= 0.245, "warning",
              f"center luminance spread {center_std:.3f}", "Reduce detail and hard contrast behind the reel window.")
    if palette:
        check(checks, "palette", "Art Bible palette relationship", palette_match >= 0.33, "warning",
              f"{palette_match * 100:.1f}% of sampled pixels near locked palette colors", "Bring key lights, shadows, and accents closer to the locked palette roles.")
    if reference_similarity is not None:
        check(checks, "reference-continuity", "Reference color/tonal continuity", reference_similarity >= 0.42, "warning",
              f"statistical similarity {reference_similarity:.3f}", "Rebalance palette and tonal mass toward the approved reference anchors.")

    blockers = [item for item in checks if not item["passed"] and item["severity"] == "blocker"]
    warnings = [item for item in checks if not item["passed"] and item["severity"] == "warning"]
    score = max(0, 100 - len(blockers) * 28 - len(warnings) * 7)
    passed = not blockers and score >= 70
    return {
        "format": "stake-studio-visual-analysis-v1",
        "slot": slot,
        "score": score,
        "passed": passed,
        "blockers": blockers,
        "warnings": warnings,
        "checks": checks,
        "metrics": {
            "width": width,
            "height": height,
            "bytes": byte_count,
            "transparentFraction": rounded(transparent_fraction),
            "partialAlphaFraction": rounded(partial_fraction),
            "visibleFraction": rounded(visible / total),
            "bboxWidthFraction": rounded(bbox_width),
            "bboxHeightFraction": rounded(bbox_height),
            "bboxAreaFraction": rounded(bbox_area),
            "borderTouchFraction": rounded(border_touch),
            "framingBorderTouchFraction": rounded(framing_border_touch),
            "centerCoverage": rounded(center_coverage),
            "luminanceMean": rounded(mean_luma),
            "luminanceStd": rounded(luma_std),
            "magentaSpillFraction": rounded(magenta_spill),
            "paletteMatch": None if palette_match is None else rounded(palette_match),
            "referenceSimilarity": None if reference_similarity is None else rounded(reference_similarity),
            "dominantColors": dominant_colors(image),
        },
    }


def main():
    try:
        if len(sys.argv) > 1:
            with open(sys.argv[1], "r", encoding="utf-8") as source:
                payload = json.load(source)
        else:
            payload = json.load(sys.stdin)
        print(json.dumps(analyze(payload), separators=(",", ":")))
    except Exception as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
