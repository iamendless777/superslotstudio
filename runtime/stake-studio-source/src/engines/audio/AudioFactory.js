const SAMPLE_RATE = 44100;

const clamp = (value, min = -1, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;

function seededRandom(seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export const SFX_PRESETS = Object.freeze({
  spinStart: { label: 'Spin ignition', duration: 0.32, startHz: 110, endHz: 680, noise: 0.42, transient: 0.5, harmonic: 0.22, attack: 0.012, curve: 0.8 },
  reelStop: { label: 'Reel stop', duration: 0.19, startHz: 150, endHz: 72, noise: 0.28, transient: 0.85, harmonic: 0.38, attack: 0.002, curve: 2.7 },
  winSmall: { label: 'Small win', duration: 0.48, startHz: 520, endHz: 880, noise: 0.04, transient: 0.18, harmonic: 0.42, attack: 0.008, curve: 0.7, chime: 1 },
  winMedium: { label: 'Medium win', duration: 0.82, startHz: 390, endHz: 1040, noise: 0.06, transient: 0.22, harmonic: 0.55, attack: 0.008, curve: 0.55, chime: 2 },
  winBig: { label: 'Big win', duration: 1.35, startHz: 210, endHz: 1220, noise: 0.12, transient: 0.32, harmonic: 0.62, attack: 0.01, curve: 0.42, chime: 3 },
  winMega: { label: 'Mega win', duration: 1.8, startHz: 145, endHz: 1480, noise: 0.18, transient: 0.4, harmonic: 0.72, attack: 0.008, curve: 0.36, chime: 4 },
  wincap: { label: 'Win cap', duration: 2.25, startHz: 92, endHz: 1760, noise: 0.2, transient: 0.52, harmonic: 0.82, attack: 0.006, curve: 0.3, chime: 5 },
  scatterLand: { label: 'Scatter land', duration: 0.42, startHz: 230, endHz: 690, noise: 0.16, transient: 0.48, harmonic: 0.5, attack: 0.004, curve: 0.78 },
  bonusTrigger: { label: 'Bonus trigger', duration: 1.55, startHz: 120, endHz: 1320, noise: 0.13, transient: 0.38, harmonic: 0.68, attack: 0.009, curve: 0.4, chime: 4 },
  bonusEnd: { label: 'Bonus resolve', duration: 1.1, startHz: 620, endHz: 190, noise: 0.09, transient: 0.22, harmonic: 0.48, attack: 0.012, curve: 1.25, chime: 2 },
  anticipation: { label: 'Anticipation rise', duration: 1.6, startHz: 74, endHz: 920, noise: 0.34, transient: 0.16, harmonic: 0.35, attack: 0.04, curve: 0.5 },
  cascadeDrop: { label: 'Cascade drop', duration: 0.3, startHz: 720, endHz: 105, noise: 0.32, transient: 0.62, harmonic: 0.3, attack: 0.003, curve: 1.8 },
  multiplierUp: { label: 'Multiplier rise', duration: 0.55, startHz: 310, endHz: 1180, noise: 0.04, transient: 0.2, harmonic: 0.5, attack: 0.006, curve: 0.62, chime: 2 },
});

function envelopeAt(time, duration, attack) {
  const attackGain = Math.min(1, time / Math.max(attack, 0.001));
  const releaseStart = duration * 0.68;
  const releaseGain = time < releaseStart ? 1 : Math.max(0, 1 - (time - releaseStart) / Math.max(duration - releaseStart, 0.001));
  return attackGain * Math.pow(releaseGain, 1.6);
}

export function analyzePcm(samples) {
  let peak = 0;
  let energy = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    energy += sample * sample;
  }
  return {
    peak,
    rms: samples.length ? Math.sqrt(energy / samples.length) : 0,
    clippedSamples: samples.reduce((count, sample) => count + (Math.abs(sample) >= 0.999 ? 1 : 0), 0),
  };
}

export function normalizePcm(samples, targetPeak = 0.88) {
  const { peak } = analyzePcm(samples);
  if (!peak) return Float32Array.from(samples);
  const gain = Math.min(targetPeak / peak, 8);
  return Float32Array.from(samples, sample => clamp(sample * gain));
}

export function synthesizeGameSound(presetName, options = {}) {
  const preset = SFX_PRESETS[presetName];
  if (!preset) throw new Error(`Unknown sound preset "${presetName}".`);
  const intensity = clamp(Number(options.intensity ?? 0.75), 0.1, 1);
  const variation = Math.max(1, Math.round(Number(options.variation || 1)));
  const duration = clamp(Number(options.duration || preset.duration), 0.08, 4);
  const random = seededRandom((options.seed || 4177) + variation * 7919 + presetName.length * 101);
  const samples = new Float32Array(Math.round(duration * SAMPLE_RATE));
  let phase = random() * Math.PI * 2;

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const progress = time / duration;
    const shaped = Math.pow(progress, preset.curve);
    const detune = 1 + (variation - 1) * 0.012;
    const frequency = Math.max(28, lerp(preset.startHz, preset.endHz, shaped) * detune);
    phase += Math.PI * 2 * frequency / SAMPLE_RATE;
    const fundamental = Math.sin(phase);
    const harmonic = Math.sin(phase * 2.01 + 0.6) * preset.harmonic + Math.sin(phase * 3.99) * preset.harmonic * 0.23;
    const noise = (random() * 2 - 1) * preset.noise * (0.35 + 0.65 * (1 - progress));
    const transient = (random() * 2 - 1) * preset.transient * Math.exp(-time * 42);
    const pulse = preset.chime
      ? Math.sin(phase * (1 + Math.floor(progress * preset.chime) * 0.26)) * 0.18 * (0.4 + 0.6 * Math.sin(Math.PI * progress) ** 2)
      : 0;
    const envelope = envelopeAt(time, duration, preset.attack);
    samples[index] = (fundamental * 0.52 + harmonic * 0.28 + noise + transient + pulse) * envelope * intensity;
  }

  const normalized = normalizePcm(samples, 0.86 + intensity * 0.08);
  return { samples: normalized, sampleRate: SAMPLE_RATE, duration, analysis: analyzePcm(normalized) };
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

export function encodeMonoWav(samples, sampleRate = SAMPLE_RATE) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = clamp(samples[index]);
    view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Uint8Array(buffer);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function wavDataUrl(samples, sampleRate = SAMPLE_RATE) {
  return `data:audio/wav;base64,${bytesToBase64(encodeMonoWav(samples, sampleRate))}`;
}

export function generateGameSound(presetName, options = {}) {
  const synthesized = synthesizeGameSound(presetName, options);
  return {
    src: wavDataUrl(synthesized.samples, synthesized.sampleRate),
    volume: 1,
    source: 'procedural',
    factory: {
      preset: presetName,
      variation: Math.max(1, Math.round(Number(options.variation || 1))),
      intensity: clamp(Number(options.intensity ?? 0.75), 0.1, 1),
      duration: synthesized.duration,
      sampleRate: synthesized.sampleRate,
      peak: synthesized.analysis.peak,
      rms: synthesized.analysis.rms,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function generateCoreSfxPack(options = {}) {
  const intensity = Number(options.intensity ?? 0.78);
  const singles = ['spinStart', 'winSmall', 'winMedium', 'winBig', 'winMega', 'wincap', 'bonusTrigger', 'bonusEnd', 'anticipation', 'cascadeDrop', 'multiplierUp'];
  const stingers = Object.fromEntries(singles.map((key, index) => [key, generateGameSound(key, { intensity, variation: index + 1 })]));
  stingers.reelStop = Array.from({ length: 5 }, (_, index) => generateGameSound('reelStop', { intensity: intensity * 0.9, variation: index + 1 }));
  stingers.scatterLand = Array.from({ length: 5 }, (_, index) => generateGameSound('scatterLand', { intensity, variation: index + 1 }));
  return stingers;
}

export async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read audio.'));
    reader.readAsDataURL(blob);
  });
}

export async function polishAudioBlob(blob, options = {}) {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) return { src: await blobToDataUrl(blob), source: 'recorded', factory: { processed: false } };
  const context = new Context();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const values = decoded.getChannelData(channel);
      for (let index = 0; index < mono.length; index += 1) mono[index] += values[index] / decoded.numberOfChannels;
    }
    const threshold = Number(options.silenceThreshold ?? 0.012);
    let start = 0;
    let end = mono.length;
    while (start < end && Math.abs(mono[start]) < threshold) start += 1;
    while (end > start && Math.abs(mono[end - 1]) < threshold) end -= 1;
    const padding = Math.round(decoded.sampleRate * 0.018);
    start = Math.max(0, start - padding);
    end = Math.min(mono.length, end + padding);
    let processed = normalizePcm(mono.subarray(start, end), Number(options.targetPeak ?? 0.88));
    const fadeSamples = Math.min(Math.round(decoded.sampleRate * Number(options.fadeSeconds ?? 0.012)), Math.floor(processed.length / 2));
    for (let index = 0; index < fadeSamples; index += 1) {
      const gain = index / Math.max(1, fadeSamples);
      processed[index] *= gain;
      processed[processed.length - 1 - index] *= gain;
    }
    return {
      src: wavDataUrl(processed, decoded.sampleRate),
      volume: 1,
      source: 'recorded',
      factory: { processed: true, duration: processed.length / decoded.sampleRate, sampleRate: decoded.sampleRate, ...analyzePcm(processed) },
    };
  } finally {
    await context.close();
  }
}
