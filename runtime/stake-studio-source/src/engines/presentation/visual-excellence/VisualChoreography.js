export const VISUAL_CHOREOGRAPHY_FORMAT = 'stake-studio-visual-choreography-plan-v1';

export const VISUAL_INTENSITIES = Object.freeze(['micro', 'normal', 'major', 'peak']);
export const MOTION_POLICIES = Object.freeze(['normal', 'fast', 'reduced', 'none']);
export const INTERRUPTION_POLICIES = Object.freeze(['queue', 'replace', 'ignore']);

export const INTENSITY_PROFILES = Object.freeze({
  micro: Object.freeze({ emphasis: 0.55, secondaryMotion: 0.2, travelOvershoot: 0, timingScale: 0.85 }),
  normal: Object.freeze({ emphasis: 1, secondaryMotion: 0.5, travelOvershoot: 0.06, timingScale: 1 }),
  major: Object.freeze({ emphasis: 1.35, secondaryMotion: 0.75, travelOvershoot: 0.1, timingScale: 1.1 }),
  peak: Object.freeze({ emphasis: 1.7, secondaryMotion: 1, travelOvershoot: 0.14, timingScale: 1.2 }),
});

export const MOTION_PROFILE_FACTORS = Object.freeze({
  normal: Object.freeze({ duration: 1, stagger: 1, movement: 1, motionEnabled: true }),
  fast: Object.freeze({ duration: 0.55, stagger: 0.45, movement: 1, motionEnabled: true }),
  reduced: Object.freeze({ duration: 0.65, stagger: 0, movement: 0, motionEnabled: false }),
  none: Object.freeze({ duration: 0, stagger: 0, movement: 0, motionEnabled: false }),
});

const ANCHORS = Object.freeze({
  center: Object.freeze({ x: 0.5, y: 0.5 }),
  top: Object.freeze({ x: 0.5, y: 0 }),
  bottom: Object.freeze({ x: 0.5, y: 1 }),
  left: Object.freeze({ x: 0, y: 0.5 }),
  right: Object.freeze({ x: 1, y: 0.5 }),
  'top-left': Object.freeze({ x: 0, y: 0 }),
  'top-right': Object.freeze({ x: 1, y: 0 }),
  'bottom-left': Object.freeze({ x: 0, y: 1 }),
  'bottom-right': Object.freeze({ x: 1, y: 1 }),
});

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return number;
}

function nonNegativeInteger(value, label) {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new TypeError(`${label} must be greater than zero.`);
  return number;
}

