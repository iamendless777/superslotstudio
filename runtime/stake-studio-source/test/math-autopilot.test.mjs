import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { applyGameBlueprint, GAME_BLUEPRINTS } from '../src/engines/blueprints/GameBlueprintEngine.js';
import {
  MATH_AUTOPILOT_FORMAT,
  calibratePrototypeMath,
  getMathCalibrationStatus,
  simulateMathMode,
} from '../src/engines/math/MathAutopilot.js';

function project(blueprintId = 'multiplier_arena') {
  const value = createGameProject({ id: `autopilot-${blueprintId}`, name: 'Math Autopilot Fixture' });
  value.build.stakeEngine.gameId = `autopilot_${blueprintId}`;
  value.build.stakeEngine.providerName = 'Factory Studio';
  applyGameBlueprint(value, blueprintId);
  return value;
}

test('every factory blueprint calibrates every wager mode without changing its shared paytable', () => {
  for (const blueprintId of Object.keys(GAME_BLUEPRINTS)) {
    const value = project(blueprintId);
    const payouts = structuredClone(value.theme.symbols.map(symbol => symbol.payouts));
    const result = calibratePrototypeMath(value, { rounds: 5000, maxPasses: 3 });
    assert.equal(result.format, MATH_AUTOPILOT_FORMAT);
    assert.equal(result.modes.length, value.math.betModes.length);
    assert.equal(result.modes.every(mode => mode.aligned), true, blueprintId);
    assert.equal(result.modes.every(mode => mode.invalidPayouts === 0), true, blueprintId);
    assert.deepEqual(value.theme.symbols.map(symbol => symbol.payouts), payouts, 'mode scaling must not flatten the shared symbol hierarchy');
    assert.equal(getMathCalibrationStatus(value).complete, true);
  }
});

test('calibration is deterministic, reusable, and becomes stale after executable math changes', () => {
  const first = project();
  const second = project();
  const one = calibratePrototypeMath(first, { rounds: 5000 });
  const two = calibratePrototypeMath(second, { rounds: 5000 });
  const compact = result => result.modes.map(mode => ({ name: mode.name, factor: mode.calibratedFactor, rtp: mode.realizedRtp }));
  assert.deepEqual(compact(one), compact(two));

  const reused = calibratePrototypeMath(first, { rounds: 5000 });
  assert.equal(reused.reused, true);
  first.math.mechanicConfig.increasingMultipliers.increment += 1;
  assert.equal(getMathCalibrationStatus(first).stale, true);
  assert.equal(getMathCalibrationStatus(first).complete, false);
});

test('calibration reserves max-win RTP and requires deterministic target alignment', () => {
  const value = project('multiplier_arena');
  value.math.rtp = 0.96;
  value.math.wincapRtp = 0.005;
  for (const mode of value.math.betModes) mode.rtp = 0.96;

  const result = calibratePrototypeMath(value, { rounds: 5000, maxPasses: 5, tolerance: 0.005 });
  for (const mode of result.modes) {
    assert.equal(mode.calibrationTarget, 0.955);
    assert.ok(Math.abs(mode.calibrationDelta) <= 0.005, `${mode.name} missed its normal-return target`);
    assert.equal(mode.aligned, true);
  }
});

test('ordinary calibration can exclude the separately allocated MAX criterion', () => {
  const value = project('multiplier_arena');
  value.math.wincap = 100;
  value.math.wincapRtp = 0.01;
  value.math.maxWinHitRate = 0;
  for (const mode of value.math.betModes) mode.maxWin = 100;
  const withMax = simulateMathMode(value, 'base', { rounds: 1000, seed: 1, includeAllocatedMax: true });
  const ordinary = simulateMathMode(value, 'base', { rounds: 1000, seed: 1, includeAllocatedMax: false });
  assert.equal(ordinary.includeAllocatedMax, false);
  assert.equal(ordinary.maxMorpheusHits, 0);
  assert.equal(withMax.includeAllocatedMax, true);
});

test('separate-criterion calibration records MAX exclusion for optimizer-owned allocation', () => {
  const value = project('multiplier_arena');
  value.math.rtp = 0.96;
  value.math.wincapRtp = 0.005;
  value.math.maxWinCalibrationPolicy = 'separate-criterion-v1';
  for (const mode of value.math.betModes) mode.rtp = 0.96;
  const result = calibratePrototypeMath(value, { rounds: 5000, maxPasses: 5, tolerance: 0.005 });
  assert.equal(result.modes.every(mode => mode.includeAllocatedMax === false), true);
  assert.equal(result.modes.every(mode => mode.maxMorpheusHits === 0), true);
});

test('mode simulation reports reproducible statistical and Stake-increment evidence', () => {
  const value = project('wild_forge');
  calibratePrototypeMath(value, { rounds: 5000 });
  const first = simulateMathMode(value, 'base', { rounds: 5000, seed: 2026 });
  const second = simulateMathMode(value, 'base', { rounds: 5000, seed: 2026 });
  assert.deepEqual(first, second);
  assert.equal(first.invalidPayouts, 0);
  assert.ok(first.hitRate >= 0.05);
  assert.ok(first.standardError > 0);
});

test('autopilot fails closed when a custom paytable cannot produce return', () => {
  const value = project('rapid_ways');
  for (const symbol of value.theme.symbols) symbol.payouts = {};
  value.blueprint = null;
  const profiles = structuredClone(value.math.betModes.map(mode => mode.profile));
  assert.throws(
    () => calibratePrototypeMath(value, { rounds: 5000, maxPasses: 2 }),
    /produced zero simulated return/,
  );
  assert.equal(value.math.calibration, null);
  assert.deepEqual(value.math.betModes.map(mode => mode.profile), profiles, 'a failed calibration must roll back partial mode changes');
});
