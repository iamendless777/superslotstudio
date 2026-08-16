import { MORPHEUS_CONTRACT_FINGERPRINT } from '../../morpheus/MorpheusGameContract.js';
import {
  createExactMaxTerminationProofTrace,
  createMysteryStarDreamfallProofTrace,
  createTricksterGridSettlementProofTrace,
  createLucidFamilyMultiplierProofTrace,
  createPredeterminedGeneratorProofTrace,
  createNightmareReliquaryProofTrace,
} from '../../morpheus/MorpheusEffectProofTraces.js';
import { hashMorpheusProtocolValue } from '../../morpheus/MorpheusEventProtocol.js';
import {
  MORPHEUS_EFFECT_MOTION_MODES,
} from '../../morpheus/MorpheusEffectOrchestrationContract.js?orchestration=20260811-2';
import {
  MorpheusEffectOrchestrationRuntime,
} from '../../presentation/morpheus/MorpheusEffectOrchestrationRuntime.js?orchestration=20260811-2';
import {
  createMorpheusEffectPresentationPlan,
  summarizeMorpheusEffectPresentationPlans,
} from '../../presentation/morpheus/MorpheusEffectPresentation.js?orchestration=20260811-2';

export const MORPHEUS_PORTABLE_FRONTEND_QA_FORMAT = 'morpheus-portable-frontend-parity-qa-v1';
export const MORPHEUS_PORTABLE_FRONTEND_ROUTE_IDS = Object.freeze([
  'predeterminedGeneratorDeclarations',
  'nightmareReliquaryDeclarations',
  'lucidFamilyMultiplierSettlement',
  'tricksterGridSettlement',
  'mysteryStarDreamfallTumble',
  'exactMaxTermination',
]);

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const clean = value => String(value || '').trim();

function traceFor(routeId) {
  if (routeId === 'predeterminedGeneratorDeclarations') return createPredeterminedGeneratorProofTrace();
  if (routeId === 'nightmareReliquaryDeclarations') return createNightmareReliquaryProofTrace();
  if (routeId === 'lucidFamilyMultiplierSettlement') return createLucidFamilyMultiplierProofTrace();
  if (routeId === 'tricksterGridSettlement') return createTricksterGridSettlementProofTrace();
  if (routeId === 'mysteryStarDreamfallTumble') return createMysteryStarDreamfallProofTrace();
  if (routeId === 'exactMaxTermination') return createExactMaxTerminationProofTrace();
  throw new Error(`Unknown Morpheus portable route ${routeId}.`);
}

function reportIdentity(report) {
  return {
    routeId: report.routeId,
    eventHash: report.eventHash,
    stateHash: report.stateHash,
    semanticTraceHash: report.semanticTraceHash,
    acknowledgementHash: report.acknowledgementHash,
    protocolEventHash: report.protocolEvidence?.eventHash,
    protocolBoardHash: report.protocolEvidence?.boardHash,
    protocolStateHash: report.protocolEvidence?.stateHash,
    presentationSemanticHashes: (report.presentationPlans || []).map(plan => plan.semanticHash),
    presentationPreviewReady: report.presentationCoverage?.previewReady === true,
    presentationProductionReady: report.presentationCoverage?.productionReady === true,
    presentationMissing: clone(report.presentationCoverage?.missing || {}),
  };
}

function runAuthorityProjection(events, { routeId, motionMode, catalog }) {
  const runtime = new MorpheusEffectOrchestrationRuntime({ routeId, motionMode });
  const presentationPlans = [];
  for (const event of events) {
    const command = runtime.dispatch(event);
    presentationPlans.push(createMorpheusEffectPresentationPlan({ command, event, catalog }));
    runtime.acknowledge({
      id: command.acknowledgementId,
      evidence: `settled:${command.eventIndex}:${command.eventType}`,
    });
  }
  return {
    ...runtime.snapshot(),
    presentationPlans,
    presentationCoverage: summarizeMorpheusEffectPresentationPlans(presentationPlans),
  };
}

export function createMorpheusPortableFrontendAuthority(catalog = {}) {
  const routes = Object.fromEntries(MORPHEUS_PORTABLE_FRONTEND_ROUTE_IDS.map(routeId => {
    const trace = traceFor(routeId);
    const motionModes = Object.fromEntries(MORPHEUS_EFFECT_MOTION_MODES.map(motionMode => [
      motionMode,
      reportIdentity(runAuthorityProjection(trace.events, { routeId, motionMode, catalog })),
    ]));
    return [routeId, {
      eventCount: trace.events.length,
      traceEventHash: trace.eventHash,
      motionModes,
    }];
  }));
  const authority = {
    format: 'morpheus-portable-frontend-authority-v1',
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    catalogFingerprint: hashMorpheusProtocolValue(catalog),
    routes,
  };
  authority.fingerprint = hashMorpheusProtocolValue(authority);
  return authority;
}

