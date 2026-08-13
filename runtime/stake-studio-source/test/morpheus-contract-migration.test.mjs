import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

test('Morpheus migration is dry-run by default and invalidates stale publish only with --apply', () => {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-contract-migration-'));
  const path = join(root, 'project.json');
  const project = {
    build: {
      stakeEngine: { gameId: 'morpheus_dreamfall' },
      mathPublish: { contractFingerprint: 'old', officialVerification: true, fullStreamIntegrity: true, rtpAligned: true },
    },
    production: { standard: 'stake-three-star' },
    math: {
      wincap: 50_000,
      wincapRtp: 0.005,
      betModes: [
        ['base', 1], ['dream_enhancer', 3], ['trickster_dream', 75], ['veil_ascent', 100], ['lucid_blessing', 200],
      ].map(([name, cost]) => ({ name, cost, rtp: 0.96, maxWin: 50_000, profile: {} })),
      mechanicConfig: { multiplierSymbols: { values: { basegame: { 2: 50, 3: 30 }, freegame: { 2: 50, 3: 30 } } } },
    },
  };
  writeFileSync(path, JSON.stringify(project));
  const command = fileURLToPath(new URL('../scripts/migrate-morpheus-approved-contract.mjs', import.meta.url));
  const dry = JSON.parse(execFileSync(process.execPath, [command, path], { encoding: 'utf8' }));
  assert.equal(dry.applied, false);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).math.wincap, 50_000);
  const applied = JSON.parse(execFileSync(process.execPath, [command, path, '--apply'], { encoding: 'utf8' }));
  assert.equal(applied.applied, true);
  const migrated = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(migrated.math.wincap, 100_000);
  assert.equal(migrated.math.wincapRtp, 0.01);
  assert.equal(migrated.math.maxWinHitRate, 0);
  assert.equal(migrated.math.maxWinCalibrationPolicy, 'separate-criterion-v1');
  assert.equal(migrated.production.approvedContract.maximumWinProbabilityPolicy, 'cost-aware-rtp-allocation-v1');
  assert.equal(migrated.production.approvedContract.baseMaximumWinOdds, 10_000_000);
  assert.equal(migrated.production.approvedContract.ordinaryMaximumPayoutMultiplier, 99_999.9);
  assert.equal(migrated.math.governedModes.modes.length, 8);
  assert.deepEqual(migrated.math.mechanicConfig.multiplierSymbols.approvedValueLadder, [2, 3, 5, 7, 10, 25, 50, 100, 200, 500, 1000]);
  assert.equal(migrated.math.mechanicConfig.multiplierSymbols.values.basegame[1000], 100);
  assert.equal(migrated.math.mechanicConfig.multiplierSymbols.values.freegame[1000], 500);
  assert.equal(migrated.math.mechanicConfig.multiplierSymbols.valueWeightStatus, 'candidate-generation-diversity-audited');
  assert.deepEqual(migrated.math.mechanicConfig.multiplierSymbols.unweightedApprovedValues, []);
  assert.equal(migrated.math.mechanicConfig.multiplierSymbols.weightPolicy.passed, true);
  assert.deepEqual(migrated.math.betModes.map(mode => mode.name), ['base', 'dream_enhancer', 'trickster_dream', 'veil_ascent', 'lucid_blessing']);
  const trickster = migrated.math.betModes.find(mode => mode.name === 'trickster_dream');
  assert.equal(trickster.profile.entry, 'base');
  assert.equal(trickster.profile.triggerFreeSpins, false);
  assert.equal(trickster.profile.positionMultiplierGrid, true);
  assert.equal(migrated.build.mathPublish.officialVerification, false);
  assert.equal(migrated.build.mathPublish.contractFingerprint, null);
  rmSync(root, { recursive: true, force: true });
});
