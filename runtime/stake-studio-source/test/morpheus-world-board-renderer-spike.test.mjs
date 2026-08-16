import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPHEUS_WORLD_BOARD_CONTRACT,
  createWorldBoardGeometry,
  createWorldBoardTransition,
  runWorldBoardRendererSpike,
} from '../src/engines/factory/spikes/WorldBoardRendererSpike.js';

test('Morpheus world-board spike reserves an immutable 6x8 coordinate world', () => {
  const frame = createWorldBoardGeometry({ width: 600, height: 800, gap: 6 });
  assert.equal(frame.reels.length, 6);
  assert.equal(frame.cells.length, 48);
  assert.deepEqual(frame.reelHeights, [4, 4, 4, 4, 4, 4]);
  assert.equal(frame.cell.height, 100);
  assert.ok(frame.reels.every(reel => reel.shaft.height === 800));
  assert.ok(frame.reels.every(reel => reel.mask.axisAligned));
  assert.ok(frame.reels.every(reel => reel.mask.bottom === frame.world.bottom));
  assert.ok(frame.reels.every(reel => reel.cells.filter(cell => cell.active).length === 4));
  assert.equal(MORPHEUS_WORLD_BOARD_CONTRACT.cellResizeDuringGrowth, false);
});
test('Morpheus world-board spike proves independent bottom-aligned 4 to 5 to 8 growth', () => {
  const report = runWorldBoardRendererSpike({ growthReel: 3, width: 720, height: 640, gap: 4 });
  assert.equal(report.status, 'proven');
  assert.deepEqual(report.evidence.rowSequence, [4, 5, 8]);
  assert.equal(report.evidence.coordinateCells, 48);
  assert.equal(report.evidence.fixedWorld, true);
  assert.equal(report.evidence.constantCellSize, true);
  assert.equal(report.evidence.bottomAligned, true);
  assert.equal(report.evidence.independentMasks, true);
  assert.equal(report.evidence.shaftCapLifecycle, true);
  assert.ok(report.transitions.every(item => item.lifecycle.blocking));
  assert.ok(report.transitions.every(item => item.lifecycle.acknowledgement === 'mask-cap-animation-finished'));

  const [initial, five, eight] = report.frames.map(frame => frame.reels[3]);
  assert.equal(initial.mask.bottom, five.mask.bottom);
  assert.equal(five.mask.bottom, eight.mask.bottom);
  assert.ok(five.mask.y < initial.mask.y);
  assert.ok(eight.mask.y < five.mask.y);
  assert.equal(eight.exposedShaftRows, 0);
});

test('Morpheus world-board spike rejects global or invalid reel growth', () => {
  const frame = createWorldBoardGeometry();
  assert.throws(() => createWorldBoardTransition(frame, { reel: 2, rows: 4 }), /must grow/);
  assert.throws(() => createWorldBoardTransition(frame, { reel: 2, rows: 9 }), /may not exceed eight/);
  assert.throws(() => createWorldBoardTransition(frame, { reel: 6, rows: 5 }), /six reserved shafts/);
  assert.throws(() => createWorldBoardGeometry({ reelHeights: [4, 4, 4, 4, 4, 9] }), /4 through 8/);
});
