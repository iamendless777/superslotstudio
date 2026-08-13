import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { createGameProject } from '../src/engines/schema.js';
import { MathSDKExporter } from '../src/engines/build/MathSDKExporter.js';
import {
  attachMathTailAnalysis,
  estimateMathPublisherWorkspace,
  getMathPublisherProfile,
  getProjectMathPublisherExecution,
  getMathPublisherRounds,
  updateMathPublishProject,
  validateMorpheusPublishedMath,
  validatePublishedModeContracts,
} from '../server/math-publisher.mjs';
import { resolveMathSdkRoot } from '../server/studio-paths.mjs';

const studioRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sdkRoot = resolveMathSdkRoot();
const python = join(sdkRoot, 'env', 'bin', 'python');
const verifier = join(studioRoot, 'server', 'verify_math_publish.py');
const aligner = join(studioRoot, 'server', 'align_math_publish.py');

function makePublishFixture(root, mismatch = false, booksOverride = null) {
  const publish = join(root, 'publish_files');
  mkdirSync(publish, { recursive: true });
  const books = booksOverride || [
    { id: 1, payoutMultiplier: 0, events: [], criteria: '0', baseGameWins: 0, freeGameWins: 0 },
    { id: 2, payoutMultiplier: 100, events: [{ index: 0, type: 'finalWin', amount: 100 }], criteria: 'basegame', baseGameWins: 1, freeGameWins: 0 },
  ];
  const source = join(root, 'books.jsonl');
  writeFileSync(source, `${books.map(book => JSON.stringify(book)).join('\n')}\n`);
  const events = join(publish, 'books_base.jsonl.zst');
  const compressed = spawnSync(python, ['-c', `
import sys
import zstandard
source, target = sys.argv[1:3]
with open(source, "rb") as incoming, open(target, "wb") as outgoing:
    outgoing.write(zstandard.ZstdCompressor().compress(incoming.read()))
`, source, events], { encoding: 'utf8' });
  assert.equal(compressed.status, 0, compressed.stderr);
  writeFileSync(join(publish, 'lookUpTable_base_0.csv'), `1,3,0\n2,1,${mismatch ? 90 : 100}\n`);
  writeFileSync(join(publish, 'index.json'), JSON.stringify({
    modes: [{ name: 'base', cost: 1, events: 'books_base.jsonl.zst', weights: 'lookUpTable_base_0.csv' }],
  }));
  return publish;
}

