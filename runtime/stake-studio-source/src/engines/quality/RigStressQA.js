import { PRODUCTION_ANIMATION_STATES } from '../animation/AnimationProfiles.js';
import { getSpineAssetFingerprint } from '../animation/SpineMotionReview.js';
import { analyzeRenderedPixels, normalizeRenderedMetrics } from './RenderedPixelQA.js';

export const analyzeRigPosePixels = analyzeRenderedPixels;

export const RIG_STRESS_FORMAT = 'stake-studio-rig-stress-qa-v2';
export const RIG_STRESS_ANGLES = Object.freeze([-180, -135, -90, -45, 0, 45, 90, 135, 180]);

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') {
    const text = String(value ?? '');
    return /^(data:|blob:|https?:)/.test(text) ? [text.length, text.slice(0, 24), text.slice(-32)] : value;
  }
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, compact(value[key])]));
}

function stressBones(asset = {}) {
  const bones = [...new Set((asset.bones || []).filter(Boolean))];
  const driven = bones.filter(name => name !== 'root');
  return driven.length ? driven : bones;
}

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function ratio(value, baseline) {
  return baseline > 0 ? value / baseline : value > 0 ? Infinity : 1;
}

export function compareRigPoseMetrics(metrics, baseline) {
  const value = normalizeRenderedMetrics(metrics);
  const origin = normalizeRenderedMetrics(baseline);
  const findings = [];
  const add = (id, system, evidence) => findings.push({ id, system, evidence });
  const massRatio = ratio(value.alphaMass, origin.alphaMass);
  const boundsRatio = ratio(value.boundsAreaFraction, origin.boundsAreaFraction);
  const originAspect = origin.heightFraction ? origin.widthFraction / origin.heightFraction : 1;
  const aspectRatio = ratio(value.heightFraction ? value.widthFraction / value.heightFraction : 0, originAspect);
  const centerDrift = Math.hypot(value.centroidX - origin.centroidX, value.centroidY - origin.centroidY);
  if (value.visiblePixels < 8) add('invisible', 'correction', 'the rendered rig nearly disappeared');
  if (massRatio < 0.55) add('area-collapse', 'correction', `visible alpha collapsed to ${Math.round(massRatio * 100)}% of neutral`);
  if (massRatio > 1.65) add('area-bloat', 'correction', `visible alpha expanded to ${Math.round(massRatio * 100)}% of neutral`);
  if (boundsRatio < 0.5) add('bounds-collapse', 'correction', `silhouette bounds collapsed to ${Math.round(boundsRatio * 100)}% of neutral`);
  if (aspectRatio < 0.45 || aspectRatio > 2.2) add('aspect-distortion', 'correction', `silhouette aspect changed ${aspectRatio.toFixed(2)}×`);
  if (origin.occupancy - value.occupancy > 0.22) add('interior-gap', 'correction', `silhouette occupancy fell by ${Math.round((origin.occupancy - value.occupancy) * 100)} points`);
  if (value.components > origin.components + 2 && value.largestComponentShare < 0.86) {
    add('fragmentation', 'correction', `${value.components} disconnected pixel islands remain`);
  }
  if (centerDrift > 0.22) add('center-drift', 'pose-mechanic', `silhouette center moved ${Math.round(centerDrift * 100)}% of the stage`);
  if (value.edgeTouchFraction > 0.12 && origin.edgeTouchFraction < 0.04) {
    add('stage-clipping', 'pose-mechanic', `${Math.round(value.edgeTouchFraction * 100)}% of stage-edge samples are occupied`);
  }
  return findings;
}

export function getRigStressCasePlan(asset = {}) {
  return stressBones(asset).flatMap(bone => PRODUCTION_ANIMATION_STATES.map(state => ({
    id: `${bone}::${state}`,
    bone,
    state,
    angles: [...RIG_STRESS_ANGLES],
  })));
}

