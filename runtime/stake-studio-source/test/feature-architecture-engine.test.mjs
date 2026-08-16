import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { FeatureArchitectureRuntime, resolveFeatureTier } from '../src/engines/math/FeatureArchitectureEngine.js';
import { MathEngine } from '../src/engines/math/MathEngine.js';

function featureProject() {
  const project = createGameProject({ name: 'Feature Architecture Proof' });
  project.math.gameType = 'ways';
  project.math.grid = { reels: 6, rows: [3, 3, 3, 3, 3, 3] };
  project.math.wincap = 50_000;
  project.theme.symbols = [
    { id: 'A', name: 'A', tier: 'low', payouts: { 3: 0.1, 4: 0.2, 5: 0.5, 6: 1 }, special: [] },
    { id: 'B', name: 'B', tier: 'high', payouts: { 3: 1, 4: 2, 5: 5, 6: 10 }, special: [] },
    { id: 'C', name: 'C', tier: 'medium', payouts: { 3: 0.5, 4: 1, 5: 2, 6: 4 }, special: [] },
    { id: 'W', name: 'W', tier: 'special', payouts: {}, special: ['wild', 'spawnOnly'] },
    { id: 'EW', name: 'EW', tier: 'special', payouts: {}, special: ['wild', 'expandingWild'] },
    { id: 'MW', name: 'MW', tier: 'special', payouts: {}, special: ['wild', 'multiplier'] },
    { id: 'BOMB', name: 'BOMB', tier: 'special', payouts: {}, special: ['wildBomb'] },
    { id: 'GOLD', name: 'GOLD', tier: 'special', payouts: {}, special: ['goldWildBomb'] },
    { id: 'SPLIT', name: 'SPLIT', tier: 'special', payouts: {}, special: ['split'] },
    { id: 'PURGE', name: 'PURGE', tier: 'special', payouts: {}, special: ['royalRemover'] },
    { id: 'STAR', name: 'STAR', tier: 'special', payouts: {}, special: ['wildStar'] },
    { id: 'MAX', name: 'MAX', tier: 'special', payouts: {}, special: ['wild', 'maxWild'] },
    { id: 'MYSTERY', name: 'MYSTERY', tier: 'special', payouts: {}, special: ['mystery'] },
    { id: 'S', name: 'S', tier: 'special', payouts: {}, special: ['scatter'] },
  ];
  project.math.specialSymbols = { wild: ['W', 'EW', 'MW', 'MAX'], multiplier: ['MW'], scatter: ['S'] };
  project.math.featureArchitecture = {
    selection: 'exactScatterCount',
    tiers: {
      3: { id: 'upgrade', spins: 10, mechanic: 'progressiveSymbolUpgrade', meterThreshold: 4 },
      4: { id: 'symbolMult', spins: 10, mechanic: 'persistentSymbolMultipliers' },
      5: { id: 'expand', spins: 10, mechanic: 'winningCascadeReelExpansion', maximumRows: 8 },
      6: { id: 'grid', spins: 10, mechanic: 'persistentPositionMultiplierGrid' },
    },
  };
  return project;
}

test('exact scatter counts resolve the four distinct feature tiers', () => {
  const project = featureProject();
  assert.equal(resolveFeatureTier(project, 2), null);
  assert.equal(resolveFeatureTier(project, 3).id, 'upgrade');
  assert.equal(resolveFeatureTier(project, 4).id, 'symbolMult');
  assert.equal(resolveFeatureTier(project, 5).id, 'expand');
  assert.equal(resolveFeatureTier(project, 6).id, 'grid');
  assert.equal(resolveFeatureTier(project, 'symbolMult').scatterCount, 4);
});

