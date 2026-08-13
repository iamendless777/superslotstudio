import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  assignGeneratedVisual,
  forgeArtBible,
  getApplicableVisualReferences,
  getGeneratedVisualAnchors,
  getVisualFactoryTargets,
  lockArtBible,
} from '../src/engines/assets/VisualAssetFactory.js';
import {
  beginAssetProductionAttempt,
  createAssetProductionRun,
  finishAssetProductionAttempt,
  getAssetProductionSummary,
  getNextAssetProductionItem,
  resetAssetProductionItem,
} from '../src/engines/assets/AssetProductionConductor.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA';

function directedProject(name = 'Conductor QA') {
  const project = createGameProject({ name });
  project.theme.style = 'premium frozen dark fantasy';
  project.theme.lore = 'A valkyrie judges doomed captains beneath a fractured aurora.';
  project.visualFactory.artBible = forgeArtBible(project);
  lockArtBible(project);
  return project;
}

function passingResult(slot, target, coherenceFingerprint) {
  return {
    format: 'stake-studio-generated-visual-v1', slot, target, dataUrl: png,
    width: 1024, height: slot === 'background' ? 1024 : 1536, coherenceFingerprint,
    analysis: {
      format: 'stake-studio-visual-analysis-v1', passed: true, score: 96,
      blockers: [], warnings: [], checks: [], metrics: {},
    },
  };
}

test('visual conductor plans masters before dependent families and protects provider identity', () => {
  const project = directedProject();
  const before = JSON.stringify(project.theme);
  const run = createAssetProductionRun(project, { quality: 'review', maxAttempts: 2 });
  assert.equal(run.status, 'planned');
  assert.equal(run.items[0].key, 'background');
  assert.ok(run.items.findIndex(item => item.key === 'characterPose:idle') < run.items.findIndex(item => item.key === 'characterPose:winBig'));
  assert.ok(run.items.findIndex(item => item.key === 'symbol:H1') < run.items.findIndex(item => item.key === 'symbol:H2'));
  assert.deepEqual(run.items.find(item => item.key === 'symbol:H2').dependencies, ['background', 'symbol:H1']);
  assert.equal(run.items.find(item => item.key === 'providerLogo').state, 'protected');
  assert.match(run.items.find(item => item.key === 'providerLogo').lastError, /provider name/);
  assert.equal(JSON.stringify(project.theme), before);
  assert.equal(getNextAssetProductionItem(project).key, 'background');
  project.build.stakeEngine.providerName = 'Northstar Games';
  assert.equal(getAssetProductionSummary(project).protected, 0);
  assert.equal(run.items.find(item => item.key === 'providerLogo').state, 'waiting');
});

test('passing generated masters become automatic continuity anchors for later assets', () => {
  const project = directedProject('Anchor QA');
  const fingerprint = project.visualFactory.artBible.lockedFingerprint;
  assignGeneratedVisual(project, passingResult('background', null, fingerprint));
  assignGeneratedVisual(project, passingResult('characterPose', 'idle', fingerprint));
  assignGeneratedVisual(project, passingResult('symbol', 'H1', fingerprint));
  const anchors = getGeneratedVisualAnchors(project);
  assert.deepEqual(anchors.map(anchor => anchor.role), ['style', 'character', 'symbol']);
  const pose = getVisualFactoryTargets(project).find(target => target.key === 'characterPose:winBig');
  assert.deepEqual(getApplicableVisualReferences(project, pose).map(reference => reference.role), ['character', 'style']);
  const symbol = getVisualFactoryTargets(project).find(target => target.key === 'symbol:H2');
  assert.deepEqual(getApplicableVisualReferences(project, symbol).map(reference => reference.role), ['symbol', 'style']);
});

test('measured failures retry only within the configured request ceiling', () => {
  const project = directedProject('Retry QA');
  createAssetProductionRun(project, { maxAttempts: 2 });
  const first = beginAssetProductionAttempt(project, 'background');
  assert.equal(first.attempts, 1);
  finishAssetProductionAttempt(project, 'background', { error: 'framing failed', score: 61, correction: { direction: 'clear the reel zone' } });
  assert.equal(getNextAssetProductionItem(project).key, 'background');
  beginAssetProductionAttempt(project, 'background');
  finishAssetProductionAttempt(project, 'background', { error: 'framing failed again', score: 67 });
  const summary = getAssetProductionSummary(project);
  assert.equal(summary.failed, 1);
  assert.notEqual(getNextAssetProductionItem(project)?.key, 'background');
  resetAssetProductionItem(project, 'background');
  assert.equal(getNextAssetProductionItem(project).key, 'background');
});

test('changing the locked visual contract stops an existing paid plan', () => {
  const project = directedProject('Drift Stop QA');
  createAssetProductionRun(project);
  project.visualFactory.artBible.materials += ', white marble';
  const summary = getAssetProductionSummary(project);
  assert.equal(summary.status, 'blocked');
  assert.match(summary.blockers[0], /changed after this production plan/);
  assert.equal(getNextAssetProductionItem(project), null);
});
