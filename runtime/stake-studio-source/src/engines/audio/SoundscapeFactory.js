import { analyzePcm, normalizePcm, wavDataUrl } from './AudioFactory.js';

const SAMPLE_RATE = 22050;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

function randomGenerator(seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export const SOUNDSCAPE_PROFILES = Object.freeze({
  mythicDoom: { label: 'Mythic Doom', description: 'Low ritual pulse, iron percussion and ancient harmonic weight.', root: 43, scale: [0, 2, 3, 5, 7, 8, 10], progression: [0, 5, 3, 0], bpm: 88, warmth: 0.82, air: 0.2, percussion: 0.62 },
  darkCinematic: { label: 'Dark Cinematic', description: 'Restrained tension, sub pressure and polished trailer-space atmosphere.', root: 48, scale: [0, 2, 3, 5, 7, 8, 11], progression: [0, 3, 5, 0], bpm: 96, warmth: 0.7, air: 0.3, percussion: 0.5 },
  neonPulse: { label: 'Neon Pulse', description: 'Tight electronic drive, glassy arpeggios and controlled low-end motion.', root: 45, scale: [0, 2, 3, 5, 7, 9, 10], progression: [0, 5, 3, 0], bpm: 118, warmth: 0.38, air: 0.62, percussion: 0.78 },
  cosmicRitual: { label: 'Cosmic Ritual', description: 'Slow orbital drones, crystalline accents and distant ceremonial rhythm.', root: 41, scale: [0, 2, 5, 7, 9], progression: [0, 3, 1, 0], bpm: 76, warmth: 0.58, air: 0.78, percussion: 0.32 },
  gildedMystery: { label: 'Gilded Mystery', description: 'Elegant minor harmony, clockwork detail and expensive restrained motion.', root: 50, scale: [0, 2, 3, 5, 7, 8, 11], progression: [0, 4, 2, 0], bpm: 104, warmth: 0.62, air: 0.5, percussion: 0.46 },
  brightArcade: { label: 'Bright Arcade', description: 'Immediate melodic lift, clean rhythm and celebratory bonus energy.', root: 52, scale: [0, 2, 4, 5, 7, 9, 11], progression: [0, 4, 5, 0], bpm: 124, warmth: 0.44, air: 0.66, percussion: 0.72 },
});

const midiFrequency = note => 440 * 2 ** ((note - 69) / 12);
const periodicFrequency = (frequency, duration) => Math.max(1, Math.round(frequency * duration)) / duration;

function oscillator(phase, shape, warmth) {
  const sine = Math.sin(phase);
  if (shape === 'pad') return sine * 0.72 + Math.sin(phase * 2) * 0.18 * warmth + Math.sin(phase * 3) * 0.08;
  if (shape === 'bass') return Math.tanh(sine * (1.4 + warmth)) * 0.76 + Math.sin(phase * 0.5) * 0.12;
  if (shape === 'bell') return sine * 0.62 + Math.sin(phase * 2.01) * 0.24 + Math.sin(phase * 3.98) * 0.11;
  return sine;
}

function noteFrequency(profile, degree, octave, duration) {
  const scaleIndex = ((degree % profile.scale.length) + profile.scale.length) % profile.scale.length;
  const scaleOctave = Math.floor(degree / profile.scale.length);
  return periodicFrequency(midiFrequency(profile.root + profile.scale[scaleIndex] + (octave + scaleOctave) * 12), duration);
}

function pulseEnvelope(position, length, attack = 0.08, release = 0.28) {
  const attackGain = Math.min(1, position / Math.max(attack, 0.001));
  const remaining = length - position;
  const releaseGain = Math.min(1, remaining / Math.max(release, 0.001));
  return Math.max(0, attackGain * releaseGain);
}

function renderMusic(profile, options, variant) {
  const bpm = clamp(options.bpm || profile.bpm, 60, 150);
  const bars = Math.round(clamp(options.bars || 4, 2, 8));
  const beatsPerBar = 4;
  const beatSeconds = 60 / bpm;
  const duration = bars * beatsPerBar * beatSeconds;
  const samples = new Float32Array(Math.round(duration * SAMPLE_RATE));
  const random = randomGenerator((options.seed || 1103) + (variant === 'bonus' ? 991 : 0));
  let noiseState = 0;
  const energy = clamp(options.energy ?? 0.7, 0.2, 1);
  const bonus = variant === 'bonus';

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const beatPosition = time / beatSeconds;
    const beat = Math.floor(beatPosition);
    const bar = Math.floor(beat / beatsPerBar) % bars;
    const beatInBar = beatPosition - bar * beatsPerBar;
    const chordDegree = profile.progression[bar % profile.progression.length];
    const barPosition = (time % (beatSeconds * beatsPerBar));
    const barEnvelope = pulseEnvelope(barPosition, beatSeconds * beatsPerBar, 0.12, 0.18);

    let pad = 0;
    for (const offset of [0, 2, 4]) {
      const frequency = noteFrequency(profile, chordDegree + offset, bonus ? 1 : 0, duration);
      pad += oscillator(TAU * frequency * time + offset * 0.31, 'pad', profile.warmth) / 3;
    }

    const bassDegree = chordDegree + (beat % 4 === 3 && bonus ? 4 : 0);
    const bassFrequency = noteFrequency(profile, bassDegree, -1, duration);
    const beatPhase = time % beatSeconds;
    const bass = oscillator(TAU * bassFrequency * time, 'bass', profile.warmth) * pulseEnvelope(beatPhase, beatSeconds, 0.018, beatSeconds * 0.48);

    const subdivisions = bonus ? 4 : 2;
    const stepLength = beatSeconds / subdivisions;
    const step = Math.floor(time / stepLength);
    const arpDegree = chordDegree + [0, 2, 4, 2, 5, 4, 2, 4][step % 8];
    const arpFrequency = noteFrequency(profile, arpDegree, bonus ? 2 : 1, duration);
    const stepPhase = time % stepLength;
    const arp = oscillator(TAU * arpFrequency * time, 'bell', profile.warmth) * pulseEnvelope(stepPhase, stepLength, 0.008, stepLength * 0.42);

    const beatFraction = beatPosition - Math.floor(beatPosition);
    const kickFrequency = periodicFrequency(54 + 24 * Math.exp(-beatFraction * 16), duration);
    const kick = Math.sin(TAU * kickFrequency * time) * Math.exp(-beatFraction * 18) * (beat % 2 === 0 ? 1 : 0.45);
    const eighth = (beatPosition * 2) % 1;
    const noise = random() * 2 - 1;
    noiseState += (noise - noiseState) * (0.035 + profile.air * 0.05);
    const hat = noise * Math.exp(-eighth * 42) * (bonus ? 0.34 : 0.16);
    const snare = noiseState * Math.exp(-beatFraction * 24) * (beat % 4 === 1 || beat % 4 === 3 ? 0.55 : 0);
    const percussion = (kick * 0.52 + hat + snare * 0.4) * profile.percussion;

    const mix = pad * (bonus ? 0.31 : 0.4) * barEnvelope
      + bass * (bonus ? 0.34 : 0.28)
      + arp * (bonus ? 0.38 : 0.22) * profile.air
      + percussion * (bonus ? 0.62 : 0.36);
    samples[index] = mix * energy;
  }

  const edge = Math.min(Math.round(SAMPLE_RATE * 0.006), Math.floor(samples.length / 2));
  for (let index = 0; index < edge; index += 1) {
    const gain = Math.sin(index / edge * Math.PI / 2) ** 2;
    samples[index] *= gain;
    samples[samples.length - 1 - index] *= gain;
  }
  const normalized = normalizePcm(samples, bonus ? 0.78 : 0.7);
  return { samples: normalized, duration, bpm, bars, analysis: analyzePcm(normalized) };
}

