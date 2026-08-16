import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { BuildEngine } from '../src/engines/build/BuildEngine.js';
import { QualityDirector } from '../src/engines/quality/QualityDirector.js';
import { getPresentationCoverage } from '../src/engines/presentation/PresentationDirector.js';
import {
  BLUEPRINT_CATALOG_VERSION,
  GAME_BLUEPRINTS,
  applyGameBlueprint,
  createBlueprintManifest,
  generateBlueprintReelStrips,
  getBlueprintSummary,
  validateAppliedBlueprint,
  validateBlueprintDefinition,
} from '../src/engines/blueprints/GameBlueprintEngine.js';

function project() {
  const value = createGameProject({ name: 'Blueprint Fixture' });
  value.build.stakeEngine.gameId = 'blueprint_fixture';
  value.build.stakeEngine.providerName = 'Factory Studio';
  value.build.stakeEngine.providerNumber = 42;
  value.theme.symbols[0].src = 'data:image/png;base64,art';
  value.audio.layers.baseMusic = { src: 'data:audio/ogg;base64,music' };
  value.animation.spineAssets = [{ name: 'hero', source: 'hero.json' }];
  return value;
}

test('every factory blueprint is a valid, fingerprinted executable contract', () => {
  assert.equal(Object.keys(GAME_BLUEPRINTS).length, 5);
  for (const blueprint of Object.values(GAME_BLUEPRINTS)) {
    assert.deepEqual(validateBlueprintDefinition(blueprint), []);
    const summary = getBlueprintSummary(blueprint);
    assert.match(summary.fingerprint, /^bp-[0-9a-f]{8}$/);
    assert.equal(summary.modes, 2);
    assert.ok(blueprint.mechanics.length > 0);
  }
});

test('compilation preserves creative assets and provider identity while replacing the executable structure', () => {
  const value = project();
  const originalArt = value.theme.symbols[0].src;
  const originalAudio = structuredClone(value.audio);
  const originalSpine = structuredClone(value.animation.spineAssets);
  const provider = structuredClone(value.build.stakeEngine);

  const result = applyGameBlueprint(value, 'multiplier_arena');

  assert.equal(value.math.gameType, 'ways5x5');
  assert.deepEqual(value.math.bonusMechanics, ['cascades', 'multiplierSymbols', 'increasingMultipliers']);
  assert.deepEqual(value.math.grid.rows, [5, 5, 5, 5, 5]);
  assert.deepEqual(value.math.betModes.map(mode => mode.name), ['base', 'bonus']);
  assert.equal(value.theme.symbols[0].src, originalArt);
  assert.deepEqual(value.audio, originalAudio);
  assert.deepEqual(value.animation.spineAssets, originalSpine);
  assert.deepEqual(value.build.stakeEngine, provider);
  assert.equal(value.build.mathPublish.officialVerification, false);
  assert.match(value.build.mathPublish.invalidatedBy, /multiplier_arena/);
  assert.equal(value.production.qa.playerInformationAudit, null);
  assert.equal(value.production.qa.deterministicReplayVerified, false);
  assert.equal(result.blueprint.id, 'multiplier_arena');
  assert.equal(getPresentationCoverage(value).percent, 100);
});

test('blueprint reel generation is deterministic for the same project and catalog contract', () => {
  const value = project();
  const blueprint = GAME_BLUEPRINTS.cascade_colossus;
  const first = generateBlueprintReelStrips(value, blueprint);
  const second = generateBlueprintReelStrips(value, blueprint);
  assert.deepEqual(first, second);
  assert.equal(first.BR.length, 6);
  assert.equal(first.FR.length, 6);
  assert.notDeepEqual(first.BR[0], first.FR[0]);
});

test('provenance distinguishes catalog corruption from intentional project drift', () => {
  const value = project();
  applyGameBlueprint(value, 'rapid_ways');
  value.math.bonusMechanics = [];
  let validation = validateAppliedBlueprint(value);
  assert.equal(validation.valid, true);
  assert.ok(validation.drift.some(message => message.includes('removed cascades')));

  value.blueprint.fingerprint = 'bp-corrupt';
  validation = validateAppliedBlueprint(value);
  assert.equal(validation.valid, false);
  assert.match(validation.issues[0], /no longer matches/);
  const qualityCheck = new QualityDirector(value).audit().checks.find(check => check.id === 'release-blueprint');
  assert.equal(qualityCheck.passed, false);
});

test('release export carries a standalone blueprint provenance manifest', () => {
  const value = project();
  applyGameBlueprint(value, 'wild_forge');
  const manifest = createBlueprintManifest(value);
  assert.equal(manifest.format, 'stake-studio-game-blueprint-v1');
  assert.equal(manifest.catalogVersion, BLUEPRINT_CATALOG_VERSION);
  assert.equal(manifest.applied.id, 'wild_forge');
  assert.equal(manifest.valid, true);

  const files = new BuildEngine(value).generateBlueprintFiles();
  const exported = JSON.parse(files['stakestudio/blueprint.json']);
  assert.equal(exported.applied.id, 'wild_forge');
  assert.equal(exported.valid, true);
});
