import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

import {
  analyzeRenderedCellRecognition,
  applyRepeatedFamilyIdentityConsensus,
  applyMotionFamilyConsensus,
  evaluateSingleCellIdentityEvidence,
} from '../server/bridge-plugin.mjs';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function rgbaPng(width, height, pixel) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    for (let x = 0; x < width; x++) scanlines.set(pixel(x, y), row + 1 + x * 4);
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const background = [8, 12, 20, 255];
const alphaPixel = (color, active) => active ? [...color, 255] : [0, 0, 0, 0];
const poppyPixel = (x, y) => alphaPixel([220, 42, 72], ((x - 16) ** 2 + (y - 16) ** 2) <= 95 || (x >= 14 && x <= 17 && y >= 12 && y <= 28));
const owlPixel = (x, y) => alphaPixel([58, 178, 238], (y >= 7 && y <= 25 && (x >= 6 && x <= 11 || x >= 20 && x <= 25)) || (y >= 14 && y <= 18 && x >= 9 && x <= 22));

function composite(pixel) {
  return pixel[3] ? [pixel[0], pixel[1], pixel[2], 255] : background;
}

const project = {
  theme: {
    symbols: [
      { name: 'POPPY', src: `data:image/png;base64,${rgbaPng(32, 32, poppyPixel).toString('base64')}` },
      { name: 'OWL', src: `data:image/png;base64,${rgbaPng(32, 32, owlPixel).toString('base64')}` },
    ],
  },
};

function request(expected = ['POPPY', 'OWL']) {
  return {
    format: 'stake-studio-rendered-cell-recognition-request-v1',
    minimumScore: .52,
    minimumMargin: .012,
    cells: expected.map((expectedSymbol, reel) => ({
      reel, row: 0, expectedSymbol, sourceAspect: 1,
      layoutWidth: 75, layoutHeight: 75,
      rect: { left: reel * 32, top: 0, width: 32, height: 32 },
    })),
  };
}

test('server-decoded recognition classifies actual archived cell pixels against every same-size family reference', () => {
  const screenshot = rgbaPng(64, 32, (x, y) => composite(x < 32 ? poppyPixel(x, y) : owlPixel(x - 32, y)));
  const result = analyzeRenderedCellRecognition(screenshot, '/fixture', project, request());
  assert.equal(result.format, 'stake-studio-rendered-cell-recognition-v1');
  assert.equal(result.authority, 'server-decoded-archive-and-project-symbols');
  assert.equal(result.familyCount, 2);
  assert.equal(result.cellCount, 2);
  assert.equal(result.passed, true, JSON.stringify(result.cells, null, 2));
  assert.deepEqual(result.cells.map(cell => cell.topSymbol), ['POPPY', 'OWL']);
  assert.ok(result.cells.every(cell => cell.topOneMargin >= .012));
  assert.ok(result.cells.every(cell => cell.analysisGridSize === 32));
  assert.ok(result.cells.every(cell => cell.layoutWidth === 75 && cell.layoutHeight === 75));
  assert.ok(result.cells.every(cell => cell.referenceSha256.length === 64 && cell.sampleHash.length === 64));
});

test('recognition fails closed when the declared symbol does not match archived pixels', () => {
  const screenshot = rgbaPng(64, 32, (x, y) => composite(x < 32 ? poppyPixel(x, y) : owlPixel(x - 32, y)));
  const result = analyzeRenderedCellRecognition(screenshot, '/fixture', project, request(['OWL', 'POPPY']));
  assert.equal(result.passed, false);
  assert.deepEqual(result.failedCells, ['0:0', '1:0']);
  assert.equal(result.cells[0].topSymbol, 'POPPY');
  assert.equal(result.cells[1].topSymbol, 'OWL');
});

