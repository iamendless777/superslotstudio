import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { getMathPublisherExecution, getMathPublisherProfile } from '../server/math-publisher.mjs';
import { lockArtBible } from '../src/engines/assets/VisualAssetFactory.js';
import {
  FACTORY_PROFILES,
  FACTORY_STAGE_ORDER,
  createFactoryRunReport,
  finishFactoryRun,
  beginFactoryRepairAttempt,
  finishFactoryRepairAttempt,
  getCreativeFactoryGate,
  getFactoryProfile,
  inferSoundscapeProfile,
  pauseFactoryRun,
  prepareFactoryVisualCheckpoint,
  prepareFactoryProject,
  resumeFactoryRun,
  setFactoryStage,
} from '../src/engines/factory/FactoryRunEngine.js';

const asset = (name, source = 'procedural') => ({ src: `data:audio/wav;base64,${name}`, source });
const fakeSfx = () => ({
  spinStart: asset('spin'),
  reelStop: [asset('stop-1'), asset('stop-2')],
  winSmall: asset('small'),
});
const fakeSoundscape = () => ({
  baseMusic: asset('base', 'procedural-music'),
  bonusMusic: asset('bonus', 'procedural-music'),
  ambience: asset('ambience', 'procedural-music'),
});

test('factory profiles are an explicit cost ladder and only release selects production math', () => {
  assert.equal(getFactoryProfile('prototype').mathProfile, 'smoke');
  assert.equal(getFactoryProfile('review').mathProfile, 'draft');
  assert.equal(getFactoryProfile('release').mathProfile, 'production');
  assert.equal(Object.values(FACTORY_PROFILES).filter(profile => profile.mathProfile === 'production').length, 1);
  assert.equal(getFactoryProfile('unknown').id, 'prototype');
});

test('smoke math is a deterministic single-shard job while expensive work stays release-only', () => {
  const smoke = getMathPublisherProfile('smoke');
  const draft = getMathPublisherProfile('draft');
  const production = getMathPublisherProfile('production');
  assert.equal(smoke.threads, 1, 'a 1,000-book smoke job must not request nonexistent parallel shards');
  assert.equal(smoke.simulationCap, 1000);
  assert.equal(draft.simulationCap, 25000);
  assert.equal(production.simulationCap, null);
  assert.equal(production.optimization, true);
  assert.equal(production.threads, 5);
  assert.equal(production.rustThreads, 5);
  assert.equal(production.batchSize, 5000);
  assert.deepEqual(
    getMathPublisherExecution(production, { base: 500000, bonus: 125000 }),
    { threads: 5, rustThreads: 5, batchSize: 5000 },
  );
  assert.deepEqual(
    getMathPublisherExecution(production, { base: 110000, bonus: 125000 }),
    { threads: 5, rustThreads: 5, batchSize: 1000 },
  );
  assert.equal(smoke.optimization, false);
  assert.equal(draft.optimization, false);
});

test('prototype fills missing core SFX without overwriting custom audio or generating a soundscape', () => {
  const project = createGameProject({ name: 'Prototype Proof' });
  const recording = asset('my-recording', 'recorded');
  project.audio.stingers.spinStart = recording;
  let soundscapeCalls = 0;
  const generated = prepareFactoryProject(project, 'prototype', {
    generateCoreSfxPack: fakeSfx,
    generateSoundscapePack: () => { soundscapeCalls += 1; return fakeSoundscape(); },
  });
  assert.equal(project.audio.stingers.spinStart, recording);
  assert.equal(project.audio.stingers.winSmall.src, asset('small').src);
  assert.equal(project.audio.stingers.reelStop.length, 2);
  assert.equal(generated.sfx, 3);
  assert.equal(generated.soundscapeLayers, 0);
  assert.equal(soundscapeCalls, 0);
});

