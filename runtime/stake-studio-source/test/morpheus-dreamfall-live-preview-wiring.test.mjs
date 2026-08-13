import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Morpheus live Preview uses the existing reel renderer with a project-gated reserved world branch', async () => {
  const preview = await source('../src/editor/preview/PreviewPanel.js');
  assert.match(preview, /new MorpheusDreamfallPreviewDriver/);
  assert.match(preview, /reservedWorld \? MORPHEUS_RESERVED_WORLD_ROWS : Math\.max/);
  assert.match(preview, /\(maxRows - reelRows\) \* cellH \/ \(reservedWorld \? 1 : 2\)/);
  assert.match(preview, /class="reel-cap"/);
  assert.match(preview, /data-visible="\$\{visible\}"/);
  assert.match(preview, /collectMorpheusSignatureLayout/);
  assert.match(preview, /collectMorpheusMaxGrowthVisibilityProof/);
  assert.match(preview, /document\.elementsFromPoint\(center\.x, center\.y\)/);
  assert.match(preview, /\.wincap-celebration/);
  assert.match(preview, /visiblyUnoccluded: painted && insideViewport && targetHit && occludedBy\.length === 0/);
  assert.match(preview, /presentMorpheusMaxGrowthForAudit/);
  assert.match(preview, /prepareMorpheusSignatureRenderEvidence/);
  assert.match(preview, /decodedImages\.length === expectedCells/);
  assert.match(preview, /motionCount === expectedCells/);
  assert.match(preview, /syncSymbolMotionFlipbooks\(\{ authoritativeLanded: true \}\)/);
  assert.match(preview, /this\.spinning && !authoritativeLanded && !this\.landedReels\.has\(reel\)/);
  assert.doesNotMatch(preview, /new (?:Pixi|PIXI)\.(?:Application|Container)/);
});

test('Morpheus live Preview is selected by authoritative projectId and exposes semantic bridge commands', async () => {
  const [app, bridge] = await Promise.all([
    source('../src/app.js'),
    source('../src/bridge/StudioBridge.js'),
  ]);
  assert.match(app, /new PreviewPanel\(main, this\.project, \(\) => this\.markDirty\(\), this\.projectId\)/);
  assert.match(bridge, /case 'play_morpheus_dreamfall_signature'/);
  assert.match(bridge, /case 'run_morpheus_signature_capture_audit'/);
  assert.match(bridge, /archivePreviewQACapture/);
  assert.match(bridge, /createMorpheusPreviewObservationProof/);
  assert.match(bridge, /await preview\.prepareMorpheusSignatureRenderEvidence\(observation\.runtime\.state\.reelRows\)/);
  assert.match(bridge, /performance was not measured at the verified 6×8 peak state/);
  assert.match(bridge, /recordMorpheusSignatureCaptureQA/);
  assert.match(bridge, /return \{ report, summary, resources, runId \}/);
  assert.match(bridge, /morpheusDreamfall: preview\.getMorpheusDreamfallPreviewState/);
});

test('Morpheus capture audit binds peak performance to the QA peakState object contract', async () => {
  const bridge = await source('../src/bridge/StudioBridge.js');
  assert.match(bridge, /peakState:\s*\{\s*scenarioId:\s*MORPHEUS_SIGNATURE_SCENARIO_ID,\s*reelRows:\s*\[\.\.\.peakState\.reelRows\],\s*\}/s);
  assert.match(bridge, /performance\.peakState\.scenarioId !== MORPHEUS_SIGNATURE_SCENARIO_ID/);
  assert.match(bridge, /JSON\.stringify\(performance\.peakState\.reelRows\)/);
  assert.doesNotMatch(bridge, /peakState:\s*['"]morpheus-max-growth-8-row['"]/);
});

test('Morpheus QA capture preserves the live Studio window while cropping the exact Preview viewport', async () => {
  const bridge = await source('../src/bridge/StudioBridge.js');
  const captureMethod = bridge.slice(
    bridge.indexOf('async archivePreviewQACapture'),
    bridge.indexOf('async runMorpheusSignatureCaptureAudit'),
  );
  assert.match(captureMethod, /const width = element\.clientWidth;/);
  assert.match(captureMethod, /const height = element\.clientHeight;/);
  assert.match(captureMethod, /const captureWindowWidth = document\.documentElement\.clientWidth \|\| window\.innerWidth \|\| width;/);
  assert.match(captureMethod, /const captureWindowHeight = document\.documentElement\.clientHeight \|\| window\.innerHeight \|\| height;/);
  assert.match(captureMethod, /windowWidth: captureWindowWidth,\s*windowHeight: captureWindowHeight,/s);
  assert.doesNotMatch(captureMethod, /windowWidth:\s*width|windowHeight:\s*height/);
  assert.match(captureMethod, /const useStudioCrop = viewport === 'mini';/);
  assert.match(captureMethod, /const captureTarget = useStudioCrop \? studioRoot : element;/);
  assert.match(captureMethod, /const viewportRect = element\.getBoundingClientRect\(\);/);
  assert.match(captureMethod, /const captureRect = captureTarget\.getBoundingClientRect\(\);/);
  assert.match(captureMethod, /const renderCapture = async \(\{ suppressOrchestration = false \} = \{\}\) => html2canvas\(captureTarget,/);
  assert.match(captureMethod, /const renderedCanvas = await renderCapture\(\);/);
  assert.match(captureMethod, /renderCapture\(\{ suppressOrchestration: true \}\)/);
  assert.match(captureMethod, /const cropX = viewportRect\.left - captureRect\.left \+ captureTarget\.scrollLeft;/);
  assert.match(captureMethod, /const cropY = viewportRect\.top - captureRect\.top \+ captureTarget\.scrollTop;/);
  assert.match(captureMethod, /context\.drawImage\(renderedCanvas, cropX, cropY, width, height, 0, 0, width, height\);/);
});

test('Morpheus mini max-growth evidence is archived before the peak profiler launches its wincap overlay', async () => {
  const bridge = await source('../src/bridge/StudioBridge.js');
  const auditMethod = bridge.slice(
    bridge.indexOf('async runMorpheusSignatureCaptureAudit'),
    bridge.indexOf('async execute('),
  );
  const present = auditMethod.indexOf('await preview.presentMorpheusMaxGrowthForAudit()');
  const archive = auditMethod.indexOf("checkpointId: 'mini-max-growth-8-row'");
  const profile = auditMethod.indexOf('await preview.collectViewportPerformance(viewport)');
  assert.ok(present >= 0 && archive > present && profile > archive);
  assert.match(auditMethod, /checkpointId: 'mini-max-growth-8-row',\s*requireUnoccludedCells: 48,/s);
  assert.match(bridge, /visibilityProof && !visibilityProof\.passed/);
  assert.match(bridge, /return visibilityProof \? \{ \.\.\.archived, visibilityProof \} : archived;/);
  assert.match(auditMethod, /maxGrowth\.frame = maxGrowthFrame;/);
});
