import { analyzePcm, normalizePcm, wavDataUrl } from './AudioFactory.js';

export const SPECIALTY_CUE_FACTORY_FORMAT = 'stake-studio-specialty-cue-factory-v1';
export const MORPHEUS_EFFECT_AUDIO_PACK_ID = 'morpheus-effect-orchestration-v1';

const SAMPLE_RATE = 44100;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
const lerp = (a, b, amount) => a + (b - a) * amount;

function hashValue(value) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function seededRandom(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function cue(id, profile) {
  return Object.freeze({
    cueId: `morpheus.audio.${id}`,
    approvalStatus: 'foundation',
    bus: 'sfx',
    maxVoices: 1,
    cooldownMs: 80,
    interruptPolicy: 'finish-current-beat',
    targetPeak: 0.88,
    ...profile,
  });
}

export const MORPHEUS_EFFECT_CUE_SPECS = Object.freeze({
  'morpheus.audio.position-grid-wake': cue('position-grid-wake', {
    profileId: 'engraved-constellation-grid-wake', label: 'Position grid wake', duration: 0.82,
    rootHz: 98, targetHz: 392, curve: 0.58, chord: [1, 1.5, 2], chordGain: 0.28,
    noise: 0.06, shimmer: 0.28, sub: 0.16, pulses: [0.08, 0.3, 0.52, 0.74], echoMs: 105, echoGain: 0.22,
    exclusiveGroup: 'morpheus-persistent-instrument', priority: 64,
  }),
  'morpheus.audio.position-grid-double': cue('position-grid-double', {
    profileId: 'engraved-cell-value-double', label: 'Position grid cell double', duration: 0.44,
    rootHz: 246.94, targetHz: 740, curve: 0.55, chord: [1, 1.5, 2], chordGain: 0.32,
    noise: 0.025, shimmer: 0.34, sub: 0.05, pulses: [0.12, 0.6], echoMs: 72, echoGain: 0.18,
    exclusiveGroup: 'morpheus-persistent-instrument', priority: 61,
  }),
  'morpheus.audio.nightmare-reliquary': cue('nightmare-reliquary', {
    profileId: 'sealed-reliquary-reveal-launch', label: 'Nightmare reliquary reveal', duration: 0.92,
    rootHz: 73.42, targetHz: 659.25, curve: 0.46, chord: [1, 1.414, 2], chordGain: 0.27,
    noise: 0.25, shimmer: 0.31, sub: 0.22, pulses: [0.06, 0.42, 0.78], echoMs: 126, echoGain: 0.24,
    exclusiveGroup: 'morpheus-predetermined-declaration', priority: 80, ducking: true,
  }),
  'morpheus.audio.veil-bar-progress': cue('veil-bar-progress', {
    profileId: 'pale-essence-family-progress', label: 'Veil family bar progress', duration: 0.48,
    rootHz: 293.66, targetHz: 587.33, curve: 0.66, chord: [1, 1.25, 2], chordGain: 0.26,
    noise: 0.06, shimmer: 0.3, sub: 0.04, pulses: [0.14, 0.58], echoMs: 88, echoGain: 0.18,
    exclusiveGroup: 'morpheus-persistent-instrument', priority: 59,
  }),
  'morpheus.audio.veil-family-upgrade': cue('veil-family-upgrade', {
    profileId: 'veil-family-transfiguration', label: 'Veil persistent family upgrade', duration: 1.14,
    rootHz: 174.61, targetHz: 1046.5, curve: 0.42, chord: [1, 1.25, 1.5, 2], chordGain: 0.35,
    noise: 0.08, shimmer: 0.43, sub: 0.11, pulses: [0.08, 0.34, 0.68], echoMs: 135, echoGain: 0.29,
    exclusiveGroup: 'morpheus-persistent-instrument', priority: 83, ducking: true,
  }),
  'morpheus.audio.lucid-family-double': cue('lucid-family-double', {
    profileId: 'lucid-family-rack-double', label: 'Lucid family multiplier double', duration: 0.68,
    rootHz: 392, targetHz: 987.77, curve: 0.52, chord: [1, 1.5, 2.5], chordGain: 0.32,
    noise: 0.02, shimmer: 0.48, sub: 0.04, pulses: [0.1, 0.5, 0.76], echoMs: 96, echoGain: 0.24,
    exclusiveGroup: 'morpheus-persistent-instrument', priority: 69,
  }),
  'morpheus.audio.raining-wilds': cue('raining-wilds', {
    profileId: 'cracked-moon-wild-rain', label: 'Raining Wilds moon fracture', duration: 1.08,
    rootHz: 110, targetHz: 880, curve: 0.36, chord: [1, 1.333, 2], chordGain: 0.25,
    noise: 0.32, shimmer: 0.35, sub: 0.17, pulses: [0.04, 0.22, 0.4, 0.58, 0.76], echoMs: 112, echoGain: 0.23,
    exclusiveGroup: 'morpheus-predetermined-declaration', priority: 77, ducking: true,
  }),
  'morpheus.audio.stacked-reels': cue('stacked-reels', {
    profileId: 'vertical-reel-seal-stack', label: 'Stacked reels seal', duration: 0.8,
    rootHz: 82.41, targetHz: 493.88, curve: 0.5, chord: [1, 1.5, 2], chordGain: 0.27,
    noise: 0.18, shimmer: 0.2, sub: 0.24, pulses: [0.1, 0.36, 0.62], echoMs: 104, echoGain: 0.2,
    exclusiveGroup: 'morpheus-predetermined-declaration', priority: 74,
  }),
  'morpheus.audio.guaranteed-gates': cue('guaranteed-gates', {
    profileId: 'gate-tier-escalation', label: 'Guaranteed gate tier awakening', duration: 1.22,
    rootHz: 130.81, targetHz: 1174.66, curve: 0.4, chord: [1, 1.25, 1.5, 2], chordGain: 0.34,
    noise: 0.1, shimmer: 0.4, sub: 0.12, pulses: [0.08, 0.3, 0.52, 0.74], echoMs: 128, echoGain: 0.28,
    exclusiveGroup: 'morpheus-predetermined-declaration', priority: 86, ducking: true,
  }),
  'morpheus.audio.mystery-synchronized-reveal': cue('mystery-synchronized-reveal', {
    profileId: 'veiled-breath-to-glass-unison', label: 'Mystery synchronized reveal', duration: 0.78,
    rootHz: 196, targetHz: 311, curve: 0.72, chord: [1, 1.5, 2.01], chordGain: 0.28,
    noise: 0.34, shimmer: 0.2, sub: 0.08, pulses: [0.64], echoMs: 118, echoGain: 0.24,
    exclusiveGroup: 'morpheus-special-reaction', priority: 62,
  }),
  'morpheus.audio.star-target-selected': cue('star-target-selected', {
    profileId: 'prismatic-three-point-focus', label: 'Oneiric Star target tell', duration: 0.62,
    rootHz: 523.25, targetHz: 987.77, curve: 0.48, chord: [1, 1.25, 2], chordGain: 0.36,
    noise: 0.035, shimmer: 0.42, sub: 0.02, pulses: [0.12, 0.38, 0.68], echoMs: 92, echoGain: 0.3,
    exclusiveGroup: 'morpheus-special-reaction', priority: 68,
  }),
  'morpheus.audio.star-chain-convert': cue('star-chain-convert', {
    profileId: 'constellation-chain-conversion', label: 'Oneiric Star chain conversion', duration: 0.94,
    rootHz: 329.63, targetHz: 1318.51, curve: 0.55, chord: [1, 1.333, 1.997], chordGain: 0.3,
    noise: 0.08, shimmer: 0.38, sub: 0.06, pulses: [0.08, 0.24, 0.4, 0.56, 0.72], echoMs: 76, echoGain: 0.27,
    exclusiveGroup: 'morpheus-special-reaction', priority: 72,
  }),
  'morpheus.audio.dreamfall-reel-growth': cue('dreamfall-reel-growth', {
    profileId: 'subterranean-shaft-rise', label: 'Dreamfall reel growth', duration: 0.86,
    rootHz: 58, targetHz: 392, curve: 0.38, chord: [1, 1.498, 2], chordGain: 0.22,
    noise: 0.28, shimmer: 0.14, sub: 0.38, pulses: [0.02, 0.72], echoMs: 132, echoGain: 0.18,
    exclusiveGroup: 'morpheus-dreamfall-instrument', priority: 76, ducking: true,
  }),
  'morpheus.audio.dreamfall-chain-progress': cue('dreamfall-chain-progress', {
    profileId: 'ascending-oneiric-ladder-step', label: 'Dreamfall chain progress', duration: 0.42,
    rootHz: 440, targetHz: 659.25, curve: 0.62, chord: [1, 1.5, 2], chordGain: 0.34,
    noise: 0.025, shimmer: 0.34, sub: 0.035, pulses: [0.08, 0.54], echoMs: 84, echoGain: 0.2,
    exclusiveGroup: 'morpheus-dreamfall-instrument', priority: 58,
  }),
  'morpheus.audio.dreamfall-free-spin-award': cue('dreamfall-free-spin-award', {
    profileId: 'fifth-hit-time-bloom', label: 'Dreamfall free-spin award', duration: 1.08,
    rootHz: 261.63, targetHz: 1046.5, curve: 0.44, chord: [1, 1.25, 1.5, 2], chordGain: 0.36,
    noise: 0.05, shimmer: 0.46, sub: 0.12, pulses: [0.04, 0.28, 0.52, 0.76], echoMs: 126, echoGain: 0.3,
    exclusiveGroup: 'morpheus-dreamfall-instrument', priority: 82, ducking: true,
  }),
  'morpheus.audio.max-morpheus': cue('max-morpheus', {
    profileId: 'sovereign-verdict-ascension', label: 'MAX MORPHEUS sovereign verdict', duration: 3.2,
    rootHz: 43.65, targetHz: 1760, curve: 0.34, chord: [1, 1.25, 1.5, 2, 3], chordGain: 0.38,
    noise: 0.16, shimmer: 0.5, sub: 0.42, pulses: [0.01, 0.2, 0.42, 0.66, 0.84], echoMs: 164, echoGain: 0.32,
    exclusiveGroup: 'morpheus-terminal', priority: 100, ducking: true,
    interruptPolicy: 'terminal-preempts-all', cooldownMs: 1000, targetPeak: 0.9,
  }),
});

function envelopeAt(progress, attack = 0.025) {
  const attackGain = Math.min(1, progress / Math.max(attack, 0.001));
  const release = progress < 0.72 ? 1 : Math.max(0, 1 - (progress - 0.72) / 0.28);
  return attackGain * Math.pow(release, 1.75);
}

export function synthesizeSpecialtyCue(spec, { seed = 110811 } = {}) {
  if (!spec?.cueId || !Array.isArray(spec.chord) || !spec.chord.length) throw new Error('A complete specialty cue specification is required.');
  const sampleCount = Math.round(clamp(spec.duration, 0.1, 6) * SAMPLE_RATE);
  const samples = new Float32Array(sampleCount);
  const random = seededRandom(seed + spec.cueId.length * 7919);
  const phases = spec.chord.map(() => random() * TAU);
  let subPhase = random() * TAU;
  let shimmerPhase = random() * TAU;
  let filteredNoise = 0;
  const delaySamples = Math.max(1, Math.round(clamp(spec.echoMs || 0, 0, 500) / 1000 * SAMPLE_RATE));

  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / Math.max(1, sampleCount - 1);
    const shaped = Math.pow(progress, clamp(spec.curve ?? 0.6, 0.15, 3));
    const frequency = Math.max(24, lerp(spec.rootHz, spec.targetHz, shaped));
    let tonal = 0;
    for (let voice = 0; voice < phases.length; voice += 1) {
      phases[voice] += TAU * frequency * spec.chord[voice] / SAMPLE_RATE;
      tonal += Math.sin(phases[voice]) * (voice ? spec.chordGain : 0.52);
    }
    tonal /= Math.max(1, phases.length * 0.62);
    subPhase += TAU * Math.max(24, frequency * 0.25) / SAMPLE_RATE;
    shimmerPhase += TAU * Math.max(100, frequency * 3.01) / SAMPLE_RATE;
    filteredNoise = filteredNoise * 0.88 + (random() * 2 - 1) * 0.12;
    let pulse = 0;
    for (const marker of spec.pulses || []) {
      const distance = Math.abs(progress - marker);
      pulse += Math.exp(-distance * 72) * Math.sin(shimmerPhase * (1 + marker * 0.35));
    }
    const body = tonal
      + Math.sin(subPhase) * spec.sub
      + Math.sin(shimmerPhase) * spec.shimmer * (0.25 + 0.75 * progress)
      + filteredNoise * spec.noise
      + pulse * 0.34;
    const echo = index >= delaySamples ? samples[index - delaySamples] * clamp(spec.echoGain || 0, 0, 0.6) : 0;
    samples[index] = (body + echo) * envelopeAt(progress);
  }

  const normalized = normalizePcm(samples, clamp(spec.targetPeak || 0.88, 0.5, 0.94));
  return { samples: normalized, sampleRate: SAMPLE_RATE, duration: sampleCount / SAMPLE_RATE, analysis: analyzePcm(normalized) };
}

