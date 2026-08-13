#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  throw new Error('Usage: assign-dreamfall-motion-graphics.mjs <project.json> <output.json>');
}

const workspace = process.cwd();
const assetPath = filename => path.join(workspace, 'output', 'imagegen', 'motion', filename);
const dataUri = filename => `data:image/png;base64,${fs.readFileSync(assetPath(filename)).toString('base64')}`;
const project = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

project.animation ||= {};
project.animation.visualEffects ||= {};
project.animation.visualEffects.motionAssets = [
  {
    id: 'dreamfall.motion.oneiric-impact',
    name: 'Oneiric Impact — Authored 16-frame Flipbook',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-oneiric-impact-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 24,
    loop: false,
    blendMode: 'add',
    background: 'black-additive',
  },
  {
    id: 'dreamfall.motion.portal-vapor',
    name: 'Living Portal Vapor — Authored 16-frame Flipbook',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-portal-vapor-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 10,
    loop: true,
    blendMode: 'screen',
    background: 'black-additive',
  },
  {
    id: 'dreamfall.motion.portal-depth-vapor',
    name: 'Portal Interior Vapor — Authored 16-frame Depth Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-portal-depth-vapor-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 1.5,
    loop: true,
    blendMode: 'screen',
    background: 'black-additive',
  },
  {
    id: 'dreamfall.motion.hourglass-sand',
    name: 'Living Hourglass Sand — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-hourglass-sand-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 8,
    loop: true,
    blendMode: 'screen',
    background: 'black-additive',
  },
  {
    id: 'dreamfall.motion.mask-eyes',
    name: 'Living Dream Mask Eyes — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-mask-eyes-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 7,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.owl-eyes',
    name: 'Living Owl Irises — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-owl-eyes-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 6,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.moon-moth-eyespots',
    name: 'Living Moon Moth Eyespots — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-moon-moth-eyespots-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 6,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.morpheus-oneiric-eyes',
    name: 'Morpheus Oneiric Eyes — Authored 16-frame Character Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-morpheus-oneiric-eyes-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 6,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.nyx-celestial-twinkle',
    name: 'Nyx Celestial Twinkle — Authored 16-frame Character Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-nyx-celestial-twinkle-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 5,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.hypnos-sleep-current',
    name: 'Hypnos Sleep Current — Authored 16-frame Character Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-hypnos-sleep-current-atlas-alpha-runtime-v2.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 5,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.poppy-dream-reservoir',
    name: 'Poppy Dream Reservoir — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-poppy-dream-reservoir-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 5,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.laurel-living-gem',
    name: 'Laurel Living Gem — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-laurel-living-gem-atlas-alpha-runtime-v2.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 5,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.obol-lunar-rune',
    name: 'Obol Lunar Rune — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-obol-lunar-rune-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 5,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.lucid-wild-current',
    name: 'Lucid Wild Dream Current — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-lucid-wild-current-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 6,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.golden-rift-celestial-lock',
    name: 'Golden Rift Celestial Lock — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-golden-rift-celestial-lock-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 6,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.echo-split-resonance',
    name: 'Echo Split Resonance — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-echo-split-resonance-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 6,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.dawn-purge-first-light',
    name: 'Dawn Purge First Light — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-dawn-purge-first-light-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 6,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.oneiric-star-prism',
    name: 'Oneiric Star Prism Circuit — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-oneiric-star-prism-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 6,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.max-morpheus-ascension',
    name: 'Max Morpheus Ascension Circuit — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-max-morpheus-ascension-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 6,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.mystery-veil-seam',
    name: 'Mystery Veil Living Seam — Authored 16-frame Symbol Plate',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-mystery-veil-seam-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 5,
    loop: true,
    blendMode: 'screen',
    background: 'transparent',
  },
  {
    id: 'dreamfall.motion.moon-messenger',
    name: 'Moon-dust Messenger — Authored 16-frame Flipbook',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-moon-messenger-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 24,
    loop: true,
    blendMode: 'add',
    background: 'black-additive',
  },
  {
    id: 'dreamfall.motion.announcement-halo',
    name: 'Dream Announcement Halo — Authored 16-frame Flipbook',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-announcement-halo-atlas-alpha-runtime-v1.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 16,
    loop: false,
    blendMode: 'screen',
    background: 'black-additive',
  },
  {
    id: 'dreamfall.motion.living-rift-core',
    name: 'Living Rift Core — Authored 16-frame Flipbook',
    format: 'stake-studio-motion-atlas-v1',
    src: dataUri('dreamfall-living-rift-core-atlas-alpha-runtime-v2.png'),
    columns: 4,
    rows: 4,
    frames: 16,
    fps: 8,
    loop: true,
    blendMode: 'screen',
    background: 'black-additive',
  },
];

