#!/usr/bin/env python3
"""Build deterministic reel, sticky, and duel-mode sounds for WIZARD CRAFT."""

from __future__ import annotations

import json
import math
import random
import wave
from pathlib import Path


RATE = 44_100
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art-src" / "wizard-craft" / "audio" / "mechanics"
MANIFEST = OUTPUT.parent / "mechanical-cues-v1.json"


def env(t: float, duration: float, attack: float = 0.004, release: float = 0.08) -> float:
    return min(1.0, t / attack, max(0.0, (duration - t) / release))


def tone(frequency: float, age: float, decay: float = 10.0, partial: float = 0.18) -> float:
    if age < 0:
        return 0.0
    phase = math.tau * frequency * age
    return (math.sin(phase) + partial * math.sin(phase * 2.01)) * math.exp(-decay * age)


def hit(t: float, start: float, frequency: float, decay: float = 24.0) -> float:
    return tone(frequency, t - start, decay, 0.12)


def render(duration: float, voice, seed: int, peak: float = 0.56) -> list[float]:
    rng = random.Random(seed)
    samples = [voice(i / RATE, duration, rng) for i in range(round(duration * RATE))]
    maximum = max(abs(sample) for sample in samples) or 1.0
    return [max(-1.0, min(1.0, sample * peak / maximum)) for sample in samples]


def write(filename: str, samples: list[float]) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pcm = bytearray()
    for sample in samples:
        pcm.extend(round(sample * 32_767).to_bytes(2, "little", signed=True))
    with wave.open(str(OUTPUT / filename), "wb") as wav:
        wav.setparams((1, 2, RATE, len(samples), "NONE", "not compressed"))
        wav.writeframes(pcm)


def reel_stop(t: float, duration: float, rng: random.Random) -> float:
    click = rng.uniform(-1, 1) * math.exp(-70 * t)
    body = tone(118, t, 30, 0.08)
    return env(t, duration, release=0.045) * (0.48 * click + 0.52 * body)


def anticipation(t: float, duration: float, rng: random.Random) -> float:
    sweep = math.sin(math.tau * (170 * t + 310 * t * t)) * (0.3 + 0.7 * t / duration)
    ticks = sum(hit(t, start, 330 + index * 45, 35) for index, start in enumerate((0.08, 0.20, 0.31, 0.40)))
    return env(t, duration, 0.018, 0.10) * (0.55 * sweep + 0.30 * ticks + 0.04 * rng.uniform(-1, 1))


def tier_voice(notes: tuple[float, ...], bass: float, impact: bool = False):
    def voice(t: float, duration: float, rng: random.Random) -> float:
        spacing = 0.105
        melody = sum(tone(note, t - i * spacing, 6.5, 0.22) for i, note in enumerate(notes))
        low = tone(bass, t, 8, 0.1)
        slam = hit(t, (len(notes) - 1) * spacing, 72, 16) if impact else 0.0
        shimmer = rng.uniform(-1, 1) * 0.035 * env(t, duration, 0.03, 0.18)
        return 0.55 * melody + 0.25 * low + 0.30 * slam + shimmer
    return voice


def duel_enter(t: float, duration: float, rng: random.Random) -> float:
    red = tone(196, t, 5.5, 0.16)
    blue = tone(294, t, 5.5, 0.16)
    center = hit(t, 0.24, 98, 13)
    return env(t, duration, 0.02, 0.15) * (0.36 * red + 0.36 * blue + 0.34 * center)


def retrigger(t: float, duration: float, rng: random.Random) -> float:
    notes = sum(tone(note, t - i * 0.085, 5.4, 0.2) for i, note in enumerate((392, 494, 587, 784)))
    return env(t, duration, 0.008, 0.18) * (0.55 * notes + 0.06 * rng.uniform(-1, 1))


def duel_end(t: float, duration: float, rng: random.Random) -> float:
    chord = tone(294, t, 4.5, 0.16) + tone(392, t, 4.5, 0.14) + tone(587, t, 4.5, 0.12)
    low = tone(73.5, t, 7, 0.08)
    return env(t, duration, 0.015, 0.22) * (0.38 * chord + 0.34 * low)


def spin_counter(t: float, duration: float, rng: random.Random) -> float:
    return env(t, duration, release=0.07) * (0.75 * tone(880, t, 18, 0.08) + 0.25 * hit(t, 0.045, 1175, 24))


def temporary_claim(t: float, duration: float, rng: random.Random) -> float:
    sweep = math.sin(math.tau * (245 * t - 170 * t * t)) * math.exp(-5 * t)
    return env(t, duration, 0.008, 0.10) * (0.65 * sweep + 0.35 * hit(t, 0.13, 130, 20))


