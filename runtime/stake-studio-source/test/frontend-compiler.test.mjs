import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createGameProject } from '../src/engines/schema.js';
import {
  FRONTEND_COMPILER_VERSION,
  compileFrontendProject,
  createFrontendConfig,
} from '../server/frontend-compiler.mjs';
import { resolveSpineEventState } from '../server/frontend-runtime/spine-entry.js';
import { parseLaunch, StakeRuntime } from '../server/frontend-template/stake-runtime.js';
import { animationRuntimeFingerprint, getAtlasRegionNames } from '../src/engines/animation/AnimationEngine.js';
import { createBinarySpineAsset } from '../src/engines/animation/SpineBinaryRuntime.js';
import {
  createCapabilityShowcaseBinding,
  createCapabilityShowcaseRecipe,
  createVisualEffectsState,
  visualEffectsFingerprint,
} from '../src/engines/animation/VisualEffectRecipes.js';

const jsonResponse = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const launch = 'https://studio.test/game/index.html?sessionID=session-1&lang=en&device=desktop&rgs_url=rgs.example.test';

function authPayload(round = null) {
  return {
    balance: { amount: 100_000_000, currency: 'USD' },
    config: {
      minBet: 10_000, maxBet: 10_000_000, stepBet: 10_000, defaultBetLevel: 1_000_000,
      betLevels: [10_000, 1_000_000],
      jurisdiction: { disabledTurbo: false, disabledSpacebar: false, minimumRoundDuration: 0 },
    },
    round,
  };
}

test('wallet runtime authenticates, sends base amount, records events, and never closes a zero-win round', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null, method: init.method });
    if (url.endsWith('/wallet/authenticate')) return jsonResponse(authPayload());
    if (url.endsWith('/wallet/play')) return jsonResponse({ balance: { amount: 99_000_000, currency: 'USD' }, round: { active: false, payoutMultiplier: 0, mode: 'bonus', state: [{ index: 0, type: 'reveal' }] } });
    if (url.endsWith('/bet/event')) return jsonResponse({ event: '0' });
    throw new Error(`Unexpected ${url}`);
  };
  const runtime = new StakeRuntime({ href: launch, fetchImpl });
  await runtime.authenticate();
  const result = await runtime.play({
    amount: 1_000_000, mode: 'bonus', modeConfig: { cost: 80 },
    present: async ({ events, recordEvent }) => { for (const event of events) await recordEvent(event.index); },
  });
  assert.equal(result.type, 'noWin');
  assert.equal(calls.find(call => call.url.endsWith('/wallet/play')).body.amount, 1_000_000, 'mode cost must not pre-multiply the base amount');
  assert.equal(calls.filter(call => call.url.endsWith('/wallet/end-round')).length, 0);
  assert.equal(calls.find(call => call.url.endsWith('/bet/event')).body.event, '0');
  assert.equal(runtime.balance.amount, 99_000_000);
  assert.throws(() => { runtime.balance.amount = 1; }, TypeError);
  assert.equal(runtime.balance.amount, 99_000_000);
});

test('single-round win starts end-round before presentation and withholds payout balance until presentation ends', async () => {
  const order = [];
  let resolveEnd;
  const fetchImpl = async url => {
    if (url.endsWith('/wallet/authenticate')) return jsonResponse(authPayload());
    if (url.endsWith('/wallet/play')) return jsonResponse({ balance: { amount: 99_000_000, currency: 'USD' }, round: { active: false, payoutMultiplier: 2, mode: 'base', state: [] } });
    if (url.endsWith('/wallet/end-round')) {
      order.push('end-request');
      await new Promise(resolve => { resolveEnd = resolve; });
      return jsonResponse({ balance: { amount: 101_000_000, currency: 'USD' } });
    }
    throw new Error(`Unexpected ${url}`);
  };
  const runtime = new StakeRuntime({ href: launch, fetchImpl });
  await runtime.authenticate();
  const promise = runtime.play({ amount: 1_000_000, mode: 'base', present: async () => {
    order.push('presentation');
    assert.deepEqual(order, ['end-request', 'presentation']);
    assert.equal(runtime.balance.amount, 99_000_000);
    resolveEnd();
  } });
  await promise;
  assert.equal(runtime.balance.amount, 101_000_000);
});

