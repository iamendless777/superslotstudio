import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { BuildEngine } from '../src/engines/build/BuildEngine.js';
import {
  ASSET_PACK_VERSION,
  compileAssetPack,
  createAssetPackManifest,
  getAssetPackCoverage,
  planAssetPack,
  validateAppliedAssetPack,
} from '../src/engines/assets/AssetPackEngine.js';

const imageSrc = name => `data:image/png;base64,${btoa(name)}`;
const audioSrc = name => `data:audio/wav;base64,${btoa(name)}`;
const image = name => ({ name, type: 'image/png', size: 12, width: 128, height: 128, src: imageSrc(name) });
const audio = name => ({ name, type: 'audio/wav', size: 8, src: audioSrc(name) });

function project() {
  const value = createGameProject({ name: 'Asset Factory' });
  value.build.stakeEngine.providerName = 'Phantom Factory';
  return value;
}

test('asset intake maps a complete named batch without mutating the project', () => {
  const value = project();
  const assets = [
    image('H1.png'), image('symbol_W.png'), image('background.png'), image('foreground.png'),
    image('provider_logo.png'), image('character_idle.png'), image('character_win_big.png'),
    audio('base_music.ogg'), audio('spin_start.wav'), audio('reel_stop_1.wav'), audio('bonus_trigger.wav'),
    image('mystery.png'),
  ];
  const plan = planAssetPack(value, assets);
  assert.equal(plan.version, ASSET_PACK_VERSION);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.unmatched.length, 1);
  assert.equal(plan.unmatched[0].name, 'mystery.png');
  assert.ok(plan.assignments.some(item => item.kind === 'symbol' && item.target === 'H1'));
  assert.ok(plan.assignments.some(item => item.kind === 'cabinet' && item.target === 'background'));
  assert.ok(plan.assignments.some(item => item.kind === 'characterPose' && item.target === 'winBig'));
  assert.ok(plan.assignments.some(item => item.kind === 'audioStinger' && item.target === 'reelStop' && item.index === 0));
  assert.equal(value.theme.symbols.find(item => item.name === 'H1').src, '');
});

test('duplicate files targeting one production slot stop compilation', () => {
  const value = project();
  const plan = planAssetPack(value, [image('H1.png'), image('symbol_H1.png')]);
  assert.equal(plan.conflicts.length, 1);
  assert.throws(() => compileAssetPack(value, plan), /duplicate target conflict/);
  assert.equal(value.assetPack, null);
});

test('compilation connects art and audio, stages atlas assets, and resets only relevant approvals', () => {
  const value = project();
  value.production.qa.visualCohesionAudit = { format: 'old-report' };
  value.production.qa.assetIntegrityVerified = true;
  value.production.audio.loudnessNormalized = true;
  const plan = planAssetPack(value, [
    image('H1.png'), image('background.png'), image('foreground.png'), image('provider_logo.png'),
    image('character_idle.png'), audio('base_music.ogg'), audio('spin_start.wav'), audio('reel_stop_1.wav'),
    audio('win_small.wav'), audio('bonus_trigger.wav'),
  ]);
  const result = compileAssetPack(value, plan);
  assert.equal(result.compiled, 10);
  assert.equal(value.theme.symbols.find(item => item.name === 'H1').src, imageSrc('H1.png'));
  assert.equal(value.theme.cabinet.layers.length, 2);
  assert.equal(value.theme.character.poses.idle, imageSrc('character_idle.png'));
  assert.equal(value.audio.layers.baseMusic.loop, true);
  assert.equal(value.audio.stingers.reelStop[0].src, audioSrc('reel_stop_1.wav'));
  assert.equal(value.theme.submission.background, imageSrc('background.png'));
  assert.equal(value.theme.submission.foreground, imageSrc('foreground.png'));
  assert.equal(value.theme.submission.providerLogo, imageSrc('provider_logo.png'));
  assert.ok(value.atlas.assets.some(item => item.name === 'H1'));
  assert.ok(value.atlas.assets.some(item => item.name === 'character-idle'));
  assert.equal(value.atlas.packed, null);
  assert.equal(value.production.qa.visualCohesionAudit, null);
  assert.equal(value.production.qa.assetIntegrityVerified, false);
  assert.equal(value.production.audio.loudnessNormalized, false);
});

test('a complete Spine trio becomes a mapped runtime asset', () => {
  const value = project();
  const spineData = {
    skeleton: { spine: '4.3.10', width: 500, height: 800 },
    bones: [{ name: 'root' }], slots: [{ name: 'body', bone: 'root' }], skins: [],
    animations: { idle: { bones: {} }, 'win-big': { bones: { root: [{ time: 1.2 }] } } },
  };
  const assets = [
    { name: 'hero.json', type: 'application/json', size: 20, text: JSON.stringify(spineData) },
    { name: 'hero.atlas', type: 'text/plain', size: 20, text: 'hero.png\nsize: 128,128\n\nbody\n  rotate: false' },
    image('hero.png'),
  ];
  const plan = planAssetPack(value, assets);
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.assignments[0].kind, 'spine');
  compileAssetPack(value, plan);
  assert.equal(value.animation.spineAssets[0].version, '4.3.10');
  assert.equal(value.animation.spineAssets[0].atlasPage, 'hero.png');
  assert.equal(value.animation.runtime.activeSpineAsset, 'hero');
  assert.equal(value.animation.stateAnimations.idle, 'hero:idle');
  assert.equal(value.animation.stateAnimations.winBig, 'hero:win-big');
});

test('asset provenance detects removed bindings and records intentional replacements', () => {
  const value = project();
  compileAssetPack(value, planAssetPack(value, [image('H1.png'), audio('spin_start.wav')]));
  value.theme.symbols.find(item => item.name === 'H1').src = 'data:image/png;base64,replacement';
  let validation = validateAppliedAssetPack(value);
  assert.equal(validation.valid, true);
  assert.ok(validation.drift.some(message => message.includes('symbol:H1')));
  value.audio.stingers.spinStart = null;
  validation = validateAppliedAssetPack(value);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some(message => message.includes('spin_start.wav')));
});

test('release output includes manifest plus correctly named Stake submission files', () => {
  const value = project();
  compileAssetPack(value, planAssetPack(value, [image('background.png'), image('foreground.png'), image('provider_logo.png')]));
  const coverage = getAssetPackCoverage(value);
  assert.equal(coverage.submission, 3);
  const manifest = createAssetPackManifest(value);
  assert.equal(manifest.format, 'stake-studio-asset-pack-manifest-v1');
  assert.equal(manifest.valid, true);
  const files = new BuildEngine(value).generateAssetPackFiles();
  assert.ok(files['stakestudio/asset-pack.json']);
  assert.ok(files['submission/AssetFactory-BG.png'] instanceof Uint8Array);
  assert.ok(files['submission/AssetFactory-FG.png'] instanceof Uint8Array);
  assert.ok(files['submission/PhantomFactory-Logo.png'] instanceof Uint8Array);
});