test('mystery, rifts, purge, and wild-star land first and react only after a positive settlement', () => {
  const project = featureProject();
  const positiveWin = [{ symbol: 'B', positions: [[0, 2], [1, 2], [2, 2]] }];

  let runtime = new FeatureArchitectureRuntime(project);
  let prepared = runtime.prepareBoard([
    ['BOMB', 'A', 'B'], ['A', 'A', 'C'], ['B', 'C', 'B'], ['C', 'B', 'C'], ['A', 'B', 'C'], ['B', 'C', 'A'],
  ], () => 0);
  assert.deepEqual(prepared.board[0].slice(0, 2), ['BOMB', 'A']);
  assert.deepEqual(prepared.events, []);
  let settled = runtime.afterWinStep(prepared.board, positiveWin, () => 0);
  assert.deepEqual(settled.reactionBoard[0].slice(0, 2), ['W', 'W']);
  assert.deepEqual(settled.reactionBoard[1].slice(0, 2), ['W', 'W']);
  assert.equal(settled.events[0].type, 'wildBomb');
  assert.deepEqual(settled.events[0].board, settled.reactionBoard);

  runtime = new FeatureArchitectureRuntime(project);
  prepared = runtime.prepareBoard([
    ['MYSTERY', 'A', 'B'], ['MYSTERY', 'C', 'B'], ['B', 'C', 'B'], ['C', 'B', 'C'], ['A', 'B', 'C'], ['B', 'C', 'A'],
  ], () => 0);
  assert.equal(prepared.board[0][0], 'MYSTERY');
  assert.deepEqual(prepared.events, []);
  settled = runtime.afterWinStep(prepared.board, positiveWin, () => 0);
  assert.equal(settled.reactionBoard[0][0], settled.reactionBoard[1][0]);
  assert.equal(settled.events[0].type, 'mysteryTransform');
  assert.equal(settled.events[0].originalIdentity, 'MYSTERY_VEIL');
  assert.deepEqual(settled.events[0].accountingIdentities.map(value => value.originalIdentity), ['MYSTERY_VEIL', 'MYSTERY_VEIL']);
  assert.deepEqual(settled.events[0].board, settled.reactionBoard);

  runtime = new FeatureArchitectureRuntime(project);
  prepared = runtime.prepareBoard([
    ['PURGE', 'A', 'B'], ['A', 'C', 'B'], ['B', 'C', 'B'], ['C', 'B', 'C'], ['A', 'B', 'C'], ['B', 'C', 'A'],
  ], () => 0);
  assert.equal(prepared.board.flat().includes('A'), true);
  assert.equal(prepared.board.flat().includes('PURGE'), true);
  assert.equal(prepared.events.some(event => event.type === 'symbolPurge'), false);
  const purge = runtime.afterWinStep(prepared.board, positiveWin, () => 0);
  assert.equal(purge.events[0].type, 'symbolPurge');
  assert.equal(purge.events[0].boardAfter.flat().includes(null), true);
  assert.equal(purge.restrictedRefillSymbols.has('A'), true);

  runtime = new FeatureArchitectureRuntime(project);
  prepared = runtime.prepareBoard([
    ['STAR', 'A', 'B'], ['A', 'C', 'B'], ['B', 'C', 'B'], ['C', 'B', 'C'], ['A', 'B', 'C'], ['B', 'C', 'A'],
  ], () => 0);
  assert.equal(prepared.board.flat().includes('STAR'), true);
  assert.deepEqual(prepared.events, []);
  settled = runtime.afterWinStep(prepared.board, positiveWin, () => 0);
  assert.equal(settled.reactionBoard.flat().includes('A'), false);
  assert.ok(settled.reactionBoard.flat().filter(symbol => symbol === 'W').length >= 4);
  assert.deepEqual(settled.events.map(event => event.type), ['specialTargetSelected', 'specialPositionsResolved']);
  assert.equal(settled.events[0].targetFamily, 'A');
  assert.deepEqual(settled.events[1].boardAfter, settled.reactionBoard);
});

test('split and multiplier wilds multiply only contributing wins', () => {
  const project = featureProject();
  const runtime = new FeatureArchitectureRuntime(project);
  const board = [
    ['A', 'MW', 'B'], ['A', 'C', 'B'], ['A', 'C', 'B'], ['SPLIT', 'B', 'C'], ['B', 'C', 'A'], ['C', 'B', 'A'],
  ];
  const win = { symbol: 'A', count: 3, ways: 2, payout: 1, positions: [[0, 1], [1, 0], [2, 0], [3, 0]] };
  const result = runtime.multiplierForWin(board, win, { rollSymbolMultiplier: () => 5 });
  assert.equal(result.meta.multiplierWild, 5);
  assert.equal(result.meta.splitMultiplier, 2);
  assert.equal(result.meta.waysAfter, 4);
  assert.equal(result.multiplier, 10);
  const noWild = runtime.multiplierForWin(board, { ...win, positions: [[0, 0], [1, 0], [2, 0]] }, { rollSymbolMultiplier: () => 5 });
  assert.equal(noWild.meta.multiplierWild, 1);
  assert.equal(noWild.meta.splitMultiplier, 1);
  assert.equal(noWild.meta.waysAfter, 2);

  const events = runtime.afterWinStep(board, [win], () => 0).events;
  assert.deepEqual(events.find(event => event.type === 'echoSplit'), {
    type: 'echoSplit',
    symbolFamily: 'A',
    sources: [[3, 0]],
    positions: win.positions,
    multiplier: 2,
    waysBefore: 2,
    waysAfter: 4,
  });
});

