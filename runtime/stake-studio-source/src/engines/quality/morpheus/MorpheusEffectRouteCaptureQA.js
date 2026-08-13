import { MORPHEUS_CONTRACT_FINGERPRINT } from '../../morpheus/MorpheusGameContract.js';
import {
  createExactMaxTerminationProofTrace,
  createMysteryStarDreamfallProofTrace,
  createTricksterGridSettlementProofTrace,
  createLucidFamilyMultiplierProofTrace,
  createVeilAscentUpgradeProofTrace,
  createPredeterminedGeneratorProofTrace,
  createNightmareReliquaryProofTrace,
} from '../../morpheus/MorpheusEffectProofTraces.js?orchestration=20260813-4';
import { hashMorpheusProtocolValue } from '../../morpheus/MorpheusEventProtocol.js';
import {
  MORPHEUS_EFFECT_MOTION_MODES,
} from '../../morpheus/MorpheusEffectOrchestrationContract.js?orchestration=20260813-3';
import {
  MorpheusEffectOrchestrationRuntime,
  proveMorpheusEffectMotionEquivalence,
} from '../../presentation/morpheus/MorpheusEffectOrchestrationRuntime.js?orchestration=20260813-3';

export const MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT = 'morpheus-effect-route-capture-qa-v7';
export const MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID = 'morpheus-effect-routes-v2';
export const MORPHEUS_EFFECT_ROUTE_CAPTURE_VIEWPORTS = Object.freeze(['desktop', 'mobile', 'mini']);
export const MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES = MORPHEUS_EFFECT_MOTION_MODES;
export const MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES = Object.freeze([
  'predeterminedGeneratorDeclarations',
  'nightmareReliquaryDeclarations',
  'lucidFamilyMultiplierSettlement',
  'veilAscentUpgrade',
  'tricksterGridSettlement',
  'mysteryStarDreamfallTumble',
  'exactMaxTermination',
]);

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const safe = value => String(value || '').trim();
const keyFor = (routeId, motionMode, viewport) => `${routeId}:${motionMode}:${viewport}`;

function compactVisualMetrics(metrics = {}) {
  return {
    format: metrics.format,
    authority: metrics.authority,
    sampleCount: metrics.sampleCount,
    alphaCoverage: metrics.alphaCoverage,
    luminanceRange: metrics.luminanceRange,
    luminanceStdDev: metrics.luminanceStdDev,
    entropyBits: metrics.entropyBits,
    colorBucketCount: metrics.colorBucketCount,
    nonUniformPixelRatio: metrics.nonUniformPixelRatio,
    edgeDensity: metrics.edgeDensity,
    detailHash: metrics.detailHash,
  };
}

function compactRecognitionCell(cell = {}) {
  const cellFields = [
    'reel', 'row', 'expectedSymbol', 'topSymbol', 'expectedScore', 'expectedRank',
    'expectedAuthoredColorScore', 'expectedForegroundColorScore',
    'expectedAuthoredForegroundAdvantage', 'bestScore', 'topOneMargin',
    'authoredForegroundMargin', 'aspectPreserved', 'referenceSha256', 'sampleHash',
    'passed', 'identityBasis', 'staticIdentitySampleHash',
  ];
  const groupFields = [
    'symbol', 'cellCount', 'uniqueCompositeSampleCount', 'maxExpectedScoreGap',
    'staticIdentityCellCount', 'passed', 'expectedTopCount', 'uniqueSampleCount',
    'basis', 'meanMargin', 'strongMarginCount', 'signedMeanExpectedMargin',
    'preferredForegroundCount', 'preferredAuthoredCount',
  ];
  const scalar = Object.fromEntries(cellFields
    .filter(key => cell[key] !== undefined)
    .map(key => [key, cell[key]]));
  const identityGroup = cell.identityGroup && typeof cell.identityGroup === 'object'
    ? Object.fromEntries(groupFields
      .filter(key => cell.identityGroup[key] !== undefined)
      .map(key => [key, cell.identityGroup[key]]))
    : undefined;
  const topCandidate = cell.topThree?.[0] && typeof cell.topThree[0] === 'object'
    ? {
      authoredColorScore: cell.topThree[0].authoredColorScore,
      foregroundColorScore: cell.topThree[0].foregroundColorScore,
    }
    : undefined;
  return {
    ...scalar,
    ...(identityGroup ? { identityGroup } : {}),
    ...(topCandidate ? { topThree: [topCandidate] } : {}),
  };
}

