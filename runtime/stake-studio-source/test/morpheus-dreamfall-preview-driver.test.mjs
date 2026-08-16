import test from 'node:test';
import assert from 'node:assert/strict';

import { createDreamfallSignatureTrace } from '../src/engines/morpheus/MorpheusEventProtocol.js';
import {
  MorpheusDreamfallPreviewDriver,
  createMorpheusReservedWorldLayout,
  createMorpheusPreviewObservationProof,
} from '../src/engines/presentation/morpheus/MorpheusDreamfallPreviewDriver.js';

test('Morpheus Preview reserved world keeps constant cells and independent bottom-aligned masks', () => {
  const four = createMorpheusReservedWorldLayout({ worldHeight: 496, reelRows: [4, 4, 4, 4, 4, 4] });
  const five = createMorpheusReservedWorldLayout({ worldHeight: 496, reelRows: [4, 4, 4, 5, 4, 4] });
  const eight = createMorpheusReservedWorldLayout({ worldHeight: 496, reelRows: [4, 4, 4, 8, 4, 4] });
  assert.equal(four.cellHeight, 62);
  assert.equal(five.cellHeight, four.cellHeight);
  assert.equal(eight.cellHeight, four.cellHeight);
  assert.ok([...four.reels, ...five.reels, ...eight.reels].every(reel => reel.mask.bottom === 496));
  assert.deepEqual(five.reels.filter((_, reel) => reel !== 3), four.reels.filter((_, reel) => reel !== 3));
  assert.equal(four.reels[3].mask.top, 248);
  assert.equal(five.reels[3].mask.top, 186);
  assert.equal(eight.reels[3].mask.top, 0);
});

test('Morpheus Preview driver renders and acknowledges the unchanged authoritative envelope trace', async () => {
  const events = createDreamfallSignatureTrace().events;
  const original = structuredClone(events);
  const rendered = [];
  const checkpoints = [];
  const driver = new MorpheusDreamfallPreviewDriver({
    events,
    motion: 'fast',
    renderCommand: async ({ command, sourceEvent }) => rendered.push([sourceEvent.index, command.semantic.eventType]),
    onCheckpoint: async value => checkpoints.push(value),
  });
  const report = await driver.play();
  assert.deepEqual(events, original);
  assert.deepEqual(rendered, events.map(event => [event.index, event.type]));
  assert.equal(report.sliceComplete, true);
  assert.equal(report.fullRoundFinalized, false);
  assert.equal(checkpoints.length, 6);
  assert.equal(checkpoints.at(-1).nextEventBlockedBeforeAck, true);
  assert.deepEqual(checkpoints.at(-1).blockingProof, {
    attempted: true,
    rejected: true,
    error: 'Event 5 is blocked until ack:morpheus:signature:dreamfall:tumble-5 is acknowledged.',
  });
  assert.equal(checkpoints.at(-1).acknowledgement.acknowledgementId,
    events.at(-1).blocking.acknowledgement.id);
  assert.equal(driver.snapshot().status, 'completed');
  assert.equal(driver.snapshot().sourceEventHash, '3e4a75c2');
});

test('Morpheus Preview observation proof rejects DOM board, mask, or HUD drift', () => {
  const runtimeState = {
    board: Array.from({ length: 6 }, () => ['POPPY', 'OWL', 'LAUREL', 'MORPHEUS']),
    reelRows: [4, 4, 4, 4, 4, 4],
    hud: {
      chainHit: 4,
      freeSpinsRemaining: 6,
      awardedFreeSpins: 0,
      runningWin: 250,
      reelRows: [4, 4, 4, 4, 4, 4],
    },
  };
  assert.equal(createMorpheusPreviewObservationProof(runtimeState, structuredClone(runtimeState)).passed, true);

  const drifted = structuredClone(runtimeState);
  drifted.board[3][0] = 'NYX';
  drifted.reelRows[3] = 5;
  drifted.hud.chainHit = 5;
  drifted.hud.reelRows[3] = 5;
  const proof = createMorpheusPreviewObservationProof(runtimeState, drifted);
  assert.equal(proof.passed, false);
  assert.notEqual(proof.expected.boardHash, proof.observed.boardHash);
  assert.notEqual(proof.expected.stateHash, proof.observed.stateHash);
  assert.notDeepEqual(proof.expected.reelRows, proof.observed.reelRows);
  assert.notDeepEqual(proof.expected.hud, proof.observed.hud);
});

test('Morpheus Preview cancellation and immediate finish leave one explicit settled state', async () => {
  let release;
  let committed = null;
  const driver = new MorpheusDreamfallPreviewDriver({
    renderCommand: () => new Promise(resolve => { release = resolve; }),
    commitFinal: async value => { committed = value; },
  });
  const playing = driver.play().catch(error => error);
  await new Promise(resolve => setTimeout(resolve, 0));
  const report = await driver.finishImmediately('test-fast-forward');
  release?.();
  const cancelledPlayback = await playing;
  assert.equal(cancelledPlayback.name, 'MorpheusDreamfallPreviewCancellation');
  assert.equal(report.sliceComplete, true);
  assert.equal(committed.report.stateHash, report.stateHash);
  assert.equal(driver.runtime, null);
  assert.equal(driver.snapshot().status, 'completed');
  assert.equal(driver.snapshot().pendingAcknowledgement, null);

  const cancelledDriver = new MorpheusDreamfallPreviewDriver({ renderCommand: () => new Promise(() => {}) });
  const cancelled = cancelledDriver.play().catch(error => error);
  await new Promise(resolve => setTimeout(resolve, 0));
  cancelledDriver.cancel('preview-render');
  assert.equal((await cancelled).name, 'MorpheusDreamfallPreviewCancellation');
  assert.equal(cancelledDriver.snapshot().status, 'cancelled');
  assert.equal(cancelledDriver.snapshot().pendingAcknowledgement, null);
});
