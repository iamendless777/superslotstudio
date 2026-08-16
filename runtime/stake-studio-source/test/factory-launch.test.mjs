import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { getCreativeFactoryGate } from '../src/engines/factory/FactoryRunEngine.js';
import { prepareFactoryLaunch } from '../src/engines/factory/FactoryLaunchEngine.js';

test('one launch brief creates a greenlit executable project without a paid provider', () => {
  const project = createGameProject({ name: 'Ash Tribunal' });
  const result = prepareFactoryLaunch(project, {
    name: 'Ash Tribunal',
    premise: 'An infernal captain breaks a contract inside a burning celestial court.',
    tone: 'brutal',
    providerName: 'Northstar Forge',
    blueprintId: 'wild_forge',
    seed: 'ash-tribunal-v1',
  });
  assert.equal(project.name, 'Ash Tribunal');
  assert.equal(project.blueprint.id, 'wild_forge');
  assert.equal(project.build.stakeEngine.providerName, 'Northstar Forge');
  assert.equal(project.creativeDirector.provider, 'offline');
  assert.equal(project.creativeDirector.providers.openai.enabled, false);
  assert.ok(project.visualFactory.artBible.lockedFingerprint);
  assert.equal(getCreativeFactoryGate(project).complete, true);
  assert.equal(result.concept.blueprintId, 'wild_forge');
  assert.equal(result.creativeGate.complete, true);
});

test('factory launch refuses to invent provider identity or accept an unknown blueprint', () => {
  const project = createGameProject({ name: 'Guarded Launch' });
  assert.throws(() => prepareFactoryLaunch(project, {
    premise: 'A cosmic engine wakes beneath a ruined arena.',
  }), /real provider name/);
  assert.throws(() => prepareFactoryLaunch(project, {
    premise: 'A cosmic engine wakes beneath a ruined arena.',
    providerName: 'Northstar Forge',
    blueprintId: 'not-a-blueprint',
  }), /Unknown game blueprint/);
});

test('a sticky-reels launch preserves the exact behavior without claiming it is executable yet', () => {
  const project = createGameProject({ name: 'WIZARD CRAFT' });
  const result = prepareFactoryLaunch(project, {
    name: 'WIZARD CRAFT',
    premise: 'An impossible spellsmith workshop binds sticky whole-reel multiplier seals during the feature.',
    tone: 'mysterious',
    providerName: 'REALITY BEAST',
    blueprintId: 'multiplier_arena',
    mechanicContractId: 'sticky-reels',
    seed: 'wizard-craft-contract-test',
  });

  assert.equal(project.factoryLaunch.mechanicContractId, 'sticky-reels');
  assert.equal(project.production.mechanicContracts.stickyReels.executable, false);
  assert.match(project.production.mechanicContracts.stickyReels.releaseBlocker, /port and verify/i);
  assert.equal(project.production.mechanicContracts.stickyReels.featureTiers[2].freeSpins, 12);
  assert.equal(result.mechanicContract.format, 'stake-studio-sticky-reels-contract-v1');
});
