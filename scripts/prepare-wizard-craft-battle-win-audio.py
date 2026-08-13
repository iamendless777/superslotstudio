#!/usr/bin/env python3
"""Build deterministic battle and win sounds for WIZARD CRAFT."""

from __future__ import annotations

import json
import math
import random
import wave
from pathlib import Path


RATE = 44_100
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art-src" / "wizard-craft" / "audio" / "battle-win"
MANIFEST = OUTPUT.parent / "battle-win-cues-v1.json"


def envelope(t: float, duration: float, attack: float = 0.008, release: float = 0.12) -> float:
    return min(1.0, t / attack, max(0.0, (duration - t) / release))


def oscillator(frequency: float, age: float, decay: float = 8.0, harmonic: float = 0.16) -> float:
    if age < 0:
        return 0.0
    phase = math.tau * frequency * age
    return (math.sin(phase) + harmonic * math.sin(phase * 2.003)) * math.exp(-decay * age)


def note(t: float, start: float, frequency: float, decay: float = 8.0) -> float:
    return oscillator(frequency, t - start, decay)


def render(duration: float, voice, seed: int, peak: float) -> list[float]:
    rng = random.Random(seed)
    samples = [voice(i / RATE, duration, rng) for i in range(round(duration * RATE))]
    source_peak = max(abs(sample) for sample in samples) or 1.0
    return [max(-1.0, min(1.0, sample * peak / source_peak)) for sample in samples]


def write(filename: str, samples: list[float]) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames = bytearray()
    for sample in samples:
        frames.extend(round(sample * 32_767).to_bytes(2, "little", signed=True))
    with wave.open(str(OUTPUT / filename), "wb") as wav:
        wav.setparams((1, 2, RATE, len(samples), "NONE", "not compressed"))
        wav.writeframes(frames)


def dragon_inhale(t: float, duration: float, rng: random.Random) -> float:
    progress = t / duration
    chest = math.sin(math.tau * (58 * t + 20 * t * t)) * (0.2 + 0.8 * progress)
    air = rng.uniform(-1, 1) * (0.12 + 0.42 * progress)
    ember = math.sin(math.tau * 190 * t) * max(0, progress - 0.55)
    return envelope(t, duration, 0.035, 0.07) * (0.55 * chest + 0.31 * air + 0.14 * ember)


def dragon_fire(t: float, duration: float, rng: random.Random) -> float:
    roar = math.sin(math.tau * (74 * t - 12 * t * t)) * math.exp(-4 * t)
    flame = rng.uniform(-1, 1) * (0.7 * math.exp(-3 * t) + 0.15)
    crack = rng.uniform(-1, 1) * (0.3 if rng.random() < 0.035 else 0)
    return envelope(t, duration, 0.006, 0.11) * (0.42 * roar + 0.38 * flame + 0.20 * crack)


def wizard_charge(t: float, duration: float, rng: random.Random) -> float:
    progress = t / duration
    sweep = math.sin(math.tau * (330 * t + 390 * t * t)) * (0.25 + 0.75 * progress)
    glass = math.sin(math.tau * 880 * t) * progress * progress
    sparkle = rng.uniform(-1, 1) * 0.08 * progress
    return envelope(t, duration, 0.025, 0.08) * (0.58 * sweep + 0.26 * glass + sparkle)


def wizard_bolt(t: float, duration: float, rng: random.Random) -> float:
    snap = rng.uniform(-1, 1) * math.exp(-48 * t)
    bolt = math.sin(math.tau * (930 * t - 720 * t * t)) * math.exp(-7 * t)
    tail = math.sin(math.tau * 1470 * t) * math.exp(-15 * t)
    return envelope(t, duration, 0.002, 0.08) * (0.30 * snap + 0.54 * bolt + 0.16 * tail)


def clash_impact(t: float, duration: float, rng: random.Random) -> float:
    impact = oscillator(74, t, 13, 0.09)
    red = oscillator(220, t, 8)
    blue = oscillator(330, t, 8)
    debris = rng.uniform(-1, 1) * math.exp(-18 * t)
    return envelope(t, duration, 0.003, 0.14) * (0.42 * impact + 0.19 * red + 0.19 * blue + 0.20 * debris)


def clash_balanced(t: float, duration: float, rng: random.Random) -> float:
    pulse = oscillator(82, t, 9, 0.08)
    interval = oscillator(294, t, 5.5) + oscillator(440, t, 5.5)
    return envelope(t, duration, 0.006, 0.18) * (0.38 * pulse + 0.30 * interval)


