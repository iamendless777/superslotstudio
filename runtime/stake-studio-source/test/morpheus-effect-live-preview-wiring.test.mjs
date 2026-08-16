import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const previewUrl = new URL('../src/editor/preview/PreviewPanel.js', import.meta.url);
const bridgeUrl = new URL('../src/bridge/StudioBridge.js', import.meta.url);
const appUrl = new URL('../src/app.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);
const mcpUrl = new URL('../mcp/server.mjs', import.meta.url);
const audioPanelUrl = new URL('../src/editor/audio/AudioPanel.js', import.meta.url);

test('live Preview routes governed effects through the existing reel, HUD, VFX, and verdict surfaces', async () => {
  const source = await readFile(previewUrl, 'utf8');
  assert.match(source, /MorpheusEffectOrchestrationPreviewDriver/);
  assert.match(source, /async playMorpheusEffectProofRoute/);
  assert.match(source, /async renderMorpheusEffectProofCommand/);
  assert.match(source, /this\.paintBoard\(this\.board\)/);
  assert.match(source, /this\.playSpecialMechanicEvent/);
  assert.match(source, /this\.animateMorpheusDreamfallExpansion/);
  assert.match(source, /this\.playStakeTumble/);
  assert.match(source, /this\.playWincapCelebration\(payload\.multiplier/);
  assert.match(source, /effectOrchestration:\s*this\.getMorpheusEffectProofState\(\)/);
  assert.match(source, /playMorpheusEffectProofAudio/);
  assert.match(source, /playStingerWithReceipt/);
  assert.match(source, /audioReceipt/);
  assert.match(source, /const noMotion = command\.motionMode === 'none'/);
  assert.match(source, /staticOnly: noMotion/);
  assert.match(source, /if \(!noMotion\) await this\.playSpecialMechanicEvent/);
});

test('Audio Factory and delegated commands expose the governed specialty pack without touching math', async () => {
  const [audioPanel, bridge, mcp] = await Promise.all([
    readFile(audioPanelUrl, 'utf8'), readFile(bridgeUrl, 'utf8'), readFile(mcpUrl, 'utf8'),
  ]);
  assert.match(audioPanel, /installMorpheusEffectCuePack/);
  assert.match(audioPanel, /handleGenerateMorpheusEffectPack/);
  assert.match(audioPanel, /auditionMorpheusEffectPack/);
  assert.match(bridge, /case 'install_morpheus_effect_audio_pack'/);
  assert.match(bridge, /case 'audition_morpheus_effect_audio_pack'/);
  assert.match(mcp, /name:\s*'install_morpheus_effect_audio_pack'/);
  assert.match(mcp, /name:\s*'audition_morpheus_effect_audio_pack'/);
  assert.doesNotMatch(audioPanel, /project\.math\s*=/);
});

test('exact MAX overlay accepts the authoritative multiplier instead of reading stale project math', async () => {
  const source = await readFile(previewUrl, 'utf8');
  assert.match(source, /playWincapCelebration\(multiplier = this\.project\.math\.wincap/);
  assert.match(source, /Number\(multiplier\)\.toLocaleString\(\)/);
  assert.doesNotMatch(
    source.match(/playWincapCelebration\(multiplier[\s\S]*?\n  }\n\n  winTier/)?.[0] || '',
    /Number\(this\.project\.math\.wincap\)\.toLocaleString\(\)/,
  );
});

test('StudioBridge and MCP expose one delegated proof-route command without manufacturing evidence', async () => {
  const [bridge, mcp] = await Promise.all([readFile(bridgeUrl, 'utf8'), readFile(mcpUrl, 'utf8')]);
  assert.match(bridge, /case 'play_morpheus_effect_proof_route'/);
  assert.match(bridge, /preview\.playMorpheusEffectProofRoute/);
  assert.match(mcp, /name:\s*'play_morpheus_effect_proof_route'/);
  assert.match(mcp, /studioCommand\('play_morpheus_effect_proof_route'/);
  assert.match(mcp, /enum:\s*\['normal', 'fast', 'reduced', 'none'\]/);
  assert.doesNotMatch(
    mcp,
    /studioCommand\('play_morpheus_effect_proof_route',[\s\S]{0,220}\b(?:reconstruct|acknowledge|presentationPlans)\b/,
  );
});

test('StudioBridge and MCP expose the immutable 84-run seven-route capture matrix', async () => {
  const [bridge, mcp] = await Promise.all([readFile(bridgeUrl, 'utf8'), readFile(mcpUrl, 'utf8')]);
  assert.match(bridge, /async runMorpheusEffectRouteCaptureAudit/);
  assert.match(bridge, /MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES/);
  assert.match(bridge, /archivePreviewQACapture/);
  assert.match(bridge, /recordMorpheusEffectRouteCaptureQA/);
  assert.match(bridge, /case 'run_morpheus_effect_route_capture_audit'/);
  assert.match(bridge, /preview\.collectPositionGridLayoutProof\(\)/);
  assert.match(bridge, /Position-grid orchestration layout failed/);
  assert.match(bridge, /'\.preview-mechanic-state-layer'/);
  assert.match(bridge, /classList\.remove\('is-mechanic-source', 'is-mechanic-target', 'win-dimmed', 'is-winning', 'is-landed', 'win-highlight'\)/);
  assert.match(bridge, /image\.style\.animation = 'none'/);
  assert.match(bridge, /image\.style\.transform = 'none'/);
  assert.match(mcp, /name:\s*'run_morpheus_effect_route_capture_audit'/);
  assert.match(mcp, /studioCommand\('run_morpheus_effect_route_capture_audit'/);
  assert.match(mcp, /motionMode: a\.motionMode/);
  assert.match(mcp, /a\.routeId \? 180000 : 900000/);
  assert.match(mcp, /Run or resume the governed Morpheus effect-route matrix/);
  for (const routeId of [
    'predeterminedGeneratorDeclarations',
    'nightmareReliquaryDeclarations',
    'lucidFamilyMultiplierSettlement',
    'veilAscentUpgrade',
    'tricksterGridSettlement',
    'mysteryStarDreamfallTumble',
    'exactMaxTermination',
  ]) assert.match(mcp, new RegExp(routeId));
});

test('Veil Ascent upgrades repaint the authoritative board before recognition', async () => {
  const preview = await readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
  assert.match(preview, /sourceEvent\.type === 'symbolUpgrade'[\s\S]*payload\.boardBefore[\s\S]*playStakeBoardTransform[\s\S]*payload\.boardAfter/);
});

test('pre-reveal capture producer is cache-bound and never requests symbol recognition before reveal', async () => {
  const [index, app, bridge] = await Promise.all([
    readFile(indexUrl, 'utf8'), readFile(appUrl, 'utf8'), readFile(bridgeUrl, 'utf8'),
  ]);
  assert.match(index, /app\.js\?v=visual-excellence-20260815-22/);
  assert.match(app, /PreviewPanel\.js\?orchestration=20260815-40/);
  assert.match(app, /StudioBridge\.js\?orchestration=20260815-32/);
  assert.match(bridge, /let authoritativeRevealCommitted = false/);
  assert.match(bridge, /if \(observation\.sourceEvent\.type === 'reveal'\) authoritativeRevealCommitted = true/);
  assert.match(bridge, /const boardCommitted = authoritativeRevealCommitted/);
  assert.match(bridge, /collectMorpheusPreRevealPresentation/);
  assert.match(bridge, /boardAuthority: boardCommitted \? 'authoritative-reveal-or-later' : 'uncommitted-pre-reveal'/);
  assert.match(bridge, /recognitionRequest: boardCommitted/);
});

test('effect-route audit persists and resumes only visually valid route-motion-viewport shards', async () => {
  const bridge = await readFile(bridgeUrl, 'utf8');
  assert.match(bridge, /runMorpheusEffectRouteCaptureShard/);
  assert.match(bridge, /morpheusEffectRouteCaptureDraft/);
  assert.match(bridge, /completedShardKeys/);
  assert.match(bridge, /evaluateMorpheusEffectRouteCaptureQA\(resumeEvidence, this\.studio\.project\)/);
  assert.match(bridge, /const resumeSources = \[certified, draft\]\.filter\(compatible\)/);
  assert.match(bridge, /problem === key \|\| problem\.startsWith\(`\$\{key\}:`\)/);
  assert.match(bridge, /if \(reusableRunKeys\.has\(key\)\) continue/);
  assert.match(bridge, /await this\.saveProject\(`morpheus-effect-route-shard:\$\{key\}`\)/);
  assert.match(bridge, /A Morpheus capture shard requires routeId, motionMode, and viewport together/);
});

test('non-normal effect-route captures remember reveal authority before selecting the final checkpoint', async () => {
  const bridge = await readFile(bridgeUrl, 'utf8');
  const revealIndex = bridge.indexOf("if (observation.sourceEvent.type === 'reveal') authoritativeRevealCommitted = true;");
  const finalOnlyIndex = bridge.indexOf("if (motionMode !== 'normal' && eventIndex !== eventCount - 1) return;", revealIndex);
  assert.ok(revealIndex >= 0);
  assert.ok(finalOnlyIndex > revealIndex);
});

test('effect-route observation reads the visible win HUD outside Dreamfall world', async () => {
  const preview = await readFile(previewUrl, 'utf8');
  assert.match(preview, /const dreamfallWorld = this\.isMorpheusDreamfallWorldActive\(\)/);
  assert.match(preview, /const runningWinSelector = dreamfallWorld \? '#dreamfallHudWin' : '#hudWin'/);
  assert.match(preview, /runningWin: Math\.round\(numberFrom\(runningWinSelector\)/);
});

test('non-Dreamfall effect routes expose their authoritative free-spin state in the visible feature HUD', async () => {
  const preview = await readFile(previewUrl, 'utf8');
  assert.match(preview, /if \(runtimeState && !dreamfallRoute\) \{[\s\S]*?this\.updateFeatureProgress\(/);
  assert.ok(preview.includes('.match(/FREE SPIN\\s+(\\d+)\\s*\\//i)'));
  assert.match(preview, /freeSpinsRemaining: dreamfallWorld[\s\S]*?Number\(featureSpinMatch\?\.\[1\] \|\| 0\)/);
});

test('mechanic cell pulses normalize typed protocol positions before DOM lookup', async () => {
  const preview = await readFile(previewUrl, 'utf8');
  assert.match(preview, /const cells = this\.eventPositions\(positions\)\.map\(\(\[reel, row\]\) => this\.cellAt\(reel, row\)\)/);
});

test('rendered-cell recognition crops the painted contain rect rather than the padded img box', async () => {
  const preview = await readFile(previewUrl, 'utf8');
  assert.match(preview, /paintedLayoutHeight = localBoxWidth \/ sourceAspect/);
  assert.match(preview, /paintedRect\.height = rect\.height \* \(paintedLayoutHeight \/ localBoxHeight\)/);
  assert.match(preview, /layoutWidth: paintedLayoutWidth/);
  assert.match(preview, /left: paintedRect\.left - viewportRect\.left/);
  assert.match(preview, /left: cellRect\.left \+ image\.offsetLeft \* scaleX/);
  assert.match(preview, /height: image\.offsetHeight \* scaleY/);
});
