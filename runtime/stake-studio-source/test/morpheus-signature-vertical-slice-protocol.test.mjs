import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_CONTRACT_REGISTRY,
  MORPHEUS_EVENT_TYPES,
  MORPHEUS_FROZEN_EVENT_TYPES,
  MORPHEUS_MAX_WIN_AMOUNT,
  MORPHEUS_MODE_REGISTRY,
  MORPHEUS_POSITION_GRID_AGGREGATION,
  MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER,
  assertMorpheusContractRegistry,
} from '../src/engines/morpheus/MorpheusGameContract.js';
import {
  applyMorpheusTumble,
  createDreamfallSignatureTrace,
  hashMorpheusProtocolValue,
  reconstructMorpheusTrace,
  validateMorpheusEvent,
} from '../src/engines/morpheus/MorpheusEventProtocol.js';

const clone = value => JSON.parse(JSON.stringify(value));

function terminalTrace({ amount = MORPHEUS_MAX_WIN_AMOUNT, includeTermination = true } = {}) {
  const signature = createDreamfallSignatureTrace();
  const reveal = clone(signature.events[0]);
  reveal.roundId = 'morpheus:max:001';
  const contributors = [{ reel: 0, row: 3 }, { reel: 1, row: 3 }, { reel: 2, row: 3 }];
  const win = {
    ...clone(signature.events[1]),
    roundId: reveal.roundId,
    payload: {
      resolutionId: 'max:resolution:1',
      totalWin: amount,
      cumulativeWin: amount,
      wins: [{ symbol: 'MAX_MORPHEUS', win: amount, ways: 1, positions: contributors }],
      contributingPositions: contributors,
    },
    transition: { before: { totalWinAmount: 0 }, after: { totalWinAmount: amount } },
  };
  const max = {
    schemaVersion: 1,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    roundId: reveal.roundId,
    index: 2,
    type: 'maxWinReached',
    phase: 'terminal',
    source: 'mechanic',
    cause: { eventIndex: 1, eventType: 'winInfo' },
    affectedPositions: contributors,
    blocking: {
      policy: 'required',
      acknowledgement: { id: 'ack:max-morpheus:001', status: 'acknowledged' },
    },
    transition: { before: { terminal: false }, after: { terminal: true } },
    payload: { amount: MORPHEUS_MAX_WIN_AMOUNT, multiplier: 100_000, terminalCause: 'MAX_MORPHEUS' },
  };
  const terminated = {
    schemaVersion: 1,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    roundId: reveal.roundId,
    index: 3,
    type: 'roundTerminated',
    phase: 'terminal',
    source: 'protocol',
    cause: { eventIndex: 2, eventType: 'maxWinReached' },
    affectedPositions: [],
    blocking: { policy: 'none' },
    transition: { before: { terminated: false }, after: { terminated: true } },
    payload: { amount: MORPHEUS_MAX_WIN_AMOUNT, multiplier: 100_000, terminalCause: 'MAX_MORPHEUS' },
  };
  return includeTermination ? [reveal, win, max, terminated] : [reveal, win, max];
}

test('frozen Morpheus registry binds the complete approved mode, mechanic, and event vocabulary', () => {
  assert.equal(assertMorpheusContractRegistry(), true);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.fingerprint, 'morpheus-game-info-v4-100000x-cost-aware-tail-20260811');
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.settlement.maximumProbabilityPolicy, 'cost-aware-rtp-allocation-v1');
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.settlement.maximumRtpAllocation, 0.01);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.settlement.baseMaximumHitOdds, 10_000_000);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.settlement.ordinaryMaximumMultiplier, 99_999.9);
  assert.deepEqual(Object.keys(MORPHEUS_MODE_REGISTRY), [
    'base', 'dream_enhancer', 'trickster_dream', 'nightmare_descent',
    'veil_ascent', 'lucid_blessing', 'dreamfall', 'oneiric_nexus',
  ]);
  assert.equal(MORPHEUS_MODE_REGISTRY.nightmare_descent.costMultiplier, null);
  assert.equal(MORPHEUS_MODE_REGISTRY.dreamfall.entryPolicy, 'release-gated');
  assert.equal(MORPHEUS_MODE_REGISTRY.dreamfall.costMultiplier, null);
  assert.equal(MORPHEUS_MODE_REGISTRY.dreamfall.priceClassMultiplier, 1000);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.settlement.maximumMultiplier, 100_000);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.settlement.maximumAmount, 10_000_000);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.mechanics.nexusPositionGrid.aggregation, MORPHEUS_POSITION_GRID_AGGREGATION);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.mechanics.nexusPositionGrid.maximumCellMultiplier, MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.settlement.settlementQuantumAmount, 10);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.settlement.positiveQuantizedMinimumAmount, 10);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.settlement.maximumBaseBetUsd, 500);
  assert.equal(MORPHEUS_CONTRACT_REGISTRY.settlement.maximumTotalExposureUsd, 50_000_000);
  assert.equal(MORPHEUS_FROZEN_EVENT_TYPES.length, 17);
  assert.equal(MORPHEUS_EVENT_TYPES.length, 20);
  assert.ok(MORPHEUS_FROZEN_EVENT_TYPES.every(type => MORPHEUS_CONTRACT_REGISTRY.events[type]));
  assert.equal(Object.isFrozen(MORPHEUS_CONTRACT_REGISTRY), true);
  assert.equal(Object.isFrozen(MORPHEUS_CONTRACT_REGISTRY.modes.dreamfall), true);
});

