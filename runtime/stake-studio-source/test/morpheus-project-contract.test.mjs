import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMorpheusGovernedModes,
  applyMorpheusSelectableModes,
  auditMorpheusProjectContract,
  createMorpheusGovernedModesManifest,
} from '../src/engines/morpheus/MorpheusProjectContract.js';
import { createPlayerInformationManifest } from '../src/engines/quality/PlayerInformationQA.js';
import { BuildEngine } from '../src/engines/build/BuildEngine.js';
import { createGameProject } from '../src/engines/schema.js';

const selectable = [
  ['base', 1],
  ['dream_enhancer', 3],
  ['trickster_dream', 75],
  ['veil_ascent', 100],
  ['lucid_blessing', 200],
].map(([name, cost]) => ({
  name,
  cost,
  ...(name === 'dream_enhancer' ? {
    profile: { entry: 'base', triggerFreeSpins: true, targetFeatureEntryHitRate: 12 },
  } : {}),
  ...(name === 'trickster_dream' ? {
    profile: { entry: 'base', triggerFreeSpins: false, positionMultiplierGrid: true },
  } : {}),
}));

const lucidWildValues = [2, 3, 5, 7, 10, 25, 50, 100, 200, 500, 1000];
const lucidWildWeights = Object.fromEntries(lucidWildValues.map(value => [value, 1]));
const positionMultiplierGrid = {
  aggregation: 'additive-excess-v1',
  maximumCellMultiplier: 1024,
  contributorPolicy: 'unique-winning-positions',
  updateTiming: 'after-positive-quantized-settlement',
};
const governedTail = {
  wincap: 100_000,
  wincapRtp: 0.01,
  maxWinHitRate: 0,
  maxWinCalibrationPolicy: 'separate-criterion-v1',
};
const approvedContract = {
  maximumWinProbabilityPolicy: 'cost-aware-rtp-allocation-v1',
  ordinaryMaximumPayoutMultiplier: 99_999.9,
};
const withOptimizedLucidWild = project => ({
  ...project,
  production: {
    ...project.production,
    approvedContract: { ...approvedContract, ...(project.production?.approvedContract || {}) },
  },
  math: {
    ...governedTail,
    ...project.math,
    mechanicConfig: {
      ...project.math?.mechanicConfig,
      positionMultiplierGrid: { ...positionMultiplierGrid },
      multiplierSymbols: {
        approvedValueLadder: [...lucidWildValues],
        valueWeightStatus: 'production-optimized',
        values: {
          basegame: { ...lucidWildWeights },
          freegame: { ...lucidWildWeights },
        },
      },
    },
  },
});

test('governed manifest exposes all eight modes without inventing gated or natural prices', () => {
  const manifest = createMorpheusGovernedModesManifest();
  assert.equal(manifest.modes.length, 8);
  assert.deepEqual(manifest.modes.filter(mode => mode.selectable).map(mode => mode.id), selectable.map(mode => mode.name));
  assert.equal(manifest.modes.find(mode => mode.id === 'nightmare_descent').costMultiplier, null);
  assert.equal(manifest.modes.find(mode => mode.id === 'dreamfall').releaseGated, true);
  assert.equal(manifest.modes.find(mode => mode.id === 'oneiric_nexus').entryPolicy, 'natural');
});

test('selectable mode menu is the five approved wagers, not gated Dreamfall/Nexus/Nightmare', () => {
  const project = createGameProject({ id: 'morpheus', name: 'Morpheus' });
  project.math.betModes = [{ name: 'base', cost: 1, rtp: 0.96, maxWin: 100000, profile: { entry: 'base' } }];
  const first = applyMorpheusSelectableModes(project);
  assert.deepEqual(first.modes, ['base', 'dream_enhancer', 'trickster_dream', 'veil_ascent', 'lucid_blessing']);
  assert.equal(project.math.betModes.find((mode) => mode.name === 'trickster_dream').profile.triggerFreeSpins, false);
  assert.equal(project.math.betModes.find((mode) => mode.name === 'veil_ascent').cost, 100);
  assert.equal(project.math.betModes.find((mode) => mode.name === 'lucid_blessing').isBuyBonus, true);
  assert.equal(project.math.betModes.find((mode) => mode.name === 'dream_enhancer').profile.scatterWeightMultiplier, 3);
  assert.equal(project.math.featureArchitecture.tiers[3].meterThreshold, 4);
  assert.equal(project.math.betModes.some((mode) => mode.name === 'dreamfall'), false);
  const second = applyMorpheusSelectableModes(project);
  assert.equal(second.filled, 0);
});

