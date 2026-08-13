import {
  applyMorpheusTumble,
  hashMorpheusProtocolValue,
  validateMorpheusEvent,
} from '../../morpheus/MorpheusEventProtocol.js';
import {
  MORPHEUS_WORLD_BOARD_CONTRACT,
  createWorldBoardGeometry,
  createWorldBoardTransition,
} from '../../factory/spikes/WorldBoardRendererSpike.js';
import {
  createMorpheusDreamfallPresentationCommand,
  createMorpheusDreamfallVisualProofLedger,
  hashMorpheusPresentationValue,
  normalizeDreamfallMotionMode,
} from './MorpheusDreamfallPresentation.js';

export const MORPHEUS_DREAMFALL_RUNTIME_FORMAT = 'morpheus-dreamfall-signature-runtime-v1';
export const MORPHEUS_DREAMFALL_CHECKPOINT_FORMAT = 'morpheus-dreamfall-signature-checkpoint-v1';

const SUPPORTED_EVENTS = new Set([
  'reveal', 'winInfo', 'updateTumbleWin', 'tumbleChainProgress',
  'awardTumbleFreeSpins', 'expandReelHeight', 'tumbleBoard', 'setWin', 'finalWin',
]);

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const symbolName = symbol => typeof symbol === 'string' ? symbol : String(symbol?.name || '');

function fail(message) {
  throw new Error(message);
}

function serializeBoard(board) {
  return board.map(reel => reel.map(symbol => ({ name: symbolName(symbol) })));
}

function deserializeBoard(board) {
  if (!Array.isArray(board) || board.length !== MORPHEUS_WORLD_BOARD_CONTRACT.reels) {
    fail('Dreamfall reveal must contain exactly six reels.');
  }
  return board.map((reel, index) => {
    if (!Array.isArray(reel)) fail(`Dreamfall reel ${index} is not an array.`);
    return reel.map(symbolName);
  });
}

function boardRows(board) {
  return board.map(reel => reel.length);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isAuthoritativeEnvelope(event) {
  return Boolean(event && typeof event === 'object'
    && (event.schemaVersion !== undefined || event.contractFingerprint !== undefined
      || event.roundId !== undefined || event.payload !== undefined));
}

/**
 * Pure boundary adapter. The authoritative envelope is cloned and retained
 * intact; payload fields are never flattened, reordered, or rewritten.
 * Legacy flat spike events remain accepted solely for full-round regression
 * support while production-facing integration consumes authoritative events.
 */
export function adaptMorpheusDreamfallEvent(event) {
  if (!event || typeof event !== 'object') fail('Dreamfall event is missing.');
  const sourceEvent = clone(event);
  if (isAuthoritativeEnvelope(sourceEvent)) {
    validateMorpheusEvent(sourceEvent);
    if (!SUPPORTED_EVENTS.has(sourceEvent.type)) {
      fail(`Unsupported Dreamfall signature event "${sourceEvent.type}".`);
    }
    return {
      sourceFormat: 'authoritative-envelope',
      sourceEvent,
      sourceEventHash: hashMorpheusProtocolValue(sourceEvent),
      schemaVersion: sourceEvent.schemaVersion,
      contractFingerprint: sourceEvent.contractFingerprint,
      roundId: sourceEvent.roundId,
      index: Number(sourceEvent.index),
      type: sourceEvent.type,
      phase: sourceEvent.phase,
      cause: clone(sourceEvent.cause),
      affectedPositions: clone(sourceEvent.affectedPositions),
      blocking: clone(sourceEvent.blocking),
      transition: clone(sourceEvent.transition),
      payload: clone(sourceEvent.payload),
    };
  }
  if (!SUPPORTED_EVENTS.has(sourceEvent.type)) {
    fail(`Unsupported Dreamfall signature event "${sourceEvent.type}".`);
  }
  return {
    sourceFormat: 'legacy-flat-spike',
    sourceEvent,
    sourceEventHash: hashMorpheusPresentationValue(sourceEvent),
    schemaVersion: null,
    contractFingerprint: null,
    roundId: null,
    index: Number(sourceEvent.index),
    type: sourceEvent.type,
    phase: null,
    cause: null,
    affectedPositions: clone(sourceEvent.affectedPositions || []),
    blocking: null,
    transition: null,
    payload: clone(sourceEvent),
  };
}

function assertBoardMatchesRows(board, rows, context) {
  if (board.length !== MORPHEUS_WORLD_BOARD_CONTRACT.reels) fail(`${context}: board reel count changed.`);
  for (let reel = 0; reel < board.length; reel++) {
    if (board[reel].length !== rows[reel]) {
      fail(`${context}: reel ${reel} contains ${board[reel].length} symbols but state declares ${rows[reel]}.`);
    }
  }
}

function createInitialState(options = {}) {
  const reelRows = [...MORPHEUS_WORLD_BOARD_CONTRACT.initialReelRows];
  return {
    board: Array.from({ length: 6 }, () => []),
    reelRows,
    geometry: createWorldBoardGeometry({
      width: Number(options.worldWidth) || 576,
      height: Number(options.worldHeight) || 496,
      gap: Number.isFinite(Number(options.gap)) ? Number(options.gap) : 4,
      reelHeights: reelRows,
    }),
    hud: {
      id: 'dreamfall-persistent-hud',
      visible: false,
      mode: 'Dreamfall',
      chainHit: 0,
      awardThreshold: 5,
      awardedFreeSpins: 0,
      freeSpinsRemaining: 0,
      runningWin: 0,
      finalWin: 0,
      reelRows,
      lastExpandedReel: null,
      maximumRows: MORPHEUS_WORLD_BOARD_CONTRACT.maximumReelRows,
    },
    causalPhase: 'awaiting-reveal',
    positiveWinEventIndex: null,
    openResolutionId: null,
    awardDue: false,
    traceKind: null,
    contractFingerprint: null,
    schemaVersion: null,
    roundId: null,
    sourceTrace: [],
    signatureCyclesCompleted: 0,
    sliceAwaitingAcknowledgement: false,
    sliceComplete: false,
    fullRoundFinalized: false,
    completed: false,
  };
}

function validateCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint.format !== MORPHEUS_DREAMFALL_CHECKPOINT_FORMAT) fail('Invalid Morpheus Dreamfall checkpoint.');
  const copy = clone(checkpoint);
  const expected = copy.checkpointHash;
  delete copy.checkpointHash;
  if (hashMorpheusPresentationValue(copy) !== expected) fail('Morpheus Dreamfall checkpoint hash does not match its contents.');
  if (checkpoint.pendingAcknowledgement) fail('A checkpoint may not contain an unacknowledged blocking command.');
}

