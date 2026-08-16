import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  PROFESSIONAL_STANDARD_ID,
  QUALITY_CATEGORIES,
  QualityDirector,
  applyProfessionalDefaults,
} from '../src/engines/quality/QualityDirector.js';
import { PRODUCTION_ANIMATION_STATES } from '../src/engines/animation/AnimationProfiles.js';
import { forgeArtBible, lockArtBible } from '../src/engines/assets/VisualAssetFactory.js';
import { getPresentationFingerprint } from '../src/engines/presentation/PresentationInterruptionQA.js';
import { recordPerformanceProfile } from '../src/engines/quality/PerformanceProfiler.js';
import { getReplayFingerprint } from '../src/engines/quality/ReplayMatrixQA.js';
import { getViewportLayoutFingerprint } from '../src/engines/quality/ViewportLayoutQA.js';
import { buildAssetIntegrityInventory, getAssetIntegrityFingerprint } from '../src/engines/quality/AssetIntegrityQA.js';
import { AUDIO_EVENT_SEQUENCE } from '../src/engines/audio/AudioDirector.js';
import { buildAudioMasteringInventory, recordAudioMasteringQA } from '../src/engines/quality/AudioMasteringQA.js';
import { WIN_TIER_ORDER } from '../src/engines/presentation/PresentationDirector.js';
import { recordPresentationPolishQA } from '../src/engines/quality/PresentationPolishQA.js';
import { recordPlayerInformationQA } from '../src/engines/quality/PlayerInformationQA.js';
import {
  buildVisualCohesionInventory,
  getVisualSourceFingerprint,
  recordVisualCohesionQA,
} from '../src/engines/quality/VisualCohesionQA.js';
import { getRigStressCasePlan, recordRigStressQA } from '../src/engines/quality/RigStressQA.js';
import { getMathSDKContractFingerprint } from '../src/engines/build/MathSDKExporter.js';

const HEALTHY_RIG_METRICS = {
  sampledPixels: 16384, visiblePixels: 4800, alphaMass: 0.28,
  widthFraction: 0.5, heightFraction: 0.75, boundsAreaFraction: 0.375,
  occupancy: 0.78, centroidX: 0.5, centroidY: 0.52,
  edgeTouchFraction: 0, components: 1, largestComponentShare: 1,
};

function recordCleanRigStress(projectValue, asset) {
  recordRigStressQA(projectValue, asset.name, getRigStressCasePlan(asset).map(item => ({
    ...item,
    anglesTested: item.angles,
    correctionsTriggered: [],
    poseMechanicsTriggered: [],
    measurements: item.angles.map(angle => ({ angle, metrics: HEALTHY_RIG_METRICS })),
  })));
}

function project() {
  const value = createGameProject({ name: 'Quality Fixture' });
  value.math.betModes = [
    { name: 'base', cost: 1, rtp: 0.965, maxWin: 5000, autoCloseDisabled: false, isFeature: true, isBuyBonus: false, distributions: [] },
  ];
  value.build.stakeEngine.gameId = 'quality_fixture';
  return value;
}

test('new projects carry a balanced professional production contract', () => {
  const value = project();
  const audit = new QualityDirector(value).audit();
  assert.equal(value.production.standard, PROFESSIONAL_STANDARD_ID);
  assert.equal(value.production.targetScore, 90);
  assert.equal(value.production.categoryFloor, 70);
  assert.deepEqual(audit.categories.map(category => category.id), Object.keys(QUALITY_CATEGORIES));
  assert.equal(audit.releaseReady, false);
  assert.ok(audit.blockers.length > 0);
  assert.ok(audit.weakCategories.length > 0);
});

test('professional defaults set budgets without manufacturing review evidence', () => {
  const value = project();
  value.atlas.padding = 0;
  value.build.simulations = { base: 1000, bonus: 1000 };
  value.production.budgets.maxInitialBundleMb = 40;
  applyProfessionalDefaults(value);
  assert.equal(value.atlas.padding, 2);
  assert.equal(value.build.simulations.base, 500000);
  assert.equal(value.build.simulations.bonus, 125000);
  assert.equal(value.production.budgets.maxInitialBundleMb, 8);
  assert.equal(value.production.qa.visualCohesionAudit, null);
  assert.equal(value.production.qa.performanceProfiled, false);
});

