import {
  INTENSITY_PROFILES,
  VISUAL_CHOREOGRAPHY_FORMAT,
  assemblePhases,
  createPlanControl,
  normalizeEventPosition,
  normalizeMotionPolicy,
  normalizeReelGeometry,
  normalizeVisualIntensity,
  resolveCellAnchor,
  resolveCellBounds,
  roundVisualNumber,
  scalePhaseTiming,
} from './VisualChoreography.js';

export const TUMBLE_PHASES = Object.freeze([
  'recognition', 'reaction', 'clear', 'space', 'enter', 'fall', 'settle', 'evaluate',
]);

export const TUMBLE_TIMING = Object.freeze({
  durations: Object.freeze({
    recognition: 90,
    reaction: 130,
    clear: 150,
    space: 70,
    enter: 90,
    fall: 300,
    settle: 150,
    evaluate: 80,
  }),
  // Gravity is a board-wide event. Symbols on the same or neighboring reels
  // must retain their spacing instead of falling one at a time and crossing
  // through each other. Clear/fall/settle therefore share one clock.
  staggerMs: 0,
});

function issue(severity, code, message, path) {
  return { severity, code, message, path };
}

function pointKey(position) {
  return `${position.reel}:${position.row}`;
}

function normalizeClearedPosition(raw, index) {
  const position = normalizeEventPosition(raw, `clearedPositions[${index}]`);
  return {
    id: String(raw?.id || `clear-${position.reel}-${position.row}`),
    reel: position.reel,
    row: position.row,
    order: Math.max(0, Number.isFinite(Number(raw?.order)) ? Number(raw.order) : 0),
  };
}