test('feature state persists upgrades, symbol multipliers, reel heights, and position multipliers', () => {
  const project = featureProject();
  const board = Array.from({ length: 6 }, () => ['A', 'B', 'C']);
  const win = { symbol: 'A', count: 3, positions: [[0, 0], [1, 0], [2, 0]] };

  const upgrade = new FeatureArchitectureRuntime(project, { tier: 'upgrade' });
  upgrade.afterWinStep(board, [win, { ...win, positions: [[3, 0], [0, 0]] }], () => 0);
  assert.ok(upgrade.state.symbolUpgrades.A);

  const symbolMult = new FeatureArchitectureRuntime(project, { tier: 'symbolMult' });
  assert.equal(symbolMult.multiplierForWin(board, win).multiplier, 1);
  symbolMult.afterWinStep(board, [win], () => 0);
  assert.equal(symbolMult.multiplierForWin(board, win).meta.persistentSymbolMultiplier, 2);
  assert.equal(symbolMult.afterWinStep(board, [{ ...win, symbol: 'W' }], () => 0).events.length, 0);

  const expanding = new FeatureArchitectureRuntime(project, { tier: 'expand' });
  const expanded = expanding.afterWinStep(board, [win, win], () => 0);
  assert.equal(expanded.expansions.length, 2);
  const expandedBoard = expanding.applyExpansions(board, expanded.expansions, () => 'C');
  assert.equal(expandedBoard[0].length, 5);
  assert.equal(expanding.state.reelRows[0], 5);

  const grid = new FeatureArchitectureRuntime(project, { tier: 'grid' });
  const gridStart = grid.prepareBoard(board, () => 0).events[0];
  assert.equal(gridStart.type, 'modeGridStart');
  assert.equal(gridStart.cells.length, 18);
  assert.equal(grid.multiplierForWin(board, win).meta.positionMultiplier, 1);
  const gridUpdates = grid.afterWinStep(board, [win], () => 0).events;
  assert.equal(gridUpdates.length, 3);
  assert.deepEqual(gridUpdates.map(event => event.position), [[0, 0], [1, 0], [2, 0]]);
  assert.equal(grid.multiplierForWin(board, win).meta.positionMultiplier, 4);

  grid.state.multiplierGrid[0][0] = 2;
  grid.state.multiplierGrid[1][0] = 4;
  grid.state.multiplierGrid[2][0] = 1;
  assert.equal(grid.multiplierForWin(board, {
    ...win,
    positions: [[0, 0], [0, 0], [1, 0], [2, 0]],
  }).meta.positionMultiplier, 5);

  grid.state.multiplierGrid[0][0] = 1024;
  grid.afterWinStep(board, [{ ...win, positions: [[0, 0]] }], () => 0);
  assert.equal(grid.state.multiplierGrid[0][0], 1024);

  const maximum = new FeatureArchitectureRuntime(project, { tier: 'grid' });
  assert.equal(maximum.afterWinStep([['MAX'], ['A'], ['A'], ['B'], ['B'], ['B']], [{ ...win, positions: [[0, 0], [1, 0], [2, 0]] }]).maxWildTriggered, true);
});

test('Trickster owns a round-scoped position grid without starting free spins', () => {
  const project = featureProject();
  project.math.bonusMechanics = ['cascades'];
  project.math.mechanicConfig = { cascades: { maxCascades: 1 } };
  project.math.betModes = [{
    name: 'trickster_dream', cost: 75, rtp: 0.96, maxWin: 50_000,
    profile: {
      entry: 'base', triggerFreeSpins: false, positionMultiplierGrid: true,
      specialSymbolBoost: 4, multiplier: 1,
    },
  }];

  class TricksterFixtureEngine extends MathEngine {
    generateProfileBoard() {
      return [['A'], ['A'], ['A'], ['B'], ['B'], ['B']];
    }
  }

  const round = new TricksterFixtureEngine(project).resolveRound(() => 0, 'trickster_dream');
  assert.equal(round.spins.length, 1);
  assert.equal(round.freeSpinsPlayed, 0);
  assert.equal(round.featureState.gridStarted, true);
  assert.deepEqual(round.spins[0].state.slice(0, 2).map(event => event.type), ['modeGridStart', 'reveal']);
  assert.deepEqual(round.spins[0].steps[0].featureEvents
    .filter(event => event.type === 'positionMultiplierGridUpdate')
    .map(event => event.position), [[0, 0], [1, 0], [2, 0]]);
});

