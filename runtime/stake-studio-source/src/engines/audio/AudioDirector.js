export const AUDIO_DIRECTOR_VERSION = 1;

export const AUDIO_EVENT_SEQUENCE = Object.freeze([
  'spinStart', 'reelStop', 'scatterLand', 'anticipation', 'winSmall', 'winMedium',
  'winBig', 'winMega', 'multiplierUp', 'cascadeDrop', 'bonusTrigger', 'bonusEnd', 'wincap',
]);

export const DUCKING_EVENTS = Object.freeze(['winBig', 'winMega', 'wincap', 'bonusTrigger']);

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

export function createProfessionalAudioDirector() {
  return {
    version: AUDIO_DIRECTOR_VERSION,
    enabled: true,
    buses: {
      master: 1,
      music: 0.72,
      ambience: 0.48,
      sfx: 0.9,
      voice: 1,
    },
    ducking: {
      enabled: true,
      amount: 0.55,
      attackMs: 55,
      releaseMs: 480,
      events: [...DUCKING_EVENTS],
      voice: true,
    },
    variation: {
      avoidImmediateRepeat: true,
      pitchJitterCents: 16,
      volumeJitter: 0.035,
    },
    concurrency: {
      totalStingers: 8,
      sameEvent: 2,
    },
    mastering: {
      targetPeakDbfs: -1,
      referenceLufs: -16,
    },
  };
}

export function normalizeAudioDirector(value = {}) {
  const base = createProfessionalAudioDirector();
  const buses = { ...base.buses, ...(value.buses || {}) };
  for (const key of Object.keys(buses)) buses[key] = clamp(buses[key], 0, 1.25);
  const ducking = { ...base.ducking, ...(value.ducking || {}) };
  ducking.enabled = Boolean(ducking.enabled);
  ducking.amount = clamp(ducking.amount, 0, 0.9);
  ducking.attackMs = Math.round(clamp(ducking.attackMs, 5, 2000));
  ducking.releaseMs = Math.round(clamp(ducking.releaseMs, 20, 5000));
  ducking.events = Array.isArray(ducking.events) ? [...new Set(ducking.events.filter(event => AUDIO_EVENT_SEQUENCE.includes(event)))] : [...DUCKING_EVENTS];
  ducking.voice = ducking.voice !== false;
  const variation = { ...base.variation, ...(value.variation || {}) };
  variation.avoidImmediateRepeat = variation.avoidImmediateRepeat !== false;
  variation.pitchJitterCents = Math.round(clamp(variation.pitchJitterCents, 0, 100));
  variation.volumeJitter = clamp(variation.volumeJitter, 0, 0.2);
  const concurrency = { ...base.concurrency, ...(value.concurrency || {}) };
  concurrency.totalStingers = Math.round(clamp(concurrency.totalStingers, 1, 32));
  concurrency.sameEvent = Math.round(clamp(concurrency.sameEvent, 1, 8));
  const mastering = { ...base.mastering, ...(value.mastering || {}) };
  mastering.targetPeakDbfs = clamp(mastering.targetPeakDbfs, -12, -0.1);
  mastering.referenceLufs = clamp(mastering.referenceLufs, -30, -8);
  return {
    ...base,
    ...value,
    version: AUDIO_DIRECTOR_VERSION,
    enabled: value.enabled !== false,
    buses,
    ducking,
    variation,
    concurrency,
    mastering,
  };
}

export function audioAssetBus(type, asset) {
  if (type === 'music') return 'music';
  if (type === 'ambience') return 'ambience';
  if (asset?.source === 'openai-voice' || asset?.source === 'recorded-voice') return 'voice';
  return 'sfx';
}

export function flattenAudioAssets(project) {
  const assets = [];
  for (const [key, asset] of Object.entries(project.audio?.layers || {})) {
    if (asset?.src) assets.push({ key, type: key === 'ambience' ? 'ambience' : 'music', asset });
  }
  for (const [event, value] of Object.entries(project.audio?.stingers || {})) {
    if (Array.isArray(value)) value.forEach((asset, index) => { if (asset?.src) assets.push({ key: `${event}_${index}`, event, index, type: 'stinger', asset }); });
    else if (value?.src) assets.push({ key: event, event, type: 'stinger', asset: value });
  }
  return assets;
}