test('review fills only missing music layers and preserves imported layers', () => {
  const project = createGameProject({ name: 'Neon Circuit' });
  const importedBase = asset('custom-base', 'imported');
  project.audio.layers.baseMusic = importedBase;
  const generated = prepareFactoryProject(project, 'review', {
    generateCoreSfxPack: fakeSfx,
    generateSoundscapePack: fakeSoundscape,
  });
  assert.equal(project.audio.layers.baseMusic, importedBase);
  assert.equal(project.audio.layers.bonusMusic.source, 'procedural-music');
  assert.equal(project.audio.layers.ambience.source, 'procedural-music');
  assert.equal(generated.soundscapeLayers, 2);
  assert.equal(generated.soundscapeProfile, 'neonPulse');
});

test('theme language selects an appropriate deterministic generated soundscape direction', () => {
  assert.equal(inferSoundscapeProfile({ name: 'Doom Tribunal' }), 'mythicDoom');
  assert.equal(inferSoundscapeProfile({ theme: { style: 'gilded luxury mystery' } }), 'gildedMystery');
  assert.equal(inferSoundscapeProfile({ name: 'Ordinary Game' }), 'darkCinematic');
});

test('factory reports retain stage evidence and never call a blocked run release-ready', () => {
  const report = createFactoryRunReport('review');
  setFactoryStage(report, 'creative', 'completed', 'Audio ready');
  setFactoryStage(report, 'certification', 'blocked', 'Two blockers remain');
  finishFactoryRun(report, { releaseReady: false, blockers: ['Missing art', { message: 'Math not verified' }] });
  assert.equal(report.status, 'completed-with-blockers');
  assert.deepEqual(report.blockers, ['Missing art', 'Math not verified']);
  assert.equal(report.stages.creative.message, 'Audio ready');
  assert.ok(report.completedAt);
});

test('mission-control stages cover the full saved production journey', () => {
  assert.deepEqual(FACTORY_STAGE_ORDER, ['creative', 'visual', 'audio', 'frontend', 'math', 'certification', 'package']);
  const report = createFactoryRunReport('review');
  assert.deepEqual(Object.keys(report.stages), FACTORY_STAGE_ORDER);
  assert.equal(report.resumeStage, 'creative');
});

test('factory repair automation is bounded and stops when safe work makes no progress', () => {
  const report = createFactoryRunReport('review');
  const first = beginFactoryRepairAttempt(report, 5);
  assert.equal(first.number, 1);
  assert.equal(report.repairAutomation.maxAttempts, 2);
  finishFactoryRepairAttempt(report, { status: 'completed-with-deferred-repairs', applied: [{ id: 'professional-contract' }] }, { complete: false, blockers: 3, fingerprint: 'cert-1' });
  assert.equal(report.repairAutomation.status, 'active');
  const second = beginFactoryRepairAttempt(report, 3);
  assert.equal(second.number, 2);
  finishFactoryRepairAttempt(report, { status: 'completed-with-deferred-repairs', applied: [{ id: 'frontend-compile' }] }, { complete: false, blockers: 3, fingerprint: 'cert-2' });
  assert.equal(report.repairAutomation.status, 'needs-input');
  assert.equal(beginFactoryRepairAttempt(report, 3), null);
});

test('factory repair automation records certification success', () => {
  const report = createFactoryRunReport('prototype');
  beginFactoryRepairAttempt(report, 2);
  const attempt = finishFactoryRepairAttempt(report, { status: 'certified', applied: [{ id: 'generated-audio' }] }, { complete: true, blockers: 0, fingerprint: 'certified-1' });
  assert.equal(attempt.status, 'certified');
  assert.equal(report.repairAutomation.status, 'certified');
  assert.equal(report.repairAutomation.completedAt, attempt.completedAt);
});

