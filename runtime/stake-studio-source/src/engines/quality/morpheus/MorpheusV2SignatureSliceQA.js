import {
  MORPHEUS_PROOF_DISCIPLINES,
  createMorpheusV2QAAdapter,
  evaluateMorpheusPromiseAssertionMatrix,
  evaluateMorpheusV2ContractParity,
} from './MorpheusV2ContractParity.js';
import {
  hashRecoveryValue,
  runRecoveryReplaySpike,
} from '../../factory/spikes/RecoveryReplaySpike.js';

export const MORPHEUS_V2_SIGNATURE_SLICE_QA_FORMAT = 'stake-studio-morpheus-v2-signature-slice-qa-v1';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

const equal = (left, right) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
const strings = value => Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];

export function quantizeMorpheusPayout(value, increment = 0.1) {
  const step = Number(increment);
  if (!(step > 0)) throw new Error('Payout increment must be positive.');
  return Number((Math.round((Number(value) + Number.EPSILON) / step) * step).toFixed(10));
}

function checkExactEvents(slice) {
  const actual = Array.isArray(slice.events) ? slice.events : [];
  const expected = Array.isArray(slice.expectedEvents) ? slice.expectedEvents : [];
  const issues = [];
  if (actual.length !== expected.length) issues.push(`Expected ${expected.length} events but received ${actual.length}.`);
  const count = Math.max(actual.length, expected.length);
  for (let index = 0; index < count; index++) {
    if (!equal(actual[index], expected[index])) issues.push(`Event ${index} order or payload differs from the approved fixture.`);
  }
  return { passed: issues.length === 0 && actual.length > 0, issues, actualTypes: actual.map(event => event.type), expectedTypes: expected.map(event => event.type) };
}

function checkSourceFingerprint(contract, slice) {
  const expected = String(contract.sourceContractFingerprint || '').trim();
  if (!expected) return { passed: true, issues: [], expected: null };
  const issues = [];
  if (String(slice.sourceEvidence?.contractFingerprint || '').trim() !== expected) {
    issues.push('Signature source fingerprint does not match the authoritative contract registry.');
  }
  for (const [index, event] of (slice.events || []).entries()) {
    if (String(event.contractFingerprint || '').trim() !== expected) {
      issues.push(`Event ${index} source fingerprint does not match the authoritative contract registry.`);
    }
  }
  return { passed: issues.length === 0, issues, expected };
}

function checkSnapshots(slice, recovery) {
  const issues = [];
  for (const snapshot of slice.boardSnapshots || []) {
    const timeline = recovery.continuous.timeline.find(item => item.eventIndex === Number(snapshot.afterEventIndex));
    const expectedHash = hashRecoveryValue(snapshot.board);
    if (!timeline) issues.push(`Board snapshot ${snapshot.id || snapshot.afterEventIndex} has no matching event.`);
    else if (timeline.boardHash !== expectedHash) issues.push(`Board snapshot ${snapshot.id || snapshot.afterEventIndex} hash differs.`);
  }
  for (const snapshot of slice.stateSnapshots || []) {
    const timeline = recovery.continuous.timeline.find(item => item.eventIndex === Number(snapshot.afterEventIndex));
    const expectedHash = hashRecoveryValue(snapshot.state);
    if (!timeline) issues.push(`State snapshot ${snapshot.id || snapshot.afterEventIndex} has no matching event.`);
    else if (timeline.stateHash !== expectedHash) issues.push(`State snapshot ${snapshot.id || snapshot.afterEventIndex} hash differs.`);
  }
  if (!(slice.boardSnapshots || []).length) issues.push('No deterministic board snapshots are declared.');
  if (!(slice.stateSnapshots || []).length) issues.push('No deterministic state snapshots are declared.');
  return { passed: issues.length === 0, issues };
}