def sticky_claim(t: float, duration: float, rng: random.Random) -> float:
    latch = hit(t, 0.0, 92, 18) + 0.7 * hit(t, 0.105, 76, 16)
    metal = hit(t, 0.105, 410, 25)
    return env(t, duration, release=0.11) * (0.58 * latch + 0.24 * metal)


def sticky_upgrade(t: float, duration: float, rng: random.Random) -> float:
    climb = sum(tone(note, t - i * 0.075, 7, 0.16) for i, note in enumerate((220, 277, 330, 440)))
    lock = hit(t, 0.29, 82, 17)
    return env(t, duration, 0.01, 0.14) * (0.48 * climb + 0.45 * lock)


def attack_block(t: float, duration: float, rng: random.Random) -> float:
    shield = tone(310, t, 8, 0.25) + tone(465, t, 10, 0.15)
    thud = hit(t, 0.045, 68, 15)
    return env(t, duration, 0.005, 0.16) * (0.4 * shield + 0.48 * thud)


def temporary_clear(t: float, duration: float, rng: random.Random) -> float:
    fall = math.sin(math.tau * (420 * t - 460 * t * t)) * math.exp(-7 * t)
    dust = rng.uniform(-1, 1) * math.exp(-12 * t)
    return env(t, duration, 0.004, 0.08) * (0.67 * fall + 0.16 * dust)


SOUNDS = [
    ("reels.stop", "reels-stop-v1.wav", "reels", 0.13, reel_stop, 4001, "Compact physical reel brake."),
    ("reels.anticipation", "reels-anticipation-v1.wav", "reels", 0.52, anticipation, 4002, "Escalating magical reel tension with ordered ticks."),
    ("duel.tier1", "duel-tier1-v1.wav", "cabinet", 0.48, tier_voice((294, 392, 494), 98), 4101, "Tier I three-note duel seal."),
    ("duel.tier2", "duel-tier2-v1.wav", "cabinet", 0.60, tier_voice((294, 392, 494, 587), 82), 4102, "Tier II extended rising duel seal."),
    ("duel.tier3", "duel-tier3-v1.wav", "cabinet", 0.72, tier_voice((294, 392, 494, 587, 784), 65, True), 4103, "Tier III full ascent and guaranteed-lock impact."),
    ("duel.enter", "duel-enter-v1.wav", "cabinet", 0.50, duel_enter, 4104, "Red and blue energies converge into duel mode."),
    ("duel.retrigger", "duel-retrigger-v1.wav", "cabinet", 0.52, retrigger, 4105, "Fast four-note additional-spins lift."),
    ("duel.end", "duel-end-v1.wav", "cabinet", 0.64, duel_end, 4106, "Resolved duel chord with grounded low finish."),
    ("ui.spin-counter", "spin-counter-v1.wav", "ui", 0.16, spin_counter, 4201, "Small glass counter increment."),
    ("reel.temporary.claim", "temporary-claim-v1.wav", "reels", 0.29, temporary_claim, 4301, "Light magical reel wrap without a lock."),
    ("reel.sticky.claim", "sticky-claim-v1.wav", "reels", 0.38, sticky_claim, 4302, "Two-stage heavy sticky reel latch."),
    ("reel.sticky.upgrade", "sticky-upgrade-v1.wav", "reels", 0.48, sticky_upgrade, 4303, "Multiplier climb finishing in a firm lock."),
    ("attack.block", "attack-block-v1.wav", "clash", 0.38, attack_block, 4401, "Resonant ward impact that contains an attack."),
    ("reel.temporary.clear", "temporary-clear-v1.wav", "reels", 0.24, temporary_clear, 4304, "Short descending dissolve for released temporary reels."),
]


def main() -> None:
    entries = []
    for cue, filename, channel, duration, voice, seed, description in SOUNDS:
        samples = render(duration, voice, seed)
        write(filename, samples)
        entries.append({
            "cue": cue,
            "file": f"mechanics/{filename}",
            "channel": channel,
            "sampleRate": RATE,
            "channels": 1,
            "durationMs": round(len(samples) / RATE * 1000),
            "peak": 0.56,
            "description": description,
        })
    MANIFEST.write_text(json.dumps({
        "version": 1,
        "format": "PCM signed 16-bit little-endian WAV",
        "designRule": "Mechanical cues describe authoritative events; they never predict an outcome.",
        "cues": entries,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} mechanical cues and {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
