import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPHEUS_MAX_WIN_AMOUNT,
} from '../src/engines/morpheus/MorpheusGameContract.js';
import {
  reconstructMorpheusTrace,
} from '../src/engines/morpheus/MorpheusEventProtocol.js';
import {
  createExactMaxTerminationProofTrace,
  createMysteryStarDreamfallProofTrace,
  createTricksterGridSettlementProofTrace,
  createLucidFamilyMultiplierProofTrace,
  createPredeterminedGeneratorProofTrace,
  createNightmareReliquaryProofTrace,
} from '../src/engines/morpheus/MorpheusEffectProofTraces.js';
import {
  MorpheusEffectOrchestrationRuntime,
  proveMorpheusEffectMotionEquivalence,
  runMorpheusEffectProofTrace,
} from '../src/engines/presentation/morpheus/MorpheusEffectOrchestrationRuntime.js';

const clone = value => JSON.parse(JSON.stringify(value));

function acknowledge(runtime, command) {
  return runtime.acknowledge({
    id: command.acknowledgementId,
    evidence: `settled:${command.eventIndex}:${command.eventType}`,
  });
}

test('Trickster grid route wakes at 1x, doubles each unique contributor once, and closes normally', () => {
  const proof = createTricksterGridSettlementProofTrace();
  assert.deepEqual(proof.events.map(event => event.type), [
    'modeGridStart', 'reveal', 'winInfo',
    'positionMultiplierGridUpdate', 'positionMultiplierGridUpdate', 'positionMultiplierGridUpdate',
    'tumbleBoard',
  ]);
  assert.equal(proof.reconstruction.passed, true);
  assert.equal(proof.reconstruction.finalState.positionGridMode, 'trickster_dream');
  assert.deepEqual(Object.values(proof.reconstruction.finalState.positionMultipliers).filter(value => value === 2), [2, 2, 2]);
  assert.deepEqual(proof.reconstruction.finalState.acknowledgements, ['ack:morpheus:proof:trickster-grid:tumble']);
  const equivalence = proveMorpheusEffectMotionEquivalence(proof.events, proof.routeId);
  assert.equal(equivalence.passed, true);
});

test('Lucid route proves four Gates and doubles only the settled non-wild family', () => {
  const proof = createLucidFamilyMultiplierProofTrace();
  assert.deepEqual(proof.events.map(event => event.type), [
    'guaranteedScatters', 'reveal', 'winInfo', 'symbolMultiplierUpdate', 'tumbleBoard',
  ]);
  assert.equal(proof.reconstruction.passed, true);
  assert.equal(proof.reconstruction.finalState.featureTier, 'lucid_blessing');
  assert.equal(proof.reconstruction.finalState.symbolFamilyMultipliers.POPPY, 2);
  assert.equal(proveMorpheusEffectMotionEquivalence(proof.events, proof.routeId).passed, true);
  const drifted = clone(proof.events);
  drifted[1].payload.board[2][0].name = 'OWL';
  drifted[1].transition.after.boardHash = drifted[1].transition.after.boardHash.replace(/^./, '0');
  assert.throws(() => reconstructMorpheusTrace(drifted), /guaranteedScatters|board hash/);
});

test('predetermined generator declarations match the final Raining Wild and Stacked Reel board', () => {
  const proof = createPredeterminedGeneratorProofTrace();
  assert.deepEqual(proof.events.map(event => event.type), [
    'rainingWilds', 'stackedReels', 'reveal', 'winInfo', 'tumbleBoard',
  ]);
  assert.equal(proof.reconstruction.passed, true);
  assert.deepEqual(proof.reconstruction.finalState.predeterminedEvents.map(event => event.type), ['rainingWilds', 'stackedReels']);
  assert.equal(proveMorpheusEffectMotionEquivalence(proof.events, proof.routeId).passed, true);
});

test('Nightmare declares exactly three ordered specials and each matches the authoritative position', () => {
  const proof = createNightmareReliquaryProofTrace();
  assert.deepEqual(proof.events.slice(0, 3).map(event => event.payload.revealOrder), [1, 2, 3]);
  assert.equal(proof.reconstruction.passed, true);
  assert.equal(proof.reconstruction.finalState.predeterminedEvents.length, 3);
  assert.equal(proveMorpheusEffectMotionEquivalence(proof.events, proof.routeId).passed, true);
  const drifted = clone(proof.events);
  drifted[3].payload.board[2][0].name = 'OWL';
  drifted[3].transition.after.boardHash = '00000000';
  assert.throws(() => reconstructMorpheusTrace(drifted), /guaranteedSpecialReveal|board hash/);
});

