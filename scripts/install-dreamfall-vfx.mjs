#!/usr/bin/env node

import fs from 'node:fs';

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  throw new Error('Usage: install-dreamfall-vfx.mjs <project.json> <output.json>');
}

const project = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

const recipe = ({ id, name, description, duration, palette, budgets, nodes }) => ({
  format: 'stake-studio-effect-recipe-v1',
  version: 1,
  id,
  name,
  description,
  designSpace: { width: 640, height: 360 },
  duration,
  palette,
  assetSlots: [],
  budgets,
  nodes,
  motionVariants: {
    subtle: { travelScale: 0.68, shakeScale: 0.24, particleScale: 0.42, spinScale: 0.48 },
    none: { travelScale: 0, shakeScale: 0, particleScale: 0, spinScale: 0, semanticImpact: true },
  },
});

const recipes = [
  recipe({
    id: 'dreamfall.oneiric-win-impact',
    name: 'Oneiric Win Impact',
    description: 'A cyan dream-thread travels from Morpheus into the resolved symbol, then breaks into restrained ivory and gold starlight.',
    duration: 2.4,
    palette: ['#55D6F2', '#E9E4FF', '#D8AF55', '#8A6BC7'],
    budgets: { maxLiveObjects: 56, maxParticles: 28, maxFilterPasses: 3, targetFps: 58 },
    nodes: [
      { id: 'win-dream-glow', type: 'glow', layer: 'underlay', blendMode: 'add', start: 0, duration: 2.4, strength: 0.52 },
      { id: 'win-mask-orbit', type: 'orbit', layer: 'world', blendMode: 'screen', start: 0, duration: 1.72, speed: 0.66 },
      { id: 'win-eye-flare', type: 'flare', layer: 'effects', blendMode: 'add', start: 0.1, duration: 0.52, strength: 0.72 },
      { id: 'win-dream-thread', type: 'projectile', layer: 'effects', blendMode: 'add', start: 0.24, duration: 0.7, strength: 0.86 },
      { id: 'win-thread-trail', type: 'trail', layer: 'effects', blendMode: 'screen', start: 0.24, duration: 0.92, strength: 0.68 },
      { id: 'win-starfall', type: 'emitter', layer: 'overlay', blendMode: 'add', start: 0.88, duration: 1.08, count: 24 },
      { id: 'win-symbol-ring', type: 'shockwave', layer: 'overlay', blendMode: 'screen', start: 0.86, duration: 0.86, strength: 0.78 },
      { id: 'win-camera-breath', type: 'camera', layer: 'camera', blendMode: 'normal', start: 0.88, duration: 0.28, strength: 0.46 },
      { id: 'win-oneiric-grade', type: 'color-grade', layer: 'post', blendMode: 'screen', start: 0.82, duration: 0.46, strength: 0.24 },
    ],
  }),
  recipe({
    id: 'dreamfall.gate-awakening',
    name: 'Gate of Sleep Awakening',
    description: 'The bonus gate gathers a slow constellation orbit before opening through a cool cyan shockwave and moonlit dust.',
    duration: 2.6,
    palette: ['#39D9FF', '#C7F5FF', '#E9E4FF', '#C89B45'],
    budgets: { maxLiveObjects: 48, maxParticles: 22, maxFilterPasses: 3, targetFps: 58 },
    nodes: [
      { id: 'gate-aura', type: 'glow', layer: 'underlay', blendMode: 'add', start: 0, duration: 2.6, strength: 0.62 },
      { id: 'gate-constellation', type: 'orbit', layer: 'world', blendMode: 'screen', start: 0, duration: 2.28, speed: 0.54 },
      { id: 'gate-seam-flare', type: 'flare', layer: 'effects', blendMode: 'add', start: 0.28, duration: 0.82, strength: 0.82 },
      { id: 'gate-opening-ring', type: 'shockwave', layer: 'overlay', blendMode: 'screen', start: 0.92, duration: 1.08, strength: 0.9 },
      { id: 'gate-dream-dust', type: 'emitter', layer: 'overlay', blendMode: 'add', start: 0.94, duration: 1.28, count: 18 },
      { id: 'gate-camera-draw', type: 'camera', layer: 'camera', blendMode: 'normal', start: 0.96, duration: 0.34, strength: 0.32 },
      { id: 'gate-moon-grade', type: 'color-grade', layer: 'post', blendMode: 'screen', start: 0.84, duration: 0.72, strength: 0.3 },
    ],
  }),
  recipe({
    id: 'dreamfall.sovereign-verdict',
    name: 'Sovereign Verdict',
    description: 'Morpheus delivers the maximum-win verdict with a mask flare, coiling dream thread, double impact ring and contained constellation burst.',
    duration: 3.4,
    palette: ['#55D6F2', '#FFFFFF', '#F0C86A', '#9B72E8'],
    budgets: { maxLiveObjects: 72, maxParticles: 40, maxFilterPasses: 4, targetFps: 55 },
    nodes: [
      { id: 'verdict-sovereign-glow', type: 'glow', layer: 'underlay', blendMode: 'add', start: 0, duration: 3.4, strength: 0.78 },
      { id: 'verdict-mask-orbit', type: 'orbit', layer: 'world', blendMode: 'screen', start: 0, duration: 3.2, speed: 0.82 },
      { id: 'verdict-mask-flare', type: 'flare', layer: 'effects', blendMode: 'add', start: 0.16, duration: 0.76, strength: 1 },
      { id: 'verdict-dream-spear', type: 'projectile', layer: 'effects', blendMode: 'add', start: 0.38, duration: 0.86, strength: 1 },
      { id: 'verdict-constellation-trail', type: 'trail', layer: 'effects', blendMode: 'screen', start: 0.38, duration: 1.16, strength: 0.92 },
      { id: 'verdict-star-crown', type: 'emitter', layer: 'overlay', blendMode: 'add', start: 1.12, duration: 1.52, count: 36 },
      { id: 'verdict-double-ring', type: 'shockwave', layer: 'overlay', blendMode: 'screen', start: 1.08, duration: 1.24, strength: 1 },
      { id: 'verdict-camera-impact', type: 'camera', layer: 'camera', blendMode: 'normal', start: 1.08, duration: 0.46, strength: 0.7 },
      { id: 'verdict-gold-grade', type: 'color-grade', layer: 'post', blendMode: 'screen', start: 1, duration: 0.86, strength: 0.42 },
    ],
  }),
];