function checkEffectivePay(contract, gameInfo = {}) {
  const disclosure = gameInfo.payDisclosure || {};
  const increment = Number(contract.economics?.payoutIncrement);
  const requiredOrder = ['ways', 'contributingMultipliers', 'cascades', 'modeSettlementScale', 'quantize'];
  const issues = [];
  if (disclosure.showsModeAdjustedPayouts !== true) issues.push('Game Info does not promise mode-adjusted effective payouts.');
  if (Number(disclosure.increment) !== increment) issues.push(`Game Info settlement increment is not ${increment}x.`);
  if (disclosure.rounding !== 'nearest') issues.push('Game Info must disclose nearest-increment settlement rounding.');
  if (!equal(disclosure.settlementOrder, requiredOrder)) issues.push('Game Info settlement order is incomplete or out of order.');
  if (Number(disclosure.maximumWin) !== 100000) issues.push('Game Info does not disclose the exact 100,000x maximum win.');
  const cases = Array.isArray(gameInfo.effectivePayCases) ? gameInfo.effectivePayCases : [];
  if (!cases.length) issues.push('No effective-pay examples are supplied.');
  for (const item of cases) {
    const effective = Number((Number(item.basePayout) * Number(item.modeSettlementScale)).toFixed(10));
    const settled = quantizeMorpheusPayout(effective, increment);
    if (Number(item.effectivePayout) !== effective) issues.push(`${item.id || item.mode || 'pay case'} has an incorrect effective payout.`);
    if (Number(item.settledPayout) !== settled) issues.push(`${item.id || item.mode || 'pay case'} has an incorrect 0.1x settled payout.`);
  }
  const boundaries = Array.isArray(disclosure.roundingExamples) ? disclosure.roundingExamples : [];
  for (const item of boundaries) {
    if (Number(item.settled) !== quantizeMorpheusPayout(item.raw, increment)) issues.push(`Rounding example ${item.raw} is incorrect.`);
  }
  if (boundaries.length < 4) issues.push('At least four boundary rounding examples are required.');
  return { passed: issues.length === 0, issues, cases: clone(cases), boundaries: clone(boundaries) };
}

function exactTrace(trace = {}) {
  const passed = equal(trace.actual, trace.expected) && Array.isArray(trace.actual) && trace.actual.length > 0;
  return { passed, issues: passed ? [] : ['Observed trace does not exactly equal the approved trace.'] };
}

function assertion(id, promiseId, discipline, passed, evidence, fingerprint) {
  return { id, promiseId, discipline, passed: Boolean(passed), evidence: strings(evidence), contractFingerprint: fingerprint };
}

function promiseFor(contract, assertionId) {
  return (contract.promises || []).find(promise => (promise.assertionIds || []).includes(assertionId))?.id || '';
}

