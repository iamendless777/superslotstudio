import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  SAFE_REPAIR_FORMAT,
  addSafeRepairResult,
  applySafeRepairs,
  finalizeSafeRepairRun,
} from '../src/engines/quality/SafeRepairOrchestrator.js';

function fakePrepare(project) {
  project.audio.layers.baseMusic = { src: 'data:audio/wav;base64,base', source: 'procedural-music' };
  project.audio.stingers.spinStart = { src: 'data:audio/wav;base64,spin', source: 'procedural' };
  project.audio.stingers.reelStop = [{ src: 'data:audio/wav;base64,stop', source: 'procedural' }];
  project.audio.stingers.winSmall = { src: 'data:audio/wav;base64,small', source: 'procedural' };
  project.audio.stingers.bonusTrigger = { src: 'data:audio/wav;base64,bonus', source: 'procedural' };
  return { sfx: 4, soundscapeLayers: 1, soundscapeProfile: 'mythicDoom' };
}

test('safe repair restores deterministic contracts without inventing release evidence', () => {
  const project = createGameProject({
    name: 'Valkyrie Repair Fixture',
    theme: { style: 'painterly norse fantasy', lore: 'A frozen oath trial above the battlefield.' },
  });
  const customRecipe = { ...project.presentationDirector.recipes[0], name: 'Authored spin launch' };
  project.presentationDirector.recipes = [customRecipe];
  project.production.standard = 'custom';
  project.production.budgets.targetFps = 20;
  project.animation.runtime.reducedMotion = 'ignore';
  project.build.simulations = { base: 100, bonus: 100 };

  const report = applySafeRepairs(project, { prepareFactoryProject: fakePrepare });

  assert.equal(report.format, SAFE_REPAIR_FORMAT);
  assert.equal(project.production.standard, 'stake-three-star');
  assert.equal(project.production.budgets.targetFps, 60);
  assert.equal(project.animation.runtime.reducedMotion, 'respect');
  assert.equal(project.build.simulations.base, 500000);
  assert.equal(project.presentationDirector.recipes.find(item => item.event === customRecipe.event).name, 'Authored spin launch');
  assert.ok(project.presentationDirector.recipes.length > 1);
  assert.equal(project.audio.layers.baseMusic.source, 'procedural-music');
  assert.ok(project.visualFactory.artBible.lockedFingerprint);
  assert.ok(project.theme.colorPalette.length >= 4);
  assert.equal(project.production.qa.gameCertification, null);
  assert.ok(report.applied.some(item => item.id === 'professional-contract'));
  assert.ok(report.applied.some(item => item.id === 'presentation-recipes'));
  assert.ok(report.applied.some(item => item.id === 'generated-audio'));
  assert.ok(report.applied.some(item => item.id === 'art-direction'));
});

test('blank creative direction is deferred instead of replaced with generic approval', () => {
  const project = createGameProject({ name: 'Unspecified Theme' });
  const report = applySafeRepairs(project, { prepareFactoryProject: fakePrepare });
  assert.equal(project.visualFactory.artBible.lockedFingerprint, null);
  assert.ok(report.notes.some(item => item.id === 'art-direction' && /Theme style or lore/.test(item.reason)));
});

test('authored visual assignments prevent silent art-bible changes', () => {
  const project = createGameProject({ name: 'Assigned Art', theme: { style: 'neon cyber city' } });
  project.visualFactory.assignments.symbol = { assignmentKey: 'symbol', src: 'data:image/png;base64,fixture' };
  const report = applySafeRepairs(project, { prepareFactoryProject: fakePrepare });
  assert.equal(project.visualFactory.artBible.lockedFingerprint, null);
  assert.ok(report.notes.some(item => /Existing generated assignments/.test(item.reason)));
});

test('frontend results and final certification are attached to one repair report', () => {
  const project = createGameProject({ name: 'Repair Report Fixture' });
  const report = applySafeRepairs(project, { prepareFactoryProject: fakePrepare });
  addSafeRepairResult(report, { id: 'frontend-compile', label: 'Stake frontend', detail: 'Compiled.' });
  const certification = {
    complete: false,
    fingerprint: 'certificate-123',
    repairs: [{ id: 'release-math', label: 'Math', remedy: 'Verify books.', evidence: '', severity: 'blocker', panel: 'build' }],
  };
  const final = finalizeSafeRepairRun(project, certification);
  assert.equal(final.status, 'completed-with-deferred-repairs');
  assert.equal(final.certificationFingerprint, 'certificate-123');
  assert.equal(final.deferred.length, 1);
  assert.ok(final.applied.some(item => item.id === 'frontend-compile'));
});
