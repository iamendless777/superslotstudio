import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { generateCoreSfxPack } from '../src/engines/audio/AudioFactory.js';
import {
  AUDIO_EVENT_SEQUENCE,
  AudioDirector,
  audioAssetBus,
  auditAudioDirector,
  createProfessionalAudioDirector,
  normalizeAudioDirector,
} from '../src/engines/audio/AudioDirector.js';

test('professional audio director normalizes unsafe configuration', () => {
  const profile = normalizeAudioDirector({
    buses: { music: 9, voice: -2 },
    ducking: { amount: 2, attackMs: 0, releaseMs: 9000, events: ['wincap', 'invalid'] },
    variation: { pitchJitterCents: 500, volumeJitter: -1 },
    concurrency: { totalStingers: 0, sameEvent: 99 },
  });
  assert.equal(profile.buses.music, 1.25);
  assert.equal(profile.buses.voice, 0);
  assert.equal(profile.ducking.amount, 0.9);
  assert.equal(profile.ducking.attackMs, 5);
  assert.equal(profile.ducking.releaseMs, 5000);
  assert.deepEqual(profile.ducking.events, ['wincap']);
  assert.equal(profile.variation.pitchJitterCents, 100);
  assert.equal(profile.variation.volumeJitter, 0);
  assert.equal(profile.concurrency.totalStingers, 1);
  assert.equal(profile.concurrency.sameEvent, 8);
});

test('variation selector avoids an immediate repeat', () => {
  const project = createGameProject();
  const director = new AudioDirector(project, () => 0);
  const assets = [{ src: 'a' }, { src: 'b' }, { src: 'c' }];
  const first = director.chooseVariation('reelStop', assets);
  const second = director.chooseVariation('reelStop', assets);
  assert.equal(first.index, 0);
  assert.equal(second.index, 1);
});

test('voice assets use the voice bus and trigger ducking', () => {
  const project = createGameProject();
  const director = new AudioDirector(project, () => 0.5);
  const voice = { src: 'voice.mp3', source: 'openai-voice' };
  assert.equal(audioAssetBus('stinger', voice), 'voice');
  assert.equal(director.shouldDuck('bonusEnd', voice), true);
  assert.equal(director.shouldDuck('wincap', { src: 'impact.wav', source: 'procedural' }), true);
  assert.equal(director.shouldDuck('winSmall', { src: 'impact.wav', source: 'procedural' }), false);
});

test('factory pack passes event coverage, variation and peak audit', () => {
  const project = createGameProject();
  project.audio.stingers = generateCoreSfxPack();
  project.audio.layers.ambience = { src: 'ambience.ogg', volume: 0.4, loop: true, source: 'imported' };
  const audit = auditAudioDirector(project);
  assert.equal(audit.assignedEvents, AUDIO_EVENT_SEQUENCE.length);
  assert.equal(audit.coverage, 100);
  assert.equal(audit.reelVariations, 5);
  assert.equal(audit.scatterVariations, 5);
  assert.deepEqual(audit.unsafePeaks, []);
  assert.equal(audit.ready, true);
});

test('audit reports repetition, missing-event and clipping risks', () => {
  const project = createGameProject();
  project.audio.director = createProfessionalAudioDirector();
  project.audio.stingers.spinStart = { src: 'bad.wav', factory: { peak: 1 } };
  project.audio.stingers.reelStop = [{ src: 'only.wav', factory: { peak: 0.8 } }];
  const audit = auditAudioDirector(project);
  assert.ok(audit.missingEvents.includes('wincap'));
  assert.deepEqual(audit.unsafePeaks, ['spinStart']);
  assert.ok(audit.warnings.some(message => message.includes('three reel-stop')));
  assert.equal(audit.ready, false);
});