export function getRigStressFingerprint(project, assetName) {
  const asset = (project.animation?.spineAssets || []).find(item => item.name === assetName);
  if (!asset) return null;
  const rig = project.production?.rig || {};
  return hashText(JSON.stringify(compact({
    asset: getSpineAssetFingerprint(asset),
    states: PRODUCTION_ANIMATION_STATES,
    angles: RIG_STRESS_ANGLES,
    corrections: rig.corrections,
    boneLimits: rig.boneLimits,
    drawOrderRules: rig.drawOrderRules,
    anchors: rig.anchors,
    secondaryMotion: rig.secondaryMotion,
  })));
}

function normalizeCase(sample = {}) {
  return {
    id: String(sample.id || `${sample.bone || ''}::${sample.state || ''}`),
    bone: String(sample.bone || ''),
    state: String(sample.state || ''),
    anglesTested: [...new Set((sample.anglesTested || []).map(Number).filter(Number.isFinite))].sort((left, right) => left - right),
    correctionsTriggered: [...new Set((sample.correctionsTriggered || []).filter(Boolean))],
    poseMechanicsTriggered: [...new Set((sample.poseMechanicsTriggered || []).filter(Boolean))],
    measurements: (sample.measurements || []).map(measurement => ({
      angle: finite(measurement.angle),
      metrics: normalizeRenderedMetrics(measurement.metrics),
      correctionsTriggered: [...new Set((measurement.correctionsTriggered || []).filter(Boolean))],
      poseMechanicsTriggered: [...new Set((measurement.poseMechanicsTriggered || []).filter(Boolean))],
      error: String(measurement.error || ''),
    })),
    error: String(sample.error || ''),
  };
}

function evaluateCases(asset, cases) {
  const expected = getRigStressCasePlan(asset);
  const byId = new Map((cases || []).map(sample => {
    const normalized = normalizeCase(sample);
    return [normalized.id, normalized];
  }));
  const issues = [];
  const findings = [];
  let testedAngles = 0;
  for (const planned of expected) {
    const sample = byId.get(planned.id);
    if (!sample) {
      issues.push(`${planned.bone} was not stress-tested during ${planned.state}.`);
      continue;
    }
    const missingAngles = planned.angles.filter(angle => !sample.anglesTested.includes(angle));
    if (missingAngles.length) issues.push(`${planned.bone} / ${planned.state} missed angles ${missingAngles.join(', ')}°.`);
    const measurements = new Map(sample.measurements.map(measurement => [measurement.angle, measurement]));
    const missingMeasurements = planned.angles.filter(angle => !measurements.has(angle));
    if (missingMeasurements.length) issues.push(`${planned.bone} / ${planned.state} has no pixel evidence for angles ${missingMeasurements.join(', ')}°.`);
    const baseline = measurements.get(0)?.metrics;
    if (baseline && baseline.visiblePixels < 8) issues.push(`${planned.bone} / ${planned.state} neutral pose did not render enough visible pixels.`);
    if (baseline) {
      for (const angle of planned.angles.filter(value => value !== 0)) {
        const measurement = measurements.get(angle);
        if (!measurement) continue;
        if (measurement.error) {
          issues.push(`${planned.bone} / ${planned.state} / ${angle}°: ${measurement.error}`);
          continue;
        }
        for (const finding of compareRigPoseMetrics(measurement.metrics, baseline)) {
          findings.push({ ...finding, bone: planned.bone, state: planned.state, angle });
          issues.push(`${planned.bone} / ${planned.state} / ${angle}° ${finding.evidence}; ${finding.system === 'correction' ? 'corrective pixels' : 'runtime pose mechanics'} required.`);
        }
      }
    }
    if (sample.error) issues.push(`${planned.bone} / ${planned.state}: ${sample.error}`);
    testedAngles += sample.anglesTested.length;
  }
  if (!expected.length) issues.push('The Spine asset has no bones available for stress testing.');
  return {
    passed: expected.length > 0 && issues.length === 0,
    issues,
    expectedCases: expected.length,
    passedCases: expected.filter(item => {
      const sample = byId.get(item.id);
      const measurements = new Map((sample?.measurements || []).map(measurement => [measurement.angle, measurement]));
      const baseline = measurements.get(0)?.metrics;
      return sample && !sample.error && baseline?.visiblePixels >= 8
        && item.angles.every(angle => sample.anglesTested.includes(angle) && measurements.has(angle))
        && item.angles.filter(angle => angle !== 0).every(angle => {
          const measurement = measurements.get(angle);
          return !measurement.error && compareRigPoseMetrics(measurement.metrics, baseline).length === 0;
        });
    }).length,
    testedAngles,
    cases: [...byId.values()],
    findings,
    correctionRequired: findings.filter(finding => finding.system === 'correction').length,
    poseMechanicsRequired: findings.filter(finding => finding.system === 'pose-mechanic').length,
  };
}

