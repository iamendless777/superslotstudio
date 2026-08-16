import { auditSpineAsset } from './SpineAssetAudit.js';
import { spineSkeletonFormat, validateSpineSkeletonPayload } from './SpineAssetCodec.js';

export const ANIMATION_RUNTIME_VERSION = 1;
export const SPINE_RUNTIME_VERSION = '4.3';

export const STANDARD_ANIMATION_STATES = [
  'idle', 'spinStart', 'spinning', 'spinStop',
  'winSmall', 'winMedium', 'winBig', 'winMega', 'wincap',
  'anticipation', 'bonusEntry', 'bonusIdle', 'bonusExit',
  'freeSpinBanner', 'featureResult', 'lose', 'idleAlt',
];

const LOOPING_STATES = new Set(['idle', 'idleAlt', 'spinning', 'anticipation', 'bonusIdle']);

const FALLBACKS = {
  idleAlt: ['idle'],
  spinStart: ['spinning', 'idle'],
  spinning: ['spinStart', 'idle'],
  spinStop: ['idle'],
  winSmall: ['idle'],
  winMedium: ['winSmall', 'idle'],
  winBig: ['winMedium', 'winSmall', 'idle'],
  winMega: ['winBig', 'winMedium', 'winSmall', 'idle'],
  wincap: ['winMega', 'winBig', 'winMedium', 'winSmall', 'idle'],
  anticipation: ['spinning', 'idle'],
  bonusEntry: ['bonusIdle', 'idle'],
  bonusIdle: ['idle'],
  bonusExit: ['idle'],
  freeSpinBanner: ['bonusEntry', 'idle'],
  featureResult: ['bonusExit', 'winBig', 'winMedium', 'winSmall', 'idle'],
  lose: ['idle'],
};