test('recognition rejects invalid crops and source-aspect drift', () => {
  const screenshot = rgbaPng(64, 32, (x, y) => composite(x < 32 ? poppyPixel(x, y) : owlPixel(x - 32, y)));
  const drifted = request();
  drifted.cells[0].sourceAspect = 1.2;
  const result = analyzeRenderedCellRecognition(screenshot, '/fixture', project, drifted);
  assert.equal(result.passed, false);
  assert.equal(result.cells[0].aspectPreserved, false);
  const invalid = request();
  invalid.cells[0].rect.left = -1;
  assert.throws(() => analyzeRenderedCellRecognition(screenshot, '/fixture', project, invalid), /outside the archived PNG/);
  const transformedLarger = request();
  transformedLarger.cells[0].layoutWidth = 24;
  transformedLarger.cells[0].layoutHeight = 24;
  assert.doesNotThrow(() => analyzeRenderedCellRecognition(screenshot, '/fixture', project, transformedLarger));
});

test('static identity permits only strong repeated-family consensus for individually ambiguous correct crops', () => {
  const raw = [.0055, .0072, .0098].map((topOneMargin, index) => ({
    reel: index, row: 0, expectedSymbol: 'OWL', topSymbol: 'OWL', bestScore: .71,
    topOneMargin, aspectPreserved: true, sampleHash: String(index).padStart(64, 'a'),
    passed: false, identityBasis: 'unresolved',
  }));
  const result = applyRepeatedFamilyIdentityConsensus(raw, { minimumScore: .52 });
  assert.equal(result.identityGroups[0].passed, true);
  assert.ok(result.cells.every(cell => cell.passed));
  assert.ok(result.cells.every(cell => cell.identityBasis === 'repeated-family-consensus'));
});

test('repeated-family consensus never rescues a wrong top family', () => {
  const raw = [.006, .008, .009].map((topOneMargin, index) => ({
    reel: index, row: 0, expectedSymbol: 'OWL', topSymbol: 'POPPY', bestScore: .8,
    topOneMargin, aspectPreserved: true, sampleHash: String(index).padStart(64, 'b'),
    passed: false, identityBasis: 'unresolved',
  }));
  const result = applyRepeatedFamilyIdentityConsensus(raw, { minimumScore: .52 });
  assert.equal(result.identityGroups[0].passed, false);
  assert.ok(result.cells.every(cell => cell.topSymbol === 'POPPY'));
  assert.ok(result.cells.every(cell => cell.identityBasis !== 'repeated-family-consensus'));
});