function compactRecognition(receipt) {
  if (!receipt) return receipt;
  return {
    format: receipt.format,
    authority: receipt.authority,
    policy: receipt.policy,
    referenceSetHash: receipt.referenceSetHash,
    requestHash: receipt.requestHash,
    familyCount: receipt.familyCount,
    cellCount: receipt.cellCount,
    minimumScore: receipt.minimumScore,
    minimumMargin: receipt.minimumMargin,
    passed: receipt.passed,
    failedCells: [...(receipt.failedCells || [])],
    cells: (receipt.cells || []).map(compactRecognitionCell),
  };
}

export function compactMorpheusEffectCaptureFrame(frame) {
  if (!frame) return frame;
  const compact = {
    ...frame,
    visualMetrics: compactVisualMetrics(frame.visualMetrics),
    renderedCellRecognition: compactRecognition(frame.renderedCellRecognition),
    staticIdentityRecognition: compactRecognition(frame.staticIdentityRecognition),
  };
  if (frame.staticIdentityFrame) {
    compact.staticIdentityFrame = {
      ...frame.staticIdentityFrame,
      visualMetrics: { authority: frame.staticIdentityFrame.visualMetrics?.authority },
    };
  }
  return compact;
}

export function compactMorpheusEffectRouteCaptureEvidence(evidence = {}) {
  return {
    ...clone(evidence),
    runs: (evidence.runs || []).map(run => ({
      ...clone(run),
      checkpoints: (run.checkpoints || []).map(checkpoint => ({
        ...clone(checkpoint),
        frame: compactMorpheusEffectCaptureFrame(checkpoint.frame),
      })),
    })),
  };
}

export function getMorpheusAcknowledgementIdentityHash(acknowledgements = []) {
  return hashMorpheusProtocolValue((acknowledgements || []).map(receipt => ({
    id: receipt.id,
    eventIndex: receipt.eventIndex,
    eventType: receipt.eventType,
    sourceEventHash: receipt.sourceEventHash,
  })));
}

function traceFor(routeId) {
  if (routeId === 'predeterminedGeneratorDeclarations') return createPredeterminedGeneratorProofTrace();
  if (routeId === 'nightmareReliquaryDeclarations') return createNightmareReliquaryProofTrace();
  if (routeId === 'lucidFamilyMultiplierSettlement') return createLucidFamilyMultiplierProofTrace();
  if (routeId === 'veilAscentUpgrade') return createVeilAscentUpgradeProofTrace();
  if (routeId === 'tricksterGridSettlement') return createTricksterGridSettlementProofTrace();
  if (routeId === 'mysteryStarDreamfallTumble') return createMysteryStarDreamfallProofTrace();
  if (routeId === 'exactMaxTermination') return createExactMaxTerminationProofTrace();
  throw new Error(`Unknown Morpheus effect capture route ${routeId}.`);
}

function issue(issues, scope, message) {
  issues.push(`${scope}: ${message}`);
}

function expectedCheckpointIndexes(eventCount, motionMode) {
  return motionMode === 'normal'
    ? Array.from({ length: eventCount }, (_, index) => index)
    : [eventCount - 1];
}

function projectionFor(state) {
  const reelRows = [...(state.reelRows || [])].map(Number);
  const board = reelRows.map((rows, reel) => Array.from({ length: rows }, (_, row) => (
    state.board?.[reel]?.[row]?.name || state.board?.[reel]?.[row] || ''
  )));
  const projection = {
    board,
    reelRows,
    hud: {
      chainHit: Number(state.tumbleChainHit) || 0,
      freeSpinsRemaining: Number(state.freeSpinsRemaining) || 0,
      awardedFreeSpins: Number(state.totalTumbleFreeSpinsAwarded) || 0,
      runningWin: Number(state.totalWinAmount) || 0,
      reelRows,
    },
  };
  return {
    board,
    boardHash: hashMorpheusProtocolValue(projection.board),
    stateHash: hashMorpheusProtocolValue(projection),
    reelRows,
    hud: projection.hud,
  };
}

