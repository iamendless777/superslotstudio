import { ensureProductionWorkflow } from '../factory/FlagshipWorkflow.js';
import { MathEngine } from '../math/MathEngine.js';
import { SeededRNG } from '../math/SeededRNG.js';
import {
  MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
  MORPHEUS_SIGNATURE_SCENARIO_ID,
  getMorpheusSignatureCaptureSummary,
} from './morpheus/MorpheusSignatureCaptureQA.js';
import {
  MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
  MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES,
  getMorpheusEffectRouteCaptureSummary,
} from './morpheus/MorpheusEffectRouteCaptureQA.js';

export const FLAGSHIP_SCENARIO_FORMAT = 'stake-studio-flagship-scenario-v1';
export const FLAGSHIP_SCENARIO_RUN_FORMAT = 'stake-studio-flagship-scenario-run-v1';

const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const strings = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const clone = value => JSON.parse(JSON.stringify(value));

function normalizeScenario(input = {}) {
  return {
    format: FLAGSHIP_SCENARIO_FORMAT,
    id: clean(input.id),
    label: clean(input.label || input.id),
    mode: clean(input.mode || 'base'),
    seed: Number.isSafeInteger(Number(input.seed)) ? Number(input.seed) : 1,
    kind: ['signature', 'mechanic', 'interaction', 'edge', 'failure', 'release'].includes(clean(input.kind)) ? clean(input.kind) : 'mechanic',
    mechanics: strings(input.mechanics),
    promises: strings(input.promises),
    expected: {
      eventTypes: strings(input.expected?.eventTypes),
      forbiddenEventTypes: strings(input.expected?.forbiddenEventTypes),
      minNormalizedWin: Number.isFinite(Number(input.expected?.minNormalizedWin)) ? Number(input.expected.minNormalizedWin) : null,
      maxNormalizedWin: Number.isFinite(Number(input.expected?.maxNormalizedWin)) ? Number(input.expected.maxNormalizedWin) : null,
      minFreeSpins: Number.isFinite(Number(input.expected?.minFreeSpins)) ? Number(input.expected.minFreeSpins) : null,
      featureTier: input.expected?.featureTier == null ? null : clean(input.expected.featureTier),
      wincap: input.expected?.wincap == null ? null : Boolean(input.expected.wincap),
      evidenceContract: input.expected?.evidenceContract == null ? null : clean(input.expected.evidenceContract),
      evidenceRouteId: input.expected?.evidenceRouteId == null ? null : clean(input.expected.evidenceRouteId),
      authoritativeSource: input.expected?.authoritativeSource == null ? null : clean(input.expected.authoritativeSource),
    },
    notes: strings(input.notes),
  };
}

export function upsertFlagshipScenario(project, input = {}) {
  const workflow = ensureProductionWorkflow(project, 'flagship');
  if (workflow.track !== 'flagship') throw new Error('Select the Flagship production track before authoring proof scenarios.');
  const scenario = normalizeScenario(input);
  if (!scenario.id) throw new Error('Flagship scenarios require a stable ID.');
  if (!(project.math?.betModes || []).some(mode => mode.name === scenario.mode)
    && scenario.id !== MORPHEUS_SIGNATURE_SCENARIO_ID) throw new Error(`Scenario mode "${scenario.mode}" is not configured.`);
  if (!scenario.mechanics.length && !scenario.promises.length) throw new Error('Flagship scenarios must cover at least one mechanic or vision promise.');
  const index = workflow.scenarioLab.scenarios.findIndex(item => item.id === scenario.id);
  if (index >= 0) workflow.scenarioLab.scenarios[index] = scenario;
  else workflow.scenarioLab.scenarios.push(scenario);
  workflow.updatedAt = new Date().toISOString();
  return clone(scenario);
}

function flattenEvents(round = {}) {
  if (Array.isArray(round.state)) return round.state;
  return (round.spins || []).flatMap(spin => Array.isArray(spin.state) ? spin.state : []);
}

function evaluateExpected(scenario, round, events) {
  const types = events.map(event => clean(event.type));
  const failures = [];
  for (const type of scenario.expected.eventTypes) if (!types.includes(type)) failures.push(`missing event ${type}`);
  for (const type of scenario.expected.forbiddenEventTypes) if (types.includes(type)) failures.push(`forbidden event ${type} occurred`);
  const normalizedWin = Number(round.normalizedWin) || 0;
  if (scenario.expected.minNormalizedWin !== null && normalizedWin < scenario.expected.minNormalizedWin) failures.push(`normalized win ${normalizedWin} below ${scenario.expected.minNormalizedWin}`);
  if (scenario.expected.maxNormalizedWin !== null && normalizedWin > scenario.expected.maxNormalizedWin) failures.push(`normalized win ${normalizedWin} above ${scenario.expected.maxNormalizedWin}`);
  if (scenario.expected.minFreeSpins !== null && Number(round.freeSpinsPlayed || 0) < scenario.expected.minFreeSpins) failures.push(`free spins ${round.freeSpinsPlayed || 0} below ${scenario.expected.minFreeSpins}`);
  if (scenario.expected.featureTier !== null && clean(round.featureTier) !== scenario.expected.featureTier) failures.push(`feature tier ${round.featureTier || 'none'} did not equal ${scenario.expected.featureTier}`);
  if (scenario.expected.wincap !== null && Boolean(round.wincapHit) !== scenario.expected.wincap) failures.push(`wincap ${Boolean(round.wincapHit)} did not equal ${scenario.expected.wincap}`);
  return failures;
}