test('compact repeated-family consensus allows only a strong expected-family supermajority with one narrow outlier', () => {
  const margins = [.028754, .017601, .03098, .025725, .026191, .005712, .032772, .017282, -.000482];
  const raw = margins.map((signedMargin, index) => ({
    reel: index < 5 ? index : 5, row: index < 5 ? 1 : index - 5,
    expectedSymbol: 'OWL', topSymbol: signedMargin >= 0 ? 'OWL' : 'MYSTERY_VEIL',
    expectedRank: signedMargin >= 0 ? 0 : 3,
    bestScore: .72, expectedScore: signedMargin >= 0 ? .72 : .72 + signedMargin,
    topOneMargin: Math.abs(signedMargin), expectedForegroundColorScore: .84,
    expectedAuthoredColorScore: .86, aspectPreserved: true,
    sampleHash: String(index).padStart(64, 'c'), passed: signedMargin >= .012,
    identityBasis: signedMargin >= .012 ? 'single-cell-margin' : 'unresolved',
  }));
  const accepted = applyRepeatedFamilyIdentityConsensus(raw, { minimumScore: .52 });
  assert.equal(accepted.identityGroups[0].basis, 'compact-majority');
  assert.equal(accepted.identityGroups[0].passed, true);
  assert.equal(accepted.cells.every(cell => cell.passed), true);

  const wrongMajority = raw.map((cell, index) => index < 7 ? cell : ({
    ...cell, topSymbol: 'MYSTERY_VEIL', expectedRank: 1, expectedScore: .718,
  }));
  assert.equal(applyRepeatedFamilyIdentityConsensus(wrongMajority, { minimumScore: .52 }).identityGroups[0].passed, false);
  const wideMiss = raw.map(cell => ({ ...cell }));
  wideMiss[8].expectedScore = .69;
  assert.equal(applyRepeatedFamilyIdentityConsensus(wideMiss, { minimumScore: .52 }).identityGroups[0].passed, false);
  const excessiveRunnerUpGap = raw.map(cell => ({ ...cell }));
  excessiveRunnerUpGap[8].topSymbol = 'MYSTERY_VEIL';
  excessiveRunnerUpGap[8].expectedRank = 1;
  excessiveRunnerUpGap[8].expectedScore = .7079;
  assert.equal(applyRepeatedFamilyIdentityConsensus(excessiveRunnerUpGap, { minimumScore: .52 }).identityGroups[0].passed, false);

  const governedEdgeFamily = raw.map((cell, index) => ({
    ...cell,
    expectedForegroundColorScore: index === 1 ? .824 : .84,
    expectedAuthoredColorScore: index === 2 ? .845 : .86,
  }));
  const edgeAccepted = applyRepeatedFamilyIdentityConsensus(governedEdgeFamily, { minimumScore: .52 });
  assert.equal(edgeAccepted.identityGroups[0].passed, true);
  assert.equal(edgeAccepted.identityGroups[0].preferredForegroundCount, 8);
  assert.equal(edgeAccepted.identityGroups[0].preferredAuthoredCount, 8);
  const weakForegroundDistribution = governedEdgeFamily.map((cell, index) => (
    index < 3 ? { ...cell, expectedForegroundColorScore: .824 } : cell
  ));
  assert.equal(applyRepeatedFamilyIdentityConsensus(weakForegroundDistribution, { minimumScore: .52 }).identityGroups[0].passed, false);
});

test('a single compact symbol may pass on strong authored-foreground evidence, never on background agreement alone', () => {
  const observed = {
    best: { symbol: 'MYSTERY_VEIL', score: .702589, authoredColorScore: .881219, foregroundColorScore: .851967 },
    runnerUp: { symbol: 'HOURGLASS', score: .69986, authoredColorScore: .839982, foregroundColorScore: .834895 },
    expectedSymbol: 'MYSTERY_VEIL', minimumScore: .52, minimumMargin: .012,
    aspectPreserved: true, policy: 'static-identity',
  };
  const result = evaluateSingleCellIdentityEvidence(observed);
  assert.equal(result.passed, true);
  assert.equal(result.identityBasis, 'authored-foreground-evidence');
  assert.equal(result.topOneMargin, .002729);
  assert.equal(result.authoredForegroundMargin, .041237);

  assert.equal(evaluateSingleCellIdentityEvidence({ ...observed, expectedSymbol: 'HOURGLASS' }).passed, false);
  assert.equal(evaluateSingleCellIdentityEvidence({
    ...observed,
    best: { ...observed.best, authoredColorScore: .85 },
    runnerUp: { ...observed.runnerUp, authoredColorScore: .84 },
  }).passed, false);
  assert.equal(evaluateSingleCellIdentityEvidence({ ...observed, aspectPreserved: false }).passed, false);
  assert.equal(evaluateSingleCellIdentityEvidence({ ...observed, policy: 'composite-readability' }).passed, false);
});

