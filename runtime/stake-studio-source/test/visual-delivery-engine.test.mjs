import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { forgeArtBible, lockArtBible } from '../src/engines/assets/VisualAssetFactory.js';
import { createVisualWorkOrder } from '../src/engines/assets/VisualWorkOrder.js';
import {
  beginVisualDeliveryReceipt,
  createVisualDeliveryCandidate,
  findVisualDeliveryResult,
  finishVisualDeliveryReceipt,
  getVisualDeliverySummary,
  recordVisualDeliveryResult,
} from '../src/engines/assets/VisualDeliveryEngine.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA';

function deliveryProject() {
  const project = createGameProject({ name: 'Delivery QA' });
  project.build.stakeEngine.providerName = 'Northstar Games';
  project.theme.lore = 'A frozen valkyrie judges a doomed captain.';
  project.visualFactory.artBible = forgeArtBible(project);
  lockArtBible(project);
  createVisualWorkOrder(project);
  return project;
}

function file(filename) {
  return { filename, bytes: 128, modifiedAt: '2026-08-03T00:00:00.000Z', dataUrl: `${png}${filename}` };
}

test('delivery candidates obey exact work-order names, dimensions, and dependencies', () => {
  const project = deliveryProject();
  const background = createVisualDeliveryCandidate(project, file('background.png'), { width: 1536, height: 1024 });
  assert.equal(background.item.key, 'background');
  assert.equal(background.result.provider, 'codex-handoff');
  assert.equal(background.result.workOrderFingerprint, project.visualFactory.workOrder.fingerprint);
  assert.throws(() => createVisualDeliveryCandidate(project, file('background.png'), { width: 1024, height: 1024 }), /requires 1536×1024/);
  assert.throws(() => createVisualDeliveryCandidate(project, file('surprise.png'), { width: 1024, height: 1024 }), /not declared/);
  assert.throws(() => createVisualDeliveryCandidate(project, file('h2.png'), { width: 1024, height: 1024 }), /waiting for its required master background/);
  project.theme.submission ||= {};
  project.theme.submission.background = png;
  project.theme.symbols.find(symbol => symbol.name === 'H1').src = png;
  const dependent = createVisualDeliveryCandidate(project, file('h2.png'), { width: 1024, height: 1024 });
  assert.equal(dependent.item.key, 'symbol:H2');
});

test('delivery receipts retain deterministic accepted and rejected evidence', () => {
  const project = deliveryProject();
  beginVisualDeliveryReceipt(project, { folder: '/safe/inbox' });
  const candidate = createVisualDeliveryCandidate(project, file('background.png'), { width: 1536, height: 1024 });
  recordVisualDeliveryResult(project, {
    key: candidate.item.key,
    filename: candidate.item.output.filename,
    fileFingerprint: candidate.fingerprint,
    status: 'accepted',
    score: 95,
    assignmentKey: 'background',
  });
  recordVisualDeliveryResult(project, {
    key: null,
    filename: 'unexpected.png',
    fileFingerprint: 'unexpected',
    status: 'rejected',
    error: 'Not declared.',
  });
  const summary = finishVisualDeliveryReceipt(project);
  assert.equal(summary.accepted, 1);
  assert.equal(summary.rejected, 1);
  assert.equal(findVisualDeliveryResult(project, candidate.fingerprint).assignmentKey, 'background');
  assert.equal(getVisualDeliverySummary(project).folder, '/safe/inbox');
});

test('a changed work order clears old delivery evidence', () => {
  const project = deliveryProject();
  beginVisualDeliveryReceipt(project, { folder: '/first' });
  recordVisualDeliveryResult(project, { key: 'background', filename: 'background.png', fileFingerprint: 'old', status: 'rejected' });
  project.build.stakeEngine.providerName = '';
  createVisualWorkOrder(project, { replan: true });
  beginVisualDeliveryReceipt(project, { folder: '/second' });
  assert.equal(getVisualDeliverySummary(project).total, 0);
});
