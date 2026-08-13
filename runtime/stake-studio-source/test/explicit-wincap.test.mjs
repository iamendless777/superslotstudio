import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { MathEngine } from '../src/engines/math/MathEngine.js';

test('an allocated maximum win is visibly caused by MAX_MORPHEUS and terminates the round', () => {
  const project = createGameProject({ name: 'Explicit Wincap Proof' });
  project.math.wincap = 50_000;
  project.math.wincapRtp = 0.001;
  project.theme.symbols.push({
    id: 'MAX_MORPHEUS', name: 'MAX_MORPHEUS', tier: 'special', payouts: {}, special: ['wild', 'maxWild'],
  });
  project.math.specialSymbols = { ...(project.math.specialSymbols || {}), wild: ['MAX_MORPHEUS'] };
  project.math.betModes = [{
    name: 'base', cost: 1, rtp: 0.965, maxWin: 50_000,
    autoCloseDisabled: false, isFeature: false, isBuyBonus: false, distributions: [],
  }];

  const round = new MathEngine(project).resolveRound(() => 0, 'base');

  assert.equal(round.wincapHit, true);
  assert.equal(round.maxMorpheusHit, true);
  assert.equal(round.totalWin, 50_000);
  assert.equal(round.normalizedWin, 50_000);
  assert.equal(round.spins[0].gameMode, 'wincap');
  assert.equal(round.board.flat().includes('MAX_MORPHEUS'), true);
  const events = round.spins[0].state;
  assert.deepEqual(events.slice(-2).map(event => event.type), ['maxWinReached', 'roundTerminated']);
  assert.equal(events.at(-2).terminalCause, 'MAX_MORPHEUS');
  assert.equal(events.some(event => event.type === 'tumbleBoard'), false);
  assert.equal(round.spins[0].steps[0].stepWin, 50_000);
});

test('ordinary payout overflow clamps without claiming the MAX_MORPHEUS terminal cause', () => {
  const project = createGameProject({ name: 'Ordinary Cap Proof' });
  project.math.wincap = 10;
  project.math.wincapRtp = 0;
  project.math.bonusMechanics = [];
  project.math.grid = { reels: 3, rows: [1, 1, 1] };
  project.theme.symbols = [{ id: 'A', name: 'A', tier: 'high', payouts: { 3: 20 }, special: [] }];
  project.math.reelStrips = { BR: [['A'], ['A'], ['A']], FR: [['A'], ['A'], ['A']] };
  project.math.betModes = [{ name: 'base', cost: 1, rtp: 0.96, maxWin: 10, profile: { entry: 'base' } }];
  const round = new MathEngine(project).resolveRound(() => 0, 'base');
  assert.equal(round.totalWin, 9.9);
  assert.equal(round.wincapHit, true);
  assert.equal(round.maxMorpheusHit, false);
  assert.equal(round.spins[0].state.some(event => event.type === 'maxWinReached'), false);
  assert.deepEqual(round.spins[0].state.slice(-2).map(event => event.type), ['setWin', 'finalWin']);
  assert.equal(round.spins[0].state.at(-1).amount, 990);
});

test('ordinary cap reconciliation keeps every visible winning line non-negative', () => {
  const project = createGameProject({ name: 'Multi-win Ordinary Cap Proof' });
  project.math.wincap = 10;
  project.math.wincapRtp = 0;
  project.math.bonusMechanics = [];
  project.math.grid = { reels: 3, rows: [2, 2, 2] };
  project.theme.symbols = [
    { id: 'A', name: 'A', tier: 'high', payouts: { 3: 20 }, special: [] },
    { id: 'B', name: 'B', tier: 'high', payouts: { 3: 20 }, special: [] },
  ];
  project.math.reelStrips = {
    BR: [['A', 'B'], ['A', 'B'], ['A', 'B']],
    FR: [['A', 'B'], ['A', 'B'], ['A', 'B']],
  };
  project.math.betModes = [{ name: 'base', cost: 1, rtp: 0.96, maxWin: 10, profile: { entry: 'base' } }];

  const round = new MathEngine(project).resolveRound(() => 0, 'base');
  const wins = round.spins[0].steps[0].wins;

  assert.equal(wins.length, 2);
  assert.equal(wins.every(win => win.payout >= 0 && win.meta.ordinaryCapApplied === true), true);
  assert.equal(Number(wins.reduce((sum, win) => sum + win.payout, 0).toFixed(10)), 9.9);
});

test('the governed 100,000x terminal path fails closed without a visible max symbol', () => {
  const project = createGameProject({ name: 'Missing Max Cause' });
  project.math.wincap = 100_000;
  project.math.wincapRtp = 0.01;
  project.math.betModes = [{ name: 'base', cost: 1, rtp: 0.96, maxWin: 100_000 }];
  assert.throws(() => new MathEngine(project).resolveRound(() => 0, 'base'), /requires a visible maxWild symbol/);
});
