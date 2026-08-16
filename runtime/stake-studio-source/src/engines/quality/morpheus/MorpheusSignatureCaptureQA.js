import { getPerformanceFingerprint } from '../PerformanceProfiler.js';
import { getReplayFingerprint } from '../ReplayMatrixQA.js';
import { getViewportLayoutFingerprint } from '../ViewportLayoutQA.js';
import { proveMorpheusDreamfallMotionEquivalence } from '../../presentation/morpheus/MorpheusDreamfallRuntime.js';
import {
  MORPHEUS_DREAMFALL_RENDER_PROFILE,
  MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT,
} from '../../presentation/morpheus/MorpheusDreamfallRenderProfile.js';
import { buildMorpheusV2AuthoritativeQAFixture } from './MorpheusV2AuthoritativeQAAdapter.js';

export const MORPHEUS_SIGNATURE_CAPTURE_FORMAT = 'morpheus-dreamfall-signature-capture-qa-v3';
export const MORPHEUS_SIGNATURE_SCENARIO_ID = 'morpheus-dreamfall-signature-v2';
export const MORPHEUS_SIGNATURE_VIEWPORTS = Object.freeze(['desktop', 'mobile', 'mini']);

export const MORPHEUS_SIGNATURE_CHECKPOINTS = Object.freeze([
  Object.freeze({ id: 'authoritative-reveal', eventIndex: 0, eventType: 'reveal', acknowledgementEvidence: 'authoritative-board-landed' }),
  Object.freeze({ id: 'positive-win-visible', eventIndex: 1, eventType: 'winInfo', acknowledgementEvidence: 'settled-positive-win-shown' }),
  Object.freeze({ id: 'reel-growth-visible', eventIndex: 2, eventType: 'expandReelHeight', acknowledgementEvidence: 'mask-cap-animation-finished' }),
  Object.freeze({ id: 'fifth-hit-award-visible', eventIndex: 4, eventType: 'awardTumbleFreeSpins', acknowledgementEvidence: 'tumble-free-spin-award-read' }),
  Object.freeze({ id: 'acknowledged-tumble', eventIndex: 5, eventType: 'tumbleBoard', acknowledgementEvidence: 'tumble-settled' }),
]);

const REQUIRED_HUD_FIELDS = Object.freeze([
  'chainHit', 'freeSpinsRemaining', 'awardedFreeSpins', 'runningWin', 'reelRows',
]);

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const clean = value => String(value ?? '').trim();
const finite = value => Number.isFinite(Number(value));
const hashPattern = /^[0-9a-f]{8}$/i;
const shaPattern = /^[0-9a-f]{64}$/i;
const perceptualHashPattern = /^[0-9a-f]{16}$/i;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hashValue(value) {
  return hashText(JSON.stringify(canonicalize(value)));
}

