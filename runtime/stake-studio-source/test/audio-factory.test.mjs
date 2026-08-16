import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SFX_PRESETS,
  analyzePcm,
  encodeMonoWav,
  generateCoreSfxPack,
  generateGameSound,
  synthesizeGameSound,
} from '../src/engines/audio/AudioFactory.js';

test('every procedural preset renders finite, normalized PCM without clipping', () => {
  for (const preset of Object.keys(SFX_PRESETS)) {
    const rendered = synthesizeGameSound(preset, { seed: 99, intensity: 0.8, variation: 2 });
    const analysis = analyzePcm(rendered.samples);
    assert.ok(rendered.samples.length > 3000, `${preset} should contain audio`);
    assert.ok(rendered.samples.every(Number.isFinite), `${preset} should be finite`);
    assert.ok(analysis.peak >= 0.85 && analysis.peak <= 0.95, `${preset} peak should be mastered`);
    assert.equal(analysis.clippedSamples, 0, `${preset} should not clip`);
    assert.ok(analysis.rms > 0.02, `${preset} should be audible`);
  }
});

test('same seed and variation are deterministic while variations differ', () => {
  const first = synthesizeGameSound('reelStop', { seed: 12, variation: 1 }).samples;
  const same = synthesizeGameSound('reelStop', { seed: 12, variation: 1 }).samples;
  const different = synthesizeGameSound('reelStop', { seed: 12, variation: 2 }).samples;
  assert.deepEqual(first.subarray(0, 500), same.subarray(0, 500));
  assert.notDeepEqual(first.subarray(0, 500), different.subarray(0, 500));
});

test('WAV encoder emits a valid mono 16-bit PCM header', () => {
  const rendered = synthesizeGameSound('winSmall', { duration: 0.1 });
  const wav = encodeMonoWav(rendered.samples, rendered.sampleRate);
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(wav.subarray(8, 12)), 'WAVE');
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(34, true), 16);
});

test('single generated sounds include production provenance', () => {
  const asset = generateGameSound('bonusTrigger', { intensity: 0.7, variation: 4 });
  assert.match(asset.src, /^data:audio\/wav;base64,/);
  assert.equal(asset.source, 'procedural');
  assert.equal(asset.factory.preset, 'bonusTrigger');
  assert.equal(asset.factory.variation, 4);
  assert.equal(asset.factory.sampleRate, 44100);
  assert.ok(asset.factory.peak < 1);
});

test('core pack fills every game event and supplies five land variations', () => {
  const pack = generateCoreSfxPack({ intensity: 0.76 });
  assert.deepEqual(Object.keys(pack).sort(), Object.keys(SFX_PRESETS).sort());
  assert.equal(pack.reelStop.length, 5);
  assert.equal(pack.scatterLand.length, 5);
  assert.ok(pack.reelStop.every(asset => asset.source === 'procedural'));
  assert.notEqual(pack.reelStop[0].src, pack.reelStop[1].src);
});
