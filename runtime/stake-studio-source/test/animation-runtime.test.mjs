import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import {
  AnimationEngine,
  createAnimationManifest,
  getAtlasPageNames,
  getAtlasRegionNames,
  parseAnimationMapping,
  validateAnimationConfig,
} from '../src/engines/animation/AnimationEngine.js';
import { generateAnimationFiles } from '../src/engines/animation/AnimationExporter.js';
import {
  binaryDataUrlToBytes,
  spineSkeletonFormat,
  validateSpineSkeletonPayload,
} from '../src/engines/animation/SpineAssetCodec.js';
import { createBinarySpineAsset, readSpineSkeletonData } from '../src/engines/animation/SpineBinaryRuntime.js';
import {
  applyAnimationQualityPreset,
  applySuggestedMappings,
  getAnimationCoverage,
  normalizeAnimationName,
  suggestStateMappings,
} from '../src/engines/animation/AnimationProfiles.js';

const atlas = `hero.png
size: 32,32
format: RGBA8888
filter: Linear,Linear
repeat: none
body
  rotate: false
  xy: 0, 0
  size: 32, 32
  orig: 32, 32
  offset: 0, 0
  index: -1
`;

function project() {
  return {
    theme: { character: { poses: { idle: 'fallback.png' } } },
    animation: {
      states: { idle: { layers: [], duration: null }, winSmall: { layers: [], duration: 1200 } },
      runtime: { version: 1, defaultMix: 0.12 },
      particles: [],
      stateAnimations: {
        idle: 'hero:breathe',
        spinning: 'hero:spin',
        winSmall: { asset: 'hero', animation: 'cheer', loop: false, mix: 0.08 },
      },
      spineAssets: [{
        name: 'hero', version: '4.3.10', width: 32, height: 32,
        animations: [{ name: 'breathe' }, { name: 'spin' }, { name: 'cheer' }],
        rawJSON: { skeleton: { spine: '4.3.10' }, bones: [{ name: 'root' }], slots: [], skins: [], animations: {} },
        atlasText: atlas,
        atlasImage: 'data:image/png;base64,iVBORw0KGgo=',
        atlasPages: ['hero.png'],
        placement: { x: 10, y: 20, width: 300, height: 400, scale: 1 },
      }],
    },
  };
}

test('parses legacy strings and extended mapping objects', () => {
  assert.deepEqual(parseAnimationMapping('hero:win:big'), { asset: 'hero', animation: 'win:big' });
  assert.deepEqual(parseAnimationMapping({ asset: 'hero', animation: 'idle', loop: true, mix: 0.2 }), {
    asset: 'hero', animation: 'idle', loop: true, mix: 0.2,
  });
  assert.equal(parseAnimationMapping('broken'), null);
});

test('resolves game states through deterministic fallback chains', () => {
  const engine = new AnimationEngine(project());
  const winMega = engine.transition('winMega');
  assert.equal(winMega.resolvedState, 'winSmall');
  assert.equal(winMega.animation, 'cheer');
  assert.equal(winMega.loop, false);
  assert.equal(engine.describeState('anticipation').resolvedState, 'spinning');
  assert.deepEqual(engine.poseCandidates('wincap').slice(-2), ['max-win', 'idle']);
  assert.deepEqual(engine.poseCandidates('idle'), ['idle']);
});

test('validates mappings, runtime compatibility, and required idle', () => {
  const validProject = project();
  const issues = validateAnimationConfig(validProject);
  assert.equal(issues.some(issue => issue.severity === 'error'), false);

  const invalid = project();
  invalid.animation.stateAnimations.idle = 'missing:nope';
  invalid.animation.spineAssets[0].version = '4.1.99';
  const errors = validateAnimationConfig(invalid).filter(issue => issue.severity === 'error');
  assert.ok(errors.some(issue => issue.message.includes('missing Spine asset')));
  assert.ok(errors.some(issue => issue.message.includes('requires 4.3.x')));
});