test('every discipline must independently clear the professional floor', () => {
  const value = completedProject();
  value.audio.director.ducking.enabled = false;
  value.presentationDirector.recipes.find(item => item.event === 'wincap').cues.find(cue => cue.channel === 'audio').at = 900;
  recordAudioMasteringQA(value, value.production.audio.masteringAudit.samples);
  recordPresentationPolishQA(value);
  const audit = new QualityDirector(value).audit();
  assert.ok(audit.score >= 80);
  assert.equal(audit.releaseReady, false);
  assert.ok(audit.weakCategories.some(category => category.id === 'audio'));
});

test('rig-correction evidence requires valid authored fixes and a clean rendered sweep', () => {
  const value = project();
  const asset = { name: 'hero', bones: ['root', 'arm'], slots: [], attachments: [], animations: [] };
  value.animation.spineAssets = [asset];
  value.production.rig.corrections = [{
    id: 'arm-fill', name: 'Arm fill', type: 'overlay', asset: 'hero', bone: 'arm', minAngle: 45, maxAngle: 135,
  }];
  recordCleanRigStress(value, asset);
  let check = new QualityDirector(value).audit().checks.find(item => item.id === 'animation-rig-corrections');
  assert.equal(check.passed, false);
  assert.match(check.evidence, /1 invalid/);

  value.production.rig.corrections[0].image = 'data:image/png;base64,eA==';
  check = new QualityDirector(value).audit().checks.find(item => item.id === 'animation-rig-corrections');
  assert.equal(check.passed, false);
  assert.match(check.evidence, /stale evidence/);
  recordCleanRigStress(value, asset);
  check = new QualityDirector(value).audit().checks.find(item => item.id === 'animation-rig-corrections');
  assert.equal(check.passed, true);
  assert.match(check.evidence, /0 residual pixel findings · 1 active corrections · 0 invalid/);
});

test('pose mechanics are optional only when a clean rendered sweep proves they are unnecessary', () => {
  const value = project();
  const asset = { name: 'hero', bones: ['root', 'foot'], slots: ['body', 'foot'], attachments: [], animations: [] };
  value.animation.spineAssets = [asset];
  value.production.rig.anchors = [{ id: 'plant', name: 'Foot plant', asset: 'hero', bone: 'missing', mode: 'plant', strength: 1 }];
  recordCleanRigStress(value, asset);
  let check = new QualityDirector(value).audit().checks.find(item => item.id === 'animation-pose-mechanics');
  assert.equal(check.passed, false);
  assert.match(check.evidence, /1 invalid/);

  value.production.rig.anchors[0].bone = 'foot';
  check = new QualityDirector(value).audit().checks.find(item => item.id === 'animation-pose-mechanics');
  assert.equal(check.passed, false);
  assert.match(check.evidence, /stale evidence/);
  recordCleanRigStress(value, asset);
  check = new QualityDirector(value).audit().checks.find(item => item.id === 'animation-pose-mechanics');
  assert.equal(check.passed, true);
  value.production.rig.anchors = [];
  recordCleanRigStress(value, asset);
  check = new QualityDirector(value).audit().checks.find(item => item.id === 'animation-pose-mechanics');
  assert.equal(check.passed, true);
  assert.match(check.evidence, /0 active mechanics/);
});

test('a fully evidenced project passes the cross-discipline quality gate', () => {
  const audit = new QualityDirector(completedProject()).audit();
  assert.equal(audit.score, 100);
  assert.equal(audit.blockers.length, 0);
  assert.equal(audit.warnings.length, 0);
  assert.equal(audit.weakCategories.length, 0);
  assert.equal(audit.releaseReady, true);
});

test('verified books become a release blocker when executable math changes', () => {
  const value = completedProject();
  const publishedFingerprint = value.build.mathPublish.contractFingerprint;
  value.math.betModes[0].cost = 2;
  const releaseMath = new QualityDirector(value).audit().checks.find(item => item.id === 'release-math');
  assert.notEqual(getMathSDKContractFingerprint(value), publishedFingerprint);
  assert.equal(releaseMath.passed, false);
  assert.match(releaseMath.evidence, /stale or missing executable contract/);
});

