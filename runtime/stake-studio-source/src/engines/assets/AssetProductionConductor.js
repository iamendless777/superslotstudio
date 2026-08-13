import {
  artBibleFingerprint,
  getVisualCohesionStatus,
  getVisualFactoryTargets,
  normalizeVisualFactoryState,
} from './VisualAssetFactory.js';

export const ASSET_PRODUCTION_FORMAT = 'stake-studio-asset-production-v1';
export const ASSET_PRODUCTION_VERSION = 1;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || minimum));

function fingerprint(value) {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function targetPhase(target, firstSymbolKey) {
  if (target.key === 'background') return 'world';
  if (target.key === 'characterPose:idle') return 'identity';
  if (target.key === firstSymbolKey) return 'symbol-master';
  if (target.slot === 'symbol') return 'symbol-family';
  if (target.key === 'foreground') return 'cabinet-finish';
  if (target.slot === 'characterPose') return 'performance';
  return 'brand';
}

function targetDependencies(target, firstSymbolKey) {
  if (target.key === 'background') return [];
  if (target.key === 'characterPose:idle') return ['background'];
  if (target.key === firstSymbolKey) return ['background'];
  if (target.slot === 'symbol') return ['background', firstSymbolKey].filter(key => key !== target.key);
  if (target.key === 'foreground') return ['background'];
  if (target.slot === 'characterPose') return ['background', 'characterPose:idle'].filter(key => key !== target.key);
  return ['background'];
}

function orderedTargets(project) {
  const targets = getVisualFactoryTargets(project);
  const firstSymbolKey = targets.find(target => target.slot === 'symbol')?.key || null;
  const phaseOrder = ['world', 'identity', 'symbol-master', 'symbol-family', 'cabinet-finish', 'performance', 'brand'];
  return targets.map((target, sourceIndex) => ({
    ...target,
    sourceIndex,
    phase: targetPhase(target, firstSymbolKey),
    dependencies: targetDependencies(target, firstSymbolKey),
  })).sort((left, right) => phaseOrder.indexOf(left.phase) - phaseOrder.indexOf(right.phase) || left.sourceIndex - right.sourceIndex);
}

function protectedBlocker(project, target) {
  if (target.slot === 'providerLogo' && !String(project.build?.stakeEngine?.providerName || '').trim()) {
    return 'Set the final provider name before generating its identity mark.';
  }
  return null;
}

function planFingerprint(project, quality, maxAttempts, targets) {
  return fingerprint({
    bible: artBibleFingerprint(normalizeVisualFactoryState(project).artBible),
    quality,
    maxAttempts,
    targets: targets.map(target => ({ key: target.key, dependencies: target.dependencies })),
  });
}

export function createAssetProductionRun(project, options = {}) {
  const factory = normalizeVisualFactoryState(project);
  const cohesion = getVisualCohesionStatus(project);
  const quality = ['concept', 'review', 'final'].includes(options.quality) ? options.quality : 'review';
  const maxAttempts = clamp(options.maxAttempts ?? 2, 1, 4);
  const targets = orderedTargets(project);
  const items = targets.map(target => {
    const blocker = protectedBlocker(project, target);
    return {
      key: target.key,
      slot: target.slot,
      target: target.target,
      label: target.label,
      phase: target.phase,
      dependencies: target.dependencies,
      state: target.ready ? 'assigned' : blocker ? 'protected' : 'pending',
      attempts: 0,
      lastScore: null,
      lastError: blocker,
      correction: null,
      assignmentKey: target.ready ? target.key : null,
      updatedAt: null,
    };
  });
  const blockers = [];
  if (!cohesion.ready) blockers.push(cohesion.validation.issues[0] || (cohesion.bibleDrift ? 'Re-lock the changed Art Direction Bible.' : 'Lock the Art Direction Bible before production.'));
  const now = new Date().toISOString();
  const run = {
    format: ASSET_PRODUCTION_FORMAT,
    version: ASSET_PRODUCTION_VERSION,
    status: blockers.length ? 'blocked' : items.every(item => item.state === 'assigned') ? 'complete' : 'planned',
    quality,
    maxAttempts,
    bibleFingerprint: artBibleFingerprint(factory.artBible),
    planFingerprint: planFingerprint(project, quality, maxAttempts, targets),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    requestsUsed: 0,
    blockers,
    items,
  };
  normalizeVisualFactoryState(project).productionRun = run;
  return refreshAssetProductionRun(project);
}

export function normalizeAssetProductionRun(project) {
  const factory = normalizeVisualFactoryState(project);
  const run = factory.productionRun;
  if (!run || run.format !== ASSET_PRODUCTION_FORMAT) return null;
  run.version = ASSET_PRODUCTION_VERSION;
  run.items ||= [];
  run.blockers ||= [];
  run.requestsUsed = Number(run.requestsUsed) || 0;
  run.maxAttempts = clamp(run.maxAttempts ?? 2, 1, 4);
  return run;
}

export function refreshAssetProductionRun(project) {
  const run = normalizeAssetProductionRun(project);
  if (!run) return null;
  const targets = new Map(getVisualFactoryTargets(project).map(target => [target.key, target]));
  const currentBible = artBibleFingerprint(normalizeVisualFactoryState(project).artBible);
  run.blockers = [];
  if (currentBible !== run.bibleFingerprint) run.blockers.push('The Art Direction Bible changed after this production plan was created. Re-plan before spending.');
  const cohesion = getVisualCohesionStatus(project);
  if (!cohesion.ready) run.blockers.push(cohesion.validation.issues[0] || 'Lock the current Art Direction Bible before production.');

  for (const item of run.items) {
    const target = targets.get(item.key);
    if (target?.ready) {
      item.state = 'assigned';
      item.assignmentKey ||= item.key;
      item.lastError = null;
      continue;
    }
    const blocker = protectedBlocker(project, item);
    if (blocker) {
      item.state = 'protected';
      item.lastError = blocker;
    } else if (item.state === 'protected') {
      item.state = 'pending';
      item.lastError = null;
    } else if (item.state === 'assigned') {
      item.state = 'pending';
      item.assignmentKey = null;
    } else if (item.state === 'generating') {
      item.state = 'pending';
    }
  }

  const assigned = new Set(run.items.filter(item => item.state === 'assigned').map(item => item.key));
  for (const item of run.items) {
    if (['assigned', 'protected', 'failed'].includes(item.state)) continue;
    item.state = item.dependencies.every(key => assigned.has(key)) ? 'pending' : 'waiting';
  }
  const summary = getAssetProductionSummary(project, false);
  run.status = summary.complete ? 'complete'
    : run.blockers.length ? 'blocked'
      : summary.runnable ? 'planned'
        : summary.protected || summary.failed ? 'attention-required' : 'blocked';
  if (summary.complete && !run.completedAt) run.completedAt = new Date().toISOString();
  if (!summary.complete) run.completedAt = null;
  run.updatedAt = new Date().toISOString();
  return run;
}

export function getAssetProductionSummary(project, refresh = true) {
  const run = refresh ? refreshAssetProductionRun(project) : normalizeAssetProductionRun(project);
  if (!run) return {
    exists: false, status: 'idle', total: 0, assigned: 0, pending: 0, waiting: 0,
    protected: 0, failed: 0, runnable: 0, requestsUsed: 0, maximumRequests: 0, complete: false,
  };
  const count = state => run.items.filter(item => item.state === state).length;
  const assigned = count('assigned');
  const pending = count('pending');
  const waiting = count('waiting');
  const protectedCount = count('protected');
  const failed = count('failed');
  return {
    exists: true,
    status: run.status,
    total: run.items.length,
    assigned,
    pending,
    waiting,
    protected: protectedCount,
    failed,
    runnable: pending,
    requestsUsed: run.requestsUsed,
    maximumRequests: run.items.filter(item => item.state !== 'assigned' && item.state !== 'protected')
      .reduce((total, item) => total + Math.max(0, run.maxAttempts - item.attempts), run.requestsUsed),
    complete: assigned === run.items.length,
    blockers: [...run.blockers],
    next: run.items.find(item => item.state === 'pending') || null,
  };
}

export function getNextAssetProductionItem(project) {
  const run = refreshAssetProductionRun(project);
  if (!run || run.blockers.length) return null;
  return run.items.find(item => item.state === 'pending') || null;
}

export function beginAssetProductionAttempt(project, key) {
  const run = refreshAssetProductionRun(project);
  if (!run) throw new Error('Create a visual production plan first.');
  if (run.blockers.length) throw new Error(run.blockers[0]);
  const item = run.items.find(candidate => candidate.key === key);
  if (!item) throw new Error(`Visual production target "${key}" is not in this plan.`);
  if (item.state !== 'pending') throw new Error(`${item.label} is not ready to generate.`);
  if (item.attempts >= run.maxAttempts) throw new Error(`${item.label} reached its ${run.maxAttempts}-attempt limit.`);
  item.attempts += 1;
  item.state = 'generating';
  item.lastError = null;
  item.updatedAt = new Date().toISOString();
  run.requestsUsed += 1;
  run.status = 'running';
  run.updatedAt = item.updatedAt;
  return item;
}

export function finishAssetProductionAttempt(project, key, outcome = {}) {
  const run = normalizeAssetProductionRun(project);
  if (!run) throw new Error('Create a visual production plan first.');
  const item = run.items.find(candidate => candidate.key === key);
  if (!item) throw new Error(`Visual production target "${key}" is not in this plan.`);
  item.lastScore = Number.isFinite(Number(outcome.score)) ? Number(outcome.score) : null;
  item.lastError = outcome.error ? String(outcome.error) : null;
  if (Object.hasOwn(outcome, 'correction')) item.correction = outcome.correction || null;
  item.assignmentKey = outcome.assignmentKey || null;
  item.updatedAt = new Date().toISOString();
  if (outcome.assigned) item.state = 'assigned';
  else if (item.attempts >= run.maxAttempts) item.state = 'failed';
  else item.state = 'pending';
  run.updatedAt = item.updatedAt;
  return refreshAssetProductionRun(project);
}

export function resetAssetProductionItem(project, key) {
  const run = normalizeAssetProductionRun(project);
  if (!run) return null;
  const item = run.items.find(candidate => candidate.key === key);
  if (!item || item.state === 'assigned') return item || null;
  item.state = 'pending';
  item.attempts = 0;
  item.lastScore = null;
  item.lastError = null;
  item.correction = null;
  item.updatedAt = new Date().toISOString();
  refreshAssetProductionRun(project);
  return item;
}
