#!/usr/bin/env python3
"""Build the original WIZARD CRAFT symbol accent pack as deterministic PCM WAVs."""

from __future__ import annotations

import json
import math
import random
import wave
from pathlib import Path


SAMPLE_RATE = 44_100
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art-src" / "wizard-craft" / "audio" / "symbols"
MANIFEST = OUTPUT.parent / "symbol-cues-v1.json"


def envelope(t: float, duration: float, attack: float = 0.012, release: float = 0.10) -> float:
    return min(1.0, t / attack, max(0.0, (duration - t) / release))


def sine(phase: float) -> float:
    return math.sin(phase * math.tau)


def noise(rng: random.Random) -> float:
    return rng.uniform(-1.0, 1.0)


def render(duration: float, voice, seed: int) -> list[float]:
    rng = random.Random(seed)
    samples = [voice(i / SAMPLE_RATE, duration, rng) for i in range(round(duration * SAMPLE_RATE))]
    peak = max(abs(sample) for sample in samples) or 1.0
    gain = 0.58 / peak
    return [max(-1.0, min(1.0, sample * gain)) for sample in samples]


def write_wav(filename: str, samples: list[float]) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pcm = bytearray()
    for sample in samples:
        value = round(sample * 32_767)
        pcm.extend(int(value).to_bytes(2, "little", signed=True))
    with wave.open(str(OUTPUT / filename), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm)


def ember(t: float, duration: float, rng: random.Random) -> float:
    puff = sine(74 * t + 25 * t * t) * math.exp(-8 * t)
    crackle = noise(rng) * (0.25 if rng.random() < 0.075 else 0.035)
    return envelope(t, duration, 0.005, 0.07) * (0.58 * puff + crackle)


def potion(t: float, duration: float, rng: random.Random) -> float:
    bubbles = 0.0
    for start, pitch in ((0.015, 350), (0.105, 510)):
        age = t - start
        if 0 <= age < 0.105:
            bubbles += sine(pitch * age + 260 * age * age) * math.exp(-23 * age)
    return 0.7 * bubbles + 0.02 * noise(rng) * envelope(t, duration)


def dragon_egg(t: float, duration: float, rng: random.Random) -> float:
    knock = sine(92 * t) * math.exp(-18 * t)
    crack_age = t - 0.095
    crack = noise(rng) * math.exp(-48 * crack_age) if crack_age >= 0 else 0.0
    return envelope(t, duration, 0.003, 0.07) * (0.72 * knock + 0.28 * crack)


def dragon_wild(t: float, duration: float, rng: random.Random) -> float:
    growl = (
        0.58 * sine((63 + 13 * sine(7 * t)) * t)
        + 0.24 * sine((126 + 19 * sine(5 * t)) * t)
    )
    breath = noise(rng) * (0.18 + 0.20 * math.sin(math.pi * t / duration))
    return envelope(t, duration, 0.025, 0.12) * (growl + breath)


def scroll(t: float, duration: float, rng: random.Random) -> float:
    snap = noise(rng) * math.exp(-35 * t)
    rustle = noise(rng) * (0.22 + 0.18 * sine(24 * t))
    return envelope(t, duration, 0.002, 0.08) * (0.55 * snap + 0.45 * rustle)


def grimoire(t: float, duration: float, rng: random.Random) -> float:
    thump = sine(108 * t) * math.exp(-17 * t)
    resonance = sine(218 * t) * math.exp(-10 * t)
    return envelope(t, duration, 0.003, 0.11) * (0.78 * thump + 0.22 * resonance)


def staff(t: float, duration: float, rng: random.Random) -> float:
    return envelope(t, duration, 0.006, 0.15) * (
        0.65 * sine(735 * t) * math.exp(-7 * t)
        + 0.25 * sine(1102 * t) * math.exp(-9 * t)
        + 0.10 * sine(1471 * t) * math.exp(-12 * t)
    )


def wizard_wild(t: float, duration: float, rng: random.Random) -> float:
    notes = 0.0
    for start, pitch in ((0.0, 523.25), (0.065, 659.25), (0.13, 783.99)):
        age = t - start
        if age >= 0:
            notes += sine(pitch * age) * math.exp(-7 * age)
            notes += 0.24 * sine(pitch * 2.01 * age) * math.exp(-10 * age)
    return 0.45 * envelope(t, duration, 0.006, 0.13) * notes


def crystal(t: float, duration: float, rng: random.Random) -> float:
    red = sine(392.0 * t) * math.exp(-8 * t)
    blue = sine(587.33 * t) * math.exp(-8 * t)
    clash_age = t - 0.075
    clash = noise(rng) * math.exp(-55 * clash_age) if clash_age >= 0 else 0.0
    return envelope(t, duration, 0.004, 0.13) * (0.38 * red + 0.38 * blue + 0.24 * clash)


SOUNDS = [
    ("symbol.ember", "ember-v1.wav", "dragon", 0.19, ember, 1101, "Low flame puff with a dry ember crackle."),
    ("symbol.potion", "potion-v1.wav", "dragon", 0.24, potion, 1102, "Two rising alchemical bubble pops."),
    ("symbol.dragon-egg", "dragon-egg-v1.wav", "dragon", 0.22, dragon_egg, 1103, "Heavy shell knock followed by a small crack."),
    ("symbol.dragon-wild", "dragon-wild-v1.wav", "dragon", 0.31, dragon_wild, 1104, "Short organic growl with restrained fire breath."),
    ("symbol.scroll", "scroll-v1.wav", "wizard", 0.20, scroll, 2101, "Parchment snap and brief rustle."),
    ("symbol.grimoire", "grimoire-v1.wav", "wizard", 0.24, grimoire, 2102, "Weighty book thump with a magical resonance."),
    ("symbol.staff", "staff-v1.wav", "wizard", 0.26, staff, 2103, "Clear blue-glass staff chime."),
    ("symbol.wizard-wild", "wizard-wild-v1.wav", "wizard", 0.32, wizard_wild, 2104, "Compact ascending spell arpeggio."),
    ("symbol.crystal", "crystal-v1.wav", "clash", 0.27, crystal, 3101, "Red and blue tones meeting at a crisp center clash."),
]


def main() -> None:
    entries = []
    for cue, filename, family, duration, voice, seed, description in SOUNDS:
        samples = render(duration, voice, seed)
        write_wav(filename, samples)
        entries.append(
            {
                "cue": cue,
                "file": f"symbols/{filename}",
                "family": family,
                "sampleRate": SAMPLE_RATE,
                "channels": 1,
                "durationMs": round(len(samples) / SAMPLE_RATE * 1000),
                "peak": 0.58,
                "description": description,
            }
        )

    manifest = {
        "version": 1,
        "format": "PCM signed 16-bit little-endian WAV",
        "layering": "At most one cue per family is selected for a resolved win.",
        "cues": entries,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} symbol cues and {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
