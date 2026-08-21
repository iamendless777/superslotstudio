import {
  MORPHEUS_DREAMFALL_CABINET_PROFILE,
} from '../../engines/presentation/morpheus/MorpheusDreamfallCabinetProfile.js';
import {
  MORPHEUS_NEXUS_CABINET_PROFILE,
} from '../../engines/presentation/morpheus/MorpheusNexusCabinetProfile.js';

const MORPHEUS_PROJECT_ID = 'morpheus_dreamfall';

export const FULL_CANVAS_CABINET_MODE = 'full-canvas-cabinet-v1';
export const LEGACY_PAGE_COMPOSITION_MODE = 'legacy-page-composition-v1';

export function isMorpheusProject(project = {}, projectId = '') {
  const id = String(projectId || project.build?.stakeEngine?.gameId || project.id || '');
  const name = String(project.name || '');
  return id === MORPHEUS_PROJECT_ID
    || id === 'morpheus'
    || /^morpheus(_dreamfall)?$/i.test(id)
    || /^morpheus\s*:\s*dreamfall$/i.test(name);
}

const MORPHEUS_CONTROL_ART = Object.freeze({
  menu: '/assets/morpheus-control-menu-v1.png',
  bonus: '/assets/morpheus-control-bonus-v1.png',
  betDown: '/assets/morpheus-control-minus-v1.png',
  betUp: '/assets/morpheus-control-plus-v1.png',
  spin: '/assets/morpheus-spin-control-v1.png',
  autoplay: '/assets/morpheus-control-autoplay-v1.png',
  turbo: '/assets/morpheus-control-turbo-v1.png',
  info: '/assets/morpheus-control-info-v1.png',
  sound: '/assets/morpheus-control-sound-v1.png',
  modeCard: '/assets/morpheus-mode-card-v1.png',
});

const MORPHEUS_FEATURE_OVERLAY = Object.freeze({
  format: MORPHEUS_DREAMFALL_CABINET_PROFILE.format,
  id: MORPHEUS_DREAMFALL_CABINET_PROFILE.id,
  name: MORPHEUS_DREAMFALL_CABINET_PROFILE.name,
  src: MORPHEUS_DREAMFALL_CABINET_PROFILE.asset.src,
  x: 0,
  y: 0,
  width: 1280,
  height: 800,
  opacity: 1,
  zIndex: 38,
  visible: true,
  activation: 'dreamfall-world',
  replacesBaseForeground: true,
  blendMode: 'normal',
  safeOpening: MORPHEUS_DREAMFALL_CABINET_PROFILE.safeOpening,
  reelBay: MORPHEUS_DREAMFALL_CABINET_PROFILE.reelBay,
  hudBoundaryY: MORPHEUS_DREAMFALL_CABINET_PROFILE.hudBoundaryY,
});

const MORPHEUS_NEXUS_OVERLAY = Object.freeze({
  format: MORPHEUS_NEXUS_CABINET_PROFILE.format,
  id: MORPHEUS_NEXUS_CABINET_PROFILE.id,
  name: MORPHEUS_NEXUS_CABINET_PROFILE.name,
  src: MORPHEUS_NEXUS_CABINET_PROFILE.asset.src,
  x: 0,
  y: 0,
  width: 1280,
  height: 800,
  opacity: 1,
  zIndex: 38,
  visible: true,
  activation: 'nexus-world',
  replacesBaseForeground: true,
  blendMode: 'normal',
  safeOpening: MORPHEUS_NEXUS_CABINET_PROFILE.safeOpening,
  reelBay: MORPHEUS_NEXUS_CABINET_PROFILE.reelBay,
  hudBoundaryY: MORPHEUS_NEXUS_CABINET_PROFILE.hudBoundaryY,
});

const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const geometry = (value = {}, fallback = {}) => ({
  x: number(value.x, fallback.x ?? 0),
  y: number(value.y, fallback.y ?? 0),
  width: Math.max(1, number(value.width, fallback.width ?? 1)),
  height: Math.max(1, number(value.height, fallback.height ?? 1)),
});

function authoredCabinetWorld(cabinet = {}) {
  return (cabinet.layers || []).some(layer => layer?.type !== 'reel-area' && layer?.src && layer.visible !== false);
}

function resolveOverlayPlate(authored, fallback, { enabled, hasAuthoredWorld }) {
  if (!enabled) return authored || null;
  if (authored?.src) return authored;
  if (hasAuthoredWorld) {
    return { ...fallback, ...(authored || {}), src: '', replacesBaseForeground: false };
  }
  return { ...fallback, ...(authored || {}) };
}

function activeSpineAsset(project) {
  const activeName = project.animation?.runtime?.activeSpineAsset
    || Object.values(project.animation?.stateAnimations || {}).find(state => state?.asset)?.asset;
  return (project.animation?.spineAssets || []).find(asset => asset.name === activeName) || null;
}