function validateEvent(event, expectedIndex, state) {
  if (!event || typeof event !== 'object') fail(`Dreamfall event ${expectedIndex} is missing.`);
  if (Number(event.index) !== expectedIndex) fail(`Dreamfall event index ${event.index} does not match expected index ${expectedIndex}.`);
  if (!SUPPORTED_EVENTS.has(event.type)) fail(`Unsupported Dreamfall signature event "${event.type}".`);
  if (state.traceKind && state.traceKind !== event.sourceFormat) {
    fail(`Dreamfall trace changed event format from ${state.traceKind} to ${event.sourceFormat}.`);
  }
  if (event.sourceFormat === 'authoritative-envelope') {
    if (state.contractFingerprint && event.contractFingerprint !== state.contractFingerprint) {
      fail('Dreamfall authoritative contract fingerprint changed during projection.');
    }
    if (state.roundId && event.roundId !== state.roundId) fail('Dreamfall authoritative roundId changed during projection.');
    if (event.index === 0) {
      if (event.cause?.eventIndex !== null || event.cause?.eventType !== 'roundStart') {
        fail('Dreamfall authoritative reveal must be caused by roundStart.');
      }
    } else {
      const cause = state.sourceTrace[event.cause?.eventIndex];
      if (!cause || cause.type !== event.cause?.eventType || Number(event.cause.eventIndex) >= event.index) {
        fail(`Dreamfall event ${event.index} has an unresolved authoritative cause.`);
      }
    }
  }
}

export class MorpheusDreamfallRuntime {
  constructor(options = {}) {
    this.motionMode = normalizeDreamfallMotionMode(options.motionMode || 'normal');
    this.visualProof = createMorpheusDreamfallVisualProofLedger();
    this.pendingAcknowledgement = null;
    this.commands = [];
    this.semanticTrace = [];
    this.acknowledgements = [];
    this.nextEventIndex = 0;
    this.state = createInitialState(options);
    if (options.checkpoint) this.restore(options.checkpoint);
  }

  restore(checkpoint) {
    validateCheckpoint(checkpoint);
    this.state = clone(checkpoint.state);
    this.nextEventIndex = Number(checkpoint.nextEventIndex);
    this.semanticTrace = clone(checkpoint.semanticTrace || []);
    this.acknowledgements = clone(checkpoint.acknowledgements || []);
    this.pendingAcknowledgement = null;
    this.commands = [];
  }

