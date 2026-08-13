import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

const SERVICE = process.env.STAKE_STUDIO_URL || 'http://127.0.0.1:3000';
const PROJECT_ID = 'morpheus_dreamfall';
const FOLIAGE_ASSET_ID = 'dreamfall.environment.foreground-foliage-v2';
const foliagePng = readFileSync(new URL('../../../assets/morpheus-dreamfall/environment/dreamfall-foreground-foliage-v2.png', import.meta.url));
const cleanBackgroundPng = readFileSync(new URL('../../../assets/morpheus-dreamfall/environment/dreamfall-background-clean-v2.png', import.meta.url));

async function request(path, options = {}) {
  const response = await fetch(`${SERVICE}${path}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `StakeStudio request failed (${response.status}).`);
  return body;
}

const health = await request('/__stake_studio/health');
const payload = await request(`/__stake_studio/projects/${PROJECT_ID}`);
const project = payload.project;
if (!project) throw new Error(`StakeStudio did not return ${PROJECT_ID}.`);
const projectRoot = join(health.studioHome, 'games', PROJECT_ID);

const presentation = project.theme.presentationEffects ||= {};
const motionGraphics = presentation.motionGraphics ||= {};
motionGraphics.enabled = true;
motionGraphics.renderer = 'pixi';
motionGraphics.htmlVisibleEffects = false;
motionGraphics.preload = true;
motionGraphics.environmentStrategy = 'masked-painted-depth-plates';
motionGraphics.ambient = [
  {
    id: 'left-gate-breath',
    assetId: 'dreamfall.motion.portal-depth-vapor',
    layer: 'underlay',
    x: 70,
    y: 171,
    width: 58,
    height: 116,
    fps: 0.62,
    alpha: 0.125,
    phase: 1.3,
    interpolate: true,
    blendMode: 'screen',
    clip: { x: 70, y: 171, width: 24, height: 92, radius: 12 },
    motion: { duration: 18, phase: 0.7, swayX: 3.2, driftX: 1.4, swayY: 1.1, scaleX: 0.018, scaleY: 0.012 },
  },
  {
    id: 'right-gate-breath',
    assetId: 'dreamfall.motion.portal-depth-vapor',
    layer: 'underlay',
    x: 570,
    y: 171,
    width: 58,
    height: 116,
    fps: 0.55,
    alpha: 0.115,
    phase: 8.7,
    interpolate: true,
    blendMode: 'screen',
    clip: { x: 570, y: 171, width: 24, height: 92, radius: 12 },
    motion: { duration: 21, phase: 2.9, swayX: -3.4, driftX: -1.2, swayY: 1.3, scaleX: 0.016, scaleY: 0.014 },
  },
  {
    id: 'moon-cloud-breath',
    assetId: 'dreamfall.motion.portal-depth-vapor',
    layer: 'underlay',
    x: 92,
    y: 78,
    width: 124,
    height: 76,
    fps: 0.42,
    alpha: 0.068,
    phase: 15.2,
    interpolate: true,
    blendMode: 'screen',
    clip: { x: 92, y: 78, width: 104, height: 62, radius: 31 },
    motion: { duration: 34, phase: 1.8, swayX: 8.5, driftX: 3.2, swayY: 2.1, scaleX: 0.022, scaleY: 0.016 },
  },
  {
    id: 'left-low-fog-breath',
    assetId: 'dreamfall.motion.portal-depth-vapor',
    layer: 'underlay',
    x: 112,
    y: 288,
    width: 246,
    height: 72,
    fps: 0.34,
    alpha: 0.052,
    phase: 23.4,
    interpolate: true,
    blendMode: 'screen',
    clip: { x: 112, y: 288, width: 206, height: 52, radius: 26 },
    motion: { duration: 41, phase: 0.3, swayX: 14, driftX: 5.5, swayY: 1.6, scaleX: 0.018, scaleY: 0.024 },
  },
  {
    id: 'right-low-fog-breath',
    assetId: 'dreamfall.motion.portal-depth-vapor',
    layer: 'underlay',
    x: 528,
    y: 288,
    width: 246,
    height: 72,
    fps: 0.3,
    alpha: 0.046,
    phase: 31.8,
    interpolate: true,
    blendMode: 'screen',
    clip: { x: 528, y: 288, width: 206, height: 52, radius: 26 },
    motion: { duration: 47, phase: 3.7, swayX: -15, driftX: -4.8, swayY: 1.4, scaleX: 0.016, scaleY: 0.022 },
  },
  {
    id: 'left-foreground-foliage-breath',
    assetId: FOLIAGE_ASSET_ID,
    layer: 'overlay',
    x: 51.2,
    y: 364,
    width: 640,
    height: 400,
    anchorX: 0.08,
    anchorY: 0.96,
    fps: 0.2,
    alpha: 1,
    phase: 0,
    interpolate: false,
    blendMode: 'normal',
    clip: { x: 72, y: 332, width: 144, height: 96, radius: 8 },
    motion: { duration: 14.5, phase: 0.4, swayX: 0.55, swayY: 0.28, rotation: 0.18, scaleX: 0.0015, scaleY: 0.0025 },
  },
  {
    id: 'right-foreground-foliage-breath',
    assetId: FOLIAGE_ASSET_ID,
    layer: 'overlay',
    x: 588.8,
    y: 364,
    width: 640,
    height: 400,
    anchorX: 0.92,
    anchorY: 0.96,
    fps: 0.2,
    alpha: 1,
    phase: 0,
    interpolate: false,
    blendMode: 'normal',
    clip: { x: 568, y: 332, width: 144, height: 96, radius: 8 },
    motion: { duration: 16.2, phase: 2.6, swayX: 0.48, swayY: 0.25, rotation: -0.16, scaleX: 0.0012, scaleY: 0.0022 },
  },
];

const motionAssets = project.animation.visualEffects.motionAssets ||= [];
const foliageAsset = {
  id: FOLIAGE_ASSET_ID,
  name: 'Dreamfall Foreground Foliage — Transparent Living Plate',
  format: 'stake-studio-motion-atlas-v1',
  src: `data:image/png;base64,${foliagePng.toString('base64')}`,
  columns: 1,
  rows: 1,
  frames: 1,
  fps: 0.2,
  loop: true,
  blendMode: 'normal',
  background: 'transparent',
};
const foliageIndex = motionAssets.findIndex(asset => asset.id === FOLIAGE_ASSET_ID);
if (foliageIndex >= 0) motionAssets[foliageIndex] = foliageAsset;
else motionAssets.push(foliageAsset);

const innerPillars = project.theme.cabinet.layers?.find(layer => layer.id === 'morpheus-inner-pillars-foreground-v1');
if (innerPillars) {
  // The background already owns the top beam and gold sigil. Restrict this
  // foreground plate to the inner pillars so doubled alpha edges cannot blur
  // the crown while the pillars still correctly overlap the reels.
  innerPillars.clipRegions = [
    { x: 120, y: 0, width: 285, height: 800 },
    { x: 875, y: 0, width: 285, height: 800 },
  ];
}
const backgroundLayer = project.theme.cabinet.layers?.find(layer => layer.id === 'morpheus-dreamfall-background-v1');
if (backgroundLayer) {
  backgroundLayer.name = 'Dreamfall Temple Background — Clean Living-Foliage Plate';
  backgroundLayer.src = `data:image/png;base64,${cleanBackgroundPng.toString('base64')}`;
}

const environment = project.animation.environment ||= {};
environment.enabled = true;
environment.renderer = 'pixi-webgl-frame-atlas';
environment.motionLanguage = 'frame-blended-cinemagraph-parallax-flow';
environment.description = 'Asynchronous twin gate vapor, moon-cloud roll, and low dream fog use masked authored frames plus long dual-frequency subpixel drift for a continuous living-photograph effect.';

// The compiled motion atlases are exact copies of the data URLs that used to
// live inside project.json. Keep one stable project-local copy and point Preview
// at the bridge asset route. The frontend compiler recognizes these URLs and
// hashes the files back into a portable Stake bundle during export.
const compiledMotionDir = join(projectRoot, 'frontend', 'assets', 'motion');
const stableMotionDir = join(projectRoot, 'assets', 'motion');
let movedMotionDirectory = false;
if (!existsSync(stableMotionDir) && existsSync(compiledMotionDir)) {
  mkdirSync(join(projectRoot, 'assets'), { recursive: true });
  renameSync(compiledMotionDir, stableMotionDir);
  symlinkSync('../../assets/motion', compiledMotionDir, 'dir');
  movedMotionDirectory = true;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const localAssets = new Map();
for (const fileName of existsSync(stableMotionDir) ? readdirSync(stableMotionDir) : []) {
  const bytes = readFileSync(join(stableMotionDir, fileName));
  localAssets.set(sha256(bytes), `motion/${fileName}`);
}
const runtimeBackground = join(projectRoot, 'assets', 'runtime', 'background-v1.png');
if (existsSync(runtimeBackground)) {
  localAssets.set(sha256(readFileSync(runtimeBackground)), 'runtime/background-v1.png');
}

let externalizedAssets = 0;
let externalizedCharacters = 0;
function externalizeDataUrls(value) {
  if (typeof value === 'string' && value.startsWith('data:')) {
    const comma = value.indexOf(',');
    if (comma < 0) return value;
    const metadata = value.slice(5, comma);
    const bytes = metadata.includes(';base64')
      ? Buffer.from(value.slice(comma + 1), 'base64')
      : Buffer.from(decodeURIComponent(value.slice(comma + 1)));
    const relative = localAssets.get(sha256(bytes));
    if (!relative) return value;
    externalizedAssets += 1;
    externalizedCharacters += value.length;
    return `/__stake_studio/projects/${PROJECT_ID}/assets/${relative}`;
  }
  if (Array.isArray(value)) return value.map(externalizeDataUrls);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) value[key] = externalizeDataUrls(child);
  }
  return value;
}
externalizeDataUrls(project);

try {
  await request(`/__stake_studio/projects/${PROJECT_ID}`, {
    method: 'PUT',
    body: JSON.stringify({ project, source: 'codex', reason: 'morpheus-atmosphere-and-storage-pass' }),
  });
} catch (error) {
  if (movedMotionDirectory) {
    rmSync(compiledMotionDir, { force: true });
    renameSync(stableMotionDir, compiledMotionDir);
  }
  throw error;
}

console.log(JSON.stringify({
  projectId: PROJECT_ID,
  ambientLayers: motionGraphics.ambient.map(({ id, assetId, fps, alpha }) => ({ id, assetId, fps, alpha })),
  foliageAssetBytes: foliagePng.length,
  cleanBackgroundBytes: cleanBackgroundPng.length,
  htmlVisibleEffects: motionGraphics.htmlVisibleEffects,
  renderer: environment.renderer,
  externalizedAssets,
  externalizedMB: Number((externalizedCharacters / 1048576).toFixed(2)),
}, null, 2));
