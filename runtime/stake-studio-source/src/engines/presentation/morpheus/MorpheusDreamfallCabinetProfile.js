export const MORPHEUS_DREAMFALL_CABINET_PROFILE_FORMAT = 'morpheus-dreamfall-cabinet-profile-v1';

export const MORPHEUS_DREAMFALL_CABINET_PROFILE = Object.freeze({
  format: MORPHEUS_DREAMFALL_CABINET_PROFILE_FORMAT,
  id: 'morpheus-dreamfall-scene-matte-v1',
  name: 'Dreamfall Well Scene',
  activation: Object.freeze({
    projectId: 'morpheus_dreamfall',
    worldState: 'active',
    renderProfile: 'morpheus-dreamfall-render-profile-v1',
  }),
  asset: Object.freeze({
    src: '',
    width: 1280,
    height: 800,
    role: 'feature-cabinet-scene',
    zIndex: 38,
  }),
  safeOpening: Object.freeze({ x: 405, y: 10, width: 485, height: 615 }),
  reelBay: Object.freeze({ x: 413, y: 16, width: 470, height: 600 }),
  hudBoundaryY: 624,
  replacesBaseForeground: false,
  growth: Object.freeze({
    concept: 'per-reel-upward',
    minimumRows: 4,
    maximumRows: 8,
    reels: 6,
    maximumCells: 48,
    guaranteedMax: false,
    trigger: 'random-non-maxed-reel-on-positive-win',
  }),
  layers: Object.freeze({
    scene: 'authored-cabinet',
    glow: 'motion-graphic',
    shafts: 'css-per-reel',
    symbols: 'reel-mask',
  }),
});

export function resolveMorpheusDreamfallCabinetProfile({ projectId, worldActive, renderProfile } = {}) {
  if (projectId !== MORPHEUS_DREAMFALL_CABINET_PROFILE.activation.projectId) return null;
  if (worldActive !== true) return null;
  if (renderProfile !== MORPHEUS_DREAMFALL_CABINET_PROFILE.activation.renderProfile) return null;
  return MORPHEUS_DREAMFALL_CABINET_PROFILE;
}