  snapshot() {
    return {
      format: MORPHEUS_DREAMFALL_RUNTIME_FORMAT,
      motionMode: this.motionMode,
      nextEventIndex: this.nextEventIndex,
      pendingAcknowledgement: clone(this.pendingAcknowledgement),
      state: clone(this.state),
      semanticTrace: clone(this.semanticTrace),
      acknowledgements: clone(this.acknowledgements),
      visualProof: clone(this.visualProof),
    };
  }

  checkpoint() {
    if (this.pendingAcknowledgement) {
      fail(`Cannot checkpoint before acknowledging ${this.pendingAcknowledgement.id}.`);
    }
    const checkpoint = {
      format: MORPHEUS_DREAMFALL_CHECKPOINT_FORMAT,
      nextEventIndex: this.nextEventIndex,
      pendingAcknowledgement: null,
      state: clone(this.state),
      semanticTrace: clone(this.semanticTrace),
      acknowledgements: clone(this.acknowledgements),
    };
    checkpoint.checkpointHash = hashMorpheusPresentationValue(checkpoint);
    return checkpoint;
  }

  applyEvent(event) {
    const before = clone(this.state);
    const state = clone(this.state);
    const payload = event.payload;
    const authoritative = event.sourceFormat === 'authoritative-envelope';

    if (event.type === 'reveal') {
      if (state.causalPhase !== 'awaiting-reveal') fail('Dreamfall reveal may occur only at signature-trace start.');
      state.board = deserializeBoard(payload.board || []);
      state.reelRows = authoritative ? [...payload.reelHeights] : boardRows(state.board);
      state.geometry = createWorldBoardGeometry({
        x: state.geometry.world.x,
        y: state.geometry.world.y,
        width: state.geometry.world.width,
        height: state.geometry.world.height,
        gap: state.geometry.gap,
        reelHeights: state.reelRows,
      });
      state.hud.visible = true;
      state.hud.reelRows = [...state.reelRows];
      if (authoritative) {
        state.hud.chainHit = Number(payload.featureState.tumbleChainHit);
        state.hud.awardedFreeSpins = Number(payload.featureState.totalTumbleFreeSpinsAwarded);
        state.hud.freeSpinsRemaining = Number(payload.featureState.freeSpinsRemaining);
        state.traceKind = event.sourceFormat;
        state.contractFingerprint = event.contractFingerprint;
        state.schemaVersion = event.schemaVersion;
        state.roundId = event.roundId;
      } else {
        state.traceKind = event.sourceFormat;
      }
      state.causalPhase = 'board-landed';
    } else if (event.type === 'winInfo') {
      if (!['board-landed', 'tumble-settled'].includes(state.causalPhase)) {
        fail(`Positive win cannot resolve during ${state.causalPhase}.`);
      }
      if (!(Number(payload.totalWin) > 0)) fail('Dreamfall signature winInfo must be a settled positive win.');
      state.positiveWinEventIndex = event.index;
      state.openResolutionId = authoritative ? payload.resolutionId : `legacy:${event.index}`;
      if (authoritative) state.hud.runningWin = Number(payload.cumulativeWin);
      state.causalPhase = 'positive-win-shown';
    } else if (event.type === 'updateTumbleWin') {
      if (authoritative) fail('Authoritative Dreamfall envelopes do not use updateTumbleWin.');
      if (state.causalPhase !== 'positive-win-shown') fail('Tumble win may update only after a settled positive win.');
      state.hud.runningWin = Number(payload.amount) || 0;
    } else if (event.type === 'tumbleChainProgress') {
      const requiredPhase = authoritative ? 'reel-expanded' : 'positive-win-shown';
      if (state.causalPhase !== requiredPhase) {
        fail(authoritative
          ? 'Authoritative tumble progress must follow authoritative reel growth.'
          : 'Tumble chain may advance only after a settled positive win.');
      }
      if (authoritative && payload.resolutionId !== state.openResolutionId) fail('Tumble progress changed resolutionId.');
      if (Number(payload.chainHit) !== state.hud.chainHit + 1) {
        fail(`Dreamfall chain must advance ${state.hud.chainHit}→${state.hud.chainHit + 1}.`);
      }
      state.hud.chainHit = Number(payload.chainHit);
      state.hud.awardThreshold = Number(payload.threshold) || 5;
      state.awardDue = state.hud.chainHit >= state.hud.awardThreshold;
      state.causalPhase = 'chain-progress-visible';
    } else if (event.type === 'awardTumbleFreeSpins') {
      if (state.causalPhase !== 'chain-progress-visible') fail('Tumble free-spin award must follow visible chain progress.');
      if (authoritative && payload.resolutionId !== state.openResolutionId) fail('Tumble award changed resolutionId.');
      if (Number(payload.chainHit) !== state.hud.chainHit || Number(payload.chainHit) < state.hud.awardThreshold) {
        fail('Tumble free-spin award does not match the persistent chain HUD.');
      }
      if (Number(payload.amount) !== 1 || Number(payload.totalAwarded) !== state.hud.awardedFreeSpins + 1) {
        fail('Dreamfall tumble awards exactly one additional free spin per qualifying hit.');
      }
      state.hud.awardedFreeSpins = Number(payload.totalAwarded);
      if (authoritative) state.hud.freeSpinsRemaining = Number(event.transition.after.freeSpinsRemaining);
      state.awardDue = false;
    } else if (event.type === 'expandReelHeight') {
      const requiredPhase = authoritative ? 'positive-win-shown' : 'chain-progress-visible';
      if (state.causalPhase !== requiredPhase) {
        fail(authoritative
          ? 'Authoritative reel growth must immediately follow its positive settlement.'
          : 'Reel expansion must react after visible chain progress.');
      }
      if (authoritative && payload.resolutionId !== state.openResolutionId) fail('Reel growth changed resolutionId.');
      const reel = Number(payload.reel);
      if (Number(payload.previousRows) !== state.reelRows[reel] || Number(payload.rows) !== state.reelRows[reel] + 1) {
        fail(`Dreamfall expansion for reel ${reel} does not match authoritative reel-height state.`);
      }
      if (authoritative && !sameValue(serializeBoard(state.board), payload.boardBefore)) {
        fail(`Dreamfall expansion boardBefore for reel ${reel} does not match projected state.`);
      }
      const transition = createWorldBoardTransition(state.geometry, { reel, rows: Number(payload.rows) });
      if (!transition.passed) fail(`Dreamfall reel ${reel} geometry transition failed its spike invariants.`);
      const symbol = symbolName(payload.newSymbol);
      if (!symbol) fail(`Dreamfall expansion for reel ${reel} omitted its authoritative new symbol.`);
      if (authoritative) state.board = deserializeBoard(payload.boardAfter);
      else state.board[reel].unshift(symbol);
      state.reelRows = [...transition.to.reelHeights];
      state.geometry = transition.to;
      state.hud.reelRows = [...state.reelRows];
      state.hud.lastExpandedReel = reel;
      state.causalPhase = 'reel-expanded';
    } else if (event.type === 'tumbleBoard') {
      if (!['chain-progress-visible', 'reel-expanded'].includes(state.causalPhase)) {
        fail('Tumble may begin only after the chain reaction and optional expansion are visible.');
      }
      if (authoritative) {
        if (payload.resolutionId !== state.openResolutionId) fail('Tumble changed resolutionId.');
        if (state.awardDue) fail('Dreamfall qualifying tumble cannot begin before its free-spin award.');
        if (!sameValue(serializeBoard(state.board), payload.boardBefore)) fail('Tumble boardBefore does not match projected state.');
      }
      state.board = deserializeBoard(applyMorpheusTumble(serializeBoard(state.board), payload));
      if (authoritative && !sameValue(serializeBoard(state.board), payload.boardAfter)) {
        fail('Tumble boardAfter does not match its authoritative payload.');
      }
      state.openResolutionId = null;
      state.signatureCyclesCompleted += 1;
      if (authoritative) state.sliceAwaitingAcknowledgement = true;
      state.causalPhase = 'tumble-settled';
    } else if (event.type === 'setWin') {
      if (authoritative) fail('Authoritative Dreamfall envelopes do not use setWin.');
      if (!['tumble-settled', 'board-landed'].includes(state.causalPhase)) fail('Win settlement arrived before the tumble chain settled.');
      state.hud.runningWin = Number(payload.amount) || state.hud.runningWin;
    } else if (event.type === 'finalWin') {
      if (authoritative) fail('Authoritative Dreamfall envelopes do not use finalWin.');
      if (!['tumble-settled', 'board-landed'].includes(state.causalPhase)) fail('Final win arrived before the board settled.');
      state.hud.finalWin = Number(payload.amount) || 0;
      state.fullRoundFinalized = true;
      state.completed = true;
      state.causalPhase = 'round-final-visible';
    }

    assertBoardMatchesRows(state.board, state.reelRows, `After ${event.type}`);
    state.sourceTrace.push({
      index: event.index,
      type: event.type,
      contractFingerprint: event.contractFingerprint,
      sourceEventHash: event.sourceEventHash,
    });
    return { before, after: state };
  }