function validateRenderedCellRecognition(frame, expected, scope, issues) {
  const recognition = frame?.renderedCellRecognition;
  const identity = frame?.staticIdentityRecognition;
  if (recognition?.format !== 'stake-studio-rendered-cell-recognition-v1'
    || recognition?.authority !== 'server-decoded-archive-and-project-symbols') {
    issue(issues, scope, 'server-decoded rendered-cell recognition receipt is missing');
    return;
  }
  const expectedCells = (expected?.board || []).reduce((sum, reel) => sum + reel.length, 0);
  if (recognition.passed !== true || recognition.policy !== 'composite-readability'
    || recognition.cellCount !== expectedCells
    || recognition.familyCount !== 21 || recognition.failedCells?.length) {
    issue(issues, scope, `rendered-cell recognition did not pass all ${expectedCells} cells against 21 families`);
  }
  if (Number(recognition.minimumScore) < 0.52 || Number(recognition.minimumMargin) < 0.001
    || !/^[a-f0-9]{64}$/.test(safe(recognition.referenceSetHash))
    || !/^[a-f0-9]{64}$/.test(safe(recognition.requestHash))) {
    issue(issues, scope, 'rendered-cell recognition thresholds or lineage hashes are invalid');
  }
  const actual = new Map((recognition.cells || []).map(cell => [`${cell.reel}:${cell.row}`, cell]));
  for (let reel = 0; reel < (expected?.board || []).length; reel++) {
    for (let row = 0; row < expected.board[reel].length; row++) {
      const symbol = expected.board[reel][row];
      const cell = actual.get(`${reel}:${row}`);
      const motionForeground = cell?.identityBasis === 'motion-foreground-readability'
        && Number(cell.expectedRank) === 1
        && Number(cell.expectedScore) >= 0.65
        && Number(cell.bestScore) - Number(cell.expectedScore) <= 0.003
        && Number(cell.expectedAuthoredColorScore) >= 0.82
        && Number(cell.expectedAuthoredForegroundAdvantage) >= 0.025
        && Number(cell.expectedForegroundColorScore) >= 0.8;
      const motionFamily = cell?.identityBasis === 'motion-family-consensus-with-static-lineage'
        && cell.identityGroup?.symbol === symbol
        && Number(cell.identityGroup?.cellCount) >= 3
        && Number(cell.identityGroup?.uniqueCompositeSampleCount) === Number(cell.identityGroup?.cellCount)
        && Number(cell.identityGroup?.maxExpectedScoreGap) <= 0.012
        && Number(cell.identityGroup?.staticIdentityCellCount) === Number(cell.identityGroup?.cellCount)
        && cell.identityGroup?.passed === true
        && Number(cell.expectedRank) <= 1
        && Number(cell.expectedScore) >= 0.65
        && Number(cell.expectedForegroundColorScore) >= 0.8
        && Number(cell.expectedAuthoredColorScore) >= 0.82
        && /^[a-f0-9]{64}$/.test(safe(cell.staticIdentitySampleHash));
      const authoredFamily = cell?.identityBasis === 'compact-authored-family-lineage'
        && cell.identityGroup?.symbol === symbol
        && Number(cell.identityGroup?.cellCount) >= 2
        && Number(cell.identityGroup?.expectedTopCount) >= 1
        && Number(cell.identityGroup?.uniqueSampleCount) === Number(cell.identityGroup?.cellCount)
        && cell.identityGroup?.basis === 'compact-authored-lineage'
        && cell.identityGroup?.passed === true
        && Number(cell.expectedRank) <= 3
        && Number(cell.expectedScore) >= 0.64
        && Number(cell.expectedForegroundColorScore) >= 0.86
        && Number(cell.expectedAuthoredColorScore) >= 0.86
        && Number(cell.bestScore) - Number(cell.expectedScore) <= 0.02
        && (cell.topSymbol === symbol || Number(cell.expectedAuthoredForegroundAdvantage) >= 0.015);
      const motionAuthoredFamily = cell?.identityBasis === 'motion-authored-family-lineage'
        && cell.identityGroup?.symbol === symbol
        && Number(cell.identityGroup?.cellCount) >= 2
        && Number(cell.identityGroup?.uniqueCompositeSampleCount) === Number(cell.identityGroup?.cellCount)
        && Number(cell.identityGroup?.maxExpectedScoreGap) <= 0.02
        && Number(cell.identityGroup?.staticIdentityCellCount) === Number(cell.identityGroup?.cellCount)
        && cell.identityGroup?.basis === 'compact-authored-static-lineage'
        && cell.identityGroup?.passed === true
        && (Number(cell.expectedRank) <= 2
          || (Number(cell.expectedRank) <= 3 && Number(cell.expectedAuthoredForegroundAdvantage) >= 0.1))
        && Number(cell.expectedScore) >= 0.645
        && Number(cell.expectedForegroundColorScore) >= 0.86
        && Number(cell.expectedAuthoredColorScore) >= 0.86
        && /^[a-f0-9]{64}$/.test(safe(cell.staticIdentitySampleHash));
      if (!cell || cell.expectedSymbol !== symbol || (cell.topSymbol !== symbol && !motionForeground && !motionFamily && !authoredFamily && !motionAuthoredFamily) || cell.passed !== true
        || cell.aspectPreserved !== true || Number(cell.bestScore) < 0.52
        || (Number(cell.topOneMargin) < 0.001 && !motionForeground && !motionFamily && !authoredFamily && !motionAuthoredFamily)
        || !/^[a-f0-9]{64}$/.test(safe(cell.referenceSha256))
        || !/^[a-f0-9]{64}$/.test(safe(cell.sampleHash))) {
        issue(issues, `${scope}:${reel}:${row}`, `archived pixels do not recognize as authoritative symbol ${symbol}`);
      }
    }
  }
  if (identity?.format !== 'stake-studio-rendered-cell-recognition-v1'
    || identity?.authority !== 'server-decoded-archive-and-project-symbols'
    || identity?.policy !== 'static-identity' || identity?.passed !== true
    || identity?.cellCount !== expectedCells || identity?.familyCount !== 21
    || Number(identity.minimumScore) < 0.52 || Number(identity.minimumMargin) < 0.012
    || !/^[a-f0-9]{64}$/.test(safe(identity.referenceSetHash))
    || !/^[a-f0-9]{64}$/.test(safe(identity.requestHash))) {
    issue(issues, scope, 'strict static-identity recognition receipt is missing or invalid');
    return;
  }
  const identityCells = new Map((identity.cells || []).map(cell => [`${cell.reel}:${cell.row}`, cell]));
  for (let reel = 0; reel < (expected?.board || []).length; reel++) {
    for (let row = 0; row < expected.board[reel].length; row++) {
      const symbol = expected.board[reel][row];
      const cell = identityCells.get(`${reel}:${row}`);
      const consensus = cell?.identityBasis === 'repeated-family-consensus'
        && cell.identityGroup?.symbol === symbol
        && Number(cell.identityGroup?.cellCount) >= 3
        && Number(cell.identityGroup?.meanMargin) >= 0.0055
        && Number(cell.identityGroup?.strongMarginCount) >= 2
        && Number(cell.identityGroup?.uniqueSampleCount) === Number(cell.identityGroup?.cellCount)
        && cell.identityGroup?.passed === true;
      const compactConsensus = cell?.identityBasis === 'compact-repeated-family-consensus'
        && cell.identityGroup?.symbol === symbol
        && Number(cell.identityGroup?.cellCount) >= 6
        && Number(cell.identityGroup?.expectedTopCount) >= Math.ceil(Number(cell.identityGroup?.cellCount) * 0.85)
        && Number(cell.identityGroup?.signedMeanExpectedMargin) >= 0.006
        && Number(cell.identityGroup?.strongMarginCount) >= 3
        && Number(cell.identityGroup?.preferredForegroundCount) >= Math.ceil(Number(cell.identityGroup?.cellCount) * 0.85)
        && Number(cell.identityGroup?.preferredAuthoredCount) >= Math.ceil(Number(cell.identityGroup?.cellCount) * 0.85)
        && Number(cell.identityGroup?.uniqueSampleCount) === Number(cell.identityGroup?.cellCount)
        && cell.identityGroup?.basis === 'compact-majority'
        && cell.identityGroup?.passed === true
        && Number(cell.expectedRank) <= 3
        && Number(cell.expectedScore) >= 0.68
        && Number(cell.expectedForegroundColorScore) >= 0.82
        && Number(cell.expectedAuthoredColorScore) >= 0.84
        && Number(cell.bestScore) - Number(cell.expectedScore) <= 0.012;
      const authoredForeground = cell?.identityBasis === 'authored-foreground-evidence'
        && Number(cell.bestScore) >= 0.65
        && Number(cell.topOneMargin) >= 0.001
        && Number(cell.authoredForegroundMargin) >= 0.025
        && Number(cell.topThree?.[0]?.authoredColorScore) >= 0.82
        && Number(cell.topThree?.[0]?.foregroundColorScore) >= 0.8;
      const structuralForeground = cell?.identityBasis === 'structural-foreground-evidence'
        && Number(cell.expectedRank) === 1
        && Number(cell.expectedScore) >= 0.68
        && Number(cell.bestScore) - Number(cell.expectedScore) <= 0.004
        && Number(cell.expectedAuthoredColorScore) >= 0.86
        && Number(cell.expectedForegroundColorScore) >= 0.82;
      const authoredFamily = cell?.identityBasis === 'compact-authored-family-lineage'
        && cell.identityGroup?.symbol === symbol
        && Number(cell.identityGroup?.cellCount) >= 2
        && Number(cell.identityGroup?.expectedTopCount) >= 1
        && Number(cell.identityGroup?.uniqueSampleCount) === Number(cell.identityGroup?.cellCount)
        && cell.identityGroup?.basis === 'compact-authored-lineage'
        && cell.identityGroup?.passed === true
        && Number(cell.expectedRank) <= 3
        && Number(cell.expectedScore) >= 0.64
        && Number(cell.expectedForegroundColorScore) >= 0.86
        && Number(cell.expectedAuthoredColorScore) >= 0.86
        && Number(cell.bestScore) - Number(cell.expectedScore) <= 0.016
        && (cell.topSymbol === symbol || Number(cell.expectedAuthoredForegroundAdvantage) >= 0.015);
      const identityAllowsRunnerUp = compactConsensus || structuralForeground || authoredFamily;
      if (!cell || cell.expectedSymbol !== symbol || (cell.topSymbol !== symbol && !identityAllowsRunnerUp) || cell.passed !== true
        || (Number(cell.topOneMargin) < 0.012 && !consensus && !compactConsensus && !authoredForeground && !structuralForeground && !authoredFamily)) {
        issue(issues, `${scope}:static:${reel}:${row}`, `static pixels do not recognize as authoritative symbol ${symbol}`);
      }
    }
  }
  const identityFrame = frame?.staticIdentityFrame;
  if (!/^[a-f0-9]{64}$/.test(safe(identityFrame?.sha256))
    || identityFrame?.mimeType !== 'image/png'
    || identityFrame?.width !== frame.width || identityFrame?.height !== frame.height
    || !safe(identityFrame?.projectRelativePath).includes('-static-identity-')
    || identityFrame?.visualMetrics?.authority !== 'server-decoded-png') {
    issue(issues, scope, 'immutable static-identity frame lineage is missing');
  }
}

