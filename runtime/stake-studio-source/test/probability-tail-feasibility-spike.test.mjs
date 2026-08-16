import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROBABILITY_TAIL_SPIKE_FORMAT,
  auditProbabilityTailMode,
  auditProbabilityTailRecords,
  auditThreeStarApprovalProfile,
  conditionalValueAtRisk,
  runSeededProbabilityTailSpike,
} from '../src/engines/factory/spikes/ProbabilityTailSpike.js';

test('official three-star thresholds reject a distribution whose ETL40 and ETL10k are 0.925', () => {
  const report = auditProbabilityTailMode({
    name: 'proof',
    cost: 1000,
    maximumWin: 100_000,
    baseBetUsd: 500,
    targetRtp: 0.000925,
    rtpTolerance: 0,
    outcomes: [
      { payoutMultiplier: 0, weight: 9_999_799 },
      { payoutMultiplier: 4_575_000, weight: 200 },
      { payoutMultiplier: 10_000_000, weight: 1, maxTriggered: true },
    ],
  });
  // (45,750×200 + 100,000) / 10,000,000 / 1,000 = 0.000925;
  // the assertion deliberately checks the exact Stake normalization by cost.
  assert.equal(report.rtp, 0.000925);
  assert.equal(report.probabilityScale, 0.2);
  assert.equal(report.maximumHitRate, 10_000_000);
  assert.equal(report.checks.maximumReachable, true);
  assert.equal(report.checks.approvalProfile, true);
  assert.equal(report.tails.probabilityAtLeast5000, (201 / 10_000_000) * 0.2);
  assert.equal(report.tails.probabilityAtLeast10000, (201 / 10_000_000) * 0.2);
  assert.equal(report.tails.expectedTailLossAt10000, 0.925);
  assert.equal(report.tails.expectedTailLossAt40Bets, 0.925);
  assert.equal(report.checks.rtp, true);
  assert.equal(report.checks.maximumReachable, true);
  assert.equal(report.checks.expectedTailLossAt40Bets, false);
  assert.equal(report.checks.expectedTailLossAt10000, false);
  assert.equal(report.passed, false);

  const distribution = new Map([[0, 999], [100, 1]]);
  // math-sdk includes the full bucket containing the cutoff. At exactly .999,
  // the zero bucket is the tail boundary, so its result is the distribution mean.
  assert.equal(conditionalValueAtRisk(0.999, distribution, 1000), 0.1);
  assert.equal(conditionalValueAtRisk(0.9999, distribution, 1000), 100);
});

test('deterministic 96% distribution passes unmodified official three-star tails with reachable 100,000x MAX', () => {
  const report = auditProbabilityTailMode({
    name: 'three_star_proof',
    cost: 1000,
    maximumWin: 100_000,
    baseBetUsd: 500,
    targetRtp: 0.96,
    rtpTolerance: 0,
    outcomes: [
      { payoutMultiplier: 0, weight: 400_099 },
      { payoutMultiplier: 100_000, weight: 9_599_900 },
      { payoutMultiplier: 10_000_000, weight: 1, maxTriggered: true },
    ],
  });

  assert.equal(report.totalWeight, 10_000_000);
  assert.equal(report.rtp, 0.96);
  assert.equal(report.maximumHitRate, 10_000_000);
  assert.equal(report.tails.probabilityAtLeast5000, 2e-8);
  assert.equal(report.tails.probabilityAtLeast10000, 2e-8);
  assert.equal(report.tails.expectedTailLossAt40Bets, 0.01);
  assert.equal(report.tails.expectedTailLossAt10000, 0.01);
  assert.ok(Math.abs(report.tails.cvarUpperPointOnePercent - 1.0000103126063487) < 1e-12);
  assert.equal(report.approval.maximumPayoutMultiplier, 100_000);
  assert.equal(report.approval.baseBetUsd, 500);
  assert.equal(report.approval.totalExposureUsd, 50_000_000);
  assert.equal(report.approval.maximumBaseBetUsd, 500);
  assert.equal(report.approval.passed, true);
  assert.deepEqual(report.checks, {
    rtp: true,
    maximumReachable: true,
    probabilityAtLeast5000: true,
    probabilityAtLeast10000: true,
    expectedTailLossAt40Bets: true,
    expectedTailLossAt10000: true,
    cvarUpperPointOnePercent: true,
    approvalProfile: true,
  });
  assert.equal(report.passed, true);
  assert.match(report.evidenceHash, /^[0-9a-f]{8}$/);
});

