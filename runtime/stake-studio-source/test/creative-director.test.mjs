import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  CREATIVE_CONCEPT_FORMAT,
  applyCreativeConcept,
  generateOfflineConcepts,
  getCreativeProviderStatus,
  normalizeCreativeDirectorState,
  validateCreativeConcept,
} from '../src/engines/creative/CreativeDirector.js';
import { getCreativeFactoryGate } from '../src/engines/factory/FactoryRunEngine.js';
import { getVisualCohesionStatus } from '../src/engines/assets/VisualAssetFactory.js';

const brief = {
  premise: 'An oath-broken Valkyrie fights through a frozen afterlife to reclaim her wings.',
  tone: 'cinematic',
  providerName: 'Northstar Games',
  seed: 'frozen-oath-17',
};

test('offline creative generation is deterministic, distinct, and complete', () => {
  const firstProject = createGameProject({ name: 'Frozen Oath' });
  const secondProject = createGameProject({ name: 'Frozen Oath' });
  const first = generateOfflineConcepts(firstProject, brief);
  const second = generateOfflineConcepts(secondProject, brief);

  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map(item => item.id)).size, 3);
  assert.equal(new Set(first.map(item => item.blueprintId)).size, 3);
  for (const concept of first) {
    assert.equal(concept.format, CREATIVE_CONCEPT_FORMAT);
    assert.equal(concept.source.provider, 'offline');
    assert.equal(concept.source.cost, 'none');
    assert.equal(validateCreativeConcept(concept).valid, true);
    assert.equal(concept.differentiators.length, 2);
    assert.ok(concept.colorPalette.length >= 4);
  }
});

test('spellsmith premises select an authored arcane workshop direction', () => {
  const project = createGameProject({ name: 'WIZARD CRAFT' });
  const concepts = generateOfflineConcepts(project, {
    premise: 'Inside an impossible spellsmith workshop, raw magic is forged into permanent whole-reel multiplier seals that remain sticky during the feature.',
    tone: 'mysterious',
    providerName: 'REALITY BEAST',
    seed: 'reality-beast-wizard-craft-clean-restart-2',
    blueprintId: 'multiplier_arena',
  });

  assert.equal(concepts[0].providerName, 'REALITY BEAST');
  assert.match(`${concepts[0].title} ${concepts[0].style} ${concepts[0].lore}`, /spell|wizard|arcane|enchant|magic/i);
  assert.match(`${concepts[0].playerHook} ${concepts[0].signatureMoment} ${concepts[0].differentiators.join(' ')}`, /claimed reel|sticky|bound reel/i);
  assert.doesNotMatch(`${concepts[0].playerHook} ${concepts[0].signatureMoment} ${concepts[0].differentiators.join(' ')}`, /global multiplier/i);
  assert.doesNotMatch(`${concepts[0].title} ${concepts[0].style} ${concepts[0].lore}`, /abyss|leviathan|deep-sea|nautical|infernal|hell/i);
});

test('world selection does not treat embedded text as a theme keyword', () => {
  const project = createGameProject({ name: 'Neutral Workshop' });
  const [concept] = generateOfflineConcepts(project, {
    premise: 'Whole reels receive multiplier seals and increase as they lock.',
    seed: 'word-boundary-regression',
    blueprintId: 'multiplier_arena',
  });

  assert.doesNotMatch(`${concept.title} ${concept.style} ${concept.lore}`, /abyss|leviathan|deep-sea|nautical|infernal|hell/i);
});

test('provider contract keeps the free engine active and a disabled OpenAI slot available later', () => {
  const project = createGameProject();
  const providers = getCreativeProviderStatus(project);
  const offline = providers.find(item => item.id === 'offline');
  const openai = providers.find(item => item.id === 'openai');
  assert.equal(offline.active, true);
  assert.equal(offline.configured, true);
  assert.equal(offline.cost, 'none');
  assert.equal(openai.enabled, false);
  assert.match(openai.status, /available later/);

  project.creativeDirector.providers.openai = {
    ...project.creativeDirector.providers.openai,
    adapter: 'future-studio-adapter',
    model: 'future-model',
    projectId: 'preserved-project-reference',
  };
  const normalized = normalizeCreativeDirectorState(project);
  assert.equal(normalized.providers.openai.adapter, 'future-studio-adapter');
  assert.equal(normalized.providers.openai.model, 'future-model');
  assert.equal(normalized.providers.openai.projectId, 'preserved-project-reference');
});

test('greenlighting compiles a blueprint and fills the full creative factory gate without external work', () => {
  const project = createGameProject({ name: 'Untitled Game' });
  project.audio.layers.baseMusic = { src: 'data:audio/ogg;base64,custom', source: 'recorded' };
  project.animation.spineAssets = [{ name: 'hero', source: 'hero.json' }];
  const audio = structuredClone(project.audio);
  const spine = structuredClone(project.animation.spineAssets);
  const candidates = generateOfflineConcepts(project, brief);

  const result = applyCreativeConcept(project, candidates[0].id, { compileBlueprint: true, renameProject: true });

  assert.equal(project.name, candidates[0].title);
  assert.equal(project.blueprint.id, candidates[0].blueprintId);
  assert.equal(project.production.creative.coreHook, candidates[0].playerHook);
  assert.equal(project.production.creative.signatureMoment, candidates[0].signatureMoment);
  assert.deepEqual(project.production.creative.differentiators, candidates[0].differentiators);
  assert.equal(project.build.stakeEngine.providerName, 'Northstar Games');
  assert.equal(getCreativeFactoryGate(project).complete, true);
  assert.equal(getVisualCohesionStatus(project).ready, true);
  assert.equal(project.creativeDirector.selectedId, candidates[0].id);
  assert.equal(result.artBibleFingerprint, project.visualFactory.artBible.lockedFingerprint);
  assert.deepEqual(project.audio, audio);
  assert.deepEqual(project.animation.spineAssets, spine);
});

test('the director never invents a provider identity', () => {
  const project = createGameProject({ name: 'Identity Safety' });
  const [concept] = generateOfflineConcepts(project, { ...brief, providerName: '' });
  applyCreativeConcept(project, concept, { compileBlueprint: false });
  assert.equal(project.build.stakeEngine.providerName, '');
  assert.equal(getCreativeFactoryGate(project).missing.some(item => item.id === 'provider-name'), true);
});

test('greenlighting refuses to overwrite existing generated visual direction implicitly', () => {
  const project = createGameProject({ name: 'Protected Art' });
  project.visualFactory.assignments.background = {
    format: 'stake-studio-generated-visual-v1',
    coherenceFingerprint: project.visualFactory.artBible.lockedFingerprint,
  };
  const [concept] = generateOfflineConcepts(project, brief);
  assert.throws(
    () => applyCreativeConcept(project, concept, { compileBlueprint: true }),
    /already has generated or approved visual work/,
  );
  assert.equal(project.blueprint, null, 'the safety check runs before executable math is changed');
});