const bindings = [
  { id: 'dreamfall.oneiric-win-impact.win-info', event: 'winInfo', recipeId: 'dreamfall.oneiric-win-impact', intensity: 'win-tier', timeScale: 1.15, enabled: true, blocking: false },
  { id: 'dreamfall.gate-awakening.free-spin-trigger', event: 'freeSpinTrigger', recipeId: 'dreamfall.gate-awakening', intensity: 2, timeScale: 1, enabled: true, blocking: false },
  { id: 'dreamfall.sovereign-verdict.wincap', event: 'wincap', recipeId: 'dreamfall.sovereign-verdict', intensity: 3, timeScale: 0.92, enabled: true, blocking: false },
];

project.animation ||= {};
project.animation.runtime ||= {};
project.animation.runtime.profile = 'balanced';
project.animation.runtime.reducedMotion = 'respect';
project.animation.visualEffects = {
  format: 'stake-studio-visual-effects-v1',
  version: 1,
  runtime: {
    quality: 'balanced',
    reducedMotion: 'respect',
    maxParticles: 120,
    maxFilterPasses: 4,
  },
  recipes,
  bindings,
};

project.production ||= {};
project.production.qa ||= {};
project.production.qa.performanceAudit = null;
project.production.qa.replayMatrix = null;
project.production.qa.presentationPolishAudit = null;
project.production.qa.certificationAudit = null;

fs.writeFileSync(outputPath, `${JSON.stringify(project, null, 2)}\n`);
console.log(JSON.stringify({ recipes: recipes.map(item => item.id), bindings: bindings.map(item => item.event), outputPath }, null, 2));