test('Dreamfall signature trace validates land -> positive settle -> growth -> progress/award -> acknowledged tumble', () => {
  const trace = createDreamfallSignatureTrace();
  assert.equal(trace.contractFingerprint, MORPHEUS_CONTRACT_FINGERPRINT);
  assert.deepEqual(trace.events.map(event => event.type), [
    'reveal',
    'winInfo',
    'expandReelHeight',
    'tumbleChainProgress',
    'awardTumbleFreeSpins',
    'tumbleBoard',
  ]);
  assert.ok(trace.events.every(validateMorpheusEvent));
  const result = reconstructMorpheusTrace(trace.events);
  const repeated = reconstructMorpheusTrace(clone(trace.events));
  assert.equal(result.passed, true);
  assert.deepEqual(result, repeated);
  assert.equal(result.finalState.totalWinAmount, 250);
  assert.deepEqual(result.finalState.reelHeights, [4, 4, 4, 5, 4, 4]);
  assert.equal(result.finalState.tumbleChainHit, 5);
  assert.equal(result.finalState.freeSpinsRemaining, 7);
  assert.equal(result.finalState.totalTumbleFreeSpinsAwarded, 1);
  assert.deepEqual(result.finalState.acknowledgements, ['ack:morpheus:signature:dreamfall:tumble-5']);
  assert.equal(result.finalBoard[3].length, 5);
  assert.equal(result.timeline.at(-1).boardHash, result.boardHash);
  assert.equal(result.eventHash, hashMorpheusProtocolValue(trace.events));
});

test('non-Dreamfall settlements close at acknowledged tumble without counterfeit growth or chain progress', () => {
  const source = createDreamfallSignatureTrace();
  const reveal = clone(source.events[0]);
  reveal.roundId = 'morpheus:protocol:base-tumble:001';
  reveal.payload.mode = 'base';
  reveal.payload.featureTier = 'base';
  reveal.payload.featureState = { tumbleChainHit: 0, freeSpinsRemaining: 0, totalTumbleFreeSpinsAwarded: 0 };
  const win = clone(source.events[1]);
  win.roundId = reveal.roundId;
  const tumble = clone(source.events.at(-1));
  tumble.roundId = reveal.roundId;
  tumble.index = 2;
  tumble.cause = { eventIndex: 1, eventType: 'winInfo' };
  tumble.payload.reelHeights = [...reveal.payload.reelHeights];
  tumble.payload.boardBefore = clone(reveal.payload.board);
  tumble.payload.boardAfter = applyMorpheusTumble(tumble.payload.boardBefore, tumble.payload);
  tumble.transition.before.boardHash = hashMorpheusProtocolValue(tumble.payload.boardBefore);
  tumble.transition.after.boardHash = hashMorpheusProtocolValue(tumble.payload.boardAfter);
  tumble.blocking.acknowledgement.id = 'ack:morpheus:protocol:base-tumble';
  const result = reconstructMorpheusTrace([reveal, win, tumble]);
  assert.equal(result.passed, true);
  assert.equal(result.finalState.mode, 'base');
  assert.equal(result.finalState.tumbleChainHit, 0);
  assert.deepEqual(result.finalState.acknowledgements, ['ack:morpheus:protocol:base-tumble']);

  const illegalGrowth = clone(source.events[2]);
  illegalGrowth.roundId = reveal.roundId;
  assert.throws(() => reconstructMorpheusTrace([reveal, win, illegalGrowth]), /only in Dreamfall/);
});

