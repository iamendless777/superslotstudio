import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('compiled frontend awaits Stake tumble and motion channels', async () => {
  const source = await readFile(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  const effects = await readFile(new URL('../server/frontend-runtime/visual-effects-entry.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../server/frontend-template/styles.css', import.meta.url), 'utf8');
  const visualRuntime = await readFile(new URL('../src/engines/animation/VisualEffectRuntime.js', import.meta.url), 'utf8');
  assert.match(source, /case 'tumbleBoard': await playTumbleBoard\(event, instant\)/);
  assert.match(source, /case 'boardTransform': await playBoardTransform\(event, instant\)/);
  assert.match(source, /case 'wildBomb': showStatus/);
  assert.match(source, /case 'positionMultiplierGridUpdate':/);
  assert.match(source, /symbolMultipliers\.set\(event\.symbol/);
  assert.match(source, /await Promise\.all\(channelMotions\)/);
  assert.match(source, /effectsController\?\.clearSymbols\?\.\(\)/);
  assert.doesNotMatch(source, /case 'tumbleBoard': showStatus\('Cascade'\)/);
  assert.match(effects, /clearSymbols/);
  assert.match(effects, /runtime\.clearSymbolFlipbooks\?\.\(\)/);
  assert.match(effects, /'lucidWildMultiplier'/);
  assert.match(effects, /runtime\.playEnergyTaps\(tap\.points, tap\.options\)/);
  assert.match(source, /dataset\.visualPhase = 'interaction'/);
  assert.match(source, /schedulePhase\('reaction'/);
  assert.match(source, /schedulePhase\('propagation'/);
  assert.match(source, /schedulePhase\('resolution'/);
  assert.match(source, /element\.classList\.add\('is-tumble-recognized'\)/);
  assert.match(source, /setPhase\('reaction'\)/);
  assert.match(source, /setPhase\('clear'\)/);
  assert.match(source, /setPhase\('space'\)/);
  assert.match(source, /setPhase\('enter'\)/);
  assert.match(source, /setPhase\('fall'\)/);
  assert.match(source, /setPhase\('settle'\)/);
  assert.match(source, /setPhase\('evaluate'\)/);
  assert.match(styles, /@keyframes compiled-win-tile-impact/);
  assert.match(styles, /@keyframes compiled-tumble-recognition/);
  assert.match(styles, /@keyframes compiled-tumble-clear-burst/);
  assert.doesNotMatch(styles, /@keyframes win-pulse/);
  assert.match(visualRuntime, /quadraticCurveTo\(controlX, controlY, current\.x, current\.y\)/);
});

test('optional enhancement startup cannot hold a wallet round open forever', async () => {
  const source = await readFile(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  const effects = await readFile(new URL('../server/frontend-runtime/visual-effects-entry.js', import.meta.url), 'utf8');
  assert.match(source, /const ENHANCEMENT_TIMEOUT_MS = 4_000/);
  assert.match(source, /Promise\.race\(\[/);
  assert.match(source, /continuing the round without it/);
  assert.match(source, /settleOptionalEnhancement\(\s*effectsReady\.then/);
  assert.match(source, /settleOptionalEnhancement\(\s*spineReady\.then/);
  assert.match(source, /Required Morpheus visual effect runtime/);
  assert.match(source, /Required Morpheus Spine runtime/);
  assert.match(effects, /Ambient plates are decorative warmup, not a readiness gate/);
  assert.doesNotMatch(effects, /await runtime\.preloadMotionAssets\(ambientAssetIds\)/);
  assert.match(effects, /playDomMotionAtlas/);
  assert.match(effects, /awaitWithin\(runtime\.preloadMotionAssets\(\[assetId\]\), fast \? 220 : 1_200\)/);
  assert.match(effects, /Promise\.all\(assetIds\.map\(async assetId =>/);
  assert.match(effects, /runtime\.preloadMotionAssets\(\[assetId\]\)/);
  assert.match(effects, /const readyInstances = instances\.filter/);
  assert.match(effects, /async playTileConnections/);
  assert.match(effects, /finally \{\s*runtime\.cancelEnergyTaps\?\.\(\)/);
  assert.match(effects, /const clearSymbols = \(\) => \{[\s\S]*?runtime\.cancelEnergyTaps\?\.\(\)/);
  assert.match(source, /Governed tile connection playback/);
});

test('compiled Spine respects authored cabinet depth without changing skeleton draw order', async () => {
  const spine = await readFile(new URL('../server/frontend-runtime/spine-entry.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../server/frontend-template/styles.css', import.meta.url), 'utf8');
  assert.match(spine, /authoredPlacement\.zIndex/);
  assert.match(spine, /host\.style\.zIndex = String/);
  assert.match(spine, /const cabinetScaleX = surface\.width \/ cabinetWidth/);
  assert.match(spine, /const cabinetScaleY = surface\.height \/ cabinetHeight/);
  assert.match(spine, /Number\(placement\.x\).*?\* cabinetScaleX/);
  assert.match(styles, /\.board\.is-dreamfall-world \.symbol img \{\s*width: 90%;\s*height: 90%;/);
});

test('authored composition uses one full-screen cabinet coordinate plane', async () => {
  const app = await readFile(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../server/frontend-template/styles.css', import.meta.url), 'utf8');
  assert.match(app, /config\.compositionMode === 'full-canvas-cabinet-v1'/);
  assert.match(app, /if \(fullCanvasCabinet\) \{[\s\S]*?stage\.append\(top, hud, ui\.status, ui\.multiplier\);[\s\S]*?shell\.append\(stageWrap\)/);
  assert.match(styles, /\.game-shell\[data-composition-mode="full-canvas-cabinet-v1"\] \.stage-wrap \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?display: block;[\s\S]*?padding: 0;/);
  assert.match(styles, /\.game-shell\[data-composition-mode="full-canvas-cabinet-v1"\] \{[\s\S]*?background-image: var\(--theme-background, none\);[\s\S]*?background-size: cover;/);
  assert.match(styles, /\.game-shell\[data-composition-mode="full-canvas-cabinet-v1"\]::before \{ content: none; animation: none; \}/);
  assert.match(styles, /\.game-shell\[data-composition-mode="full-canvas-cabinet-v1"\] \.stage \{[\s\S]*?position: absolute;[\s\S]*?left: 50%;[\s\S]*?top: 50%;[\s\S]*?width: min\(100vw,[\s\S]*?height: min\(100vh,[\s\S]*?transform: translate\(-50%, -50%\);[\s\S]*?overflow: clip;[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;/);
  assert.match(styles, /\.player-dashboard\[data-authored-composition="true"\] \{[\s\S]*?min-height: 0;/);
  assert.match(styles, /\.game-shell\[data-composition-mode="full-canvas-cabinet-v1"\] \.authored-control\.bet-step > span \{\s*display: none;/);
  assert.match(app, /dreamfallWorldActive \? dreamfallProfile\?\.world : config\.reelArea/);
  assert.match(app, /symbols\.length\) \/ visualRowCapacity \* 100/);
  assert.match(styles, /\.game-shell\.is-dreamfall-world \.authored-world-foreground,[\s\S]*?visibility: hidden/);
  assert.match(styles, /\.game-shell:not\(\.is-dreamfall-world\) \.authored-world-dreamfall-cabinet \{ display: none; \}/);
  assert.match(styles, /\.living-cabinet-glow \{[\s\S]*?z-index: 45/);
  assert.match(styles, /\.board\.is-dreamfall-world,[\s\S]*?z-index: 50/);
  assert.match(styles, /\.game-shell\[data-composition-mode="full-canvas-cabinet-v1"\] \.feature-progress \{[\s\S]*?top: 13%;[\s\S]*?left: 2\.4%;[\s\S]*?width: min\(24%, 330px\);/);
  assert.match(styles, /\.game-shell\[data-composition-mode="full-canvas-cabinet-v1"\] \.feature-progress > \.presentation-art \{ display: none; \}/);
  assert.match(styles, /\.game-shell\[data-composition-mode="full-canvas-cabinet-v1"\] \.stage-overlay \{ z-index: 70; \}/);
});

test('enhanced wager modes present their board-selection cause with authored motion', async () => {
  const app = await readFile(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  const effects = await readFile(new URL('../server/frontend-runtime/visual-effects-entry.js', import.meta.url), 'utf8');
  assert.match(app, /case 'modeBoardSelection'/);
  assert.match(app, /Chosen from \$\{event\.candidateCount/);
  assert.match(effects, /'modeBoardSelection'/);
  assert.match(app, /case 'symbolUpgrade':[\s\S]*?event\.morpheusAuthoritative && event\.boardAfter[\s\S]*?await playBoardTransform/);
});