project.theme ||= {};
project.theme.presentationEffects ||= {};
project.theme.presentationEffects.livingEnergy ||= {};
project.theme.presentationEffects.livingEnergy.enabled = false;
project.theme.presentationEffects.motionGraphics = {
  format: 'stake-studio-motion-graphics-v1',
  enabled: true,
  renderer: 'pixi-webgl-frame-atlas',
  htmlVisibleEffects: false,
  preload: true,
  // Ambient motion must belong to a painted depth region. This plate is larger
  // than the doorway but is clipped to the portal interior, so its atlas edges
  // and silhouette can never float over the cabinet.
  ambient: [{
    assetId: 'dreamfall.motion.portal-depth-vapor',
    layer: 'underlay',
    x: 70,
    y: 171,
    width: 54,
    height: 112,
    fps: 1.5,
    alpha: 0.13,
    phase: 2.4,
    interpolate: true,
    clip: {
      x: 70,
      y: 171,
      width: 23,
      height: 88,
      radius: 11.5,
    },
  }],
  environmentStrategy: 'masked-painted-depth-plates',
};

project.theme.presentationEffects.announcementEnergy ||= {};
for (const [kind, timing] of Object.entries({
  mode: { motionDuration: 2.4, motionFps: 6.67 },
  verdict: { motionDuration: 3.0, motionFps: 5.33 },
})) {
  project.theme.presentationEffects.announcementEnergy[kind] ||= {};
  Object.assign(project.theme.presentationEffects.announcementEnergy[kind], {
    motionAssetId: 'dreamfall.motion.announcement-halo',
    ...timing,
  });
}

project.theme.presentationEffects.winConnections ||= {};
Object.assign(project.theme.presentationEffects.winConnections, {
  type: 'particleTap',
  messengerAssetId: 'dreamfall.motion.moon-messenger',
  impactAssetId: 'dreamfall.motion.oneiric-impact',
  renderer: 'pixi-webgl-frame-atlas',
  persistentMarker: false,
});

const gateOfSleep = project.theme.symbols?.find(symbol => symbol.name === 'GATE_OF_SLEEP');
if (gateOfSleep) {
  gateOfSleep.motionAssetId = 'dreamfall.motion.portal-vapor';
  gateOfSleep.motionOverlay = {
    left: 22,
    top: 20,
    width: 56,
    height: 68,
    fps: 9,
    alpha: 0.74,
    blendMode: 'screen',
  };
}

const symbolMotion = {
  HOURGLASS: {
    assetId: 'dreamfall.motion.hourglass-sand',
    overlay: { left: 5, top: 17, width: 90, height: 66, fps: 8, alpha: 0.26, blendMode: 'screen', interpolate: true },
  },
  DREAM_MASK: {
    assetId: 'dreamfall.motion.mask-eyes',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 7, alpha: 0.3, blendMode: 'screen', interpolate: true },
  },
  OWL: {
    assetId: 'dreamfall.motion.owl-eyes',
    overlay: { left: 22, top: 4, width: 56, height: 48, fps: 6, alpha: 0.22, blendMode: 'screen', interpolate: true },
  },
  MOON_MOTH: {
    assetId: 'dreamfall.motion.moon-moth-eyespots',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 6, alpha: 0.28, blendMode: 'screen', interpolate: true },
  },
  MORPHEUS: {
    assetId: 'dreamfall.motion.morpheus-oneiric-eyes',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 6, alpha: 0.28, blendMode: 'screen', interpolate: true },
  },
  NYX: {
    assetId: 'dreamfall.motion.nyx-celestial-twinkle',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 5, alpha: 0.24, blendMode: 'screen', interpolate: true },
  },
  HYPNOS: {
    assetId: 'dreamfall.motion.hypnos-sleep-current',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 5, alpha: 0.27, blendMode: 'screen', interpolate: true },
  },
  POPPY: {
    assetId: 'dreamfall.motion.poppy-dream-reservoir',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 5, alpha: 0.2, blendMode: 'screen', interpolate: true },
  },
  LAUREL: {
    assetId: 'dreamfall.motion.laurel-living-gem',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 5, alpha: 0.18, blendMode: 'screen', interpolate: true },
  },
  OBOL: {
    assetId: 'dreamfall.motion.obol-lunar-rune',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 5, alpha: 0.2, blendMode: 'screen', interpolate: true },
  },
  LUCID_WILD: {
    assetId: 'dreamfall.motion.lucid-wild-current',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 6, alpha: 0.3, blendMode: 'screen', interpolate: true },
  },
  GOLDEN_RIFT: {
    assetId: 'dreamfall.motion.golden-rift-celestial-lock',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 6, alpha: 0.3, blendMode: 'screen', interpolate: true },
  },
  ECHO_SPLIT: {
    assetId: 'dreamfall.motion.echo-split-resonance',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 6, alpha: 0.28, blendMode: 'screen', interpolate: true },
  },
  DAWN_PURGE: {
    assetId: 'dreamfall.motion.dawn-purge-first-light',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 6, alpha: 0.3, blendMode: 'screen', interpolate: true },
  },
  ONEIRIC_STAR: {
    assetId: 'dreamfall.motion.oneiric-star-prism',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 6, alpha: 0.22, blendMode: 'screen', interpolate: true },
  },
  MAX_MORPHEUS: {
    assetId: 'dreamfall.motion.max-morpheus-ascension',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 6, alpha: 0.2, blendMode: 'screen', interpolate: true },
  },
  MYSTERY_VEIL: {
    assetId: 'dreamfall.motion.mystery-veil-seam',
    overlay: { left: 0, top: 0, width: 100, height: 100, fps: 5, alpha: 0.24, blendMode: 'screen', interpolate: true },
  },
  VEIL_WILD: {
    assetId: 'dreamfall.motion.living-rift-core',
    overlay: { left: 15, top: 17, width: 70, height: 72, fps: 7, alpha: 0.5, blendMode: 'screen' },
  },
  RIFT_WILD: {
    assetId: 'dreamfall.motion.living-rift-core',
    overlay: { left: 5, top: 6, width: 90, height: 88, fps: 8, alpha: 0.58, blendMode: 'screen' },
  },
  DREAM_RIFT: {
    assetId: 'dreamfall.motion.living-rift-core',
    overlay: { left: 10, top: 12, width: 80, height: 76, fps: 7, alpha: 0.48, blendMode: 'screen' },
  },
};

