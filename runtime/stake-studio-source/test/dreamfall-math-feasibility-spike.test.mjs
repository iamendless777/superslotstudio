import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DREAMFALL_MATH_SPIKE_FORMAT,
  replayDreamfallSpike,
  runDreamfallMathSpike,
} from '../src/engines/factory/spikes/DreamfallMathSpike.js';

test('Dreamfall spike proves independent 4→8 reel bounds and deterministic replay equality', () => {
  const first = runDreamfallMathSpike({ seed: 0xD43A, tumbleHits: 24 });
  const second = runDreamfallMathSpike({ seed: 0xD43A, tumbleHits: 24 });

  assert.equal(first.format, DREAMFALL_MATH_SPIKE_FORMAT);
  assert.equal(first.passed, true, first.proof.violations.join('\n'));
  assert.deepEqual(first.proof.initialRows, [4, 4, 4, 4, 4, 4]);
  assert.deepEqual(first.proof.finalRows, [8, 8, 8, 8, 8, 8]);
  assert.equal(first.proof.reachedMaximum, true);
  assert.equal(first.proof.deterministicReplayEqual, true);
  assert.deepEqual(first.book, second.book);
  assert.equal(first.proof.eventDigest, second.proof.eventDigest);
  assert.deepEqual(first.book.events.map(event => event.index),
    first.book.events.map((_, index) => index));

  const expansionEvents = first.book.events.filter(event => event.type === 'expandReelHeight');
  assert.equal(expansionEvents.length, 24);
  assert.ok(expansionEvents.every(event => event.rows === event.previousRows + 1));
  assert.ok(expansionEvents.every(event => event.previousRows >= 4 && event.rows <= 8));
  for (let chainHit = 1; chainHit <= 24; chainHit++) {
    const progress = first.book.events.findIndex(event => event.type === 'tumbleChainProgress' && event.chainHit === chainHit);
    const expansion = first.book.events.findIndex((event, index) => index > progress && event.type === 'expandReelHeight');
    const tumble = first.book.events.findIndex((event, index) => index > progress && event.type === 'tumbleBoard');
    assert.ok(progress >= 0 && expansion > progress && tumble > expansion,
      `chain ${chainHit} must settle, expand, then tumble`);
  }
});

test('Dreamfall spike forbids scatter refills and awards +1 on every fifth-and-later tumble hit', () => {
  const spike = runDreamfallMathSpike({
    seed: 91,
    tumbleHits: 6,
    scatterSymbol: 'GATE_OF_SLEEP',
    refillPool: ['GATE_OF_SLEEP', 'MORPHEUS', 'NYX'],
  });
  assert.equal(spike.passed, true, spike.proof.violations.join('\n'));
  assert.equal(spike.proof.scatterFreeRefill, true);
  assert.equal(spike.proof.expectedAwards, 2);
  assert.equal(spike.proof.awardedFreeSpins, 2);
  assert.deepEqual(spike.book.events
    .filter(event => event.type === 'awardTumbleFreeSpins')
    .map(event => [event.chainHit, event.amount, event.totalAwarded]), [
      [5, 1, 1],
      [6, 1, 2],
    ]);
  const incoming = spike.book.events
    .filter(event => event.type === 'tumbleBoard')
    .flatMap(event => event.newSymbols.flat())
    .map(symbol => symbol.name);
  const expansions = spike.book.events
    .filter(event => event.type === 'expandReelHeight')
    .map(event => event.newSymbol.name);
  assert.equal([...incoming, ...expansions].includes('GATE_OF_SLEEP'), false);

  const replay = replayDreamfallSpike(spike.book.events, {
    reels: 6,
    minimumRows: 4,
    maximumRows: 8,
    initialRows: [4, 4, 4, 4, 4, 4],
    scatterSymbol: 'GATE_OF_SLEEP',
  });
  assert.equal(replay.passed, true, replay.violations.join('\n'));
  assert.equal(replay.awardedFreeSpins, 2);
  assert.deepEqual(replay.reelRows, spike.proof.finalRows);
  assert.equal(replay.eventDigest, spike.proof.eventDigest);
});

test('Dreamfall spike rejects a refill pool with no legal non-scatter symbol', () => {
  assert.throws(() => runDreamfallMathSpike({
    tumbleHits: 1,
    scatterSymbol: 'GATE_OF_SLEEP',
    refillPool: ['GATE_OF_SLEEP'],
  }), /non-scatter symbol/);
});
