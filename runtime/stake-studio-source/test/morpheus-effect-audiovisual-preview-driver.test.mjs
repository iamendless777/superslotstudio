import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createExactMaxTerminationProofTrace,
} from '../src/engines/morpheus/MorpheusEffectProofTraces.js';
import {
  createMorpheusEffectPresentationPlan,
} from '../src/engines/presentation/morpheus/MorpheusEffectPresentation.js';
import {
  MorpheusEffectOrchestrationPreviewDriver,
} from '../src/engines/presentation/morpheus/MorpheusEffectOrchestrationPreviewDriver.js';
import {
  MorpheusEffectOrchestrationRuntime,
} from '../src/engines/presentation/morpheus/MorpheusEffectOrchestrationRuntime.js';

const catalog = () => ({
  motionAssetIds: [
    'dreamfall.motion.mystery-veil-seam',
    'dreamfall.motion.oneiric-star-prism',
    'dreamfall.motion.oneiric-impact',
    'dreamfall.motion.max-morpheus-ascension',
  ],
  presentationAssetKeys: ['modePortal', 'verdictPlate'],
  characterStates: ['idle', 'bonusEntry', 'winBig', 'wincap'],
  audioCueIds: ['cascadeDrop', 'wincap'],
});

test('mixed route binds its real authored motion plates and reports bespoke audio gaps honestly', async () => {
  const rendered = [];
  const driver = new MorpheusEffectOrchestrationPreviewDriver({
    routeId: 'mysteryStarDreamfallTumble',
    motionMode: 'normal',
    catalog: catalog(),
    renderCommand: async ({ plan, sourceEvent }) => {
      rendered.push({ type: sourceEvent.type, plan });
      return `captured:${sourceEvent.index}:${sourceEvent.type}`;
    },
  });
  const report = await driver.play();
  assert.equal(report.passed, true);
  assert.equal(report.productionReady, false);
  assert.deepEqual(rendered.map(item => item.type), [
    'reveal', 'winInfo', 'mysteryTransform', 'specialTargetSelected', 'specialPositionsResolved',
    'expandReelHeight', 'tumbleChainProgress', 'awardTumbleFreeSpins', 'tumbleBoard',
  ]);
  assert.deepEqual(rendered[2].plan.semantic.visual.assetIds, ['dreamfall.motion.mystery-veil-seam']);
  assert.deepEqual(rendered[3].plan.semantic.visual.assetIds, ['dreamfall.motion.oneiric-star-prism']);
  assert.ok(rendered[4].plan.semantic.supplementalMotionAssetIds.includes('dreamfall.motion.oneiric-impact'));
  assert.ok(report.coverage.missing.audio.includes('morpheus.audio.mystery-synchronized-reveal'));
  assert.ok(report.coverage.missing.audio.includes('morpheus.audio.star-chain-convert'));
  assert.ok(report.coverage.missing.audio.includes('morpheus.audio.dreamfall-reel-growth'));
  assert.equal(report.coverage.missing.motion.length, 0);
});

test('driver never dispatches the next source event while visible work is unresolved', async () => {
  let release;
  const firstRender = new Promise(resolve => { release = resolve; });
  const seen = [];
  const driver = new MorpheusEffectOrchestrationPreviewDriver({
    routeId: 'exactMaxTermination',
    catalog: catalog(),
    renderCommand: async ({ sourceEvent }) => {
      seen.push(sourceEvent.type);
      if (sourceEvent.index === 0) await firstRender;
      return `visible:${sourceEvent.type}`;
    },
  });
  const playing = driver.play();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(seen, ['reveal']);
  assert.equal(driver.snapshot().pendingAcknowledgement.eventType, 'reveal');
  release();
  const report = await playing;
  assert.deepEqual(seen, ['reveal', 'winInfo', 'maxWinReached', 'roundTerminated']);
  assert.equal(report.runtime.acknowledgements.length, 4);
});

test('exact MAX presentation shows contributing MAX symbols and owns terminal visual assets', async () => {
  const trace = createExactMaxTerminationProofTrace();
  assert.deepEqual(trace.events[0].payload.contributingPositions, undefined);
  for (const position of trace.events[1].payload.contributingPositions) {
    assert.equal(trace.events[0].payload.board[position.reel][position.row].name, 'MAX_MORPHEUS');
  }

  const plans = [];
  const driver = new MorpheusEffectOrchestrationPreviewDriver({
    routeId: trace.routeId,
    motionMode: 'reduced',
    catalog: catalog(),
    renderCommand: async ({ plan }) => { plans.push(plan); },
  });
  const report = await driver.play();
  const max = plans.find(plan => plan.semantic.eventType === 'maxWinReached');
  assert.deepEqual(max.semantic.visual.assetIds, ['dreamfall.motion.max-morpheus-ascension']);
  assert.deepEqual(max.semantic.presentationAssetKeys, ['verdictPlate']);
  assert.deepEqual(max.semantic.characterStates, ['wincap']);
  assert.ok(report.coverage.missing.audio.includes('morpheus.audio.max-morpheus'));
  assert.equal(report.runtime.state.terminated, true);
});

test('missing authored visual media fails closed before acknowledgement', async () => {
  const driver = new MorpheusEffectOrchestrationPreviewDriver({
    routeId: 'mysteryStarDreamfallTumble',
    catalog: { ...catalog(), motionAssetIds: [] },
  });
  await assert.rejects(driver.play(), /missing visual assets for mysteryTransform/);
  const state = driver.snapshot();
  assert.equal(state.status, 'failed');
  assert.equal(state.pendingAcknowledgement.eventType, 'mysteryTransform');
});

test('presentation semantic and coverage fingerprints are normal/fast/reduced/no-motion invariant', async () => {
  const reports = {};
  for (const motionMode of ['normal', 'fast', 'reduced', 'none']) {
    const driver = new MorpheusEffectOrchestrationPreviewDriver({
      routeId: 'mysteryStarDreamfallTumble',
      motionMode,
      catalog: catalog(),
    });
    reports[motionMode] = await driver.play();
  }
  assert.equal(new Set(Object.values(reports).map(report => report.runtime.stateHash)).size, 1);
  assert.equal(new Set(Object.values(reports).map(report => report.runtime.semanticTraceHash)).size, 1);
  assert.equal(new Set(Object.values(reports).map(report => report.coverage.fingerprint)).size, 1);
  assert.equal(new Set(Object.values(reports).map(report => report.presentationPlans.map(plan => plan.semanticHash).join(':'))).size, 1);
  assert.equal(reports.none.runtime.commands.every(command => command.motionSuppressed), true);
  assert.equal(reports.none.runtime.commands.every(command => command.durationMs === 0), true);
});

test('presentation plan rejects contract drift before any renderer sees it', () => {
  const trace = createExactMaxTerminationProofTrace();
  const runtime = new MorpheusEffectOrchestrationRuntime({ routeId: trace.routeId });
  const command = runtime.dispatch(trace.events[0]);
  command.contractFingerprint = 'morpheus-game-info-v1';
  assert.throws(() => createMorpheusEffectPresentationPlan({
    command,
    event: trace.events[0],
    catalog: catalog(),
  }), /fingerprint drifted/);
});