function validateFrame(frame, scope, viewport, checkpointId, issues) {
  if (frame?.format !== 'stake-studio-immutable-qa-capture-v1' || frame?.archived !== true) {
    issue(issues, scope, 'frame is not an immutable archive receipt');
    return;
  }
  if (safe(frame.viewport) !== viewport || safe(frame.checkpointId) !== checkpointId) {
    issue(issues, scope, 'archive metadata does not match the route checkpoint');
  }
  if (!/^[a-f0-9]{64}$/.test(safe(frame.sha256)) || frame.mimeType !== 'image/png' || !(Number(frame.bytes) > 0)) {
    issue(issues, scope, 'PNG identity is incomplete');
  }
  if (!safe(frame.projectRelativePath).startsWith(`qa-captures/${MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID}/`)) {
    issue(issues, scope, 'archive path is outside the governed effect-route scenario');
  }
  const width = Number(frame.width);
  const height = Number(frame.height);
  if (viewport === 'desktop' && (width < 1280 || height < 720)) issue(issues, scope, 'desktop capture is below 1280x720');
  if (viewport === 'mobile' && (width !== 667 || height !== 375)) issue(issues, scope, 'mobile capture must be exactly 667x375');
  if (viewport === 'mini' && (width !== 400 || height !== 250)) issue(issues, scope, 'mini capture must be exactly 400x250');
  const metrics = frame.visualMetrics || {};
  if (metrics.format !== 'stake-studio-png-visual-metrics-v1'
    || metrics.authority !== 'server-decoded-png'
    || Number(metrics.sampleCount) < 4096
    || Number(metrics.alphaCoverage) < 0.1
    || Number(metrics.luminanceRange) < 0.12
    || Number(metrics.luminanceStdDev) < 0.025
    || Number(metrics.entropyBits) < 1.5
    || Number(metrics.colorBucketCount) < 12
    || Number(metrics.nonUniformPixelRatio) < 0.05
    || Number(metrics.edgeDensity) < 0.002
    || !/^[a-f0-9]{64}$/.test(safe(metrics.detailHash))) {
    issue(issues, scope, 'server-decoded PNG richness evidence is missing or blank-like');
  }
}