export function recordRigStressQA(project, assetName, samples = [], { runtimeStatus = 'ready' } = {}) {
  const asset = (project.animation?.spineAssets || []).find(item => item.name === assetName);
  if (!asset) throw new Error(`Unknown Spine asset “${assetName}”.`);
  const evaluation = evaluateCases(asset, samples);
  if (runtimeStatus !== 'ready') evaluation.issues.unshift(`Spine runtime finished in ${runtimeStatus} state.`);
  const passed = runtimeStatus === 'ready' && evaluation.passed;
  project.production ||= {};
  project.production.rig ||= {};
  project.production.rig.stressAudits ||= {};
  project.production.rig.stressAudits[assetName] = {
    format: RIG_STRESS_FORMAT,
    fingerprint: getRigStressFingerprint(project, assetName),
    runAt: new Date().toISOString(),
    runtimeStatus,
    passed,
    expectedCases: evaluation.expectedCases,
    passedCases: evaluation.passedCases,
    testedAngles: evaluation.testedAngles,
    correctionRequired: evaluation.correctionRequired,
    poseMechanicsRequired: evaluation.poseMechanicsRequired,
    findings: evaluation.findings,
    issues: evaluation.issues,
    cases: evaluation.cases,
  };
  return getRigStressSummary(project, assetName);
}

export function getRigStressSummary(project, assetName) {
  const asset = (project.animation?.spineAssets || []).find(item => item.name === assetName);
  const fingerprint = getRigStressFingerprint(project, assetName);
  const report = project.production?.rig?.stressAudits?.[assetName] || null;
  const fresh = Boolean(asset && report?.format === RIG_STRESS_FORMAT && report.fingerprint === fingerprint);
  const evaluation = fresh ? evaluateCases(asset, report.cases) : null;
  const complete = Boolean(fresh && report.runtimeStatus === 'ready' && report.passed && evaluation?.passed);
  const issues = fresh ? [...new Set([
    ...(report.runtimeStatus === 'ready' ? [] : [`Spine runtime finished in ${report.runtimeStatus} state.`]),
    ...(evaluation?.issues || []),
  ])] : [];
  return {
    asset: assetName,
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete,
    total: evaluation?.expectedCases || getRigStressCasePlan(asset).length,
    passed: evaluation?.passedCases || 0,
    testedAngles: evaluation?.testedAngles || 0,
    correctionRequired: evaluation?.correctionRequired || 0,
    poseMechanicsRequired: evaluation?.poseMechanicsRequired || 0,
    findings: evaluation?.findings || [],
    issues,
    runAt: fresh ? report.runAt || null : null,
  };
}

export function getProjectRigStressSummary(project) {
  const summaries = (project.animation?.spineAssets || []).map(asset => getRigStressSummary(project, asset.name));
  return {
    summaries,
    total: summaries.reduce((sum, item) => sum + item.total, 0),
    passed: summaries.reduce((sum, item) => sum + item.passed, 0),
    testedAngles: summaries.reduce((sum, item) => sum + item.testedAngles, 0),
    correctionRequired: summaries.reduce((sum, item) => sum + item.correctionRequired, 0),
    poseMechanicsRequired: summaries.reduce((sum, item) => sum + item.poseMechanicsRequired, 0),
    findings: summaries.flatMap(item => item.findings),
    fresh: summaries.length === 0 || summaries.every(item => item.fresh),
    complete: summaries.length === 0 || summaries.every(item => item.complete),
    stale: summaries.some(item => item.stale),
    issues: summaries.flatMap(item => item.issues),
  };
}
