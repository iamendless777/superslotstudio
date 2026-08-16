import {
  getApplicableVisualReferences,
  getVisualFactoryTargets,
  normalizeVisualFactoryState,
} from './VisualAssetFactory.js';
import { getVisualWorkOrderStatus } from './VisualWorkOrder.js';

export const CODEX_VISUAL_BATCH_FORMAT = 'stake-studio-codex-visual-batch-v1';
export const DEFAULT_CODEX_VISUAL_ATTEMPTS = 3;

const attemptLimit = value => Math.max(1, Math.min(5, Number.parseInt(value, 10) || DEFAULT_CODEX_VISUAL_ATTEMPTS));

function currentTargets(project) {
  return new Map(getVisualFactoryTargets(project).map(target => [target.key, target]));
}

export function startCodexVisualBatch(project, options = {}) {
  const status = getVisualWorkOrderStatus(project);
  if (!status.current) throw new Error(status.reason);
  const factory = normalizeVisualFactoryState(project);
  const workOrder = factory.workOrder;
  const existing = factory.codexBatch;
  if (!options.force && existing?.format === CODEX_VISUAL_BATCH_FORMAT && existing.workOrderFingerprint === workOrder.fingerprint) {
    existing.mode = options.mode === 'manual' ? 'manual' : (existing.mode || 'autopilot');
    existing.maxAttemptsPerTask = attemptLimit(options.maxAttemptsPerTask || existing.maxAttemptsPerTask);
    return refreshCodexVisualBatch(project);
  }
  const now = new Date().toISOString();
  factory.codexBatch = {
    format: CODEX_VISUAL_BATCH_FORMAT,
    workOrderFingerprint: workOrder.fingerprint,
    status: 'active',
    mode: options.mode === 'manual' ? 'manual' : 'autopilot',
    maxAttemptsPerTask: attemptLimit(options.maxAttemptsPerTask),
    stopReason: null,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    currentTaskKey: null,
    tasks: workOrder.productionOrder.map((key, index) => ({
      key,
      index,
      status: 'waiting',
      requestedAt: null,
      completedAt: null,
      attempts: [],
    })),
  };
  return refreshCodexVisualBatch(project);
}

export function getCodexVisualBatch(project) {
  const batch = normalizeVisualFactoryState(project).codexBatch;
  return batch?.format === CODEX_VISUAL_BATCH_FORMAT ? batch : null;
}

export function refreshCodexVisualBatch(project) {
  const factory = normalizeVisualFactoryState(project);
  const batch = getCodexVisualBatch(project);
  if (!batch) return null;
  const workOrderStatus = getVisualWorkOrderStatus(project);
  if (!workOrderStatus.current || batch.workOrderFingerprint !== factory.workOrder?.fingerprint) {
    batch.status = 'stale';
    batch.currentTaskKey = null;
    batch.updatedAt = new Date().toISOString();
    return batch;
  }
  const targets = currentTargets(project);
  const items = new Map(factory.workOrder.items.map(item => [item.key, item]));
  let earlierIncomplete = false;
  let blockedTask = null;
  for (const task of batch.tasks) {
    const item = items.get(task.key);
    if (targets.get(task.key)?.ready) {
      task.status = 'accepted';
      task.completedAt ||= new Date().toISOString();
      continue;
    }
    const failedAttempts = (task.attempts || []).filter(attempt => attempt.status === 'rejected').length;
    if (!blockedTask && failedAttempts >= attemptLimit(batch.maxAttemptsPerTask)) {
      task.status = 'blocked';
      blockedTask = task;
      earlierIncomplete = true;
      continue;
    }
    const dependencies = item?.requiredGeneratedReferences || item?.dependencies || [];
    const dependenciesReady = dependencies.every(key => targets.get(key)?.ready);
    if (!earlierIncomplete && dependenciesReady) task.status = 'ready';
    else task.status = 'waiting';
    earlierIncomplete = true;
  }
  const accepted = batch.tasks.filter(task => task.status === 'accepted').length;
  batch.status = accepted === batch.tasks.length ? 'complete' : blockedTask ? 'blocked' : 'active';
  batch.currentTaskKey = blockedTask?.key || batch.tasks.find(task => task.status === 'ready')?.key || null;
  batch.stopReason = blockedTask
    ? `${blockedTask.key} reached the ${attemptLimit(batch.maxAttemptsPerTask)}-attempt safety limit. Review its measured QA failure before resuming.`
    : null;
  batch.completedAt = batch.status === 'complete' ? (batch.completedAt || new Date().toISOString()) : null;
  batch.updatedAt = new Date().toISOString();
  return batch;
}