const normalizeName = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function animationRuntimeFingerprint(project) {
  const animation = project?.animation || {};
  const canonical = JSON.stringify({
    runtime: animation.runtime || {},
    states: animation.states || {},
    stateAnimations: animation.stateAnimations || {},
    environment: animation.environment || null,
    particles: animation.particles || [],
    symbolMotion: (project?.theme?.symbols || []).map(symbol => ({ name: symbol.name, motionProfile: symbol.motionProfile || null })),
    spineAssets: (animation.spineAssets || []).map(asset => ({
      name: asset.name,
      skeletonFormat: asset.skeletonFormat || null,
      skeletonFileName: asset.skeletonFileName || null,
      rawJSON: asset.rawJSON || null,
      rawBinary: asset.rawBinary || null,
      atlasText: asset.atlasText || '',
      atlasImages: asset.atlasImages || {},
      atlasImage: asset.atlasImage || null,
      placement: asset.placement || null,
      activeSkin: asset.activeSkin || null,
      runtimeScale: asset.runtimeScale || 1,
    })),
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index++) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `spine-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function parseAnimationMapping(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    if (!value.asset || !value.animation) return null;
    return {
      asset: String(value.asset),
      animation: String(value.animation),
      loop: typeof value.loop === 'boolean' ? value.loop : undefined,
      mix: Number.isFinite(Number(value.mix)) ? Number(value.mix) : undefined,
    };
  }
  const separator = String(value).indexOf(':');
  if (separator <= 0 || separator === String(value).length - 1) return null;
  return {
    asset: String(value).slice(0, separator),
    animation: String(value).slice(separator + 1),
  };
}

export function animationFallbackChain(state) {
  return [state, ...(FALLBACKS[state] || (state !== 'idle' ? ['idle'] : []))];
}

export function getAtlasPageNames(text = '') {
  const lines = String(text).split(/\r?\n/);
  const candidates = lines
    .map((line, index) => ({ line, index }))
    .filter(item => item.line.trim() && !/^\s/.test(item.line) && !item.line.includes(':'));
  const pages = [];
  for (const [candidateIndex, candidate] of candidates.entries()) {
    const properties = [];
    for (let index = candidate.index + 1; index < lines.length; index++) {
      const line = lines[index];
      if (!line.trim() || (line.trim() && !/^\s/.test(line) && !line.includes(':'))) break;
      const property = line.trim().split(':')[0];
      if (property) properties.push(property);
    }
    const looksLikeImage = /\.(png|jpe?g|webp|ktx2?|basis)$/i.test(candidate.line.trim());
    const hasPageProperties = properties.some(property => ['format', 'filter', 'repeat', 'pma'].includes(property));
    if (candidateIndex === 0 || looksLikeImage || hasPageProperties) pages.push(candidate.line.trim());
  }
  return [...new Set(pages)];
}

export function getAtlasRegionNames(text = '') {
  const pages = new Set(getAtlasPageNames(text));
  return [...new Set(String(text).split(/\r?\n/)
    .filter(line => line.trim() && !/^\s/.test(line) && !line.includes(':'))
    .map(line => line.trim())
    .filter(name => !pages.has(name)))];
}

export function validateAnimationConfig(project) {
  const issues = [];
  const animation = project.animation || {};
  const assets = animation.spineAssets || [];
  const mappings = animation.stateAnimations || {};
  const assetByName = new Map(assets.map(asset => [asset.name, asset]));
  const mappedAssets = new Set();

  for (const [state, rawMapping] of Object.entries(mappings)) {
    const mapping = parseAnimationMapping(rawMapping);
    if (!mapping) {
      issues.push({ severity: 'error', category: 'animation', message: `State "${state}" has an invalid Spine mapping.` });
      continue;
    }
    const asset = assetByName.get(mapping.asset);
    if (!asset) {
      issues.push({ severity: 'error', category: 'animation', message: `State "${state}" references missing Spine asset "${mapping.asset}".` });
      continue;
    }
    mappedAssets.add(asset.name);
    if (!(asset.animations || []).some(item => item.name === mapping.animation)) {
      issues.push({ severity: 'error', category: 'animation', message: `State "${state}" references missing animation "${mapping.animation}" on "${asset.name}".` });
    }
  }

  for (const asset of assets) {
    const isMapped = mappedAssets.has(asset.name);
    const pages = asset.atlasPages?.length ? asset.atlasPages : getAtlasPageNames(asset.atlasText);
    const pageImages = asset.atlasImages || {};
    const missingPages = pages.filter((page, index) => !pageImages[page] && !(index === 0 && asset.atlasImage));
    const missing = [];
    let skeletonFormat = null;
    try { skeletonFormat = spineSkeletonFormat(asset); } catch (error) {
      issues.push({ severity: isMapped ? 'error' : 'warning', category: 'animation', message: `Spine asset "${asset.name}": ${error.message}` });
    }
    if (!skeletonFormat) missing.push('skeleton JSON or .skel');
    for (const payloadIssue of validateSpineSkeletonPayload(asset)) {
      issues.push({ severity: isMapped ? 'error' : 'warning', category: 'animation', message: `Spine asset "${asset.name}": ${payloadIssue}` });
    }
    if (!asset.atlasText) missing.push('.atlas');
    if (!pages.length || missingPages.length) missing.push(missingPages.length ? `atlas images (${missingPages.join(', ')})` : 'atlas image');
    if (missing.length) {
      issues.push({
        severity: isMapped ? 'error' : 'warning', category: 'animation',
        message: `Spine asset "${asset.name}" is missing ${missing.join(', ')}${isMapped ? ' and cannot play.' : '.'}`,
      });
    }
    const embeddedImages = pages.map((page, index) => pageImages[page] || (index === 0 ? asset.atlasImage : null)).filter(Boolean);
    if (embeddedImages.some(image => !String(image).startsWith('data:image/'))) {
      issues.push({ severity: isMapped ? 'error' : 'warning', category: 'animation', message: `Spine asset "${asset.name}" must embed every atlas page image before it can be exported.` });
    }
    if (asset.version && !String(asset.version).startsWith(`${SPINE_RUNTIME_VERSION}.`)) {
      issues.push({
        severity: isMapped ? 'error' : 'warning', category: 'animation',
        message: `Spine asset "${asset.name}" was exported with ${asset.version}; this studio runtime requires ${SPINE_RUNTIME_VERSION}.x.`,
      });
    }
    const audit = auditSpineAsset(asset);
    for (const finding of audit.issues) {
      issues.push({
        severity: finding.severity === 'error' && !isMapped ? 'warning' : finding.severity,
        category: 'animation', message: `Spine asset "${asset.name}": ${finding.message}`,
        remedy: finding.remedy,
      });
    }
    const customSprings = (project.production?.rig?.secondaryMotion || []).filter(system => system.asset === asset.name && system.enabled !== false).length;
    if (audit.metrics.constraints.physics && customSprings) {
      issues.push({
        severity: 'warning', category: 'animation',
        message: `Spine asset "${asset.name}" combines ${audit.metrics.constraints.physics} authored physics constraint${audit.metrics.constraints.physics === 1 ? '' : 's'} with ${customSprings} Studio spring${customSprings === 1 ? '' : 's'}; verify the same bone is not driven twice.`,
      });
    }
  }

  if (mappedAssets.size > 1) {
    issues.push({ severity: 'error', category: 'animation', message: 'Animation Runtime v1 supports one active Spine skeleton per game; state mappings currently span multiple assets.' });
  }

  if (mappedAssets.size > 0) {
    if (!mappings.idle) issues.push({ severity: 'error', category: 'animation', message: 'A mapped Spine skeleton requires an idle animation.' });
    for (const state of ['spinStart', 'spinning', 'spinStop', 'winSmall', 'anticipation', 'bonusEntry', 'bonusIdle', 'wincap']) {
      if (!mappings[state]) issues.push({ severity: 'warning', category: 'animation', message: `Spine state "${state}" is unmapped and will use the fallback chain.` });
    }
  }

  return issues;
}

export function createAnimationManifest(project) {
  const engine = new AnimationEngine(project);
  return {
    format: 'stake-studio-animation-v1',
    runtimeVersion: ANIMATION_RUNTIME_VERSION,
    renderer: 'pixi-v8',
    spineRuntime: SPINE_RUNTIME_VERSION,
    cabinetSize: {
      width: Math.max(1, Number(project.theme?.cabinet?.width) || 1280),
      height: Math.max(1, Number(project.theme?.cabinet?.height) || 800),
    },
    runtime: engine.runtime,
    states: Object.fromEntries(STANDARD_ANIMATION_STATES.map(state => [state, engine.describeState(state)])),
    assets: (project.animation?.spineAssets || []).map(asset => ({
      name: asset.name,
      skeletonFormat: spineSkeletonFormat(asset),
      skeletonFileName: asset.skeletonFileName || null,
      version: asset.version,
      width: asset.width,
      height: asset.height,
      animations: (asset.animations || []).map(animation => animation.name),
      atlasPages: asset.atlasPages?.length ? asset.atlasPages : getAtlasPageNames(asset.atlasText),
      placement: asset.placement || null,
      activeSkin: asset.activeSkin || null,
      audit: auditSpineAsset(asset),
    })),
  };
}

export class AnimationEngine {
  constructor(project) {
    this.project = project;
    this.currentState = 'idle';
  }

  get animation() { return this.project.animation || {}; }
  get states() { return this.animation.states || {}; }
  get runtime() {
    return {
      version: ANIMATION_RUNTIME_VERSION,
      defaultMix: 0.18,
      reducedMotion: 'respect',
      ...(this.animation.runtime || {}),
    };
  }

  mappingFor(state) {
    for (const candidate of animationFallbackChain(state)) {
      const mapping = parseAnimationMapping(this.animation.stateAnimations?.[candidate]);
      if (mapping) return { state: candidate, ...mapping };
    }
    return null;
  }

  describeState(state) {
    const resolved = this.mappingFor(state);
    const stateConfig = this.states[state] || {};
    return {
      state,
      resolvedState: resolved?.state || null,
      duration: stateConfig.duration ?? null,
      loop: resolved?.loop ?? LOOPING_STATES.has(resolved?.state || state),
      mix: resolved?.mix ?? (Number(this.runtime.defaultMix) || 0),
      asset: resolved?.asset || null,
      animation: resolved?.animation || null,
      fallbacks: animationFallbackChain(state).slice(1),
    };
  }

  transition(toState) {
    const prev = this.currentState;
    this.currentState = toState;
    return { from: prev, to: toState, ...this.describeState(toState) };
  }

  getStateLayers(state) {
    return this.states[state]?.layers || [];
  }

  getWinTier(multiplier) {
    if (multiplier >= 100) return 'wincap';
    if (multiplier >= 50) return 'winMega';
    if (multiplier >= 20) return 'winBig';
    if (multiplier >= 5) return 'winMedium';
    return 'winSmall';
  }

  getParticles(trigger) {
    return (this.animation.particles || []).filter(p => p.trigger === trigger);
  }

  poseCandidates(state) {
    const primary = normalizeName(state);
    const names = animationFallbackChain(state).filter(candidate => candidate !== 'idle').map(normalizeName);
    if (['spin-start', 'spinning', 'spin-stop'].includes(primary)) names.push('spin');
    if (primary.startsWith('win')) names.push('win');
    if (['bonus-entry', 'bonus-idle', 'feature-result'].includes(primary)) names.push('feature');
    if (primary === 'wincap') names.push('max-win');
    return [...new Set([...names, 'idle'])];
  }

  exportTimeline() {
    return STANDARD_ANIMATION_STATES.map(name => ({
      ...this.describeState(name),
      layerCount: (this.states[name]?.layers || []).length,
    }));
  }
}