for (const [name, motion] of Object.entries(symbolMotion)) {
  const symbol = project.theme.symbols?.find(item => item.name === name);
  if (!symbol) continue;
  symbol.motionAssetId = motion.assetId;
  symbol.motionOverlay = motion.overlay;
}

const recipes = project.animation.visualEffects.recipes || [];
for (const binding of project.animation.visualEffects.bindings || []) {
  if (binding.event === 'winInfo') binding.enabled = false;
  if (['freeSpinTrigger', 'wincap'].includes(binding.event)) binding.enabled = true;
}
const decorate = (recipeId, nodeId, values) => {
  const recipe = recipes.find(item => item.id === recipeId);
  const node = recipe?.nodes?.find(item => item.id === nodeId);
  if (node) Object.assign(node, values);
};

decorate('dreamfall.oneiric-win-impact', 'win-eye-flare', {
  motionAssetId: 'dreamfall.motion.oneiric-impact', anchor: 'origin', size: 118, fps: 24, fadeOut: 0.12,
});
decorate('dreamfall.oneiric-win-impact', 'win-dream-thread', {
  motionAssetId: 'dreamfall.motion.moon-messenger', anchor: 'origin', follow: 'projectile', size: 76, fps: 24,
});
decorate('dreamfall.oneiric-win-impact', 'win-symbol-ring', {
  motionAssetId: 'dreamfall.motion.oneiric-impact', anchor: 'target', size: 170, fps: 24, fadeOut: 0.18,
});

decorate('dreamfall.gate-awakening', 'gate-seam-flare', {
  motionAssetId: 'dreamfall.motion.oneiric-impact', anchor: 'target', size: 176, fps: 20, fadeOut: 0.18,
});
decorate('dreamfall.gate-awakening', 'gate-opening-ring', {
  motionAssetId: 'dreamfall.motion.portal-vapor', anchor: 'target', size: 230, fps: 15, alpha: 0.82, fadeOut: 0.24,
});

decorate('dreamfall.sovereign-verdict', 'verdict-mask-flare', {
  motionAssetId: 'dreamfall.motion.oneiric-impact', anchor: 'origin', size: 184, fps: 22, fadeOut: 0.16,
});
decorate('dreamfall.sovereign-verdict', 'verdict-dream-spear', {
  motionAssetId: 'dreamfall.motion.moon-messenger', anchor: 'origin', follow: 'projectile', size: 94, fps: 24,
});
decorate('dreamfall.sovereign-verdict', 'verdict-double-ring', {
  motionAssetId: 'dreamfall.motion.oneiric-impact', anchor: 'center', size: 510, fps: 18, alpha: 0.94, fadeOut: 0.3,
});

project.production ||= {};
project.production.qa ||= {};
project.production.qa.performanceAudit = null;
project.production.qa.replayMatrix = null;
project.production.qa.presentationPolishAudit = null;
project.production.qa.certificationAudit = null;
project.production.motionGraphics = {
  standard: 'authored-frame-atlas',
  version: 1,
  visibleDomGraphicsAllowed: false,
  atlases: project.animation.visualEffects.motionAssets.map(asset => asset.id),
  updatedAt: new Date().toISOString(),
};

fs.writeFileSync(outputPath, `${JSON.stringify(project, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  motionAssets: project.animation.visualEffects.motionAssets.map(asset => asset.id),
  ambientInstances: project.theme.presentationEffects.motionGraphics.ambient.length,
  decoratedNodes: recipes.flatMap(recipe => recipe.nodes || []).filter(node => node.motionAssetId).map(node => node.id),
}, null, 2));
