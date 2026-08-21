import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TUMBLE_TIMING, createTumblePlan } from '../src/engines/presentation/visual-excellence/TumbleChoreography.js';

const gameAppUrl = new URL('../server/frontend-template/game-app.js', import.meta.url);
const visualEffectsEntryUrl = new URL('../server/frontend-runtime/visual-effects-entry.js', import.meta.url);
const visualEffectRuntimeUrl = new URL('../src/engines/animation/VisualEffectRuntime.js', import.meta.url);
const previewPanelUrl = new URL('../src/editor/preview/PreviewPanel.js', import.meta.url);
const compiledCssUrl = new URL('../server/frontend-template/styles.css', import.meta.url);
const previewCssUrl = new URL('../src/styles.css', import.meta.url);
const studioBridgeUrl = new URL('../src/bridge/StudioBridge.js', import.meta.url);

test('compiled frontend uses continuous reel tracks and reveals authoritative stops reel by reel', async () => {
  const source = await readFile(gameAppUrl, 'utf8');
  const css = await readFile(compiledCssUrl, 'utf8');
  const begin = source.slice(source.indexOf('function beginReelMotion()'), source.indexOf('\nasync function settleReelMotion'));
  const sequence = source.slice(source.indexOf('function reelSpinSymbolSequence'), source.indexOf('\nfunction createReelSpinTrack'));
  const settle = source.slice(source.indexOf('async function settleReelMotion'), source.indexOf('\nfunction clearWinHighlights'));

  assert.match(sequence, /ordinarySymbols/);
  assert.match(sequence, /symbol\.special\.length === 0/);
  assert.match(sequence, /reelIndex % 2 === 0 \? 3 : 7/);
  assert.match(sequence, /visibleRows \* 3/);
  assert.match(begin, /createReelSpinTrack/);
  assert.match(begin, /effectsController\?\.clearSymbols\?\.\(\)/);
  assert.match(begin, /reel\.append/);
  assert.ok(begin.indexOf("classList.add('is-spinning')") < begin.indexOf('createReelSpinTrack('));
  assert.match(begin, /querySelectorAll\(':scope > \.reel'\)/);
  assert.doesNotMatch(begin, /ui\.board\.children\.length/);
  assert.match(settle, /tracks\.forEach\(track => track\.remove\(\)\)/);
  assert.match(settle, /querySelectorAll\(':scope > \.reel'\)/);
  assert.match(settle, /firstStopDelay \+ reelIndex \* stopGap \+ anticipationHold/);
  assert.match(settle, /timing\.baseDurationMs \* motionScale - elapsedMs/);
  assert.match(settle, /timing\.anticipationHoldMs/);
  assert.match(settle, /reel\.classList\.add\('has-stopped'\)/);
  assert.ok(settle.indexOf('await movingStrip') < settle.indexOf("reel.classList.add('has-stopped')"));
  assert.ok(settle.indexOf("reel.classList.add('has-stopped')") < settle.lastIndexOf('track.remove()'));
  assert.match(settle, /await landedTiles/);
  assert.match(settle, /scheduleSettledSymbolMotionSync\(\)/);
  assert.match(css, /\.reel-spin-track/);
  assert.match(css, /@keyframes compiled-reel-spin-flow/);
  assert.match(css, /\.reel-spin-track \{[^}]*visibility: hidden;[^}]*opacity: 0;/s);
  assert.match(css, /\.board\.is-spinning \.reel-spin-track \{ visibility: visible; opacity: 1; \}/);
  assert.match(css, /\.board\.is-spinning \.reel:not\(\.has-stopped\) > \.symbol img \{ visibility: hidden; opacity: 0 !important; \}/);
  assert.match(css, /\.reel-spin-track \.symbol \{[^}]*background: transparent !important;[^}]*box-shadow: none;/);
  assert.match(css, /\.reel-spin-track \.symbol::before,[\s\S]*content: none;/);
  assert.match(css, /filter: blur\(\.65px\) saturate\(\.9\) brightness\(\.84\)/);
  assert.match(css, /width: 88%; height: 88%; opacity: \.92; animation: compiled-reel-kinetic-smear/);
  assert.match(css, /scaleY\(1\.065\)/);
  assert.doesNotMatch(css, /scaleY\(1\.34\)/);
});