function validateLayout(layout, routeId, scope, issues) {
  if (!layout || Number(layout.overflowX) > 2 || Number(layout.overflowY) > 2) issue(issues, scope, 'viewport overflows by more than 2px');
  if (layout?.controlsOverlap === true) issue(issues, scope, 'primary controls overlap');
  const dreamfallRoute = ['mysteryStarDreamfallTumble', 'exactMaxTermination'].includes(routeId);
  if (dreamfallRoute && (layout?.dreamfallWorldActive !== true
    || layout?.squareSafeCells !== true
    || layout?.fixedWorldBottomAligned !== true)) {
    issue(issues, scope, 'Dreamfall route is not using its square-safe, bottom-aligned expanding world');
  }
  if (!dreamfallRoute && (layout?.dreamfallWorldActive !== false
    || layout?.dreamfallPersistentHudVisible !== false)) {
    issue(issues, scope, 'ordinary route incorrectly retained the Dreamfall expanding world or persistent HUD');
  }
  const collision = layout?.collisionAreas || {};
  if (Object.values(collision).some(value => Number(value) > 1)) issue(issues, scope, 'HUD, reels, or controls collide');
}

export function createMorpheusEffectRouteCaptureAuthority() {
  const routes = Object.fromEntries(MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES.map(routeId => {
    const trace = traceFor(routeId);
    const motion = proveMorpheusEffectMotionEquivalence(trace.events, trace.routeId);
    const reports = Object.fromEntries(MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES.map(mode => {
      const report = motion.reports[mode];
      const runtime = new MorpheusEffectOrchestrationRuntime({ routeId: trace.routeId, motionMode: mode });
      const checkpointAuthority = [];
      for (const event of trace.events) {
        const command = runtime.dispatch(event);
        const expected = projectionFor(runtime.snapshot().state);
        runtime.acknowledge({ id: command.acknowledgementId, evidence: `authority:${event.index}:${event.type}` });
        checkpointAuthority.push({ expected });
      }
      return [mode, {
        eventHash: report.eventHash,
        boardHash: report.protocolEvidence.boardHash,
        protocolStateHash: report.protocolEvidence.stateHash,
        stateHash: report.stateHash,
        semanticTraceHash: report.semanticTraceHash,
        acknowledgementHash: report.acknowledgementHash,
        acknowledgementIdentityHash: getMorpheusAcknowledgementIdentityHash(report.acknowledgements),
        checkpoints: report.commands.map((command, index) => ({
          index,
          eventType: command.eventType,
          sourceEventHash: command.sourceEventHash,
          semanticCommitHash: command.semanticCommitHash,
          acknowledgementId: command.acknowledgementId,
          motionSuppressed: command.motionSuppressed,
          expected: checkpointAuthority[index].expected,
        })),
      }];
    }));
    return [routeId, {
      routeId,
      contractFingerprint: trace.contractFingerprint,
      eventCount: trace.events.length,
      motionEquivalencePassed: motion.passed,
      reports,
    }];
  }));
  const authority = {
    format: 'morpheus-effect-route-capture-authority-v1',
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    routes,
  };
  authority.fingerprint = hashMorpheusProtocolValue(authority);
  return authority;
}

