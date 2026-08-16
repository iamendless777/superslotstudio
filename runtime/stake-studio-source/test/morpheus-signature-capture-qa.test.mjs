import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { hashMorpheusProtocolValue } from '../src/engines/morpheus/MorpheusEventProtocol.js';
import { buildMorpheusV2AuthoritativeQAFixture } from '../src/engines/quality/morpheus/MorpheusV2AuthoritativeQAAdapter.js';
import {
  MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
  MORPHEUS_SIGNATURE_CHECKPOINTS,
  MORPHEUS_SIGNATURE_SCENARIO_ID,
  evaluateMorpheusSignatureCaptureEvidence,
  getMorpheusSignatureCaptureFingerprint,
  getMorpheusSignatureCaptureSummary,
  getMorpheusSignatureMotionEquivalenceAuthority,
  recordMorpheusSignatureCaptureQA,
} from '../src/engines/quality/morpheus/MorpheusSignatureCaptureQA.js';

const HUD_FIELDS = ['chainHit', 'freeSpinsRemaining', 'awardedFreeSpins', 'runningWin', 'reelRows'];

function project() {
  const value = createGameProject({ name: 'Morpheus Gate 7 Fixture' });
  value.production.budgets.targetFps = 60;
  value.production.budgets.maxTextureMemoryMb = 96;
  return value;
}

function dimensions(viewport) {
  if (viewport === 'desktop') return [1280, 720];
  if (viewport === 'mobile') return [667, 375];
  return [400, 250];
}

function frame(viewport, checkpointId, char = null) {
  const markers = {
    'authoritative-reveal': '1',
    'positive-win-visible': '2',
    'reel-growth-visible': '3',
    'fifth-hit-award-visible': '4',
    'acknowledged-tumble': '5',
    'mini-max-growth-8-row': '6',
  };
  const marker = char || markers[checkpointId] || 'f';
  const markerNumber = Number.parseInt(marker, 16);
  const detailLumaGridHex = Array.from({ length: 4096 }, (_, index) => (
    (index * 17 + markerNumber * 13) % 256
  ).toString(16).padStart(2, '0')).join('');
  return {
    format: 'stake-studio-immutable-qa-capture-v1',
    archived: true,
    sha256: marker.repeat(64),
    path: `qa-captures/${MORPHEUS_SIGNATURE_SCENARIO_ID}/run-001/${viewport}/${checkpointId}-${marker.repeat(12)}.png`,
    mimeType: 'image/png', width: dimensions(viewport)[0], height: dimensions(viewport)[1], bytes: 1024,
    capturedAt: '2026-08-11T20:00:00.000Z', viewport, checkpointId,
    visualMetrics: {
      format: 'stake-studio-png-visual-metrics-v1', authority: 'server-decoded-png',
      sampleCount: 4096, alphaCoverage: 0.99, luminanceRange: 0.72, luminanceStdDev: 0.18,
      entropyBits: 5.4, colorBucketCount: 128, nonUniformPixelRatio: 0.78, edgeDensity: 0.09,
      perceptualHash: marker.repeat(16),
      detailGridWidth: 64, detailGridHeight: 64, detailLumaGridHex, detailHash: marker.repeat(64),
    },
  };
}

function layout(viewport, maxGrowth = false) {
  const [width, height] = dimensions(viewport);
  return {
    viewportWidth: width, viewportHeight: height, overflowX: 0, overflowY: 0,
    stage: { x: 0, y: 0, width, height },
    reels: { x: width * 0.2, y: height * 0.05, width: width * 0.6, height: height * 0.68 },
    hud: { x: 0, y: height * 0.78, width, height: height * 0.22 },
    spin: { x: width * 0.6, y: height - 48, width: 88, height: 44 },
    hudLabelFontPx: 7.5, hudValueFontPx: 12.5, controlsOverlap: false,
    collisionAreas: { hudReels: 0, hudPrimaryControls: 0, controlPairs: 0 },
    visibleHudFields: [...HUD_FIELDS],
    renderAspectRatios: { cells: [1], content: [1], motion: [1] },
    squareSafeCells: true,
    motionAspectPreserved: true,
    ...(maxGrowth ? { coordinateCells: 48, fixedWorldBottomAligned: true } : {}),
  };
}