test('a compact two-cell family may use authored lineage only with one direct top match and independent foreground advantage', () => {
  const family = [
    {
      expectedSymbol: 'NYX', topSymbol: 'MORPHEUS', expectedRank: 3,
      expectedScore: .647315, bestScore: .66201, topOneMargin: .009845,
      expectedForegroundColorScore: .863384, expectedAuthoredColorScore: .867624,
      expectedAuthoredForegroundAdvantage: .020772, aspectPreserved: true,
      sampleHash: 'a'.repeat(64), passed: false,
    },
    {
      expectedSymbol: 'NYX', topSymbol: 'NYX', expectedRank: 0,
      expectedScore: .679621, bestScore: .679621, topOneMargin: .006121,
      expectedForegroundColorScore: .883639, expectedAuthoredColorScore: .888005,
      expectedAuthoredForegroundAdvantage: 0, aspectPreserved: true,
      sampleHash: 'b'.repeat(64), passed: true,
    },
  ];
  const accepted = applyRepeatedFamilyIdentityConsensus(family, { minimumScore: .52 });
  assert.equal(accepted.identityGroups[0].passed, true);
  assert.equal(accepted.identityGroups[0].basis, 'compact-authored-lineage');
  assert.equal(accepted.cells[0].identityBasis, 'compact-authored-family-lineage');

  assert.equal(applyRepeatedFamilyIdentityConsensus([
    { ...family[0], expectedAuthoredForegroundAdvantage: .0149 }, family[1],
  ], { minimumScore: .52 }).identityGroups[0].passed, false);
  assert.equal(applyRepeatedFamilyIdentityConsensus([
    family[0], { ...family[1], topSymbol: 'MORPHEUS', expectedRank: 1 },
  ], { minimumScore: .52 }).identityGroups[0].passed, false);
  assert.equal(applyRepeatedFamilyIdentityConsensus([
    family[0], { ...family[1], sampleHash: family[0].sampleHash },
  ], { minimumScore: .52 }).identityGroups[0].passed, false);
  assert.equal(applyRepeatedFamilyIdentityConsensus([
    family[0], { ...family[1], topOneMargin: .0039 },
  ], { minimumScore: .52 }).identityGroups[0].passed, false);
  assert.equal(applyRepeatedFamilyIdentityConsensus([
    { ...family[0], bestScore: .668 }, family[1],
  ], { minimumScore: .52 }).identityGroups[0].passed, false);
});

test('a compact rank-two near tie needs independent foreground shape and luminance evidence', () => {
  const observed = {
    best: {
      symbol: 'NYX', score: .715976, authoredColorScore: .898831, foregroundColorScore: .888711,
      foregroundScore: .645667, silhouetteScore: .236625, normalizedLumaCorrelation: .623851,
    },
    runnerUp: {
      symbol: 'MYSTERY_VEIL', score: .713056, authoredColorScore: .879415, foregroundColorScore: .846636,
      foregroundScore: .787093, silhouetteScore: .262069, normalizedLumaCorrelation: .66913,
    },
    expected: {
      symbol: 'MYSTERY_VEIL', score: .713056, authoredColorScore: .879415, foregroundColorScore: .846636,
      foregroundScore: .787093, silhouetteScore: .262069, normalizedLumaCorrelation: .66913,
    },
    expectedRank: 1,
    expectedSymbol: 'MYSTERY_VEIL', minimumScore: .52, minimumMargin: .012,
    aspectPreserved: true, policy: 'static-identity',
  };
  const result = evaluateSingleCellIdentityEvidence(observed);
  assert.equal(result.passed, true);
  assert.equal(result.identityBasis, 'structural-foreground-evidence');

  assert.equal(evaluateSingleCellIdentityEvidence({
    ...observed,
    expected: { ...observed.expected, foregroundScore: .70 },
  }).passed, false);
  assert.equal(evaluateSingleCellIdentityEvidence({
    ...observed,
    expected: { ...observed.expected, silhouetteScore: .245 },
  }).passed, false);
  assert.equal(evaluateSingleCellIdentityEvidence({
    ...observed,
    expected: { ...observed.expected, normalizedLumaCorrelation: .64 },
  }).passed, false);
  assert.equal(evaluateSingleCellIdentityEvidence({ ...observed, expectedRank: 2 }).passed, false);
  assert.equal(evaluateSingleCellIdentityEvidence({ ...observed, policy: 'composite-readability' }).passed, false);
});

