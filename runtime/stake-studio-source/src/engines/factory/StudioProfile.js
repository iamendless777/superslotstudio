export const STUDIO_PROFILE_FORMAT = 'stake-studio-profile-v1';

export const STUDIO_PROFILE_DEFAULTS = Object.freeze({
  format: STUDIO_PROFILE_FORMAT,
  providerName: '',
  providerNumber: '',
  brandPillars: [],
  qualityTarget: 'premium-mobile',
  cadenceTarget: 'every-other-day',
  defaultTone: 'cinematic',
  defaultBlueprintId: '',
  defaultProductionTrack: 'blueprint',
  defaultFactoryProfile: 'review',
  animationPipeline: 'native-spine-ready',
  audioPipeline: 'hybrid-generative',
  updatedAt: null,
});

const clean = (value, max = 120) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const ALLOWED = Object.freeze({
  qualityTarget: new Set(['premium-mobile', 'prototype']),
  cadenceTarget: new Set(['every-other-day', 'weekly']),
  defaultTone: new Set(['cinematic', 'brutal', 'mysterious', 'triumphant', 'playful', 'luxurious']),
  defaultFactoryProfile: new Set(['prototype', 'review', 'release']),
  defaultProductionTrack: new Set(['blueprint', 'flagship']),
  animationPipeline: new Set(['native-spine-ready', 'native-only', 'spine']),
  audioPipeline: new Set(['hybrid-generative', 'procedural-only', 'import-only']),
});

function choice(key, value, fallback) {
  const normalized = clean(value, 80);
  return ALLOWED[key].has(normalized) ? normalized : fallback;
}

function pillars(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map(item => clean(item, 40)).filter(Boolean))].slice(0, 5);
}

export function normalizeStudioProfile(input = {}, { stamp = false } = {}) {
  return {
    format: STUDIO_PROFILE_FORMAT,
    providerName: clean(input.providerName, 80),
    providerNumber: clean(input.providerNumber, 80),
    brandPillars: pillars(input.brandPillars),
    qualityTarget: choice('qualityTarget', input.qualityTarget, STUDIO_PROFILE_DEFAULTS.qualityTarget),
    cadenceTarget: choice('cadenceTarget', input.cadenceTarget, STUDIO_PROFILE_DEFAULTS.cadenceTarget),
    defaultTone: choice('defaultTone', input.defaultTone, STUDIO_PROFILE_DEFAULTS.defaultTone),
    defaultBlueprintId: clean(input.defaultBlueprintId, 80),
    defaultProductionTrack: choice('defaultProductionTrack', input.defaultProductionTrack, STUDIO_PROFILE_DEFAULTS.defaultProductionTrack),
    defaultFactoryProfile: choice('defaultFactoryProfile', input.defaultFactoryProfile, STUDIO_PROFILE_DEFAULTS.defaultFactoryProfile),
    animationPipeline: choice('animationPipeline', input.animationPipeline, STUDIO_PROFILE_DEFAULTS.animationPipeline),
    audioPipeline: choice('audioPipeline', input.audioPipeline, STUDIO_PROFILE_DEFAULTS.audioPipeline),
    updatedAt: stamp ? new Date().toISOString() : (clean(input.updatedAt, 40) || null),
  };
}

export function getStudioProfileReadiness(input = {}) {
  const profile = normalizeStudioProfile(input);
  const productionReady = Boolean(profile.providerName);
  const providerNumber = Number(profile.providerNumber || 0);
  const providerNumberValid = Number.isSafeInteger(providerNumber) && providerNumber >= 0;
  const releaseReady = productionReady && providerNumberValid;
  return {
    productionReady,
    releaseReady,
    missing: [
      ...(!profile.providerName ? ['providerName'] : []),
      ...(!providerNumberValid ? ['providerNumber'] : []),
    ],
    message: !productionReady
      ? 'Set the real provider name before launching the factory.'
      : !releaseReady
        ? 'Provider number must be a non-negative integer.'
        : 'Studio identity is ready for packaging; provider number 0 remains valid until Stake assigns the team number.',
  };
}

export function applyStudioProfileToLaunch(profileInput = {}, launchInput = {}) {
  const profile = normalizeStudioProfile(profileInput);
  return {
    ...launchInput,
    providerName: clean(launchInput.providerName, 80) || profile.providerName,
    tone: clean(launchInput.tone, 80) || profile.defaultTone,
    blueprintId: clean(launchInput.blueprintId, 80) || profile.defaultBlueprintId,
    productionTrack: clean(launchInput.productionTrack, 80) || profile.defaultProductionTrack,
    profile: clean(launchInput.profile, 80) || profile.defaultFactoryProfile,
    studioProfile: profile,
  };
}