function normalizeMovement(raw, index) {
  const type = raw?.type;
  if (!['fall', 'enter'].includes(type)) throw new TypeError(`movements[${index}].type must be "fall" or "enter".`);
  const to = normalizeEventPosition(raw?.to, `movements[${index}].to`);
  const from = type === 'fall' ? normalizeEventPosition(raw?.from, `movements[${index}].from`) : null;
  let fromPoint = null;
  if (type === 'enter' && raw?.fromPoint != null) {
    const x = Number(raw.fromPoint.x);
    const y = Number(raw.fromPoint.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError(`movements[${index}].fromPoint must contain finite x and y coordinates.`);
    fromPoint = { x: roundVisualNumber(x), y: roundVisualNumber(y) };
  }
  return {
    id: String(raw?.id || `${type}-${to.reel}-${to.row}`),
    type,
    tileId: String(raw?.tileId || raw?.id || `${type}-${to.reel}-${to.row}`),
    from,
    fromPoint,
    to,
    order: Math.max(0, Number.isFinite(Number(raw?.order)) ? Number(raw.order) : 0),
    entryOrder: raw?.entryOrder == null
      ? null
      : Math.max(0, Number.isFinite(Number(raw.entryOrder)) ? Number(raw.entryOrder) : 0),
  };
}

function inspectTumbleInput({ clearedPositions, movements } = {}) {
  const issues = [];
  if (!Array.isArray(clearedPositions) || !clearedPositions.length) {
    issues.push(issue('error', 'cleared-positions-required', 'Authoritative cleared positions are required.', 'clearedPositions'));
  }
  if (!Array.isArray(movements) || !movements.length) {
    issues.push(issue('error', 'movements-required', 'Authoritative fall or entry movements are required.', 'movements'));
  }
  const cleared = [];
  const clearIds = new Set();
  const clearCells = new Set();
  for (const [index, raw] of (Array.isArray(clearedPositions) ? clearedPositions : []).entries()) {
    try {
      const position = normalizeClearedPosition(raw, index);
      const key = pointKey(position);
      if (clearIds.has(position.id)) issues.push(issue('error', 'clear-id-duplicate', `Cleared position ID "${position.id}" is duplicated.`, `clearedPositions[${index}].id`));
      if (clearCells.has(key)) issues.push(issue('error', 'clear-cell-duplicate', `Cleared cell ${key} is duplicated.`, `clearedPositions[${index}]`));
      clearIds.add(position.id);
      clearCells.add(key);
      cleared.push(position);
    } catch (error) {
      issues.push(issue('error', 'clear-position-invalid', error.message, `clearedPositions[${index}]`));
    }
  }
  const normalizedMovements = [];
  const movementIds = new Set();
  const destinationCells = new Set();
  for (const [index, raw] of (Array.isArray(movements) ? movements : []).entries()) {
    try {
      const movement = normalizeMovement(raw, index);
      const destinationKey = pointKey(movement.to);
      if (movementIds.has(movement.id)) issues.push(issue('error', 'movement-id-duplicate', `Movement ID "${movement.id}" is duplicated.`, `movements[${index}].id`));
      if (destinationCells.has(destinationKey)) issues.push(issue('error', 'movement-destination-duplicate', `Multiple movements target cell ${destinationKey}.`, `movements[${index}].to`));
      if (movement.type === 'fall' && pointKey(movement.from) === destinationKey) issues.push(issue('error', 'movement-stationary', `Fall movement "${movement.id}" does not change cells.`, `movements[${index}]`));
      movementIds.add(movement.id);
      destinationCells.add(destinationKey);
      normalizedMovements.push(movement);
    } catch (error) {
      issues.push(issue('error', 'movement-invalid', error.message, `movements[${index}]`));
    }
  }
  cleared.sort((a, b) => a.order - b.order || a.reel - b.reel || a.row - b.row || a.id.localeCompare(b.id));
  normalizedMovements.sort((a, b) => a.order - b.order || a.to.reel - b.to.reel || a.to.row - b.to.row || a.id.localeCompare(b.id));
  return { issues, cleared, movements: normalizedMovements };
}

export function validateTumbleInput(input) {
  return inspectTumbleInput(input).issues;
}

function deriveEntryPoint(geometry, movement, entryIndex) {
  if (movement.fromPoint) return { ...movement.fromPoint, source: 'event-point' };
  const bounds = resolveCellBounds(geometry, movement.to);
  const reelCells = geometry.cells.filter(cell => cell.reel === movement.to.reel);
  const top = Math.min(...reelCells.map(cell => cell.bounds.y));
  const rank = movement.entryOrder ?? entryIndex;
  return {
    x: roundVisualNumber(bounds.x + bounds.width / 2),
    y: roundVisualNumber(top - bounds.height * (rank + 0.5)),
    source: 'geometry-entry',
  };
}

function createMovementPaths(geometry, movements) {
  const entryCounts = new Map();
  return movements.map(movement => {
    const destination = resolveCellAnchor(geometry, movement.to, 'center');
    let source;
    if (movement.type === 'fall') {
      source = { ...resolveCellAnchor(geometry, movement.from, 'center'), source: 'event-cell' };
    } else {
      const entryIndex = entryCounts.get(movement.to.reel) || 0;
      entryCounts.set(movement.to.reel, entryIndex + 1);
      source = deriveEntryPoint(geometry, movement, entryIndex);
    }
    const dx = destination.x - source.x;
    const dy = destination.y - source.y;
    return {
      id: movement.id,
      tileId: movement.tileId,
      type: movement.type,
      order: movement.order,
      from: source,
      to: destination,
      destination: { ...movement.to },
      vector: {
        x: roundVisualNumber(dx),
        y: roundVisualNumber(dy),
        distance: roundVisualNumber(Math.hypot(dx, dy)),
      },
    };
  });
}

function positionTarget(position) {
  return { id: position.id, reel: position.reel, row: position.row };
}

function createTumbleCues(phaseId, context, cleared, paths) {
  if (['recognition', 'reaction', 'clear'].includes(phaseId)) {
    const action = phaseId === 'recognition'
      ? 'recognize-clear-set'
      : phaseId === 'reaction' ? 'react-before-clear' : 'clear-tile';
    return cleared.map((position, index) => ({
      id: `${phaseId}-${position.id}`,
      action,
      target: positionTarget(position),
      relativeAtMs: index * context.staggerMs,
    }));
  }
  if (phaseId === 'space') {
    return cleared.map(position => ({ id: `space-${position.id}`, action: 'hold-space', target: positionTarget(position), relativeAtMs: 0 }));
  }
  if (phaseId === 'enter') {
    return paths.filter(path => path.type === 'enter').map((path, index) => ({
      id: `enter-${path.id}`,
      action: context.motionEnabled ? 'stage-entry' : 'prepare-destination-state',
      pathId: path.id,
      relativeAtMs: index * context.staggerMs,
    }));
  }
  if (phaseId === 'fall') {
    return paths.map((path, index) => ({
      id: `fall-${path.id}`,
      action: context.motionEnabled ? 'travel-to-destination' : 'apply-destination-state',
      pathId: path.id,
      relativeAtMs: index * context.staggerMs,
    }));
  }
  if (phaseId === 'settle') {
    return paths.map((path, index) => ({
      id: `settle-${path.id}`,
      action: context.motionEnabled ? 'settle-at-destination' : 'confirm-destination-state',
      pathId: path.id,
      relativeAtMs: index * context.staggerMs,
    }));
  }
  return [{ id: 'evaluate-authoritative-next-event', action: 'request-next-authoritative-evaluation', relativeAtMs: 0 }];
}

export function createTumblePlan({
  eventId,
  clearedPositions,
  movements,
  reelGeometry,
  intensity = 'normal',
  motionPolicy = 'normal',
  interruption = 'queue',
} = {}) {
  const resolvedEventId = String(eventId || '').trim();
  if (!resolvedEventId) throw new TypeError('eventId is required for deterministic choreography and acknowledgement.');
  const inspected = inspectTumbleInput({ clearedPositions, movements });
  const errors = inspected.issues.filter(item => item.severity === 'error');
  if (errors.length) throw new TypeError(errors.map(item => item.message).join(' '));
  const geometry = normalizeReelGeometry(reelGeometry);
  const cleared = inspected.cleared.map(position => ({
    ...position,
    point: resolveCellAnchor(geometry, position, 'center'),
  }));
  const paths = createMovementPaths(geometry, inspected.movements);
  const resolvedIntensity = normalizeVisualIntensity(intensity);
  const resolvedMotionPolicy = normalizeMotionPolicy(motionPolicy);
  const timing = scalePhaseTiming(TUMBLE_TIMING, resolvedIntensity, resolvedMotionPolicy);
  const phases = assemblePhases(
    TUMBLE_PHASES,
    timing,
    (phaseId, context) => createTumbleCues(phaseId, context, cleared, paths),
  );
  const control = createPlanControl({
    eventId: resolvedEventId,
    kind: 'tumble',
    interruption,
    completionPhase: 'evaluate',
  });
  return {
    format: VISUAL_CHOREOGRAPHY_FORMAT,
    version: 1,
    id: `tumble:${resolvedEventId}`,
    kind: 'tumble',
    eventId: resolvedEventId,
    deterministic: true,
    authority: { clearedPositions: 'event', movements: 'event', geometry: 'current-renderer' },
    intensity: resolvedIntensity,
    intensityProfile: { ...INTENSITY_PROFILES[resolvedIntensity] },
    motionPolicy: resolvedMotionPolicy,
    motionEnabled: timing.motionEnabled,
    coordinateSpace: geometry.coordinateSpace,
    cleared,
    movements: inspected.movements,
    paths,
    phases,
    totalDurationMs: phases.at(-1)?.endMs || 0,
    ...control,
  };
}
