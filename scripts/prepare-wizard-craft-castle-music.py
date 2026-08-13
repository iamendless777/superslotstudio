#!/usr/bin/env python3
"""Compose the original looping medieval 8-bit castle theme for WIZARD CRAFT."""

from __future__ import annotations

import json
import math
import random
import wave
from pathlib import Path


RATE = 44_100
BPM = 118
BEAT = 60 / BPM
BARS = 8
DURATION = BARS * 4 * BEAT
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art-src" / "wizard-craft" / "audio" / "music"
WAV = OUTPUT / "castle-duel-loop-v1.wav"
MANIFEST = OUTPUT / "music-v1.json"


NOTE = {
    "D2": 73.42, "E2b": 77.78, "F2": 87.31, "A2": 110.00, "B2b": 116.54,
    "D3": 146.83, "E3b": 155.56, "F3": 174.61, "G3": 196.00,
    "A3": 220.00, "B3b": 233.08, "C4": 261.63, "D4": 293.66,
    "E4b": 311.13, "F4": 349.23, "G4": 392.00, "A4": 440.00,
    "B4b": 466.16, "C5": 523.25, "D5": 587.33,
}


def add_note(buffer: list[float], start: float, duration: float, frequency: float, volume: float, voice: str) -> None:
    first = round(start * RATE)
    count = round(duration * RATE)
    for offset in range(count):
        index = first + offset
        if index >= len(buffer):
            break
        age = offset / RATE
        phase = (age * frequency) % 1
        attack = min(1.0, age / 0.008)
        release = min(1.0, max(0.0, (duration - age) / 0.055))
        shape = attack * release
        if voice == "organ":
            raw = (1 if phase < 0.37 else -1) * 0.78
            raw += (1 if (phase * 2) % 1 < 0.24 else -1) * 0.14
        elif voice == "lute":
            raw = (2 * abs(2 * phase - 1) - 1) * math.exp(-5.8 * age)
            raw += math.sin(math.tau * phase * 2) * 0.16 * math.exp(-9 * age)
        elif voice == "bass":
            raw = (4 * abs(phase - 0.5) - 1) * 0.88
            raw += math.sin(math.tau * phase) * 0.18
        else:
            raw = math.sin(math.tau * phase)
        buffer[index] += raw * shape * volume


def add_drum(buffer: list[float], start: float, kind: str, seed: int) -> None:
    rng = random.Random(seed)
    duration = 0.12 if kind == "kick" else 0.075
    first = round(start * RATE)
    for offset in range(round(duration * RATE)):
        index = first + offset
        if index >= len(buffer):
            break
        age = offset / RATE
        if kind == "kick":
            raw = math.sin(math.tau * (76 * age - 42 * age * age)) * math.exp(-26 * age)
        else:
            raw = rng.uniform(-1, 1) * math.exp(-42 * age)
        buffer[index] += raw * (0.12 if kind == "kick" else 0.055)


def main() -> None:
    samples = [0.0] * round(DURATION * RATE)

    progressions = [
        ("D2", ("D3", "F3", "A3")),
        ("E2b", ("E3b", "G3", "B3b")),
        ("D2", ("D3", "F3", "A3")),
        ("A2", ("A3", "C4", "E4b")),
        ("B2b", ("B3b", "D4", "F4")),
        ("E2b", ("E3b", "G3", "B3b")),
        ("A2", ("A3", "C4", "E4b")),
        ("D2", ("D3", "F3", "A3")),
    ]
    melody = [
        ("D4", "F4", "E4b", "D4", "A3", "D4", "F4", "A4"),
        ("G4", "F4", "E4b", "B3b", "G3", "B3b", "D4", "E4b"),
        ("F4", "A4", "G4", "F4", "D4", "F4", "A4", "C5"),
        ("B4b", "A4", "G4", "E4b", "A3", "C4", "E4b", "A4"),
        ("D5", "C5", "B4b", "F4", "D4", "F4", "B4b", "D5"),
        ("E4b", "G4", "B4b", "A4", "G4", "E4b", "D4", "B3b"),
        ("A4", "G4", "E4b", "C4", "A3", "C4", "E4b", "G4"),
        ("F4", "E4b", "D4", "A3", "D4", "F4", "E4b", "D4"),
    ]

    for bar, ((bass_name, chord), phrase) in enumerate(zip(progressions, melody)):
        bar_start = bar * 4 * BEAT
        for beat_index in range(4):
            add_note(samples, bar_start + beat_index * BEAT, BEAT * 0.72, NOTE[bass_name], 0.13, "bass")
            add_drum(samples, bar_start + beat_index * BEAT, "kick", 6000 + bar * 10 + beat_index)
            if beat_index in (1, 3):
                add_drum(samples, bar_start + beat_index * BEAT, "snare", 7000 + bar * 10 + beat_index)
        for step in range(8):
            start = bar_start + step * BEAT / 2
            chord_note = chord[step % 3]
            add_note(samples, start, BEAT * 0.42, NOTE[chord_note], 0.075, "lute")
            add_note(samples, start, BEAT * 0.43, NOTE[phrase[step]], 0.082, "organ")
        for chord_note in chord:
            add_note(samples, bar_start, 4 * BEAT - 0.04, NOTE[chord_note] / 2, 0.025, "organ")

    edge = round(0.012 * RATE)
    for index in range(edge):
        samples[index] *= index / edge
        samples[-1 - index] *= index / edge
    peak = max(abs(sample) for sample in samples) or 1
    samples = [sample * 0.44 / peak for sample in samples]

    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames = bytearray()
    for sample in samples:
        frames.extend(round(sample * 32_767).to_bytes(2, "little", signed=True))
    with wave.open(str(WAV), "wb") as wav:
        wav.setparams((1, 2, RATE, len(samples), "NONE", "not compressed"))
        wav.writeframes(frames)

    MANIFEST.write_text(json.dumps({
        "version": 1,
        "id": "music.castle-duel",
        "file": WAV.name,
        "title": "Castle Duel",
        "originalComposition": True,
        "inspirationBoundary": "Original medieval 8-bit fortress energy; no borrowed melody or arrangement.",
        "tempoBpm": BPM,
        "keyCenter": "D minor with Phrygian color",
        "bars": BARS,
        "durationMs": round(len(samples) / RATE * 1000),
        "sampleRate": RATE,
        "channels": 1,
        "peak": 0.44,
        "loop": True,
        "recommendedGameGain": 0.22,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {WAV.relative_to(ROOT)} ({DURATION:.2f}s seamless loop)")


if __name__ == "__main__":
    main()
