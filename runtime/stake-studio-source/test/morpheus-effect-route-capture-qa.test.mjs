import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
  MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES,
  MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES,
  MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID,
  MORPHEUS_EFFECT_ROUTE_CAPTURE_VIEWPORTS,
  compactMorpheusEffectRouteCaptureEvidence,
  createMorpheusEffectRouteCaptureAuthority,
  evaluateMorpheusEffectRouteCaptureQA,
  getMorpheusEffectRouteCaptureFingerprint,
  getMorpheusEffectRouteCaptureSummary,
  recordMorpheusEffectRouteCaptureQA,
} from '../src/engines/quality/morpheus/MorpheusEffectRouteCaptureQA.js';

const clone = value => JSON.parse(JSON.stringify(value));

function dimensions(viewport) {
  if (viewport === 'desktop') return [1280, 720];
  if (viewport === 'mobile') return [667, 375];
  return [400, 250];
}

function frame({ viewport, checkpointId, runId, expected, boardCommitted = true }) {
  const [width, height] = dimensions(viewport);
  const sha = `${checkpointId}:${viewport}`.split('').reduce((value, char) => (
    ((value << 5) - value + char.charCodeAt(0)) >>> 0
  ), 2166136261).toString(16).padStart(8, '0').repeat(8).slice(0, 64);
  const cells = expected.board.flatMap((reel, reelIndex) => reel.map((symbol, row) => ({
    reel: reelIndex, row, expectedSymbol: symbol, topSymbol: symbol, runnerUpSymbol: 'OTHER',
    expectedScore: .91, bestScore: .91, runnerUpScore: .72, topOneMargin: .19,
    minimumScore: .52, minimumMargin: .012, aspectPreserved: true,
    sourceAspect: 1, declaredSourceAspect: 1,
    referenceSha256: 'ab'.repeat(32), sampleHash: `${String(reelIndex).padStart(2, '0')}${String(row).padStart(2, '0')}${'cd'.repeat(30)}`,
    passed: true, topThree: [{ symbol, score: .91 }],
  })));
  const identityCells = cells.map(cell => ({ ...cell, minimumMargin: .012 }));
  return {
    format: 'stake-studio-immutable-qa-capture-v1', archived: true,
    viewport, checkpointId, sha256: sha, mimeType: 'image/png', width, height, bytes: 120000,
    projectRelativePath: `qa-captures/${MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID}/${runId}/${viewport}/${checkpointId}-${sha.slice(0, 12)}.png`,
    visualMetrics: {
      format: 'stake-studio-png-visual-metrics-v1', authority: 'server-decoded-png',
      sampleCount: 4096, alphaCoverage: 1, luminanceRange: .7, luminanceStdDev: .16,
      entropyBits: 5.2, colorBucketCount: 120, nonUniformPixelRatio: .91, edgeDensity: .18,
      detailHash: sha,
    },
    ...(boardCommitted ? { renderedCellRecognition: {
      format: 'stake-studio-rendered-cell-recognition-v1',
      authority: 'server-decoded-archive-and-project-symbols',
      policy: 'composite-readability',
      referenceSetHash: 'ef'.repeat(32), requestHash: '12'.repeat(32),
      familyCount: 21, cellCount: cells.length,
      minimumScore: .52, minimumMargin: .001,
      passed: true, failedCells: [], cells,
    }, staticIdentityRecognition: {
      format: 'stake-studio-rendered-cell-recognition-v1',
      authority: 'server-decoded-archive-and-project-symbols',
      policy: 'static-identity',
      referenceSetHash: 'ef'.repeat(32), requestHash: '34'.repeat(32),
      familyCount: 21, cellCount: identityCells.length,
      minimumScore: .52, minimumMargin: .012,
      passed: true, failedCells: [], cells: identityCells,
    }, staticIdentityFrame: {
      sha256: '56'.repeat(32), mimeType: 'image/png', width, height, bytes: 110000,
      projectRelativePath: `qa-captures/${MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID}/${runId}/${viewport}/${checkpointId}-static-identity-${'56'.repeat(6)}.png`,
      visualMetrics: { authority: 'server-decoded-png' },
    } } : {}),
  };
}