test('mixed Mystery -> Star -> Dreamfall route is a fully reconstructable authoritative trace', () => {
  const proof = createMysteryStarDreamfallProofTrace();
  assert.deepEqual(proof.events.map(event => event.type), [
    'reveal', 'winInfo', 'mysteryTransform', 'specialTargetSelected', 'specialPositionsResolved',
    'expandReelHeight', 'tumbleChainProgress', 'awardTumbleFreeSpins', 'tumbleBoard',
  ]);
  assert.equal(proof.reconstruction.passed, true);
  assert.deepEqual(proof.reconstruction.finalState.reelHeights, [4, 4, 4, 5, 4, 4]);
  assert.equal(proof.reconstruction.finalState.tumbleChainHit, 5);
  assert.equal(proof.reconstruction.finalState.freeSpinsRemaining, 7);
  assert.deepEqual(proof.reconstruction.finalState.acknowledgements, ['ack:morpheus:proof:mixed:tumble-5']);

  const mystery = proof.events[2];
  const star = proof.events[4];
  assert.equal(mystery.payload.accountingIdentity, 'MYSTERY_VEIL');
  assert.equal(mystery.payload.revealedAs, 'POPPY');
  assert.equal(star.payload.special, 'ONEIRIC_STAR');
  assert.ok(star.payload.positions.length >= 6);
  assert.equal(star.payload.boardAfter[4][3].name, 'RIFT_WILD');
});

test('every orchestration step is a real barrier and requires evidence-bearing acknowledgement', () => {
  const proof = createMysteryStarDreamfallProofTrace();
  const runtime = new MorpheusEffectOrchestrationRuntime({
    routeId: proof.routeId,
    motionMode: 'normal',
  });
  const first = runtime.dispatch(proof.events[0]);
  assert.equal(first.blocking, true);
  assert.throws(() => runtime.dispatch(proof.events[1]), /before acknowledging/);
  assert.throws(() => runtime.acknowledge({ id: first.acknowledgementId }), /requires evidence/);
  assert.throws(() => runtime.checkpoint(), /cannot checkpoint before acknowledging/);
  const receipt = acknowledge(runtime, first);
  assert.equal(receipt.eventType, 'reveal');
  assert.match(receipt.receiptHash, /^[0-9a-f]{8}$/);

  for (const event of proof.events.slice(1)) acknowledge(runtime, runtime.dispatch(event));
  const report = runtime.snapshot();
  assert.equal(report.state.completed, true);
  assert.equal(report.protocolEvidence.passed, true);
  assert.equal(report.acknowledgements.length, proof.events.length);
  assert.equal(report.commands.at(-1).acknowledgementId, 'ack:morpheus:proof:mixed:tumble-5');
});

test('normal, fast, reduced, and no-motion preserve identical mixed-route semantic and acknowledgement hashes', () => {
  const proof = createMysteryStarDreamfallProofTrace();
  const equivalence = proveMorpheusEffectMotionEquivalence(proof.events, proof.routeId);
  assert.equal(equivalence.passed, true);
  assert.deepEqual(
    new Set(Object.values(equivalence.reports).map(report => report.stateHash)).size,
    1,
  );
  assert.deepEqual(
    new Set(Object.values(equivalence.reports).map(report => report.semanticTraceHash)).size,
    1,
  );
  assert.notEqual(
    equivalence.reports.normal.commands[0].durationMs,
    equivalence.reports.fast.commands[0].durationMs,
  );
  assert.equal(equivalence.reports.reduced.commands[2].durationMs, null);
  assert.equal(equivalence.reports.reduced.commands[2].timingStatus, 'contract-detail-required');
  assert.equal(equivalence.reports.none.commands[2].durationMs, 0);
  assert.equal(equivalence.reports.none.commands[2].motionSuppressed, true);
});

