import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStakeApprovalEconomics } from '../src/engines/quality/StakeApprovalProfile.js';
import { createGameProject } from '../src/engines/schema.js';
import { BuildEngine } from '../src/engines/build/BuildEngine.js';
import { validateBlueprintDefinition } from '../src/engines/blueprints/GameBlueprintEngine.js';

test('three-star projects permit the exact 100,000x ceiling and derive a $500 exposure-safe base bet', () => {
  const report = evaluateStakeApprovalEconomics({
    production: { standard: 'stake-three-star' },
    math: { wincap: 100_000, betModes: [{ name: 'base', cost: 1 }] },
  });
  assert.equal(report.passed, true);
  assert.equal(report.maximumBaseBetUsd, 500);
});

test('two-star and over-ceiling selectable modes fail closed while governed nonselectable modes do not', () => {
  const report = evaluateStakeApprovalEconomics({
    production: { standard: 'stake-two-star' },
    math: {
      wincap: 100_000,
      betModes: [
        { name: 'too_expensive', cost: 1_001 },
        { name: 'natural_tier', cost: null, entryPolicy: 'natural' },
        { name: 'gated_tier', cost: null, releaseGated: true },
      ],
    },
  });
  assert.equal(report.passed, false);
  assert.equal(report.issues.length, 2);
});

test('BuildEngine delegates maximum-payout authority to the selected approval profile', () => {
  const project = createGameProject({ name: 'Three Star Fixture' });
  project.production.standard = 'stake-three-star';
  project.math.wincap = 100_000;
  project.math.wincapRtp = 0.01;
  project.math.betModes = [{
    name: 'base', cost: 1, rtp: project.math.rtp, profile: { entry: 'base' },
  }];

  const threeStarErrors = new BuildEngine(project).validate().errors;
  assert.equal(threeStarErrors.some(issue => /50,000|exceeds stake-three-star maximum/i.test(issue)), false);

  project.production.standard = 'stake-two-star';
  const twoStarErrors = new BuildEngine(project).validate().errors;
  assert.equal(twoStarErrors.some(issue => /exceeds stake-two-star maximum 25000x/i.test(issue)), true);
});

test('blueprints use explicit approval profiles instead of a universal 50,000x ceiling', () => {
  const fixture = {
    id: 'three_star_blueprint',
    gameType: 'ways',
    grid: { reels: 5, rows: [3, 3, 3, 3, 3] },
    rtp: 0.96,
    wincap: 100_000,
    approvalProfile: 'stake-three-star',
    mechanics: ['cascades'],
    betModes: [{ name: 'base', cost: 1, rtp: 0.96 }],
  };
  assert.deepEqual(validateBlueprintDefinition(fixture), []);

  fixture.approvalProfile = 'stake-two-star';
  assert.equal(validateBlueprintDefinition(fixture).some(issue => /exceeds stake-two-star maximum 25000x/i.test(issue)), true);
});
