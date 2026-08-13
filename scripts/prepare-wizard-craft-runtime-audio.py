#!/usr/bin/env python3
"""Encode browser-delivery WIZARD CRAFT audio while retaining WAV masters."""

from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MUSIC = ROOT / "art-src" / "wizard-craft" / "audio" / "music"
SOURCE = MUSIC / "wizard-craft-hybrid-loop-v2.wav"
OUTPUT = MUSIC / "wizard-craft-hybrid-loop-runtime-v1.mp3"


def main() -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(SOURCE),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "192k",
            "-write_xing",
            "1",
            str(OUTPUT),
        ],
        check=True,
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