function checkpoint(viewport, definition, event) {
  const boardHash = '1'.repeat(8);
  const stateHash = '2'.repeat(8);
  const reelRows = definition.eventIndex >= 2 ? [4, 4, 4, 5, 4, 4] : [4, 4, 4, 4, 4, 4];
  const hud = { chainHit: definition.eventIndex >= 4 ? 5 : 4, freeSpinsRemaining: definition.eventIndex >= 4 ? 7 : 6, awardedFreeSpins: definition.eventIndex >= 4 ? 1 : 0, runningWin: definition.eventIndex >= 1 ? 250 : 0, reelRows };
  return {
    id: definition.id, eventIndex: definition.eventIndex, eventType: definition.eventType,
    sourceEventHash: hashMorpheusProtocolValue(event), semanticHash: '3'.repeat(8),
    expected: { boardHash, stateHash, reelRows, hud },
    observed: { boardHash, stateHash, reelRows: [...reelRows], hud: structuredClone(hud) },
    nextEventBlockedBeforeAck: true,
    acknowledgement: {
      id: definition.id === 'acknowledged-tumble' ? 'ack:morpheus:signature:dreamfall:tumble-5' : `ack:${definition.id}`,
      evidence: definition.acknowledgementEvidence,
      receiptHash: '4'.repeat(8),
    },
    frame: frame(viewport, definition.id),
    layout: layout(viewport),
  };
}

function healthyEvidence(value) {
  const fixture = buildMorpheusV2AuthoritativeQAFixture();
  const source = fixture.signatureSlice.sourceEvidence;
  const viewportRuns = ['desktop', 'mobile', 'mini'].map(viewport => ({
    viewport,
    checkpoints: MORPHEUS_SIGNATURE_CHECKPOINTS.map(definition => checkpoint(viewport, definition, fixture.signatureSlice.events[definition.eventIndex])),
    performance: {
      peakState: { scenarioId: MORPHEUS_SIGNATURE_SCENARIO_ID, reelRows: [8, 8, 8, 8, 8, 8] },
      frames: 48, averageMs: 16.6, p95Ms: 18, longFrames: 0, textureMemoryBytes: 64 * 1024 * 1024,
    },
    ...(viewport === 'mini' ? {
      maxGrowth: {
        reelRows: [8, 8, 8, 8, 8, 8],
        frame: {
          ...frame('mini', 'mini-max-growth-8-row', 'b'),
          visibilityProof: {
            format: 'morpheus-max-growth-visibility-proof-v1', requiredCount: 48, cellCount: 48,
            visiblyUnoccludedCellCount: 48, blockingOverlays: [], passed: true,
            cells: Array.from({ length: 48 }, (_, index) => ({
              reel: index % 6, row: Math.floor(index / 6), painted: true, insideViewport: true,
              targetHit: true, occludedBy: [], visiblyUnoccluded: true,
            })),
          },
        },
        layout: layout('mini', true),
        renderProfileFormat: 'morpheus-dreamfall-render-profile-v1',
        renderAspectIntegrityPassed: true,
        grownRowMotionCoveragePassed: true,
        motionFlipbookCellCount: 48,
        pairwiseFamilyHashesDistinct: true,
        cells: Array.from({ length: 48 }, (_, index) => ({
          expectedSymbol: `SYMBOL_${index % 8}`, renderedSymbol: `SYMBOL_${index % 8}`,
          expectedSourceFingerprint: `source-${index % 8}`, renderedSourceFingerprint: `source-${index % 8}`,
          decoded: true, painted: true, paintedWidth: 20, paintedHeight: 18,
          foregroundCoverage: 0.4, luminanceSeparation: 0.12, edgeClipped: false,
          cellAspectRatio: 1, contentAspectRatio: 1, contentSourceAspectRatio: 1,
          motionAspectRatio: 1, motionSourceAspectRatio: 1,
          renderAspectPassed: true, motionRendered: true,
        })),
      },
    } : {}),
  }));
  return {
    format: MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
    scenarioId: MORPHEUS_SIGNATURE_SCENARIO_ID,
    fingerprint: getMorpheusSignatureCaptureFingerprint(value),
    sourceContractFingerprint: fixture.contract.sourceContractFingerprint,
    protocol: {
      protocolEventHash: source.protocolEventHash,
      protocolBoardHash: source.protocolBoardHash,
      protocolStateHash: source.protocolStateHash,
    },
    motionEquivalence: getMorpheusSignatureMotionEquivalenceAuthority(),
    viewportRuns,
  };
}

test('Morpheus Gate 7 accepts exactly 15 archived semantic captures plus the mini 8-row stress proof', () => {
  const value = project();
  const evidence = healthyEvidence(value);
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(value, evidence);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.frontendPassed, true);
  assert.equal(evaluation.presentationPassed, true);
  assert.equal(evaluation.coreCaptureCount, 15);
  assert.equal(evaluation.archivedCaptureCount, 16);
  const summary = recordMorpheusSignatureCaptureQA(value, evidence);
  assert.equal(summary.complete, true);
  assert.equal(summary.frontendComplete, true);
  assert.equal(summary.presentationComplete, true);
});

