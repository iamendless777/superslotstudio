export const MORPHEUS_DREAMFALL_CABINET_PROFILE_FORMAT = 'morpheus-dreamfall-cabinet-profile-v1';

export const MORPHEUS_DREAMFALL_CABINET_PROFILE = Object.freeze({
  format: MORPHEUS_DREAMFALL_CABINET_PROFILE_FORMAT,
  id: 'morpheus-dreamfall-shaft-pillars-v1',
  activation: Object.freeze({
    projectId: 'morpheus_dreamfall',
    worldState: 'active',
    renderProfile: 'morpheus-dreamfall-render-profile-v1',
  }),
  asset: Object.freeze({
    src: '/assets/morpheus-dreamfall-shaft-pillars-v1.png',
    width: 1280,
    height: 800,
    role: 'feature-cabinet-foreground',
  }),
  safeOpening: Object.freeze({ x: 405, y: 10, width: 485, height: 615 }),
  reelBay: Object.freeze({ x: 413, y: 16, width: 470, height: 600 }),
  hudBoundaryY: 624,
  replacesBaseForeground: true,
});

export function resolveMorpheusDreamfallCabinetProfile({ projectId, worldActive, renderProfile } = {}) {
  if (projectId !== MORPHEUS_DREAMFALL_CABINET_PROFILE.activation.projectId) return null;
  if (worldActive !== true) return null;
  if (renderProfile !== MORPHEUS_DREAMFALL_CABINET_PROFILE.activation.renderProfile) return null;
  return MORPHEUS_DREAMFALL_CABINET_PROFILE;
}