export function getNextCodexVisualTask(project) {
  const factory = normalizeVisualFactoryState(project);
  let batch = getCodexVisualBatch(project);
  if (!batch) batch = startCodexVisualBatch(project);
  else batch = refreshCodexVisualBatch(project);
  if (batch.status === 'stale') throw new Error('The Codex visual batch is stale. Refresh the visual work order and start a new batch.');
  if (batch.status === 'blocked') throw new Error(batch.stopReason || 'The Codex visual batch stopped at its retry safety limit.');
  if (batch.status === 'complete') return null;
  const task = batch.tasks.find(candidate => candidate.status === 'ready');
  if (!task) throw new Error('The next Codex visual task is waiting for a required master to pass delivery QA.');
  const item = factory.workOrder.items.find(candidate => candidate.key === task.key);
  const target = getVisualFactoryTargets(project).find(candidate => candidate.key === task.key);
  const references = getApplicableVisualReferences(project, target);
  const attempts = task.attempts || [];
  const lastAttempt = attempts.at(-1) || null;
  const correction = lastAttempt?.status === 'rejected' && lastAttempt.error
    ? `Correct the measured delivery failure: ${String(lastAttempt.error).slice(0, 500)}`
    : null;
  task.requestedAt ||= new Date().toISOString();
  batch.currentTaskKey = task.key;
  batch.updatedAt = new Date().toISOString();
  return {
    format: 'stake-studio-codex-visual-task-v1',
    batchFingerprint: batch.workOrderFingerprint,
    key: item.key,
    label: item.label,
    slot: item.slot,
    target: item.target,
    prompt: correction ? `${item.prompt}\n\nCORRECTION PASS: ${correction}` : item.prompt,
    output: item.output,
    requiredGeneratedReferences: item.requiredGeneratedReferences || item.dependencies || [],
    references: references.map(reference => ({
      id: reference.id,
      name: reference.name,
      role: reference.role,
      imageFingerprint: reference.imageFingerprint,
      dataUrl: reference.src,
    })),
    autopilot: {
      mode: batch.mode || 'autopilot',
      attempt: attempts.length + 1,
      maxAttempts: attemptLimit(batch.maxAttemptsPerTask),
      correction,
      continueAfterPassingSubmission: (batch.mode || 'autopilot') === 'autopilot',
    },
    submit: {
      filename: item.output.filename,
      instruction: 'Generate exactly one image from this task, then submit its PNG bytes through submit_codex_visual_asset. StakeStudio will run local QA before unlocking the next task.',
    },
  };
}

export function recordCodexVisualAttempt(project, options = {}) {
  const factory = normalizeVisualFactoryState(project);
  const batch = getCodexVisualBatch(project);
  if (!batch) throw new Error('Start the Codex visual batch before recording a submission attempt.');
  const filename = String(options.filename || '').trim().toLowerCase();
  const item = factory.workOrder?.items?.find(candidate => String(candidate.output?.filename || '').toLowerCase() === filename);
  if (!item) throw new Error(`${options.filename || 'Submitted file'} is not part of the current Codex visual batch.`);
  const task = batch.tasks.find(candidate => candidate.key === item.key);
  if (!task) throw new Error(`${item.key} is not tracked by the current Codex visual batch.`);
  task.attempts ||= [];
  const receipt = factory.deliveryReceipt?.items?.find(candidate => String(candidate.filename || '').toLowerCase() === filename) || null;
  if (!receipt || !['accepted', 'rejected'].includes(receipt.status)) {
    throw new Error(`StakeStudio did not produce a final QA receipt for ${item.output.filename}.`);
  }
  if (!task.attempts.some(attempt => attempt.fileFingerprint === receipt.fileFingerprint)) {
    task.attempts.push({
      number: task.attempts.length + 1,
      status: receipt.status,
      score: receipt.score,
      error: receipt.error || null,
      fileFingerprint: receipt.fileFingerprint,
      processedAt: receipt.processedAt || new Date().toISOString(),
    });
  }
  batch.updatedAt = new Date().toISOString();
  return refreshCodexVisualBatch(project);
}

export function getCodexVisualBatchSummary(project) {
  const batch = refreshCodexVisualBatch(project);
  if (!batch) return { exists: false, status: 'idle', total: 0, accepted: 0, ready: 0, waiting: 0 };
  const count = status => batch.tasks.filter(task => task.status === status).length;
  return {
    exists: true,
    status: batch.status,
    total: batch.tasks.length,
    accepted: count('accepted'),
    ready: count('ready'),
    waiting: count('waiting'),
    blocked: count('blocked'),
    currentTaskKey: batch.currentTaskKey,
    mode: batch.mode || 'autopilot',
    maxAttemptsPerTask: attemptLimit(batch.maxAttemptsPerTask),
    attempts: batch.tasks.reduce((total, task) => total + (task.attempts?.length || 0), 0),
    stopReason: batch.stopReason || null,
    workOrderFingerprint: batch.workOrderFingerprint,
    startedAt: batch.startedAt,
    updatedAt: batch.updatedAt,
    completedAt: batch.completedAt,
  };
}