test('full-stream verifier proves compressed books and LUTs agree', () => {
  const root = mkdtempSync(join(tmpdir(), 'stakestudio-publish-valid-'));
  try {
    const publish = makePublishFixture(root);
    const result = spawnSync(python, [verifier, publish, JSON.stringify({ base: 0.25 })], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.valid, true);
    assert.equal(report.fullStreamIntegrity, true);
    assert.equal(report.totalBooks, 2);
    assert.equal(report.modes[0].exactRtp, 0.25);
    assert.equal(report.modes[0].criteria.basegame, 1);
    assert.equal(report.modes[0].criteriaWeights.basegame, 1);
    assert.equal(report.modes[0].criteriaProbability.basegame, 0.25);
    assert.equal(report.modes[0].criteriaRtp.basegame, 0.25);
    assert.equal(report.modes[0].ordinaryMaxPayout, 1);
    assert.equal(report.modes[0].finalLutTail.nonZeroProbability, 0.25);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('full-stream verifier rejects a single LUT payout mismatch', () => {
  const root = mkdtempSync(join(tmpdir(), 'stakestudio-publish-invalid-'));
  try {
    const publish = makePublishFixture(root, true);
    const result = spawnSync(python, [verifier, publish, JSON.stringify({ base: 0.25 })], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.valid, false);
    assert.match(report.error, /payout mismatch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('full-stream verifier rejects padded win coordinates on an unpadded board', () => {
  const root = mkdtempSync(join(tmpdir(), 'stakestudio-publish-position-invalid-'));
  try {
    const books = [
      { id: 1, payoutMultiplier: 0, events: [], criteria: '0', baseGameWins: 0, freeGameWins: 0 },
      {
        id: 2, payoutMultiplier: 100, criteria: 'basegame', baseGameWins: 1, freeGameWins: 0,
        events: [
          { index: 0, type: 'reveal', board: [[{ name: 'A' }, { name: 'A' }, { name: 'A' }, { name: 'A' }]] },
          { index: 1, type: 'winInfo', totalWin: 100, wins: [{ symbol: 'A', win: 100, positions: [{ reel: 0, row: 4 }] }] },
          { index: 2, type: 'finalWin', amount: 100 },
        ],
      },
    ];
    const publish = makePublishFixture(root, false, books);
    const result = spawnSync(python, [verifier, publish, JSON.stringify({ base: 0.25 })], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(JSON.parse(result.stdout.trim()).error, /outside the active board/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('full-stream verifier follows announced reel-height expansion', () => {
  const root = mkdtempSync(join(tmpdir(), 'stakestudio-publish-expanding-board-'));
  try {
    const books = [
      { id: 1, payoutMultiplier: 0, events: [], criteria: '0', baseGameWins: 0, freeGameWins: 0 },
      {
        id: 2, payoutMultiplier: 100, criteria: 'freegame', baseGameWins: 0, freeGameWins: 1,
        events: [
          { index: 0, type: 'reveal', board: [[{ name: 'A' }, { name: 'A' }]] },
          { index: 1, type: 'winInfo', totalWin: 100, wins: [{ symbol: 'A', win: 100, positions: [{ reel: 0, row: 0 }] }] },
          { index: 2, type: 'expandReelHeight', reel: 0, rows: 3, maximumRows: 4 },
          { index: 3, type: 'tumbleBoard', newSymbols: [[{ name: 'W' }]], explodingSymbols: [{ reel: 0, row: 0 }] },
          { index: 4, type: 'expandingWild', positions: [{ reel: 0, row: 2 }] },
          { index: 5, type: 'boardTransform', board: [[{ name: 'A' }, { name: 'A' }, { name: 'W' }]] },
          { index: 6, type: 'finalWin', amount: 100 },
        ],
      },
    ];
    const publish = makePublishFixture(root, false, books);
    const result = spawnSync(python, [verifier, publish, JSON.stringify({ base: 0.25 })], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout.trim()).fullStreamIntegrity, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('full-stream verifier rejects feature progression without a settled visible win', () => {
  const root = mkdtempSync(join(tmpdir(), 'stakestudio-publish-causality-invalid-'));
  try {
    const books = [
      { id: 1, payoutMultiplier: 0, events: [], criteria: '0', baseGameWins: 0, freeGameWins: 0 },
      {
        id: 2, payoutMultiplier: 100, criteria: 'basegame', baseGameWins: 1, freeGameWins: 0,
        events: [
          { index: 0, type: 'reveal', board: [[{ name: 'A' }]] },
          { index: 1, type: 'symbolMultiplierUpgrade', symbol: 'A', multiplier: 2 },
          { index: 2, type: 'winInfo', totalWin: 100, wins: [{ symbol: 'A', win: 100, positions: [{ reel: 0, row: 0 }] }] },
          { index: 3, type: 'finalWin', amount: 100 },
        ],
      },
    ];
    const publish = makePublishFixture(root, false, books);
    const result = spawnSync(python, [verifier, publish, JSON.stringify({ base: 0.25 })], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(JSON.parse(result.stdout.trim()).error, /before a settled visible win/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('exact RTP aligner repairs integer weights without changing books or LUT payouts', () => {
  const root = mkdtempSync(join(tmpdir(), 'stakestudio-publish-align-'));
  try {
    const publish = makePublishFixture(root);
    const aligned = spawnSync(python, [aligner, publish, JSON.stringify({ base: 0.96 })], { encoding: 'utf8' });
    assert.equal(aligned.status, 0, aligned.stderr || aligned.stdout);
    const alignment = JSON.parse(aligned.stdout.trim());
    assert.equal(alignment.valid, true);
    assert.equal(alignment.modes[0].exact, true);
    assert.equal(alignment.modes[0].changed, true);
    assert.deepEqual(alignment.modes[0].protectedWincapSimulationIds, []);

    const rows = readFileSync(join(publish, 'lookUpTable_base_0.csv'), 'utf8').trim().split('\n')
      .map(line => line.split(',').map(Number));
    const totalWeight = rows.reduce((sum, [, weight]) => sum + weight, 0);
    const weightedPayout = rows.reduce((sum, [, weight, payout]) => sum + weight * payout, 0);
    assert.equal(weightedPayout, totalWeight * 96);

    const verified = spawnSync(python, [verifier, publish, JSON.stringify({ base: 0.96 })], { encoding: 'utf8' });
    assert.equal(verified.status, 0, verified.stderr || verified.stdout);
    const report = JSON.parse(verified.stdout.trim());
    assert.equal(report.valid, true);
    assert.equal(report.fullStreamIntegrity, true);
    assert.equal(report.modes[0].delta, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('exact RTP aligner can jointly reserve an exact criterion contribution', () => {
  const root = mkdtempSync(join(tmpdir(), 'stakestudio-joint-align-'));
  const publish = join(root, 'publish_files');
  mkdirSync(publish, { recursive: true });
  writeFileSync(join(publish, 'index.json'), JSON.stringify({ modes: [{
    name: 'base', cost: 1, events: 'books_base.jsonl.zst', weights: 'lookUpTable_base_0.csv',
  }] }));
  writeFileSync(join(publish, 'lookUpTable_base_0.csv'), '0,100,0\n1,100,100\n2,1,10000000\n');
  const books = [
    { id: 0, payoutMultiplier: 0, criteria: '0' },
    { id: 1, payoutMultiplier: 100, criteria: 'basegame' },
    { id: 2, payoutMultiplier: 10000000, criteria: 'wincap' },
  ];
  const compressed = spawnSync(python, ['-c', `
import json,sys,zstandard
books=json.loads(sys.argv[2])
with open(sys.argv[1],'wb') as f:f.write(zstandard.ZstdCompressor().compress(('\\n'.join(json.dumps(x) for x in books)+'\\n').encode()))
`, join(publish, 'books_base.jsonl.zst'), JSON.stringify(books)], { encoding: 'utf8' });
  assert.equal(compressed.status, 0, compressed.stderr);
  try {
    const aligned = spawnSync(python, [aligner, publish, JSON.stringify({ base: 0.96 }), JSON.stringify({
      base: { name: 'wincap', payoutMultiplier: 100000, rtp: 0.01 },
    })], { encoding: 'utf8' });
    assert.equal(aligned.status, 0, aligned.stderr || aligned.stdout);
    const report = JSON.parse(aligned.stdout.trim());
    assert.equal(report.modes[0].afterRtp, 0.96);
    assert.equal(report.modes[0].afterCriterionRtp, 0.01);
    assert.equal(report.modes[0].criterionExact, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generated run.py exposes explicit safe publisher controls', () => {
  const project = createGameProject({ name: 'Publisher Controls' });
  project.build.stakeEngine.gameId = 'publisher_controls';
  project.math.specialSymbols = { wild: ['W'], scatter: ['S'], multiplier: [] };
  project.math.betModes = [
    { name: 'base', cost: 1, rtp: 0.965, maxWin: 5000, profile: { entry: 'base', triggerFreeSpins: false } },
    { name: 'bonus', cost: 100, rtp: 0.965, maxWin: 5000, profile: { entry: 'freeSpins', freeSpins: 10 } },
  ];
  const files = new MathSDKExporter(project).generateFiles();
  const source = files['games/publisher_controls/run.py'];
  for (const fragment of [
    'STAKE_STUDIO_SIMS_BASE', 'STAKE_STUDIO_SIMS_BONUS',
    'STAKE_STUDIO_RUN_SIMS', 'STAKE_STUDIO_RUN_OPTIMIZATION',
    'STAKE_STUDIO_RUN_ANALYSIS', 'STAKE_STUDIO_UPLOAD_DATA',
    'STAKE_STUDIO_TARGET_MODES',
  ]) assert.ok(source.includes(fragment), `run.py is missing ${fragment}`);
  assert.match(source, /STAKE_STUDIO_UPLOAD_DATA", False/);
});

test('verifier implementation is present and uses streaming zstd reads', () => {
  const source = readFileSync(verifier, 'utf8');
  assert.match(source, /stream_reader/);
  assert.match(source, /zip_longest/);
  assert.match(source, /UINT64_MAX/);
  assert.match(source, /MAX_BOOKS_PER_MODE/);
});

test('production publisher requires exact optimized RTP before release verification', () => {
  const publisher = readFileSync(join(studioRoot, 'server', 'math-publisher.mjs'), 'utf8');
  assert.match(publisher, /const rtpAligned = report\.modes\.every/);
  assert.match(publisher, /officialVerification: job\.profile === 'production' && rtpAligned/);
  assert.match(publisher, /Production LUT RTP is not exactly aligned after optimization/);
  assert.match(publisher, /validatePublishedModeContracts\(project, staged\.report\)/);
  assert.match(publisher, /job\.projectId === safeProjectId && job\.status === 'running'/);
  assert.match(publisher, /alignExactRtp\(job, project\)/);
  assert.match(publisher, /runOfficialVerification\(job\)/);
  assert.match(publisher, /refresh_official_math_verification\.py/);
  assert.match(publisher, /resumeExisting[\s\S]*directoryBytes/);
  assert.match(publisher, /contractFingerprint: job\.contractFingerprint/);
  assert.match(publisher, /mathSDKFilesFingerprint\(files\)/);
  assert.match(publisher, /detached: process\.platform !== 'win32'/);
  assert.match(publisher, /process\.kill\(-job\.child\.pid, 'SIGTERM'\)/);
  const stageStart = publisher.indexOf('function stageAndVerify');
  const stageEnd = publisher.indexOf('function alignExactRtp', stageStart);
  const stageSource = publisher.slice(stageStart, stageEnd);
  assert.match(stageSource, /spawnSync\(python, \[verifier/);
  assert.doesNotMatch(stageSource, /renameSync\(staged, destination\)/,
    'stage verification must not promote before all release gates pass');
  assert.ok(publisher.indexOf('runOfficialVerification(job)') < publisher.lastIndexOf('promoteStaged(job, staged)'),
    'official final verification must pass before the staged package is promoted');
});

test('generated production math supports selected-mode recovery and stratified rare-value evidence', () => {
  const project = createGameProject({ name: 'Publisher Recovery' });
  project.build.stakeEngine.gameId = 'publisher_recovery';
  project.math.specialSymbols = { wild: ['LUCID'], scatter: ['S'], multiplier: ['LUCID'] };
  project.math.freespinTriggers = { basegame: { 3: 10 }, freegame: {} };
  project.math.mechanicConfig.multiplierSymbols = {
    approvedValueLadder: [2, 3, 5, 1000],
    values: { basegame: { 2: 10, 3: 8, 5: 2, 1000: 1 }, freegame: { 2: 10, 3: 8, 5: 2, 1000: 1 } },
  };
  project.theme.symbols = [
    { name: 'A', payouts: { 5: 1 }, special: [] },
    { name: 'LUCID', payouts: {}, special: ['wild', 'multiplier'] },
    { name: 'S', payouts: {}, special: ['scatter'] },
  ];
  project.math.reelStrips = { BR: Array.from({ length: 5 }, (_, reel) => reel === 1 ? ['A', 'LUCID', 'S'] : ['A', 'S']) };
  project.math.betModes = [{
    name: 'base', cost: 1, rtp: 0.96, maxWin: 5000,
    profile: { entry: 'base', triggerFreeSpins: true, targetFeatureEntryHitRate: 12 },
  }];
  const files = new MathSDKExporter(project).generateFiles();
  const run = files['games/publisher_recovery/run.py'];
  const config = files['games/publisher_recovery/game_config.py'];
  const state = files['games/publisher_recovery/gamestate.py'];
  const optimization = files['games/publisher_recovery/game_optimization.py'];
  assert.match(run, /STAKE_STUDIO_TARGET_MODES/);
  assert.match(config, /STAKE_STUDIO_STRATIFIED_SUPPORT/);
  assert.match(config, /self\.lucid_support_values = \[2, 3, 5, 1000\]/);
  assert.match(state, /run_lucid_support_spin/);
  assert.match(optimization, /"freegame": ConstructConditions\(rtp=.*hr=12/);
});

test('production mode contracts reject an enhancer that triggers less often than base', () => {
  const project = createGameProject({ name: 'Mode Contract Proof' });
  project.math.betModes = [
    { name: 'base', profile: { entry: 'base', triggerFreeSpins: true, scatterWeightMultiplier: 1 } },
    { name: 'enhancer', profile: { entry: 'base', triggerFreeSpins: true, scatterWeightMultiplier: 3 } },
  ];
  const report = chance => ({ modes: [
    { name: 'base', criteriaProbability: { freegame: 0.007 } },
    { name: 'enhancer', criteriaProbability: { freegame: chance } },
  ] });
  assert.throws(() => validatePublishedModeContracts(project, report(0.035)), /promises increased feature entry/);
  assert.deepEqual(validatePublishedModeContracts(project, report(0.036)), [{
    mode: 'enhancer', contract: 'more-than-five-times-feature-entry', referenceMode: 'base',
    referenceChance: 0.007, actualChance: 0.036, ratio: 0.036 / 0.007, declaredBoost: 3,
  }]);
});

test('Morpheus production gate binds exact RTP, MAX allocation, Lucid reachability, and final LUT tails', () => {
  const values = Object.fromEntries([2, 3, 5, 7, 10, 25, 50, 100, 200, 500, 1000].map(value => [value, 1]));
  const project = createGameProject({ name: 'Morpheus Production Gate' });
  project.build.stakeEngine.gameId = 'morpheus_dreamfall';
  project.math.wincap = 100_000;
  project.math.wincapRtp = 0.01;
  project.math.maxWinHitRate = 0;
  project.math.betModes = [{ name: 'base', cost: 1, rtp: 0.96, maxWin: 100_000, profile: { entry: 'base' } }];
  const mode = {
    name: 'base', cost: 1, exactRtp: 0.96, maxPayout: 100_000, ordinaryMaxPayout: 99_999.9,
    criteriaProbability: { wincap: 1 / 10_000_000 }, criteriaRtp: { wincap: 0.01 },
    wincapCausality: { visibleMaxWeight: 1, missingVisibleMaxWeight: 0 },
    lucidValueWeights: { basegame: values, freegame: values },
    finalLutTail: {
      standardDeviation: 12, nonZeroProbability: 0.2,
      probabilityAtLeast5000: 0.001, probabilityAtLeast10000: 0.001,
      expectedTailLossAt40BetsRaw: 0.5, expectedTailLossAt10000Raw: 0.4,
      cvarUpperPointOnePercentRaw: 700,
      expectedTailLossAt40BetsCostNormalized: 0.5,
      expectedTailLossAt10000CostNormalized: 0.4,
      cvarUpperPointOnePercentCostNormalized: 700,
    },
  };
  assert.equal(validateMorpheusPublishedMath(project, { modes: [mode] }).passed, true);
  assert.throws(() => validateMorpheusPublishedMath(project, { modes: [{ ...mode, criteriaRtp: { wincap: 0.02 } }] }), /exactly 1\.00% RTP/);
  assert.throws(() => validateMorpheusPublishedMath(project, { modes: [{ ...mode, ordinaryMaxPayout: 100_000 }] }), /ordinary outcome above 99,999\.9x/);
  const missing = structuredClone(mode);
  delete missing.lucidValueWeights.freegame[1000];
  assert.throws(() => validateMorpheusPublishedMath(project, { modes: [missing] }), /no positive-weight evidence.*1000/);
});

test('only successful Morpheus production verification promotes Lucid final-LUT status', () => {
  const root = mkdtempSync(join(tmpdir(), 'stakestudio-lucid-promotion-'));
  const path = join(root, 'project.json');
  const values = Object.fromEntries([2, 3, 5, 7, 10, 25, 50, 100, 200, 500, 1000].map(value => [value, 1]));
  const project = createGameProject({ name: 'Morpheus Lucid Promotion' });
  project.build.stakeEngine.gameId = 'morpheus_dreamfall';
  project.math.rtp = 0.96;
  project.math.betModes = [{ name: 'base', rtp: 0.96 }];
  project.math.mechanicConfig.multiplierSymbols = {
    valueWeightStatus: 'candidate-generation-diversity-audited',
    values: { basegame: values, freegame: values },
  };
  const mode = {
    name: 'base', exactRtp: 0.96, delta: 0,
    lucidValueWeights: { basegame: values, freegame: values },
  };
  const job = { id: 'math-proof', projectId: 'morpheus_dreamfall', profile: 'production', contractFingerprint: 'contract-proof' };
  try {
    writeFileSync(path, JSON.stringify(project));
    updateMathPublishProject(path, job, {
      modes: [mode], totalBooks: 100000, fullStreamIntegrity: true,
      morpheusProductionMath: { passed: true },
    });
    const promoted = JSON.parse(readFileSync(path, 'utf8'));
    const lucid = promoted.math.mechanicConfig.multiplierSymbols;
    assert.equal(lucid.valueWeightStatus, 'production-optimized');
    assert.equal(lucid.productionOptimizationEvidence.fullStreamIntegrity, true);
    assert.equal(lucid.productionOptimizationEvidence.contractFingerprint, 'contract-proof');
    assert.equal(lucid.productionOptimizationEvidence.modes[0].exactRtp, 0.96);

    project.math.mechanicConfig.multiplierSymbols.valueWeightStatus = 'candidate-generation-diversity-audited';
    writeFileSync(path, JSON.stringify(project));
    updateMathPublishProject(path, { ...job, profile: 'draft' }, {
      modes: [mode], totalBooks: 1000, fullStreamIntegrity: true,
      morpheusProductionMath: { passed: true },
    });
    const draft = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(draft.math.mechanicConfig.multiplierSymbols.valueWeightStatus, 'candidate-generation-diversity-audited');
    assert.equal(draft.math.mechanicConfig.multiplierSymbols.productionOptimizationEvidence, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publisher budgets chance and feature modes separately and reserves working disk', () => {
  const project = createGameProject({ name: 'Publisher Storage' });
  project.build.simulations = { base: 500000, bonus: 125000 };
  project.math.betModes = [
    { name: 'base', profile: { entry: 'base' } },
    { name: 'enhancer', profile: { entry: 'base' } },
    { name: 'bonus', isBuyBonus: true, autoCloseDisabled: true, profile: { entry: 'freeSpins' } },
  ];
  const profile = getMathPublisherProfile('production');
  assert.deepEqual(getMathPublisherRounds(project, profile), { base: 500000, enhancer: 500000, bonus: 125000 });
  const storage = estimateMathPublisherWorkspace(project, profile);
  assert.ok(storage.requiredFreeBytes > storage.workingBytes);
  assert.ok(storage.workingBytes > storage.rawBytes);
});

test('production publisher uses one simulation worker when any mode contains full feature journeys', () => {
  const project = createGameProject({ name: 'Feature-safe Publisher' });
  project.math.betModes = [
    { name: 'base', profile: { entry: 'base' } },
    { name: 'bonus', isBuyBonus: true, profile: { entry: 'freeSpins' } },
  ];
  const production = getProjectMathPublisherExecution(project, getMathPublisherProfile('production'), {
    base: 100000,
    bonus: 100000,
  });
  assert.deepEqual(production, {
    threads: 1,
    rustThreads: 5,
    batchSize: 5000,
    featureJourneySafe: true,
  });

  project.math.betModes = [{ name: 'base', profile: { entry: 'base' } }];
  const chanceOnly = getProjectMathPublisherExecution(project, getMathPublisherProfile('production'), { base: 100000 });
  assert.equal(chanceOnly.threads, 5);
  assert.equal(chanceOnly.rustThreads, 5);
  assert.equal(chanceOnly.featureJourneySafe, false);
});

test('publisher preserves SDK tail warnings as non-blocking and adds cost-normalized review values', () => {
  const report = attachMathTailAnalysis({ modes: [{ name: 'bonus', cost: 100 }] }, {
    bonus: { prob5k: 0.02, prob10k: 0.01, etl40b: 20, etl10k: 4, cvar: 2400 },
  });
  const tail = report.modes[0].tailAnalysis;
  assert.equal(tail.blocking, false);
  assert.equal(tail.costNormalized.etl40b, 0.2);
  assert.equal(tail.costNormalized.etl10k, 0.04);
  assert.equal(tail.costNormalized.cvar, 24);
  assert.deepEqual(tail.sdkAdvisories.map(value => value.metric), ['prob5k', 'prob10k', 'etl40b', 'etl10k', 'cvar']);
});