test('compiled frontend renders an explicit tile-to-tile win relationship trace', async () => {
  const [source, css] = await Promise.all([readFile(gameAppUrl, 'utf8'), readFile(compiledCssUrl, 'utf8')]);
  assert.match(source, /function renderWinConnections\(groups, plan\)/);
  assert.match(source, /if \(connectionEffect\.type === 'particleTap'\) return null/);
  assert.match(source, /route\.setAttribute\('pathLength', '1'\)/);
  assert.match(source, /renderWinConnections\(groups, plan\)/);
  assert.match(css, /\.compiled-win-connections \{/);
  assert.match(css, /@keyframes compiled-win-connection-travel/);
});

test('configured particle taps suppress the generic graph and own route visibility', async () => {
  const [app, runtime, effects, preview] = await Promise.all([
    readFile(gameAppUrl, 'utf8'),
    readFile(visualEffectRuntimeUrl, 'utf8'),
    readFile(visualEffectsEntryUrl, 'utf8'),
    readFile(previewPanelUrl, 'utf8'),
  ]);
  assert.match(app, /if \(connectionEffect\.type === 'particleTap'\) return null/);
  assert.match(runtime, /routeAlpha = 1/);
  assert.match(runtime, /routeFade \* 0\.72 \* effect\.routeAlpha/);
  assert.match(effects, /routeAlpha: effect\.routeAlpha/);
  assert.match(preview, /routeAlpha: effect\.routeAlpha/);
});

test('compiled frontend follows Stake numeric-array anticipation semantics', async () => {
  const source = await readFile(gameAppUrl, 'utf8');
  const helper = source.slice(source.indexOf('function hasRevealAnticipation'), source.indexOf('\nfunction createReelSpinTrack'));

  assert.match(helper, /Array\.isArray\(value\)/);
  assert.match(helper, /value\.some\(Boolean\)/);
  assert.doesNotMatch(source, /Boolean\(event\.anticipation\)/);
  assert.match(source, /const anticipated = hasRevealAnticipation\(event\.anticipation\)/);
  assert.match(source, /showStatus\(anticipated \? 'Anticipation' : 'Revealed'\)/);
});

test('compiled frontend teases every waiting reel, not only the last', async () => {
  const source = await readFile(gameAppUrl, 'utf8');
  const settle = source.slice(source.indexOf('async function settleReelMotion'), source.indexOf('\nfunction clearWinHighlights'));
  assert.match(source, /function waitingReelsFromReveal/);
  assert.match(settle, /waitingReelsFromReveal\(anticipation, tracks\.length\)/);
  assert.match(settle, /if \(waiting\[reelIndex\]\) accrued \+= timing\.anticipationHoldMs \* motionScale/);
  assert.match(settle, /firstStopDelay \+ reelIndex \* stopGap \+ anticipationHold/);
  assert.doesNotMatch(settle, /reelIndex === tracks\.length - 1/);
  assert.match(source, /await settleReelMotion\(event\.board, instant, event\.anticipation\)/);
});

test('Preview establishes spin clipping before transient reel art can mount', async () => {
  const [source, css] = await Promise.all([readFile(previewPanelUrl, 'utf8'), readFile(previewCssUrl, 'utf8')]);
  const spin = source.slice(source.indexOf('spin({ automatic = false'), source.indexOf('\n  finishSpinImmediately()'));

  assert.ok(spin.indexOf("this.setAnimationState('spinning')") < spin.indexOf('createPreviewReelSpinTrack('));
  assert.match(spin, /this\.visualEffectRuntime\?\.cancel\?\.\(\)/);
  assert.doesNotMatch(spin, /this\.landedReels\.add\(r\);\s*this\.syncSymbolMotionFlipbooks\(\)/);
  assert.match(css, /\.preview-reel-spin-track \{[^}]*visibility: hidden;[^}]*opacity: 0;/s);
  assert.match(css, /\[data-animation-state="spinning"\] \.preview-reel-spin-track \{ visibility: visible; opacity: 1; \}/);
  assert.match(css, /\.reel-mask:not\(\.has-stopped\) > \.reel-strip \.reel-sym img \{ visibility: hidden; opacity: 0 !important; \}/);
  assert.match(css, /filter: blur\(1\.8px\) saturate\(\.78\) brightness\(\.78\)/);
  assert.match(css, /scaleY\(1\.065\)/);
  assert.doesNotMatch(css, /scaleY\(1\.34\)/);
});

