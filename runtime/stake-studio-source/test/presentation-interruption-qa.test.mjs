import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { createProfessionalPresentationDirector } from '../src/engines/presentation/PresentationDirector.js';
import {
  getPresentationInterruptionSummary,
  runPresentationInterruptionQA,
} from '../src/engines/presentation/PresentationInterruptionQA.js';
import { QualityDirector } from '../src/engines/quality/QualityDirector.js';

function project() {
  const value = createGameProject({ name: 'Presentation QA' });
  value.presentationDirector = createProfessionalPresentationDirector();
  return value;
}

test('factory choreography passes solo, cancellation, replacement, and queue torture cases', async () => {
  const value = project();
  const report = await runPresentationInterruptionQA(value);
  assert.equal(report.passed, true);
  assert.equal(report.total, value.presentationDirector.recipes.length * 3);
  assert.ok(report.cases.some(item => item.kind === 'policy' && item.policy === 'replace' && item.passed));
  assert.ok(report.cases.some(item => item.kind === 'policy' && item.policy === 'queue' && item.passed));
  assert.equal(getPresentationInterruptionSummary(value).complete, true);
  const check = new QualityDirector(value).audit().checks.find(item => item.id === 'animation-interruption');
  assert.equal(check.passed, true);
  assert.match(check.evidence, /executable solo, cancellation and policy cases passed/);
});

test('ignore policy is exercised while another recipe is active', async () => {
  const value = project();
  value.presentationDirector.recipes.find(item => item.event === 'roundLose').interrupt = 'ignore';
  const report = await runPresentationInterruptionQA(value);
  const policy = report.cases.find(item => item.id === 'policy:round-lose-default');
  assert.equal(policy.policy, 'ignore');
  assert.equal(policy.passed, true);
});

test('editing a cue makes prior interruption evidence stale', async () => {
  const value = project();
  await runPresentationInterruptionQA(value);
  value.presentationDirector.recipes.find(item => item.event === 'wincap').duration += 10;
  const summary = getPresentationInterruptionSummary(value);
  assert.equal(summary.complete, false);
  assert.equal(summary.stale, true);
  assert.equal(summary.passed, 0);
});

test('structurally invalid choreography records a blocked audit', async () => {
  const value = project();
  value.presentationDirector.recipes.find(item => item.event === 'reveal').cues = [];
  const report = await runPresentationInterruptionQA(value);
  assert.equal(report.passed, false);
  assert.equal(report.total, 0);
  assert.match(report.structuralIssues[0], /no presentation cues/);
});
