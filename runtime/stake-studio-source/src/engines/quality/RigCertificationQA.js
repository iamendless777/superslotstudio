import { auditSpineAsset } from '../animation/SpineAssetAudit.js';
import { getSpineMotionFingerprint, getSpineMotionReviewSummary } from '../animation/SpineMotionReview.js';
import { getRigStressFingerprint, getRigStressSummary } from './RigStressQA.js';

export const RIG_CERTIFICATION_FORMAT = 'stake-studio-rig-certification-v1';

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function getRigCertificationFingerprint(project, assetName) {
  const motion = getSpineMotionFingerprint(project, assetName);
  const stress = getRigStressFingerprint(project, assetName);
  if (!motion || !stress) return null;
  const motionReport = project.production?.rig?.motionReviews?.[assetName] || null;
  const stressReport = project.production?.rig?.stressAudits?.[assetName] || null;
  const evidenceStamp = report => report ? {
    format: report.format || '', fingerprint: report.fingerprint || '', runAt: report.runAt || '', passed: Boolean(report.passed),
  } : null;
  return hashText(JSON.stringify({
    format: RIG_CERTIFICATION_FORMAT,
    motionSource: motion,
    stressSource: stress,
    motionEvidence: evidenceStamp(motionReport),
    stressEvidence: evidenceStamp(stressReport),
  }));
}

function currentEvidence(project, assetName) {
  const asset = (project.animation?.spineAssets || []).find(item => item.name === assetName);
  if (!asset) return null;
  return {
    asset,
    structural: auditSpineAsset(asset),
    motion: getSpineMotionReviewSummary(project, assetName),
    stress: getRigStressSummary(project, assetName),
  };
}

export function recordRigCertification(project, assetName) {
  const evidence = currentEvidence(project, assetName);
  if (!evidence) throw new Error(`Unknown Spine asset “${assetName}”.`);
  const passed = evidence.structural.valid && evidence.motion.complete && evidence.stress.complete;
  project.production ||= {};
  project.production.rig ||= {};
  project.production.rig.certifications ||= {};
  project.production.rig.certifications[assetName] = {
    format: RIG_CERTIFICATION_FORMAT,
    fingerprint: getRigCertificationFingerprint(project, assetName),
    runAt: new Date().toISOString(),
    passed,
    structuralIssues: evidence.structural.issues.length,
    motionCases: evidence.motion.total,
    motionFrames: evidence.motion.framesMeasured,
    stressCases: evidence.stress.total,
    stressRenders: evidence.stress.testedAngles,
  };
  return getRigCertificationSummary(project, assetName);
}

export function clearRigCertification(project, assetName) {
  if (project.production?.rig?.certifications) delete project.production.rig.certifications[assetName];
  return getRigCertificationSummary(project, assetName);
}

export function getRigCertificationSummary(project, assetName) {
  const evidence = currentEvidence(project, assetName);
  if (!evidence) return {
    asset: assetName, fingerprint: null, fresh: false, stale: false, complete: false,
    structural: null, motion: null, stress: null, issues: [], runAt: null,
  };
  const fingerprint = getRigCertificationFingerprint(project, assetName);
  const stored = project.production?.rig?.certifications?.[assetName] || null;
  const fresh = Boolean(stored?.format === RIG_CERTIFICATION_FORMAT && stored.fingerprint === fingerprint);
  const complete = Boolean(
    fresh && stored.passed && evidence.structural.valid && evidence.motion.complete && evidence.stress.complete
  );
  const issues = [
    ...evidence.structural.issues.map(item => `Structure: ${item.message}`),
    ...evidence.motion.issues.map(message => `Motion: ${message}`),
    ...evidence.stress.issues.map(message => `Deformation: ${message}`),
  ];
  if (!evidence.motion.fresh && !evidence.motion.stale) issues.unshift('Motion: Automated Motion QA has not been run.');
  if (!evidence.stress.fresh && !evidence.stress.stale) issues.unshift('Deformation: Pixel Deformation Audit has not been run.');
  if (evidence.motion.stale) issues.unshift('Motion: Evidence is stale after a runtime input changed.');
  if (evidence.stress.stale) issues.unshift('Deformation: Evidence is stale after a runtime input changed.');
  return {
    asset: assetName,
    fingerprint,
    storedFingerprint: stored?.fingerprint || null,
    fresh,
    stale: Boolean(stored) && !fresh,
    complete,
    structural: evidence.structural,
    motion: evidence.motion,
    stress: evidence.stress,
    issues: [...new Set(issues)],
    runAt: fresh ? stored.runAt || null : null,
  };
}

export function getProjectRigCertificationSummary(project) {
  const summaries = (project.animation?.spineAssets || []).map(asset => getRigCertificationSummary(project, asset.name));
  return {
    summaries,
    complete: summaries.length === 0 || summaries.every(item => item.complete),
    fresh: summaries.length === 0 || summaries.every(item => item.fresh),
    stale: summaries.some(item => item.stale),
    issues: summaries.flatMap(item => item.issues),
    motionFrames: summaries.reduce((sum, item) => sum + (item.motion?.framesMeasured || 0), 0),
    stressRenders: summaries.reduce((sum, item) => sum + (item.stress?.testedAngles || 0), 0),
  };
}
