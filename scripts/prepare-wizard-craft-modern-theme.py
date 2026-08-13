#!/usr/bin/env python3
"""Compose the modern hybrid WIZARD CRAFT theme with restrained pixel-star motifs."""

from __future__ import annotations

import json
import math
import random
import wave
from pathlib import Path


RATE = 48_000
BPM = 112
BEAT = 60 / BPM
BARS = 12
DURATION = BARS * 4 * BEAT
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art-src" / "wizard-craft" / "audio" / "music"
WAV = OUTPUT / "wizard-craft-hybrid-loop-v2.wav"
MANIFEST = OUTPUT / "music-v2.json"

FREQUENCY = {
    "D1": 36.71, "E1b": 38.89, "F1": 43.65, "G1": 49.00, "A1": 55.00, "B1b": 58.27,
    "D2": 73.42, "E2b": 77.78, "F2": 87.31, "G2": 98.00, "A2": 110.00, "B2b": 116.54, "C3": 130.81,
    "D3": 146.83, "E3b": 155.56, "F3": 174.61, "G3": 196.00, "A3": 220.00, "B3b": 233.08, "C4": 261.63,
    "D4": 293.66, "E4b": 311.13, "F4": 349.23, "G4": 392.00, "A4": 440.00, "B4b": 466.16, "C5": 523.25,
    "D5": 587.33, "E5b": 622.25, "F5": 698.46, "G5": 783.99, "A5": 880.00, "C6": 1046.50, "D6": 1174.66,
}


def pan_gains(pan: float) -> tuple[float, float]:
    angle = (pan + 1) * math.pi / 4
    return math.cos(angle), math.sin(angle)


def add_voice(
    left: list[float],
    right: list[float],
    start: float,
    duration: float,
    frequency: float,
    volume: float,
    voice: str,
    pan: float = 0,
) -> None:
    first = round(start * RATE)
    count = min(round(duration * RATE), len(left) - first)
    left_gain, right_gain = pan_gains(pan)
    for offset in range(max(0, count)):
        age = offset / RATE
        phase = (frequency * age) % 1
        release = min(1.0, max(0.0, (duration - age) / (0.14 if voice == "strings" else 0.07)))
        if voice == "strings":
            attack = min(1.0, age / 0.22)
            detuned = ((frequency * 1.006 * age) % 1)
            raw = (2 * phase - 1) * 0.34 + (2 * detuned - 1) * 0.28
            raw += math.sin(math.tau * phase) * 0.42
            movement = 0.91 + 0.09 * math.sin(math.tau * 0.42 * age)
        elif voice == "brass":
            attack = min(1.0, age / 0.055)
            raw = math.sin(math.tau * phase) + 0.31 * math.sin(math.tau * phase * 2)
            raw += 0.13 * math.sin(math.tau * phase * 3)
            movement = 1
        elif voice == "sub":
            attack = min(1.0, age / 0.025)
            raw = math.sin(math.tau * phase) + 0.16 * math.sin(math.tau * phase * 2)
            movement = 1
        elif voice == "pixel":
            attack = min(1.0, age / 0.003)
            raw = (1 if phase < 0.18 else -0.62) * math.exp(-5.3 * age)
            raw += math.sin(math.tau * phase * 2) * 0.18 * math.exp(-7.5 * age)
            movement = 1
        else:
            attack = min(1.0, age / 0.012)
            raw = math.sin(math.tau * phase)
            movement = 1
        sample = raw * attack * release * movement * volume
        index = first + offset
        left[index] += sample * left_gain
        right[index] += sample * right_gain


def add_percussion(
    left: list[float],
    right: list[float],
    start: float,
    kind: str,
    seed: int,
    strength: float = 1,
) -> None:
    rng = random.Random(seed)
    duration = {"impact": 0.45, "tom": 0.30, "tick": 0.07}[kind]
    first = round(start * RATE)
    for offset in range(min(round(duration * RATE), len(left) - first)):
        age = offset / RATE
        if kind == "impact":
            raw = math.sin(math.tau * (61 * age - 34 * age * age)) * math.exp(-10 * age)
            raw += rng.uniform(-1, 1) * 0.28 * math.exp(-22 * age)
            volume = 0.24
        elif kind == "tom":
            raw = math.sin(math.tau * (93 * age - 45 * age * age)) * math.exp(-15 * age)
            volume = 0.15
        else:
            raw = rng.uniform(-1, 1) * math.exp(-55 * age)
            volume = 0.045
        sample = raw * volume * strength
        left[first + offset] += sample * 0.72
        right[first + offset] += sample * 0.72


def add_atmosphere(left: list[float], right: list[float]) -> None:
    rng = random.Random(98231)
    slow_left = 0.0
    slow_right = 0.0
    for index in range(len(left)):
        slow_left = slow_left * 0.996 + rng.uniform(-1, 1) * 0.004
        slow_right = slow_right * 0.996 + rng.uniform(-1, 1) * 0.004
        motion = 0.5 + 0.5 * math.sin(math.tau * index / RATE / DURATION)
        left[index] += slow_left * 0.018 * (0.65 + 0.35 * motion)
        right[index] += slow_right * 0.018 * (1 - 0.35 * motion)


