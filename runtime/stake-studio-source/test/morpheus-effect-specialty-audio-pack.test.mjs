import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioDirector } from '../src/engines/audio/AudioDirector.js';
import {
  MORPHEUS_EFFECT_AUDIO_PACK_ID,
  MORPHEUS_EFFECT_CUE_SPECS,
  auditMorpheusEffectCuePack,
  generateMorpheusEffectCuePack,
  installMorpheusEffectCuePack,
} from '../src/engines/audio/SpecialtyCueFactory.js';
import { MorpheusEffectOrchestrationPreviewDriver } from '../src/engines/presentation/morpheus/MorpheusEffectOrchestrationPreviewDriver.js';

const baseProject = () => ({
  name: 'MORPHEUS: DREAMFALL',
  audio: {
    layers: {},
    stingers: {
      cascadeDrop: { src: 'data:audio/wav;base64,AAAA', source: 'fixture' },
    },
    director: { ducking: { enabled: true, events: [] } },
    factory: { version: 1, generatedAssets: 0, lastSource: null },
  },
  production: { audio: { loudnessNormalized: true, synchronizationReviewed: true, masteringAudit: { passed: true } } },
});

const catalogFrom = project => ({
  motionAssetIds: [
    'dreamfall.motion.mystery-veil-seam',
    'dreamfall.motion.oneiric-star-prism',
    'dreamfall.motion.oneiric-impact',
    'dreamfall.motion.max-morpheus-ascension',
  ],
  presentationAssetKeys: ['verdictPlate'],
  characterStates: ['wincap'],
  audioCueIds: Object.keys(project.audio.stingers),
  audioCueAssets: Object.fromEntries(Object.entries(project.audio.stingers).map(([id, asset]) => [id, {
    source: asset.source,
    factory: asset.factory,
    orchestration: asset.orchestration,
  }])),
});

test('specialty factory creates sixteen deterministic, distinct, peak-safe Morpheus identities', () => {
  const first = generateMorpheusEffectCuePack({ seed: 7711 });
  const second = generateMorpheusEffectCuePack({ seed: 7711 });
  const expected = Object.keys(MORPHEUS_EFFECT_CUE_SPECS);
  assert.equal(first.packId, MORPHEUS_EFFECT_AUDIO_PACK_ID);
  assert.deepEqual(first.cueIds, expected);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(Object.keys(first.cues).length, 16);
  assert.equal(new Set(Object.values(first.cues).map(asset => asset.factory.fingerprint)).size, 16);
  for (const cueId of expected) {
    const asset = first.cues[cueId];
    assert.equal(asset.src, second.cues[cueId].src);
    assert.match(asset.src, /^data:audio\/wav;base64,/);
    assert.equal(asset.factory.approvalStatus, 'foundation');
    assert.ok(asset.factory.peak <= 0.95);
    assert.ok(asset.factory.rms >= 0.025);
    assert.equal(asset.factory.clippedSamples, 0);
    assert.ok(asset.orchestration.exclusiveGroup);
    assert.ok(Number.isFinite(asset.orchestration.priority));
  }
});

test('install records replaceable provenance, invalidates mastering evidence, and passes foundation audit', () => {
  const project = baseProject();
  const result = installMorpheusEffectCuePack(project, { seed: 8812 });
  assert.equal(result.audit.foundationReady, true);
  assert.equal(result.audit.productionReady, false);
  assert.equal(result.audit.installedCueCount, 16);
  assert.equal(project.audio.specialtyPacks[MORPHEUS_EFFECT_AUDIO_PACK_ID].approvalStatus, 'foundation');
  assert.equal(project.audio.factory.lastSource, MORPHEUS_EFFECT_AUDIO_PACK_ID);
  assert.equal(project.production.audio.masteringAudit, null);
  assert.equal(project.production.audio.loudnessNormalized, false);
  assert.equal(project.production.audio.synchronizationReviewed, false);
  assert.deepEqual(auditMorpheusEffectCuePack(project), result.audit);
});

test('specialty ducking metadata is honored independently of the legacy event allowlist', () => {
  const project = baseProject();
  installMorpheusEffectCuePack(project, { seed: 9913 });
  const director = new AudioDirector(project, () => 0.5);
  const max = project.audio.stingers['morpheus.audio.max-morpheus'];
  const target = project.audio.stingers['morpheus.audio.star-target-selected'];
  assert.equal(director.shouldDuck('morpheus.audio.max-morpheus', max), true);
  assert.equal(director.shouldDuck('morpheus.audio.star-target-selected', target), false);
});

test('installed cues close route audio gaps but remain non-production until human approval', async () => {
  const project = baseProject();
  installMorpheusEffectCuePack(project, { seed: 10114 });
  const rendered = [];
  const driver = new MorpheusEffectOrchestrationPreviewDriver({
    routeId: 'mysteryStarDreamfallTumble',
    motionMode: 'reduced',
    catalog: catalogFrom(project),
    renderCommand: async ({ plan }) => {
      rendered.push(plan);
      return `audio:${plan.semantic.eventType}:${plan.semanticHash}`;
    },
  });
  const report = await driver.play();
  assert.equal(report.passed, true);
  assert.equal(report.coverage.missing.audio.length, 0);
  assert.equal(report.presentationPlans.filter(plan => plan.semantic.audio.decision === 'specialty-cue').every(plan => plan.audioReady), true);
  assert.equal(report.presentationPlans.filter(plan => plan.semantic.audio.decision === 'specialty-cue').every(plan => !plan.audioProductionReady), true);
  assert.equal(report.productionReady, false);
  assert.equal(rendered.length, 9);
});

test('approved specialty sources can satisfy the audiovisual production gate without changing trace semantics', async () => {
  const project = baseProject();
  installMorpheusEffectCuePack(project, { seed: 12116, approvalStatus: 'approved' });
  const driver = new MorpheusEffectOrchestrationPreviewDriver({
    routeId: 'exactMaxTermination',
    motionMode: 'reduced',
    catalog: catalogFrom(project),
    renderCommand: async ({ plan }) => `approved:${plan.semanticHash}`,
  });
  const report = await driver.play();
  assert.equal(report.passed, true);
  assert.equal(report.coverage.missing.audio.length, 0);
  assert.equal(report.productionReady, true);
  assert.equal(report.runtime.protocolEvidence.eventHash, '97db83cc');
  assert.equal(report.runtime.protocolEvidence.boardHash, '2e3094e8');
  assert.equal(report.runtime.protocolEvidence.stateHash, 'a150b176');
});