test('final reel impact and reveal recovery complete before win evaluation begins', async () => {
  const [compiled, preview] = await Promise.all([
    readFile(gameAppUrl, 'utf8'),
    readFile(previewPanelUrl, 'utf8'),
  ]);
  const applyEvent = compiled.slice(
    compiled.indexOf('async function applyEvent'),
    compiled.indexOf('\nfunction flash', compiled.indexOf('async function applyEvent')),
  );
  const spin = preview.slice(
    preview.indexOf('spin({ automatic = false'),
    preview.indexOf('\n  finishSpinImmediately()', preview.indexOf('spin({ automatic = false')),
  );

  assert.match(applyEvent, /directorAfterReelsSettle/);
  assert.ok(applyEvent.indexOf('await settleReelMotion') < applyEvent.indexOf('directorMotion = playPresentationEvent'));
  assert.ok(applyEvent.indexOf('directorMotion = playPresentationEvent') < applyEvent.indexOf("channelMotions.push(trackChannel('director'"));
  assert.match(spin, /await Promise\.all\(reelLandingBarriers\.filter\(Boolean\)\)/);
  assert.ok(spin.indexOf("recordPlaybackEvent('reelsLanded'") < spin.indexOf("recordPlaybackEvent('reelsSettled'"));
  assert.ok(spin.indexOf("recordPlaybackEvent('reelsSettled'") < spin.indexOf("await this.dispatchPresentation('reveal'"));
  assert.ok(spin.indexOf("recordPlaybackEvent('revealPresentationComplete'") < spin.indexOf('await this.playSpinResult()'));
  assert.doesNotMatch(spin, /void this\.dispatchPresentation\('reveal'/);
});

test('winning tile choreography is an awaited event barrier before a following tumble', async () => {
  const source = await readFile(gameAppUrl, 'utf8');
  const winBranch = source.match(/case 'winInfo':[\s\S]*?break;/)?.[0] || '';
  const highlight = source.slice(source.indexOf('async function highlightWins'), source.indexOf('\nconst eventPosition'));

  assert.match(winBranch, /await highlightWins/);
  assert.match(highlight, /await wait\(plan\.totalDurationMs\)/);
  assert.match(highlight, /completed:\$\{plan\.acknowledgement\.completionPhase\}/);
  assert.match(source, /for \(const event of events\) \{\s*await applyEvent\(event\)/);
  assert.match(source, /case 'tumbleBoard': await playTumbleBoard/);
});

test('Preview waits for every connection-plan acknowledgement before consuming tumbleBoard', async () => {
  const source = await readFile(previewPanelUrl, 'utf8');
  const player = source.slice(source.indexOf('async playSpinEventBook('), source.indexOf('\n  waitForPresentationMotion(', source.indexOf('async playSpinEventBook(')));
  const scheduler = source.slice(source.indexOf('scheduleTileConnectionPlan('), source.indexOf('\n  currentVisualReelGeometry(', source.indexOf('scheduleTileConnectionPlan(')));
  const energy = source.slice(source.indexOf('playWinEnergyTaps(wins'), source.indexOf('\n  renderWinOrbTaps', source.indexOf('playWinEnergyTaps(wins')));

  assert.match(player, /const winMotion = this\.highlightWins\(wins\)/);
  assert.match(player, /this\.waitForPresentationMotion\(winMotion\)/);
  assert.match(player, /await this\.waitForActiveVisualChoreography\('tile-connection'\)/);
  assert.ok(player.indexOf('await Promise.all([') < player.indexOf("if (event.type === 'tumbleBoard')"));
  assert.match(scheduler, /return \{ timeline, finished \}/);
  assert.match(scheduler, /this\.pendingVisualChoreography\.set\(plan\.id, \{ kind: plan\.kind, finished \}\)/);
  assert.match(scheduler, /this\.pendingVisualChoreography\.delete\(plan\.id\)/);
  assert.match(scheduler, /const run = this\.finishVisualChoreography\(plan, status\)/);
  assert.match(scheduler, /resolveFinished\(run\)/);
  assert.match(energy, /plans\.map\(plan => this\.scheduleTileConnectionPlan\(plan\)\)/);
  assert.match(energy, /return this\.combinePresentationMotion\(\[visualMotion, \.\.\.planTimelines\]\)/);
});

test('optional symbol motion never stalls board transforms or tumbles, including Fast Play', async () => {
  const [source, effects] = await Promise.all([
    readFile(gameAppUrl, 'utf8'),
    readFile(visualEffectsEntryUrl, 'utf8'),
  ]);
  const tumble = source.slice(source.indexOf('async function playTumbleBoard'), source.indexOf('\nasync function playBoardTransform'));
  const transform = source.slice(source.indexOf('async function playBoardTransform'), source.indexOf('\nasync function applyEvent'));

  assert.match(source, /const scheduleOptionalEnhancement/);
  assert.match(source, /function suspendSettledSymbolMotion\(\)/);
  assert.match(source, /effectsController\?\.clearSymbols\?\.\(\)/);
  assert.match(source, /effectsController\?\.cancelTransientEffects\?\.\(\)/);
  assert.match(source, /function resumeSettledSymbolMotion\(\)/);
  assert.match(source, /settledSymbolMotionSuspensionDepth/);
  assert.match(source, /settledSymbolMotionGeneration/);
  assert.match(source, /function settledSymbolMotionAllowed\(\)/);
  assert.match(source, /generation !== settledSymbolMotionGeneration \|\| !settledSymbolMotionAllowed\(\)/);
  assert.match(source, /const waitForVisualLayout =/);
  assert.match(source, /!ui\.board\?\.classList\.contains\('is-symbol-motion-suspended'\)/);
  assert.match(tumble, /suspendSettledSymbolMotion\(\)/);
  assert.match(tumble, /resumeSettledSymbolMotion\(\)/);
  assert.ok(tumble.indexOf("await wait(phase('evaluate'))") < tumble.indexOf("classList.remove('is-tumbling')"));
  assert.ok(tumble.indexOf("classList.remove('is-tumbling')") < tumble.indexOf('resumeSettledSymbolMotion()'));
  assert.match(tumble, /finally \{[\s\S]*if \(!symbolMotionResumed\) resumeSettledSymbolMotion\(\)/);
  assert.match(transform, /suspendSettledSymbolMotion\(\)/);
  assert.match(transform, /resumeSettledSymbolMotion\(\)/);
  assert.match(effects, /const symbolSyncAllowed =/);
  assert.match(effects, /classList\.contains\('is-tumbling'\)/);
  assert.match(effects, /generation !== symbolSyncGeneration \|\| !symbolSyncAllowed\(\)/);
  assert.match(effects, /const cancelTransientEffects = \(\) =>/);
  assert.match(effects, /transientPlaybackGeneration \+= 1/);
  assert.match(effects, /loaded === null/);
  assert.match(effects, /getTurbo\(\) \? 220 : 1_200/);
  const expand = source.slice(source.indexOf("case 'expandReelHeight':"), source.indexOf("case 'tumbleChainProgress':"));
  assert.match(expand, /suspendSettledSymbolMotion\(\)/);
  assert.match(expand, /await waitForVisualLayout\(\)/);
  assert.match(expand, /resumeSettledSymbolMotion\(\)/);
  assert.doesNotMatch(tumble, /await settleOptionalEnhancement\(effectsReady\.then\(controller => controller\?\.(?:clearSymbols|syncSymbols)/);
  assert.doesNotMatch(transform, /await settleOptionalEnhancement\(effectsReady\.then\(controller => controller\?\.(?:clearSymbols|syncSymbols)/);
  assert.match(source, /motionMode: plan\.motionMode/);
  assert.match(effects, /fast \? 220 : 1_200/);
  assert.match(effects, /reducedMotion \? 240 : fast \? 360 : 900/);
  assert.match(effects, /durationMs !== null && durationMs !== undefined/);
  assert.match(transform, /await Promise\.all\(changes\.map\(async \(change, index\) =>/);
  assert.match(transform, /index \* \(turbo \? 7 : 16\)/);
  assert.match(transform, /current\.classList\.add\('is-transforming-out'\)/);
  assert.match(transform, /replacement\.classList\.add\('is-transforming-in'\)/);
  assert.match(transform, /filter: 'brightness\(2\.15\) saturate\(1\.35\) blur\(5px\)'/);
  assert.match(transform, /clearWinHighlights\(\{ preservePlanStatus: true \}\)/);
  assert.match(source, /function clearWinHighlights\(\{ preservePlanStatus = false \} = \{\}\)/);
});

test('settled idle motion pauses while tumble or win choreography owns the board', async () => {
  const css = await readFile(compiledCssUrl, 'utf8');
  assert.match(css, /\.board\.is-symbol-motion-suspended \.symbol\[data-motion\][^{]*img,/);
  assert.match(css, /\.board\.is-resolving-win \.symbol\[data-motion\]:not\(\.is-win-target\) img \{ animation-play-state: paused !important; \}/);
});

test('Preview holds settled symbol motion through an authoritative tumble and attaches only after cleanup', async () => {
  const source = await readFile(previewPanelUrl, 'utf8');
  const scheduler = source.slice(source.indexOf('scheduleSymbolMotionSync()'), source.indexOf('\n  createTumbleSymbol', source.indexOf('scheduleSymbolMotionSync()')));
  const tumble = source.slice(source.indexOf('async playStakeTumble'), source.indexOf('\n  /** Animate only mechanic-authored'));
  const transform = source.slice(source.indexOf('async playStakeBoardTransform'), source.indexOf('\n  pulseReelImpact'));

  assert.match(scheduler, /symbolMotionSuspensionDepth > 0/);
  assert.match(scheduler, /classList\.contains\('is-tumbling'\)/);
  assert.match(scheduler, /scheduleSymbolMotionSync\(\{ authoritativeLanded = false \} = \{\}\)/);
  assert.match(scheduler, /this\.spinning && !authoritativeLanded/);
  assert.match(scheduler, /this\.syncSymbolMotionFlipbooks\(\{ authoritativeLanded \}\)/);
  assert.match(scheduler, /suspendSettledSymbolMotion\(\)/);
  assert.match(scheduler, /resumeSettledSymbolMotion\(\)/);
  assert.match(scheduler, /this\.scheduleSymbolMotionSync\(\{ authoritativeLanded: true \}\)/);
  assert.match(scheduler, /this\.visualEffectRuntime\?\.cancel\?\.\(\)/);
  assert.match(scheduler, /this\.visualEffectRuntime\?\.cancelEnergyTaps\?\.\(\)/);
  assert.match(tumble, /this\.suspendSettledSymbolMotion\(\)/);
  assert.ok(tumble.indexOf('this.suspendSettledSymbolMotion()') < tumble.indexOf('this.beginVisualChoreography(plan'));
  assert.ok(tumble.indexOf("frame.classList.remove('is-tumbling')") < tumble.indexOf('this.resumeSettledSymbolMotion()'));
  assert.match(transform, /this\.suspendSettledSymbolMotion\(\)/);
  assert.match(transform, /finally \{[\s\S]*this\.resumeSettledSymbolMotion\(\)/);
});

test('Preview rerenders preserve the authoritative settled board and cannot attach motion from a random replacement', async () => {
  const source = await readFile(previewPanelUrl, 'utf8');
  const render = source.slice(source.indexOf('  render() {'), source.indexOf('\n  async mountAnimationRuntime'));
  const selectMode = source.slice(source.indexOf('  selectPlayerMode('), source.indexOf('\n  stepBaseBet'));

  assert.match(render, /if \(Array\.isArray\(this\.board\) && this\.board\.length\) this\.paintBoard\(this\.board\)/);
  assert.match(render, /else this\.populateInitialBoard\(\)/);
  assert.ok(render.indexOf('this.paintBoard(this.board)') < render.indexOf('this.mountVisualEffectRuntime(cab)'));
  assert.match(selectMode, /this\.board = null/);
  assert.ok(selectMode.indexOf('this.board = null') < selectMode.indexOf('this.render()'));
});

test('Preview and exported tumbles keep professional tile wells fixed while artwork moves', async () => {
  const [compiledCss, previewCss] = await Promise.all([
    readFile(compiledCssUrl, 'utf8'),
    readFile(previewCssUrl, 'utf8'),
  ]);
  assert.match(compiledCss, /\.symbol \{[^}]*radial-gradient\(circle at 50% 32%/);
  assert.match(previewCss, /\.reel-sym::before \{[^}]*radial-gradient\(circle at 50% 32%/);
  assert.match(previewCss, /rgba\(164,196,221,\.3\)/);
  assert.match(compiledCss, /rgba\(164,196,221,\.3\)/);
  assert.match(previewCss, /\.reel-frame\.is-tumbling > \.reel-mask \{ visibility: visible; \}/);
  assert.match(previewCss, /\.reel-frame\.is-tumbling > \.reel-mask \.reel-sym img \{ visibility: hidden; \}/);
  assert.match(previewCss, /\.preview-tumble-symbol::before \{ content: none; \}/);
  assert.match(previewCss, /\.preview-tumble-symbol \{[^}]*border: 0;[^}]*background: transparent !important;[^}]*box-shadow: none;/);
  assert.match(compiledCss, /\.board\.is-tumbling \.reel > \.symbol \{ overflow: visible; \}/);
  assert.match(previewCss, /\.preview-tumble-symbol img \{[^}]*width: 90%;[^}]*height: 90%/);
});

test('Preview and export separate tumble entry, gravity, and landing without moving untouched reels', async () => {
  const [source, previewPanel, compiledCss, previewCss] = await Promise.all([
    readFile(gameAppUrl, 'utf8'),
    readFile(previewPanelUrl, 'utf8'),
    readFile(compiledCssUrl, 'utf8'),
    readFile(previewCssUrl, 'utf8'),
  ]);
  const tumble = source.slice(source.indexOf('async function playTumbleBoard'), source.indexOf('\nasync function playBoardTransform'));
  const previewTumble = previewPanel.slice(previewPanel.indexOf('async playStakeTumble'), previewPanel.indexOf('\n  /** Animate only mechanic-authored'));

  assert.match(tumble, /if \(Math\.abs\(travel\) < \.5\) continue/);
  assert.match(tumble, /const enterOffset =/);
  assert.match(tumble, /const landingOffset =/);
  assert.match(tumble, /const artwork = element\.querySelector\('img'\) \|\| element/);
  assert.match(tumble, /artwork\.animate\(/);
  assert.match(tumble, /classList\.add\('is-tumble-incoming'\)/);
  assert.match(tumble, /for \(const \[index, element\] of incomingElements\.entries\(\)\)/);
  assert.match(tumble, /incomingElements\.length - index/);
  assert.match(tumble, /fill: 'backwards'/);
  assert.match(tumble, /duration: travelDuration, delay: 0/);
  assert.match(tumble, /classList\.remove\('is-tumble-incoming'\)/);
  assert.match(tumble, /classList\.add\('is-tumbling'\)/);
  assert.match(tumble, /classList\.remove\('is-tumbling'\)/);
  assert.match(tumble, /easing: 'cubic-bezier\(\.34,\.01,\.72,\.42\)'/);
  assert.match(tumble, /landingElements\.push\(landedSymbols\.at\(-1\)\)/);
  assert.match(tumble, /classList\.add\('is-tumble-landing'\)/);
  assert.match(tumble, /landingReels\.forEach\(element => element\.classList\.add\('is-tumble-impact'\)\)/);
  assert.match(previewTumble, /if \(targetRow !== row\) survivorMotions\.push\(cell\)/);
  assert.match(previewTumble, /landingCells\.push\(reelCells\.at\(-1\)\)/);
  assert.match(previewTumble, /classList\.add\('is-tumble-landing'\)/);
  assert.match(compiledCss, /@keyframes compiled-tumble-landing-ring/);
  assert.match(compiledCss, /@keyframes compiled-tumble-column-impact/);
  assert.match(compiledCss, /\.symbol\.is-tumble-incoming img \{ opacity: 0; \}/);
  assert.match(previewCss, /@keyframes preview-tumble-landing-ring/);
});

test('tumble gravity keeps every affected column on one coherent clock', () => {
  const plan = createTumblePlan({
    eventId: 'coherent-columns',
    reelGeometry: {
      cells: Array.from({ length: 3 }, (_, reel) => Array.from({ length: 4 }, (_, row) => ({
        reel, row, x: reel * 100, y: row * 100, width: 90, height: 90,
      }))).flat(),
    },
    clearedPositions: [{ reel: 0, row: 3 }, { reel: 1, row: 2 }, { reel: 2, row: 1 }],
    movements: [
      { type: 'fall', id: 'a', from: { reel: 0, row: 0 }, to: { reel: 0, row: 1 } },
      { type: 'fall', id: 'b', from: { reel: 1, row: 0 }, to: { reel: 1, row: 1 } },
      { type: 'enter', id: 'c', to: { reel: 2, row: 0 } },
    ],
  });
  assert.equal(TUMBLE_TIMING.staggerMs, 0);
  for (const phaseId of ['clear', 'enter', 'fall', 'settle']) {
    assert.ok(plan.phases.find(phase => phase.id === phaseId).cues.every(cue => cue.relativeAtMs === 0));
  }
});

test('authored win presentation gives the payout a readable center-stage owner', async () => {
  const [source, compiledCss, previewPanel, previewCss] = await Promise.all([
    readFile(gameAppUrl, 'utf8'),
    readFile(compiledCssUrl, 'utf8'),
    readFile(previewPanelUrl, 'utf8'),
    readFile(previewCssUrl, 'utf8'),
  ]);
  assert.match(source, /cue\.channel === 'ui' && cue\.action === 'winDisplay'/);
  assert.match(source, /showWinDisplay\(amount, \{ durationMs: duration \* scale \}\)/);
  assert.match(source, /const visibleRunningWin = Number\.isFinite\(cumulative\)/);
  assert.match(source, /ui\.winValue\.textContent = `\$\{visibleRunningWin\.toFixed\(2\)\}×`/);
  assert.match(source, /stage-message-copy/);
  assert.match(compiledCss, /\.stage-message-value/);
  assert.match(previewPanel, /preview-win-result/);
  assert.match(previewCss, /\.preview-win-result/);
});

test('win presentation recovers the board before returning control', async () => {
  const [source, compiledCss, previewPanel, previewCss] = await Promise.all([
    readFile(gameAppUrl, 'utf8'),
    readFile(compiledCssUrl, 'utf8'),
    readFile(previewPanelUrl, 'utf8'),
    readFile(previewCssUrl, 'utf8'),
  ]);
  const recovery = source.slice(
    source.indexOf('async function recoverWinPresentation'),
    source.indexOf('\nfunction renderWinConnections'),
  );
  const finalWin = source.slice(source.indexOf("case 'finalWin':"), source.indexOf("case 'tumbleBoard':"));
  const previewResult = previewPanel.slice(
    previewPanel.indexOf('async playSpinResult()'),
    previewPanel.indexOf('\n  async playSpinEventBook'),
  );

  assert.match(recovery, /classList\.add\('is-win-recovering'\)/);
  assert.match(recovery, /await wait\(turbo \? 90 : 240\)/);
  assert.match(recovery, /clearWinHighlights\(\)/);
  assert.match(recovery, /scheduleSettledSymbolMotionSync\(\)/);
  assert.match(finalWin, /await recoverWinPresentation\(\{ instant \}\)/);
  assert.match(compiledCss, /\.board\.is-resolving-win\.is-win-recovering \.symbol:not\(\.is-win-target\) \{ opacity: 1; \}/);
  assert.match(previewResult, /await this\.recoverWinPresentation\(\)/);
  assert.match(previewPanel, /async recoverWinPresentation\(\{ immediate = false \} = \{\}\)/);
  assert.match(previewCss, /\.preview-stage\.is-win-recovering \.reel-sym\.win-dimmed/);
});

test('Preview tumble makes recognition, reaction, clear, gravity, and landing visibly distinct', async () => {
  const [source, css] = await Promise.all([
    readFile(previewPanelUrl, 'utf8'),
    readFile(previewCssUrl, 'utf8'),
  ]);
  const tumble = source.slice(source.indexOf('async playStakeTumble'), source.indexOf('\n  /** Animate only mechanic-authored'));
  assert.match(tumble, /classList\.add\('is-tumble-recognized'\)/);
  assert.match(tumble, /classList\.add\('is-tumble-reacting'\)/);
  assert.match(tumble, /classList\.add\('is-tumble-clearing'\)/);
  assert.match(tumble, /filter: 'blur\(5px\) brightness\(1\.25\)'/);
  assert.match(tumble, /ease: 'power2\.in'/);
  assert.match(tumble, /scaleY: \.94, scaleX: 1\.035/);
  assert.match(css, /@keyframes preview-tumble-recognition/);
  assert.match(css, /@keyframes preview-tumble-reaction/);
  assert.match(css, /@keyframes preview-tumble-clear-burst/);
  assert.match(css, /@keyframes preview-tumble-landing-flash/);
});

test('shared-frame capture never blocks an active visual choreography', async () => {
  const bridge = await readFile(studioBridgeUrl, 'utf8');
  const capture = bridge.slice(bridge.indexOf("async captureView(reason = 'manual')"), bridge.indexOf('\n  async archivePreviewQACapture', bridge.indexOf("async captureView(reason = 'manual')")));
  assert.match(capture, /preview\?\.activeVisualChoreography\?\.size > 0/);
  assert.ok(capture.indexOf('activeVisualChoreography') < capture.indexOf("const root = document.querySelector('.studio')"));
});

test('win connection graphics begin on the first winning tile in Preview and export', async () => {
  const [compiledEffects, previewPanel] = await Promise.all([
    readFile(visualEffectsEntryUrl, 'utf8'),
    readFile(previewPanelUrl, 'utf8'),
  ]);
  const compiledOrigin = compiledEffects.slice(
    compiledEffects.indexOf("const origin = event?.type === 'winInfo'"),
    compiledEffects.indexOf('\n    const warm ='),
  );
  const previewWinRoute = previewPanel.slice(
    previewPanel.indexOf('playWinEnergyTaps(wins'),
    previewPanel.indexOf('\n  renderWinOrbTaps'),
  );

  assert.match(compiledOrigin, /event\?\.type === 'winInfo' \? null/);
  assert.match(previewWinRoute, /origin: null/);
  assert.match(compiledEffects, /effect\.tileAnchorY/);
  assert.match(previewPanel, /anchor: \{ x: 0\.5, y: tileAnchorY \}/);
  assert.match(compiledEffects, /routeWidth: effect\.routeWidth/);
  assert.match(previewPanel, /messengerRadius: effect\.messengerRadius/);
  assert.doesNotMatch(previewWinRoute, /origin: effect\.origin/);
});

test('compiled frontend reports landed symbol-motion attachment without making it a gameplay barrier', async () => {
  const [effects, css] = await Promise.all([
    readFile(visualEffectsEntryUrl, 'utf8'),
    readFile(compiledCssUrl, 'utf8'),
  ]);
  assert.match(effects, /host\.dataset\.symbolMotionStatus = 'loading'/);
  const sync = effects.slice(effects.indexOf('const syncSymbols = async'), effects.indexOf('\n  const clearSymbols ='));
  assert.ok(sync.indexOf('clearDomSymbolFlipbooks()') < sync.indexOf("host.dataset.symbolMotionStatus = 'loading'"));
  assert.ok(sync.indexOf('runtime.clearSymbolFlipbooks?.()') < sync.indexOf("host.dataset.symbolMotionStatus = 'loading'"));
  assert.match(effects, /Promise\.all\(assetIds\.map\(async assetId =>/);
  assert.match(effects, /const readyInstances = instances\.filter\(instance => loadedIds\.has\(instance\.assetId\)\)/);
  assert.match(effects, /const fallbackEnabled = enableDomSymbolFlipbooks\(fallbackInstances/);
  assert.match(effects, /enabled \? 'partial-fallback' : 'fallback'/);
  assert.match(effects, /host\.dataset\.symbolMotionCount = String\(enabled \+ fallbackEnabled\)/);
  assert.match(css, /\.symbol-motion-fallback \{/);
  assert.match(effects, /host\.dataset\.symbolMotionAssets = \[\.\.\.new Set/);
});

test('governed symbol motion stays anchored to its affected tile', async () => {
  const [source, effects, css] = await Promise.all([
    readFile(gameAppUrl, 'utf8'),
    readFile(visualEffectsEntryUrl, 'utf8'),
    readFile(compiledCssUrl, 'utf8'),
  ]);
  assert.match(source, /event: packet\.presentationEvent/);
  assert.match(effects, /const authoredMotionPlacement = \(assetId, event\)/);
  assert.match(effects, /event\?\.sources\?\.\[0\] \|\| event\?\.positions\?\.\[0\]/);
  assert.match(effects, /symbol\.motionAssetId === assetId/);
  assert.match(effects, /plate\.classList\.add\('is-tile-local'\)/);
  assert.match(effects, /motionPlacement: placement\?\.design \|\| null/);
  assert.match(css, /\.visual-motion-fallback\.is-tile-local/);
  assert.match(css, /opacity: var\(--motion-alpha, \.9\)/);
  const specialResolution = source.slice(source.indexOf("case 'specialPositionsResolved':"), source.indexOf("case 'symbolUpgrade':"));
  assert.match(specialResolution, /await settleOptionalEnhancement\(/);
  assert.match(specialResolution, /playTileConnections\?\.\(event/);
  assert.ok(specialResolution.indexOf('playTileConnections') < specialResolution.indexOf('playBoardTransform'));
});

test('Oneiric Star keeps a visible source-to-target lock until conversion resolves', async () => {
  const [source, previewPanel, compiledCss, previewCss] = await Promise.all([
    readFile(gameAppUrl, 'utf8'),
    readFile(previewPanelUrl, 'utf8'),
    readFile(compiledCssUrl, 'utf8'),
    readFile(previewCssUrl, 'utf8'),
  ]);
  const targetSelection = source.slice(
    source.indexOf('async function playOneiricTargetSelection'),
    source.indexOf('\nfunction syncMechanicMarkers'),
  );
  const targetBranch = source.slice(
    source.indexOf("case 'specialTargetSelected':"),
    source.indexOf("case 'specialPositionsResolved':"),
  );
  const resolutionBranch = source.slice(
    source.indexOf("case 'specialPositionsResolved':"),
    source.indexOf("case 'symbolUpgrade':"),
  );

  assert.match(targetSelection, /oneiricTargetPositions/);
  assert.match(targetSelection, /\n\s+sources,\n/);
  assert.match(targetSelection, /playTileConnections/);
  assert.match(targetBranch, /await playOneiricTargetSelection/);
  assert.match(resolutionBranch, /playTileConnections/);
  assert.ok(resolutionBranch.indexOf('playTileConnections') < resolutionBranch.indexOf('clearOneiricTargetSelection'));
  assert.ok(resolutionBranch.indexOf('clearOneiricTargetSelection') < resolutionBranch.indexOf('playBoardTransform'));
  assert.match(previewPanel, /setOneiricStarTargetLock\(sources, targets\)/);
  assert.match(previewPanel, /pulseMechanicCells\(payload\.positions, 'is-oneiric-resolved'\)/);
  assert.match(compiledCss, /\.board\.is-oneiric-targeting/);
  assert.match(compiledCss, /compiled-oneiric-target-lock/);
  assert.match(previewCss, /\.reel-frame\.is-oneiric-targeting/);
  assert.match(previewCss, /preview-oneiric-resolve/);
});

test('Dreamfall reel growth reveals a recessed tile well instead of a floating symbol', async () => {
  const source = await readFile(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  const compiledStyles = await readFile(new URL('../server/frontend-template/styles.css', import.meta.url), 'utf8');
  const preview = await readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
  const previewStyles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(source, /const dormantGrid = node\('div', 'dreamfall-dormant-grid'\)/);
  assert.match(source, /visualRowCapacity - grownRows/);
  assert.match(source, /well\.dataset\.dormantState = depth === 1 \? 'next' : 'locked'/);
  assert.match(source, /symbolDefinition\('DREAM_MASK'\)/);
  assert.match(compiledStyles, /\.dreamfall-dormant-well/);
  assert.match(compiledStyles, /\.dreamfall-dormant-glyph/);
  assert.match(preview, /id="previewDormantGrid"/);
  assert.match(preview, /maxRows - counts\[reel\]/);
  assert.match(preview, /well\.dataset\.dormantState = depth === 1 \? 'next' : 'locked'/);
  assert.match(preview, /this\.symbolDefinition\('DREAM_MASK'\)/);
  assert.match(previewStyles, /\.preview-dormant-well/);
  assert.match(previewStyles, /\.preview-dormant-glyph/);
});

test('Morpheus ordinary wins and Dreamfall progress use authored player art instead of diagnostic panels', async () => {
  const [source, compiledStyles, preview, previewStyles] = await Promise.all([
    readFile(gameAppUrl, 'utf8'),
    readFile(compiledCssUrl, 'utf8'),
    readFile(previewPanelUrl, 'utf8'),
    readFile(previewCssUrl, 'utf8'),
  ]);
  assert.match(source, /ui\.message\.dataset\.authoredArt = 'true'/);
  assert.match(source, /--stage-message-art/);
  assert.match(source, /feature-reel-meter/);
  assert.match(source, /featureState\.chainHit/);
  assert.match(compiledStyles, /\.stage-message\[data-authored-art="true"\]/);
  assert.match(compiledStyles, /\.feature-progress\.is-dreamfall/);
  assert.match(preview, /class="dreamfall-hud"/);
  assert.match(preview, /--win-result-art/);
  assert.match(previewStyles, /\.preview-win-result\.has-authored-art/);
  assert.match(previewStyles, /\.dreamfall-hud-growth/);
});

test('portrait mobile preserves the authored full-canvas cabinet coordinate plane', async () => {
  const [css, source] = await Promise.all([readFile(compiledCssUrl, 'utf8'), readFile(gameAppUrl, 'utf8')]);
  assert.doesNotMatch(css, /@media \(max-aspect-ratio: 3 \/ 4\)/);
  assert.match(css, /\.game-shell\[data-composition-mode="full-canvas-cabinet-v1"\] \.stage \{[\s\S]*?width: min\(100vw,[\s\S]*?height: min\(100vh,/);
  assert.match(css, /\.game-shell\.is-dreamfall-world \.authored-world-foreground,[\s\S]*?visibility: hidden/);
  assert.match(css, /\.game-shell:not\(\.is-dreamfall-world\) \.authored-world-dreamfall-cabinet \{ display: none; \}/);
  assert.match(source, /button\.dataset\.control = key/);
  assert.match(css, /\[data-layout="mini"\] \.authored-control\[data-control="bonus"\] > span/);
  assert.match(css, /\[data-layout="mini"\] \.authored-control\.bet-step > span/);
});

test('only a visible StakeStudio tab can own and execute agent commands', async () => {
  const source = await readFile(studioBridgeUrl, 'utf8');
  const start = source.slice(source.indexOf('  start() {'), source.indexOf('\n  isOwner()'));
  const ownership = source.slice(source.indexOf('  claimOwnership() {'), source.indexOf('\n  setStatus('));
  const poll = source.slice(source.indexOf('  async pollCommands() {'), source.indexOf('\n  async executeCommand('));

  assert.match(start, /if \(document\.visibilityState === 'visible'\) this\.claimOwnership\(\);/);
  assert.doesNotMatch(start, /document\.visibilityState === 'visible' \|\| this\.ownerLeaseExpired\(\)/);
  assert.match(start, /if \(document\.visibilityState !== 'visible'\) \{\s*this\.releaseOwnership\(\);\s*return;/);
  assert.match(ownership, /claimOwnership\(\) \{\s*if \(document\.visibilityState !== 'visible'\) return false;/);
  assert.match(ownership, /releaseOwnership\(\) \{[\s\S]*?localStorage\.removeItem\(BRIDGE_OWNER_KEY\);/);
  assert.match(poll, /if \(document\.visibilityState !== 'visible'\) \{\s*this\.releaseOwnership\(\);\s*return;/);
});

test('shared diagnostics cannot outlive the clean Studio owner that replaced them', async () => {
  const source = await readFile(studioBridgeUrl, 'utf8');
  const ownership = source.slice(source.indexOf('  claimOwnership() {'), source.indexOf('\n  setStatus('));
  const publish = source.slice(source.indexOf('  async publishDiagnostics('), source.indexOf('\n  currentState('));
  const state = source.slice(source.indexOf('  async publishState('), source.indexOf('\n  afterRender('));
  const clear = source.slice(source.indexOf("      case 'clear_diagnostics':"), source.indexOf("      case 'start_math_publisher':"));

  assert.match(ownership, /this\.lastPublishedErrorsSignature = null;/);
  assert.match(publish, /if \(!this\.isOwner\(\)\) return null;/);
  assert.match(publish, /signature === this\.lastPublishedErrorsSignature/);
  assert.match(publish, /request\('\/errors',[\s\S]*?errors: this\.errors/);
  assert.match(source, /diagnostics: \{[\s\S]*?errors: this\.errors,/);
  assert.ok(state.indexOf('await this.publishDiagnostics()') < state.indexOf("await request('/state'"));
  assert.match(clear, /this\.publishDiagnostics\(\{ force: true \}\)/);
});
