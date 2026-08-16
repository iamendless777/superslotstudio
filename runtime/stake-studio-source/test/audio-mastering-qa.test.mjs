import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createGameProject } from '../src/engines/schema.js';
import { generateCoreSfxPack } from '../src/engines/audio/AudioFactory.js';
import {
  buildAudioMasteringInventory,
  evaluateAudioMastering,
  getAudioMasteringSummary,
  recordAudioMasteringQA,
} from '../src/engines/quality/AudioMasteringQA.js';

function fixture() {
  const project = createGameProject({ name: 'Audio Mastering Fixture' });
  project.audio.stingers = generateCoreSfxPack();
  project.audio.layers.ambience = { src: 'data:audio/wav;base64,YQ==', volume: 0.45, loop: true, source: 'imported' };
  project.audio.layers.bonusMusic = { src: 'data:audio/wav;base64,Yg==', volume: 0.7, loop: true, source: 'imported' };
  return project;
}

function healthySamples(project) {
  return buildAudioMasteringInventory(project).map(asset => ({
    id: asset.id,
    loaded: true,
    sourceFingerprint: asset.id,
    mime: 'audio/wav',
    portable: true,
    duration: asset.type === 'stinger' ? 0.6 : 8,
    sampleRate: 44100,
    channels: 1,
    sampleCount: 26460,
    peak: 0.89,
    rms: asset.bus === 'ambience' ? 0.08 : 0.12,
    dcOffset: 0.001,
    clippedSamples: 0,
    leadingSilenceMs: 8,
    trailingSilenceMs: 12,
  }));
}

test('healthy decoded assets, cue timing and ducking pass mastering QA', () => {
  const project = fixture();
  const evaluation = evaluateAudioMastering(project, healthySamples(project));
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.loudness.passed, true);
  assert.equal(evaluation.synchronization.passed, true);
  assert.equal(evaluation.ducking.passed, true);
  assert.equal(evaluation.decodedAssets, evaluation.totalAssets);
});

test('measured clipping, DC offset and late silence block loudness evidence', () => {
  const project = fixture();
  const samples = healthySamples(project);
  const stinger = samples.findIndex(sample => sample.id.startsWith('stinger:'));
  samples[stinger] = { ...samples[stinger], peak: 1, clippedSamples: 14, dcOffset: 0.08, leadingSilenceMs: 240 };
  const evaluation = evaluateAudioMastering(project, samples);
  assert.equal(evaluation.loudness.passed, false);
  assert.ok(evaluation.issues.some(issue => issue.includes('clipped')));
  assert.ok(evaluation.issues.some(issue => issue.includes('DC offset')));
  assert.ok(evaluation.issues.some(issue => issue.includes('silence')));
});

test('late presentation cues and unsafe ducking configuration are measured separately', () => {
  const project = fixture();
  const recipe = project.presentationDirector.recipes.find(item => item.event === 'wincap');
  recipe.cues.find(cue => cue.channel === 'audio').at = 900;
  project.audio.director.ducking.releaseMs = 5000;
  project.audio.director.ducking.events = ['wincap'];
  const evaluation = evaluateAudioMastering(project, healthySamples(project));
  assert.equal(evaluation.synchronization.passed, false);
  assert.equal(evaluation.ducking.passed, false);
  assert.ok(evaluation.synchronization.issues.some(issue => issue.includes('ms from')));
  assert.ok(evaluation.ducking.issues.some(issue => issue.includes('release')));
  assert.ok(evaluation.ducking.issues.some(issue => issue.includes('does not cover')));
});

test('mastering evidence becomes stale whenever audio or cue choreography changes', () => {
  const project = fixture();
  recordAudioMasteringQA(project, healthySamples(project));
  assert.equal(getAudioMasteringSummary(project).complete, true);
  project.audio.director.buses.sfx = 0.81;
  assert.equal(getAudioMasteringSummary(project).stale, true);

  recordAudioMasteringQA(project, healthySamples(project));
  project.presentationDirector.recipes.find(item => item.event === 'winInfo').cues[0].at += 1;
  assert.equal(getAudioMasteringSummary(project).stale, true);
});

test('MCP exposes the browser-decoded mastering audit through the existing Studio command', async () => {
  const mcp = await readFile(new URL('../mcp/server.mjs', import.meta.url), 'utf8');
  assert.match(mcp, /name: 'run_audio_mastering_audit'/);
  assert.match(mcp, /studioCommand\('run_audio_mastering_audit', \{\}, 90000\)/);
  assert.match(mcp, /sharedFrameContent\(\{ command: 'run_audio_mastering_audit', result \}\)/);
});
