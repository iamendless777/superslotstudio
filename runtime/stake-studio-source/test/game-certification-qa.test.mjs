import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  GAME_CERTIFICATION_FORMAT,
  getGameCertificationSummary,
  recordGameCertification,
} from '../src/engines/quality/GameCertificationQA.js';

test('one game certificate records the full release verdict and ordered repair queue', () => {
  const project = createGameProject({ name: 'Game Certification Fixture' });
  const summary = recordGameCertification(project);

  assert.equal(project.production.qa.gameCertification.format, GAME_CERTIFICATION_FORMAT);
  assert.equal(summary.fresh, true);
  assert.equal(summary.complete, false);
  assert.equal(summary.stages.length, 9);
  assert.ok(summary.repairs.length > 0);
  assert.deepEqual(summary.repairs.map(item => item.order), summary.repairs.map((_, index) => index + 1));
  const firstWarning = summary.repairs.findIndex(item => item.severity !== 'blocker');
  const lastBlocker = summary.repairs.findLastIndex(item => item.severity === 'blocker');
  assert.ok(firstWarning === -1 || lastBlocker < firstWarning);
});

test('a release-check change invalidates the combined certificate', () => {
  const project = createGameProject({ name: 'Certificate Drift Fixture' });
  recordGameCertification(project);
  project.production.creative.coreHook = 'A concrete new player hook';

  const summary = getGameCertificationSummary(project);
  assert.equal(summary.fresh, false);
  assert.equal(summary.stale, true);
});

test('rerunning component evidence invalidates the combined certificate', () => {
  const project = createGameProject({ name: 'Evidence Drift Fixture' });
  project.production.qa.assetIntegrityAudit = {
    format: 'fixture', fingerprint: 'asset-a', runAt: '2026-08-03T00:00:00.000Z', passed: false,
  };
  recordGameCertification(project);
  project.production.qa.assetIntegrityAudit.runAt = '2026-08-03T00:01:00.000Z';

  const summary = getGameCertificationSummary(project);
  assert.equal(summary.fresh, false);
  assert.equal(summary.stale, true);
});

test('projects without Spine rigs treat the rig stage as not applicable', () => {
  const project = createGameProject({ name: 'State Layer Fixture' });
  const summary = getGameCertificationSummary(project);
  const rig = summary.stages.find(stage => stage.id === 'rig');
  assert.equal(rig.complete, true);
  assert.equal(rig.details, 'Not applicable');
});
