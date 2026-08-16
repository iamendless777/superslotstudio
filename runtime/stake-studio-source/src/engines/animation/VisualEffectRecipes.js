export const VISUAL_EFFECTS_FORMAT = 'stake-studio-visual-effects-v1';
export const VISUAL_EFFECT_RECIPE_FORMAT = 'stake-studio-effect-recipe-v1';

export const VISUAL_EFFECT_NODE_TYPES = Object.freeze([
  'glow',
  'flare',
  'orbit',
  'projectile',
  'trail',
  'emitter',
  'shockwave',
  'camera',
  'color-grade',
]);

export const VISUAL_EFFECT_ASSET_ADAPTERS = Object.freeze(['motion-atlas']);
export const VISUAL_EFFECT_PLANNED_ADAPTERS = Object.freeze(['sprite', 'spine']);

export const VISUAL_EFFECT_BLEND_MODES = Object.freeze(['normal', 'add', 'screen', 'multiply']);
export const VISUAL_EFFECT_VIEWPORTS = Object.freeze({
  desktop: { width: 960, height: 540, label: 'Desktop' },
  mobile: { width: 540, height: 720, label: 'Mobile' },
  mini: { width: 390, height: 520, label: 'Mini' },
});

const MOTION_LEVELS = new Set(['full', 'subtle', 'none']);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clone = value => JSON.parse(JSON.stringify(value));