def main() -> None:
    frame_count = round(DURATION * RATE)
    left = [0.0] * frame_count
    right = [0.0] * frame_count
    progression = [
        ("D1", ("D3", "F3", "A3")), ("D1", ("D3", "F3", "A3")),
        ("B1b", ("B2b", "D3", "F3")), ("E1b", ("E3b", "G3", "B3b")),
        ("D1", ("D3", "F3", "A3")), ("G1", ("G2", "B2b", "D3")),
        ("E1b", ("E3b", "G3", "B3b")), ("A1", ("A2", "C3", "E3b")),
        ("B1b", ("B2b", "D3", "F3")), ("F1", ("F2", "A2", "C3")),
        ("E1b", ("E3b", "G3", "B3b")), ("D1", ("D3", "F3", "A3")),
    ]
    star_phrases = {
        1: ("D5", "A5", "F5"),
        3: ("E5b", "B4b", "G5"),
        6: ("G5", "D6", "B4b"),
        8: ("F5", "C6", "A5"),
        10: ("E5b", "A5", "D6"),
        11: ("A5", "F5", "D5"),
    }

    add_atmosphere(left, right)
    for bar, (bass, chord) in enumerate(progression):
        start = bar * 4 * BEAT
        intensity = 0.72 if bar < 4 else 0.9 if bar < 8 else 1.0
        add_voice(left, right, start, 4 * BEAT - 0.03, FREQUENCY[bass], 0.16 * intensity, "sub")
        for note_index, chord_note in enumerate(chord):
            pan = (-0.38, 0.08, 0.38)[note_index]
            add_voice(left, right, start, 4 * BEAT - 0.04, FREQUENCY[chord_note], 0.052 * intensity, "strings", pan)
        add_percussion(left, right, start, "impact", 8100 + bar, 0.75 if bar % 4 else 1.15)
        for beat_index in (1, 2, 3):
            add_percussion(left, right, start + beat_index * BEAT, "tom", 8200 + bar * 4 + beat_index, 0.55 + 0.1 * intensity)
        for eighth in range(8):
            if eighth % 2:
                add_percussion(left, right, start + eighth * BEAT / 2, "tick", 8300 + bar * 8 + eighth)
        if bar in (3, 7, 10):
            root = chord[0]
            fifth = chord[2]
            add_voice(left, right, start + 2 * BEAT, 2 * BEAT - 0.05, FREQUENCY[root] * 2, 0.075, "brass", -0.18)
            add_voice(left, right, start + 2 * BEAT, 2 * BEAT - 0.05, FREQUENCY[fifth] * 2, 0.062, "brass", 0.18)
        phrase = star_phrases.get(bar)
        if phrase:
            for index, pitch in enumerate(phrase):
                sparkle_start = start + (1.5 + index * 0.5) * BEAT
                pan = (-0.52, 0.38, -0.08)[index]
                add_voice(left, right, sparkle_start, BEAT * 0.42, FREQUENCY[pitch], 0.073, "pixel", pan)
                add_voice(left, right, sparkle_start + 0.032, BEAT * 0.34, FREQUENCY[pitch] * 2, 0.019, "sine", -pan)

    edge = round(0.025 * RATE)
    for index in range(edge):
        gain = index / edge
        left[index] *= gain
        right[index] *= gain
        left[-1 - index] *= gain
        right[-1 - index] *= gain
    peak = max(max(abs(sample) for sample in left), max(abs(sample) for sample in right)) or 1
    gain = 0.52 / peak

    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames = bytearray()
    for sample_left, sample_right in zip(left, right):
        frames.extend(round(sample_left * gain * 32_767).to_bytes(2, "little", signed=True))
        frames.extend(round(sample_right * gain * 32_767).to_bytes(2, "little", signed=True))
    with wave.open(str(WAV), "wb") as wav:
        wav.setparams((2, 2, RATE, frame_count, "NONE", "not compressed"))
        wav.writeframes(frames)

    MANIFEST.write_text(json.dumps({
        "version": 2,
        "id": "music.wizard-craft-hybrid",
        "file": WAV.name,
        "title": "Wizard Craft — Modern Castle Duel",
        "status": "production-direction candidate",
        "originalComposition": True,
        "tempoBpm": BPM,
        "keyCenter": "D minor with Phrygian color",
        "bars": BARS,
        "durationMs": round(frame_count / RATE * 1000),
        "sampleRate": RATE,
        "channels": 2,
        "peak": 0.52,
        "loop": True,
        "recommendedGameGain": 0.18,
        "layers": [
            "cinematic low strings", "restrained brass", "hybrid castle percussion",
            "sub foundation", "magical atmosphere", "rare pixel-star keyboard",
        ],
        "pixelStarBars": sorted(star_phrases),
        "designRule": "Modern dramatic foundation; pixel keyboard is a nostalgic accent, never the whole production.",
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {WAV.relative_to(ROOT)} ({DURATION:.2f}s stereo hybrid loop)")


if __name__ == "__main__":
    main()