def win_ways(t: float, duration: float, rng: random.Random) -> float:
    pings = sum(note(t, i * 0.055, frequency, 15) for i, frequency in enumerate((523, 659, 784)))
    return envelope(t, duration, 0.004, 0.10) * 0.52 * pings


def win_level(t: float, duration: float, rng: random.Random) -> float:
    rise = sum(note(t, i * 0.07, frequency, 7) for i, frequency in enumerate((392, 494, 587, 784)))
    low = note(t, 0.21, 98, 10)
    return envelope(t, duration, 0.006, 0.15) * (0.47 * rise + 0.28 * low)


def win_total(t: float, duration: float, rng: random.Random) -> float:
    ticks = sum(note(t, i * 0.06, 740 + 55 * i, 18) for i in range(5))
    settle = note(t, 0.30, 523, 10)
    return envelope(t, duration, 0.003, 0.11) * (0.42 * ticks + 0.34 * settle)


def win_final(t: float, duration: float, rng: random.Random) -> float:
    chord = note(t, 0, 262, 5.5) + note(t, 0, 330, 5.5) + note(t, 0, 392, 5.5)
    stamp = note(t, 0.12, 87, 13)
    return envelope(t, duration, 0.008, 0.18) * (0.30 * chord + 0.40 * stamp)


def win_max(t: float, duration: float, rng: random.Random) -> float:
    fanfare = sum(
        note(t, start, frequency, 3.2)
        for start, frequency in (
            (0.00, 262), (0.09, 330), (0.18, 392), (0.27, 523),
            (0.46, 392), (0.46, 494), (0.46, 659),
        )
    )
    foundation = oscillator(65.4, t, 2.8, 0.08)
    shimmer = rng.uniform(-1, 1) * 0.055 * envelope(t, duration, 0.20, 0.30)
    return envelope(t, duration, 0.012, 0.28) * (0.33 * fanfare + 0.31 * foundation + shimmer)


SOUNDS = [
    ("dragon.inhale", "dragon-inhale-v1.wav", "dragon", 0.42, dragon_inhale, 5001, 0.55, "Organic chest inhale building toward fire."),
    ("dragon.fire.launch", "dragon-fire-launch-v1.wav", "dragon", 0.38, dragon_fire, 5002, 0.56, "Short multicolored flame burst with ember crack."),
    ("wizard.charge", "wizard-charge-v1.wav", "wizard", 0.42, wizard_charge, 5101, 0.55, "Blue-white spell energy gathering at the staff."),
    ("wizard.bolt.launch", "wizard-bolt-launch-v1.wav", "wizard", 0.30, wizard_bolt, 5102, 0.56, "Fast clean magical bolt with a glassy tail."),
    ("clash.impact", "clash-impact-v1.wav", "clash", 0.46, clash_impact, 5201, 0.55, "Physical red-blue collision with magical debris."),
    ("clash.balanced", "clash-balanced-v1.wav", "clash", 0.52, clash_balanced, 5202, 0.54, "Stable dual-tone collision where neither side dominates."),
    ("win.ways", "win-ways-v1.wav", "reels", 0.28, win_ways, 5301, 0.50, "Brief three-ping ways highlight."),
    ("win.level", "win-level-v1.wav", "ui", 0.46, win_level, 5302, 0.53, "Compact rising win-level flourish."),
    ("win.total", "win-total-v1.wav", "ui", 0.47, win_total, 5303, 0.50, "Ordered count ticks resolving on the total."),
    ("win.final", "win-final-v1.wav", "ui", 0.52, win_final, 5304, 0.54, "Warm final-win chord with an authoritative stamp."),
    ("win.max", "win-max-v1.wav", "cabinet", 1.42, win_max, 5305, 0.60, "Full red-blue maximum-win fanfare reserved for 25,000x."),
]


def main() -> None:
    entries = []
    for cue, filename, channel, duration, voice, seed, peak, description in SOUNDS:
        samples = render(duration, voice, seed, peak)
        write(filename, samples)
        entries.append({
            "cue": cue,
            "file": f"battle-win/{filename}",
            "channel": channel,
            "sampleRate": RATE,
            "channels": 1,
            "durationMs": round(len(samples) / RATE * 1000),
            "peak": peak,
            "description": description,
        })
    MANIFEST.write_text(json.dumps({
        "version": 1,
        "format": "PCM signed 16-bit little-endian WAV",
        "designRule": "Routine wins remain short; the 25,000x cue alone receives the full fanfare.",
        "cues": entries,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} battle/win cues and {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