function layout(viewport, routeId) {
  const [viewportWidth, viewportHeight] = dimensions(viewport);
  const dreamfallWorldActive = ['mysteryStarDreamfallTumble', 'exactMaxTermination'].includes(routeId);
  return {
    viewport, viewportWidth, viewportHeight, overflowX: 0, overflowY: 0,
    controlsOverlap: false,
    dreamfallWorldActive,
    dreamfallPersistentHudVisible: dreamfallWorldActive,
    squareSafeCells: dreamfallWorldActive,
    fixedWorldBottomAligned: dreamfallWorldActive,
    collisionAreas: { hudReels: 0, dreamfallHudReels: 0, hudPrimaryControls: 0, controlPairs: 0 },
  };
}

function positionGridLayout() {
  const plates = Array.from({ length: 24 }, (_, index) => ({
    reel: Math.floor(index / 4), row: index % 4, multiplier: 1,
    position: 'absolute', valuePosition: 'absolute',
    rect: { left: Math.floor(index / 4) * 96, top: (index % 4) * 124, width: 88, height: 120 },
    valueRect: { left: Math.floor(index / 4) * 96 + 62, top: (index % 4) * 124 + 5, width: 20, height: 14 },
  }));
  return {
    format: 'morpheus-position-grid-layout-proof-v1', mode: 'trickster_dream',
    requiredCount: 24, plateCount: 24, uniqueCellCount: 24, uniqueCoordinateCount: 24,
    overlaps: [], plates, passed: true,
  };
}

function completeEvidence(project = {}) {
  const authority = createMorpheusEffectRouteCaptureAuthority();
  const runId = 'run-20260811230000000';
  const runs = [];
  for (const routeId of MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES) {
    for (const motionMode of MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES) {
      const expected = authority.routes[routeId].reports[motionMode];
      for (const viewport of MORPHEUS_EFFECT_ROUTE_CAPTURE_VIEWPORTS) {
        const indexes = motionMode === 'normal'
          ? expected.checkpoints.map(item => item.index)
          : [expected.checkpoints.at(-1).index];
        runs.push({
          routeId, motionMode, viewport, passed: true,
          eventHash: expected.eventHash,
          boardHash: expected.boardHash,
          protocolStateHash: expected.protocolStateHash,
          stateHash: expected.stateHash,
          semanticTraceHash: expected.semanticTraceHash,
          acknowledgementHash: '7f8d9dd8',
          acknowledgementIdentityHash: expected.acknowledgementIdentityHash,
          checkpoints: indexes.map(index => {
            const definition = expected.checkpoints[index];
            const checkpointId = `${routeId}-${motionMode}-${index}-${definition.eventType}`;
            const boardCommitted = expected.checkpoints.slice(0, index + 1).some(item => item.eventType === 'reveal');
            return {
              eventIndex: index,
              eventType: definition.eventType,
              sourceEventHash: definition.sourceEventHash,
              semanticCommitHash: definition.semanticCommitHash,
              expected: boardCommitted ? clone(definition.expected) : { boardAuthority: 'uncommitted' },
              observed: boardCommitted ? clone(definition.expected) : { boardAuthority: 'uncommitted' },
              observationPassed: true,
              boardAuthority: boardCommitted ? 'authoritative-reveal-or-later' : 'uncommitted-pre-reveal',
              preRevealPresentation: boardCommitted ? null : {
                format: 'morpheus-pre-reveal-presentation-v1',
                boardAuthority: 'uncommitted',
                eventType: definition.eventType,
                mechanicText: `DECLARED ${definition.eventType}`,
                visiblyDeclared: true,
              },
              nextEventBlockedBeforeAck: true,
              blockingProof: { attempted: index < expected.checkpoints.length - 1, blocked: true },
              acknowledgement: { id: definition.acknowledgementId, evidence: `visible:${checkpointId}`, receiptHash: '1234abcd' },
              audioReceipt: { format: 'stake-studio-audio-playback-receipt-v1', played: true },
              motion: { suppressed: motionMode === 'none', activeBlockingEffects: 0, activePresentationTweens: 0 },
              positionGridLayout: routeId === 'tricksterGridSettlement' && boardCommitted
                ? positionGridLayout()
                : null,
              layout: layout(viewport, routeId),
              frame: frame({ viewport, checkpointId, runId, expected: definition.expected, boardCommitted }),
            };
          }),
        });
      }
    }
  }
  return {
    format: MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
    scenarioId: MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID,
    contractFingerprint: authority.contractFingerprint,
    authorityFingerprint: authority.fingerprint,
    fingerprint: getMorpheusEffectRouteCaptureFingerprint(project),
    runId,
    runAt: '2026-08-11T23:00:00.000Z',
    runs,
  };
}