export function getMorpheusEffectRouteCaptureFingerprint(project = {}) {
  const audioAssets = project.audio?.stingers || {};
  return `morpheus-effect-capture-${hashMorpheusProtocolValue({
    authority: createMorpheusEffectRouteCaptureAuthority().fingerprint,
    motionProfile: project.animation?.runtime?.reducedMotion || null,
    audio: Object.fromEntries(Object.entries(audioAssets)
      .filter(([id]) => id.startsWith('morpheus.audio.'))
      .map(([id, asset]) => [id, {
        sourceFingerprint: asset?.factory?.sourceFingerprint || null,
        approvalStatus: asset?.factory?.approvalStatus || null,
      }])),
  })}`;
}

export function evaluateMorpheusEffectRouteCaptureQA(evidence = {}, project = {}) {
  const issues = [];
  const authority = createMorpheusEffectRouteCaptureAuthority();
  if (evidence.format !== MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT) issue(issues, 'report', 'format is invalid');
  if (evidence.scenarioId !== MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID) issue(issues, 'report', 'scenario id is invalid');
  if (evidence.contractFingerprint !== MORPHEUS_CONTRACT_FINGERPRINT) issue(issues, 'report', 'contract fingerprint drifted');
  if (evidence.authorityFingerprint !== authority.fingerprint) issue(issues, 'report', 'route authority fingerprint drifted');
  if (evidence.fingerprint !== getMorpheusEffectRouteCaptureFingerprint(project)) issue(issues, 'report', 'project evidence fingerprint is stale');
  if (!safe(evidence.runId) || !Number.isFinite(Date.parse(evidence.runAt || ''))) issue(issues, 'report', 'run identity is incomplete');

  const runs = Array.isArray(evidence.runs) ? evidence.runs : [];
  const expectedKeys = MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES.flatMap(routeId => (
    MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES.flatMap(motionMode => (
      MORPHEUS_EFFECT_ROUTE_CAPTURE_VIEWPORTS.map(viewport => keyFor(routeId, motionMode, viewport))
    ))
  ));
  const runMap = new Map();
  for (const run of runs) {
    const key = keyFor(run.routeId, run.motionMode, run.viewport);
    if (runMap.has(key)) issue(issues, key, 'duplicate run');
    runMap.set(key, run);
  }
  for (const key of expectedKeys) if (!runMap.has(key)) issue(issues, key, 'required route/motion/viewport run is missing');
  for (const key of runMap.keys()) if (!expectedKeys.includes(key)) issue(issues, key, 'unexpected route/motion/viewport run');

  let archivedCaptureCount = 0;
  for (const key of expectedKeys) {
    const run = runMap.get(key);
    if (!run) continue;
    const expected = authority.routes[run.routeId]?.reports?.[run.motionMode];
    const scope = key;
    if (!expected) { issue(issues, scope, 'authority record is missing'); continue; }
    for (const field of ['eventHash', 'boardHash', 'protocolStateHash', 'stateHash', 'semanticTraceHash', 'acknowledgementIdentityHash']) {
      if (run[field] !== expected[field]) issue(issues, scope, `${field} differs from authoritative playback`);
    }
    if (!/^[a-f0-9]{8}$/.test(safe(run.acknowledgementHash))) {
      issue(issues, scope, 'live acknowledgement evidence hash is invalid');
    }
    if (run.passed !== true) issue(issues, scope, 'live route did not pass');
    const expectedIndexes = expectedCheckpointIndexes(expected.checkpoints.length, run.motionMode);
    const checkpoints = Array.isArray(run.checkpoints) ? run.checkpoints : [];
    if (checkpoints.length !== expectedIndexes.length) issue(issues, scope, `expected ${expectedIndexes.length} checkpoints, received ${checkpoints.length}`);
    for (const index of expectedIndexes) {
      const expectedCheckpoint = expected.checkpoints[index];
      const checkpoint = checkpoints.find(item => Number(item.eventIndex) === index);
      const checkpointId = `${run.routeId}-${run.motionMode}-${index}-${expectedCheckpoint.eventType}`;
      const checkpointScope = `${scope}:${checkpointId}`;
      if (!checkpoint) { issue(issues, checkpointScope, 'checkpoint is missing'); continue; }
      if (checkpoint.eventType !== expectedCheckpoint.eventType
        || checkpoint.sourceEventHash !== expectedCheckpoint.sourceEventHash
        || checkpoint.semanticCommitHash !== expectedCheckpoint.semanticCommitHash) {
        issue(issues, checkpointScope, 'source event or semantic commit drifted');
      }
      const boardCommitted = expected.checkpoints.slice(0, index + 1).some(item => item.eventType === 'reveal');
      if (boardCommitted) {
        if (checkpoint.boardAuthority !== 'authoritative-reveal-or-later'
          || checkpoint.observationPassed !== true
          || checkpoint.expected?.boardHash !== expectedCheckpoint.expected.boardHash
          || checkpoint.expected?.stateHash !== expectedCheckpoint.expected.stateHash
          || checkpoint.expected?.boardHash !== checkpoint.observed?.boardHash
          || checkpoint.expected?.stateHash !== checkpoint.observed?.stateHash) {
          issue(issues, checkpointScope, 'rendered board/HUD state differs from runtime authority');
        }
      } else if (checkpoint.boardAuthority !== 'uncommitted-pre-reveal'
        || checkpoint.observationPassed !== true
        || checkpoint.preRevealPresentation?.format !== 'morpheus-pre-reveal-presentation-v1'
        || checkpoint.preRevealPresentation?.boardAuthority !== 'uncommitted'
        || checkpoint.preRevealPresentation?.eventType !== expectedCheckpoint.eventType
        || checkpoint.preRevealPresentation?.visiblyDeclared !== true
        || !safe(checkpoint.preRevealPresentation?.mechanicText)) {
        issue(issues, checkpointScope, 'pre-reveal declaration was not visibly presented without committing a board');
      }
      if (checkpoint.nextEventBlockedBeforeAck !== true || checkpoint.blockingProof?.blocked !== true) {
        issue(issues, checkpointScope, 'next event was not actively rejected before acknowledgement');
      }
      if (checkpoint.acknowledgement?.id !== expectedCheckpoint.acknowledgementId
        || !safe(checkpoint.acknowledgement?.evidence)
        || !/^[a-f0-9]{8}$/.test(safe(checkpoint.acknowledgement?.receiptHash))) {
        issue(issues, checkpointScope, 'acknowledgement receipt is invalid');
      }
      if (checkpoint.audioReceipt?.format !== 'stake-studio-audio-playback-receipt-v1') {
        issue(issues, checkpointScope, 'audio decision has no playback receipt');
      }
      const noMotion = run.motionMode === 'none';
      if (Boolean(checkpoint.motion?.suppressed) !== noMotion) issue(issues, checkpointScope, 'motion suppression policy differs from the requested mode');
      if (noMotion && (Number(checkpoint.motion?.activeBlockingEffects) !== 0
        || Number(checkpoint.motion?.activePresentationTweens) !== 0)) {
        issue(issues, checkpointScope, 'no-motion checkpoint still has active route motion');
      }
      if (run.routeId === 'tricksterGridSettlement' && boardCommitted) {
        const grid = checkpoint.positionGridLayout;
        if (grid?.format !== 'morpheus-position-grid-layout-proof-v1'
          || grid.mode !== 'trickster_dream'
          || grid.passed !== true
          || Number(grid.requiredCount) !== 24
          || Number(grid.plateCount) !== 24
          || Number(grid.uniqueCellCount) !== 24
          || Number(grid.uniqueCoordinateCount) !== 24
          || (grid.overlaps || []).length !== 0
          || (grid.plates || []).length !== 24
          || (grid.plates || []).some(plate => plate.position !== 'absolute'
            || plate.valuePosition !== 'absolute'
            || Number(plate.rect?.width) < 12 || Number(plate.rect?.height) < 12
            || Number(plate.valueRect?.width) <= 0 || Number(plate.valueRect?.height) <= 0)) {
          issue(issues, checkpointScope, 'Trickster position grid is not visibly anchored one plate per cell');
        }
      }
      validateLayout(checkpoint.layout, run.routeId, checkpointScope, issues);
      validateFrame(checkpoint.frame, checkpointScope, run.viewport, checkpointId, issues);
      if (boardCommitted) validateRenderedCellRecognition(checkpoint.frame, expectedCheckpoint.expected, checkpointScope, issues);
      else if (checkpoint.frame?.renderedCellRecognition || checkpoint.frame?.staticIdentityRecognition) {
        issue(issues, checkpointScope, 'pre-reveal declaration must not claim authoritative symbol recognition');
      }
      if (checkpoint.frame?.archived === true) archivedCaptureCount += 1;
    }
  }

  const expectedCaptureCount = MORPHEUS_EFFECT_ROUTE_CAPTURE_VIEWPORTS.length * (
    MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES.reduce((sum, routeId) => sum + authority.routes[routeId].eventCount, 0)
    + MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES.length * (MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES.length - 1)
  );
  if (archivedCaptureCount !== expectedCaptureCount) issue(issues, 'report', `expected ${expectedCaptureCount} archived captures, received ${archivedCaptureCount}`);
  const passed = issues.length === 0;
  return {
    format: MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
    scenarioId: MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID,
    passed,
    issues,
    expectedRunCount: expectedKeys.length,
    runCount: runs.length,
    expectedCaptureCount,
    archivedCaptureCount,
    authorityFingerprint: authority.fingerprint,
    fingerprint: getMorpheusEffectRouteCaptureFingerprint(project),
  };
}

