import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  WIN_TIER_ORDER,
  PresentationDirectorRuntime,
  getPresentationRecipeDuration,
  getReelStopSchedule,
} from '../src/engines/presentation/PresentationDirector.js';
import {
  evaluatePresentationPolish,
  getPresentationPolishSummary,
  recordPresentationPolishQA,
} from '../src/engines/quality/PresentationPolishQA.js';

function fixture() {
  const project = createGameProject({ name: 'Presentation Polish Fixture' });
  for (const tier of [...WIN_TIER_ORDER, 'wincap']) project.animation.states[tier].layers = [{ type: 'pose', name: tier }];
  return project;
}

test('factory reel cadence and authored win tiers pass polish QA', () => {
  const project = fixture();
  const evaluation = evaluatePresentationPolish(project);
  const regular = getReelStopSchedule(project, false);
  const anticipation = getReelStopSchedule(project, true);
  assert.equal(evaluation.passed, true);
  assert.deepEqual(evaluation.reels.stopGapsMs, [330, 330, 330, 330]);
  assert.equal(regular.totalMs, 1920);
  assert.equal(anticipation.anticipationCueMs, 1630);
  assert.equal(anticipation.totalMs, 2570);
});

test('tier-aware Director runtime does not truncate a mega-win animation', async () => {
  const project = fixture();
  const recipe = project.presentationDirector.recipes.find(item => item.event === 'winInfo');
  assert.equal(getPresentationRecipeDuration(project, recipe, { amount: 100 }), 5000);
  const waits = [];
  const settles = [];
  const runtime = new PresentationDirectorRuntime(project, {
    wait: async milliseconds => { waits.push(milliseconds); },
    execute: async cue => { if (cue.id === 'settle') settles.push(cue.at); },
  });
  await runtime.dispatch('winInfo', { amount: 100, runningAmount: 100, wins: [] });
  assert.equal(waits.reduce((sum, value) => sum + value, 0), 5000);
  assert.deepEqual(settles, [5000]);
});

test('sub-1x wins use a compact acknowledgement without changing higher tiers', () => {
  const project = fixture();
  const recipe = project.presentationDirector.recipes.find(item => item.event === 'winInfo');
  assert.equal(getPresentationRecipeDuration(project, recipe, { amount: 0.2 }), 900);
  assert.equal(getPresentationRecipeDuration(project, recipe, { amount: 2 }), 1200);
  assert.equal(getPresentationRecipeDuration(project, recipe, { amount: 10 }), 2500);
});

test('flat reel stops, weak anticipation and duplicate win motion are blocking', () => {
  const project = fixture();
  project.presentationDirector.reelChoreography.perReelDelayMs = 0;
  project.presentationDirector.reelChoreography.perReelDurationMs = 0;
  project.presentationDirector.reelChoreography.anticipationHoldMs = 100;
  project.animation.states.winMedium.layers = project.animation.states.winSmall.layers;
  const evaluation = evaluatePresentationPolish(project);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(issue => issue.includes('Reel stop gaps')));
  assert.ok(evaluation.issues.some(issue => issue.includes('anticipation hold')));
  assert.ok(evaluation.issues.some(issue => issue.includes('identical authored animation')));
});

test('polish evidence becomes stale after timing or tier animation edits', () => {
  const project = fixture();
  recordPresentationPolishQA(project);
  assert.equal(getPresentationPolishSummary(project).complete, true);
  project.presentationDirector.reelChoreography.impactMs += 1;
  assert.equal(getPresentationPolishSummary(project).stale, true);
  recordPresentationPolishQA(project);
  project.animation.states.winBig.duration += 1;
  assert.equal(getPresentationPolishSummary(project).stale, true);
});