test('initial bundle budget excludes assets explicitly deferred until after first paint', () => {
  const value = completedProject();
  value.build.frontend.totalBytes = 28 * 1024 * 1024;
  value.build.frontend.initialBytes = 5 * 1024 * 1024;
  const bundle = new QualityDirector(value).audit().checks.find(item => item.id === 'performance-bundle');
  assert.equal(bundle.passed, true);
  assert.match(bundle.evidence, /5\.00 MB initial \/ 8 MB · 28\.00 MB complete package/);
});

function completedProject() {
  const value = project();
  value.theme.style = 'Graphic gothic comedy with carved shapes and controlled neon accents';
  value.theme.lore = 'A cursed midnight game show where every spin bargains with the host.';
  value.theme.colorPalette = ['#101018', '#742cff', '#ff365d', '#f4d35e'];
  value.theme.cabinet.layers = [
    { name: 'background', assetPackRole: 'background', src: 'data:image/png;base64,background' },
    { name: 'foreground', assetPackRole: 'foreground', src: 'data:image/png;base64,foreground' },
  ];
  value.theme.submission = {
    background: 'data:image/png;base64,background', foreground: 'data:image/png;base64,foreground', providerLogo: 'data:image/png;base64,provider',
  };
  value.theme.symbols.forEach(symbol => { symbol.src = `data:image/png;base64,${symbol.name}`; });

  for (const state of PRODUCTION_ANIMATION_STATES) value.animation.states[state].layers = [{ type: 'pose', name: state }];
  for (const state of WIN_TIER_ORDER) value.animation.states[state].layers = [{ type: 'pose', name: state }];
  value.production.creative.coreHook = 'Every spin makes the host more dangerous.';
  value.production.creative.signatureMoment = 'The host tears open the cabinet when the max-win pact lands.';
  value.production.creative.differentiators = ['Angle-reactive host performance', 'Escalating pact meter changes the world'];
  value.production.presentation.interruptionAudit = {
    format: 'stake-studio-presentation-interruption-qa-v1',
    fingerprint: getPresentationFingerprint(value),
    runAt: '2026-08-03T00:00:00.000Z',
    passed: true, total: 33, passedCases: 33, structuralIssues: [], cases: [],
  };
  recordPresentationPolishQA(value);
  value.production.presentation.reelChoreographyReviewed = true;
  value.production.presentation.winEscalationReviewed = true;
  value.visualFactory.artBible = forgeArtBible(value);
  lockArtBible(value);

  const audioAsset = event => ({ src: `data:audio/wav;base64,${event}`, source: 'procedural', volume: 1, factory: { peak: 0.89 } });
  value.audio.layers.baseMusic = { src: 'data:audio/wav;base64,music', loop: true, volume: 0.7, source: 'procedural-music' };
  value.audio.layers.bonusMusic = { src: 'data:audio/wav;base64,bonus', loop: true, volume: 0.7, source: 'procedural-music' };
  for (const event of AUDIO_EVENT_SEQUENCE) value.audio.stingers[event] = ['reelStop', 'scatterLand'].includes(event)
    ? [1, 2, 3].map(index => audioAsset(`${event}${index}`)) : audioAsset(event);
  recordAudioMasteringQA(value, buildAudioMasteringInventory(value).map(asset => ({
    id: asset.id, loaded: true, sourceFingerprint: asset.id, mime: 'audio/wav', portable: true,
    duration: asset.type === 'stinger' ? 0.6 : 8, sampleRate: 44100, channels: 1, sampleCount: 26460,
    peak: 0.89, rms: 0.12, dcOffset: 0.001, clippedSamples: 0, leadingSilenceMs: 8, trailingSilenceMs: 12,
  })));

  value.math.bonusMechanics = ['cascades'];
  value.math.freespinTriggers = { basegame: { 3: 10, 4: 15, 5: 20 } };
  value.math.wincapRtp = 0.0005;
  value.production.qa.desktopApproved = true;
  value.production.qa.mobileApproved = true;
  value.production.qa.miniApproved = true;
  value.production.qa.viewportAudit = {
    format: 'stake-studio-viewport-layout-qa-v2',
    fingerprint: getViewportLayoutFingerprint(value),
    runAt: '2026-08-03T00:00:00.000Z', passed: true, issues: [],
    samples: ['desktop', 'mobile', 'mini'].map(viewport => ({
      viewport, viewportWidth: 1280, viewportHeight: 720, overflowX: 0, overflowY: 0, stageScale: 1,
      stage: { x: 0, y: 0, width: 1280, height: 720 }, reels: { x: 120, y: 80, width: 960, height: 430 },
      hud: { x: 0, y: 560, width: 1280, height: 160 }, spin: { x: 560, y: 600, width: 120, height: 50 },
      controlTargets: [{ id: 'spin', x: 560, y: 600, width: 120, height: 50 }],
      minimumSymbolWidth: 64, minimumSymbolHeight: 64, hudLabelFontPx: 10, hudValueFontPx: 18, controlsOverlap: false,
    })),
  };
  value.production.qa.deterministicReplayVerified = true;
  value.production.qa.replayAudit = {
    format: 'stake-studio-replay-matrix-qa-v1',
    fingerprint: getReplayFingerprint(value),
    runAt: '2026-08-03T00:00:00.000Z',
    passed: true, total: 8, passedCases: 8, presentationCases: 5, mathCases: 3,
    structuralIssues: [], cases: [],
  };

  value.build.frontend = {
    entry: 'index.html', files: ['index.html', 'assets/game.js'], totalBytes: 2 * 1024 * 1024,
    capabilities: { walletLifecycle: true, replay: true, jurisdiction: true, serverOwnedBalance: true, responsive: true },
  };
  value.production.qa.assetIntegrityVerified = true;
  const integrityInventory = buildAssetIntegrityInventory(value);
  value.production.qa.assetIntegrityAudit = {
    format: 'stake-studio-asset-integrity-qa-v1',
    fingerprint: getAssetIntegrityFingerprint(value),
    runAt: '2026-08-03T00:00:00.000Z', passed: true, issues: [],
    totalAssets: integrityInventory.length, passedAssets: integrityInventory.length, decodedBytes: 8 * 1024 * 1024, atlasReady: true,
    samples: integrityInventory.map(asset => ({
      id: asset.id, loaded: true, sourceFingerprint: asset.id, mime: 'image/png', portable: true,
      width: Math.max(asset.minWidth, 256), height: Math.max(asset.minHeight, 256), byteLength: 64 * 1024,
      decodedBytes: Math.max(asset.minWidth, 256) * Math.max(asset.minHeight, 256) * 4,
      hasTransparency: true, opaqueEdgeRatio: 0, croppedEdgeRatio: 0, transparentColorRisk: 0,
    })),
  };
  recordVisualCohesionQA(value, buildVisualCohesionInventory(value).map(asset => ({
    id: asset.id,
    sourceFingerprint: getVisualSourceFingerprint(asset.src),
    analysis: {
      format: 'stake-studio-visual-analysis-v1', slot: asset.slot, score: 100, passed: true,
      blockers: [], warnings: [], checks: [{ id: 'palette', name: 'Palette', passed: true }], metrics: {},
    },
  })));
  value.build.stakeEngine.providerName = 'Factory Studio';
  value.build.stakeEngine.providerNumber = 42;
  recordPlayerInformationQA(value);
  value.build.mathPublish = {
    totalBooks: 500000, officialVerification: true, fullStreamIntegrity: true, modes: ['base'],
    contractFingerprint: getMathSDKContractFingerprint(value),
  };
  recordPerformanceProfile(value, ['desktop', 'mobile', 'mini'].map(viewport => ({
    viewport, frames: 48, averageMs: 16.6, p95Ms: 18, maxMs: 22, longFrames: 0, fps: 60,
    textureMemoryBytes: 24 * 1024 * 1024, renderSurfaces: 60, domNodes: 200,
    viewportWidth: 1280, viewportHeight: 720,
  })), { embeddedAssetBytes: 2 * 1024 * 1024 });
  return value;
}
