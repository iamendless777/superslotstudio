import { AnimationEngine, STANDARD_ANIMATION_STATES, parseAnimationMapping } from './AnimationEngine.js';

export const PRODUCTION_ANIMATION_STATES = [
  'idle', 'spinStart', 'spinning', 'spinStop', 'winSmall',
  'anticipation', 'bonusEntry', 'bonusIdle', 'wincap',
];

export const ANIMATION_QUALITY_PRESETS = {
  snappy: {
    name: 'Snappy', description: 'Fast, readable reactions for rapid-play slots.', defaultMix: 0.1,
    durations: { spinStart: 180, spinStop: 140, winSmall: 900, winMedium: 1500, winBig: 2600, winMega: 3600, wincap: 5000, bonusEntry: 1300, bonusExit: 1200, freeSpinBanner: 950 },
  },
  balanced: {
    name: 'Balanced', description: 'Studio default with quick spins and substantial wins.', defaultMix: 0.18,
    durations: { spinStart: 300, spinStop: 200, winSmall: 1500, winMedium: 2500, winBig: 4000, winMega: 5000, wincap: 6000, bonusEntry: 2000, bonusExit: 2000, freeSpinBanner: 1500 },
  },
  cinematic: {
    name: 'Cinematic', description: 'Longer blends and held celebrations for character-led games.', defaultMix: 0.28,
    durations: { spinStart: 420, spinStop: 300, winSmall: 1900, winMedium: 3200, winBig: 4800, winMega: 6200, wincap: 7600, bonusEntry: 2600, bonusExit: 2400, freeSpinBanner: 1900 },
  },
};

const ALIASES = {
  idle: ['idle', 'idle-loop', 'breathe', 'breathing', 'stand', 'standing'],
  idleAlt: ['idle-alt', 'alternate-idle', 'idle-2', 'fidget', 'look-around'],
  spinStart: ['spin-start', 'start-spin', 'spin-intro', 'windup', 'wind-up', 'pull'],
  spinning: ['spinning', 'spin-loop', 'loop-spin', 'spin'],
  spinStop: ['spin-stop', 'stop-spin', 'spin-end', 'land', 'landing'],
  winSmall: ['win-small', 'small-win', 'win-1', 'celebrate-small', 'cheer-small', 'win'],
  winMedium: ['win-medium', 'medium-win', 'win-2', 'celebrate-medium', 'cheer-medium'],
  winBig: ['win-big', 'big-win', 'win-3', 'celebrate-big', 'cheer-big'],
  winMega: ['win-mega', 'mega-win', 'win-4', 'celebrate-mega', 'cheer-mega'],
  wincap: ['wincap', 'win-cap', 'max-win', 'maximum-win', 'jackpot'],
  anticipation: ['anticipation', 'anticipate', 'tension', 'suspense', 'near-miss'],
  bonusEntry: ['bonus-entry', 'enter-bonus', 'bonus-intro', 'feature-entry', 'feature-intro'],
  bonusIdle: ['bonus-idle', 'feature-idle', 'bonus-loop', 'feature-loop'],
  bonusExit: ['bonus-exit', 'exit-bonus', 'bonus-outro', 'feature-exit', 'feature-outro'],
  freeSpinBanner: ['free-spin-banner', 'freespin-banner', 'free-spins', 'freespins'],
  featureResult: ['feature-result', 'bonus-result', 'feature-complete', 'bonus-complete'],
  lose: ['lose', 'loss', 'no-win', 'miss', 'disappointed'],
};

export const normalizeAnimationName = value => String(value || '').trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function aliasScore(animationName, alias, state) {
  const name = normalizeAnimationName(animationName);
  const candidate = normalizeAnimationName(alias);
  if (!name || !candidate) return 0;
  if (name === normalizeAnimationName(state)) return 130;
  if (name === candidate) return 120;
  if (name.startsWith(`${candidate}-`) || name.endsWith(`-${candidate}`)) return 95;
  const nameTokens = new Set(name.split('-'));
  const candidateTokens = candidate.split('-');
  if (candidateTokens.length > 1 && candidateTokens.every(token => nameTokens.has(token))) return 86;
  if (candidate.length >= 4 && nameTokens.has(candidate)) return 72;
  return 0;
}

