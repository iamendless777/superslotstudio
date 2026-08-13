import test from 'node:test';
import assert from 'node:assert/strict';

import {
  maximumWinHitRateForMode,
  maximumWinOddsForMode,
  maximumWinRtpForMode,
} from '../src/engines/math/MaximumWinPolicy.js';
import { MathSDKExporter } from '../src/engines/build/MathSDKExporter.js';

test('explicit hit-rate policy can keep identical MAX odds across wager modes', () => {
  const math = { wincap: 100_000, wincapRtp: 0, maxWinHitRate: 1 / 10_000_000 };
  for (const cost of [1, 75, 200]) {
    const mode = { cost, maxWin: 100_000 };
    assert.equal(maximumWinHitRateForMode(math, mode), 1 / 10_000_000);
    assert.equal(maximumWinOddsForMode(math, mode), 10_000_000);
    assert.equal(maximumWinRtpForMode(math, mode), 0.01 / cost);
  }
});

test('cost-aware allocation keeps MAX at exactly one RTP point across wager modes', () => {
  const math = { wincap: 100_000, wincapRtp: 0.01, maxWinHitRate: 0 };
  const expected = new Map([
    [1, 10_000_000],
    [3, 10_000_000 / 3],
    [75, 10_000_000 / 75],
    [100, 100_000],
    [200, 50_000],
  ]);
  for (const [cost, odds] of expected) {
    const mode = { cost, maxWin: 100_000 };
    assert.ok(Math.abs(maximumWinOddsForMode(math, mode) - odds) < 1e-8);
    assert.ok(Math.abs(maximumWinRtpForMode(math, mode) - 0.01) < 1e-12);
  }
});

test('legacy RTP-allocation projects retain their cost-dependent probability', () => {
  const math = { wincap: 50_000, wincapRtp: 0.001, maxWinHitRate: 0 };
  const mode = { cost: 100, maxWin: 50_000 };
  assert.equal(maximumWinHitRateForMode(math, mode), 0.000002);
  assert.equal(maximumWinRtpForMode(math, mode), 0.001);
});

test('Morpheus official optimizer reserves 1% MAX and sums every mode to 96% RTP', () => {
  const costs = [1, 3, 75, 100, 200];
  const project = {
    name: 'Morpheus RTP Policy Proof',
    math: {
      rtp: 0.96,
      wincap: 100_000,
      wincapRtp: 0.01,
      maxWinHitRate: 0,
      freespinTriggers: { basegame: { 3: 10 } },
      betModes: costs.map((cost, index) => ({
        name: `mode_${index}`,
        cost,
        rtp: 0.96,
        profile: index < 2
          ? { entry: 'base', triggerFreeSpins: true }
          : index === 2
            ? { entry: 'base', triggerFreeSpins: false }
            : { entry: 'freeSpins', freeSpins: 10 },
      })),
    },
    theme: { symbols: [] },
    build: { stakeEngine: { gameId: 'morpheus_rtp_policy_proof' } },
  };
  const source = new MathSDKExporter(project).genGameOptimization();
  const blocks = [...source.matchAll(/"mode_(\d+)": \{([\s\S]*?)\n            \},/g)];
  assert.equal(blocks.length, costs.length);
  for (const [, index, block] of blocks) {
    const criteria = [...block.matchAll(/ConstructConditions\(rtp=([0-9.]+)/g)].map(match => Number(match[1]));
    assert.equal(criteria[0], 0.01, `mode_${index} MAX allocation drifted`);
    assert.ok(Math.abs(criteria.reduce((sum, value) => sum + value, 0) - 0.96) < 1e-12,
      `mode_${index} optimizer criteria do not sum to 96%`);
  }
});