export function createMorpheusPortableFrontendEvidence({ runProjection, bundleSha256, runtimeFile, catalog = {} } = {}) {
  if (typeof runProjection !== 'function') throw new Error('Morpheus portable frontend evidence requires the compiled runtime projection.');
  const authority = createMorpheusPortableFrontendAuthority(catalog);
  const routes = Object.fromEntries(MORPHEUS_PORTABLE_FRONTEND_ROUTE_IDS.map(routeId => {
    const trace = traceFor(routeId);
    return [routeId, {
      eventCount: trace.events.length,
      motionModes: Object.fromEntries(MORPHEUS_EFFECT_MOTION_MODES.map(motionMode => [
        motionMode,
        reportIdentity(runProjection(clone(trace.events), { motionMode, catalog: clone(catalog) })),
      ])),
    }];
  }));
  const evidence = {
    format: MORPHEUS_PORTABLE_FRONTEND_QA_FORMAT,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    authorityFingerprint: authority.fingerprint,
    catalog: clone(catalog),
    catalogFingerprint: authority.catalogFingerprint,
    runtimeFile: clean(runtimeFile),
    bundleSha256: clean(bundleSha256),
    routes,
  };
  const result = evaluateMorpheusPortableFrontendQA(evidence);
  evidence.passed = result.passed;
  evidence.issues = result.issues;
  evidence.fingerprint = result.fingerprint;
  return evidence;
}

export function evaluateMorpheusPortableFrontendQA(evidence = {}) {
  const authority = createMorpheusPortableFrontendAuthority(evidence.catalog || {});
  const issues = [];
  if (evidence.format !== MORPHEUS_PORTABLE_FRONTEND_QA_FORMAT) issues.push('Portable frontend evidence format is invalid.');
  if (evidence.contractFingerprint !== MORPHEUS_CONTRACT_FINGERPRINT) issues.push('Portable frontend contract fingerprint drifted.');
  if (evidence.authorityFingerprint !== authority.fingerprint) issues.push('Portable frontend authority fingerprint drifted.');
  if (evidence.catalogFingerprint !== authority.catalogFingerprint) issues.push('Portable frontend presentation catalog fingerprint drifted.');
  if (evidence.runtimeFile !== 'morpheus-authoritative-runtime.js') issues.push('Portable Morpheus runtime filename is invalid.');
  if (!/^[a-f0-9]{64}$/.test(clean(evidence.bundleSha256))) issues.push('Portable Morpheus runtime bundle hash is invalid.');
  const routeIds = Object.keys(evidence.routes || {}).sort();
  if (JSON.stringify(routeIds) !== JSON.stringify([...MORPHEUS_PORTABLE_FRONTEND_ROUTE_IDS].sort())) {
    issues.push('Portable frontend route coverage is incomplete or contains an unknown route.');
  }
  for (const routeId of MORPHEUS_PORTABLE_FRONTEND_ROUTE_IDS) {
    const expected = authority.routes[routeId];
    const actual = evidence.routes?.[routeId];
    if (!actual) continue;
    if (Number(actual.eventCount) !== expected.eventCount) issues.push(`${routeId} event count drifted.`);
    for (const motionMode of MORPHEUS_EFFECT_MOTION_MODES) {
      if (JSON.stringify(actual.motionModes?.[motionMode]) !== JSON.stringify(expected.motionModes[motionMode])) {
        issues.push(`${routeId}/${motionMode} compiled projection differs from Preview authority.`);
      }
    }
  }
  const identity = {
    format: evidence.format,
    contractFingerprint: evidence.contractFingerprint,
    authorityFingerprint: evidence.authorityFingerprint,
    catalog: evidence.catalog,
    catalogFingerprint: evidence.catalogFingerprint,
    runtimeFile: evidence.runtimeFile,
    bundleSha256: evidence.bundleSha256,
    routes: evidence.routes,
  };
  return {
    format: MORPHEUS_PORTABLE_FRONTEND_QA_FORMAT,
    passed: issues.length === 0,
    issues,
    fingerprint: `morpheus-portable-frontend-${hashMorpheusProtocolValue(identity)}`,
    authority,
  };
}