test('Veil bar counts unique contributing cells once and may skip to any higher family', () => {
  const project = featureProject();
  const board = Array.from({ length: 6 }, () => ['A', 'B', 'C']);
  const runtime = new FeatureArchitectureRuntime(project, { tier: 'upgrade' });
  const result = runtime.afterWinStep(board, [
    { symbol: 'A', positions: [[0, 0], [1, 0], [2, 0]] },
    { symbol: 'A', positions: [[0, 0], [1, 0], [3, 0]] },
  ], () => 0.999999);

  const progress = result.events.find(event => event.type === 'symbolBarProgress');
  assert.equal(progress.gained, 4);
  assert.deepEqual(progress.hits, [[0, 0], [1, 0], [2, 0], [3, 0]]);
  const upgrade = result.events.find(event => event.type === 'symbolUpgrade');
  assert.equal(upgrade.fromFamily, 'A');
  assert.equal(upgrade.toFamily, 'B');
  assert.equal(runtime.applyUpgradeName('A'), 'B');
  assert.equal(runtime.state.upgradeMeter, 0);
});

test('Dreamfall emits fifth-plus awards and excludes scatters from every refill source', () => {
  const project = featureProject();
  project.math.bonusMechanics = ['cascades'];
  project.math.mechanicConfig = { cascades: { maxCascades: 5 } };
  project.math.reelStrips.FR = Array.from({ length: 6 }, () => ['S', 'A']);
  const runtime = new FeatureArchitectureRuntime(project, { tier: 'expand' });
  runtime.beginSpin();
  const board = Array.from({ length: 6 }, () => ['A', 'A', 'A']);
  const win = { symbol: 'A', positions: [[0, 0], [1, 0], [2, 0]] };
  const events = [];
  for (let hit = 1; hit <= 6; hit++) events.push(...runtime.afterWinStep(board, [win], () => 0).events);
  assert.deepEqual(events.filter(event => event.type === 'tumbleChainProgress').map(event => event.chainHit), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(events.filter(event => event.type === 'awardTumbleFreeSpins').map(event => event.chainHit), [5, 6]);

  const engine = new MathEngine(project);
  assert.deepEqual(engine.generateReelExcluding(0, 6, () => 0, 'FR', new Set(['S'])), Array(6).fill('A'));
  const tumble = engine.cascadeWithMetadata([['A', 'A', 'A']], [{ positions: [[0, 0], [0, 1]] }], () => 0, 'FR', new Set(['S']));
  assert.equal(tumble.newSymbols.flat().includes('S'), false);
});

test('a raw win quantized to zero cannot advance persistent feature state', () => {
  const project = featureProject();
  project.math.bonusMechanics = [];
  project.math.payoutIncrement = 0.1;
  project.theme.symbols.find(symbol => symbol.name === 'A').payouts[3] = 0.04;

  class SubQuantumWinEngine extends MathEngine {
    generateProfileBoard() {
      return [['A'], ['A'], ['A'], ['B'], ['C'], ['B']];
    }
  }

  const spin = new SubQuantumWinEngine(project).resolveSpin(() => 0, 'freegame', { featureTier: 'symbolMult' });
  assert.equal(spin.steps.length, 1);
  assert.equal(spin.steps[0].stepWin, 0);
  assert.equal(spin.steps[0].tumble, undefined);
  assert.equal(spin.state.some(event => event.type === 'tumbleBoard'), false);
  assert.deepEqual(spin.steps[0].featureEvents, []);
  assert.deepEqual(spin.featureState.symbolMultipliers, {});
});

test('expanding wild grows downward while exact-scatter round selection persists its tier', () => {
  const project = featureProject();
  project.math.bonusMechanics = [];
  project.math.freespinTriggers = { basegame: { 3: 10, 4: 10, 5: 10, 6: 10 }, freegame: { 3: 5 } };
  project.math.betModes = [{
    name: 'base', cost: 1, rtp: 0.965, maxWin: 50_000,
    profile: { entry: 'base', triggerFreeSpins: true, freeSpinReelSet: 'FR' },
  }];
  project.math.reelStrips = { BR: Array(6).fill(['S']), FR: Array(6).fill(['A']) };

  class FixedBoardEngine extends MathEngine {
    generateBoard(rand, reelSet) {
      if (reelSet === 'FR') return Array.from({ length: 6 }, () => ['A']);
      return [['S'], ['S'], ['S'], ['S'], ['B'], ['C']];
    }
  }

  const engine = new FixedBoardEngine(project);
  assert.deepEqual(engine.applyExpandingWilds([['A', 'EW', 'B']]), [['A', 'EW', 'EW']]);
  const expanding = engine.resolveExpandingWilds([['A', 'EW', 'B']]);
  assert.deepEqual(expanding.events, [{
    type: 'expandingWild',
    source: 'EW',
    sources: [[0, 1]],
    positions: [[0, 1], [0, 2]],
    stoppedBy: null,
    board: [['A', 'EW', 'EW']],
  }]);
  const round = engine.resolveRound(() => 0.5, 'base');
  assert.equal(round.featureTier, 'symbolMult');
  assert.equal(round.freeSpinsPlayed, 10);
  assert.equal(round.featureState.symbolMultipliers.A, 1000);
});

test('expanding VEIL stops before the first protected wild or special', () => {
  const engine = new MathEngine(featureProject());
  const result = engine.resolveExpandingWilds([
    ['A', 'EW', 'A', 'STAR', 'B'],
    ['EW', 'MW', 'A', 'B', 'C'],
  ]);

  assert.deepEqual(result.board[0], ['A', 'EW', 'EW', 'STAR', 'B']);
  assert.deepEqual(result.events[0].positions, [[0, 1], [0, 2]]);
  assert.deepEqual(result.events[0].stoppedBy, { position: [0, 3], symbol: 'STAR' });
  assert.deepEqual(result.board[1], ['EW', 'MW', 'A', 'B', 'C']);
  assert.deepEqual(result.events[1].positions, [[1, 0]]);
  assert.deepEqual(result.events[1].stoppedBy, { position: [1, 1], symbol: 'MW' });
});

test('mode profiles select boosted scatter and modifier boards without rewriting reel strips', () => {
  const project = featureProject();
  class CandidateEngine extends MathEngine {
    calls = 0;
    generateBoard() {
      this.calls += 1;
      if (this.calls === 1) return Array.from({ length: 6 }, () => ['A']);
      return Array.from({ length: 6 }, () => ['S']);
    }
  }

  const normal = new CandidateEngine(project);
  assert.equal(normal.countScatters(normal.generateProfileBoard(() => 0.99, 'BR', null, {})), 0);
  assert.equal(normal.calls, 1);

  const boosted = new CandidateEngine(project);
  const board = boosted.generateProfileBoard(() => 0.99, 'BR', null, { scatterWeightMultiplier: 2 });
  assert.equal(boosted.calls, 2);
  assert.equal(boosted.countScatters(board), 6);
  assert.deepEqual(boosted.profileBoardSelectionEvent(board, { scatterWeightMultiplier: 2 }), {
    type: 'modeBoardSelection', kind: 'scatter', candidateCount: 2, multiplier: 2,
    fromMoon: true, sources: [], positions: Array.from({ length: 6 }, (_, reel) => [reel, 0]),
  });
});

test('boosted-special candidate selection excludes the governed MAX terminal symbol', () => {
  const project = featureProject();
  project.theme.symbols.push({ name: 'MAX', tier: 'special', payouts: { 1: 1 }, special: ['wild', 'maxWild'] });
  const runtime = new MathEngine(project);
  const specials = new Set(project.theme.symbols
    .filter(symbol => (symbol.special || []).length > 0
      && !(symbol.special || []).includes('scatter')
      && !(symbol.special || []).includes('spawnOnly')
      && !(symbol.special || []).includes('maxWild'))
    .map(symbol => symbol.name));
  assert.equal(specials.has('MAX'), false);
  assert.doesNotMatch(runtime.profileBoardSelectionEvent([['MAX'], ['A'], ['A'], ['A'], ['A'], ['A']], {
    specialSymbolBoost: 4,
  }).positions.map(position => position.join(':')).join(','), /^0:0$/);
});
