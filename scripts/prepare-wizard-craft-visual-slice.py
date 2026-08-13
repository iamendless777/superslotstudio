#!/usr/bin/env python3
"""Prepare approved review artwork for the genuine WIZARD CRAFT visual slice."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "art-src"
    / "wizard-craft"
    / "wizard"
    / "wizard-costume-correction-review-v2.png"
)
OUTPUT = (
    ROOT
    / "art-src"
    / "wizard-craft"
    / "wizard"
    / "corrected-idle-composite-v1.png"
)


def color_distance(left: tuple[int, ...], right: tuple[int, ...]) -> int:
    return sum(abs(left[index] - right[index]) for index in range(3))


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    # Exact approved Wizard panel, excluding the separate sleeve study.
    crop = source.crop((220, 55, 700, 830))
    pixels = crop.load()
    width, height = crop.size
    background = pixels[4, 4]
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if visited[index]:
            continue
        visited[index] = 1
        pixel = pixels[x, y]
        if color_distance(pixel, background) > 34:
            continue
        pixels[x, y] = (*pixel[:3], 0)
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    # Remove the clipped review caption; it is not part of the character.
    for y in range(min(18, height)):
        for x in range(min(120, width)):
            pixel = pixels[x, y]
            pixels[x, y] = (*pixel[:3], 0)

    alpha_box = crop.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError("Corrected Wizard extraction produced no visible pixels")
    extracted = crop.crop(alpha_box)
    extracted.save(OUTPUT)
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)} "
        f"{extracted.width}x{extracted.height} from approved costume review"
    )


if __name__ == "__main__":
    main()