test('detects atlas pages and creates a portable runtime bundle', () => {
  assert.deepEqual(getAtlasPageNames(atlas), ['hero.png']);
  assert.deepEqual(getAtlasPageNames(`${atlas}\nsecond.png\nsize: 8,8\n`), ['hero.png', 'second.png']);
  assert.deepEqual(getAtlasRegionNames(atlas), ['body']);

  const source = project();
  source.production = { rig: { corrections: [{
    id: 'elbow-fill', name: 'Elbow fill', type: 'overlay', asset: 'hero', bone: 'root',
    image: 'data:image/png;base64,iVBORw0KGgo=', imageName: 'elbow.png', minAngle: 45, maxAngle: 135,
  }], drawOrderRules: [{ id: 'layer', name: 'Root layer', asset: 'hero', bone: 'root', slot: 'body', relativeTo: 'body-shadow', position: 'after' }], anchors: [], secondaryMotion: [] } };
  const manifest = createAnimationManifest(source);
  assert.equal(manifest.format, 'stake-studio-animation-v1');
  assert.equal(manifest.states.winMega.resolvedState, 'winSmall');

  const files = generateAnimationFiles(source);
  assert.ok(files['animation/runtime.json']);
  assert.ok(files['animation/SPINE-RUNTIMES-LICENSE.txt'].includes('Copyright (c) 2013-2025'));
  assert.ok(files['animation/spine/hero/skeleton.json']);
  assert.ok(files['animation/spine/hero/skeleton.atlas']);
  assert.ok(files['animation/spine/hero/hero.png'] instanceof Uint8Array);
  assert.ok(files['animation/corrections/elbow-fill.png'] instanceof Uint8Array);
  const runtime = JSON.parse(files['animation/runtime.json']);
  assert.equal(runtime.rig.corrections[0].imageFile, 'animation/corrections/elbow-fill.png');
  assert.equal(runtime.rig.corrections[0].image, undefined);
  assert.equal(runtime.poseMechanics.format, 'stake-studio-pose-mechanics-v1');
  assert.equal(runtime.poseMechanics.drawOrderRules[0].id, 'layer');
  assert.equal(runtime.assets[0].files.images['hero.png'], 'animation/spine/hero/hero.png');
});

test('multi-page Spine atlases validate and export every page under its declared name', () => {
  const source = project();
  const asset = source.animation.spineAssets[0];
  asset.atlasText = `${atlas}\nsecond.png\nsize: 8,8\n`;
  asset.atlasPages = ['hero.png', 'second.png'];
  asset.atlasImages = {
    'hero.png': asset.atlasImage,
    'second.png': 'data:image/png;base64,iVBORw0KGgo=',
  };
  assert.equal(validateAnimationConfig(source).some(issue => issue.severity === 'error'), false);
  const files = generateAnimationFiles(source);
  assert.ok(files['animation/spine/hero/hero.png'] instanceof Uint8Array);
  assert.ok(files['animation/spine/hero/second.png'] instanceof Uint8Array);
  const manifest = JSON.parse(files['animation/runtime.json']);
  assert.equal(manifest.assets[0].files.images['second.png'], 'animation/spine/hero/second.png');
});

