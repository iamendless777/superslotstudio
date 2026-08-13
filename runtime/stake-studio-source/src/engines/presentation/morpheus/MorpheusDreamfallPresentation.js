import { runWorstCaseRuntimeSpike } from '../../factory/spikes/WorstCaseRuntimeSpike.js';

export const MORPHEUS_DREAMFALL_PRESENTATION_FORMAT = 'morpheus-dreamfall-signature-presentation-v1';

export const DREAMFALL_MOTION_MODES = Object.freeze(['normal', 'fast', 'reduced']);

const EVENT_PRESENTATION = Object.freeze({
  reveal: Object.freeze({ phase: 'board-land', blocking: true, acknowledgement: 'authoritative-board-landed', durations: [420, 176, 0] }),
  winInfo: Object.freeze({ phase: 'positive-win', blocking: true, acknowledgement: 'settled-positive-win-shown', durations: [1500, 630, 0] }),
  updateTumbleWin: Object.freeze({ phase: 'win-meter', blocking: false, acknowledgement: null, durations: [0, 0, 0] }),
  tumbleChainProgress: Object.freeze({ phase: 'chain-hud', blocking: true, acknowledgement: 'tumble-chain-hud-updated', durations: [260, 110, 0] }),
  awardTumbleFreeSpins: Object.freeze({ phase: 'free-spin-award', blocking: true, acknowledgement: 'tumble-free-spin-award-read', durations: [520, 220, 0] }),
  expandReelHeight: Object.freeze({ phase: 'reel-expansion', blocking: true, acknowledgement: 'mask-cap-animation-finished', durations: [620, 260, 0] }),
  tumbleBoard: Object.freeze({ phase: 'tumble', blocking: true, acknowledgement: 'tumble-settled', durations: [460, 195, 0] }),
  setWin: Object.freeze({ phase: 'win-settle', blocking: false, acknowledgement: null, durations: [0, 0, 0] }),
  finalWin: Object.freeze({ phase: 'round-final', blocking: true, acknowledgement: 'dreamfall-final-state-visible', durations: [760, 320, 0] }),
});

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

export function hashMorpheusPresentationValue(value) {
  const text = JSON.stringify(canonicalize(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizeDreamfallMotionMode(value) {
  if (!DREAMFALL_MOTION_MODES.includes(value)) throw new Error(`Unsupported Dreamfall motion mode "${value}".`);
  return value;
}

function profileFor(type, motionMode) {
  const definition = EVENT_PRESENTATION[type];
  if (!definition) throw new Error(`Dreamfall signature projection does not recognize event "${type}".`);
  const modeIndex = DREAMFALL_MOTION_MODES.indexOf(motionMode);
  return {
    phase: definition.phase,
    blocking: definition.blocking,
    expectedEvidence: definition.acknowledgement,
    durationMs: definition.durations[modeIndex],
    motionStrategy: motionMode === 'reduced' ? 'instant-semantic-commit'
      : motionMode === 'fast' ? 'accelerated-authored-motion' : 'authored-motion',
  };
}

/**
 * Build one serializable renderer command. Semantic content is deliberately
 * separated from timing so normal, fast, and reduced motion can be proven
 * equivalent without pretending their durations are identical.
 */
export function createMorpheusDreamfallPresentationCommand({ event, before, after, motionMode }) {
  const mode = normalizeDreamfallMotionMode(motionMode);
  const profile = profileFor(event.type, mode);
  const payload = event.payload || {};
  const semantic = {
    eventIndex: event.index,
    eventType: event.type,
    sourceFormat: event.sourceFormat,
    contractFingerprint: event.contractFingerprint,
    sourceEventHash: event.sourceEventHash,
    phase: profile.phase,
    boardHash: hashMorpheusPresentationValue(after.board),
    reelRows: [...after.reelRows],
    hud: clone(after.hud),
    sliceComplete: after.sliceComplete,
    fullRoundFinalized: after.fullRoundFinalized,
    completed: after.completed,
  };
  if (event.type === 'expandReelHeight') {
    semantic.resolutionId = payload.resolutionId || null;
    semantic.reel = Number(payload.reel);
    semantic.previousRows = Number(payload.previousRows);
    semantic.rows = Number(payload.rows);
    semantic.maskBefore = clone(before.geometry.reels[semantic.reel].mask);
    semantic.maskAfter = clone(after.geometry.reels[semantic.reel].mask);
    semantic.capBefore = clone(before.geometry.reels[semantic.reel].cap);
    semantic.capAfter = clone(after.geometry.reels[semantic.reel].cap);
  }
  const semanticHash = hashMorpheusPresentationValue(semantic);
  const authoritativeAcknowledgement = event.sourceFormat === 'authoritative-envelope'
    && event.blocking?.policy === 'required'
    ? event.blocking.acknowledgement : null;
  return {
    format: MORPHEUS_DREAMFALL_PRESENTATION_FORMAT,
    id: `dreamfall:${event.index}:${event.type}`,
    semantic,
    semanticHash,
    presentation: {
      motionMode: mode,
      durationMs: profile.durationMs,
      motionStrategy: profile.motionStrategy,
    },
    acknowledgement: profile.blocking ? {
      id: authoritativeAcknowledgement?.id || `dreamfall:${event.index}:${profile.expectedEvidence}`,
      required: true,
      expectedEvidence: profile.expectedEvidence,
      blocksNextEvent: true,
      authority: authoritativeAcknowledgement ? 'protocol-envelope' : 'presentation-choreography',
      sourceStatus: authoritativeAcknowledgement?.status || null,
      completesSlice: Boolean(authoritativeAcknowledgement && event.type === 'tumbleBoard'),
    } : null,
  };
}

/** Keep the known mini constraint visible until authored symbols prove it. */
export function createMorpheusDreamfallVisualProofLedger() {
  const runtimeProof = runWorstCaseRuntimeSpike();
  const mini = runtimeProof.layouts.find(layout => layout.viewport.name === 'mini');
  return {
    fixedWorld: {
      status: runtimeProof.evidence.fixedWorldAcrossGrowth ? 'proven' : 'failed',
      coordinateCells: runtimeProof.evidence.coordinateCells,
    },
    runtimeBudgets: {
      status: runtimeProof.evidence.resourceBudgets ? 'proven' : 'failed',
      fingerprint: runtimeProof.fingerprint,
    },
    miniCompactSymbolLegibility: {
      status: mini?.symbolFloorPass ? 'proven' : 'unresolved',
      cell: clone(mini?.cell || null),
      reason: mini?.risks?.find(item => item.includes('compact authored-symbol legibility')) || '',
      requiredEvidence: [
        'captured 400x250 Dreamfall 8-row signature replay',
        'authored symbol-family recognition review',
        'persistent HUD and primary-control collision audit',
      ],
    },
  };
}
