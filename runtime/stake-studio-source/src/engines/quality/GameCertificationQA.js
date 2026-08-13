import { getPresentationInterruptionSummary } from '../presentation/PresentationInterruptionQA.js';
import { getAudioMasteringSummary } from './AudioMasteringQA.js';
import { getAssetIntegritySummary } from './AssetIntegrityQA.js';
import { getPerformanceProfileSummary } from './PerformanceProfiler.js';
import { getPlayerInformationSummary } from './PlayerInformationQA.js';
import { getPresentationPolishSummary } from './PresentationPolishQA.js';
import { QualityDirector } from './QualityDirector.js';
import { getReplayMatrixSummary } from './ReplayMatrixQA.js';
import { getProjectRigCertificationSummary } from './RigCertificationQA.js';
import { getViewportLayoutSummary } from './ViewportLayoutQA.js';
import { getVisualCohesionQASummary } from './VisualCohesionQA.js';
import { getAssetOrchestrationSummary } from './AssetOrchestrationQA.js';
import {
  MORPHEUS_SIGNATURE_SCENARIO_ID,
  getMorpheusSignatureCaptureSummary,
} from './morpheus/MorpheusSignatureCaptureQA.js';
import { getMorpheusEffectRouteCaptureSummary } from './morpheus/MorpheusEffectRouteCaptureQA.js';

export const GAME_CERTIFICATION_FORMAT = 'stake-studio-game-certification-v1';

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function evidenceStamp(report) {
  if (!report) return null;
  return {
    format: report.format || '',
    fingerprint: report.fingerprint || '',
    runAt: report.runAt || '',
    passed: Boolean(report.passed),
  };
}

function collectEvidence(project) {
  const audit = new QualityDirector(project).audit();
  const integrity = getAssetIntegritySummary(project);
  const visual = getVisualCohesionQASummary(project);
  const audio = getAudioMasteringSummary(project);
  const rig = getProjectRigCertificationSummary(project);
  const interruption = getPresentationInterruptionSummary(project);
  const polish = getPresentationPolishSummary(project);
  const playerInfo = getPlayerInformationSummary(project);
  const replay = getReplayMatrixSummary(project);
  const viewport = getViewportLayoutSummary(project);
  const performance = getPerformanceProfileSummary(project);
  const morpheusCapture = getMorpheusSignatureCaptureSummary(project);
  const morpheusEffectCapture = getMorpheusEffectRouteCaptureSummary(project);
  const assetOrchestration = getAssetOrchestrationSummary(project);
  const requiresAssetOrchestration = project.production?.workflow?.track === 'flagship';
  const requiresMorpheusCapture = (project.production?.workflow?.verticalSlice?.scenarioIds || [])
    .includes(MORPHEUS_SIGNATURE_SCENARIO_ID);
  const hasSpine = (project.animation?.spineAssets || []).length > 0;
  const stages = [
    { id: 'visual', label: 'Visual pack', panel: 'atlas', complete: integrity.complete && visual.complete, details: `${visual.passedAssets}/${visual.totalAssets} cohesive · ${integrity.passedAssets}/${integrity.totalAssets} valid` },
    { id: 'audio', label: 'Audio mastering', panel: 'audio', complete: audio.complete, details: `${audio.decodedAssets}/${audio.totalAssets} decoded` },
    { id: 'rig', label: 'Rig certification', panel: 'spine', complete: !hasSpine || rig.complete, details: hasSpine ? `${rig.motionFrames} motion frames · ${rig.stressRenders} stress renders` : 'Not applicable' },
    { id: 'presentation', label: 'Presentation', panel: 'preview', complete: interruption.complete && polish.complete, details: `${interruption.passed}/${interruption.total} transitions · ${polish.issues.length} polish findings` },
    ...(requiresMorpheusCapture ? [{
      id: 'signature-visual-proof',
      label: 'Morpheus signature visual proof',
      panel: 'preview',
      complete: morpheusCapture.complete,
      details: morpheusCapture.fresh
        ? `${morpheusCapture.archivedCaptureCount}/16 archived captures · frontend ${morpheusCapture.frontendComplete ? 'proved' : 'blocked'} · presentation ${morpheusCapture.presentationComplete ? 'proved' : 'blocked'}`
        : morpheusCapture.stale ? 'Stored Morpheus capture evidence is stale' : 'No archived Morpheus signature captures',
    }, {
      id: 'effect-route-visual-proof',
      label: 'Morpheus effect-route proof matrix',
      panel: 'preview',
      complete: morpheusEffectCapture.complete,
      details: morpheusEffectCapture.fresh
        ? `${morpheusEffectCapture.runCount}/${morpheusEffectCapture.expectedRunCount} runs · ${morpheusEffectCapture.archivedCaptureCount}/${morpheusEffectCapture.expectedCaptureCount} captures`
        : morpheusEffectCapture.stale ? 'Stored Morpheus effect-route evidence is stale' : 'No Morpheus effect-route capture matrix',
    }] : []),
    ...(requiresAssetOrchestration ? [{
      id: 'asset-orchestration',
      label: 'Asset and effect orchestration',
      panel: 'build',
      complete: assetOrchestration.complete,
      details: assetOrchestration.fresh
        ? `${assetOrchestration.counts.choreographyDecisions || 0}/${assetOrchestration.counts.authoritativeEvents || 0} events · ${assetOrchestration.counts.renderSamples || 0} render samples`
        : assetOrchestration.stale ? 'Stored orchestration evidence is stale' : 'No orchestration evidence',
    }] : []),
    { id: 'player-info', label: 'Player information', panel: 'preview', complete: playerInfo.complete, details: playerInfo.fresh ? `${playerInfo.issues.length} findings` : 'No current evidence' },
    { id: 'replay', label: 'Replay matrix', panel: 'preview', complete: replay.complete, details: `${replay.passed}/${replay.total} cases` },
    { id: 'viewport', label: 'Viewport layout', panel: 'preview', complete: viewport.complete, details: viewport.fresh ? `${viewport.samples.length} viewports measured` : 'No current evidence' },
    { id: 'performance', label: 'Performance', panel: 'preview', complete: performance.complete, details: performance.fresh ? `${performance.samples.length} viewports profiled` : 'No current evidence' },
    { id: 'release', label: 'Release gate', panel: 'quality', complete: audit.releaseReady, details: `${audit.score}/100 · ${audit.blockers.length} blockers` },
  ];
  return { audit, stages };
}