function seededRandom(seed = 1) {
  let state = (Number.isFinite(Number(seed)) ? Number(seed) : 1) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createDefaultVisualEffectBindings() {
  return [];
}

export function createCapabilityShowcaseBinding() {
  return {
    id: 'stake-studio.arcane-impact.win-info',
    event: 'winInfo',
    recipeId: 'stake-studio.arcane-impact',
    intensity: 'win-tier',
    timeScale: 3,
    enabled: true,
    blocking: false,
  };
}

export function createVisualEffectsState(overrides = {}) {
  return {
    format: VISUAL_EFFECTS_FORMAT,
    version: 1,
    runtime: {
      quality: 'balanced',
      reducedMotion: 'respect',
      maxParticles: 180,
      maxFilterPasses: 6,
      ...overrides.runtime,
    },
    motionAssets: Array.isArray(overrides.motionAssets) ? clone(overrides.motionAssets) : [],
    recipes: Array.isArray(overrides.recipes) ? clone(overrides.recipes) : [],
    bindings: Array.isArray(overrides.bindings) ? clone(overrides.bindings) : [],
  };
}

export function ensureVisualEffects(project) {
  project.animation ||= {};
  const raw = project.animation.visualEffects || {};
  project.animation.visualEffects = createVisualEffectsState(raw);
  return project.animation.visualEffects;
}

export function validateVisualEffectsState(raw) {
  const effects = createVisualEffectsState(raw || {});
  const issues = [];
  const motionAssetIds = new Set();
  for (const [index, asset] of effects.motionAssets.entries()) {
    const path = `motionAssets.${index}`;
    if (!String(asset?.id || '').trim()) issues.push({ severity: 'error', path: `${path}.id`, message: 'Motion atlas id is required.' });
    if (motionAssetIds.has(asset?.id)) issues.push({ severity: 'error', path: `${path}.id`, message: `Duplicate motion atlas id “${asset.id}”.` });
    motionAssetIds.add(asset?.id);
    if (!String(asset?.src || '').trim()) issues.push({ severity: 'error', path: `${path}.src`, message: 'Motion atlas image source is required.' });
    if (!(Number(asset?.columns) > 0) || !(Number(asset?.rows) > 0) || !(Number(asset?.frames) > 0)) {
      issues.push({ severity: 'error', path, message: 'Motion atlas columns, rows, and frame count must be positive.' });
    }
    if (Number(asset?.frames) > Number(asset?.columns) * Number(asset?.rows)) {
      issues.push({ severity: 'error', path: `${path}.frames`, message: 'Motion atlas frame count exceeds its grid capacity.' });
    }
    if (!(Number(asset?.fps) > 0 && Number(asset?.fps) <= 60)) issues.push({ severity: 'error', path: `${path}.fps`, message: 'Motion atlas fps must be between 1 and 60.' });
  }
  const recipeIds = new Set();
  for (const [index, recipe] of effects.recipes.entries()) {
    for (const issue of validateVisualEffectRecipe(recipe)) issues.push({ ...issue, path: `recipes.${index}${issue.path ? `.${issue.path}` : ''}` });
    for (const [nodeIndex, node] of (recipe.nodes || []).entries()) {
      if (node.motionAssetId && !motionAssetIds.has(node.motionAssetId)) {
        issues.push({ severity: 'error', path: `recipes.${index}.nodes.${nodeIndex}.motionAssetId`, message: `Node references missing motion atlas “${node.motionAssetId}”.` });
      }
    }
    if (recipeIds.has(recipe.id)) issues.push({ severity: 'error', path: `recipes.${index}.id`, message: `Duplicate recipe id “${recipe.id}”.` });
    recipeIds.add(recipe.id);
  }
  const bindingIds = new Set();
  const enabledEvents = new Set();
  for (const [index, binding] of effects.bindings.entries()) {
    const path = `bindings.${index}`;
    if (!String(binding?.id || '').trim()) issues.push({ severity: 'error', path: `${path}.id`, message: 'Binding id is required.' });
    if (bindingIds.has(binding?.id)) issues.push({ severity: 'error', path: `${path}.id`, message: `Duplicate binding id “${binding.id}”.` });
    bindingIds.add(binding?.id);
    if (!String(binding?.event || '').trim()) issues.push({ severity: 'error', path: `${path}.event`, message: 'Binding event is required.' });
    if (!recipeIds.has(binding?.recipeId)) issues.push({ severity: 'error', path: `${path}.recipeId`, message: `Binding references missing recipe “${binding?.recipeId}”.` });
    if (binding?.blocking === true) issues.push({ severity: 'error', path: `${path}.blocking`, message: 'Visual effect bindings must be non-blocking in runtime version 1.' });
    if (binding?.enabled !== false) {
      if (enabledEvents.has(binding.event)) issues.push({ severity: 'error', path: `${path}.event`, message: `Only one enabled binding is allowed for event “${binding.event}”.` });
      enabledEvents.add(binding.event);
    }
  }
  return issues;
}

export function visualEffectsFingerprint(raw) {
  const effects = createVisualEffectsState(raw || {});
  const canonical = JSON.stringify({
    format: effects.format,
    version: effects.version,
    runtime: effects.runtime,
    motionAssets: effects.motionAssets,
    recipes: effects.recipes,
    bindings: effects.bindings,
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index++) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `vfx-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createCapabilityShowcaseRecipe() {
  return {
    format: VISUAL_EFFECT_RECIPE_FORMAT,
    version: 1,
    id: 'stake-studio.arcane-impact',
    name: 'Arcane Impact',
    description: 'A deterministic reference shot proving the reusable real-time 2D effects pipeline.',
    designSpace: { width: 640, height: 360 },
    duration: 2.8,
    palette: ['#78f7ff', '#ad6cff', '#ffca57', '#ffffff'],
    assetSlots: [],
    budgets: { maxLiveObjects: 96, maxParticles: 56, maxFilterPasses: 4, targetFps: 55 },
    nodes: [
      { id: 'ambient-glow', type: 'glow', layer: 'underlay', blendMode: 'add', start: 0, duration: 2.8, strength: 0.7 },
      { id: 'rune-orbit', type: 'orbit', layer: 'world', blendMode: 'add', start: 0, duration: 2.8, speed: 1.2 },
      { id: 'launch-flare', type: 'flare', layer: 'effects', blendMode: 'add', start: 0.16, duration: 0.7, strength: 1 },
      { id: 'arcane-bolt', type: 'projectile', layer: 'effects', blendMode: 'add', start: 0.34, duration: 0.72, strength: 1 },
      { id: 'energy-trail', type: 'trail', layer: 'effects', blendMode: 'add', start: 0.34, duration: 0.92, strength: 0.9 },
      { id: 'impact-particles', type: 'emitter', layer: 'overlay', blendMode: 'add', start: 1.04, duration: 1.18, count: 42 },
      { id: 'impact-ring', type: 'shockwave', layer: 'overlay', blendMode: 'add', start: 1.02, duration: 0.92, strength: 1 },
      { id: 'camera-impulse', type: 'camera', layer: 'camera', blendMode: 'normal', start: 1.02, duration: 0.42, strength: 1 },
      { id: 'prismatic-grade', type: 'color-grade', layer: 'post', blendMode: 'screen', start: 0.94, duration: 0.52, strength: 0.55 },
    ],
    motionVariants: {
      subtle: { travelScale: 0.7, shakeScale: 0.35, particleScale: 0.45, spinScale: 0.5 },
      none: { travelScale: 0, shakeScale: 0, particleScale: 0, spinScale: 0, semanticImpact: true },
    },
  };
}

export function validateVisualEffectRecipe(recipe) {
  const issues = [];
  if (!recipe || typeof recipe !== 'object') return [{ severity: 'error', path: '', message: 'Recipe must be an object.' }];
  if (recipe.format !== VISUAL_EFFECT_RECIPE_FORMAT) issues.push({ severity: 'error', path: 'format', message: `Recipe format must be ${VISUAL_EFFECT_RECIPE_FORMAT}.` });
  if (!String(recipe.id || '').trim()) issues.push({ severity: 'error', path: 'id', message: 'Recipe id is required.' });
  if (recipe.version !== 1) issues.push({ severity: 'error', path: 'version', message: 'Only recipe version 1 is supported.' });
  if (!(Number(recipe.designSpace?.width) > 0) || !(Number(recipe.designSpace?.height) > 0)) {
    issues.push({ severity: 'error', path: 'designSpace', message: 'Design space must have positive width and height.' });
  }
  if (!(Number(recipe.duration) > 0)) issues.push({ severity: 'error', path: 'duration', message: 'Recipe duration must be positive.' });

  const slots = new Set();
  for (const [index, slot] of (recipe.assetSlots || []).entries()) {
    if (!String(slot?.id || '').trim()) issues.push({ severity: 'error', path: `assetSlots.${index}`, message: 'Asset slot id is required.' });
    if (slots.has(slot?.id)) issues.push({ severity: 'error', path: `assetSlots.${index}.id`, message: `Duplicate asset slot “${slot.id}”.` });
    slots.add(slot?.id);
  }

  const ids = new Set();
  if (!Array.isArray(recipe.nodes) || recipe.nodes.length === 0) issues.push({ severity: 'error', path: 'nodes', message: 'At least one effect node is required.' });
  for (const [index, node] of (recipe.nodes || []).entries()) {
    const path = `nodes.${index}`;
    if (!String(node?.id || '').trim()) issues.push({ severity: 'error', path: `${path}.id`, message: 'Node id is required.' });
    if (ids.has(node?.id)) issues.push({ severity: 'error', path: `${path}.id`, message: `Duplicate node id “${node.id}”.` });
    ids.add(node?.id);
    if (!VISUAL_EFFECT_NODE_TYPES.includes(node?.type)) issues.push({ severity: 'error', path: `${path}.type`, message: `Unsupported node type “${node?.type}”.` });
    if (!VISUAL_EFFECT_BLEND_MODES.includes(node?.blendMode || 'normal')) issues.push({ severity: 'error', path: `${path}.blendMode`, message: `Unsupported blend mode “${node?.blendMode}”.` });
    if (!(Number(node?.start) >= 0) || !(Number(node?.duration) > 0)) issues.push({ severity: 'error', path, message: 'Node start must be non-negative and duration must be positive.' });
    if (Number(node?.start) + Number(node?.duration) > Number(recipe.duration) + 0.001) issues.push({ severity: 'error', path, message: `Node “${node?.id}” exceeds the recipe duration.` });
    if (node?.assetSlot && !slots.has(node.assetSlot)) issues.push({ severity: 'error', path: `${path}.assetSlot`, message: `Node references missing asset slot “${node.assetSlot}”.` });
    if (node?.type === 'emitter' && (!(Number(node.count) >= 0) || Number(node.count) > Number(recipe.budgets?.maxParticles || 0))) {
      issues.push({ severity: 'error', path: `${path}.count`, message: `Emitter “${node.id}” exceeds the particle budget.` });
    }
  }

  const budgets = recipe.budgets || {};
  for (const key of ['maxLiveObjects', 'maxParticles', 'maxFilterPasses', 'targetFps']) {
    if (!(Number(budgets[key]) > 0)) issues.push({ severity: 'error', path: `budgets.${key}`, message: `${key} must be positive.` });
  }
  if (Number(budgets.maxLiveObjects) < (recipe.nodes || []).length) issues.push({ severity: 'error', path: 'budgets.maxLiveObjects', message: 'Live-object budget is smaller than the declared node count.' });
  return issues;
}

export function compileVisualEffectRecipe(recipe, input = {}) {
  const issues = validateVisualEffectRecipe(recipe);
  const errors = issues.filter(issue => issue.severity === 'error');
  if (errors.length) throw new Error(errors.map(issue => `${issue.path || 'recipe'}: ${issue.message}`).join('\n'));

  const viewportId = Object.hasOwn(VISUAL_EFFECT_VIEWPORTS, input.viewport) ? input.viewport : 'desktop';
  const viewport = { id: viewportId, ...VISUAL_EFFECT_VIEWPORTS[viewportId] };
  const motion = MOTION_LEVELS.has(input.motion) ? input.motion : 'full';
  const intensity = clamp(Number(input.intensity) || 2, 1, 3);
  const timeScale = clamp(Number(input.timeScale) || 1, 0.5, 4);
  const seed = (Number.isFinite(Number(input.seed)) ? Number(input.seed) : 1337) >>> 0;
  const random = seededRandom(seed);
  const variant = motion === 'full'
    ? { travelScale: 1, shakeScale: 1, particleScale: 1, spinScale: 1 }
    : recipe.motionVariants?.[motion] || {};
  const palette = Array.isArray(input.palette) && input.palette.length >= 2 ? input.palette : recipe.palette;
  const coordinate = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const point = (raw, fallback) => ({
    x: clamp(coordinate(raw?.x, fallback.x), 0, recipe.designSpace.width),
    y: clamp(coordinate(raw?.y, fallback.y), 0, recipe.designSpace.height),
  });
  const origin = point(input.origin, { x: 132, y: 180 });
  const target = point(input.target, { x: 512, y: 180 });

  const nodes = recipe.nodes.map(node => {
    const compiled = { ...node };
    compiled.strength = (Number(node.strength) || 1) * (0.72 + intensity * 0.2);
    compiled.motion = motion;
    if (node.type === 'camera') compiled.strength *= Number(variant.shakeScale ?? 1);
    if (node.type === 'orbit') compiled.speed = Number(node.speed || 1) * Number(variant.spinScale ?? 1);
    if (node.type === 'projectile' || node.type === 'trail') compiled.travelScale = Number(variant.travelScale ?? 1);
    if (node.type === 'emitter') {
      compiled.count = Math.round(Number(node.count || 0) * Number(variant.particleScale ?? 1) * (0.7 + intensity * 0.15));
      compiled.particles = Array.from({ length: compiled.count }, (_, index) => ({
        index,
        angle: random() * Math.PI * 2,
        speed: 34 + random() * 126,
        size: 1.2 + random() * 4.2,
        delay: random() * 0.16,
        life: 0.45 + random() * 0.72,
        color: palette[Math.floor(random() * palette.length)],
      }));
    }
    if (motion === 'none') {
      compiled.start = Math.min(0.12, Number(node.start) * 0.1);
      compiled.duration = node.type === 'glow' || node.type === 'shockwave' || node.type === 'color-grade' ? 0.15 : 0.001;
      compiled.staticSemanticFrame = ['glow', 'shockwave', 'color-grade', 'flare'].includes(node.type);
    }
    return compiled;
  });

  const design = recipe.designSpace;
  const scale = Math.min(viewport.width / design.width, viewport.height / design.height);
  return {
    format: VISUAL_EFFECT_RECIPE_FORMAT,
    recipeId: recipe.id,
    duration: motion === 'none' ? 0.18 : recipe.duration,
    seed,
    motion,
    intensity,
    timeScale,
    palette,
    origin,
    target,
    viewport,
    transform: {
      scale,
      x: (viewport.width - design.width * scale) / 2,
      y: (viewport.height - design.height * scale) / 2,
    },
    nodes,
    diagnostics: {
      recipeId: recipe.id,
      seed,
      startedNodes: nodes.filter(node => motion !== 'none' || node.staticSemanticFrame).map(node => node.id),
      missingAssets: [],
      peakLiveObjects: nodes.length + nodes.reduce((sum, node) => sum + Number(node.count || 0), 0),
    },
  };
}

export function getVisualCapabilitySummary(project) {
  const effects = project?.animation?.visualEffects || createVisualEffectsState();
  const spineAssets = project?.animation?.spineAssets || [];
  return {
    format: effects.format,
    recipeCount: effects.recipes?.length || 0,
    bindingCount: effects.bindings?.length || 0,
    motionAtlasAssets: effects.motionAssets?.length || 0,
    spineJsonAssets: spineAssets.filter(asset => asset?.rawJSON).length,
    spineBinaryAssets: spineAssets.filter(asset => asset?.rawBinary || asset?.binaryData).length,
    supportedNodes: [...VISUAL_EFFECT_NODE_TYPES],
    assetAdapters: [...VISUAL_EFFECT_ASSET_ADAPTERS],
    plannedAdapters: [...VISUAL_EFFECT_PLANNED_ADAPTERS],
  };
}

export function resolveVisualEffectRecipe(project, recipeId = 'stake-studio.arcane-impact') {
  const effects = project?.animation?.visualEffects || createVisualEffectsState();
  return effects.recipes?.find(recipe => recipe.id === recipeId)
    || (recipeId === 'stake-studio.arcane-impact' ? createCapabilityShowcaseRecipe() : null);
}

export function getVisualEffectBinding(project, event) {
  const effects = project?.animation?.visualEffects || createVisualEffectsState();
  return effects.bindings?.find(binding => binding.enabled !== false && binding.event === event) || null;
}

export function resolveVisualEffectIntensity(binding, payload = {}) {
  if (binding?.intensity !== 'win-tier') return clamp(Number(binding?.intensity) || 2, 1, 3);
  const amount = Math.max(0, Number(payload.amount ?? payload.runningAmount) || 0);
  if (amount >= 50) return 3;
  if (amount >= 10) return 2;
  return 1;
}

export function createVisualEffectSeed(event, payload = {}) {
  const positions = (payload.wins || []).flatMap(win => win.positions || []).map(position => Array.isArray(position)
    ? position.join(':')
    : `${Number(position?.reel) || 0}:${Number(position?.row) || 0}`).join('|');
  const input = `${event}|${payload.mode || ''}|${Number(payload.amount ?? payload.runningAmount) || 0}|${positions}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveVisualEffectLayout(surfaceWidth, surfaceHeight, designWidth = 640, designHeight = 360) {
  const width = Math.max(1, Number(surfaceWidth) || designWidth);
  const height = Math.max(1, Number(surfaceHeight) || designHeight);
  const scale = Math.min(width / designWidth, height / designHeight);
  const offsetX = (width - designWidth * scale) / 2;
  const offsetY = (height - designHeight * scale) / 2;
  return {
    width,
    height,
    designWidth,
    designHeight,
    scale,
    offsetX,
    offsetY,
    toDesign(point = {}) {
      return {
        x: clamp((Number(point.x) - offsetX) / scale, 0, designWidth),
        y: clamp((Number(point.y) - offsetY) / scale, 0, designHeight),
      };
    },
  };
}