test('payload and causal gates reject unknown vocabulary, contract drift, zero settlement, reordering, and missing acknowledgement', () => {
  const trace = createDreamfallSignatureTrace();

  const unknown = clone(trace.events[0]);
  unknown.type = 'inventedDreamEvent';
  assert.throws(() => validateMorpheusEvent(unknown), /unknown event type/);

  const drifted = clone(trace.events[0]);
  drifted.contractFingerprint = 'morpheus-game-info-v1';
  assert.throws(() => validateMorpheusEvent(drifted), /fingerprint mismatch/);

  const zero = clone(trace.events);
  zero[1].payload.totalWin = 0;
  zero[1].payload.cumulativeWin = 0;
  zero[1].payload.wins[0].win = 0;
  zero[1].transition.after.totalWinAmount = 0;
  assert.throws(() => reconstructMorpheusTrace(zero), /at least 10 book units/);

  const reordered = clone(trace.events);
  [reordered[2], reordered[3]] = [reordered[3], reordered[2]];
  reordered.forEach((event, index) => { event.index = index; });
  assert.throws(() => reconstructMorpheusTrace(reordered), /cause type|must follow one reel growth/);

  const unacknowledged = clone(trace.events);
  unacknowledged[5].blocking.acknowledgement.status = 'pending';
  assert.throws(() => reconstructMorpheusTrace(unacknowledged), /resolved presentation acknowledgement/);
});

test('Stake settlement quantum rejects 1 and 11 book units while accepting 10', () => {
  const settlementEvent = amount => {
    const event = clone(createDreamfallSignatureTrace().events[1]);
    event.payload.totalWin = amount;
    event.payload.cumulativeWin = amount;
    event.payload.wins[0].win = amount;
    event.transition.after.totalWinAmount = amount;
    return event;
  };

  assert.throws(() => validateMorpheusEvent(settlementEvent(1)), /at least 10 book units/);
  assert.throws(() => validateMorpheusEvent(settlementEvent(11)), /divisible by the 10-unit settlement quantum/);
  assert.equal(validateMorpheusEvent(settlementEvent(10)), true);
});

test('unique contributing positions count once regardless of ways and must equal the settled position union', () => {
  const trace = createDreamfallSignatureTrace();
  trace.events[1].payload.wins[0].ways = 128;
  assert.equal(validateMorpheusEvent(trace.events[1]), true);
  assert.equal(trace.events[1].payload.contributingPositions.length, 3);

  const duplicated = clone(trace.events[1]);
  duplicated.payload.contributingPositions.push({ reel: 0, row: 3 });
  assert.throws(() => validateMorpheusEvent(duplicated), /duplicate position/);

  const missing = clone(trace.events[1]);
  missing.payload.contributingPositions.pop();
  assert.throws(() => validateMorpheusEvent(missing), /unique union/);

  const twoConnectionsOneGrowth = clone(trace.events);
  const secondPositions = [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }];
  twoConnectionsOneGrowth[1].payload.wins.push({
    symbol: 'LAUREL', win: 250, ways: 2, positions: secondPositions,
  });
  twoConnectionsOneGrowth[1].payload.totalWin = 500;
  twoConnectionsOneGrowth[1].payload.cumulativeWin = 500;
  twoConnectionsOneGrowth[1].payload.contributingPositions.push(...secondPositions);
  twoConnectionsOneGrowth[1].affectedPositions.push(...secondPositions);
  twoConnectionsOneGrowth[1].transition.after.totalWinAmount = 500;
  assert.throws(() => reconstructMorpheusTrace(twoConnectionsOneGrowth),
    /one reel growth per settled winning connection/);
});

test('position-grid updates double exactly and saturate visibly at 1024x', () => {
  const signature = createDreamfallSignatureTrace();
  const base = clone(signature.events[2]);
  base.type = 'positionMultiplierGridUpdate';
  base.phase = 'reaction';
  base.source = 'mechanic';
  base.affectedPositions = [{ reel: 0, row: 0 }];
  base.payload = {
    resolutionId: 'grid:resolution:1',
    position: { reel: 0, row: 0 },
    previous: 512,
    current: 1024,
  };
  assert.equal(validateMorpheusEvent(base), true);
  const saturated = clone(base);
  saturated.payload.previous = 1024;
  saturated.payload.current = 1024;
  assert.equal(validateMorpheusEvent(saturated), true);
  const overflow = clone(base);
  overflow.payload.current = 2048;
  assert.throws(() => validateMorpheusEvent(overflow), /1024x cell maximum/);
});

test('exact 100,000x emits MAX_MORPHEUS termination and rejects overflow or an unterminated cap', () => {
  const exact = reconstructMorpheusTrace(terminalTrace());
  assert.equal(exact.finalState.totalWinAmount, 10_000_000);
  assert.equal(exact.finalState.terminal, true);
  assert.equal(exact.finalState.terminated, true);
  assert.equal(exact.finalState.terminalCause, 'MAX_MORPHEUS');
  assert.deepEqual(exact.finalState.acknowledgements, ['ack:max-morpheus:001']);

  assert.throws(() => reconstructMorpheusTrace(terminalTrace({ amount: MORPHEUS_MAX_WIN_AMOUNT + 10 })),
    /exceeds the exact 100,000x terminal amount/);
  assert.throws(() => reconstructMorpheusTrace(terminalTrace({ includeTermination: false })),
    /must end with roundTerminated/);
});
