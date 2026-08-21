export const MORPHEUS_NEXUS_CABINET_PROFILE_FORMAT = 'morpheus-nexus-cabinet-profile-v1';

export const MORPHEUS_NEXUS_CABINET_PROFILE = Object.freeze({
  format: MORPHEUS_NEXUS_CABINET_PROFILE_FORMAT,
  id: 'morpheus-nexus-scene-matte-v1',
  name: 'Oneiric Nexus Sanctum',
  activation: Object.freeze({
    projectId: 'morpheus_dreamfall',
    worldState: 'nexus',
    modeIds: Object.freeze(['oneiric_nexus']),
  }),
  asset: Object.freeze({
    src: '',
    width: 1280,
    height: 800,
    role: 'feature-cabinet-scene',
    zIndex: 38,
  }),
  safeOpening: Object.freeze({ x: 400, y: 110, width: 496, height: 330 }),
  reelBay: Object.freeze({ x: 413, y: 120, width: 470, height: 300 }),
  hudBoundaryY: 624,
  replacesBaseForeground: false,
  growth: false,
  grid: Object.freeze({ reels: 6, rows: 4, persistent: true }),
});

export function resolveMorpheusNexusCabinetProfile({ projectId, nexusActive, mode } = {}) {
  if (projectId !== MORPHEUS_NEXUS_CABINET_PROFILE.activation.projectId) return null;
  if (nexusActive !== true && mode !== 'oneiric_nexus') return null;
  return MORPHEUS_NEXUS_CABINET_PROFILE;
}