test('effect route QA requires 84 route/motion/viewport runs and 189 immutable captures', () => {
  const project = {};
  const evaluation = evaluateMorpheusEffectRouteCaptureQA(completeEvidence(project), project);
  assert.equal(evaluation.passed, true, evaluation.issues.join('\n'));
  assert.equal(evaluation.expectedRunCount, 84);
  assert.equal(evaluation.archivedCaptureCount, 189);
  assert.equal(evaluation.expectedCaptureCount, 189);
});

test('normal playback must archive every semantic beat while other modes require final-state evidence', () => {
  const project = {};
  const evidence = completeEvidence(project);
  const normal = evidence.runs.find(run => run.routeId === 'mysteryStarDreamfallTumble'
    && run.motionMode === 'normal' && run.viewport === 'mini');
  assert.equal(normal.checkpoints.length, 9);
  normal.checkpoints.splice(4, 1);
  const evaluation = evaluateMorpheusEffectRouteCaptureQA(evidence, project);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /expected 9 checkpoints, received 8/.test(value)));
  assert.ok(evaluation.issues.some(value => /checkpoint is missing/.test(value)));
});

test('Trickster capture fails closed when its 24 position plates collapse into one coordinate', () => {
  const project = {};
  const evidence = completeEvidence(project);
  const run = evidence.runs.find(item => item.routeId === 'tricksterGridSettlement'
    && item.motionMode === 'normal' && item.viewport === 'desktop');
  const reveal = run.checkpoints.find(item => item.eventType === 'reveal');
  reveal.positionGridLayout.uniqueCoordinateCount = 1;
  reveal.positionGridLayout.passed = false;
  reveal.positionGridLayout.plates.forEach(plate => {
    plate.position = 'static';
    plate.valuePosition = 'static';
  });
  const evaluation = evaluateMorpheusEffectRouteCaptureQA(evidence, project);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /position grid is not visibly anchored one plate per cell/.test(value)));
});

test('pre-reveal generator declarations prove visible orchestration without inventing symbol recognition', () => {
  const project = {};
  const evidence = completeEvidence(project);
  const generator = evidence.runs.find(run => run.routeId === 'predeterminedGeneratorDeclarations'
    && run.motionMode === 'normal' && run.viewport === 'desktop');
  const declaration = generator.checkpoints[0];
  assert.equal(declaration.eventType, 'rainingWilds');
  assert.equal(declaration.boardAuthority, 'uncommitted-pre-reveal');
  assert.equal(declaration.preRevealPresentation.visiblyDeclared, true);
  assert.equal(declaration.frame.renderedCellRecognition, undefined);
  assert.equal(evaluateMorpheusEffectRouteCaptureQA(evidence, project).passed, true);

  declaration.preRevealPresentation.visiblyDeclared = false;
  const drifted = evaluateMorpheusEffectRouteCaptureQA(evidence, project);
  assert.equal(drifted.passed, false);
  assert.ok(drifted.issues.some(value => /pre-reveal declaration was not visibly presented/.test(value)));
});

test('no-motion evidence fails closed when route motion is still active', () => {
  const project = {};
  const evidence = completeEvidence(project);
  const noMotion = evidence.runs.find(run => run.motionMode === 'none' && run.viewport === 'desktop');
  noMotion.checkpoints[0].motion.activeBlockingEffects = 1;
  const evaluation = evaluateMorpheusEffectRouteCaptureQA(evidence, project);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /no-motion checkpoint still has active route motion/.test(value)));
});

test('route layouts fail closed when ordinary and expanding Dreamfall cabinets are confused', () => {
  const project = {};
  const ordinaryEvidence = completeEvidence(project);
  const ordinary = ordinaryEvidence.runs.find(run => run.routeId === 'tricksterGridSettlement');
  ordinary.checkpoints[0].layout.dreamfallWorldActive = true;
  ordinary.checkpoints[0].layout.dreamfallPersistentHudVisible = true;
  const ordinaryEvaluation = evaluateMorpheusEffectRouteCaptureQA(ordinaryEvidence, project);
  assert.equal(ordinaryEvaluation.passed, false);
  assert.ok(ordinaryEvaluation.issues.some(value => /ordinary route incorrectly retained/.test(value)));

  const dreamfallEvidence = completeEvidence(project);
  const dreamfall = dreamfallEvidence.runs.find(run => run.routeId === 'mysteryStarDreamfallTumble');
  dreamfall.checkpoints[0].layout.dreamfallWorldActive = false;
  const dreamfallEvaluation = evaluateMorpheusEffectRouteCaptureQA(dreamfallEvidence, project);
  assert.equal(dreamfallEvaluation.passed, false);
  assert.ok(dreamfallEvaluation.issues.some(value => /Dreamfall route is not using/.test(value)));
});