test('checkpoint reconnect resumes without double mutation and converges with uninterrupted playback', () => {
  const proof = createMysteryStarDreamfallProofTrace();
  const uninterrupted = runMorpheusEffectProofTrace(proof.events, {
    routeId: proof.routeId,
    motionMode: 'fast',
  });

  const first = new MorpheusEffectOrchestrationRuntime({ routeId: proof.routeId, motionMode: 'fast' });
  for (const event of proof.events.slice(0, 5)) acknowledge(first, first.dispatch(event));
  const checkpoint = first.checkpoint();
  const resumed = new MorpheusEffectOrchestrationRuntime({
    routeId: proof.routeId,
    motionMode: 'fast',
    checkpoint,
  });
  assert.throws(() => resumed.dispatch(proof.events[4]), /index 4 does not match expected 5/);
  for (const event of proof.events.slice(5)) acknowledge(resumed, resumed.dispatch(event));
  const recovered = resumed.snapshot();

  assert.equal(recovered.eventHash, uninterrupted.eventHash);
  assert.equal(recovered.stateHash, uninterrupted.stateHash);
  assert.equal(recovered.semanticTraceHash, uninterrupted.semanticTraceHash);
  assert.equal(recovered.acknowledgementHash, uninterrupted.acknowledgementHash);
  assert.deepEqual(recovered.state.board, uninterrupted.state.board);

  const tampered = clone(checkpoint);
  tampered.state.star.targetFamily = 'NYX';
  assert.throws(() => new MorpheusEffectOrchestrationRuntime({
    routeId: proof.routeId,
    checkpoint: tampered,
  }), /checkpoint hash/);
});

test('route order rejects Star resolution before target selection and board drift before growth', () => {
  const proof = createMysteryStarDreamfallProofTrace();
  const runtime = new MorpheusEffectOrchestrationRuntime({ routeId: proof.routeId });
  for (const event of proof.events.slice(0, 3)) acknowledge(runtime, runtime.dispatch(event));

  const prematureResolve = clone(proof.events[4]);
  prematureResolve.index = 3;
  assert.throws(() => runtime.dispatch(prematureResolve), /expected specialTargetSelected/);

  acknowledge(runtime, runtime.dispatch(proof.events[3]));
  acknowledge(runtime, runtime.dispatch(proof.events[4]));
  const driftedGrowth = clone(proof.events[5]);
  driftedGrowth.payload.boardBefore[0][0].name = 'NYX';
  driftedGrowth.transition.before.boardHash = '00000000';
  assert.throws(() => runtime.dispatch(driftedGrowth), /board hashes|boardBefore|exact one-cell authoritative growth/);
});

test('exact 100,000x route preempts every mutation and deliberately terminates', () => {
  const proof = createExactMaxTerminationProofTrace();
  assert.deepEqual(proof.events.map(event => event.type), [
    'reveal', 'winInfo', 'maxWinReached', 'roundTerminated',
  ]);
  const runtime = new MorpheusEffectOrchestrationRuntime({ routeId: proof.routeId });
  for (const event of proof.events.slice(0, 3)) acknowledge(runtime, runtime.dispatch(event));
  assert.equal(runtime.snapshot().state.totalWinAmount, MORPHEUS_MAX_WIN_AMOUNT);
  assert.equal(runtime.snapshot().state.terminal, true);

  const forbiddenTumble = clone(createMysteryStarDreamfallProofTrace().events.at(-1));
  forbiddenTumble.roundId = proof.events[0].roundId;
  forbiddenTumble.index = 3;
  forbiddenTumble.cause = { eventIndex: 2, eventType: 'maxWinReached' };
  assert.throws(() => runtime.dispatch(forbiddenTumble), /expected roundTerminated/);

  acknowledge(runtime, runtime.dispatch(proof.events[3]));
  const report = runtime.snapshot();
  assert.equal(report.state.terminal, true);
  assert.equal(report.state.terminated, true);
  assert.equal(report.state.completed, true);
  assert.equal(report.state.terminalCause, 'MAX_MORPHEUS');
  assert.equal(report.protocolEvidence.stateHash, proof.reconstruction.stateHash);
  assert.throws(() => runtime.dispatch(proof.events[3]), /already complete/);
});

test('protocol independently rejects a missing terminal close and post-MAX mutation', () => {
  const proof = createExactMaxTerminationProofTrace();
  assert.throws(() => reconstructMorpheusTrace(proof.events.slice(0, 3)), /must end with roundTerminated/);

  const illegal = clone(proof.events);
  const tumble = clone(createMysteryStarDreamfallProofTrace().events.at(-1));
  tumble.roundId = proof.events[0].roundId;
  tumble.index = 3;
  tumble.cause = { eventIndex: 2, eventType: 'maxWinReached' };
  illegal.splice(3, 0, tumble);
  illegal[4].index = 4;
  assert.throws(() => reconstructMorpheusTrace(illegal), /only roundTerminated may follow maxWinReached/);
});