test('Morpheus Gate 7 remains false without real archived captures and mini legibility evidence', () => {
  const value = project();
  const evidence = healthyEvidence(value);
  evidence.viewportRuns[2].checkpoints[2].frame.archived = false;
  evidence.viewportRuns[2].maxGrowth.cells[0].paintedHeight = 12;
  evidence.viewportRuns[2].maxGrowth.layout.collisionAreas.hudPrimaryControls = 9;
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(value, evidence);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.frontendPassed, false);
  assert.equal(evaluation.presentationPassed, false);
  assert.ok(evaluation.issues.some(value => /not confirmed in the immutable archive/.test(value)));
  assert.ok(evaluation.issues.some(value => /below 16×16px/.test(value)));
  assert.ok(evaluation.issues.some(value => /collision exceeds/.test(value)));
});

test('Morpheus Gate 7 rejects the former 33x19.375 mini cells and stretched motion proof', () => {
  const value = project();
  const evidence = healthyEvidence(value);
  const mini = evidence.viewportRuns.find(run => run.viewport === 'mini');
  mini.maxGrowth.layout.squareSafeCells = false;
  mini.maxGrowth.layout.renderAspectRatios.cells = [33 / 19.375];
  mini.maxGrowth.cells[0].cellAspectRatio = 33 / 19.375;
  mini.maxGrowth.cells[0].motionAspectRatio = 33 / 19.375;
  mini.maxGrowth.cells[0].renderAspectPassed = false;
  mini.maxGrowth.renderAspectIntegrityPassed = false;
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(value, evidence);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /square-safe|non-uniformly scaled|aspect integrity/.test(value)));
});

test('Morpheus Gate 7 rejects duplicate viewport runs and PNG/layout dimension drift', () => {
  const value = project();
  const evidence = healthyEvidence(value);
  evidence.viewportRuns.push({ viewport: 'mini', checkpoints: [], performance: {} });
  evidence.viewportRuns[0].checkpoints[0].frame.width = 1;
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(value, evidence);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /exactly one desktop, mobile, and mini/.test(value)));
  assert.ok(evaluation.issues.some(value => /PNG dimensions differ/.test(value)));
});

test('Morpheus Gate 7 rejects well-formed motion hashes that differ from the authoritative runtime proof', () => {
  const value = project();
  const evidence = healthyEvidence(value);
  evidence.motionEquivalence = {
    passed: true,
    stateHash: 'a1b2c3d4',
    semanticTraceHash: 'b2c3d4e5',
    acknowledgementHash: 'c3d4e5f6',
  };
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(value, evidence);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /differs from the authoritative runtime proof/.test(value)));
});

test('Morpheus Gate 7 rejects performance evidence sampled outside the bound 6x8 peak state', () => {
  const value = project();
  const evidence = healthyEvidence(value);
  evidence.viewportRuns[0].performance.peakState = {
    scenarioId: 'unbound-generic-preview',
    reelRows: [5, 5, 5, 5, 5, 5],
  };
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(value, evidence);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /not bound to morpheus-dreamfall-signature-v2/.test(value)));
  assert.ok(evaluation.issues.some(value => /not measured at the six-reel 8-row peak state/.test(value)));
});

test('Morpheus Gate 7 rejects identical blank mini PNGs at semantic checkpoints', () => {
  const value = project();
  const evidence = healthyEvidence(value);
  const mini = evidence.viewportRuns.find(run => run.viewport === 'mini');
  for (const checkpoint of mini.checkpoints) {
    checkpoint.frame.sha256 = 'd273'.repeat(16);
    checkpoint.frame.path = `qa-captures/${MORPHEUS_SIGNATURE_SCENARIO_ID}/run-001/mini/${checkpoint.id}-${checkpoint.frame.sha256.slice(0, 12)}.png`;
    checkpoint.frame.bytes = 3036;
    checkpoint.frame.visualMetrics = {
      format: 'stake-studio-png-visual-metrics-v1', authority: 'server-decoded-png',
      sampleCount: 4096, alphaCoverage: 1, luminanceRange: 0, luminanceStdDev: 0,
      entropyBits: 0, colorBucketCount: 1, nonUniformPixelRatio: 0, edgeDensity: 0,
      perceptualHash: '0'.repeat(16),
    };
  }
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(value, evidence);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /blank or near-blank/.test(value)));
  assert.ok(evaluation.issues.some(value => /each semantic checkpoint must contain different/.test(value)));
  assert.ok(evaluation.issues.some(value => /high-resolution decoded-pixel signature is missing/.test(value)));
});