export function resolveCompositionMode(project, { isMorpheus = false } = {}) {
  const cabinet = project.theme?.cabinet || {};
  if (cabinet.compositionMode === FULL_CANVAS_CABINET_MODE) return FULL_CANVAS_CABINET_MODE;
  if (cabinet.compositionMode === LEGACY_PAGE_COMPOSITION_MODE) return LEGACY_PAGE_COMPOSITION_MODE;

  const layers = cabinet.layers || [];
  const hasReelArea = layers.some(layer => layer?.type === 'reel-area' && layer.visible !== false);
  const hasAuthoredWorld = layers.some(layer => layer?.type !== 'reel-area' && layer?.src && layer.visible !== false);
  const hasAuthoredHud = Boolean(project.theme?.playerInterface?.hud);
  return isMorpheus || hasAuthoredHud || (hasReelArea && hasAuthoredWorld)
    ? FULL_CANVAS_CABINET_MODE
    : LEGACY_PAGE_COMPOSITION_MODE;
}

export function resolvePlayerComposition(project, { worldActive = false, nexusActive = false, projectId: explicitProjectId = '' } = {}) {
  const cabinet = project.theme?.cabinet || {};
  const width = Math.max(1, number(cabinet.width, 1280));
  const height = Math.max(1, number(cabinet.height, 800));
  const character = project.theme?.character || {};
  const spineAsset = activeSpineAsset(project);
  const characterPlacement = { ...(character.placement || {}), ...(spineAsset?.placement || {}) };
  const playerInterface = project.theme?.playerInterface || {};
  const projectId = explicitProjectId || project.gameId || project.slug || '';
  const isMorpheus = isMorpheusProject(project, projectId);
  const mode = resolveCompositionMode(project, { isMorpheus });
  const defaultArt = MORPHEUS_CONTROL_ART;
  const hasAuthoredWorld = authoredCabinetWorld(cabinet);
  const dreamfall = resolveOverlayPlate(project.theme?.featureOverlays?.dreamfall, MORPHEUS_FEATURE_OVERLAY, {
    enabled: isMorpheus,
    hasAuthoredWorld,
  });
  const nexus = resolveOverlayPlate(project.theme?.featureOverlays?.nexus, MORPHEUS_NEXUS_OVERLAY, {
    enabled: isMorpheus,
    hasAuthoredWorld,
  });

  return {
    format: 'stake-studio-player-composition-v1',
    mode,
    cabinet: { width, height, layers: cabinet.layers || [] },
    character: {
      visible: character.visible !== false,
      placement: { ...characterPlacement, ...geometry(characterPlacement, { x: 870, y: 125, width: 410, height: 575 }) },
      poses: character.poses || {},
      zIndex: number(character.zIndex, 49),
    },
    environment: Object.fromEntries(Object.entries(project.theme?.environmentAssets || {}).map(([id, asset]) => [id, {
      ...asset,
      ...geometry(asset),
      visible: asset.visible !== false,
      zIndex: number(asset.zIndex, 59),
    }])),
    hud: {
      visible: playerInterface.hud?.visible !== false,
      ...geometry(playerInterface.hud, { x: 0, y: height * 0.78, width, height: height * 0.22 }),
      zIndex: number(playerInterface.hud?.zIndex, 67),
      art: { ...defaultArt, ...(playerInterface.controls || {}) },
    },
    featureOverlay: dreamfall ? {
      ...dreamfall,
      ...geometry(dreamfall, MORPHEUS_FEATURE_OVERLAY),
      visible: dreamfall.visible !== false && worldActive && !nexusActive,
      authored: Boolean(project.theme?.featureOverlays?.dreamfall?.src),
    } : null,
    nexusOverlay: nexus ? {
      ...nexus,
      ...geometry(nexus, MORPHEUS_NEXUS_OVERLAY),
      visible: nexus.visible !== false && nexusActive,
      authored: Boolean(project.theme?.featureOverlays?.nexus?.src),
    } : null,
  };
}