test('project parity separates selectable wager modes from governed feature modes', () => {
  const project = applyMorpheusGovernedModes(withOptimizedLucidWild({ math: { betModes: selectable } }));
  assert.equal(auditMorpheusProjectContract(project).passed, true);
  const wrong = applyMorpheusGovernedModes(withOptimizedLucidWild({ math: { betModes: [...selectable, { name: 'nightmare_descent', cost: 1500 }] } }));
  assert.equal(auditMorpheusProjectContract(wrong).passed, false);
});

test('project parity fails closed when position-grid arithmetic drifts', () => {
  const project = applyMorpheusGovernedModes(withOptimizedLucidWild({ math: { betModes: selectable } }));
  project.math.mechanicConfig.positionMultiplierGrid.aggregation = 'multiplicative';
  const audit = auditMorpheusProjectContract(project);
  assert.equal(audit.passed, false);
  assert.match(audit.issues.join('\n'), /additive-excess-v1/);
});

test('project parity fails closed when MAX allocation, policy, or the ordinary boundary drifts', () => {
  const project = applyMorpheusGovernedModes(withOptimizedLucidWild({ math: { betModes: selectable } }));
  project.math.wincapRtp = 0.005;
  project.production.approvedContract.maximumWinProbabilityPolicy = 'fixed-hit-rate';
  project.production.approvedContract.ordinaryMaximumPayoutMultiplier = 100_000;
  const audit = auditMorpheusProjectContract(project);
  assert.equal(audit.passed, false);
  assert.match(audit.issues.join('\n'), /1\.00% RTP/);
  assert.match(audit.issues.join('\n'), /cost-aware-rtp-allocation-v1/);
  assert.match(audit.issues.join('\n'), /99,999\.9x/);
});

test('project parity fails closed when approved Lucid values have no production weights', () => {
  const project = applyMorpheusGovernedModes({
    math: {
      betModes: selectable,
      mechanicConfig: {
        multiplierSymbols: {
          approvedValueLadder: lucidWildValues,
          valueWeightStatus: 'pending-production-optimization',
          values: { basegame: { 2: 10, 3: 5 }, freegame: { 2: 10, 3: 5 } },
        },
      },
    },
  });
  const audit = auditMorpheusProjectContract(project);
  assert.equal(audit.passed, false);
  assert.deepEqual(audit.lucidWildMissingWeights.basegame, [5, 7, 10, 25, 50, 100, 200, 500, 1000]);
  assert.match(audit.issues.join('\n'), /not marked production-optimized/);
});

test('normal Build validation exposes Morpheus contract drift', () => {
  const project = createGameProject({ name: 'Morpheus Contract Fixture' });
  project.build.stakeEngine.gameId = 'morpheus_dreamfall';
  project.math.betModes = selectable.map(mode => ({ ...mode, rtp: 0.96, profile: {} }));
  Object.assign(project, applyMorpheusGovernedModes(project));
  const errors = new BuildEngine(project).validate().errors;
  assert.equal(errors.some(issue => /Morpheus approved contract: LUCID_WILD approved value ladder/i.test(issue)), true);
  assert.equal(errors.some(issue => /Morpheus approved contract: LUCID_WILD basegame weights/i.test(issue)), true);
});

test('Game Info exposes governed access policy without fictional prices', () => {
  const project = applyMorpheusGovernedModes({
    name: 'Morpheus',
    theme: { symbols: [] },
    build: { stakeEngine: {} },
    math: { gameType: 'ways', grid: { reels: 6, rows: [4, 4, 4, 4, 4, 4] }, rtp: 0.96, wincap: 100000, volatility: 'very-high', betModes: selectable },
  });
  const info = createPlayerInformationManifest(project);
  assert.equal(info.modes.length, 5);
  assert.equal(info.governedModes.length, 8);
  assert.equal(info.governedModes.find(mode => mode.name === 'dreamfall').cost, null);
  assert.equal(info.governedModes.find(mode => mode.name === 'oneiric_nexus').entryPolicy, 'natural');
});
