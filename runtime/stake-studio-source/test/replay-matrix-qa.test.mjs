import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  getReplayFingerprint,
  getReplayMatrixSummary,
  runReplayMatrixQA,
} from '../src/engines/quality/ReplayMatrixQA.js';

test('critical presentation journeys and seeded rounds replay identically', async () => {
  const project = createGameProject({ name: 'Replay Matrix Fixture' });
  const report = await runReplayMatrixQA(project);
  const summary = getReplayMatrixSummary(project);
  assert.equal(report.passed, true);
  assert.equal(report.presentationCases, 5);
  assert.equal(report.mathCases, Math.max(1, project.math.betModes.length) * 3);
  assert.equal(report.passedCases, report.total);
  assert.equal(summary.complete, true);
  assert.ok(report.cases.filter(item => item.kind === 'presentation').every(item => item.cues > 0));
  assert.ok(report.cases.filter(item => item.kind === 'math').every(item => item.outcomeHash.length === 8));
});

test('replay evidence is tied to the executable math and presentation revision', async () => {
  const project = createGameProject({ name: 'Replay Revision Fixture' });
  await runReplayMatrixQA(project);
  const originalFingerprint = getReplayFingerprint(project);
  project.math.reelStrips.BR[0].reverse();
  const summary = getReplayMatrixSummary(project);
  assert.notEqual(summary.fingerprint, originalFingerprint);
  assert.equal(summary.stale, true);
  assert.equal(summary.complete, false);
});

test('a missing critical presentation recipe blocks the replay matrix', async () => {
  const project = createGameProject({ name: 'Replay Failure Fixture' });
  project.presentationDirector.recipes = project.presentationDirector.recipes.filter(recipe => recipe.event !== 'wincap');
  const report = await runReplayMatrixQA(project);
  assert.equal(report.passed, false);
  assert.ok(report.structuralIssues.some(message => message.includes('wincap')));
});