export function roundVisualNumber(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

export function normalizeVisualIntensity(value = 'normal') {
  return VISUAL_INTENSITIES.includes(value) ? value : 'normal';
}

export function normalizeMotionPolicy(value = 'normal') {
  return MOTION_POLICIES.includes(value) ? value : 'normal';
}

export function normalizeInterruptionPolicy(value = 'queue') {
  return INTERRUPTION_POLICIES.includes(value) ? value : 'queue';
}

function normalizeBounds(raw, label) {
  const x = finite(raw?.x, `${label}.x`);
  const y = finite(raw?.y, `${label}.y`);
  const width = positive(raw?.width, `${label}.width`);
  const height = positive(raw?.height, `${label}.height`);
  return {
    x: roundVisualNumber(x),
    y: roundVisualNumber(y),
    width: roundVisualNumber(width),
    height: roundVisualNumber(height),
  };
}

function normalizeDirectCells(rawCells) {
  return rawCells.map((raw, index) => ({
    reel: nonNegativeInteger(raw.reel ?? raw.column, `cells[${index}].reel`),
    row: nonNegativeInteger(raw.row, `cells[${index}].row`),
    bounds: normalizeBounds(raw.bounds || raw, `cells[${index}]`),
  }));
}

function normalizeReelCells(rawReels) {
  return rawReels.flatMap((rawReel, reelOffset) => {
    const reel = nonNegativeInteger(rawReel.reel ?? rawReel.index ?? reelOffset, `reels[${reelOffset}].reel`);
    const rows = Array.isArray(rawReel.rows) ? rawReel.rows : [];
    if (!rows.length) throw new TypeError(`reels[${reelOffset}].rows must contain the current row geometry.`);
    const reelBounds = normalizeBounds(rawReel.bounds || rawReel, `reels[${reelOffset}]`);
    const rowGap = Math.max(0, finite(rawReel.rowGap ?? 0, `reels[${reelOffset}].rowGap`));
    const explicitHeights = rows.map(row => row && typeof row === 'object' ? Number(row.height) : Number(row));
    const canUseExplicitHeights = explicitHeights.every(value => Number.isFinite(value) && value > 0);
    const uniformHeight = (reelBounds.height - rowGap * Math.max(0, rows.length - 1)) / rows.length;
    if (!canUseExplicitHeights && uniformHeight <= 0) throw new TypeError(`reels[${reelOffset}] has no usable row height.`);
    let cursorY = reelBounds.y;
    return rows.map((rawRow, rowOffset) => {
      const rowObject = rawRow && typeof rawRow === 'object' ? rawRow : {};
      const row = nonNegativeInteger(rowObject.row ?? rowObject.index ?? rowOffset, `reels[${reelOffset}].rows[${rowOffset}].row`);
      const width = positive(rowObject.width ?? reelBounds.width, `reels[${reelOffset}].rows[${rowOffset}].width`);
      const height = positive(rowObject.height ?? (canUseExplicitHeights ? explicitHeights[rowOffset] : uniformHeight), `reels[${reelOffset}].rows[${rowOffset}].height`);
      const x = finite(rowObject.x ?? reelBounds.x, `reels[${reelOffset}].rows[${rowOffset}].x`);
      const y = rowObject.y == null
        ? cursorY
        : finite(rowObject.y, `reels[${reelOffset}].rows[${rowOffset}].y`);
      cursorY = y + height + rowGap;
      return {
        reel,
        row,
        bounds: {
          x: roundVisualNumber(x), y: roundVisualNumber(y),
          width: roundVisualNumber(width), height: roundVisualNumber(height),
        },
      };
    });
  });
}

/**
 * Normalizes the renderer's current reel geometry. Callers may provide either
 * explicit `cells`, or `reels` with per-row geometry. Variable row counts and
 * heights are retained; no game board or math result is consulted.
 */
export function normalizeReelGeometry(raw = {}) {
  const cells = Array.isArray(raw.cells) && raw.cells.length
    ? normalizeDirectCells(raw.cells)
    : normalizeReelCells(Array.isArray(raw.reels) ? raw.reels : []);
  if (!cells.length) throw new TypeError('reelGeometry must contain explicit cells or reels with row geometry.');
  const seen = new Set();
  for (const cell of cells) {
    const key = `${cell.reel}:${cell.row}`;
    if (seen.has(key)) throw new TypeError(`reelGeometry duplicates cell ${key}.`);
    seen.add(key);
  }
  cells.sort((a, b) => a.reel - b.reel || a.row - b.row);
  const minX = Math.min(...cells.map(cell => cell.bounds.x));
  const minY = Math.min(...cells.map(cell => cell.bounds.y));
  const maxX = Math.max(...cells.map(cell => cell.bounds.x + cell.bounds.width));
  const maxY = Math.max(...cells.map(cell => cell.bounds.y + cell.bounds.height));
  return {
    format: 'stake-studio-reel-geometry-v1',
    coordinateSpace: {
      x: roundVisualNumber(raw.coordinateSpace?.x ?? minX),
      y: roundVisualNumber(raw.coordinateSpace?.y ?? minY),
      width: roundVisualNumber(raw.coordinateSpace?.width ?? maxX - minX),
      height: roundVisualNumber(raw.coordinateSpace?.height ?? maxY - minY),
    },
    cells,
  };
}

export function normalizeEventPosition(raw, label = 'position') {
  return {
    reel: nonNegativeInteger(raw?.reel ?? raw?.column, `${label}.reel`),
    row: nonNegativeInteger(raw?.row, `${label}.row`),
  };
}

export function resolveCellBounds(reelGeometry, rawPosition) {
  const geometry = reelGeometry?.format === 'stake-studio-reel-geometry-v1'
    ? reelGeometry
    : normalizeReelGeometry(reelGeometry);
  const position = normalizeEventPosition(rawPosition);
  const cell = geometry.cells.find(item => item.reel === position.reel && item.row === position.row);
  if (!cell) throw new RangeError(`Event position ${position.reel}:${position.row} is absent from the current reel geometry.`);
  return { ...cell.bounds };
}

export function resolveCellAnchor(reelGeometry, rawPosition, rawAnchor = 'center') {
  const bounds = resolveCellBounds(reelGeometry, rawPosition);
  let anchor;
  let anchorName;
  if (typeof rawAnchor === 'string') {
    anchor = ANCHORS[rawAnchor];
    anchorName = rawAnchor;
    if (!anchor) throw new TypeError(`Unknown cell anchor "${rawAnchor}".`);
  } else {
    anchor = {
      x: finite(rawAnchor?.x, 'anchor.x'),
      y: finite(rawAnchor?.y, 'anchor.y'),
    };
    if (anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1) {
      throw new RangeError('Custom cell anchors must be normalized between 0 and 1.');
    }
    anchorName = 'custom';
  }
  return {
    x: roundVisualNumber(bounds.x + bounds.width * anchor.x),
    y: roundVisualNumber(bounds.y + bounds.height * anchor.y),
    anchor: anchorName,
    bounds,
  };
}

export function scalePhaseTiming(baseTiming, intensity, motionPolicy) {
  const resolvedIntensity = normalizeVisualIntensity(intensity);
  const resolvedMotion = normalizeMotionPolicy(motionPolicy);
  const intensityProfile = INTENSITY_PROFILES[resolvedIntensity];
  const motionProfile = MOTION_PROFILE_FACTORS[resolvedMotion];
  const durations = Object.fromEntries(Object.entries(baseTiming.durations).map(([phase, value]) => [
    phase,
    Math.max(0, Math.round(value * intensityProfile.timingScale * motionProfile.duration)),
  ]));
  return {
    durations,
    staggerMs: Math.max(0, Math.round((baseTiming.staggerMs || 0) * motionProfile.stagger)),
    motionEnabled: motionProfile.motionEnabled,
    movementScale: motionProfile.movement,
  };
}

export function assemblePhases(phaseIds, timing, cueFactory) {
  let cursor = 0;
  return phaseIds.map((id, index) => {
    const configuredDurationMs = timing.durations[id] || 0;
    const cues = cueFactory(id, {
      durationMs: configuredDurationMs,
      staggerMs: timing.staggerMs,
      motionEnabled: timing.motionEnabled,
    });
    const latestCueMs = Math.max(0, ...cues.map(cue => Number(cue.relativeAtMs) || 0));
    const durationMs = Math.max(configuredDurationMs, latestCueMs);
    const phase = {
      id,
      index,
      startMs: cursor,
      durationMs,
      endMs: cursor + durationMs,
      interruptibleAfter: true,
      cues,
    };
    cursor += durationMs;
    return phase;
  });
}

export function createPlanControl({ eventId, kind, interruption = 'queue', completionPhase }) {
  const policy = normalizeInterruptionPolicy(interruption);
  const token = `${kind}:${eventId}:ack`;
  return {
    interruption: {
      policy,
      boundary: 'phase',
      cancellationRequiresAcknowledgement: true,
    },
    acknowledgement: {
      required: true,
      token,
      completionPhase,
      acceptedStatuses: ['completed', 'cancelled', 'skipped'],
    },
  };
}

export function createChoreographyAcknowledgement(plan, { status = 'completed', completedPhase = null } = {}) {
  if (!plan?.acknowledgement?.required) throw new TypeError('A visual choreography plan with an acknowledgement contract is required.');
  if (!plan.acknowledgement.acceptedStatuses.includes(status)) throw new TypeError(`Unsupported acknowledgement status "${status}".`);
  const resolvedPhase = completedPhase || (status === 'completed' ? plan.acknowledgement.completionPhase : null);
  if (status === 'completed' && resolvedPhase !== plan.acknowledgement.completionPhase) {
    throw new RangeError(`Completed acknowledgement must reach phase "${plan.acknowledgement.completionPhase}".`);
  }
  return {
    format: 'stake-studio-visual-choreography-ack-v1',
    planId: plan.id,
    eventId: plan.eventId,
    token: plan.acknowledgement.token,
    status,
    completedPhase: resolvedPhase,
  };
}

export function resolvePlanInterruption({ activePlan, incomingPlan, activePhase, phaseComplete = false } = {}) {
  if (!activePlan || !incomingPlan) throw new TypeError('Both activePlan and incomingPlan are required.');
  const policy = incomingPlan.interruption?.policy || 'queue';
  if (policy === 'ignore') return { decision: 'ignore', acknowledgeIncomingAs: 'skipped' };
  if (policy === 'queue') return { decision: 'queue', afterPlanId: activePlan.id };
  if (phaseComplete) return { decision: 'replace-now', cancelPlanId: activePlan.id, acknowledgementRequired: true };
  return {
    decision: 'replace-at-phase-boundary',
    cancelPlanId: activePlan.id,
    afterPhase: activePhase || null,
    acknowledgementRequired: true,
  };
}