test('bonus and resumed rounds close only after presentation', async () => {
  const order = [];
  const fetchImpl = async url => {
    if (url.endsWith('/wallet/authenticate')) return jsonResponse(authPayload());
    if (url.endsWith('/wallet/play')) return jsonResponse({ balance: { amount: 20_000_000, currency: 'USD' }, round: { active: true, payoutMultiplier: 5, mode: 'bonus', event: '1', state: [{ index: 0, type: 'reveal' }, { index: 1, type: 'finalWin', amount: 500 }] } });
    if (url.endsWith('/wallet/end-round')) { order.push('end'); return jsonResponse({ balance: { amount: 25_000_000, currency: 'USD' } }); }
    if (url.endsWith('/bet/event')) return jsonResponse({ event: '1' });
    throw new Error(`Unexpected ${url}`);
  };
  const runtime = new StakeRuntime({ href: launch, fetchImpl });
  await runtime.authenticate();
  await runtime.play({ amount: 1_000_000, mode: 'bonus', modeConfig: { isBuyBonus: true }, present: async () => { order.push('present'); } });
  assert.deepEqual(order, ['present', 'end']);

  order.length = 0;
  const round = { active: true, payoutMultiplier: 5, mode: 'bonus', event: '1', state: [{ index: 0 }, { index: 1 }] };
  await runtime.resume(round, { modeConfig: { isBuyBonus: true }, present: async ({ snapshotEvents, events }) => {
    order.push('resume'); assert.equal(snapshotEvents.length, 1); assert.equal(events.length, 1);
  } });
  assert.deepEqual(order, ['resume', 'end']);
});

test('mandatory replay is sessionless and cannot call wallet play', async () => {
  const calls = [];
  const href = 'https://studio.test/index.html?replay=true&game=my_game&version=1.0.0&mode=base&event=42&rgs_url=https%3A%2F%2Frgs.example.test&currency=USD&amount=1000000';
  const runtime = new StakeRuntime({ href, fetchImpl: async (url, init) => { calls.push({ url, init }); return jsonResponse({ payoutMultiplier: 2, costMultiplier: 1, state: [{ index: 0, type: 'reveal' }] }); } });
  const data = await runtime.loadReplay();
  await runtime.playReplay(data, async ({ replay, events }) => { assert.equal(replay, true); assert.equal(events.length, 1); });
  assert.match(calls[0].url, /\/bet\/replay\/my_game\/1\.0\.0\/base\/42$/);
  assert.equal(calls[0].init.method, 'GET');
  await assert.rejects(() => runtime.play({ amount: 1_000_000, mode: 'base', present: async () => {} }), /disabled/);
  assert.equal(calls.length, 1);
});

