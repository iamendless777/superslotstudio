export const MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT = 'morpheus-dreamfall-render-profile-v1';
export const MORPHEUS_DREAMFALL_WORLD_STATE_FORMAT = 'morpheus-dreamfall-world-state-v1';

export const MORPHEUS_DREAMFALL_RENDER_PROFILE = Object.freeze({
  format: MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT,
  reels: 6,
  maximumRows: 8,
  gap: 4,
  world: Object.freeze({ x: 413, y: 16, width: 470, height: 600 }),
  cell: Object.freeze({ width: 75, height: 75, aspectRatio: 1 }),
  hudTop: 624,
  minimumHudSeparation: 8,
  compactViewport: Object.freeze({ width: 400, height: 250, stageScale: 0.3125 }),
  compactCell: Object.freeze({ width: 23.4375, height: 23.4375, aspectRatio: 1 }),
});

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const finite = value => Number.isFinite(Number(value));

function assertPositive(value, label) {
  if (!finite(value) || Number(value) <= 0) throw new Error(`${label} must be positive.`);
  return Number(value);
}

export function createMorpheusDreamfallWorldState({
  active = false,
  reason = active ? 'authoritative-dreamfall' : 'base-mode',
  status = active ? 'active' : 'inactive',
  checkpointHash = null,
  reelRows = null,
} = {}) {
  const rows = reelRows == null ? null : [...reelRows].map(Number);
  if (rows && (rows.length !== 6 || rows.some(value => !Number.isInteger(value) || value < 4 || value > 8))) {
    throw new Error('Dreamfall world state requires six reel heights within 4-8.');
  }
  return Object.freeze({
    format: MORPHEUS_DREAMFALL_WORLD_STATE_FORMAT,
    active: Boolean(active),
    reason: String(reason || ''),
    status: String(status || (active ? 'active' : 'inactive')),
    checkpointHash: checkpointHash ? String(checkpointHash) : null,
    reelRows: rows ? Object.freeze(rows) : null,
  });
}

export function createMorpheusDreamfallRenderProfile({
  viewportWidth = 1280,
  viewportHeight = 800,
  stageWidth = 1280,
  stageHeight = 800,
} = {}) {
  const profile = MORPHEUS_DREAMFALL_RENDER_PROFILE;
  const scale = Math.min(
    assertPositive(viewportWidth, 'Dreamfall viewport width') / assertPositive(stageWidth, 'Dreamfall stage width'),
    assertPositive(viewportHeight, 'Dreamfall viewport height') / assertPositive(stageHeight, 'Dreamfall stage height'),
    1,
  );
  const cellWidth = (profile.world.width - profile.gap * (profile.reels - 1)) / profile.reels;
  const cellHeight = profile.world.height / profile.maximumRows;
  if (Math.abs(cellWidth - cellHeight) > 0.000001) {
    throw new Error(`Dreamfall render profile is not square-safe (${cellWidth}x${cellHeight}).`);
  }
  if (profile.world.y + profile.world.height + profile.minimumHudSeparation > profile.hudTop) {
    throw new Error('Dreamfall render profile collides with the primary HUD.');
  }
  return {
    ...clone(profile),
    stageScale: scale,
    cell: { width: cellWidth, height: cellHeight, aspectRatio: cellWidth / cellHeight },
    renderedWorld: {
      x: profile.world.x * scale,
      y: profile.world.y * scale,
      width: profile.world.width * scale,
      height: profile.world.height * scale,
    },
    renderedCell: {
      width: cellWidth * scale,
      height: cellHeight * scale,
      aspectRatio: cellWidth / cellHeight,
    },
  };
}