test('official Spine 4.3 .skel fixture parses, round-trips, and exports as binary', () => {
  const fixtureBytes = new Uint8Array(readFileSync(new URL('./fixtures/spine-4.3/spineboy-pro.skel', import.meta.url)));
  const fixtureAtlas = readFileSync(new URL('./fixtures/spine-4.3/spineboy.atlas', import.meta.url), 'utf8');
  const binary = createBinarySpineAsset({ bytes: fixtureBytes, fileName: 'spineboy-pro.skel', atlasText: fixtureAtlas });
  assert.equal(spineSkeletonFormat(binary), 'binary');
  assert.match(binary.version, /^4\.3\./);
  assert.equal(binary.bones.length, 67);
  assert.equal(binary.slots.length, 52);
  assert.ok(binary.animations.some(animation => animation.name === 'idle'));
  assert.deepEqual(binaryDataUrlToBytes(binary.rawBinary), fixtureBytes);
  const runtimeSpine = new Spine({ skeletonData: readSpineSkeletonData(binary, fixtureAtlas), autoUpdate: false });
  const entry = runtimeSpine.state.setAnimation(0, 'idle', true);
  runtimeSpine.update(1 / 60);
  assert.equal(entry.animation.name, 'idle');
  assert.equal(runtimeSpine.skeleton.bones.length, 67);
  runtimeSpine.destroy({ children: true });

  const source = project();
  binary.name = 'hero';
  Object.assign(binary, {
    atlasText: fixtureAtlas,
    atlasPages: ['spineboy.png'],
    atlasPage: 'spineboy.png',
    atlasImage: 'data:image/png;base64,iVBORw0KGgo=',
    atlasImages: { 'spineboy.png': 'data:image/png;base64,iVBORw0KGgo=' },
    regions: getAtlasRegionNames(fixtureAtlas),
    placement: { scale: 1 },
  });
  source.animation.spineAssets = [binary];
  source.animation.stateAnimations = { idle: 'hero:idle' };
  const files = generateAnimationFiles(source);
  assert.ok(files['animation/spine/hero/skeleton.skel'] instanceof Uint8Array);
  assert.deepEqual(files['animation/spine/hero/skeleton.skel'], fixtureBytes);
  assert.equal(files['animation/spine/hero/skeleton.json'], undefined);
  const runtime = JSON.parse(files['animation/runtime.json']);
  assert.equal(runtime.assets[0].skeletonFormat, 'binary');
  assert.equal(runtime.assets[0].files.skeleton, 'animation/spine/hero/skeleton.skel');
});

test('binary skeleton schema rejects hybrid and malformed payloads', () => {
  assert.ok(validateSpineSkeletonPayload({ skeletonFormat: 'binary', skeletonFileName: 'bad.skel', rawBinary: 'nope' }).length > 0);
  assert.throws(() => spineSkeletonFormat({ rawJSON: { skeleton: {}, bones: [] }, rawBinary: 'data:application/octet-stream;base64,AA==' }), /both JSON and binary/);
});

test('auto-maps conventional Spine animation names without confusing start and stop', () => {
  const asset = {
    name: 'hero',
    animations: ['characterIdleLoop', 'spin_intro', 'spin_loop', 'spin_end', 'small_win', 'big-win', 'max_win', 'bonus_intro', 'bonus_loop', 'anticipation']
      .map(name => ({ name })),
  };
  assert.equal(normalizeAnimationName('characterIdleLoop'), 'character-idle-loop');
  const suggestions = suggestStateMappings(asset);
  assert.equal(suggestions.idle.animation, 'characterIdleLoop');
  assert.equal(suggestions.spinStart.animation, 'spin_intro');
  assert.equal(suggestions.spinning.animation, 'spin_loop');
  assert.equal(suggestions.spinStop.animation, 'spin_end');
  assert.equal(suggestions.winSmall.animation, 'small_win');
  assert.equal(suggestions.winBig.animation, 'big-win');
  assert.equal(suggestions.wincap.animation, 'max_win');
  assert.equal(suggestions.bonusEntry.animation, 'bonus_intro');
  assert.equal(suggestions.bonusIdle.animation, 'bonus_loop');
});

test('quality profiles and coverage produce a reusable choreography configuration', () => {
  const source = project();
  source.animation.stateAnimations = {};
  const asset = {
    name: 'hero',
    animations: ['idle', 'spin-start', 'spin-loop', 'spin-stop', 'win', 'anticipation', 'bonus-entry', 'bonus-idle', 'max-win'].map(name => ({ name })),
  };
  source.animation.spineAssets = [asset];
  const mapped = applySuggestedMappings(source, asset);
  assert.ok(mapped.applied.length >= 9);
  const preset = applyAnimationQualityPreset(source, 'cinematic');
  assert.equal(preset.name, 'Cinematic');
  assert.equal(source.animation.runtime.defaultMix, 0.28);
  assert.equal(source.animation.states.wincap.duration, 7600);
  const coverage = getAnimationCoverage(source);
  assert.equal(coverage.productionPercent, 100);
  assert.deepEqual(coverage.missingProduction, []);
});
