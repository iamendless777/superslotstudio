import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PreviewPanel } from '../src/editor/preview/PreviewPanel.js';
import { createDreamfallSignatureTrace } from '../src/engines/morpheus/MorpheusEventProtocol.js';
import { MorpheusDreamfallPreviewDriver } from '../src/engines/presentation/morpheus/MorpheusDreamfallPreviewDriver.js';
import { runMorpheusDreamfallSignatureProjection } from '../src/engines/presentation/morpheus/MorpheusDreamfallRuntime.js';

const TILE_PHASES = ['interaction', 'reaction', 'propagation', 'resolution'];
const TUMBLE_PHASES = ['recognition', 'reaction', 'clear', 'space', 'enter', 'fall', 'settle', 'evaluate'];

function reducedPreviewHarness(trace) {
  const preview = Object.create(PreviewPanel.prototype);
  Object.assign(preview, {
    project: {
      math: { grid: { reels: 6, rows: [4, 4, 4, 4, 4, 4] } },
      production: { workflow: { visualExcellence: { briefs: [
        { type: 'tile-connections', status: 'approved', intensity: 'normal' },
        { type: 'tumble', status: 'approved', intensity: 'major' },
      ] } } },
    },
    reelGeometry: {
      x: 0, y: 0, w: 450, h: 600, cellW: 75, cellH: 75, gap: 0,
      maxRows: 8, reservedWorld: true, buffer: 1,
    },
    featureReelRows: new Map(),
    playbackTrace: [],
    playbackStartedAt: 1,
    activeVisualChoreography: new Map(),
    visualChoreographyRuns: [],
    baseBet: 1,
    lastWin: 0,
    board: null,
    morpheusDreamfallState: null,
  });
  preview.recordPlaybackEvent = (type, detail = {}) => {
    const entry = { type, ...detail };
    preview.playbackTrace.push(entry);
    trace.push(entry);
  };
  preview.paintBoard = board => {
    preview.board = structuredClone(board);
    trace.push({ type: 'boardPaint', rows: board.map(reel => reel.length) });
  };
  preview.animateBoardLanding = () => trace.push({ type: 'boardLandingRequest' });
  preview.setAnimationState = () => {};
  preview.updateHUD = () => {};
  preview.animateWinDisplay = () => { throw new Error('Reduced motion must not animate the win display.'); };
  preview.highlightWins = (_wins, options) => {
    assert.equal(options?.staticOnly, true);
    trace.push({ type: 'staticWinHighlight' });
    return null;
  };
  preview.dispatchPresentation = () => { throw new Error('Reduced tile semantics must not dispatch motion presentation.'); };
  preview.waitForPresentationMotion = () => Promise.resolve();
  preview.wait = () => Promise.resolve();
  preview.animateMorpheusDreamfallExpansion = async (_command, sourceEvent, immediate) => {
    assert.equal(immediate, true);
    preview.featureReelRows.set(Number(sourceEvent.payload.reel), Number(sourceEvent.payload.rows));
    preview.paintBoard(sourceEvent.payload.boardAfter.map(reel => reel.map(symbol => symbol.name || symbol)));
  };
  preview.updateFeatureMechanic = () => {};
  preview.pulseMechanicCells = () => {};
  preview.clearWinHighlights = () => {};
  preview.syncFeatureStateMarkers = () => {};
  preview.updateMorpheusDreamfallState = () => {};
  return preview;
}

test('reduced Dreamfall executes tile and tumble semantic phases and acknowledgements before slice completion', async () => {
  const events = createDreamfallSignatureTrace().events;
  const trace = [];
  const preview = reducedPreviewHarness(trace);
  const driver = new MorpheusDreamfallPreviewDriver({
    events,
    motion: 'reduced',
    renderCommand: context => PreviewPanel.prototype.renderMorpheusDreamfallCommand.call(preview, context),
  });
  const report = await driver.play();
  preview.recordPlaybackEvent('dreamfallSliceComplete', {
    sourceTraceHash: report.sourceTraceHash,
    semanticTraceHash: report.semanticTraceHash,
  });

  const tileRun = preview.visualChoreographyRuns.find(run => run.kind === 'tile-connection');
  const tumbleRun = preview.visualChoreographyRuns.find(run => run.kind === 'tumble');
  assert.equal(tileRun.motionPolicy, 'reduced');
  assert.equal(tumbleRun.motionPolicy, 'reduced');
  assert.deepEqual(tileRun.phaseHistory, TILE_PHASES);
  assert.deepEqual(tumbleRun.phaseHistory, TUMBLE_PHASES);
  assert.equal(tileRun.acknowledgement.status, 'completed');
  assert.equal(tileRun.acknowledgement.completedPhase, 'resolution');
  assert.equal(tumbleRun.acknowledgement.status, 'completed');
  assert.equal(tumbleRun.acknowledgement.completedPhase, 'evaluate');

  const sliceIndex = trace.findIndex(item => item.type === 'dreamfallSliceComplete');
  const tileAckIndex = trace.findIndex(item => item.type === 'visualChoreographyAcknowledged' && item.kind === 'tile-connection');
  const tumbleAckIndex = trace.findIndex(item => item.type === 'visualChoreographyAcknowledged' && item.kind === 'tumble');
  assert.ok(tileAckIndex >= 0 && tileAckIndex < sliceIndex);
  assert.ok(tumbleAckIndex >= 0 && tumbleAckIndex < sliceIndex);
  assert.deepEqual(preview.board, report.state.board);
  assert.equal(preview.activeVisualChoreography.size, 0);
});

test('reduced Preview canonical result matches normal and fast Dreamfall hashes', async () => {
  const events = createDreamfallSignatureTrace().events;
  const trace = [];
  const preview = reducedPreviewHarness(trace);
  const reducedDriver = new MorpheusDreamfallPreviewDriver({
    events,
    motion: 'reduced',
    renderCommand: context => PreviewPanel.prototype.renderMorpheusDreamfallCommand.call(preview, context),
  });
  const reduced = await reducedDriver.play();
  const reports = ['normal', 'fast'].map(motionMode => runMorpheusDreamfallSignatureProjection(events, { motionMode }));
  assert.equal(new Set([reduced.stateHash, ...reports.map(report => report.stateHash)]).size, 1);
  assert.equal(new Set([reduced.semanticTraceHash, ...reports.map(report => report.semanticTraceHash)]).size, 1);
  assert.deepEqual(preview.board, reports[0].state.board);
});

test('Dreamfall reduced runtime uses explicit semantic choreography rather than immediate board replacement', async () => {
  const source = await readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
  const start = source.indexOf('async renderMorpheusDreamfallCommand(');
  const render = source.slice(start, source.indexOf('\n  async animateMorpheusDreamfallExpansion(', start));
  assert.match(render, /const reducedMotion = command\.presentation\.motionMode === 'reduced'/);
  assert.match(render, /motionPolicy: 'reduced'/);
  assert.match(render, /executeReducedVisualChoreography\(plan/);
  assert.match(render, /phase\.id !== 'settle'/);
  assert.ok(render.indexOf("eventIdPrefix: `dreamfall:${sourceEvent.index}:winInfo`")
    < render.indexOf("eventId: `dreamfall:${sourceEvent.index}:tumbleBoard`"));
});