export function getGameCertificationFingerprint(project) {
  const { audit, stages } = collectEvidence(project);
  const qa = project.production?.qa || {};
  const rigCertifications = project.production?.rig?.certifications || {};
  return hashText(JSON.stringify({
    format: GAME_CERTIFICATION_FORMAT,
    checks: audit.checks.map(check => ({ id: check.id, passed: check.passed, evidence: check.evidence })),
    stages: stages.map(stage => ({ id: stage.id, complete: stage.complete, details: stage.details })),
    reports: {
      assetIntegrity: evidenceStamp(qa.assetIntegrityAudit),
      assetOrchestration: evidenceStamp(qa.assetOrchestrationAudit),
      visualCohesion: evidenceStamp(qa.visualCohesionAudit),
      audioMastering: evidenceStamp(project.production?.audio?.masteringAudit),
      presentationInterruption: evidenceStamp(project.production?.presentation?.interruptionAudit),
      presentationPolish: evidenceStamp(project.production?.presentation?.polishAudit),
      playerInformation: evidenceStamp(qa.playerInformationAudit),
      replay: evidenceStamp(qa.replayAudit),
      viewport: evidenceStamp(qa.viewportAudit),
      performance: evidenceStamp(qa.performanceAudit),
      morpheusSignatureCapture: evidenceStamp(qa.morpheusSignatureCaptureAudit),
      morpheusEffectRouteCapture: evidenceStamp(qa.morpheusEffectRouteCaptureAudit),
      rigs: Object.fromEntries(Object.entries(rigCertifications).sort(([left], [right]) => left.localeCompare(right)).map(([name, report]) => [name, evidenceStamp(report)])),
    },
  }));
}

export function recordGameCertification(project) {
  project.production ||= {};
  project.production.qa ||= {};
  const evidence = collectEvidence(project);
  project.production.qa.gameCertification = {
    format: GAME_CERTIFICATION_FORMAT,
    fingerprint: getGameCertificationFingerprint(project),
    runAt: new Date().toISOString(),
    passed: evidence.audit.releaseReady && evidence.stages.every(stage => stage.complete),
    score: evidence.audit.score,
    blockers: evidence.audit.blockers.length,
    warnings: evidence.audit.warnings.length,
  };
  return getGameCertificationSummary(project);
}

export function getGameCertificationSummary(project) {
  const evidence = collectEvidence(project);
  const report = project.production?.qa?.gameCertification || null;
  const fingerprint = getGameCertificationFingerprint(project);
  const fresh = Boolean(report?.format === GAME_CERTIFICATION_FORMAT && report.fingerprint === fingerprint);
  const complete = Boolean(fresh && report.passed && evidence.audit.releaseReady && evidence.stages.every(stage => stage.complete));
  const repairs = [...evidence.audit.blockers, ...evidence.audit.warnings].map((item, index) => ({
    order: index + 1,
    id: item.id,
    category: item.category,
    label: item.label,
    remedy: item.remedy,
    evidence: item.evidence,
    severity: item.severity,
    panel: item.panel,
  }));
  return {
    format: GAME_CERTIFICATION_FORMAT,
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete,
    passed: Boolean(fresh && report.passed),
    runAt: fresh ? report.runAt || null : null,
    score: evidence.audit.score,
    blockers: evidence.audit.blockers.length,
    warnings: evidence.audit.warnings.length,
    stages: evidence.stages,
    repairs,
    audit: evidence.audit,
  };
}