test('frontend config carries project-authored environment and symbol motion profiles', () => {
  const project = createGameProject({ name: 'Motion Proof' });
  const before = animationRuntimeFingerprint(project);
  project.theme.symbols[0].motionProfile = 'hover';
  project.theme.symbols[0].motionAssetId = 'motion-proof-symbol';
  project.theme.symbols[0].motionOverlay = { width: 110, height: 110, fps: 12, blendMode: 'screen' };
  project.theme.presentationEffects = {
    motionGraphics: { enabled: true, htmlVisibleEffects: false, ambient: [] },
    winConnections: { type: 'particleTap', origin: { x: 182, y: 166 } },
    spinButtonAsset: 'data:image/png;base64,iVBORw0KGgo=',
  };
  project.theme.presentationAssets = { modePortal: 'data:image/webp;base64,UklGRg==' };
  project.audio.layers.baseMusic = { src: 'data:audio/wav;base64,UklGRg==', loop: true, volume: 0.6 };
  project.audio.stingers.spinStart = { src: 'data:audio/wav;base64,UklGRg==', volume: 0.9 };
  project.animation.environment = { enabled: true, preset: 'dreamfall' };
  project.animation.particles = [{ type: 'emberField', color: '#55d6c2', count: 24 }];
  project.animation.visualEffects = createVisualEffectsState({
    motionAssets: [{ id: 'motion-proof-symbol', src: 'data:image/png;base64,iVBORw0KGgo=', columns: 1, rows: 1, frames: 1, fps: 12 }],
  });
  project.animation.states.idle.layers = [{ id: 'living-symbols', type: 'css-motion' }];
  const config = createFrontendConfig(project);
  assert.equal(config.animation.configured, true);
  assert.deepEqual(config.animation.motion.environment, project.animation.environment);
  assert.deepEqual(config.animation.motion.particles, project.animation.particles);
  assert.equal(config.symbols[0].motionProfile, 'hover');
  assert.equal(config.symbols[0].motionAssetId, 'motion-proof-symbol');
  assert.deepEqual(config.symbols[0].motionOverlay, project.theme.symbols[0].motionOverlay);
  assert.equal(config.visualEffects.motionAssets.length, 1);
  assert.equal(config.presentationEffects.motionGraphics.htmlVisibleEffects, false);
  assert.deepEqual(config.presentationEffects.winConnections.origin, { x: 182, y: 166 });
  assert.equal(config.controls.spinButtonAsset, project.theme.presentationEffects.spinButtonAsset);
  assert.equal(config.presentationDirector.recipes.length, project.presentationDirector.recipes.length);
  assert.equal(config.presentationAssets.modePortal, project.theme.presentationAssets.modePortal);
  assert.equal(config.audio.enabled, true);
  assert.equal(config.audio.layers.baseMusic.volume, 0.6);
  assert.equal(config.audio.stingers.spinStart[0].volume, 0.9);
  for (const control of ['menu', 'bonus', 'autoplay', 'turbo', 'sound', 'info', 'decrease', 'increase', 'modeCard']) {
    assert.match(config.controls[control], /^\/assets\/morpheus-/);
  }
  assert.ok(config.cabinetSize.width > 0 && config.cabinetSize.height > 0);
  assert.notEqual(animationRuntimeFingerprint(project), before);
});

