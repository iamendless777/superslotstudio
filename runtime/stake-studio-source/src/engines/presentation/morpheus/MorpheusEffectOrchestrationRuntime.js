import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_MAX_WIN_AMOUNT,
} from '../../morpheus/MorpheusGameContract.js';
import {
  hashMorpheusProtocolValue,
  reconstructMorpheusTrace,
  validateMorpheusEvent,
} from '../../morpheus/MorpheusEventProtocol.js';
import {
  CONTRACT_DETAIL_REQUIRED,
  MORPHEUS_EFFECT_MOTION_MODES,
  MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY,
  MORPHEUS_ORCHESTRATION_PROOF_ROUTES,
} from '../../morpheus/MorpheusEffectOrchestrationContract.js?orchestration=20260813-3';

export const MORPHEUS_EFFECT_RUNTIME_FORMAT = 'morpheus-effect-orchestration-runtime-v1';
export const MORPHEUS_EFFECT_CHECKPOINT_FORMAT = 'morpheus-effect-orchestration-checkpoint-v1';

const MOTION_MODES = new Set(MORPHEUS_EFFECT_MOTION_MODES);
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const normalizeBoard = board => (board || []).map(reel => reel.map(symbol => ({
  name: typeof symbol === 'string' ? symbol : symbol?.name,
})));