export function recordMorpheusEffectRouteCaptureQA(project, evidence) {
  const evaluation = evaluateMorpheusEffectRouteCaptureQA(evidence, project);
  const compactEvidence = compactMorpheusEffectRouteCaptureEvidence(evidence);
  project.production = project.production || {};
  project.production.qa = project.production.qa || {};
  project.production.qa.morpheusEffectRouteCaptureAudit = {
    ...compactEvidence,
    passed: evaluation.passed,
    issues: evaluation.issues,
    expectedRunCount: evaluation.expectedRunCount,
    runCount: evaluation.runCount,
    expectedCaptureCount: evaluation.expectedCaptureCount,
    archivedCaptureCount: evaluation.archivedCaptureCount,
  };
  return evaluation;
}

export function getMorpheusEffectRouteCaptureSummary(project = {}) {
  const report = project.production?.qa?.morpheusEffectRouteCaptureAudit || null;
  const fingerprint = getMorpheusEffectRouteCaptureFingerprint(project);
  const fresh = Boolean(report?.format === MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT
    && report.fingerprint === fingerprint);
  const evaluation = report ? evaluateMorpheusEffectRouteCaptureQA(report, project) : null;
  return {
    format: MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && evaluation?.passed),
    passed: Boolean(fresh && evaluation?.passed),
    runAt: fresh ? report.runAt || null : null,
    runCount: fresh ? evaluation?.runCount || 0 : 0,
    expectedRunCount: evaluation?.expectedRunCount || 24,
    archivedCaptureCount: fresh ? evaluation?.archivedCaptureCount || 0 : 0,
    expectedCaptureCount: evaluation?.expectedCaptureCount || 57,
    issues: evaluation?.issues || (report ? ['Stored effect-route evidence is stale.'] : ['No effect-route capture evidence.']),
  };
}
