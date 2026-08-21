import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

test('preview spin keeps professional wells fixed while an artwork-only track travels', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /createPreviewReelSpinTrack/);
  assert.match(source, /previewReelSpinSequence/);
  assert.match(source, /visibleRows \* 3/);
  assert.match(source, /mask\.appendChild\(track\)/);
  assert.match(source, /this\.paintReelBoard\(r, newBoard\[r\]\)/);
  assert.doesNotMatch(source, /reelSpinDist/);
  assert.doesNotMatch(source, /this\.runBlurPhase\(/);
  assert.match(css, /\.preview-stage\[data-animation-state="spinning"\] \.reel-mask:not\(\.has-stopped\) > \.reel-strip \.reel-sym img \{ visibility: hidden; opacity: 0 !important; \}/);
  assert.match(css, /\.preview-reel-spin-track \{/);
  assert.match(css, /\.preview-reel-spin-symbol \{[^}]*background: transparent;[^}]*box-shadow: none;/);
  assert.match(css, /\.preview-reel-spin-symbol::before,[\s\S]*content: none;/);
  assert.match(css, /@keyframes preview-reel-spin-flow/);
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
  assert.match(css, /\.reel-frame\.is-tumbling > \.reel-mask \{ visibility: visible; \}/);
  assert.match(css, /\.reel-frame\.is-tumbling > \.reel-mask \.reel-sym img \{ visibility: hidden; \}/);
  assert.match(css, /\.preview-tumble-symbol::before \{ content: none; \}/);
  assert.match(css, /\.preview-tumble-symbol \{[^}]*background: transparent !important;[^}]*box-shadow: none;/);
  assert.match(css, /\.preview-tumble-layer/);
});

test('Preview executes authoritative Visual Excellence phases for connections and tumbles', async () => {
  const source = await readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
  const connectionStart = source.indexOf('\n  createTileConnectionPlans(wins');
  const connection = source.slice(connectionStart, source.indexOf('\n  createTumbleSymbol(', connectionStart));
  const tumblePlanStart = source.indexOf('\n  createTumbleChoreographyPlan(');
  const tumblePlan = source.slice(tumblePlanStart, source.indexOf('\n  /**', tumblePlanStart));
  const tumble = source.slice(source.indexOf('async playStakeTumble('), source.indexOf('\n  /** Animate only mechanic-authored', source.indexOf('async playStakeTumble(')));
  const control = source.slice(source.indexOf('beginVisualChoreography('), source.indexOf('\n  currentVisualReelGeometry(', source.indexOf('beginVisualChoreography(')));

  assert.match(connection, /win\.positions/);
  assert.match(connection, /relationshipEdges/);
  assert.match(connection, /visualSequenceIntensity\('tile-connections', 'normal'\)/);
  assert.doesNotMatch(connection, /this\.board.*filter|positionsForSymbol/);
  assert.match(source, /plan\.routes\.map/);
  assert.match(source, /data-relationship=/);
  assert.match(tumble, /event\.explodingSymbols/);
  assert.match(tumble, /event\.newSymbols/);
  assert.match(tumble, /createTumbleChoreographyPlan/);
  assert.match(tumblePlan, /visualSequenceIntensity\('tumble', 'major'\)/);
  assert.match(tumble, /phase\('clear'\)/);
  assert.match(tumble, /phase\('enter'\)/);
  assert.match(tumble, /phase\('fall'\)/);
  assert.match(tumble, /phase\('settle'\)/);
  assert.match(tumble, /is-tumble-recognized/);
  assert.match(tumble, /is-tumble-reacting/);
  assert.match(tumble, /is-tumble-clearing/);
  assert.match(tumble, /is-tumble-landing/);
  assert.match(control, /visualChoreographyStart/);
  assert.match(control, /visualChoreographyPhase/);
  assert.match(control, /createChoreographyAcknowledgement/);
  assert.match(control, /visualChoreographyAcknowledged/);
});

test('base and variable-row motion overlays share the generic aspect-preserving safe rectangle', async () => {
  const source = await readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
  const sync = source.slice(source.indexOf('syncSymbolMotionFlipbooks('), source.indexOf('\n  populateInitialBoard(', source.indexOf('syncSymbolMotionFlipbooks(')));
  assert.match(sync, /createAspectPreservingOverlayRect/);
  assert.doesNotMatch(sync, /const overlayStage = this\.isMorpheusDreamfallWorldActive/);
  assert.match(sync, /aspectPreserved: Math\.abs/);
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
