import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileVisualEffectRecipe,
  createDefaultVisualEffectBindings,
  createCapabilityShowcaseBinding,
  createCapabilityShowcaseRecipe,
  createVisualEffectSeed,
  createVisualEffectsState,
  ensureVisualEffects,
  getVisualEffectBinding,
  getVisualCapabilitySummary,
  resolveVisualEffectIntensity,
  resolveVisualEffectLayout,
  validateVisualEffectsState,
  visualEffectsFingerprint,
  validateVisualEffectRecipe,
  VISUAL_EFFECT_NODE_TYPES,
  VISUAL_EFFECT_PLANNED_ADAPTERS,
} from '../src/engines/animation/VisualEffectRecipes.js';

test('the Arcane Impact reference recipe covers the reusable visual primitive set', () => {
  const recipe = createCapabilityShowcaseRecipe();
  assert.deepEqual(validateVisualEffectRecipe(recipe), []);
  const types = new Set(recipe.nodes.map(node => node.type));
  for (const required of ['glow', 'flare', 'orbit', 'projectile', 'trail', 'emitter', 'shockwave', 'camera', 'color-grade']) {
    assert.ok(types.has(required), `missing ${required}`);
  }
  assert.equal(VISUAL_EFFECT_NODE_TYPES.includes('spine'), false);
  assert.deepEqual(VISUAL_EFFECT_PLANNED_ADAPTERS, ['sprite', 'spine']);
});

test('compilation is deterministic for the same seed and changes particles for a different seed', () => {
  const recipe = createCapabilityShowcaseRecipe();
  const first = compileVisualEffectRecipe(recipe, { seed: 99, intensity: 3, viewport: 'mini' });
  const again = compileVisualEffectRecipe(recipe, { seed: 99, intensity: 3, viewport: 'mini' });
  const different = compileVisualEffectRecipe(recipe, { seed: 100, intensity: 3, viewport: 'mini' });
  const particles = plan => plan.nodes.find(node => node.type === 'emitter').particles;
  assert.deepEqual(particles(first), particles(again));
  assert.notDeepEqual(particles(first), particles(different));
  assert.equal(first.viewport.width, 390);
  assert.equal(first.transform.scale, Math.min(390 / 640, 520 / 360));
});

test('compilation preserves event anchors, time scale, and seed zero', () => {
  const plan = compileVisualEffectRecipe(createCapabilityShowcaseRecipe(), {
    origin: { x: 0, y: 24 }, target: { x: 640, y: 360 }, timeScale: 3, seed: 0,
  });
  assert.deepEqual(plan.origin, { x: 0, y: 24 });
  assert.deepEqual(plan.target, { x: 640, y: 360 });
  assert.equal(plan.timeScale, 3);
  assert.equal(plan.seed, 0);
});

test('preview layout maps cabinet pixels into the letterboxed design space', () => {
  const layout = resolveVisualEffectLayout(1280, 800);
  assert.equal(layout.scale, 2);
  assert.equal(layout.offsetX, 0);
  assert.equal(layout.offsetY, 40);
  assert.deepEqual(layout.toDesign({ x: 640, y: 400 }), { x: 320, y: 180 });
  assert.deepEqual(layout.toDesign({ x: -10, y: 9999 }), { x: 0, y: 360 });
});

test('event bindings resolve intensity and deterministic payload seeds', () => {
  const project = { animation: { visualEffects: createVisualEffectsState({ bindings: [createCapabilityShowcaseBinding()] }) } };
  assert.equal(createDefaultVisualEffectBindings().length, 0);
  assert.equal(getVisualEffectBinding(project, 'winInfo').recipeId, 'stake-studio.arcane-impact');
  assert.equal(resolveVisualEffectIntensity(getVisualEffectBinding(project, 'winInfo'), { amount: 5 }), 1);
  assert.equal(resolveVisualEffectIntensity(getVisualEffectBinding(project, 'winInfo'), { amount: 25 }), 2);
  assert.equal(resolveVisualEffectIntensity(getVisualEffectBinding(project, 'winInfo'), { amount: 75 }), 3);
  const payload = { amount: 25, mode: 'base', wins: [{ positions: [[0, 1], [2, 1]] }] };
  assert.equal(createVisualEffectSeed('winInfo', payload), createVisualEffectSeed('winInfo', structuredClone(payload)));
  assert.notEqual(createVisualEffectSeed('winInfo', payload), createVisualEffectSeed('wincap', payload));
  assert.deepEqual(validateVisualEffectsState(createVisualEffectsState({ recipes: [createCapabilityShowcaseRecipe()], bindings: [createCapabilityShowcaseBinding()] })), []);
  assert.match(visualEffectsFingerprint(project.animation.visualEffects), /^vfx-[0-9a-f]{8}$/);
});

test('motion variants preserve semantics while removing travel, shake, and particles', () => {
  const recipe = createCapabilityShowcaseRecipe();
  const full = compileVisualEffectRecipe(recipe, { motion: 'full', seed: 7 });
  const subtle = compileVisualEffectRecipe(recipe, { motion: 'subtle', seed: 7 });
  const none = compileVisualEffectRecipe(recipe, { motion: 'none', seed: 7 });
  const node = (plan, type) => plan.nodes.find(item => item.type === type);
  assert.ok(node(subtle, 'emitter').count < node(full, 'emitter').count);
  assert.equal(node(none, 'emitter').count, 0);
  assert.equal(node(none, 'camera').strength, 0);
  assert.equal(node(none, 'projectile').travelScale, 0);
  assert.ok(none.diagnostics.startedNodes.includes('impact-ring'));
  assert.equal(none.duration, 0.18);
});

test('invalid nodes, timing, slots, and budgets fail before playback', () => {
  const recipe = createCapabilityShowcaseRecipe();
  recipe.nodes.push({ id: 'broken', type: 'raw-glsl', blendMode: 'explode', start: 9, duration: -1, assetSlot: 'missing' });
  recipe.budgets.maxParticles = 2;
  const issues = validateVisualEffectRecipe(recipe);
  assert.ok(issues.some(issue => issue.message.includes('Unsupported node type')));
  assert.ok(issues.some(issue => issue.message.includes('Unsupported blend mode')));
  assert.ok(issues.some(issue => issue.message.includes('missing asset slot')));
  assert.ok(issues.some(issue => issue.message.includes('particle budget')));
  assert.throws(() => compileVisualEffectRecipe(recipe), /Unsupported node type/);
});

test('project effect state normalizes older projects without sharing mutable defaults', () => {
  const older = { animation: { spineAssets: [] } };
  const state = ensureVisualEffects(older);
  assert.equal(state.format, 'stake-studio-visual-effects-v1');
  assert.deepEqual(state.recipes, []);
  assert.equal(state.bindings.length, 0);
  const first = createVisualEffectsState();
  const second = createVisualEffectsState();
  first.recipes.push(createCapabilityShowcaseRecipe());
  assert.equal(second.recipes.length, 0);
});

test('capability summary distinguishes JSON Spine from binary .skel readiness', () => {
  const summary = getVisualCapabilitySummary({
    animation: {
      visualEffects: createVisualEffectsState({ recipes: [createCapabilityShowcaseRecipe()] }),
      spineAssets: [{ rawJSON: {} }, { rawBinary: 'data:application/octet-stream;base64,AA==' }],
    },
  });
  assert.equal(summary.recipeCount, 1);
  assert.equal(summary.spineJsonAssets, 1);
  assert.equal(summary.spineBinaryAssets, 1);
});