test('motion-atlas-only projects bundle Pixi without requiring a procedural event recipe', async () => {
  const home = mkdtempSync(join(tmpdir(), 'stakestudio-frontend-motion-only-'));
  try {
    const project = createGameProject({ name: 'Frontend Motion Only Proof' });
    project.build.stakeEngine.gameId = 'frontend_motion_only_proof';
    project.animation.visualEffects = createVisualEffectsState({
      motionAssets: [{ id: 'ambient-proof', src: 'data:image/png;base64,iVBORw0KGgo=', columns: 1, rows: 1, frames: 1, fps: 8 }],
    });
    project.theme.presentationEffects = {
      motionGraphics: { enabled: true, htmlVisibleEffects: false, ambient: [{ assetId: 'ambient-proof', loop: true }] },
    };
    const root = join(home, 'games', 'frontend_motion_only_proof');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'project.json'), JSON.stringify(project));
    const result = await compileFrontendProject({ studioHome: home, projectId: 'frontend_motion_only_proof' });
    assert.ok(result.files.includes('visual-effects-runtime.js'));
    assert.equal(result.capabilities.visualEffects, true);
    assert.equal(result.verification.visualEffects.runtimeBundled, true);
    assert.equal(result.verification.visualEffects.bindingCount, 0);
    assert.equal(result.verification.assetPackaging.strategy, 'hashed-files');
    assert.equal(result.verification.assetPackaging.fileCount, 11, 'motion atlas plus ten authored dashboard assets');
    assert.ok(result.verification.assetPackaging.configBytes < 100_000);
    assert.ok(result.initialBytes > 0 && result.initialBytes < result.totalBytes);
    assert.equal(result.initialFiles.includes('visual-effects-runtime.js'), false);
    assert.equal(result.initialFiles.some(path => path.startsWith('assets/motion/')), false);
    assert.equal(result.verification.assetPackaging.warmup, 'post-first-paint-idle');
    const config = JSON.parse(readFileSync(join(root, 'frontend', 'game-config.json'), 'utf8'));
    assert.match(config.visualEffects.motionAssets[0].src, /^assets\/motion\/[a-f0-9]{24}\.png$/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('frontend compiler packages local project asset URLs into a portable Stake bundle', async () => {
  const home = mkdtempSync(join(tmpdir(), 'stakestudio-frontend-local-assets-'));
  try {
    const project = createGameProject({ name: 'Frontend Local Asset Proof' });
    project.build.stakeEngine.gameId = 'frontend_local_asset_proof';
    const root = join(home, 'games', 'frontend_local_asset_proof');
    const assetDir = join(root, 'assets', 'motion');
    mkdirSync(assetDir, { recursive: true });
    const sourceBytes = Buffer.from('local-motion-atlas-proof');
    const presentationBytes = Buffer.from('local-presentation-plate-proof');
    const musicBytes = Buffer.from('local-authored-music-proof');
    const stingerBytes = Buffer.from('local-authored-stinger-proof');
    writeFileSync(join(assetDir, 'ambient-proof.png'), sourceBytes);
    mkdirSync(join(root, 'assets', 'presentation'), { recursive: true });
    mkdirSync(join(root, 'assets', 'audio'), { recursive: true });
    writeFileSync(join(root, 'assets', 'presentation', 'mode-portal.webp'), presentationBytes);
    writeFileSync(join(root, 'assets', 'audio', 'base.wav'), musicBytes);
    writeFileSync(join(root, 'assets', 'audio', 'spin.wav'), stingerBytes);
    project.animation.visualEffects = createVisualEffectsState({
      motionAssets: [{ id: 'ambient-proof', src: '/__stake_studio/projects/frontend_local_asset_proof/assets/motion/ambient-proof.png', columns: 1, rows: 1, frames: 1, fps: 8 }],
    });
    project.theme.presentationEffects = {
      motionGraphics: { enabled: true, htmlVisibleEffects: false, ambient: [{ assetId: 'ambient-proof', loop: true }] },
    };
    project.theme.presentationAssets = {
      modePortal: '/__stake_studio/projects/frontend_local_asset_proof/assets/presentation/mode-portal.webp',
    };
    project.audio.layers.baseMusic = {
      src: '/__stake_studio/projects/frontend_local_asset_proof/assets/audio/base.wav', loop: true, volume: 0.6,
    };
    project.audio.stingers.spinStart = {
      src: '/__stake_studio/projects/frontend_local_asset_proof/assets/audio/spin.wav', volume: 0.9,
    };
    writeFileSync(join(root, 'project.json'), JSON.stringify(project));
    const result = await compileFrontendProject({ studioHome: home, projectId: 'frontend_local_asset_proof' });
    assert.equal(result.verification.assetPackaging.fileCount, 14, 'motion, presentation, music, stinger, and ten authored dashboard assets');
    const config = JSON.parse(readFileSync(join(root, 'frontend', 'game-config.json'), 'utf8'));
    const packagedPath = config.visualEffects.motionAssets[0].src;
    assert.match(packagedPath, /^assets\/motion\/[a-f0-9]{24}\.png$/);
    assert.deepEqual(readFileSync(join(root, 'frontend', packagedPath)), sourceBytes);
    assert.match(config.presentationAssets.modePortal, /^assets\/presentation\/[a-f0-9]{24}\.webp$/);
    assert.deepEqual(readFileSync(join(root, 'frontend', config.presentationAssets.modePortal)), presentationBytes);
    assert.match(config.audio.layers.baseMusic.src, /^assets\/audio\/[a-f0-9]{24}\.wav$/);
    assert.deepEqual(readFileSync(join(root, 'frontend', config.audio.layers.baseMusic.src)), musicBytes);
    assert.match(config.audio.stingers.spinStart[0].src, /^assets\/audio\/[a-f0-9]{24}\.wav$/);
    assert.deepEqual(readFileSync(join(root, 'frontend', config.audio.stingers.spinStart[0].src)), stingerBytes);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('frontend compiler writes a portable package and records honest capabilities', async () => {
  const home = mkdtempSync(join(tmpdir(), 'stakestudio-frontend-'));
  try {
    const project = createGameProject({ name: 'Frontend Proof' });
    project.build.stakeEngine.gameId = 'frontend_proof';
    project.build.stakeEngine.providerName = 'Proof Studio';
    project.math.betModes = [{ name: 'base', cost: 1, rtp: 0.965, maxWin: 5000 }];
    const root = join(home, 'games', 'frontend_proof');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'project.json'), JSON.stringify(project));
    const result = await compileFrontendProject({ studioHome: home, projectId: 'frontend_proof' });
    assert.equal(result.files.filter(path => path.startsWith('assets/ui/')).length, 10);
    for (const path of ['frontend-manifest.json', 'game-app.js', 'game-config.json', 'index.html', 'stake-runtime.js', 'styles.css']) assert.ok(result.files.includes(path));
    assert.ok(result.totalBytes > 10_000);
    assert.ok(result.initialBytes > 10_000 && result.initialBytes <= result.totalBytes);
    assert.equal(result.initialFiles.filter(path => path.startsWith('assets/ui/')).length, 9);
    for (const path of ['game-app.js', 'game-config.json', 'index.html', 'stake-runtime.js', 'styles.css']) assert.ok(result.initialFiles.includes(path));
    assert.deepEqual(result.capabilities, {
      walletLifecycle: true,
      replay: true,
      jurisdiction: true,
      serverOwnedBalance: true,
      responsive: true,
      visualEffects: false,
      spineAnimation: false,
      presentationDirector: true,
      authoredAudio: false,
      authoritativeMorpheusEvents: false,
    });
    const saved = JSON.parse(readFileSync(join(root, 'project.json'), 'utf8'));
    assert.equal(saved.build.frontend.entry, 'frontend/index.html');
    assert.equal(saved.build.frontend.verification.balanceAuthority, 'server-only');
    const config = JSON.parse(readFileSync(join(root, 'frontend', 'game-config.json'), 'utf8'));
    assert.equal(result.initialFiles.includes(config.controls.modeCard), false);
    assert.ok(result.files.includes(config.controls.modeCard));
    assert.equal(config.providerName, 'Proof Studio');
    assert.match(config.rules.disclaimer, /Malfunction voids all wins and plays/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('binary Spine assets compile into a self-contained, event-driven portable frontend', async () => {
  const home = mkdtempSync(join(tmpdir(), 'stakestudio-frontend-spine-'));
  try {
    const project = createGameProject({ name: 'Frontend Spine Proof' });
    project.build.stakeEngine.gameId = 'frontend_spine_proof';
    const atlasText = readFileSync(new URL('./fixtures/spine-4.3/spineboy.atlas', import.meta.url), 'utf8');
    const skeletonBytes = readFileSync(new URL('./fixtures/spine-4.3/spineboy-pro.skel', import.meta.url));
    const asset = createBinarySpineAsset({ bytes: skeletonBytes, fileName: 'spineboy-pro.skel', atlasText });
    Object.assign(asset, {
      name: 'hero',
      atlasText,
      atlasPages: ['spineboy.png'],
      atlasPage: 'spineboy.png',
      atlasImage: 'data:image/png;base64,iVBORw0KGgo=',
      atlasImages: { 'spineboy.png': 'data:image/png;base64,iVBORw0KGgo=' },
      regions: getAtlasRegionNames(atlasText),
      placement: { x: 0, y: 0, width: 1280, height: 720, anchorX: 0.5, anchorY: 0.5, scale: 1 },
    });
    project.animation.spineAssets = [asset];
    project.animation.activeSpineAsset = 'hero';
    project.animation.stateAnimations = {
      idle: 'hero:idle',
      spinning: 'hero:run',
      winSmall: 'hero:shoot',
    };
    const root = join(home, 'games', 'frontend_spine_proof');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'project.json'), JSON.stringify(project));

    const result = await compileFrontendProject({ studioHome: home, projectId: 'frontend_spine_proof' });
    for (const path of [
      'spine-runtime.js',
      'animation/runtime.json',
      'animation/SPINE-RUNTIMES-LICENSE.txt',
      'animation/spine/hero/skeleton.skel',
      'animation/spine/hero/skeleton.atlas',
      'animation/spine/hero/spineboy.png',
    ]) assert.ok(result.files.includes(path), `missing compiled file ${path}`);
    assert.equal(result.capabilities.spineAnimation, true);
    assert.equal(result.verification.spine.runtimeBundled, true);
    assert.equal(result.verification.spine.manifestBundled, true);
    assert.equal(result.verification.spine.binarySupported, true);
    assert.equal(result.verification.spine.assetCount, 1);
    assert.equal(result.verification.spine.fingerprint, animationRuntimeFingerprint(project));

    const config = JSON.parse(readFileSync(join(root, 'frontend', 'game-config.json'), 'utf8'));
    assert.equal(config.animation.enabled, true);
    assert.equal(config.animation.fingerprint, result.verification.spine.fingerprint);
    const runtimeManifest = JSON.parse(readFileSync(join(root, 'frontend', 'animation/runtime.json'), 'utf8'));
    assert.equal(runtimeManifest.assets[0].skeletonFormat, 'binary');
    assert.equal(runtimeManifest.assets[0].files.skeleton, 'animation/spine/hero/skeleton.skel');
    assert.deepEqual(readFileSync(join(root, 'frontend', 'animation/spine/hero/skeleton.skel')), skeletonBytes);
    const bundle = readFileSync(join(root, 'frontend', 'spine-runtime.js'), 'utf8');
    assert.ok(bundle.length > 100_000);
    assert.match(bundle, /mountSpineRuntime/);
    assert.doesNotMatch(bundle, /from["']pixi\.js/);
    assert.doesNotMatch(bundle, /https?:\/\/(?:cdn|unpkg|esm\.)/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('compiled Spine runtime maps actual game events to standard animation states', () => {
  assert.equal(resolveSpineEventState({ type: 'spinStart' }), 'spinStart');
  assert.equal(resolveSpineEventState({ type: 'reveal', anticipation: [2] }), 'anticipation');
  assert.equal(resolveSpineEventState({ type: 'reveal', anticipation: [] }), 'spinStop');
  assert.equal(resolveSpineEventState({ type: 'winInfo', amount: 2500 }), 'winMedium');
  assert.equal(resolveSpineEventState({ type: 'enterBonus' }), 'bonusEntry');
  assert.equal(resolveSpineEventState({ type: 'freeSpinEnd' }), 'bonusExit');
  assert.equal(resolveSpineEventState({ type: 'finalWin', amount: 1 }), 'featureResult');
});

test('registered visual effects are fingerprinted and bundled into the portable frontend', async () => {
  const home = mkdtempSync(join(tmpdir(), 'stakestudio-frontend-vfx-'));
  try {
    const project = createGameProject({ name: 'Frontend VFX Proof' });
    project.build.stakeEngine.gameId = 'frontend_vfx_proof';
    project.animation.visualEffects = createVisualEffectsState({
      recipes: [createCapabilityShowcaseRecipe()],
      bindings: [createCapabilityShowcaseBinding()],
    });
    const root = join(home, 'games', 'frontend_vfx_proof');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'project.json'), JSON.stringify(project));
    const result = await compileFrontendProject({ studioHome: home, projectId: 'frontend_vfx_proof' });
    assert.ok(result.files.includes('visual-effects-runtime.js'));
    assert.equal(result.verification.visualEffects.runtimeBundled, true);
    assert.equal(result.verification.visualEffects.bindingCount, 1);
    assert.equal(result.verification.visualEffects.spineAdapter, false);
    assert.equal(result.verification.visualEffects.fingerprint, visualEffectsFingerprint(project.animation.visualEffects));
    const config = JSON.parse(readFileSync(join(root, 'frontend', 'game-config.json'), 'utf8'));
    assert.equal(config.visualEffects.bindings[0].event, 'winInfo');
    assert.equal(config.visualEffects.fingerprint, result.verification.visualEffects.fingerprint);
    const bundle = readFileSync(join(root, 'frontend', 'visual-effects-runtime.js'), 'utf8');
    assert.ok(bundle.length > 100_000);
    assert.doesNotMatch(bundle, /from["']pixi\.js/);
    assert.doesNotMatch(bundle, /spine-pixi/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('compiled shell contains CSP, every jurisdiction flag, and desktop/mobile/mini breakpoints', () => {
  const html = readFileSync(new URL('../server/frontend-template/index.html', import.meta.url), 'utf8');
  const appSource = readFileSync(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../server/frontend-template/styles.css', import.meta.url), 'utf8');
  const visualRuntime = readFileSync(new URL('../server/frontend-runtime/visual-effects-entry.js', import.meta.url), 'utf8');
  const spineRuntime = readFileSync(new URL('../server/frontend-runtime/spine-entry.js', import.meta.url), 'utf8');
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /'unsafe-eval'/);
  assert.match(visualRuntime, /import 'pixi\.js\/unsafe-eval'/);
  assert.match(spineRuntime, /import 'pixi\.js\/unsafe-eval'/);
  assert.match(spineRuntime, /return Boolean\(entry\)/);
  for (const flag of ['disabledFullscreen', 'disabledTurbo', 'disabledAutoplay', 'disabledSlamstop', 'disabledSpacebar', 'disabledBuyFeature', 'displayNetPosition', 'displayRTP', 'displaySessionTimer', 'minimumRoundDuration', 'socialCasino']) {
    assert.ok(appSource.includes(flag) || readFileSync(new URL('../server/frontend-template/stake-runtime.js', import.meta.url), 'utf8').includes(flag), `missing ${flag}`);
  }
  assert.match(styles, /max-width: 720px/);
  assert.match(styles, /max-width: 440px/);
  assert.match(styles, /data-layout="mobile"/);
  assert.match(styles, /data-layout="mini"/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /primary-button\[data-authored-art="true"\]/);
  assert.match(styles, /compiled-reel-kinetic-smear/);
  assert.match(appSource, /controlButton\('info', 'Game Info'/);
  assert.match(appSource, /modalShell\('Game Information', 'info-modal'\)/);
  assert.match(appSource, /aria-modal', 'true'/);
  assert.match(appSource, /event\.key === 'Escape'/);
  assert.match(appSource, /showModeMenu/);
  assert.match(appSource, /START AUTOPLAY/);
  assert.match(appSource, /mode\.cost/);
  assert.match(styles, /Authored player dashboard/);
  assert.match(appSource, /function renderBoard\(board\)[\s\S]*?clearWinHighlights\(\);[\s\S]*?ui\.board\.replaceChildren\(\)/);
  assert.match(appSource, /async function preloadBoardAssets\(board\)/);
  assert.match(appSource, /case 'reveal':[\s\S]{0,500}await settleReelMotion\(event\.board, instant\)/);
  assert.match(appSource, /ui\.featureProgress = node\('section', 'feature-progress'\)/);
  assert.match(appSource, /ui\.featureFinale = node\('section', 'feature-finale'\)/);
  assert.match(appSource, /queueCheckpoint\(event\.index\)/);
  assert.match(appSource, /if \(!snapshot\) await recordEvent\(combined\[index\]\.index\)/);
  assert.match(appSource, /const governedPresentation = Boolean\(event\?\.morpheusAuthoritative\)/);
  assert.match(appSource, /governedPresentation \? Promise\.resolve\(false\) : effectsReady/);
  assert.match(appSource, /governedPresentation \? Promise\.resolve\(false\) : spineReady/);
  assert.match(appSource, /const payMultiplier = Number\(selectedMode\.settlementMultiplier\) \|\| 1/);
  assert.match(appSource, /resulting spin win settles in 0\.1× increments/);
  assert.match(appSource, /is-dreamfall-world/);
  assert.match(appSource, /dataset\.renderProfile/);
  assert.match(styles, /\.board\.is-dreamfall-world/);
  assert.match(styles, /aspect-ratio: 47 \/ 60/);
  assert.match(styles, /\.board\.is-dreamfall-world \.symbol[\s\S]*?aspect-ratio: 1/);
});

test('Morpheus compiled frontend carries the exact square-safe Dreamfall render profile', () => {
  const project = createGameProject({ name: 'Morpheus Dreamfall' });
  project.build.stakeEngine.gameId = 'morpheus_dreamfall';
  const config = createFrontendConfig(project);
  assert.equal(config.compilerVersion, FRONTEND_COMPILER_VERSION);
  assert.equal(config.renderProfiles.morpheusDreamfall.format, 'morpheus-dreamfall-render-profile-v1');
  assert.deepEqual(config.renderProfiles.morpheusDreamfall.world, { x: 413, y: 16, width: 470, height: 600 });
  assert.deepEqual(config.renderProfiles.morpheusDreamfall.cell, { width: 75, height: 75, aspectRatio: 1 });
  assert.deepEqual(config.renderProfiles.morpheusDreamfall.activation.eventTypes, ['expandReelHeight']);
});

test('compiled frontend preserves authored cabinet foreground and environment asset lineage', () => {
  const project = createGameProject({ name: 'World Layer Proof' });
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  project.theme.cabinet.layers.push({ id: 'foreground-proof', type: 'image', assetPackRole: 'foreground', src: png, x: 0, y: 0, width: 1280, height: 800, opacity: 1, zIndex: 58, blendMode: 'normal' });
  project.theme.environmentAssets = { crownSigil: { src: png, x: 550, y: -8, width: 180, height: 112 } };
  const config = createFrontendConfig(project);
  assert.equal(config.cabinetLayers[0].id, 'foreground-proof');
  assert.equal(config.cabinetLayers[0].role, 'foreground');
  assert.equal(config.environmentAssets.crownSigil.width, 180);
  const appSource = readFileSync(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  assert.match(appSource, /config\.cabinetLayers/);
  assert.match(appSource, /config\.environmentAssets/);
  assert.match(appSource, /authoredWorldLayers/);
});

test('social casino copy removes restricted gambling terminology from authored rules', () => {
  const appSource = readFileSync(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  const start = appSource.indexOf('const socialMode');
  const end = appSource.indexOf('const authoredMotionEnabled');
  const socialText = new Function('runtime', `${appSource.slice(start, end)}; return socialText;`)({
    jurisdiction: { socialCasino: true }, launch: { social: false },
  });
  const result = socialText('Buy bonus with a bet amount; wager cash, then rebet. Stake Engine.');
  assert.equal(result, 'Get bonus with a play amount; play coins, then respin. Stake Engine.');
  assert.doesNotMatch(result.replace('Stake Engine', ''), /\b(?:bet|buy|wager|gamble|cash|money|deposit|withdraw|currency|credit|stake)\b/i);
});

test('launch parser honors only official device values and carries the Studio mini hint separately', () => {
  assert.equal(parseLaunch(`${launch}&studioViewport=mini`).studioViewport, 'mini');
  assert.equal(parseLaunch(launch.replace('device=desktop', 'device=mobile')).device, 'mobile');
  assert.throws(() => parseLaunch(launch.replace('device=desktop', 'device=tablet')), /Unsupported device/);
});

test('generated rules configuration carries modes, paytable, mechanics, and triggers', () => {
  const project = createGameProject({ name: 'Rules Proof' });
  project.math.betModes = [{ name: 'bonus', cost: 80, rtp: 0.965, maxWin: 5000, isBuyBonus: true }];
  project.math.bonusMechanics = ['cascades'];
  project.math.freespinTriggers = { basegame: { 3: 10 } };
  const config = createFrontendConfig(project);
  assert.equal(config.betModes[0].cost, 80);
  assert.match(config.betModes[0].description, /Instantly triggers/);
  assert.match(config.rules.mechanics[0], /Winning symbols disappear/);
  assert.match(config.rules.triggers[0], /3 scatter symbols/);
  assert.ok(config.symbols[0].payouts['3'] > 0);
  assert.equal(config.playerInformation.winSystem.label, '243 Ways');
  assert.equal(config.playerInformation.disclosures.length, 6);
  assert.match(config.playerInformation.disclaimer, /TM and © \d{4} Stake Engine/);
});

test('frontend compiler rejects external asset dependencies', () => {
  const project = createGameProject({ name: 'External Asset' });
  project.theme.symbols[0].src = 'https://untrusted.example/symbol.png';
  assert.throws(() => createFrontendConfig(project), /self-contained/);
});
