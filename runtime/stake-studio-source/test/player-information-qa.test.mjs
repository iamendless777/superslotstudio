import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  PLAYER_INFORMATION_FORMAT,
  createPlayerInformationManifest,
  evaluatePlayerInformation,
  getPlayerInformationSummary,
  recordPlayerInformationQA,
} from '../src/engines/quality/PlayerInformationQA.js';

function completeProject() {
  const project = createGameProject({ name: 'Information Fixture' });
  project.build.stakeEngine.gameId = 'information_fixture';
  project.build.stakeEngine.providerName = 'Factory Studio';
  project.math.betModes = [{
    name: 'base', cost: 1, rtp: 0.965, maxWin: 5000,
    profile: { entry: 'base', reelSet: 'BR', triggerFreeSpins: true },
  }];
  project.math.bonusMechanics = ['cascades'];
  project.math.freespinTriggers = { basegame: { 3: 10, 4: 15, 5: 20 }, freegame: { 3: 3 } };
  return project;
}

test('player information manifest covers identity, math, modes, symbols, features, controls and disclosures', () => {
  const project = completeProject();
  const manifest = createPlayerInformationManifest(project);
  assert.equal(manifest.format, 'stake-studio-player-information-v1');
  assert.equal(manifest.identity.providerName, 'Factory Studio');
  assert.equal(manifest.winSystem.label, '243 Ways');
  assert.match(manifest.winSystem.description, /243 active ways/);
  assert.equal(manifest.modes[0].cost, 1);
  assert.equal(manifest.modes[0].settlementMultiplier, 1);
  assert.ok(manifest.symbols.some(symbol => symbol.payouts['3'] > 0));
  assert.match(manifest.mechanics[0].description, /Winning symbols disappear/);
  assert.match(manifest.triggers[0].text, /3 scatter symbols/);
  assert.ok(manifest.specialRules.some(rule => rule.key === 'wild'));
  assert.ok(manifest.specialRules.some(rule => rule.key === 'scatter'));
  assert.match(manifest.controls, /jurisdiction/);
  assert.match(manifest.disclaimer, /Remote Game Server/);
  assert.match(manifest.disclaimer, /TM and © \d{4} Stake Engine/);
  assert.equal(evaluatePlayerInformation(project).passed, true);
});

test('ways copy and mode pay scale are generated from the executable grid and profile', () => {
  const project = completeProject();
  project.math.grid = { reels: 6, rows: [4, 4, 4, 4, 4, 4] };
  project.math.betModes[0].profile.multiplier = 0.4;
  const manifest = createPlayerInformationManifest(project);
  assert.equal(manifest.winSystem.label, '4,096 Ways');
  assert.match(manifest.winSystem.description, /4,096 active ways/);
  assert.doesNotMatch(manifest.winSystem.description, /243/);
  assert.equal(manifest.modes[0].settlementMultiplier, 0.4);
  assert.match(manifest.controls, /Bonus or the mode chip/);
});

test('audit reports concrete missing player-information inputs', () => {
  const project = createGameProject({ name: 'Incomplete Information' });
  const evaluation = evaluatePlayerInformation(project);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.includes('Stake game ID is missing.'));
  assert.ok(evaluation.issues.includes('Provider name is missing.'));
  assert.ok(evaluation.issues.includes('At least one wager mode is required.'));
  assert.ok(evaluation.issues.some(issue => /entry trigger/.test(issue)));
});

test('recorded evidence is fingerprinted and becomes stale after a rules change', () => {
  const project = completeProject();
  const recorded = recordPlayerInformationQA(project);
  assert.equal(project.production.qa.playerInformationAudit.format, PLAYER_INFORMATION_FORMAT);
  assert.equal(recorded.complete, true);
  project.math.betModes[0].cost = 1.25;
  const stale = getPlayerInformationSummary(project);
  assert.equal(stale.complete, false);
  assert.equal(stale.stale, true);
  assert.notEqual(stale.fingerprint, stale.storedFingerprint);
});

test('unknown mechanics cannot silently ship without a player-facing explanation', () => {
  const project = completeProject();
  project.math.bonusMechanics.push('unregisteredFactoryMechanic');
  const evaluation = evaluatePlayerInformation(project);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some(issue => /no registered player-facing explanation/.test(issue)));
});

test('feature tiers, effect symbols, and enhanced wager modes disclose their executable behavior', () => {
  const project = completeProject();
  project.theme.symbols.push({
    id: 'RIFT', name: 'RIFT', tier: 'special', payouts: {}, special: ['wildBomb'],
  });
  project.math.featureArchitecture = {
    selection: 'exactScatterCount',
    tiers: { 3: { id: 'ascent', name: 'Ascent', spins: 10, mechanic: 'progressiveSymbolUpgrade', meterThreshold: 4 } },
  };
  project.math.betModes.push({
    name: 'enhanced', cost: 3, rtp: 0.965, maxWin: 5000,
    profile: { entry: 'base', scatterWeightMultiplier: 3, triggerFreeSpins: true },
  });
  const manifest = createPlayerInformationManifest(project);
  assert.match(manifest.modes[1].description, /3x scatter-board selection weighting/);
  assert.match(manifest.specialRules.find(rule => rule.key === 'symbol:RIFT').text, /2×2 block/);
  assert.match(manifest.mechanics.find(mechanic => mechanic.key === 'featureTier:ascent').description, /Winning combinations fill the upgrade meter/);
});