export function fitMorpheusAspectRect(bounds, sourceAspectRatio = 1) {
  const width = assertPositive(bounds?.width, 'Dreamfall safe bounds width');
  const height = assertPositive(bounds?.height, 'Dreamfall safe bounds height');
  const aspectRatio = assertPositive(sourceAspectRatio, 'Dreamfall authored aspect ratio');
  const boundsAspect = width / height;
  const fittedWidth = aspectRatio >= boundsAspect ? width : height * aspectRatio;
  const fittedHeight = aspectRatio >= boundsAspect ? width / aspectRatio : height;
  return {
    x: (Number(bounds?.x) || 0) + (width - fittedWidth) / 2,
    y: (Number(bounds?.y) || 0) + (height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
    aspectRatio: fittedWidth / fittedHeight,
    sourceAspectRatio: aspectRatio,
  };
}

export function createMorpheusContentSafeRect({ cellWidth, cellHeight, sourceWidth, sourceHeight }) {
  return fitMorpheusAspectRect({ x: 0, y: 0, width: cellWidth, height: cellHeight },
    assertPositive(sourceWidth, 'Dreamfall symbol source width') / assertPositive(sourceHeight, 'Dreamfall symbol source height'));
}

export function createMorpheusMotionSafeRect({ cellRect, overlay = {}, sourceAspectRatio = 1 }) {
  const left = finite(overlay.left) ? Number(overlay.left) : 0;
  const top = finite(overlay.top) ? Number(overlay.top) : 0;
  const widthPercent = Math.max(1, finite(overlay.width) ? Number(overlay.width) : 100);
  const heightPercent = Math.max(1, finite(overlay.height) ? Number(overlay.height) : 100);
  const bounds = {
    x: Number(cellRect?.x || 0) + assertPositive(cellRect?.width, 'Dreamfall motion cell width') * left / 100,
    y: Number(cellRect?.y || 0) + assertPositive(cellRect?.height, 'Dreamfall motion cell height') * top / 100,
    width: Number(cellRect.width) * widthPercent / 100,
    height: Number(cellRect.height) * heightPercent / 100,
  };
  return { bounds, safe: fitMorpheusAspectRect(bounds, sourceAspectRatio) };
}

export function resolveMorpheusMotionRowCount({
  worldActive = false,
  featureRows = null,
  boardRows = null,
  baseRows = 4,
} = {}) {
  const fallback = Math.max(1, Number(baseRows) || 4);
  if (!worldActive) return fallback;
  const activeRows = Number(featureRows || boardRows || fallback);
  if (!Number.isInteger(activeRows) || activeRows < 4 || activeRows > 8) {
    throw new Error('Dreamfall motion rows must remain within the active 4-8 world.');
  }
  return activeRows;
}

export function evaluateMorpheusRenderAspectMetrics({
  cellRect,
  contentRect,
  contentSourceAspectRatio,
  motionRect,
  motionSourceAspectRatio,
  tolerance = 0.015,
} = {}) {
  const ratio = rect => assertPositive(rect?.width, 'Dreamfall measured width')
    / assertPositive(rect?.height, 'Dreamfall measured height');
  const cellAspectRatio = ratio(cellRect);
  const contentAspectRatio = ratio(contentRect);
  const motionAspectRatio = ratio(motionRect);
  const contentSource = assertPositive(contentSourceAspectRatio, 'Dreamfall content source aspect ratio');
  const motionSource = assertPositive(motionSourceAspectRatio, 'Dreamfall motion source aspect ratio');
  const cellAspectError = Math.abs(cellAspectRatio - 1);
  const contentAspectError = Math.abs(contentAspectRatio / contentSource - 1);
  const motionAspectError = Math.abs(motionAspectRatio / motionSource - 1);
  return {
    cellAspectRatio,
    contentAspectRatio,
    contentSourceAspectRatio: contentSource,
    motionAspectRatio,
    motionSourceAspectRatio: motionSource,
    cellAspectError,
    contentAspectError,
    motionAspectError,
    passed: cellAspectError <= tolerance && contentAspectError <= tolerance && motionAspectError <= tolerance,
  };
}