test('Morpheus Gate 7 accepts localized semantic changes that a coarse whole-frame perceptual hash misses', () => {
  const value = project();
  const evidence = healthyEvidence(value);
  for (const run of evidence.viewportRuns) {
    for (const checkpoint of run.checkpoints) checkpoint.frame.visualMetrics.perceptualHash = '69296b173355cd46';
  }
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(value, evidence);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.issues.length, 0);
});

test('Morpheus Gate 7 rejects max-growth evidence with an occluded or non-hit-testable cell', () => {
  const value = project();
  const evidence = healthyEvidence(value);
  const visibility = evidence.viewportRuns.find(run => run.viewport === 'mini').maxGrowth.frame.visibilityProof;
  visibility.passed = false;
  visibility.visiblyUnoccludedCellCount = 47;
  visibility.blockingOverlays = ['feature-result-celebration'];
  visibility.cells[17] = {
    ...visibility.cells[17], targetHit: false, visiblyUnoccluded: false,
    occludedBy: ['feature-result-celebration'],
  };
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(value, evidence);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /does not establish all 48 unoccluded cells/.test(value)));
  assert.ok(evaluation.issues.some(value => /contains a blocking overlay/.test(value)));
  assert.ok(evaluation.issues.some(value => /hidden, clipped, or occluded cell/.test(value)));
});

test('Morpheus Gate 7 rejects near-blank frames even when their PNG hashes and byte sizes differ', () => {
  const value = project();
  const evidence = healthyEvidence(value);
  const mini = evidence.viewportRuns.find(run => run.viewport === 'mini');
  for (const [index, checkpoint] of mini.checkpoints.entries()) {
    const marker = (index + 10).toString(16);
    checkpoint.frame.sha256 = marker.repeat(64);
    checkpoint.frame.path = `qa-captures/${MORPHEUS_SIGNATURE_SCENARIO_ID}/run-001/mini/${checkpoint.id}-${checkpoint.frame.sha256.slice(0, 12)}.png`;
    checkpoint.frame.bytes = 3000 + index * 137;
    checkpoint.frame.visualMetrics = {
      ...checkpoint.frame.visualMetrics,
      luminanceRange: 0.03,
      luminanceStdDev: 0.004,
      entropyBits: 0.4,
      colorBucketCount: 4,
      nonUniformPixelRatio: 0.01,
      edgeDensity: 0.0002,
      perceptualHash: '0'.repeat(15) + marker,
    };
  }
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(value, evidence);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /luminance is blank or near-blank/.test(value)));
  assert.ok(evaluation.issues.some(value => /decoded-pixel diversity is below/.test(value)));
  assert.ok(evaluation.issues.some(value => /insufficient rendered-edge evidence/.test(value)));
});

test('summary re-evaluation invalidates a stored passed report that lacks decoded visual proof', () => {
  const value = project();
  recordMorpheusSignatureCaptureQA(value, healthyEvidence(value));
  const report = value.production.qa.morpheusSignatureCaptureAudit;
  const mini = report.viewportRuns.find(run => run.viewport === 'mini');
  for (const checkpoint of mini.checkpoints) {
    delete checkpoint.frame.visualMetrics;
    checkpoint.frame.sha256 = 'd273'.repeat(16);
    checkpoint.frame.path = `qa-captures/${MORPHEUS_SIGNATURE_SCENARIO_ID}/run-001/mini/${checkpoint.id}-${checkpoint.frame.sha256.slice(0, 12)}.png`;
  }
  report.passed = true;
  report.frontendPassed = true;
  report.presentationPassed = true;
  const summary = getMorpheusSignatureCaptureSummary(value);
  assert.equal(summary.fresh, true);
  assert.equal(summary.complete, false);
  assert.equal(summary.frontendComplete, false);
  assert.equal(summary.presentationComplete, false);
  assert.ok(summary.issues.some(value => /server-decoded PNG visual metrics are missing/.test(value)));
});

test('project changes stale a previously passing Morpheus capture report', () => {
  const value = project();
  recordMorpheusSignatureCaptureQA(value, healthyEvidence(value));
  value.math.grid.rows[0] = 5;
  const summary = getMorpheusSignatureCaptureSummary(value);
  assert.equal(summary.complete, false);
  assert.equal(summary.stale, true);
});