export function evaluateMorpheusV2SignatureSlice(input) {
  const adapter = input && typeof input.readSignatureSlice === 'function' ? input : createMorpheusV2QAAdapter(input);
  const parity = evaluateMorpheusV2ContractParity(adapter);
  const contract = parity.contract;
  const artifacts = parity.artifacts;
  const slice = adapter.readSignatureSlice();
  const exactEvents = checkExactEvents(slice);
  const sourceFingerprint = checkSourceFingerprint(contract, slice);
  const recovery = runRecoveryReplaySpike({
    initialBoard: slice.recovery?.initialBoard || [],
    initialState: slice.recovery?.initialState || {},
    events: slice.recovery?.events || slice.events || [],
    reconnectAfter: slice.recovery?.reconnectAfter,
  });
  const snapshots = checkSnapshots(slice, recovery);
  const effectivePay = checkEffectivePay(contract, artifacts.gameInfo || {});
  const frontendTrace = exactTrace(slice.traces?.frontend || {});
  const presentationTrace = exactTrace(slice.traces?.presentation || {});
  const economicsPassed = parity.passed && Number(contract.economics?.maxWin) === 100000
    && Number(contract.economics?.totalExposure) === 50000000
    && Number(contract.economics?.maxBaseBet) === 500;

  const fp = parity.fingerprint;
  const assertionResults = [
    assertion('v2.economics.100000', promiseFor(contract, 'v2.economics.100000'), 'math', economicsPassed,
      [`contract:${fp}`, 'max-win:100000', 'exposure:50000000', 'max-base-bet:500'], fp),
    assertion('v2.events.exact-book', promiseFor(contract, 'v2.events.exact-book'), 'events', exactEvents.passed && sourceFingerprint.passed,
      [`event-order:${exactEvents.actualTypes.join('>')}`, `event-count:${exactEvents.actualTypes.length}`], fp),
    assertion('v2.snapshots.board-state', promiseFor(contract, 'v2.snapshots.board-state'), 'events', snapshots.passed,
      [`board-snapshots:${(slice.boardSnapshots || []).length}`, `state-snapshots:${(slice.stateSnapshots || []).length}`], fp),
    assertion('v2.frontend.trace', promiseFor(contract, 'v2.frontend.trace'), 'frontend', frontendTrace.passed,
      [`frontend-trace:${hashRecoveryValue(slice.traces?.frontend?.actual || [])}`], fp),
    assertion('v2.presentation.trace', promiseFor(contract, 'v2.presentation.trace'), 'presentation', presentationTrace.passed,
      [`presentation-trace:${hashRecoveryValue(slice.traces?.presentation?.actual || [])}`], fp),
    assertion('v2.game-info.effective-pay', promiseFor(contract, 'v2.game-info.effective-pay'), 'gameInfo', effectivePay.passed,
      [`effective-pay-cases:${effectivePay.cases.length}`, `rounding-cases:${effectivePay.boundaries.length}`, 'increment:0.1'], fp),
    assertion('v2.replay.reconnect', promiseFor(contract, 'v2.replay.reconnect'), 'replay', recovery.passed,
      [
        `event:${recovery.continuous.eventHash}`,
        `board:${recovery.continuous.boardHash}`,
        `state:${recovery.continuous.stateHash}`,
        ...(slice.sourceEvidence?.protocolEventHash ? [`protocol-event:${slice.sourceEvidence.protocolEventHash}`] : []),
      ], fp),
  ];
  const promiseMatrix = evaluateMorpheusPromiseAssertionMatrix({ contract, assertions: assertionResults, fingerprint: fp });
  const disciplineProof = {
    math: { passed: economicsPassed, evidence: assertionResults.filter(item => item.discipline === 'math').flatMap(item => item.evidence) },
    events: { passed: exactEvents.passed && sourceFingerprint.passed && snapshots.passed, evidence: assertionResults.filter(item => item.discipline === 'events').flatMap(item => item.evidence) },
    frontend: { passed: frontendTrace.passed, evidence: assertionResults.filter(item => item.discipline === 'frontend').flatMap(item => item.evidence) },
    presentation: { passed: presentationTrace.passed, evidence: assertionResults.filter(item => item.discipline === 'presentation').flatMap(item => item.evidence) },
    gameInfo: { passed: effectivePay.passed, evidence: assertionResults.filter(item => item.discipline === 'gameInfo').flatMap(item => item.evidence) },
    replay: { passed: recovery.passed, evidence: assertionResults.filter(item => item.discipline === 'replay').flatMap(item => item.evidence) },
  };
  const issues = [
    ...parity.issues,
    ...exactEvents.issues,
    ...sourceFingerprint.issues,
    ...snapshots.issues,
    ...effectivePay.issues,
    ...frontendTrace.issues.map(issue => `Frontend: ${issue}`),
    ...presentationTrace.issues.map(issue => `Presentation: ${issue}`),
    ...promiseMatrix.issues,
  ];
  const passed = issues.length === 0 && promiseMatrix.complete
    && MORPHEUS_PROOF_DISCIPLINES.every(discipline => disciplineProof[discipline]?.passed === true);
  const authoritative = adapter.authority === 'authoritative';
  return {
    format: MORPHEUS_V2_SIGNATURE_SLICE_QA_FORMAT,
    passed,
    authoritative,
    releaseReady: passed && authoritative,
    contractFingerprint: fp,
    blockers: authoritative ? [] : ['Signature-slice evidence uses a data-only fixture until the authoritative math/protocol adapter is connected.'],
    issues: [...new Set(issues)],
    parity,
    exactEvents,
    sourceFingerprint,
    snapshots,
    effectivePay,
    recovery,
    sourceEvidence: clone(slice.sourceEvidence || {}),
    traces: { frontend: frontendTrace, presentation: presentationTrace },
    assertions: assertionResults,
    promiseMatrix,
    disciplineProof,
  };
}