function renderAmbience(profile, options) {
  const bpm = clamp(options.bpm || profile.bpm, 60, 150);
  const bars = Math.round(clamp(options.bars || 4, 2, 8));
  const duration = bars * 4 * 60 / bpm;
  const samples = new Float32Array(Math.round(duration * SAMPLE_RATE));
  const random = randomGenerator((options.seed || 1103) + 1777);
  const root = periodicFrequency(midiFrequency(profile.root - 12), duration);
  const fifth = periodicFrequency(midiFrequency(profile.root - 5), duration);
  let lowNoise = 0;
  let highNoise = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const noise = random() * 2 - 1;
    lowNoise += (noise - lowNoise) * (0.004 + profile.air * 0.007);
    highNoise += (noise - highNoise) * (0.02 + profile.air * 0.03);
    const breath = lowNoise * (0.22 + profile.air * 0.2) + (noise - highNoise) * 0.035;
    const drone = Math.sin(TAU * root * time) * 0.24 + Math.sin(TAU * fifth * time + 1.2) * 0.12;
    const orbit = Math.sin(TAU * (1 / duration) * time) * 0.08;
    samples[index] = (breath + drone * profile.warmth + orbit) * 0.72;
  }
  const edge = Math.min(Math.round(SAMPLE_RATE * 0.008), Math.floor(samples.length / 2));
  for (let index = 0; index < edge; index += 1) {
    const gain = Math.sin(index / edge * Math.PI / 2) ** 2;
    samples[index] *= gain;
    samples[samples.length - 1 - index] *= gain;
  }
  const normalized = normalizePcm(samples, 0.52);
  return { samples: normalized, duration, bpm, bars, analysis: analyzePcm(normalized) };
}

function createLayerAsset(layer, profileKey, profile, rendered, options) {
  return {
    src: wavDataUrl(rendered.samples, SAMPLE_RATE),
    loop: true,
    volume: layer === 'ambience' ? 0.42 : layer === 'bonusMusic' ? 0.68 : 0.58,
    source: 'procedural-music',
    factory: {
      kind: 'soundscape',
      layer,
      profile: profileKey,
      profileLabel: profile.label,
      seed: Math.round(Number(options.seed || 1103)),
      bpm: rendered.bpm,
      bars: rendered.bars,
      duration: rendered.duration,
      sampleRate: SAMPLE_RATE,
      peak: rendered.analysis.peak,
      rms: rendered.analysis.rms,
      loopSafe: Math.abs(rendered.samples[0] - rendered.samples.at(-1)) < 0.02,
      fingerprint: `${profileKey}:${Math.round(Number(options.seed || 1103))}:${rendered.bpm}:${rendered.bars}:${layer}`,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function generateSoundscapePack(options = {}) {
  const profileKey = options.profile in SOUNDSCAPE_PROFILES ? options.profile : 'mythicDoom';
  const profile = SOUNDSCAPE_PROFILES[profileKey];
  const base = renderMusic(profile, options, 'base');
  const bonus = renderMusic(profile, { ...options, energy: clamp((options.energy ?? 0.7) + 0.18, 0.2, 1) }, 'bonus');
  const ambience = renderAmbience(profile, options);
  return {
    baseMusic: createLayerAsset('baseMusic', profileKey, profile, base, options),
    bonusMusic: createLayerAsset('bonusMusic', profileKey, profile, bonus, options),
    ambience: createLayerAsset('ambience', profileKey, profile, ambience, options),
  };
}
