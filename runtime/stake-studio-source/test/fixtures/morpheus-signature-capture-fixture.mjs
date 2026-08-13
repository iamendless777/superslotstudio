import { createGameProject } from '../../src/engines/schema.js';
import { hashMorpheusProtocolValue } from '../../src/engines/morpheus/MorpheusEventProtocol.js';
import { buildMorpheusV2AuthoritativeQAFixture } from '../../src/engines/quality/morpheus/MorpheusV2AuthoritativeQAAdapter.js';
import {
  MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
  MORPHEUS_SIGNATURE_CHECKPOINTS,
  MORPHEUS_SIGNATURE_SCENARIO_ID,
  getMorpheusSignatureCaptureFingerprint,
  getMorpheusSignatureMotionEquivalenceAuthority,
} from '../../src/engines/quality/morpheus/MorpheusSignatureCaptureQA.js';

const HUD_FIELDS = ['chainHit', 'freeSpinsRemaining', 'awardedFreeSpins', 'runningWin', 'reelRows'];

export function createMorpheusCaptureFixtureProject() {
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

export function createHealthyMorpheusCaptureEvidence(value) {
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
