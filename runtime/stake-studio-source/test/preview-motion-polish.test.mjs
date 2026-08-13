import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

test('preview spin travel stays inside populated reel buffers', async () => {
  const source = await readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
  assert.match(source, /reelSpinDist = cellH \* \(0\.92 \+ Math\.random\(\) \* 0\.18 \+ r \* 0\.05\)/);
  assert.doesNotMatch(source, /spinDistance = cellH \* \(8/);
});

test('Morpheus HUD uses a packaged raster control asset', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const asset = new URL('../public/assets/morpheus-spin-control-v1.png', import.meta.url);
  assert.match(css, /morpheus-spin-control-v1\.png/);
  assert.ok((await stat(asset)).size > 10_000);
});

test('mini Preview keeps the active-mode control out of the reel window', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(css, /\.preview-viewport\.mini \.preview-mode-chip \{ display: none; \}/);
  assert.match(css, /\.preview-viewport\.mini \.hud-art-button > span \{[^}]*font-size: 24px;/);
  assert.match(source, /const compactModeLabel = mode\.name === 'base'/);
  assert.match(source, /id="previewBonusMenu"[^>]*current \$\{this\.esc\(this\.label\(mode\.name\)\)\}/);
  assert.match(source, /<span>\$\{this\.esc\(compactModeLabel\)\}<\/span>/);
});

test('mobile Preview keeps the redundant mode chip out of the reel window', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.preview-viewport\.mobile \.preview-mode-chip \{ display: none; \}/);
});

test('cascade playback consumes Stake events without whole-board repaint drops', async () => {
  const source = await readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const playerStart = source.indexOf('async playSpinResult()');
  const player = source.slice(playerStart, source.indexOf('\n  pulseReelImpact(', playerStart));
  assert.match(player, /event\.type === 'tumbleBoard'/);
  assert.match(player, /await this\.playStakeTumble\(currentBoard, event\)/);
  assert.match(player, /Promise\.resolve\(this\.dispatchPresentation\('winInfo'/);
  assert.doesNotMatch(player, /paintBoard\(step\.board\)/);
  assert.doesNotMatch(player, /dropBoardIn\(\)/);
  assert.match(source, /frame\.classList\.add\('is-tumbling'\)/);
  assert.match(css, /\.reel-frame\.is-tumbling > \.reel-mask \{ visibility: hidden; \}/);
  assert.match(css, /\.preview-tumble-layer/);
});

test('every bonus spin consumes its authoritative event book instead of painting a terminal board', async () => {
  const source = await readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
  const start = source.indexOf('async playFeaturePerformance(round)');
  const player = source.slice(start, source.indexOf('\n  playFeatureFinale(', start));
  assert.match(player, /await this\.playSpinEventBook\(spin/);
  assert.match(player, /alreadyLanded: directFeature && index === 0/);
  assert.match(player, /featureRunning: running/);
  assert.match(player, /Math\.max\(0, 1450 - elapsed\)/);
  assert.ok(player.indexOf("recordPlaybackEvent('featureSpinEnd'") > player.indexOf('await this.playSpinEventBook(spin'));
  assert.doesNotMatch(player, /this\.paintBoard\(spin\.board\)/);
  assert.doesNotMatch(player, /void this\.dispatchPresentation\('winInfo'/);
});

test('live preview bridge allows complete ten-spin feature playback', async () => {
  const bridge = await readFile(new URL('../src/bridge/StudioBridge.js', import.meta.url), 'utf8');
  const mcp = await readFile(new URL('../mcp/server.mjs', import.meta.url), 'utf8');
  assert.match(bridge, /BASE_PREVIEW_SPIN_TIMEOUT_MS = 20000/);
  assert.match(bridge, /FEATURE_SPIN_PRESENTATION_BUDGET_MS = 12000/);
  assert.match(bridge, /MAX_PREVIEW_SPIN_TIMEOUT_MS = 150000/);
  assert.match(bridge, /freeSpins \* FEATURE_SPIN_PRESENTATION_BUDGET_MS/);
  assert.match(mcp, /studioCommand\('spin_preview', \{\}, 160000\)/);
});