test('acknowledgement authority compares causal identity while retaining renderer evidence hashes', () => {
  const project = {};
  const evidence = completeEvidence(project);
  assert.equal(evaluateMorpheusEffectRouteCaptureQA(evidence, project).passed, true);
  evidence.runs[0].acknowledgementIdentityHash = 'deadbeef';
  const drifted = evaluateMorpheusEffectRouteCaptureQA(evidence, project);
  assert.equal(drifted.passed, false);
  assert.ok(drifted.issues.some(value => /acknowledgementIdentityHash differs/.test(value)));
});

test('route evidence fails when archived pixels classify as the wrong symbol family', () => {
  const project = {};
  const evidence = completeEvidence(project);
  const recognition = evidence.runs[0].checkpoints.find(checkpoint => checkpoint.boardAuthority === 'authoritative-reveal-or-later').frame.renderedCellRecognition;
  recognition.cells[0].topSymbol = 'OWL';
  recognition.cells[0].passed = false;
  recognition.passed = false;
  recognition.failedCells = ['0:0'];
  const evaluation = evaluateMorpheusEffectRouteCaptureQA(evidence, project);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /archived pixels do not recognize as authoritative symbol/.test(value)));
});

test('route evidence fails when static identity is hidden behind a plausible composite receipt', () => {
  const project = {};
  const evidence = completeEvidence(project);
  const frameEvidence = evidence.runs[0].checkpoints.find(checkpoint => checkpoint.boardAuthority === 'authoritative-reveal-or-later').frame;
  frameEvidence.staticIdentityRecognition.cells[0].topSymbol = 'OWL';
  frameEvidence.staticIdentityRecognition.cells[0].passed = false;
  frameEvidence.staticIdentityRecognition.passed = false;
  frameEvidence.staticIdentityRecognition.failedCells = ['0:0'];
  const evaluation = evaluateMorpheusEffectRouteCaptureQA(evidence, project);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(value => /strict static-identity recognition receipt/.test(value)));
});

test('recording stores evaluated truth and stale asset/audio lineage closes the gate', () => {
  const project = {};
  const evidence = completeEvidence(project);
  const stored = recordMorpheusEffectRouteCaptureQA(project, evidence);
  assert.equal(stored.passed, true);
  assert.equal(project.production.qa.morpheusEffectRouteCaptureAudit.passed, true);
  assert.equal(getMorpheusEffectRouteCaptureSummary(project).complete, true);
  project.audio = { stingers: { 'morpheus.audio.max-morpheus': { factory: { sourceFingerprint: 'changed' } } } };
  const stale = evaluateMorpheusEffectRouteCaptureQA(evidence, project);
  assert.equal(stale.passed, false);
  assert.ok(stale.issues.some(value => /project evidence fingerprint is stale/.test(value)));
  assert.equal(getMorpheusEffectRouteCaptureSummary(project).stale, true);
});

test('compact project receipts retain every fail-closed gate without embedding pixel grids', () => {
  const project = {};
  const evidence = completeEvidence(project);
  const committed = evidence.runs[0].checkpoints.find(checkpoint => checkpoint.boardAuthority === 'authoritative-reveal-or-later');
  committed.frame.visualMetrics.detailLumaGridHex = 'ab'.repeat(4096);
  committed.frame.renderedCellRecognition.cells[0].topThree.push({ symbol: 'OTHER', diagnostics: 'cd'.repeat(4096) });
  const compact = compactMorpheusEffectRouteCaptureEvidence(evidence);
  assert.equal(evaluateMorpheusEffectRouteCaptureQA(compact, project).passed, true);
  const compactFrame = compact.runs[0].checkpoints.find(checkpoint => checkpoint.boardAuthority === 'authoritative-reveal-or-later').frame;
  assert.equal(compactFrame.visualMetrics.detailLumaGridHex, undefined);
  assert.equal(compactFrame.renderedCellRecognition.cells[0].topThree.length, 1);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(evidence).length);

  compactFrame.renderedCellRecognition.cells[0].topSymbol = 'OWL';
  compactFrame.renderedCellRecognition.cells[0].passed = false;
  const rejected = evaluateMorpheusEffectRouteCaptureQA(compact, project);
  assert.equal(rejected.passed, false);
  assert.ok(rejected.issues.some(value => /archived pixels do not recognize as authoritative symbol/.test(value)));
});