export function inspectFlagshipEventTimeline(round = {}) {
  const events = flattenEvents(round);
  let lastBoard = null;
  let runningAmount = 0;
  return events.map((event, position) => {
    const beforeBoard = lastBoard;
    if (event.board) lastBoard = clone(event.board);
    if (Number.isFinite(Number(event.amount))) runningAmount = Number(event.amount);
    return {
      position,
      index: Number.isSafeInteger(Number(event.index)) ? Number(event.index) : position,
      type: clean(event.type),
      cause: clean(event.source || event.reason || event.symbol || ''),
      beforeBoard,
      afterBoard: event.board ? clone(event.board) : lastBoard,
      payoutAmount: Number.isFinite(Number(event.amount)) ? Number(event.amount) : null,
      runningAmount,
      affectedPositions: clone(event.positions || event.updates || event.changes || []),
      payload: clone(event),
    };
  });
}

export function runFlagshipScenario(project, scenarioId) {
  const workflow = ensureProductionWorkflow(project);
  const scenario = workflow.scenarioLab.scenarios.find(item => item.id === clean(scenarioId));
  if (!scenario) throw new Error(`Unknown Flagship scenario "${clean(scenarioId)}".`);
  if (scenario.id === MORPHEUS_SIGNATURE_SCENARIO_ID
    || scenario.expected?.evidenceContract === MORPHEUS_SIGNATURE_CAPTURE_FORMAT) {
    const capture = getMorpheusSignatureCaptureSummary(project);
    const failures = capture.complete ? [] : (capture.issues.length
      ? [...capture.issues]
      : ['fresh archived desktop/mobile/mini Morpheus signature capture evidence is missing']);
    const run = {
      format: FLAGSHIP_SCENARIO_RUN_FORMAT,
      scenarioId: scenario.id,
      mode: scenario.mode,
      seed: scenario.seed,
      source: 'authoritative-morpheus-signature-capture',
      evidenceContract: MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
      passed: failures.length === 0,
      failures,
      captureFingerprint: capture.fingerprint,
      captureEvidenceHash: capture.evidenceHash,
      frontendPassed: capture.frontendComplete,
      presentationPassed: capture.presentationComplete,
      coreCaptureCount: capture.coreCaptureCount,
      archivedCaptureCount: capture.archivedCaptureCount,
      eventTypes: ['reveal', 'winInfo', 'expandReelHeight', 'tumbleChainProgress', 'awardTumbleFreeSpins', 'tumbleBoard'],
      timeline: [],
      runAt: new Date().toISOString(),
    };
    workflow.scenarioLab.runs.unshift(run);
    workflow.scenarioLab.runs = workflow.scenarioLab.runs.slice(0, 100);
    workflow.updatedAt = run.runAt;
    return clone(run);
  }
  if (scenario.expected?.evidenceContract === MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT) {
    const summary = getMorpheusEffectRouteCaptureSummary(project);
    const routeId = scenario.expected.evidenceRouteId;
    const report = project.production?.qa?.morpheusEffectRouteCaptureAudit || {};
    const routeRuns = (report.runs || []).filter(item => item.routeId === routeId);
    const expectedRouteRuns = 12;
    const failures = [];
    if (!MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES.includes(routeId)) failures.push(`unknown governed effect route ${routeId || 'none'}`);
    if (!summary.complete) failures.push(...summary.issues);
    if (summary.complete && routeRuns.length !== expectedRouteRuns) failures.push(`route ${routeId} has ${routeRuns.length}/${expectedRouteRuns} governed runs`);
    if (routeRuns.some(item => item.passed !== true)) failures.push(`route ${routeId} contains a failing governed run`);
    const run = {
      format: FLAGSHIP_SCENARIO_RUN_FORMAT,
      scenarioId: scenario.id,
      mode: scenario.mode,
      seed: scenario.seed,
      source: 'authoritative-morpheus-effect-route-capture',
      evidenceContract: MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
      evidenceRouteId: routeId,
      passed: failures.length === 0,
      failures,
      captureFingerprint: summary.fingerprint,
      routeRunCount: routeRuns.length,
      eventTypes: [...scenario.expected.eventTypes],
      timeline: [],
      runAt: new Date().toISOString(),
    };
    workflow.scenarioLab.runs.unshift(run);
    workflow.scenarioLab.runs = workflow.scenarioLab.runs.slice(0, 100);
    workflow.updatedAt = run.runAt;
    return clone(run);
  }
  const rng = new SeededRNG(scenario.seed);
  const engine = new MathEngine(project);
  const round = engine.resolveRound(() => rng.random(), scenario.mode);
  const timeline = inspectFlagshipEventTimeline(round);
  const failures = evaluateExpected(scenario, round, timeline.map(item => item.payload));
  const run = {
    format: FLAGSHIP_SCENARIO_RUN_FORMAT,
    scenarioId: scenario.id,
    mode: scenario.mode,
    seed: scenario.seed,
    passed: failures.length === 0,
    failures,
    normalizedWin: Number(round.normalizedWin) || 0,
    totalWin: Number(round.totalWin) || 0,
    freeSpinsPlayed: Number(round.freeSpinsPlayed) || 0,
    featureTier: round.featureTier || null,
    wincapHit: Boolean(round.wincapHit),
    eventTypes: timeline.map(item => item.type),
    timeline,
    runAt: new Date().toISOString(),
  };
  workflow.scenarioLab.runs.unshift(run);
  workflow.scenarioLab.runs = workflow.scenarioLab.runs.slice(0, 100);
  workflow.updatedAt = run.runAt;
  return clone(run);
}

