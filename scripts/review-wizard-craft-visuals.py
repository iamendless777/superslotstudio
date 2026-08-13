#!/usr/bin/env python3
"""Render the mandatory visual evidence set for WIZARD CRAFT art changes."""

from __future__ import annotations

import subprocess
import sys
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
RENDERER = ROOT / "scripts/render-wizard-craft-runtime-still.py"
REFERENCE = ROOT / "docs/design/wizard-craft-color-reference.png"
STATES = ("idle", "anticipation", "dragon-attack", "wizard-attack", "sticky", "maximum")
DUEL_STATES = ("clash", "dragon-impact", "wizard-impact")
DESIGN_SIZE = (640, 360)


def render(state: str, output: Path, compact: bool = False) -> None:
    command = [
        sys.executable,
        str(RENDERER),
        "--state",
        state,
        "--output",
        str(output),
    ]
    if compact:
        command.append("--compact")
    subprocess.run(command, cwd=ROOT, check=True)


def label(draw: ImageDraw.ImageDraw, x: int, y: int, value: str) -> None:
    draw.rectangle((x, y, x + 260, y + 24), fill=(8, 7, 19))
    draw.text((x + 7, y + 6), value, fill=(244, 189, 82))


def main() -> None:
    output = ROOT / "reports" / f"wizard-craft-visual-gate-{date.today().isoformat()}"
    output.mkdir(parents=True, exist_ok=True)

    for index, state in enumerate(STATES, start=1):
        render(state, output / f"{index:02d}-{state}.png")
    render("idle", output / "07-compact-idle.png", compact=True)
    render("sticky", output / "16-compact-sticky.png", compact=True)
    render("dragon-attack", output / "17-compact-dragon-attack.png", compact=True)
    render("wizard-attack", output / "18-compact-wizard-attack.png", compact=True)
    for index, state in enumerate(DUEL_STATES, start=10):
        render(state, output / f"{index:02d}-{state}.png")
    render("multi-vs-win", output / "14-multi-vs-win.png")

    current = Image.open(output / "01-idle.png").convert("RGB")
    reference = ImageOps.fit(
        Image.open(REFERENCE).convert("RGB"),
        DESIGN_SIZE,
        Image.Resampling.LANCZOS,
    )
    comparison = Image.new("RGB", (1280, 390), (8, 7, 19))
    comparison.paste(reference, (0, 0))
    comparison.paste(current, (640, 0))
    comparison_draw = ImageDraw.Draw(comparison)
    label(comparison_draw, 0, 360, "APPROVED REFERENCE")
    label(comparison_draw, 640, 360, "CURRENT RUNTIME")
    comparison.save(output / "00-approved-vs-current.png")

    sheet = Image.new("RGB", (1280, 1170), (8, 7, 19))
    sheet_draw = ImageDraw.Draw(sheet)
    for index, state in enumerate(STATES):
        frame = Image.open(output / f"{index + 1:02d}-{state}.png").convert("RGB")
        x = (index % 2) * 640
        y = (index // 2) * 390
        sheet.paste(frame, (x, y))
        label(sheet_draw, x, y + 360, state.upper())
    sheet.save(output / "08-state-contact-sheet.png")

    closeups = (
        ("dragon-face", (55, 105, 210, 260)),
        ("right-depth", (420, 95, 640, 360)),
        ("wizard", (500, 35, 640, 210)),
        ("reels", (155, 88, 475, 345)),
    )
    closeup_sheet = Image.new("RGB", (880, 620), (8, 7, 19))
    closeup_draw = ImageDraw.Draw(closeup_sheet)
    for index, (name, bounds) in enumerate(closeups):
        crop = current.crop(bounds)
        crop = ImageOps.contain(crop, (440, 285), Image.Resampling.NEAREST)
        x = (index % 2) * 440
        y = (index // 2) * 310
        closeup_sheet.paste(crop, (x, y))
        label(closeup_draw, x, y + 285, name.upper())
    closeup_sheet.save(output / "09-critical-closeups.png")

    duel_sheet = Image.new("RGB", (1920, 390), (8, 7, 19))
    duel_draw = ImageDraw.Draw(duel_sheet)
    for index, state in enumerate(DUEL_STATES):
        frame = Image.open(output / f"{index + 10:02d}-{state}.png").convert("RGB")
        x = index * 640
        duel_sheet.paste(frame, (x, 0))
        label(duel_draw, x, 360, state.upper())
    duel_sheet.save(output / "13-duel-resolution-sheet.png")

    mechanic_sheet = Image.new("RGB", (1280, 390), (8, 7, 19))
    mechanic_draw = ImageDraw.Draw(mechanic_sheet)
    mechanic_sheet.paste(Image.open(output / "05-sticky.png").convert("RGB"), (0, 0))
    mechanic_sheet.paste(Image.open(output / "14-multi-vs-win.png").convert("RGB"), (640, 0))
    label(mechanic_draw, 0, 360, "FIVE ACTIVE VS REELS")
    label(mechanic_draw, 640, 360, "THREE-REEL VS WAY WIN")
    mechanic_sheet.save(output / "15-vs-mechanic-sheet.png")

    compact_sheet = Image.new("RGB", (640, 420), (8, 7, 19))
    compact_draw = ImageDraw.Draw(compact_sheet)
    for index, (filename, name) in enumerate((
        ("07-compact-idle.png", "COMPACT IDLE"),
        ("16-compact-sticky.png", "COMPACT STICKY"),
        ("17-compact-dragon-attack.png", "COMPACT DRAGON ATTACK"),
        ("18-compact-wizard-attack.png", "COMPACT WIZARD ATTACK"),
    )):
        frame = Image.open(output / filename).convert("RGB")
        x = (index % 2) * 320
        y = (index // 2) * 210
        compact_sheet.paste(frame, (x, y))
        label(compact_draw, x, y + 180, name)
    compact_sheet.save(output / "19-compact-state-sheet.png")
    print(output)


if __name__ == "__main__":
    main()