  dispatch(sourceEvent) {
    if (this.pendingAcknowledgement) {
      fail(`Event ${sourceEvent?.index} is blocked until ${this.pendingAcknowledgement.id} is acknowledged.`);
    }
    const event = adaptMorpheusDreamfallEvent(sourceEvent);
    validateEvent(event, this.nextEventIndex, this.state);
    const { before, after } = this.applyEvent(event);
    const command = createMorpheusDreamfallPresentationCommand({
      event,
      before,
      after,
      motionMode: this.motionMode,
    });
    this.state = after;
    this.nextEventIndex += 1;
    this.commands.push(command);
    this.semanticTrace.push({
      eventIndex: event.index,
      eventType: event.type,
      contractFingerprint: event.contractFingerprint,
      sourceEventHash: event.sourceEventHash,
      semanticHash: command.semanticHash,
    });
    this.pendingAcknowledgement = clone(command.acknowledgement);
    return clone(command);
  }

  acknowledge(id, evidence) {
    const pending = this.pendingAcknowledgement;
    if (!pending) fail('No blocking Dreamfall presentation acknowledgement is pending.');
    if (id !== pending.id) fail(`Acknowledgement ${id} does not match pending ${pending.id}.`);
    if (String(evidence || '') !== pending.expectedEvidence) {
      fail(`Acknowledgement ${id} requires evidence "${pending.expectedEvidence}".`);
    }
    const receipt = {
      eventIndex: this.nextEventIndex - 1,
      acknowledgementId: id,
      evidence: pending.expectedEvidence,
    };
    receipt.receiptHash = hashMorpheusPresentationValue(receipt);
    this.acknowledgements.push(receipt);
    if (pending.completesSlice) {
      this.state.sliceAwaitingAcknowledgement = false;
      this.state.sliceComplete = true;
    }
    this.pendingAcknowledgement = null;
    return clone(receipt);
  }