function equal(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function expectedAuthority() {
  const fixture = buildMorpheusV2AuthoritativeQAFixture();
  const motion = proveMorpheusDreamfallMotionEquivalence(fixture.signatureSlice.events);
  return {
    sourceContractFingerprint: fixture.contract.sourceContractFingerprint,
    protocolEventHash: fixture.signatureSlice.sourceEvidence.protocolEventHash,
    protocolBoardHash: fixture.signatureSlice.sourceEvidence.protocolBoardHash,
    protocolStateHash: fixture.signatureSlice.sourceEvidence.protocolStateHash,
    motionEquivalence: {
      passed: motion.passed,
      stateHash: motion.stateHash,
      semanticTraceHash: motion.semanticTraceHash,
      acknowledgementHash: motion.acknowledgementHash,
    },
    events: fixture.signatureSlice.events,
  };
}

export function getMorpheusSignatureMotionEquivalenceAuthority() {
  return clone(expectedAuthority().motionEquivalence);
}

export function getMorpheusSignatureCaptureFingerprint(project) {
  const authority = expectedAuthority();
  return `morpheus-signature-${hashValue({
    scenarioId: MORPHEUS_SIGNATURE_SCENARIO_ID,
    sourceContractFingerprint: authority.sourceContractFingerprint,
    protocolEventHash: authority.protocolEventHash,
    motionEquivalence: authority.motionEquivalence,
    renderProfile: MORPHEUS_DREAMFALL_RENDER_PROFILE,
    viewport: getViewportLayoutFingerprint(project),
    performance: getPerformanceFingerprint(project),
    replay: getReplayFingerprint(project),
  })}`;
}

function issue(issues, scope, message) {
  issues.push(`${scope}: ${message}`);
}

function validateVisualMetrics(metrics, issues, scope) {
  if (metrics?.format !== 'stake-studio-png-visual-metrics-v1'
    || metrics?.authority !== 'server-decoded-png') {
    issue(issues, scope, 'server-decoded PNG visual metrics are missing');
    return;
  }
  if (Number(metrics.sampleCount) < 4096) issue(issues, scope, 'PNG visual sample contains fewer than 4,096 decoded pixels');
  if (Number(metrics.alphaCoverage) < 0.1) issue(issues, scope, 'PNG is blank or nearly transparent');
  if (Number(metrics.luminanceRange) < 0.12 || Number(metrics.luminanceStdDev) < 0.025) {
    issue(issues, scope, 'PNG luminance is blank or near-blank');
  }
  if (Number(metrics.entropyBits) < 1.5 || Number(metrics.colorBucketCount) < 12
    || Number(metrics.nonUniformPixelRatio) < 0.05) {
    issue(issues, scope, 'PNG decoded-pixel diversity is below the visual-evidence floor');
  }
  if (Number(metrics.edgeDensity) < 0.002) issue(issues, scope, 'PNG contains insufficient rendered-edge evidence');
  if (!perceptualHashPattern.test(clean(metrics.perceptualHash))) issue(issues, scope, 'PNG perceptual hash is missing or invalid');
  if (Number(metrics.detailGridWidth) !== 64 || Number(metrics.detailGridHeight) !== 64
    || !/^[0-9a-f]{8192}$/i.test(clean(metrics.detailLumaGridHex))
    || !shaPattern.test(clean(metrics.detailHash))) {
    issue(issues, scope, 'PNG high-resolution decoded-pixel signature is missing or invalid');
  }
}

function validateArchiveFrame(frame, viewport, checkpointId, issues, scope) {
  if (!frame || frame.archived !== true) issue(issues, scope, 'PNG is not confirmed in the immutable archive');
  if (frame?.format !== 'stake-studio-immutable-qa-capture-v1') issue(issues, scope, 'archive receipt format is missing or invalid');
  if (!shaPattern.test(clean(frame?.sha256))) issue(issues, scope, 'PNG SHA-256 is missing or invalid');
  const path = clean(frame?.path || frame?.projectRelativePath);
  if (!/^qa-captures\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+-[0-9a-f]{12}\.png$/i.test(path)) {
    issue(issues, scope, 'PNG path is not a safe project-scoped content-addressed archive path');
  }
  const expectedSuffix = `/${viewport}/${checkpointId}-${clean(frame?.sha256).slice(0, 12)}.png`;
  if (!path.endsWith(expectedSuffix)) issue(issues, scope, 'PNG path does not bind this checkpoint to its SHA-256');
  if (frame?.mimeType !== 'image/png') issue(issues, scope, 'capture MIME type is not image/png');
  if (!(Number(frame?.width) > 0 && Number(frame?.height) > 0 && Number(frame?.bytes) > 8)) issue(issues, scope, 'capture dimensions or byte count are invalid');
  if (clean(frame?.viewport) !== viewport || clean(frame?.checkpointId) !== checkpointId) issue(issues, scope, 'archive metadata does not identify this viewport/checkpoint');
  if (!Number.isFinite(Date.parse(frame?.capturedAt || ''))) issue(issues, scope, 'capture timestamp is invalid');
  validateVisualMetrics(frame?.visualMetrics, issues, scope);
}

function validateSemanticFrameDiversity(run, viewport, issues) {
  const checkpoints = run?.checkpoints || [];
  const scope = `${viewport}/semantic-frame-diversity`;
  const shaValues = checkpoints.map(checkpoint => clean(checkpoint?.frame?.sha256));
  if (shaValues.length !== MORPHEUS_SIGNATURE_CHECKPOINTS.length
    || new Set(shaValues).size !== MORPHEUS_SIGNATURE_CHECKPOINTS.length) {
    issue(issues, scope, 'each semantic checkpoint must contain different decoded PNG pixels');
  }
  const grids = checkpoints.map(checkpoint => clean(checkpoint?.frame?.visualMetrics?.detailLumaGridHex));
  if (!grids.every(value => /^[0-9a-f]{8192}$/i.test(value))) return;
  for (let index = 1; index < grids.length; index++) {
    let changed = 0;
    let totalDelta = 0;
    for (let offset = 0; offset < grids[index].length; offset += 2) {
      const before = Number.parseInt(grids[index - 1].slice(offset, offset + 2), 16);
      const after = Number.parseInt(grids[index].slice(offset, offset + 2), 16);
      const delta = Math.abs(after - before);
      if (delta >= 3) changed++;
      totalDelta += delta;
    }
    const changedPixelRatio = changed / 4096;
    const meanLuminanceDelta = totalDelta / (4096 * 255);
    if (changedPixelRatio < 0.001 || meanLuminanceDelta < 0.0001) {
      issue(issues, scope, `${checkpoints[index - 1]?.id} → ${checkpoints[index]?.id} lacks decoded-pixel change evidence`);
    }
  }
}

function rect(value = {}) {
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function outside(value, width, height, tolerance = 2) {
  const item = rect(value);
  return ![item.x, item.y, item.width, item.height].every(Number.isFinite)
    || item.width <= 0 || item.height <= 0 || item.x < -tolerance || item.y < -tolerance
    || item.right > width + tolerance || item.bottom > height + tolerance;
}

function validateLayout(layout, viewport, issues, scope, { maxGrowth = false } = {}) {
  const width = Number(layout?.viewportWidth);
  const height = Number(layout?.viewportHeight);
  if (viewport === 'desktop' && (!(width >= 1280) || !(height >= 720))) issue(issues, scope, 'desktop viewport is below 1280×720');
  if (viewport === 'mobile' && (width !== 667 || height !== 375)) issue(issues, scope, 'mobile viewport must be exactly 667×375');
  if (viewport === 'mini' && (width !== 400 || height !== 250)) issue(issues, scope, 'mini viewport must be exactly 400×250');
  if (Number(layout?.overflowX) > 2 || Number(layout?.overflowY) > 2) issue(issues, scope, 'viewport exceeds the 2px overflow tolerance');
  for (const key of ['stage', 'reels', 'hud']) if (outside(layout?.[key], width, height)) issue(issues, scope, `${key} is cropped or outside the viewport`);
  if (Number(layout?.spin?.width) < 44 || Number(layout?.spin?.height) < 44) issue(issues, scope, 'spin control is below 44×44px');
  if (Number(layout?.hudLabelFontPx) < 7 || Number(layout?.hudValueFontPx) < 11) issue(issues, scope, 'HUD type is below the 7px/11px floor');
  if (layout?.controlsOverlap !== false) issue(issues, scope, 'HUD controls overlap');
  const collisions = layout?.collisionAreas || {};
  for (const [name, area] of Object.entries(collisions)) if (Number(area) > 1) issue(issues, scope, `${name} collision exceeds 1px²`);
  for (const field of REQUIRED_HUD_FIELDS) if (!layout?.visibleHudFields?.includes(field)) issue(issues, scope, `persistent HUD field ${field} is not visibly measured`);
  if (layout?.squareSafeCells !== true) issue(issues, scope, 'Dreamfall cells are not measured as square-safe');
  if (layout?.motionAspectPreserved !== true) issue(issues, scope, 'Dreamfall motion overlays do not preserve their authored aspect');
  const ratios = layout?.renderAspectRatios || {};
  if (!Array.isArray(ratios.cells) || !ratios.cells.length
    || ratios.cells.some(value => !finite(value) || Math.abs(Number(value) - 1) > 0.015)) {
    issue(issues, scope, 'Dreamfall rendered-cell aspect evidence is missing or distorted');
  }
  if (!Array.isArray(ratios.content) || !ratios.content.length
    || !Array.isArray(ratios.motion) || !ratios.motion.length) {
    issue(issues, scope, 'Dreamfall content/motion aspect measurements are missing');
  }
  if (maxGrowth) {
    if (layout?.coordinateCells !== 48) issue(issues, scope, 'max-growth world does not expose all 48 coordinate cells');
    if (layout?.fixedWorldBottomAligned !== true) issue(issues, scope, 'max-growth reels are not bottom-aligned in the fixed world');
  }
}

function validatePerformance(performance, project, issues, scope) {
  const targetFps = Math.max(30, Number(project.production?.budgets?.targetFps) || 60);
  const frameBudget = 1000 / targetFps;
  const textureBudget = Math.max(1, Number(project.production?.budgets?.maxTextureMemoryMb) || 96) * 1024 * 1024;
  const frames = Number(performance?.frames);
  if (clean(performance?.peakState?.scenarioId) !== MORPHEUS_SIGNATURE_SCENARIO_ID) {
    issue(issues, scope, `peak-state sample is not bound to ${MORPHEUS_SIGNATURE_SCENARIO_ID}`);
  }
  if (!equal(performance?.peakState?.reelRows, [8, 8, 8, 8, 8, 8])) {
    issue(issues, scope, 'performance sample was not measured at the six-reel 8-row peak state');
  }
  if (!(frames >= 48)) issue(issues, scope, 'peak-state performance sample has fewer than 48 frames');
  if (Number(performance?.averageMs) > frameBudget * 1.25) issue(issues, scope, 'average frame time exceeds the scenario budget');
  if (Number(performance?.p95Ms) > frameBudget * 2) issue(issues, scope, 'p95 frame time exceeds the scenario budget');
  if (frames > 0 && Number(performance?.longFrames) / frames > 0.1) issue(issues, scope, 'more than 10% of frames exceed twice the frame budget');
  if (Number(performance?.textureMemoryBytes) > textureBudget) issue(issues, scope, 'texture memory exceeds the configured budget');
}

function validateCheckpoint(checkpoint, definition, viewport, authority, issues) {
  const scope = `${viewport}/${definition.id}`;
  if (!checkpoint) { issue(issues, scope, 'checkpoint is missing'); return; }
  if (clean(checkpoint.id) !== definition.id || Number(checkpoint.eventIndex) !== definition.eventIndex
    || clean(checkpoint.eventType) !== definition.eventType) issue(issues, scope, 'event identity differs from the approved checkpoint');
  const expectedEventHash = hashValue(authority.events[definition.eventIndex]);
  if (clean(checkpoint.sourceEventHash) !== expectedEventHash) issue(issues, scope, `source event hash does not equal ${expectedEventHash}`);
  if (!hashPattern.test(clean(checkpoint.semanticHash))) issue(issues, scope, 'presentation semantic hash is missing');
  for (const key of ['boardHash', 'stateHash']) {
    if (!hashPattern.test(clean(checkpoint.expected?.[key])) || clean(checkpoint.expected?.[key]) !== clean(checkpoint.observed?.[key])) {
      issue(issues, scope, `${key} does not match the authoritative expected value`);
    }
  }
  if (!equal(checkpoint.expected?.reelRows, checkpoint.observed?.reelRows)
    || checkpoint.expected?.reelRows?.length !== 6) issue(issues, scope, 'observed reel rows differ from the authoritative state');
  if (!equal(checkpoint.expected?.hud, checkpoint.observed?.hud)) issue(issues, scope, 'observed persistent HUD differs from the authoritative state');
  if (checkpoint.nextEventBlockedBeforeAck !== true) issue(issues, scope, 'blocking work did not prove the next event was held');
  if (clean(checkpoint.acknowledgement?.evidence) !== definition.acknowledgementEvidence
    || !hashPattern.test(clean(checkpoint.acknowledgement?.receiptHash))) issue(issues, scope, 'acknowledgement evidence/receipt is missing or incorrect');
  if (definition.id === 'acknowledged-tumble'
    && clean(checkpoint.acknowledgement?.id) !== 'ack:morpheus:signature:dreamfall:tumble-5') issue(issues, scope, 'authoritative tumble acknowledgement ID differs');
  validateArchiveFrame(checkpoint.frame, viewport, definition.id, issues, scope);
  validateLayout(checkpoint.layout, viewport, issues, scope);
  if (Number(checkpoint.frame?.width) !== Number(checkpoint.layout?.viewportWidth)
    || Number(checkpoint.frame?.height) !== Number(checkpoint.layout?.viewportHeight)) {
    issue(issues, scope, 'archived PNG dimensions differ from the measured viewport');
  }
}

function validateMiniMaxGrowth(value, issues) {
  const scope = 'mini/mini-max-growth-8-row';
  if (!value) { issue(issues, scope, 'stress checkpoint is missing'); return; }
  if (!equal(value.reelRows, [8, 8, 8, 8, 8, 8])) issue(issues, scope, 'reel rows are not exactly 8/8/8/8/8/8');
  validateArchiveFrame(value.frame, 'mini', 'mini-max-growth-8-row', issues, scope);
  const visibility = value.frame?.visibilityProof;
  if (visibility?.format !== 'morpheus-max-growth-visibility-proof-v1') {
    issue(issues, scope, 'max-growth visibility proof format is missing or invalid');
  }
  if (visibility?.passed !== true || Number(visibility?.requiredCount) !== 48
    || Number(visibility?.cellCount) !== 48 || Number(visibility?.visiblyUnoccludedCellCount) !== 48) {
    issue(issues, scope, 'max-growth visibility proof does not establish all 48 unoccluded cells');
  }
  if (!Array.isArray(visibility?.blockingOverlays) || visibility.blockingOverlays.length !== 0) {
    issue(issues, scope, 'max-growth visibility proof contains a blocking overlay');
  }
  const visibilityCells = Array.isArray(visibility?.cells) ? visibility.cells : [];
  if (visibilityCells.length !== 48 || visibilityCells.some(cell => cell?.painted !== true
    || cell?.insideViewport !== true || cell?.targetHit !== true || cell?.visiblyUnoccluded !== true
    || !Array.isArray(cell?.occludedBy) || cell.occludedBy.length !== 0)) {
    issue(issues, scope, 'max-growth visibility proof contains a hidden, clipped, or occluded cell');
  }
  validateLayout(value.layout, 'mini', issues, scope, { maxGrowth: true });
  if (Number(value.frame?.width) !== Number(value.layout?.viewportWidth)
    || Number(value.frame?.height) !== Number(value.layout?.viewportHeight)) {
    issue(issues, scope, 'archived PNG dimensions differ from the measured viewport');
  }
  const cells = Array.isArray(value.cells) ? value.cells : [];
  if (cells.length !== 48) issue(issues, scope, `expected 48 authored cell measurements, received ${cells.length}`);
  for (const [index, cell] of cells.entries()) {
    const cellScope = `${scope}/cell-${index}`;
    if (!clean(cell.expectedSymbol) || clean(cell.expectedSymbol) !== clean(cell.renderedSymbol)) issue(issues, cellScope, 'rendered symbol identity differs');
    if (!clean(cell.expectedSourceFingerprint) || clean(cell.expectedSourceFingerprint) !== clean(cell.renderedSourceFingerprint)) issue(issues, cellScope, 'rendered source fingerprint differs');
    if (cell.decoded !== true || cell.painted !== true) issue(issues, cellScope, 'authored asset is not decoded and painted');
    if (Number(cell.paintedWidth) < 16 || Number(cell.paintedHeight) < 16) issue(issues, cellScope, 'painted symbol is below 16×16px');
    if (Number(cell.foregroundCoverage) < 0.18) issue(issues, cellScope, 'foreground coverage is below 18%');
    if (Number(cell.luminanceSeparation) < 0.08) issue(issues, cellScope, 'local luminance separation is below 0.08');
    if (cell.edgeClipped !== false) issue(issues, cellScope, 'symbol pixels touch a clipping edge');
  }
  if (value.pairwiseFamilyHashesDistinct !== true) issue(issues, scope, 'displayed symbol-family perceptual hashes are not distinct');
  if (value.renderProfileFormat !== MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT) {
    issue(issues, scope, `render profile must be ${MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT}`);
  }
  if (value.renderAspectIntegrityPassed !== true) issue(issues, scope, 'max-growth static/motion aspect integrity did not pass');
  if (value.grownRowMotionCoveragePassed !== true || Number(value.motionFlipbookCellCount) !== 48) {
    issue(issues, scope, 'all 48 cells, including grown rows 5–8, do not have motion coverage');
  }
  for (const [index, cell] of cells.entries()) {
    const cellScope = `${scope}/cell-${index}`;
    if (cell.renderAspectPassed !== true || cell.motionRendered !== true) {
      issue(issues, cellScope, 'render aspect or motion coverage proof is missing');
    }
    if (![cell.cellAspectRatio, cell.contentAspectRatio, cell.contentSourceAspectRatio,
      cell.motionAspectRatio, cell.motionSourceAspectRatio].every(finite)) {
      issue(issues, cellScope, 'intrinsic/content/motion aspect measurements are incomplete');
      continue;
    }
    if (Math.abs(Number(cell.cellAspectRatio) - 1) > 0.015
      || Math.abs(Number(cell.contentAspectRatio) / Number(cell.contentSourceAspectRatio) - 1) > 0.015
      || Math.abs(Number(cell.motionAspectRatio) / Number(cell.motionSourceAspectRatio) - 1) > 0.015) {
      issue(issues, cellScope, 'cell, static content, or motion overlay is non-uniformly scaled');
    }
  }
}

export function evaluateMorpheusSignatureCaptureEvidence(project, evidence = {}) {
  const issues = [];
  const authority = expectedAuthority();
  const fingerprint = getMorpheusSignatureCaptureFingerprint(project);
  if (evidence.format !== MORPHEUS_SIGNATURE_CAPTURE_FORMAT) issue(issues, 'report', `format must be ${MORPHEUS_SIGNATURE_CAPTURE_FORMAT}`);
  if (clean(evidence.scenarioId) !== MORPHEUS_SIGNATURE_SCENARIO_ID) issue(issues, 'report', `scenarioId must be ${MORPHEUS_SIGNATURE_SCENARIO_ID}`);
  if (clean(evidence.fingerprint) !== fingerprint) issue(issues, 'report', 'project/capture fingerprint is stale or missing');
  if (clean(evidence.sourceContractFingerprint) !== authority.sourceContractFingerprint) issue(issues, 'report', 'source contract fingerprint differs from the authoritative registry');
  for (const key of ['protocolEventHash', 'protocolBoardHash', 'protocolStateHash']) {
    if (clean(evidence.protocol?.[key]) !== authority[key]) issue(issues, 'report', `${key} differs from the authoritative trace`);
  }
  const motion = evidence.motionEquivalence || {};
  if (motion.passed !== true || authority.motionEquivalence.passed !== true
    || !['stateHash', 'semanticTraceHash', 'acknowledgementHash']
      .every(key => clean(motion[key]) === authority.motionEquivalence[key])) {
    issue(issues, 'report', 'normal/fast/reduced semantic motion equivalence differs from the authoritative runtime proof');
  }
  const viewportRuns = Array.isArray(evidence.viewportRuns) ? evidence.viewportRuns : [];
  const viewportNames = viewportRuns.map(run => clean(run?.viewport));
  if (viewportRuns.length !== MORPHEUS_SIGNATURE_VIEWPORTS.length
    || new Set(viewportNames).size !== MORPHEUS_SIGNATURE_VIEWPORTS.length
    || !MORPHEUS_SIGNATURE_VIEWPORTS.every(viewport => viewportNames.includes(viewport))) {
    issue(issues, 'report', 'viewport runs must contain exactly one desktop, mobile, and mini run');
  }
  for (const viewport of MORPHEUS_SIGNATURE_VIEWPORTS) {
    const run = viewportRuns.find(item => item.viewport === viewport);
    if (!run) { issue(issues, viewport, 'viewport run is missing'); continue; }
    const checkpointIds = (run.checkpoints || []).map(checkpoint => clean(checkpoint?.id));
    if (checkpointIds.length !== MORPHEUS_SIGNATURE_CHECKPOINTS.length
      || new Set(checkpointIds).size !== MORPHEUS_SIGNATURE_CHECKPOINTS.length
      || !MORPHEUS_SIGNATURE_CHECKPOINTS.every(definition => checkpointIds.includes(definition.id))) {
      issue(issues, viewport, 'checkpoint set must contain exactly the five approved semantic checkpoints');
    }
    for (const definition of MORPHEUS_SIGNATURE_CHECKPOINTS) {
      validateCheckpoint((run.checkpoints || []).find(item => item.id === definition.id), definition, viewport, authority, issues);
    }
    validateSemanticFrameDiversity(run, viewport, issues);
    validatePerformance(run.performance, project, issues, `${viewport}/peak-performance`);
    if (viewport === 'mini') validateMiniMaxGrowth(run.maxGrowth, issues);
  }
  const coreCaptureCount = viewportRuns.reduce((sum, run) => sum + (run.checkpoints || []).length, 0);
  const archivedCaptureCount = viewportRuns.reduce((sum, run) => sum
    + (run.checkpoints || []).filter(item => item.frame?.archived === true).length
    + (run.maxGrowth?.frame?.archived === true ? 1 : 0), 0);
  const frontendIssues = issues.filter(value => !value.startsWith('report: normal/fast/reduced'));
  const frontendPassed = frontendIssues.length === 0 && coreCaptureCount === 15 && archivedCaptureCount === 16;
  const presentationPassed = issues.length === 0 && frontendPassed;
  return {
    format: MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
    fingerprint,
    evidenceHash: hashValue({ ...evidence, passed: undefined, frontendPassed: undefined, presentationPassed: undefined, issues: undefined }),
    passed: frontendPassed && presentationPassed,
    frontendPassed,
    presentationPassed,
    issues: [...new Set(issues)],
    coreCaptureCount,
    archivedCaptureCount,
    viewportRuns: clone(viewportRuns),
  };
}

export function recordMorpheusSignatureCaptureQA(project, evidence = {}) {
  project.production ||= {};
  project.production.qa ||= {};
  const evaluation = evaluateMorpheusSignatureCaptureEvidence(project, evidence);
  const report = {
    ...clone(evidence),
    format: MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
    scenarioId: MORPHEUS_SIGNATURE_SCENARIO_ID,
    fingerprint: evaluation.fingerprint,
    evidenceHash: evaluation.evidenceHash,
    runAt: evidence.runAt || new Date().toISOString(),
    passed: evaluation.passed,
    frontendPassed: evaluation.frontendPassed,
    presentationPassed: evaluation.presentationPassed,
    issues: evaluation.issues,
    coreCaptureCount: evaluation.coreCaptureCount,
    archivedCaptureCount: evaluation.archivedCaptureCount,
  };
  project.production.qa.morpheusSignatureCaptureAudit = report;
  return getMorpheusSignatureCaptureSummary(project);
}

export function getMorpheusSignatureCaptureSummary(project) {
  const report = project.production?.qa?.morpheusSignatureCaptureAudit || null;
  const fingerprint = getMorpheusSignatureCaptureFingerprint(project);
  const fresh = Boolean(report?.format === MORPHEUS_SIGNATURE_CAPTURE_FORMAT && report.fingerprint === fingerprint);
  const evaluation = fresh ? evaluateMorpheusSignatureCaptureEvidence(project, report) : null;
  return {
    format: MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
    scenarioId: MORPHEUS_SIGNATURE_SCENARIO_ID,
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    evidenceHash: fresh ? report.evidenceHash || evaluation?.evidenceHash || null : null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && evaluation?.passed && report.passed),
    frontendComplete: Boolean(fresh && evaluation?.frontendPassed && report.frontendPassed),
    presentationComplete: Boolean(fresh && evaluation?.presentationPassed && report.presentationPassed),
    coreCaptureCount: fresh ? evaluation?.coreCaptureCount || 0 : 0,
    archivedCaptureCount: fresh ? evaluation?.archivedCaptureCount || 0 : 0,
    issues: fresh ? evaluation?.issues || [] : [],
    runAt: fresh ? report.runAt || null : null,
  };
}