test('motion readability accepts only a near-tied expected runner-up with stronger authored foreground', () => {
  const observed = {
    best: { symbol: 'HOURGLASS', score: .714947, authoredColorScore: .847603, foregroundColorScore: .843466 },
    runnerUp: { symbol: 'MYSTERY_VEIL', score: .714374, authoredColorScore: .886575, foregroundColorScore: .859797 },
    expected: { symbol: 'MYSTERY_VEIL', score: .714374, authoredColorScore: .886575, foregroundColorScore: .859797 },
    expectedRank: 1,
    expectedSymbol: 'MYSTERY_VEIL', minimumScore: .52, minimumMargin: .001,
    aspectPreserved: true, policy: 'composite-readability',
  };
  const result = evaluateSingleCellIdentityEvidence(observed);
  assert.equal(result.passed, true);
  assert.equal(result.identityBasis, 'motion-foreground-readability');
  assert.equal(evaluateSingleCellIdentityEvidence({ ...observed, expectedRank: 2 }).passed, false);
  assert.equal(evaluateSingleCellIdentityEvidence({
    ...observed,
    expected: { ...observed.expected, score: .70 },
  }).passed, false);
  assert.equal(evaluateSingleCellIdentityEvidence({
    ...observed,
    expected: { ...observed.expected, authoredColorScore: .86 },
  }).passed, false);
  assert.equal(evaluateSingleCellIdentityEvidence({ ...observed, policy: 'static-identity' }).passed, false);
});

test('repeated motion consensus requires independently passing static lineage for every cell', () => {
  const compositeCells = Array.from({ length: 9 }, (_, index) => ({
    reel: index, row: 1, expectedSymbol: 'OWL', topSymbol: index < 3 ? 'HOURGLASS' : 'OWL',
    expectedRank: index < 3 ? 1 : 0, bestScore: .697, expectedScore: .688,
    expectedForegroundColorScore: .84, expectedAuthoredColorScore: .86,
    aspectPreserved: true, sampleHash: `${index}`.padStart(64, 'a'),
    passed: index >= 3, identityBasis: index >= 3 ? 'single-cell-margin' : 'unresolved',
  }));
  const staticCells = compositeCells.map((cell, index) => ({
    ...cell, topSymbol: 'OWL', passed: true, sampleHash: `${index}`.padStart(64, 'b'),
  }));
  const accepted = applyMotionFamilyConsensus({ cells: compositeCells, identityGroups: [] }, { cells: staticCells });
  assert.equal(accepted.passed, true);
  assert.equal(accepted.cells[0].identityBasis, 'motion-family-consensus-with-static-lineage');
  assert.equal(accepted.cells[0].identityGroup.staticIdentityCellCount, 9);

  const wrongStatic = staticCells.map(cell => ({ ...cell }));
  wrongStatic[1].topSymbol = 'MYSTERY_VEIL';
  wrongStatic[1].passed = false;
  assert.equal(applyMotionFamilyConsensus({ cells: compositeCells, identityGroups: [] }, { cells: wrongStatic }).passed, false);

  const distant = compositeCells.map(cell => ({ ...cell }));
  distant[0].bestScore = .71;
  distant[0].expectedScore = .68;
  assert.equal(applyMotionFamilyConsensus({ cells: distant, identityGroups: [] }, { cells: staticCells }).passed, false);

  const compactStatic = staticCells.map((cell, index) => index === 1 ? ({
    ...cell,
    topSymbol: 'MYSTERY_VEIL',
    expectedRank: 1,
    identityBasis: 'compact-repeated-family-consensus',
    identityGroup: {
      symbol: 'OWL', cellCount: 9, expectedTopCount: 8,
      signedMeanExpectedMargin: .007, basis: 'compact-majority', passed: true,
    },
  }) : cell);
  assert.equal(applyMotionFamilyConsensus({ cells: compositeCells, identityGroups: [] }, { cells: compactStatic }).passed, true);
});