test('creative greenlight blocks expensive work until concrete decisions exist', () => {
  const project = createGameProject({ name: 'Greenlight QA' });
  const blocked = getCreativeFactoryGate(project);
  assert.equal(blocked.complete, false);
  assert.deepEqual(blocked.missing.map(item => item.id), ['core-hook', 'signature-moment', 'differentiators', 'theme-style', 'theme-lore', 'provider-name']);
  project.production.creative = {
    coreHook: 'Split a frozen oath before the execution bell.',
    signatureMoment: 'The valkyrie cleaves the captain ship in half.',
    differentiators: ['A visible judgment meter', 'Split-screen escalating reels'],
  };
  project.theme.style = 'painterly frozen Norse dark fantasy';
  project.theme.lore = 'Condemned captains bargain with a fallen valkyrie beneath an aurora tribunal.';
  project.build.stakeEngine.providerName = 'Northstar Games';
  assert.equal(getCreativeFactoryGate(project).complete, true);
});

test('factory checkpoints are resumable without becoming false completions', () => {
  const report = createFactoryRunReport('review');
  pauseFactoryRun(report, 'visual', 'Finish the visual pack.', {
    action: 'Visual Conductor', panel: 'atlas', blockers: ['0/16 assets assigned'],
  });
  assert.equal(report.status, 'awaiting-input');
  assert.equal(report.stages.visual.status, 'awaiting');
  assert.equal(report.completedAt, null);
  assert.deepEqual(report.blockers, ['0/16 assets assigned']);
  resumeFactoryRun(report);
  assert.equal(report.status, 'running');
  assert.equal(report.awaiting, null);
});

test('math Autopilot blockers pause math instead of failing package', () => {
  const report = createFactoryRunReport('prototype', { track: 'flagship' });
  pauseFactoryRun(report, 'math', 'base remains 23.072 RTP points from its normal-return target after 11 calibration probes.', {
    action: 'Local Math Autopilot',
    panel: 'build',
    blockers: ['base remains 23.072 RTP points from its normal-return target after 11 calibration probes.'],
  });
  assert.equal(report.status, 'awaiting-input');
  assert.equal(report.resumeStage, 'math');
  assert.equal(report.stages.math.status, 'awaiting');
  assert.equal(report.stages.package.status, 'pending');
  assert.equal(report.awaiting.panel, 'build');
});

test('factory visual checkpoint starts the free sequential Codex handoff', () => {
  const project = createGameProject({ name: 'Factory Visual Relay' });
  project.production.creative = {
    coreHook: 'Break the oath before the bell.',
    signatureMoment: 'The frozen tribunal splits open.',
    differentiators: ['Visible judgment meter', 'Escalating split reels'],
  };
  project.theme.style = 'hand-painted frozen mythic fantasy';
  project.theme.lore = 'A condemned captain faces an aurora tribunal.';
  project.build.stakeEngine.providerName = 'Northstar Games';
  project.visualFactory.artBible = {
    ...project.visualFactory.artBible,
    world: 'A frozen tribunal built around a dangerous oath.',
    medium: 'hand-painted premium 2D illustration',
    shapes: 'angular asymmetric silhouettes',
    lighting: 'cold key light with warm metal accents',
    materials: 'ice, aged metal, dark lacquer',
    palette: 'midnight blue, signal cyan, warm gold, bone white',
    motifs: 'broken ring and three-notch mark',
    characterIdentity: 'one condemned adult captain with an asymmetric coat',
    symbolSystem: 'dimensional relics with distinct negative space',
    forbidden: 'casino clip-art, watermarks, UI chrome',
    lockedFingerprint: null,
  };
  lockArtBible(project);
  const checkpoint = prepareFactoryVisualCheckpoint(project, 'review');
  assert.equal(checkpoint.workOrder.current, true);
  assert.equal(checkpoint.batch.status, 'active');
  assert.equal(checkpoint.batch.ready, 1);
  assert.equal(checkpoint.task.key, 'background');
  assert.equal(checkpoint.task.output.filename, 'background.png');
});