function mechanicId(value) {
  return clean(typeof value === 'string' ? value : value?.id || value?.name);
}

export function getFlagshipInteractionCoverage(project) {
  const workflow = ensureProductionWorkflow(project);
  const declared = Array.isArray(workflow.architecture.interactionMatrix) ? workflow.architecture.interactionMatrix : [];
  const allowedDispositions = new Set(['allowed', 'required', 'forbidden', 'approved-deferred']);
  const entries = declared.map(item => ({
    id: clean(item.id),
    pair: [mechanicId(item.left), mechanicId(item.right)].sort(),
    disposition: clean(item.disposition || item.status),
  }));
  const validEntries = entries.filter(item => item.pair.every(Boolean) && allowedDispositions.has(item.disposition));
  const required = validEntries.filter(item => ['allowed', 'required'].includes(item.disposition));
  const requiredPairs = required.map(item => item.pair);
  const scenarios = workflow.scenarioLab.scenarios;
  const covered = requiredPairs.filter(pair => scenarios.some(scenario => pair.every(id => scenario.mechanics.includes(id))));
  const undispositioned = entries.filter(item => !item.pair.every(Boolean) || !allowedDispositions.has(item.disposition))
    .map(item => item.id || item.pair.filter(Boolean).join('|') || 'unnamed-interaction');
  const untested = requiredPairs.filter(pair => !covered.some(item => item.join('|') === pair.join('|')));
  const mechanics = new Set(validEntries.flatMap(item => item.pair));
  return {
    mechanics: mechanics.size,
    requiredPairs: requiredPairs.length,
    dispositioned: validEntries.length,
    covered: covered.length,
    undispositioned,
    untested,
    complete: declared.length === 0 || (undispositioned.length === 0 && untested.length === 0),
  };
}

export function getFlagshipScenarioLabSummary(project) {
  const workflow = ensureProductionWorkflow(project);
  const scenarios = workflow.scenarioLab.scenarios;
  const latest = new Map();
  for (const run of workflow.scenarioLab.runs) if (!latest.has(run.scenarioId)) latest.set(run.scenarioId, run);
  const failing = scenarios.filter(scenario => {
    const run = latest.get(scenario.id);
    if (scenario.expected?.evidenceContract === MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT) {
      const capture = getMorpheusEffectRouteCaptureSummary(project);
      return !run?.passed || !capture.complete || run.captureFingerprint !== capture.fingerprint
        || run.evidenceRouteId !== scenario.expected.evidenceRouteId;
    }
    if (scenario.id !== MORPHEUS_SIGNATURE_SCENARIO_ID
      && scenario.expected?.evidenceContract !== MORPHEUS_SIGNATURE_CAPTURE_FORMAT) return !run?.passed;
    const capture = getMorpheusSignatureCaptureSummary(project);
    return !run?.passed || !capture.complete || run.captureFingerprint !== capture.fingerprint
      || run.captureEvidenceHash !== capture.evidenceHash;
  });
  const interactions = getFlagshipInteractionCoverage(project);
  return {
    scenarios: scenarios.length,
    passing: scenarios.length - failing.length,
    failing,
    runs: workflow.scenarioLab.runs.length,
    interactions,
    complete: scenarios.length > 0 && failing.length === 0 && interactions.complete,
  };
}