test('official three-star approval profile rejects 100,001x and base bets above $500 at 100,000x', () => {
  const exact = auditThreeStarApprovalProfile({ maximumPayoutMultiplier: 100_000, baseBetUsd: 500 });
  const overPayout = auditThreeStarApprovalProfile({ maximumPayoutMultiplier: 100_001, baseBetUsd: 500 });
  const overBaseBet = auditThreeStarApprovalProfile({ maximumPayoutMultiplier: 100_000, baseBetUsd: 500.01 });

  assert.equal(exact.passed, true);
  assert.equal(exact.totalExposureUsd, 50_000_000);
  assert.equal(exact.maximumBaseBetUsd, 500);
  assert.equal(overPayout.passed, false);
  assert.equal(overPayout.checks.maximumPayoutMultiplier, false);
  assert.equal(overPayout.checks.totalExposureUsd, false);
  assert.equal(overBaseBet.passed, false);
  assert.equal(overBaseBet.checks.maximumPayoutMultiplier, true);
  assert.equal(overBaseBet.checks.totalExposureUsd, false);
});

test('weighted audit proves Enhancer ratio, exact RTP, MAX reachability, and tail gates', () => {
  const common = {
    cost: 1,
    targetRtp: 0.96,
    rtpTolerance: 0,
    tailLimits: {
      probabilityAtLeast5000: 1,
      probabilityAtLeast10000: 1,
      expectedTailLossAt40Bets: 1,
      expectedTailLossAt10000: 1,
      cvarUpperPointOnePercent: 100,
    },
  };
  const report = auditProbabilityTailRecords({
    enhancerMinimumRatio: 5,
    maximumWin: 0,
    modes: [
      {
        ...common,
        name: 'base',
        outcomes: [
          { payoutMultiplier: 0, weight: 4 },
          { payoutMultiplier: 100, weight: 95 },
          { payoutMultiplier: 100, weight: 1, featureTriggered: true },
        ],
      },
      {
        ...common,
        name: 'dream_enhancer',
        outcomes: [
          { payoutMultiplier: 0, weight: 4 },
          { payoutMultiplier: 100, weight: 89 },
          { payoutMultiplier: 100, weight: 7, featureTriggered: true },
        ],
      },
    ],
  });
  assert.equal(report.format, PROBABILITY_TAIL_SPIKE_FORMAT);
  assert.ok(Math.abs(report.enhancerRatio - 7) < 1e-12);
  assert.equal(report.enhancerRatioPassed, true);
  assert.equal(report.modes[0].rtp, 0.96);
  assert.equal(report.modes[1].rtp, 0.96);
  assert.equal(report.passed, true);
});

test('seeded probability/tail sampling is deterministic and returns Stake book-unit reports', () => {
  const definition = {
    seed: 4404,
    rounds: 10_000,
    maximumWin: 0,
    enhancerMinimumRatio: 5,
    modes: [
      {
        name: 'base', cost: 1,
        sample: ({ round, random }) => ({
          payoutMultiplier: random() < 0.96 ? 100 : 0,
          featureTriggered: round % 100 === 0,
        }),
      },
      {
        name: 'dream_enhancer', cost: 1,
        sample: ({ round, random }) => ({
          payoutMultiplier: random() < 0.96 ? 100 : 0,
          featureTriggered: round % 16 === 0,
        }),
      },
    ],
  };
  const first = runSeededProbabilityTailSpike(definition);
  const second = runSeededProbabilityTailSpike(definition);
  const differentSeed = runSeededProbabilityTailSpike({ ...definition, seed: 4405 });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.modes.map(mode => mode.rtp), differentSeed.modes.map(mode => mode.rtp));
  assert.equal(first.source, 'seeded-sampler');
  assert.equal(first.rounds, 10_000);
  assert.equal(first.enhancerRatio, 6.25);
  assert.equal(first.passed, true);
  assert.ok(first.modes.every(mode => mode.totalWeight === 10_000));
});
