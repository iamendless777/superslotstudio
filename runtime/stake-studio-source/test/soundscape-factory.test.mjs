import test from 'node:test';
import assert from 'node:assert/strict';

import { SOUNDSCAPE_PROFILES, generateSoundscapePack } from '../src/engines/audio/SoundscapeFactory.js';

const fastOptions = { profile: 'mythicDoom', seed: 77, bpm: 150, bars: 2 };

test('soundscape catalog provides distinct production directions', () => {
  assert.ok(Object.keys(SOUNDSCAPE_PROFILES).length >= 6);
  for (const [key, profile] of Object.entries(SOUNDSCAPE_PROFILES)) {
    assert.ok(profile.label, `${key} needs a label`);
    assert.ok(profile.description, `${key} needs a description`);
    assert.equal(profile.progression.at(-1), 0, `${key} should resolve to its root for looping`);
    assert.ok(profile.scale.length >= 5);
  }
});

test('one seed creates matched base, bonus and ambience layers', () => {
  const pack = generateSoundscapePack(fastOptions);
  assert.deepEqual(Object.keys(pack), ['baseMusic', 'bonusMusic', 'ambience']);
  for (const [layer, asset] of Object.entries(pack)) {
    assert.match(asset.src, /^data:audio\/wav;base64,/);
    assert.equal(asset.loop, true);
    assert.equal(asset.source, 'procedural-music');
    assert.equal(asset.factory.layer, layer);
    assert.equal(asset.factory.profile, 'mythicDoom');
    assert.equal(asset.factory.seed, 77);
    assert.equal(asset.factory.bpm, 150);
    assert.equal(asset.factory.bars, 2);
    assert.equal(asset.factory.loopSafe, true);
    assert.ok(asset.factory.peak < 0.8);
    assert.ok(asset.factory.rms > 0.02);
  }
  assert.equal(pack.baseMusic.factory.duration, pack.bonusMusic.factory.duration);
  assert.equal(pack.baseMusic.factory.duration, pack.ambience.factory.duration);
  assert.notEqual(pack.baseMusic.src, pack.bonusMusic.src);
});

test('soundscape output is deterministic for identical factory inputs', () => {
  const first = generateSoundscapePack(fastOptions);
  const second = generateSoundscapePack(fastOptions);
  assert.equal(first.baseMusic.src, second.baseMusic.src);
  assert.equal(first.bonusMusic.src, second.bonusMusic.src);
  assert.equal(first.ambience.src, second.ambience.src);
});

test('changing the seed changes every generated layer', () => {
  const first = generateSoundscapePack(fastOptions);
  const second = generateSoundscapePack({ ...fastOptions, seed: 78 });
  assert.notEqual(first.baseMusic.src, second.baseMusic.src);
  assert.notEqual(first.bonusMusic.src, second.bonusMusic.src);
  assert.notEqual(first.ambience.src, second.ambience.src);
});