test('compact motion lineage requires a direct composite match and strict authored static lineage', () => {
  const compositeCells = [
    {
      reel: 3, row: 3, expectedSymbol: 'NYX', topSymbol: 'MORPHEUS', expectedRank: 1,
      expectedScore: .656145, bestScore: .670354, topOneMargin: .014209,
      expectedForegroundColorScore: .866909, expectedAuthoredColorScore: .871954,
      aspectPreserved: true, sampleHash: 'c'.repeat(64), passed: false,
    },
    {
      reel: 4, row: 3, expectedSymbol: 'NYX', topSymbol: 'NYX', expectedRank: 0,
      expectedScore: .69044, bestScore: .69044, topOneMargin: .008449,
      expectedForegroundColorScore: .887067, expectedAuthoredColorScore: .8922,
      aspectPreserved: true, sampleHash: 'd'.repeat(64), passed: true,
    },
  ];
  const staticGroup = {
    symbol: 'NYX', cellCount: 2, expectedTopCount: 1, uniqueSampleCount: 2,
    basis: 'compact-authored-lineage', passed: true,
  };
  const staticCells = [
    {
      reel: 3, row: 3, expectedSymbol: 'NYX', topSymbol: 'MORPHEUS', passed: true,
      aspectPreserved: true, sampleHash: 'e'.repeat(64),
      identityBasis: 'compact-authored-family-lineage', identityGroup: staticGroup,
    },
    {
      reel: 4, row: 3, expectedSymbol: 'NYX', topSymbol: 'NYX', passed: true,
      aspectPreserved: true, sampleHash: 'f'.repeat(64), identityBasis: 'single-cell-margin',
    },
  ];
  const accepted = applyMotionFamilyConsensus({ cells: compositeCells, identityGroups: [] }, { cells: staticCells });
  assert.equal(accepted.passed, true);
  assert.equal(accepted.identityGroups[0].basis, 'compact-authored-static-lineage');
  assert.equal(accepted.cells[0].identityBasis, 'motion-authored-family-lineage');

  assert.equal(applyMotionFamilyConsensus({ cells: compositeCells, identityGroups: [] }, {
    cells: [{ ...staticCells[0], identityGroup: { ...staticGroup, passed: false } }, staticCells[1]],
  }).passed, false);
  assert.equal(applyMotionFamilyConsensus({
    cells: [compositeCells[0], { ...compositeCells[1], topSymbol: 'MORPHEUS', expectedRank: 1 }], identityGroups: [],
  }, { cells: staticCells }).passed, false);
  const rankThree = compositeCells.map((cell, index) => index === 0 ? { ...cell, expectedRank: 2 } : cell);
  assert.equal(applyMotionFamilyConsensus({ cells: rankThree, identityGroups: [] }, { cells: staticCells }).passed, true);
  const rankFour = compositeCells.map((cell, index) => index === 0 ? {
    ...cell, expectedRank: 3, expectedAuthoredForegroundAdvantage: .099,
  } : cell);
  assert.equal(applyMotionFamilyConsensus({ cells: rankFour, identityGroups: [] }, { cells: staticCells }).passed, false);
  const rankFourAuthored = compositeCells.map((cell, index) => index === 0 ? {
    ...cell, expectedRank: 3, expectedAuthoredForegroundAdvantage: .1,
  } : cell);
  assert.equal(applyMotionFamilyConsensus({ cells: rankFourAuthored, identityGroups: [] }, { cells: staticCells }).passed, true);
  const distant = compositeCells.map((cell, index) => index === 0 ? { ...cell, bestScore: .677 } : cell);
  assert.equal(applyMotionFamilyConsensus({ cells: distant, identityGroups: [] }, { cells: staticCells }).passed, false);
  const weakExpected = compositeCells.map((cell, index) => index === 0 ? { ...cell, expectedScore: .6449 } : cell);
  assert.equal(applyMotionFamilyConsensus({ cells: weakExpected, identityGroups: [] }, { cells: staticCells }).passed, false);
  const weakDirect = compositeCells.map((cell, index) => index === 1 ? { ...cell, topOneMargin: .0039 } : cell);
  assert.equal(applyMotionFamilyConsensus({ cells: weakDirect, identityGroups: [] }, { cells: staticCells }).passed, false);
});