function embeddedBytes(src) {
  if (!String(src || '').startsWith('data:')) return 0;
  const payload = String(src).split(',')[1] || '';
  return Math.floor(payload.length * 0.75);
}

export function auditAudioDirector(project) {
  const director = normalizeAudioDirector(project.audio?.director);
  const assets = flattenAudioAssets(project);
  const missingEvents = AUDIO_EVENT_SEQUENCE.filter(event => {
    const value = project.audio?.stingers?.[event];
    return Array.isArray(value) ? !value.some(asset => asset?.src) : !value?.src;
  });
  const assignedEvents = AUDIO_EVENT_SEQUENCE.length - missingEvents.length;
  const unsafePeaks = assets.filter(({ asset }) => Number(asset.factory?.peak) >= 0.99).map(({ key }) => key);
  const sources = assets.reduce((totals, { asset }) => {
    const source = asset.source || 'imported';
    totals[source] = (totals[source] || 0) + 1;
    return totals;
  }, {});
  const reelVariations = (project.audio?.stingers?.reelStop || []).filter(asset => asset?.src).length;
  const scatterVariations = (project.audio?.stingers?.scatterLand || []).filter(asset => asset?.src).length;
  const worldBedReady = Boolean(project.audio?.layers?.baseMusic || project.audio?.layers?.ambience);
  const warnings = [];
  if (!worldBedReady) warnings.push('Add base music or ambience to establish the world.');
  if (missingEvents.length) warnings.push(`Missing event audio: ${missingEvents.join(', ')}.`);
  if (reelVariations < 3) warnings.push('Use at least three reel-stop variations to prevent repetition fatigue.');
  if (scatterVariations < 3) warnings.push('Use at least three scatter-land variations for escalating landings.');
  if (!director.ducking.enabled) warnings.push('Enable ducking so voice and major wins remain intelligible.');
  if (unsafePeaks.length) warnings.push(`Peak metadata indicates possible clipping: ${unsafePeaks.join(', ')}.`);
  return {
    version: AUDIO_DIRECTOR_VERSION,
    assignedEvents,
    totalEvents: AUDIO_EVENT_SEQUENCE.length,
    coverage: Math.round(assignedEvents / AUDIO_EVENT_SEQUENCE.length * 100),
    missingEvents,
    assetCount: assets.length,
    reelVariations,
    scatterVariations,
    worldBedReady,
    unsafePeaks,
    sources,
    embeddedBytes: assets.reduce((total, { asset }) => total + embeddedBytes(asset.src), 0),
    duckingReady: director.ducking.enabled && director.ducking.amount > 0,
    warnings,
    ready: worldBedReady && missingEvents.length === 0 && reelVariations >= 3 && scatterVariations >= 3 && unsafePeaks.length === 0 && director.ducking.enabled,
  };
}

export class AudioDirector {
  constructor(project, random = Math.random) {
    this.project = project;
    this.random = random;
    this.profile = normalizeAudioDirector(project.audio?.director);
    this.previousVariation = new Map();
  }

  refresh() {
    this.profile = normalizeAudioDirector(this.project.audio?.director);
    return this.profile;
  }

  busGain(type, asset) {
    const bus = audioAssetBus(type, asset);
    return Number(this.profile.buses[bus] ?? 1);
  }

  chooseVariation(event, assets) {
    const available = (assets || []).map((asset, index) => ({ asset, index })).filter(item => item.asset?.src);
    if (!available.length) return null;
    if (available.length === 1) return available[0];
    let candidates = available;
    const previous = this.previousVariation.get(event);
    if (this.profile.variation.avoidImmediateRepeat && previous !== undefined) candidates = available.filter(item => item.index !== previous);
    const selected = candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))];
    this.previousVariation.set(event, selected.index);
    return selected;
  }

  playbackVariation() {
    const spread = this.profile.variation;
    return {
      rate: 2 ** (((this.random() * 2 - 1) * spread.pitchJitterCents) / 1200),
      volume: 1 + (this.random() * 2 - 1) * spread.volumeJitter,
    };
  }

  shouldDuck(event, asset) {
    if (!this.profile.ducking.enabled) return false;
    if (asset?.orchestration?.ducking === true) return true;
    if (this.profile.ducking.voice && audioAssetBus('stinger', asset) === 'voice') return true;
    return this.profile.ducking.events.includes(event);
  }

  exportManifest() {
    return { ...this.profile, audit: auditAudioDirector(this.project) };
  }
}