function fail(message) {
  throw new Error(`Morpheus orchestration runtime: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeMotionMode(mode) {
  const normalized = String(mode || 'normal').toLowerCase();
  assert(MOTION_MODES.has(normalized), `unsupported motion mode ${mode}.`);
  return normalized;
}

function routeFor(routeId) {
  const route = MORPHEUS_ORCHESTRATION_PROOF_ROUTES[routeId];
  assert(route, `unknown proof route ${routeId}.`);
  return route;
}

function createInitialState(routeId) {
  return {
    routeId,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    roundId: null,
    board: [],
    reelRows: [4, 4, 4, 4, 4, 4],
    totalWinAmount: 0,
    tumbleChainHit: 0,
    freeSpinsRemaining: 10,
    totalTumbleFreeSpinsAwarded: 0,
    openResolutionId: null,
    mystery: { accountingIdentity: null, revealedAs: null, positions: [] },
    star: { targetFamily: null, sourcePosition: null, resolvedPositions: [] },
    positionGridMode: null,
    positionMultipliers: {},
    symbolFamilyMultipliers: {},
    symbolFamilyBars: {},
    predeterminedEvents: [],
    terminal: false,
    terminated: false,
    terminalCause: null,
    completed: false,
  };
}

function validateCheckpoint(checkpoint, routeId) {
  assert(checkpoint?.format === MORPHEUS_EFFECT_CHECKPOINT_FORMAT, 'invalid checkpoint format.');
  assert(checkpoint.routeId === routeId, `checkpoint route ${checkpoint.routeId} does not match ${routeId}.`);
  assert(!checkpoint.pendingAcknowledgement, 'checkpoint contains unacknowledged presentation work.');
  const copy = clone(checkpoint);
  const expected = copy.checkpointHash;
  delete copy.checkpointHash;
  assert(hashMorpheusProtocolValue(copy) === expected, 'checkpoint hash does not match its contents.');
}

function commandAcknowledgementId(event) {
  return event.blocking?.acknowledgement?.id
    || `ack:presentation:${event.roundId}:${event.index}:${event.type}`;
}

function applyBoardMutation(state, event) {
  assert(sameValue(state.board, normalizeBoard(event.payload.boardBefore)),
    `${event.type} boardBefore does not match projected state.`);
  state.board = normalizeBoard(event.payload.boardAfter);
}

function applyEventState(state, event) {
  const payload = event.payload;
  if (['guaranteedSpecialReveal', 'rainingWilds', 'stackedReels', 'guaranteedScatters'].includes(event.type)) {
    assert(state.board.length === 0, `${event.type} must precede authoritative reveal.`);
    state.roundId = event.roundId;
    state.predeterminedEvents.push({ type: event.type, payload: clone(payload) });
    return;
  }
  if (event.type === 'modeGridStart') {
    assert(state.board.length === 0, 'position grid must start before authoritative reveal.');
    state.roundId = event.roundId;
    state.positionGridMode = payload.mode;
    state.positionMultipliers = Object.fromEntries(payload.cells.map(cell => [
      `${Number(cell.position.reel)}:${Number(cell.position.row)}`,
      Number(cell.value),
    ]));
    return;
  }
  if (event.type === 'reveal') {
    assert(state.board.length === 0, 'reveal may occur only once.');
    state.roundId = event.roundId;
    state.board = normalizeBoard(payload.board);
    state.reelRows = [...payload.reelHeights];
    state.tumbleChainHit = Number(payload.featureState.tumbleChainHit);
    state.freeSpinsRemaining = Number(payload.featureState.freeSpinsRemaining);
    state.totalTumbleFreeSpinsAwarded = Number(payload.featureState.totalTumbleFreeSpinsAwarded);
    state.symbolFamilyBars = clone(payload.featureState.symbolFamilyBars || {});
    return;
  }

  if (event.type === 'winInfo') {
    assert(state.openResolutionId === null, 'positive settlement already open.');
    assert(Number(event.transition.before.totalWinAmount) === state.totalWinAmount,
      'winInfo before total does not match projected state.');
    state.totalWinAmount = Number(payload.cumulativeWin);
    state.openResolutionId = payload.resolutionId;
    return;
  }

  if (event.type === 'mysteryTransform') {
    assert(state.openResolutionId === payload.resolutionId, 'Mystery requires the open positive settlement.');
    applyBoardMutation(state, event);
    state.mystery = {
      accountingIdentity: payload.accountingIdentity,
      revealedAs: payload.revealedAs,
      positions: clone(payload.positions),
    };
    return;
  }

  if (event.type === 'positionMultiplierGridUpdate') {
    assert(state.openResolutionId === payload.resolutionId,
      'position-grid update requires the open positive settlement.');
    assert(Boolean(state.positionGridMode), 'position-grid update requires an initialized position grid.');
    const key = `${Number(payload.position.reel)}:${Number(payload.position.row)}`;
    assert(Number(state.positionMultipliers[key]) === Number(payload.previous),
      'position-grid update previous value drifted.');
    state.positionMultipliers[key] = Number(payload.current);
    return;
  }

  if (event.type === 'symbolMultiplierUpdate') {
    assert(state.openResolutionId === payload.resolutionId,
      'symbol multiplier update requires the open positive settlement.');
    assert(Number(state.symbolFamilyMultipliers[payload.symbolFamily] || 1) === Number(payload.previous),
      'symbol multiplier update previous value drifted.');
    state.symbolFamilyMultipliers[payload.symbolFamily] = Number(payload.current);
    return;
  }

  if (event.type === 'symbolBarProgress') {
    assert(state.openResolutionId === payload.resolutionId,
      'symbol-bar progress requires the open positive settlement.');
    assert(Number(state.symbolFamilyBars[payload.symbolFamily] || 0) === Number(payload.previous),
      'symbol-bar progress previous value drifted.');
    state.symbolFamilyBars[payload.symbolFamily] = Number(payload.current);
    return;
  }

  if (event.type === 'symbolUpgrade') {
    assert(state.openResolutionId === payload.resolutionId,
      'symbol upgrade requires the open positive settlement.');
    applyBoardMutation(state, event);
    return;
  }

  if (event.type === 'specialTargetSelected') {
    assert(state.openResolutionId === payload.resolutionId, 'Star targeting requires the open positive settlement.');
    state.star.targetFamily = payload.targetFamily;
    state.star.sourcePosition = clone(event.affectedPositions[0] || null);
    return;
  }

  if (event.type === 'specialPositionsResolved') {
    assert(state.openResolutionId === payload.resolutionId, 'special resolution requires the open positive settlement.');
    assert(payload.special !== 'ONEIRIC_STAR' || state.star.targetFamily,
      'ONEIRIC_STAR positions cannot resolve before target selection.');
    applyBoardMutation(state, event);
    if (payload.special === 'ONEIRIC_STAR') {
      state.star.sourcePosition = clone(payload.sourcePosition || state.star.sourcePosition);
      state.star.resolvedPositions = clone(payload.positions);
    }
    return;
  }

  if (event.type === 'expandReelHeight') {
    assert(state.openResolutionId === payload.resolutionId, 'growth requires the open positive settlement.');
    assert(sameValue(state.board, normalizeBoard(payload.boardBefore)),
      'expandReelHeight boardBefore does not match projected state.');
    assert(sameValue(state.reelRows, payload.reelHeightsBefore),
      'expandReelHeight reel heights do not match projected state.');
    state.board = normalizeBoard(payload.boardAfter);
    state.reelRows = [...payload.reelHeightsAfter];
    return;
  }

  if (event.type === 'tumbleChainProgress') {
    assert(state.openResolutionId === payload.resolutionId, 'progress requires the open positive settlement.');
    assert(Number(event.transition.before.tumbleChainHit) === state.tumbleChainHit,
      'tumbleChainProgress before-state drifted.');
    state.tumbleChainHit = Number(event.transition.after.tumbleChainHit);
    return;
  }

  if (event.type === 'awardTumbleFreeSpins') {
    assert(state.openResolutionId === payload.resolutionId, 'award requires the open positive settlement.');
    assert(Number(event.transition.before.freeSpinsRemaining) === state.freeSpinsRemaining,
      'free-spin award before-state drifted.');
    state.freeSpinsRemaining = Number(event.transition.after.freeSpinsRemaining);
    state.totalTumbleFreeSpinsAwarded = Number(event.transition.after.totalTumbleFreeSpinsAwarded);
    return;
  }

  if (event.type === 'tumbleBoard') {
    assert(state.openResolutionId === payload.resolutionId, 'tumble requires the open positive settlement.');
    assert(sameValue(state.board, normalizeBoard(payload.boardBefore)),
      'tumbleBoard boardBefore does not match projected state.');
    state.board = normalizeBoard(payload.boardAfter);
    state.openResolutionId = null;
    return;
  }

  if (event.type === 'maxWinReached') {
    assert(state.totalWinAmount === MORPHEUS_MAX_WIN_AMOUNT,
      'MAX requires the exact 100,000x projected settlement.');
    assert(state.openResolutionId !== null, 'MAX requires an open positive settlement.');
    state.terminal = true;
    state.terminalCause = payload.terminalCause;
    state.openResolutionId = null;
    return;
  }

  if (event.type === 'roundTerminated') {
    assert(state.terminal && !state.terminated, 'round termination requires the active MAX terminal state.');
    state.terminated = true;
    return;
  }

  fail(`proof runtime does not project event ${event.type}.`);
}

export class MorpheusEffectOrchestrationRuntime {
  constructor({ routeId, motionMode = 'normal', checkpoint } = {}) {
    this.routeId = routeId;
    this.route = routeFor(routeId);
    this.motionMode = normalizeMotionMode(motionMode);
    this.state = createInitialState(routeId);
    this.nextEventIndex = 0;
    this.pendingAcknowledgement = null;
    this.sourceTrace = [];
    this.semanticTrace = [];
    this.acknowledgements = [];
    this.commands = [];
    this.protocolEvidence = null;
    if (checkpoint) this.restore(checkpoint);
  }

  restore(checkpoint) {
    validateCheckpoint(checkpoint, this.routeId);
    this.state = clone(checkpoint.state);
    this.nextEventIndex = Number(checkpoint.nextEventIndex);
    this.sourceTrace = clone(checkpoint.sourceTrace || []);
    this.semanticTrace = clone(checkpoint.semanticTrace || []);
    this.acknowledgements = clone(checkpoint.acknowledgements || []);
    this.pendingAcknowledgement = null;
    this.commands = [];
    this.protocolEvidence = clone(checkpoint.protocolEvidence || null);
  }

  dispatch(rawEvent) {
    assert(!this.state.completed, 'proof route is already complete.');
    assert(!this.pendingAcknowledgement,
      `cannot dispatch event ${rawEvent?.index ?? '?'} before acknowledging ${this.pendingAcknowledgement?.id}.`);
    const event = clone(rawEvent);
    validateMorpheusEvent(event);
    const expectedStep = this.route.steps[this.nextEventIndex];
    assert(expectedStep, `route ${this.routeId} has no event ${this.nextEventIndex}.`);
    assert(Number(event.index) === this.nextEventIndex,
      `event index ${event.index} does not match expected ${this.nextEventIndex}.`);
    assert(event.type === expectedStep.eventType,
      `expected ${expectedStep.eventType} at ${this.nextEventIndex}, received ${event.type}.`);
    assert(!this.state.terminal || event.type === 'roundTerminated',
      `only roundTerminated may follow maxWinReached; received ${event.type}.`);
    if (this.sourceTrace.length) {
      assert(event.roundId === this.state.roundId, 'roundId changed during proof projection.');
      const cause = this.sourceTrace[event.cause.eventIndex];
      assert(cause?.type === event.cause.eventType,
        `event ${event.index} cause does not resolve to its projected source event.`);
    }

    const orchestration = MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY[expectedStep.orchestrationId];
    assert(orchestration, `missing orchestration ${expectedStep.orchestrationId}.`);
    applyEventState(this.state, event);
    const sourceEventHash = hashMorpheusProtocolValue(event);
    const stateHash = hashMorpheusProtocolValue(this.state);
    const timing = orchestration.presentation.timing[this.motionMode];
    const acknowledgementId = commandAcknowledgementId(event);
    const command = {
      format: MORPHEUS_EFFECT_RUNTIME_FORMAT,
      routeId: this.routeId,
      eventIndex: event.index,
      eventType: event.type,
      orchestrationId: expectedStep.orchestrationId,
      priority: orchestration.priority,
      sourceEventHash,
      contractFingerprint: event.contractFingerprint,
      semanticCommitHash: stateHash,
      blocking: true,
      acknowledgementId,
      motionMode: this.motionMode,
      motionSuppressed: this.motionMode === 'none',
      durationMs: Number.isFinite(timing.durationMs) ? timing.durationMs : null,
      timingStatus: timing.durationMs === CONTRACT_DETAIL_REQUIRED ? CONTRACT_DETAIL_REQUIRED : 'frozen',
      assetPlan: clone(orchestration.assets),
    };

    this.sourceTrace.push(event);
    this.semanticTrace.push({
      eventIndex: event.index,
      eventType: event.type,
      orchestrationId: expectedStep.orchestrationId,
      priority: orchestration.priority,
      sourceEventHash,
      semanticCommitHash: stateHash,
    });
    this.commands.push(command);
    this.pendingAcknowledgement = {
      id: acknowledgementId,
      eventIndex: event.index,
      eventType: event.type,
      sourceEventHash,
    };
    return clone(command);
  }

  acknowledge({ id, evidence } = {}) {
    assert(this.pendingAcknowledgement, 'there is no pending acknowledgement.');
    assert(id === this.pendingAcknowledgement.id,
      `acknowledgement ${id} does not match ${this.pendingAcknowledgement.id}.`);
    assert(typeof evidence === 'string' && evidence.length > 0, 'acknowledgement requires evidence.');
    const receipt = {
      id,
      evidence,
      eventIndex: this.pendingAcknowledgement.eventIndex,
      eventType: this.pendingAcknowledgement.eventType,
      sourceEventHash: this.pendingAcknowledgement.sourceEventHash,
    };
    receipt.receiptHash = hashMorpheusProtocolValue(receipt);
    this.acknowledgements.push(receipt);
    this.pendingAcknowledgement = null;
    this.nextEventIndex += 1;

    if (this.nextEventIndex === this.route.steps.length) {
      this.protocolEvidence = reconstructMorpheusTrace(this.sourceTrace);
      this.state.completed = true;
    }
    return clone(receipt);
  }

  checkpoint() {
    assert(!this.pendingAcknowledgement,
      `cannot checkpoint before acknowledging ${this.pendingAcknowledgement?.id}.`);
    const checkpoint = {
      format: MORPHEUS_EFFECT_CHECKPOINT_FORMAT,
      routeId: this.routeId,
      nextEventIndex: this.nextEventIndex,
      pendingAcknowledgement: null,
      state: clone(this.state),
      sourceTrace: clone(this.sourceTrace),
      semanticTrace: clone(this.semanticTrace),
      acknowledgements: clone(this.acknowledgements),
      protocolEvidence: clone(this.protocolEvidence),
    };
    checkpoint.checkpointHash = hashMorpheusProtocolValue(checkpoint);
    return checkpoint;
  }

  snapshot() {
    return {
      format: MORPHEUS_EFFECT_RUNTIME_FORMAT,
      routeId: this.routeId,
      motionMode: this.motionMode,
      nextEventIndex: this.nextEventIndex,
      pendingAcknowledgement: clone(this.pendingAcknowledgement),
      state: clone(this.state),
      sourceTrace: clone(this.sourceTrace),
      semanticTrace: clone(this.semanticTrace),
      acknowledgements: clone(this.acknowledgements),
      commands: clone(this.commands),
      protocolEvidence: clone(this.protocolEvidence),
      eventHash: hashMorpheusProtocolValue(this.sourceTrace),
      stateHash: hashMorpheusProtocolValue(this.state),
      semanticTraceHash: hashMorpheusProtocolValue(this.semanticTrace),
      acknowledgementHash: hashMorpheusProtocolValue(this.acknowledgements),
    };
  }
}

export function runMorpheusEffectProofTrace(events, { routeId, motionMode = 'normal' } = {}) {
  const runtime = new MorpheusEffectOrchestrationRuntime({ routeId, motionMode });
  for (const event of events) {
    const command = runtime.dispatch(event);
    runtime.acknowledge({
      id: command.acknowledgementId,
      evidence: `settled:${command.eventIndex}:${command.eventType}`,
    });
  }
  return runtime.snapshot();
}

export function proveMorpheusEffectMotionEquivalence(events, routeId) {
  const reports = Object.fromEntries([...MOTION_MODES].map(motionMode => [
    motionMode,
    runMorpheusEffectProofTrace(events, { routeId, motionMode }),
  ]));
  const signatures = Object.values(reports).map(report => ({
    eventHash: report.eventHash,
    stateHash: report.stateHash,
    semanticTraceHash: report.semanticTraceHash,
    acknowledgementHash: report.acknowledgementHash,
  }));
  const passed = signatures.every(signature => sameValue(signature, signatures[0]));
  return {
    format: 'morpheus-effect-orchestration-motion-equivalence-v1',
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    routeId,
    passed,
    eventHash: signatures[0].eventHash,
    stateHash: signatures[0].stateHash,
    semanticTraceHash: signatures[0].semanticTraceHash,
    acknowledgementHash: signatures[0].acknowledgementHash,
    reports,
  };
}
