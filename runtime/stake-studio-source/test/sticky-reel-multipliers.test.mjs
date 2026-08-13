import test from 'node:test';
import assert from 'node:assert/strict';

import { applyGameBlueprint } from '../src/engines/blueprints/GameBlueprintEngine.js';
import { MathEngine } from '../src/engines/math/MathEngine.js';
import { createGameProject } from '../src/engines/schema.js';

function project() {
  const value = createGameProject({ name: 'Sticky Reel Fixture' });
  applyGameBlueprint(value, 'sticky_reel_forge');
  return value;
}

function seededRandom(seedText) {
  let seed = 0;
  for (const character of seedText) seed = Math.imul(seed ^ character.charCodeAt(0), 0x45d9f3b) >>> 0;
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

test('tier three guarantee claims a whole reel no later than spin three', () => {
  const engine = new MathEngine(project());
  const board = Array.from({ length: 5 }, () => Array(5).fill('H1'));
  const state = { tier: 3, stickyReels: {}, guaranteedSpin: 1, guaranteedReel: 2 };
  const outcome = engine.prepareStickyReels(board, () => 0.999999, 'freegame', {
    stickyReelState: state,
    featureTier: 3,
    featureSpin: 1,
  });

  assert.ok(outcome.state.stickyReels[2] >= 2);
  assert.deepEqual(outcome.board[2], Array(5).fill('W'));
  assert.ok(outcome.events.some(event => event.type === 'expandStickyReel' && event.reel === 2 && event.persistence === 'sticky'));
});

test('tier one can create temporary reel power but never sticky state', () => {
  const engine = new MathEngine(project());
  const board = Array.from({ length: 5 }, () => Array(5).fill('L1'));
  const state = { tier: 1, stickyReels: {}, guaranteedSpin: null, guaranteedReel: null };
  const outcome = engine.prepareStickyReels(board, () => 0, 'freegame', {
    stickyReelState: state,
    featureTier: 1,
    featureSpin: 1,
  });

  assert.deepEqual(outcome.state.stickyReels, {});
  assert.equal(Object.keys(outcome.temporaryReels).length, 5);
  assert.deepEqual(outcome.events.at(-1), { type: 'clearTemporaryReels', reels: [0, 1, 2, 3, 4] });
});

test('only claimed reels contributing to a ways win add their multipliers', () => {
  const engine = new MathEngine(project());
  assert.deepEqual(
    engine.stickyReelWinMultiplier({ count: 3 }, { 0: 2, 2: 5, 4: 50 }),
    {
      multiplier: 7,
      contributingStickyReels: [{ reel: 0, multiplier: 2 }, { reel: 2, multiplier: 5 }],
    },
  );
});

test('complete sticky-reel rounds replay deterministically and do not leak state', () => {
  const value = project();
  const first = new MathEngine(value).resolveRound(seededRandom('wizard-craft-replay'), 'bonus');
  const second = new MathEngine(value).resolveRound(seededRandom('wizard-craft-replay'), 'bonus');

  assert.deepEqual(first, second);
  assert.ok([1, 2, 3].includes(first.featureTier));
  assert.equal(first.freeSpinsPlayed >= 8, true);
  assert.deepEqual(new MathEngine(value).createStickyReelState(() => 0.5, 1).stickyReels, {});
});
