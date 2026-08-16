#!/usr/bin/env python3
"""Convert a generated magenta-matte PNG to a straight-alpha PNG.

The image is read from stdin and written to stdout so no temporary source files
or runtime chroma-key step are needed.
"""

import io
import math
import sys

from PIL import Image


MATTE = (255, 0, 255)
TRANSPARENT_DISTANCE = 28.0
OPAQUE_DISTANCE = 104.0


def clamp(value):
    return max(0, min(255, int(round(value))))


def remove_matte(source):
    image = Image.open(io.BytesIO(source)).convert("RGBA")
    output = []
    for red, green, blue, _ in image.getdata():
        distance = math.sqrt((red - MATTE[0]) ** 2 + green ** 2 + (blue - MATTE[2]) ** 2)
        alpha = clamp(255 * (distance - TRANSPARENT_DISTANCE) / (OPAQUE_DISTANCE - TRANSPARENT_DISTANCE))
        if alpha <= 0:
            output.append((0, 0, 0, 0))
            continue
        if alpha >= 255:
            output.append((red, green, blue, 255))
            continue
        fraction = alpha / 255
        # Undo the matte composite on antialiased edge pixels to prevent a
        # magenta fringe when the asset is later placed over the game.
        clean_red = (red - MATTE[0] * (1 - fraction)) / fraction
        clean_green = green / fraction
        clean_blue = (blue - MATTE[2] * (1 - fraction)) / fraction
        output.append((clamp(clean_red), clamp(clean_green), clamp(clean_blue), alpha))
    image.putdata(output)
    result = io.BytesIO()
    image.save(result, format="PNG", optimize=True)
    return result.getvalue()


if __name__ == "__main__":
    try:
        sys.stdout.buffer.write(remove_matte(sys.stdin.buffer.read()))
    except Exception as error:
        print(f"Matte removal failed: {error}", file=sys.stderr)
        raise
