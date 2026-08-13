#!/usr/bin/env python3
"""Build transparent frame sequences and review GIFs for bonus-tier reveals."""

import json
from pathlib import Path

from PIL import Image, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "art-src/wizard-craft/effects/bonus-tier-reveals"
FRAME_COUNT = 8
LAYER_NAMES = ("core-cyan", "counter-violet", "flare-highlights", "particle-field")
FRAME_DURATIONS = {
    1: [90, 90, 100, 110, 160, 190, 190, 240],
    2: [90, 90, 110, 120, 150, 180, 210, 300],
    3: [100, 110, 120, 140, 170, 210, 260, 380],
}


def opacity(image: Image.Image, amount: float) -> Image.Image:
    result = image.copy()
    result.putalpha(ImageEnhance.Brightness(result.getchannel("A")).enhance(amount))
    return result


def vertical_reveal(image: Image.Image, amount: float) -> Image.Image:
    result = Image.new("RGBA", image.size)
    cutoff = round(image.height * max(0.0, min(1.0, amount)))
    if cutoff:
        result.alpha_composite(image.crop((0, 0, image.width, cutoff)), (0, 0))
    return result


def flare_stage(image: Image.Image, tier: int, frame_index: int) -> Image.Image:
    if tier != 3:
        amounts = (0, 0, 0.25, 0.85, 1, 0.45, 0.7, 0.5)
        return opacity(image, amounts[frame_index])

    # Tier 3 confirms in three beats: crown, opposing sides, then foundation.
    result = Image.new("RGBA", image.size)
    width, height = image.size
    regions = (
        (0, 0, width, round(height * 0.31)),
        (0, round(height * 0.21), width, round(height * 0.73)),
        (0, round(height * 0.67), width, height),
    )
    strengths = (
        (0, 0, 0.8, 1, 0.65, 0.75, 0.65, 0.55),
        (0, 0, 0, 0.8, 1, 0.7, 0.8, 0.6),
        (0, 0, 0, 0, 0.9, 1, 0.85, 0.65),
    )
    for region, stage_strength in zip(regions, strengths):
        fragment = opacity(image.crop(region), stage_strength[frame_index])
        result.alpha_composite(fragment, (region[0], region[1]))
    return result


def build_frame(tier: int, frame_index: int, layers: dict[str, Image.Image]) -> Image.Image:
    frame = Image.new("RGBA", layers["core-cyan"].size)
    if tier == 1:
        core_strength = (0, 0.32, 0.62, 0.9, 1, 0.92, 1, 0.96)
        violet_strength = (0, 0, 0.12, 0.3, 0.52, 0.42, 0.56, 0.46)
        particle_strength = (0, 0, 0.2, 0.45, 0.7, 0.5, 0.65, 0.45)
        core = vertical_reveal(
            opacity(layers["core-cyan"], core_strength[frame_index]),
            min(1, frame_index / 4),
        )
    elif tier == 2:
        core_strength = (0, 0.35, 0.8, 0.5, 1, 0.72, 1, 0.88)
        violet_strength = (0, 0, 0.3, 0.85, 0.55, 1, 0.76, 0.9)
        particle_strength = (0, 0.1, 0.3, 0.55, 0.45, 0.8, 0.6, 0.55)
        core = opacity(layers["core-cyan"], core_strength[frame_index])
    else:
        core_strength = (0, 0.2, 0.48, 0.72, 0.9, 1, 0.94, 1)
        violet_strength = (0, 0, 0.15, 0.42, 0.7, 0.9, 1, 0.92)
        particle_strength = (0, 0, 0.12, 0.3, 0.5, 0.75, 0.9, 0.7)
        core = vertical_reveal(
            opacity(layers["core-cyan"], core_strength[frame_index]),
            min(1, frame_index / 5),
        )

    frame.alpha_composite(core)
    frame.alpha_composite(opacity(layers["counter-violet"], violet_strength[frame_index]))
    frame.alpha_composite(flare_stage(layers["flare-highlights"], tier, frame_index))
    frame.alpha_composite(opacity(layers["particle-field"], particle_strength[frame_index]))
    return frame


def review_frame(frame: Image.Image, wizard: Image.Image | None) -> Image.Image:
    panel = Image.new("RGBA", frame.size, (9, 14, 31, 255))
    panel.alpha_composite(frame)
    if wizard is not None:
        character = wizard.copy()
        character.thumbnail((310, 310), Image.Resampling.NEAREST)
        panel.alpha_composite(
            character,
            ((panel.width - character.width) // 2, round(panel.height * 0.39)),
        )
    panel.thumbnail((512, 512), Image.Resampling.NEAREST)
    return panel.convert("P", palette=Image.Palette.ADAPTIVE)


def main() -> None:
    wizard_path = ROOT / "tmp/imagegen/wizard-bonus-entry-alpha-v1.png"
    wizard = Image.open(wizard_path).convert("RGBA") if wizard_path.exists() else None
    runtime_assets = []

    for tier in (1, 2, 3):
        layer_dir = ASSET_DIR / f"tier-{tier}-layers"
        layers = {
            name: Image.open(layer_dir / f"{name}.png").convert("RGBA")
            for name in LAYER_NAMES
        }
        sequence_dir = ASSET_DIR / f"tier-{tier}-sequence-v1"
        sequence_dir.mkdir(parents=True, exist_ok=True)
        frames = []
        for index in range(FRAME_COUNT):
            frame = build_frame(tier, index, layers)
            frame_path = sequence_dir / f"frame-{index:02d}.png"
            frame.save(frame_path)
            runtime_assets.append({
                "id": f"effects.tier.{tier}.frame.{index:02d}",
                "kind": "image",
                "source": frame_path.relative_to(ROOT).as_posix(),
            })
            frames.append(frame)

        sheet = Image.new(
            "RGBA", (frames[0].width * 4, frames[0].height * 2), (0, 0, 0, 0)
        )
        for index, frame in enumerate(frames):
            sheet.alpha_composite(
                frame,
                ((index % 4) * frame.width, (index // 4) * frame.height),
            )
        sheet.save(sequence_dir / f"tier-{tier}-reveal-spritesheet-v1.png")

        previews = [review_frame(frame, wizard) for frame in frames]
        previews[0].save(
            sequence_dir / f"tier-{tier}-reveal-preview-v1.gif",
            save_all=True,
            append_images=previews[1:] + list(reversed(previews[2:7])),
            duration=FRAME_DURATIONS[tier] + list(reversed(FRAME_DURATIONS[tier][2:7])),
            loop=0,
            disposal=2,
        )

    (ASSET_DIR / "runtime-frame-map-v1.json").write_text(
        json.dumps(
            {
                "version": 1,
                "assets": runtime_assets,
                "handoff": {
                    "revealEvent": "freeSpinTrigger",
                    "settledFrame": 7,
                    "settledAlpha": 0.28,
                    "firstReelEvent": "startDuel -> reveal",
                },
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