export function listEditableCompositionLayers(project) {
  const composition = resolvePlayerComposition(project, { worldActive: true, nexusActive: false });
  const nexusComposition = resolvePlayerComposition(project, { worldActive: false, nexusActive: true });
  const layers = [...composition.cabinet.layers];
  if (composition.character.poses.idle) layers.push({
    id: 'composition:character', name: 'Character / Rig', type: 'character',
    src: composition.character.poses.idle, ...composition.character.placement,
    opacity: 1, zIndex: composition.character.zIndex, visible: composition.character.visible,
    blendMode: 'normal', locked: false, compositionBinding: 'character',
  });
  for (const [id, asset] of Object.entries(composition.environment)) layers.push({
    id: `composition:environment:${id}`, name: asset.name || `Environment · ${id}`,
    type: 'image', src: asset.src || '', ...geometry(asset), opacity: number(asset.opacity, 1),
    zIndex: asset.zIndex, visible: asset.visible, blendMode: asset.blendMode || 'normal', locked: false,
    compositionBinding: `environment:${id}`,
  });
  layers.push({
    id: 'composition:hud', name: 'Player HUD & Controls', type: 'ui', src: '',
    x: composition.hud.x, y: composition.hud.y, width: composition.hud.width, height: composition.hud.height,
    opacity: 1, zIndex: composition.hud.zIndex, visible: composition.hud.visible,
    blendMode: 'normal', locked: false, compositionBinding: 'hud', controlArt: composition.hud.art,
  });
  if (composition.featureOverlay) layers.push({
    id: 'composition:feature:dreamfall', name: composition.featureOverlay.name || 'Dreamfall Feature Overlay',
    type: 'overlay', src: composition.featureOverlay.src || '', ...geometry(composition.featureOverlay),
    opacity: number(composition.featureOverlay.opacity, 1), zIndex: number(composition.featureOverlay.zIndex, 38),
    visible: true, blendMode: composition.featureOverlay.blendMode || 'normal',
    locked: false, compositionBinding: 'feature:dreamfall', replacesBaseForeground: composition.featureOverlay.replacesBaseForeground !== false,
  });
  if (nexusComposition.nexusOverlay) layers.push({
    id: 'composition:feature:nexus', name: nexusComposition.nexusOverlay.name || 'Oneiric Nexus Overlay',
    type: 'overlay', src: nexusComposition.nexusOverlay.src || '', ...geometry(nexusComposition.nexusOverlay),
    opacity: number(nexusComposition.nexusOverlay.opacity, 1), zIndex: number(nexusComposition.nexusOverlay.zIndex, 38),
    visible: true, blendMode: nexusComposition.nexusOverlay.blendMode || 'normal',
    locked: false, compositionBinding: 'feature:nexus', replacesBaseForeground: nexusComposition.nexusOverlay.replacesBaseForeground !== false,
  });
  return layers;
}

export function updateCompositionLayer(project, layer) {
  const binding = layer?.compositionBinding;
  if (!binding) return layer;
  project.theme ||= {};
  if (binding === 'character') {
    project.theme.character ||= { poses: {} };
    project.theme.character.placement = { ...(project.theme.character.placement || {}), ...geometry(layer) };
    project.theme.character.visible = layer.visible !== false;
    project.theme.character.zIndex = number(layer.zIndex, 49);
    if (layer.src) project.theme.character.poses.idle = layer.src;
    const spineAsset = activeSpineAsset(project);
    if (spineAsset) spineAsset.placement = { ...(spineAsset.placement || {}), ...geometry(layer) };
  } else if (binding.startsWith('environment:')) {
    const id = binding.slice('environment:'.length);
    project.theme.environmentAssets ||= {};
    project.theme.environmentAssets[id] = {
      ...(project.theme.environmentAssets[id] || {}), ...geometry(layer), src: layer.src || '',
      opacity: number(layer.opacity, 1), zIndex: number(layer.zIndex, 59),
      visible: layer.visible !== false, blendMode: layer.blendMode || 'normal',
    };
  } else if (binding === 'hud') {
    project.theme.playerInterface ||= {};
    project.theme.playerInterface.hud = {
      ...geometry(layer), visible: layer.visible !== false, zIndex: number(layer.zIndex, 67),
    };
  } else if (binding === 'feature:dreamfall') {
    project.theme.featureOverlays ||= {};
    project.theme.featureOverlays.dreamfall = {
      ...MORPHEUS_FEATURE_OVERLAY, ...(project.theme.featureOverlays.dreamfall || {}),
      ...geometry(layer), src: layer.src || '', opacity: number(layer.opacity, 1),
      zIndex: number(layer.zIndex, 38), visible: layer.visible !== false,
      blendMode: layer.blendMode || 'normal', replacesBaseForeground: layer.replacesBaseForeground !== false,
    };
  } else if (binding === 'feature:nexus') {
    project.theme.featureOverlays ||= {};
    project.theme.featureOverlays.nexus = {
      ...MORPHEUS_NEXUS_OVERLAY, ...(project.theme.featureOverlays.nexus || {}),
      ...geometry(layer), src: layer.src || '', opacity: number(layer.opacity, 1),
      zIndex: number(layer.zIndex, 38), visible: layer.visible !== false,
      blendMode: layer.blendMode || 'normal', replacesBaseForeground: layer.replacesBaseForeground !== false,
    };
  }
  return layer;
}

export function updatePlayerControlArt(project, key, src) {
  project.theme ||= {};
  project.theme.playerInterface ||= {};
  project.theme.playerInterface.controls ||= {};
  project.theme.playerInterface.controls[key] = src;
}

export function updateCharacterPose(project, key, src) {
  project.theme ||= {};
  project.theme.character ||= {};
  project.theme.character.poses ||= {};
  project.theme.character.poses[key] = src;
}

export const PLAYER_CONTROL_ART_KEYS = Object.freeze([
  'menu', 'bonus', 'betDown', 'betUp', 'spin', 'autoplay', 'turbo', 'info', 'sound',
]);
