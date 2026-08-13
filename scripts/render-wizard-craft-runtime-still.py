#!/usr/bin/env python3
"""Render a deterministic 640×360 WIZARD CRAFT production-asset review still."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art-src" / "wizard-craft"
DESIGN_SIZE = (640, 360)
REEL_RECT = (176, 104, 300, 220)


def layer(
    canvas: Image.Image,
    relative: str,
    rect: tuple[int, int, int, int],
    opacity: float = 1,
) -> None:
    image = Image.open(ART / relative).convert("RGBA")
    x, y, width, height = rect
    if image.size != (width, height):
        image = image.resize((width, height), Image.Resampling.NEAREST)
    if opacity != 1:
        alpha = image.getchannel("A").point(lambda value: round(value * opacity))
        image.putalpha(alpha)
    canvas.alpha_composite(image, (x, y))


def registered(
    canvas: Image.Image,
    relative: str,
    position: tuple[int, int] = (0, 0),
) -> None:
    image = Image.open(ART / relative).convert("RGBA")
    if image.size != DESIGN_SIZE:
        image = image.resize(DESIGN_SIZE, Image.Resampling.NEAREST)
    canvas.alpha_composite(image, position)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("/tmp/wizard-craft-runtime-still.png"),
    )
    parser.add_argument(
        "--state",
        choices=(
            "idle",
            "anticipation",
            "dragon-attack",
            "wizard-attack",
            "dragon-blocked",
            "wizard-blocked",
            "dragon-impact",
            "wizard-impact",
            "clash",
            "sticky",
            "multi-vs-win",
            "tier3",
            "maximum",
        ),
        default="idle",
    )
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--wizard-candidate", action="store_true")
    args = parser.parse_args()
    energized = args.state != "idle"

    canvas = Image.new("RGBA", DESIGN_SIZE)
    layer(canvas, "runtime/environment-sky.png", (0, 0, 640, 360))
    layer(canvas, "runtime/environment-castle.png", (0, 0, 640, 360))
    layer(canvas, "runtime/environment-fog.png", (0, 286, 640, 74))

    # Cabinet channel: the tail wraps over the cabinet structure, then the
    # foreground staircase occludes it.
    registered(canvas, "runtime/registered-cabinet-lintel.png")
    registered(canvas, "runtime/registered-cabinet-title.png")
    registered(canvas, "runtime/registered-cabinet-pillar-dragon.png")
    registered(canvas, "native-master-v1/dragon-rear-tail-registered-v1.png")
    registered(canvas, "runtime/registered-cabinet-pillar-wizard.png")
    registered(canvas, "runtime/approved-wizard-platform-v1.png")
    layer(
        canvas,
        "runtime/registered-cabinet-runes-dragon.png",
        (0, 0, 640, 360),
        1 if energized else 0.34,
    )
    layer(
        canvas,
        "runtime/registered-cabinet-runes-wizard.png",
        (0, 0, 640, 360),
        1 if energized else 0.34,
    )
    registered(canvas, "runtime/registered-cabinet-sill.png")
    active_crest = args.state in ("clash", "sticky", "tier3", "maximum")
    registered(
        canvas,
        "cabinet/clash-crest-active-runtime-v1.png"
        if active_crest
        else "cabinet/clash-crest-base-runtime-v1.png",
    )

    # The coherent production plate supersedes the legacy crop assembly above.
    # Keeping the old calls in this diagnostic script preserves a comparison
    # path, while this reset guarantees the rendered evidence matches runtime.
    canvas = Image.open(
        ART / "master/wizard-craft-clean-idle-base-runtime-v3.png"
    ).convert("RGBA")

    # Reel channel.
    reel_x, reel_y, reel_width, reel_height = REEL_RECT
    layer(
        canvas,
        "runtime/reel-backing.png",
        (reel_x, reel_y, reel_width, reel_height),
    )
    board = (
        ("dragon-wild/approved-native-68x51-v1.png", "ember/approved-native-68x51-v1.png",
         "potion/approved-native-68x51-v1.png", "scroll/approved-native-68x51-v1.png"),
        ("staff/approved-native-68x51-v1.png", "duel-coin/approved-native-68x51-v1.png",
         "crystal/approved-native-68x51-v1.png", "grimoire/approved-native-68x51-v1.png"),
        ("dragon-egg/approved-native-68x51-v1.png", "wizard-wild/approved-native-68x51-v1.png",
         "ember/approved-native-68x51-v1.png", "potion/approved-native-68x51-v1.png"),
        ("scroll/approved-native-68x51-v1.png", "dragon-wild/approved-native-68x51-v1.png",
         "duel-coin/approved-native-68x51-v1.png", "staff/approved-native-68x51-v1.png"),
        ("wizard-wild/approved-native-68x51-v1.png", "crystal/approved-native-68x51-v1.png",
         "grimoire/approved-native-68x51-v1.png", "dragon-egg/approved-native-68x51-v1.png"),
    )
    cell_width = reel_width / 5
    cell_height = reel_height / 4
    for reel, symbols in enumerate(board):
        for row, filename in enumerate(symbols):
            x0 = round(reel_x + reel * cell_width)
            x1 = round(reel_x + (reel + 1) * cell_width)
            y0 = round(reel_y + row * cell_height)
            y1 = round(reel_y + (row + 1) * cell_height)
            layer(
                canvas,
                f"symbols/{filename}",
                (x0, y0, x1 - x0, y1 - y0),
            )
    layer(
        canvas,
        "runtime/reel-dividers.png",
        (reel_x, reel_y, reel_width, reel_height),
    )
    if args.state in ("sticky", "multi-vs-win"):
        overlay_states = (
            ("dragon", True),
            ("dragon", True),
            ("balanced", False),
            ("wizard", True),
            ("wizard", True),
        )
        colors = {
            "dragon": (184, 48, 40),
            "wizard": (55, 154, 255),
            "balanced": (172, 91, 255),
        }
        frames = {
            "dragon": "vs-frame-dragon.png",
            "wizard": "vs-frame-wizard.png",
            "balanced": "vs-frame-balanced.png",
        }
        tint_layer = Image.new("RGBA", DESIGN_SIZE)
        draw = ImageDraw.Draw(tint_layer, "RGBA")
        for reel, (owner, sticky) in enumerate(overlay_states):
            x0 = round(reel_x + reel * cell_width)
            x1 = round(reel_x + (reel + 1) * cell_width)
            color = colors[owner]
            draw.rectangle(
                (x0 + 2, reel_y + 2, x1 - 2, reel_y + reel_height - 2),
                fill=(*color, 46 if sticky else 28),
                outline=(*color, 219),
                width=3 if sticky else 2,
            )
        canvas.alpha_composite(tint_layer)
        for reel, (owner, sticky) in enumerate(overlay_states):
            x0 = round(reel_x + reel * cell_width)
            x1 = round(reel_x + (reel + 1) * cell_width)
            layer(
                canvas,
                f"runtime/{frames[owner]}",
                (x0, reel_y, x1 - x0, reel_height),
                1 if args.state == "multi-vs-win" and reel in (0, 2, 4)
                else 0.82 if sticky else 0.72,
            )
            layer(
                canvas,
                "runtime/vs-sticky.png"
                if sticky
                else "runtime/vs-temporary.png",
                (x0, reel_y, x1 - x0, reel_height),
                0.84 if sticky else 0.72,
            )

    # Character bodies are embedded in the coherent plate. Only registered
    # effects and future clean motion overlays may render above this point.
    layer(
        canvas,
        "native-master-v1/wizard-eyes-v3-registered.png",
        (0, 0, 640, 360),
    )
    if args.state == "anticipation":
        layer(
            canvas,
            "native-master-v1/dragon-eye-anticipation-v3-registered.png",
            (0, 0, 640, 360),
        )
    elif args.state == "dragon-attack":
        layer(
            canvas,
            "native-master-v1/dragon-eye-attack-v3-registered.png",
            (0, 0, 640, 360),
        )

    # Exact persistent/settled effect geometry used by the runtime.
    if args.state == "dragon-attack":
        target_x = round(reel_x + 3.5 * reel_width / 5)
        layer(
            canvas,
            "effects/dragon-fire-quick-runtime-v1.png",
            (155, 142, target_x - 155, 94),
        )
        layer(
            canvas,
            "effects/dragon-fire-heavy-runtime-v1.png",
            (155, 142, target_x - 155, 94),
        )
        layer(
            canvas,
            "effects/dragon-mouth-charge-runtime-v1.png",
            (148, 178, 28, 28),
        )
        layer(
            canvas,
            "effects/dragon-nostril-charge-runtime-v1.png",
            (151, 164, 18, 18),
        )
    elif args.state == "wizard-attack":
        layer(
            canvas,
            "native-master-v1/wizard-cast-v3-registered.png",
            (0, 0, 640, 360),
        )
        target_x = round(reel_x + 1.5 * reel_width / 5)
        for relative in (
            "effects/wizard-magic-bolt-diagonal-runtime-v1.png",
            "effects/wizard-magic-bolt-diagonal-runtime-v1.png",
        ):
            layer(canvas, relative, (target_x, 70, 598 - target_x, 150))
    elif args.state in ("dragon-blocked", "wizard-blocked"):
        target_reel = 4 if args.state == "dragon-blocked" else 0
        impact_x = round(reel_x + (target_reel + 0.5) * reel_width / 5 - 36)
        if args.state == "dragon-blocked":
            layer(canvas, "effects/wizard-ward-runtime-v1.png",
                  (impact_x, 176, 72, 72))
        else:
            layer(canvas, "effects/dragon-firewall-runtime-v1.png",
                  (impact_x + 10, 164, 52, 96))
    elif args.state in ("dragon-impact", "wizard-impact"):
        target_reel = 1 if args.state == "dragon-impact" else 3
        impact_x = round(reel_x + (target_reel + 0.5) * reel_width / 5 - 36)
        layer(
            canvas,
            "effects/clash-energy-core-runtime-v1.png",
            (impact_x, 176, 72, 72),
        )
        layer(
            canvas,
            "effects/clash-gold-ring-runtime-v1.png",
            (impact_x, 176, 72, 72),
            0.42,
        )
        if args.state == "dragon-impact":
            layer(canvas, "effects/dragon-firewall-runtime-v1.png",
                  (impact_x + 10, 164, 52, 96))
        else:
            layer(canvas, "effects/wizard-ward-runtime-v1.png",
                  (impact_x, 176, 72, 72))
    elif args.state == "clash":
        layer(
            canvas,
            "effects/clash-energy-core-candidate-v1.png",
            (277, 176, 72, 72),
        )
        layer(
            canvas,
            "effects/clash-gold-ring-candidate-v1.png",
            (277, 176, 72, 72),
            0.42,
        )
    elif args.state == "tier3":
        layer(
            canvas,
            "runtime/tier-reveals/tier-3-frame-07.png",
            (126, 48, 388, 280),
            0.06 if args.compact else 0.12,
        )
    elif args.state == "maximum":
        layer(
            canvas,
            "effects/clash-cap-flare-candidate-v1.png",
            (253, 152, 120, 120),
        )
    if args.state in ("sticky", "multi-vs-win"):
        badge_layer = Image.new("RGBA", DESIGN_SIZE)
        badge_draw = ImageDraw.Draw(badge_layer, "RGBA")
        font = ImageFont.load_default(size=14)
        for reel, ((owner, sticky), value) in enumerate(zip(
            overlay_states,
            (3, 5, 8, 12, 25),
        )):
            emphasized = args.state == "multi-vs-win" and reel in (0, 2, 4)
            scale = 1.08 if emphasized else 1
            badge_width = round(52 * scale)
            badge_height = round(24 * scale)
            x = round(reel_x + reel * cell_width) + 2 - (badge_width - 52) // 2
            y = reel_y + 3 - (badge_height - 24) // 2
            color = colors[owner]
            if sticky:
                points = (
                    (x + 5, y),
                    (x + badge_width - 5, y),
                    (x + badge_width, y + 5),
                    (x + badge_width - 2, y + badge_height - 6),
                    (x + badge_width - 7, y + badge_height),
                    (x + 7, y + badge_height),
                    (x + 2, y + badge_height - 6),
                    (x, y + 5),
                )
                badge_draw.polygon(points, fill=(7, 10, 17, 246))
                badge_draw.line(points + (points[0],), fill=(*color, 252), width=3)
                badge_draw.line(
                    ((x + 8, y + 4), (x + badge_width - 8, y + 4)),
                    fill=(*color, 210),
                    width=2,
                )
                badge_draw.line(
                    ((x + 8, y + badge_height - 4),
                     (x + badge_width - 8, y + badge_height - 4)),
                    fill=(*color, 210),
                    width=2,
                )
                badge_draw.line(
                    ((x + badge_width // 2 - 3, y + 1),
                     (x + badge_width // 2, y + 4),
                     (x + badge_width // 2 + 3, y + 1)),
                    fill=(240, 183, 66, 235),
                    width=1,
                )
            else:
                badge_draw.line(
                    ((x, y + 8), (x, y), (x + 16, y)),
                    fill=(*color, 242),
                    width=3,
                )
                badge_draw.line(
                    ((x + badge_width - 16, y), (x + badge_width, y),
                     (x + badge_width, y + 8)),
                    fill=(*color, 242),
                    width=3,
                )
            copy = f"{value}×"
            bounds = badge_draw.textbbox((0, 0), copy, font=font)
            badge_draw.text(
                (
                    x + (badge_width - (bounds[2] - bounds[0])) / 2,
                    y + (badge_height - (bounds[3] - bounds[1])) / 2 - bounds[1],
                ),
                copy,
                fill=(255, 247, 221, 255),
                font=font,
            )
        canvas.alpha_composite(badge_layer)
        if args.state == "multi-vs-win":
            message_layer = Image.new("RGBA", DESIGN_SIZE)
            message_draw = ImageDraw.Draw(message_layer, "RGBA")
            message_font = ImageFont.load_default(size=15)
            message = "VS WAY 3x + 8x + 25x = 36x"
            bounds = message_draw.textbbox((0, 0), message, font=message_font)
            message_width = bounds[2] - bounds[0]
            message_draw.rounded_rectangle(
                (320 - message_width / 2 - 8, 77, 320 + message_width / 2 + 8, 99),
                radius=4,
                fill=(8, 7, 19, 218),
                outline=(240, 183, 66, 205),
                width=1,
            )
            message_draw.text(
                (320 - message_width / 2, 80),
                message,
                fill=(255, 247, 221, 255),
                font=message_font,
            )
            canvas.alpha_composite(message_layer)

    if args.compact:
        # Review the same contain-scaled production canvas at a realistic
        # mini-player width instead of falsely labelling a 640×360 still.
        canvas = canvas.resize((320, 180), Image.Resampling.NEAREST)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output)
    print(args.output)


if __name__ == "__main__":
    main()
