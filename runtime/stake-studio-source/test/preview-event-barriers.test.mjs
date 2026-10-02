import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewPanel } from '../src/editor/preview/PreviewPanel.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const preview = Object.create(PreviewPanel.prototype);
  Object.assign(preview, {
    selectedMode: 'base', board: [['A']], baseBet: 1,
    recordPlaybackEvent() {}, updateHUD() {}, animateWinDisplay() {},
    playDerivedWinMechanics: async () => {}, syncFeatureStateMarkers() {},
  });
  return preview;
}

test('ordered Preview book waits for both win channels and connection acknowledgement before tumble', async () => {
  const preview = harness();
  const director = deferred();
  const highlight = deferred();
  const connection = deferred();
  const calls = [];
  preview.highlightWins = () => ({ finished: highlight.promise });
  preview.dispatchPresentation = () => { calls.push('director'); return director.promise; };
  preview.waitForActiveVisualChoreography = kind => {
    assert.equal(kind, 'tile-connection');
    calls.push('connection');
    return connection.promise;
  };
  preview.playStakeTumble = async () => { calls.push('tumble'); return [['B']]; };
  const playback = preview.playSpinEventBook({ state: [
    { index: 0, type: 'winInfo', totalWin: 100, wins: [] },
    { index: 1, type: 'tumbleBoard', newSymbols: [['B']], explodingSymbols: [{ reel: 0, row: 0 }] },
  ] });
  await flush();
  assert.deepEqual(calls, ['director']);
  highlight.resolve();
  await flush();
  assert.deepEqual(calls, ['director'], 'highlight finishing cannot cancel the director');
  director.resolve();
  await flush();
  assert.deepEqual(calls, ['director', 'connection']);
  connection.resolve();
  const result = await playback;
  assert.deepEqual(calls, ['director', 'connection', 'tumble']);
  assert.deepEqual(result.currentBoard, [['B']]);
});

test('normal spin result waits for visible recovery before balance and control settle', async () => {
  const preview = harness();
  const recovery = deferred();
  const calls = [];
  preview.spinResult = { totalWin: 2 };
  preview.balance = 10;
  preview.playSpinEventBook = async () => ({ currentBoard: [['B']] });
  preview.recoverWinPresentation = options => {
    assert.equal(options, undefined, 'normal playback must not force immediate recovery');
    calls.push('recovery');
    return recovery.promise;
  };
  preview.paintBoard = () => calls.push('paint');
  preview.clearWinHighlights = () => {};
  preview.scheduleSymbolMotionSync = () => {};
  preview.setAnimationState = state => calls.push(state);
  const playback = preview.playSpinResult();
  await flush();
  assert.equal(preview.balance, 10);
  assert.deepEqual(calls, ['recovery']);
  recovery.resolve();
  await playback;
  assert.equal(preview.balance, 12);
  assert.deepEqual(calls, ['recovery', 'paint', 'idle']);
});