  report() {
    if (this.pendingAcknowledgement) fail(`Dreamfall report is blocked by ${this.pendingAcknowledgement.id}.`);
    const state = clone(this.state);
    return {
      format: MORPHEUS_DREAMFALL_RUNTIME_FORMAT,
      motionMode: this.motionMode,
      passed: state.sliceComplete || state.fullRoundFinalized,
      sliceComplete: state.sliceComplete,
      fullRoundFinalized: state.fullRoundFinalized,
      contractFingerprint: state.contractFingerprint,
      nextEventIndex: this.nextEventIndex,
      state,
      stateHash: hashMorpheusPresentationValue(state),
      semanticTrace: clone(this.semanticTrace),
      semanticTraceHash: hashMorpheusPresentationValue(this.semanticTrace),
      sourceTrace: clone(state.sourceTrace),
      sourceTraceHash: hashMorpheusPresentationValue(state.sourceTrace),
      acknowledgements: clone(this.acknowledgements),
      commands: clone(this.commands),
      visualProof: clone(this.visualProof),
    };
  }
}

export function runMorpheusDreamfallSignatureProjection(events, options = {}) {
  const runtime = new MorpheusDreamfallRuntime(options);
  for (let index = runtime.nextEventIndex; index < events.length; index++) {
    const command = runtime.dispatch(events[index]);
    if (command.acknowledgement?.required) {
      runtime.acknowledge(command.acknowledgement.id, command.acknowledgement.expectedEvidence);
    }
  }
  return runtime.report();
}

export function proveMorpheusDreamfallMotionEquivalence(events, options = {}) {
  const reports = ['normal', 'fast', 'reduced'].map(motionMode => (
    runMorpheusDreamfallSignatureProjection(events, { ...options, motionMode })
  ));
  const stateHashes = [...new Set(reports.map(report => report.stateHash))];
  const semanticTraceHashes = [...new Set(reports.map(report => report.semanticTraceHash))];
  const acknowledgementHashes = reports.map(report => hashMorpheusPresentationValue(report.acknowledgements));
  return {
    passed: stateHashes.length === 1
      && semanticTraceHashes.length === 1
      && new Set(acknowledgementHashes).size === 1,
    stateHash: stateHashes[0],
    semanticTraceHash: semanticTraceHashes[0],
    acknowledgementHash: acknowledgementHashes[0],
    reports,
  };
}

export function resumeMorpheusDreamfallSignatureProjection(events, checkpoint, options = {}) {
  return runMorpheusDreamfallSignatureProjection(events, { ...options, checkpoint });
}
