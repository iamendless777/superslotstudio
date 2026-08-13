import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPHEUS_LUCID_WEIGHT_CANDIDATE,
  applyMorpheusLucidWeightCandidate,
  auditMorpheusLucidWeightPolicy,
} from '../src/engines/morpheus/MorpheusLucidWeightPolicy.js';

test('Lucid candidate makes the full ladder reachable without changing context means', () => {
  const report = auditMorpheusLucidWeightPolicy();
  assert.equal(report.passed, true, report.issues.join('\n'));
  assert.equal(report.contexts.basegame.totalWeight, 10_000_000);
  assert.equal(report.contexts.freegame.totalWeight, 10_000_000);
  assert.equal(report.contexts.basegame.weightedMean, 3.15);
  assert.equal(report.contexts.freegame.weightedMean, 4.7);
  assert.equal(report.contexts.basegame.probabilities.exactly1000, 100 / 10_000_000);
  assert.equal(report.contexts.freegame.probabilities.exactly1000, 500 / 10_000_000);
  assert.equal(report.contexts.basegame.probabilities.atLeast500, 600 / 10_000_000);
  assert.equal(report.contexts.freegame.probabilities.atLeast500, 2500 / 10_000_000);
});

test('Lucid audit rejects a missing value or mean drift', () => {
  const drifted = structuredClone(MORPHEUS_LUCID_WEIGHT_CANDIDATE);
  drifted.basegame[1000] = 0;
  const report = auditMorpheusLucidWeightPolicy(drifted);
  assert.equal(report.passed, false);
  assert.deepEqual(report.contexts.basegame.missing, [1000]);
  assert.match(report.issues.join('\n'), /total weight/);
  assert.match(report.issues.join('\n'), /weighted mean/);
});

test('candidate application remains explicitly short of production optimization', () => {
  const project = applyMorpheusLucidWeightCandidate({ math: { mechanicConfig: {} } });
  const config = project.math.mechanicConfig.multiplierSymbols;
  assert.equal(config.valueWeightStatus, 'candidate-generation-diversity-audited');
  assert.deepEqual(config.unweightedApprovedValues, []);
  assert.equal(config.weightPolicy.passed, true);
});