export function scoreAnimationForState(animationName, state) {
  let score = Math.max(0, ...(ALIASES[state] || []).map(alias => aliasScore(animationName, alias, state)));
  const name = normalizeAnimationName(animationName);
  if (state === 'idle' && /(^|-)(alt|alternate|fidget|2)(-|$)/.test(name)) score -= 80;
  if (state === 'spinStart' && /(^|-)(stop|end|land)(-|$)/.test(name)) score -= 100;
  if (state === 'spinStop' && /(^|-)(start|intro|windup)(-|$)/.test(name)) score -= 100;
  return Math.max(0, score);
}

export function suggestStateMappings(asset, { minimumScore = 70 } = {}) {
  const suggestions = {};
  const animations = asset?.animations || [];
  for (const state of STANDARD_ANIMATION_STATES) {
    const ranked = animations.map(animation => ({
      animation: animation.name,
      score: scoreAnimationForState(animation.name, state),
    })).filter(result => result.score >= minimumScore)
      .sort((a, b) => b.score - a.score || a.animation.localeCompare(b.animation));
    if (ranked[0]) suggestions[state] = { asset: asset.name, ...ranked[0] };
  }
  return suggestions;
}

export function applySuggestedMappings(project, asset, { overwrite = false, minimumScore = 70 } = {}) {
  project.animation.stateAnimations ||= {};
  const suggestions = suggestStateMappings(asset, { minimumScore });
  const applied = [];
  for (const [state, suggestion] of Object.entries(suggestions)) {
    if (!overwrite && project.animation.stateAnimations[state]) continue;
    project.animation.stateAnimations[state] = `${suggestion.asset}:${suggestion.animation}`;
    applied.push({ state, ...suggestion });
  }
  return { suggestions, applied };
}

export function applyAnimationQualityPreset(project, presetId = 'balanced') {
  const preset = ANIMATION_QUALITY_PRESETS[presetId] || ANIMATION_QUALITY_PRESETS.balanced;
  project.animation.runtime ||= {};
  project.animation.runtime.version = 1;
  project.animation.runtime.profile = presetId in ANIMATION_QUALITY_PRESETS ? presetId : 'balanced';
  project.animation.runtime.defaultMix = preset.defaultMix;
  for (const [state, duration] of Object.entries(preset.durations)) {
    project.animation.states[state] ||= { layers: [] };
    project.animation.states[state].duration = duration;
  }
  return preset;
}

export function getAnimationCoverage(project) {
  const mappings = project.animation?.stateAnimations || {};
  const direct = STANDARD_ANIMATION_STATES.filter(state => parseAnimationMapping(mappings[state]));
  const engine = new AnimationEngine(project);
  const resolved = STANDARD_ANIMATION_STATES.filter(state => engine.describeState(state).animation);
  const productionDirect = PRODUCTION_ANIMATION_STATES.filter(state => parseAnimationMapping(mappings[state]));
  const productionResolved = PRODUCTION_ANIMATION_STATES.filter(state => engine.describeState(state).animation);
  return {
    direct, resolved, productionDirect, productionResolved,
    directPercent: Math.round(direct.length / STANDARD_ANIMATION_STATES.length * 100),
    resolvedPercent: Math.round(resolved.length / STANDARD_ANIMATION_STATES.length * 100),
    productionPercent: Math.round(productionResolved.length / PRODUCTION_ANIMATION_STATES.length * 100),
    missingProduction: PRODUCTION_ANIMATION_STATES.filter(state => !engine.describeState(state).animation),
  };
}
