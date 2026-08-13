import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { assignGeneratedVisual, forgeArtBible, lockArtBible } from '../src/engines/assets/VisualAssetFactory.js';
import { createVisualWorkOrder } from '../src/engines/assets/VisualWorkOrder.js';
import {
  getCodexVisualBatchSummary,
  getNextCodexVisualTask,
  recordCodexVisualAttempt,
  refreshCodexVisualBatch,
  startCodexVisualBatch,
} from '../src/engines/assets/CodexVisualBatch.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA';

function batchProject() {
  const project = createGameProject({ name: 'Codex Batch QA' });
  project.build.stakeEngine.providerName = 'Northstar Games';
  project.theme.lore = 'A frozen valkyrie judges a doomed captain.';
  project.visualFactory.artBible = forgeArtBible(project);
  lockArtBible(project);
  createVisualWorkOrder(project);
  return project;
}

function passingResult(slot, target, project) {
  return {
    format: 'stake-studio-generated-visual-v1',
    model: 'codex-handoff',
    provider: 'codex-handoff',
    slot,
    target,
    dataUrl: `${png}${slot}${target || ''}`,
    width: slot === 'background' ? 1536 : 1024,
    height: slot === 'background' ? 1024 : slot === 'characterPose' ? 1536 : 1024,
    coherenceFingerprint: project.visualFactory.artBible.lockedFingerprint,
    analysis: { format: 'stake-studio-visual-analysis-v1', passed: true, score: 96, blockers: [], warnings: [], checks: [], metrics: {} },
  };
}

test('Codex batch exposes exactly one dependency-safe task at a time', () => {
  const project = batchProject();
  const batch = startCodexVisualBatch(project);
  assert.equal(batch.tasks.filter(task => task.status === 'ready').length, 1);
  const first = getNextCodexVisualTask(project);
  assert.equal(first.key, 'background');
  assert.equal(first.references.length, 0);
  assert.match(first.submit.instruction, /submit_codex_visual_asset/);

  assignGeneratedVisual(project, passingResult('background', null, project));
  const second = getNextCodexVisualTask(project);
  assert.equal(second.key, 'characterPose:idle');
  assert.deepEqual(second.requiredGeneratedReferences, ['background']);
  assert.equal(second.references[0].role, 'style');
  assert.match(second.references[0].dataUrl, /^data:image\/png;base64,/);
  const summary = getCodexVisualBatchSummary(project);
  assert.equal(summary.accepted, 1);
  assert.equal(summary.ready, 1);
});

test('already assigned work is preserved when a batch starts', () => {
  const project = batchProject();
  assignGeneratedVisual(project, passingResult('background', null, project));
  startCodexVisualBatch(project);
  assert.equal(getNextCodexVisualTask(project).key, 'characterPose:idle');
});

test('work-order changes make an active Codex batch stale', () => {
  const project = batchProject();
  startCodexVisualBatch(project);
  project.visualFactory.artBible.materials += ', carved bone';
  assert.equal(refreshCodexVisualBatch(project).status, 'stale');
  assert.throws(() => getNextCodexVisualTask(project), /stale/);
});

test('autopilot compiles measured corrections and stops at its retry safety limit', () => {
  const project = batchProject();
  startCodexVisualBatch(project, { mode: 'autopilot', maxAttemptsPerTask: 2 });
  const task = getNextCodexVisualTask(project);
  project.visualFactory.deliveryReceipt = {
    items: [{
      key: task.key,
      filename: task.output.filename,
      fileFingerprint: 'failed-1',
      status: 'rejected',
      score: 61,
      error: 'Foreground alpha coverage exceeds the gameplay budget.',
      processedAt: new Date().toISOString(),
    }],
  };
  recordCodexVisualAttempt(project, { filename: task.output.filename });
  const correction = getNextCodexVisualTask(project);
  assert.equal(correction.autopilot.attempt, 2);
  assert.equal(correction.autopilot.maxAttempts, 2);
  assert.match(correction.prompt, /CORRECTION PASS/);
  assert.match(correction.prompt, /alpha coverage/);

  project.visualFactory.deliveryReceipt.items[0] = {
    ...project.visualFactory.deliveryReceipt.items[0],
    fileFingerprint: 'failed-2',
  };
  recordCodexVisualAttempt(project, { filename: task.output.filename });
  const summary = getCodexVisualBatchSummary(project);
  assert.equal(summary.status, 'blocked');
  assert.equal(summary.blocked, 1);
  assert.equal(summary.attempts, 2);
  assert.match(summary.stopReason, /2-attempt safety limit/);
  assert.throws(() => getNextCodexVisualTask(project), /safety limit/);
});