export function generateSpecialtyCueAsset(spec, { seed = 110811, approvalStatus = spec.approvalStatus || 'foundation' } = {}) {
  const synthesis = synthesizeSpecialtyCue(spec, { seed });
  const identity = {
    format: SPECIALTY_CUE_FACTORY_FORMAT,
    packId: MORPHEUS_EFFECT_AUDIO_PACK_ID,
    cueId: spec.cueId,
    profileId: spec.profileId,
    seed,
    duration: synthesis.duration,
    approvalStatus,
  };
  return {
    src: wavDataUrl(synthesis.samples, synthesis.sampleRate),
    volume: 1,
    source: 'procedural-specialty-cue',
    orchestration: {
      bus: spec.bus,
      priority: spec.priority,
      exclusiveGroup: spec.exclusiveGroup,
      maxVoices: spec.maxVoices,
      cooldownMs: spec.cooldownMs,
      ducking: Boolean(spec.ducking),
      interruptPolicy: spec.interruptPolicy,
    },
    factory: {
      ...identity,
      label: spec.label,
      sampleRate: synthesis.sampleRate,
      peak: synthesis.analysis.peak,
      rms: synthesis.analysis.rms,
      clippedSamples: synthesis.analysis.clippedSamples,
      fingerprint: `specialty-${hashValue(identity)}`,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function generateMorpheusEffectCuePack({ seed = 110811, approvalStatus = 'foundation' } = {}) {
  const cues = Object.fromEntries(Object.entries(MORPHEUS_EFFECT_CUE_SPECS).map(([cueId, spec], index) => [
    cueId,
    generateSpecialtyCueAsset(spec, { seed: seed + index * 101, approvalStatus }),
  ]));
  return {
    format: SPECIALTY_CUE_FACTORY_FORMAT,
    packId: MORPHEUS_EFFECT_AUDIO_PACK_ID,
    seed,
    approvalStatus,
    cueIds: Object.keys(cues),
    cues,
    fingerprint: `specialty-pack-${hashValue(Object.fromEntries(Object.entries(cues).map(([id, asset]) => [id, asset.factory.fingerprint])))}`,
  };
}

export function auditMorpheusEffectCuePack(project) {
  const expected = Object.keys(MORPHEUS_EFFECT_CUE_SPECS);
  const assets = expected.map(cueId => ({ cueId, asset: project.audio?.stingers?.[cueId] }));
  const missing = assets.filter(({ asset }) => !asset?.src).map(({ cueId }) => cueId);
  const unsafe = assets.filter(({ asset }) => asset?.src && (
    Number(asset.factory?.peak) > 0.95
    || Number(asset.factory?.rms) < 0.025
    || Number(asset.factory?.clippedSamples) > 0
    || !asset.orchestration?.exclusiveGroup
    || !Number.isFinite(Number(asset.orchestration?.priority))
  )).map(({ cueId }) => cueId);
  const fingerprints = assets.map(({ asset }) => asset?.factory?.fingerprint).filter(Boolean);
  const distinct = new Set(fingerprints);
  const collisions = fingerprints.filter((fingerprint, index) => fingerprints.indexOf(fingerprint) !== index);
  const foundationReady = missing.length === 0 && unsafe.length === 0 && distinct.size === expected.length;
  const productionReady = foundationReady && assets.every(({ asset }) => asset.factory?.approvalStatus === 'approved');
  return {
    format: 'morpheus-effect-audio-pack-audit-v1',
    packId: MORPHEUS_EFFECT_AUDIO_PACK_ID,
    expectedCueCount: expected.length,
    installedCueCount: expected.length - missing.length,
    missing,
    unsafe,
    fingerprintCollisions: [...new Set(collisions)],
    foundationReady,
    productionReady,
    approvalStatus: productionReady ? 'approved' : foundationReady ? 'foundation' : 'incomplete',
    fingerprint: `morpheus-audio-${hashValue({ expected, fingerprints, missing, unsafe })}`,
  };
}

export function installMorpheusEffectCuePack(project, options = {}) {
  if (!project || typeof project !== 'object') throw new Error('A project is required to install specialty cues.');
  const pack = generateMorpheusEffectCuePack(options);
  project.audio ||= {};
  project.audio.stingers ||= {};
  project.audio.factory ||= { version: 1, generatedAssets: 0, lastSource: null };
  project.audio.specialtyPacks ||= {};
  Object.assign(project.audio.stingers, pack.cues);
  project.audio.specialtyPacks[pack.packId] = {
    format: pack.format,
    packId: pack.packId,
    seed: pack.seed,
    approvalStatus: pack.approvalStatus,
    cueIds: [...pack.cueIds],
    fingerprint: pack.fingerprint,
    installedAt: new Date().toISOString(),
  };
  project.audio.factory.generatedAssets = Number(project.audio.factory.generatedAssets || 0) + pack.cueIds.length;
  project.audio.factory.lastSource = MORPHEUS_EFFECT_AUDIO_PACK_ID;
  if (project.production?.audio) {
    project.production.audio.loudnessNormalized = false;
    project.production.audio.synchronizationReviewed = false;
    project.production.audio.masteringAudit = null;
  }
  return { pack, audit: auditMorpheusEffectCuePack(project) };
}
