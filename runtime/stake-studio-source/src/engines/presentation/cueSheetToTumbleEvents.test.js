import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyTumbleOccupancy,
  cueSheetHasReel,
  cueSheetHasTumble,
  cueSheetToTumbleEvents,
  largestEqualCluster,
  largestAdjacentWaysWin,
  seedAdjacentWaysWin,
  seedMatchingCluster,
  seedStickyWilds,
} from './cueSheetToTumbleEvents.js';
import { applyTumbleEvent } from '../math/StakeRoundBook.js';

const board6x4 = [
  ['A0', 'A1', 'A2', 'A3'],
  ['B0', 'B1', 'B2', 'B3'],
  ['C0', 'C1', 'C2', 'C3'],
  ['D0', 'D1', 'D2', 'D3'],
  ['E0', 'E1', 'E2', 'E3'],
  ['F0', 'F1', 'F2', 'F3'],
];

const oneDepthSheet = {
  styleId: 'cluster-snap',
  totalDurationMs: 1200,
  cues: [
    { cue: 'symbol.pop', startMs: 0, durationMs: 260, depth: 0, cells: ['1:2', '2:2', '3:2'] },
    { cue: 'cluster.remove', startMs: 260, durationMs: 220, depth: 0, cells: ['1:2', '2:2', '3:2'] },
    { cue: 'cluster.fall', startMs: 480, durationMs: 320, depth: 0, cells: ['1:1'] },
    { cue: 'cluster.refill', startMs: 800, durationMs: 360, depth: 0, cells: ['1:0'] },
    { cue: 'board.settle', startMs: 1160, durationMs: 140, depth: 0, cells: [] },
  ],
};

test('one depth emits a single tumbleBoard with gravity occupancy', () => {
  const events = cueSheetToTumbleEvents(oneDepthSheet, board6x4, { maxDepth: 0 });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'tumbleBoard');
  assert.deepEqual(
    events[0].explodingSymbols,
    [
      { reel: 1, row: 2 },
      { reel: 2, row: 2 },
      { reel: 3, row: 2 },
    ],
  );
  assert.equal(events[0].newSymbols[1].length, 1);
  assert.equal(events[0].newSymbols[0].length, 0);

  const next = applyTumbleOccupancy(board6x4, events[0].explodingSymbols, events[0].newSymbols);
  assert.equal(next[1].length, 4);
  assert.equal(next[1][1], 'B0');
  assert.equal(next[1][2], 'B1');
  assert.equal(next[1][3], 'B3');
  assert.notEqual(next[1][0], 'B2');
});

test('fall/refill/win cues never invent extra tumble events', () => {
  const sheet = {
    cues: [
      { cue: 'symbol.dropIn', depth: 0, cells: ['0:0'] },
      { cue: 'win.pulse', depth: 2, cells: ['1:2', '2:2'] },
      { cue: 'board.shake', depth: 2, cells: [] },
    ],
  };
  assert.equal(cueSheetToTumbleEvents(sheet, board6x4).length, 0);
  assert.equal(cueSheetHasTumble(sheet), false);
  assert.equal(cueSheetHasTumble(oneDepthSheet), true);
});

test('second depth uses post-tumble occupancy', () => {
  const sheet = {
    cues: [
      ...oneDepthSheet.cues,
      { cue: 'symbol.pop', depth: 1, cells: ['2:1', '2:2'] },
    ],
  };
  const events = cueSheetToTumbleEvents(sheet, board6x4);
  assert.equal(events.length, 2);
  const after0 = applyTumbleOccupancy(board6x4, events[0].explodingSymbols, events[0].newSymbols);
  const after1 = applyTumbleOccupancy(after0, events[1].explodingSymbols, events[1].newSymbols);
  assert.equal(after1[2].length, 4);
  assert.equal(events[1].newSymbols[2].length, 2);
});

test('adapter occupancy matches StakeRoundBook.applyTumbleEvent', () => {
  const events = cueSheetToTumbleEvents(oneDepthSheet, board6x4);
  const fromBook = applyTumbleEvent(board6x4, events[0]);
  const fromAdapter = applyTumbleOccupancy(
    board6x4,
    events[0].explodingSymbols,
    events[0].newSymbols,
  );
  assert.deepEqual(fromBook, fromAdapter);
});

test('classic-nine is a reel sheet, not a tumble sheet', () => {
  const sheet = {
    cues: [
      { cue: 'reel.blur', startMs: 0 },
      { cue: 'reel.stop', startMs: 400 },
      { cue: 'win.pulse', startMs: 800, cells: ['0:0', '1:0', '2:0'] },
    ],
  };
  assert.equal(cueSheetHasReel(sheet), true);
  assert.equal(cueSheetHasTumble(sheet), false);
  assert.equal(cueSheetToTumbleEvents(sheet, board6x4).length, 0);
});

test('checked-in cluster-hex fixture is a two-depth tumbleBoard sequence', () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), '../../../public/motion-fixtures/cluster-hex.json');
  const sheet = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(cueSheetHasTumble(sheet), true);
  const events = cueSheetToTumbleEvents(sheet, board6x4);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].explodingSymbols, [
    { reel: 1, row: 2 },
    { reel: 2, row: 2 },
    { reel: 3, row: 2 },
  ]);
  const after = applyTumbleEvent(board6x4, events[0]);
  assert.equal(after[1].length, 4);
});

test('retargetFromBoard pops the largest matching cluster', () => {
  const board = [
    ['A', 'B', 'C', 'D'],
    ['A', 'A', 'X', 'Y'],
    ['A', 'Z', 'Q', 'W'],
    ['M', 'N', 'O', 'P'],
    ['E', 'F', 'G', 'H'],
    ['I', 'J', 'K', 'L'],
  ];
  const cluster = largestEqualCluster(board, 2).map(([reel, row]) => `${reel}:${row}`).sort();
  assert.deepEqual(cluster, ['0:0', '1:0', '1:1', '2:0']);
  const events = cueSheetToTumbleEvents(oneDepthSheet, board, { retargetFromBoard: true });
  assert.deepEqual(
    events[0].explodingSymbols.map((cell) => `${cell.reel}:${cell.row}`).sort(),
    cluster,
  );
});

test('retargetFromBoard falls back to fixture cells when every symbol is unique', () => {
  const events = cueSheetToTumbleEvents(oneDepthSheet, board6x4, { retargetFromBoard: true });
  assert.deepEqual(events[0].explodingSymbols, [
    { reel: 1, row: 2 },
    { reel: 2, row: 2 },
    { reel: 3, row: 2 },
  ]);
});

test('seedMatchingCluster paints a 2x2 of the same symbol', () => {
  const seeded = seedMatchingCluster(board6x4);
  assert.equal(seeded.cells.length, 4);
  const names = new Set(seeded.cells.map(([reel, row]) => seeded.board[reel][row]));
  assert.equal(names.size, 1);
  assert.equal(largestEqualCluster(seeded.board, 3).length, 4);
});

test('seeded board retargets to the painted cluster, not fixture cells', () => {
  const seeded = seedMatchingCluster(board6x4);
  const events = cueSheetToTumbleEvents(oneDepthSheet, seeded.board, { retargetFromBoard: true });
  const popped = events[0].explodingSymbols.map((cell) => `${cell.reel}:${cell.row}`).sort();
  const cluster = seeded.cells.map(([reel, row]) => `${reel}:${row}`).sort();
  assert.deepEqual(popped, cluster);
});

test('seedStickyWilds writes a horizontal wild run', () => {
  const seeded = seedStickyWilds(board6x4, 'WILD', 3);
  assert.equal(seeded.cells.length, 3);
  for (const [reel, row] of seeded.cells) assert.equal(seeded.board[reel][row], 'WILD');
});

test('largestAdjacentWaysWin needs 3 consecutive reels from the left', () => {
  const miss = [
    ['A', 'X', 'Y', 'Z'],
    ['B', 'C', 'D', 'E'],
    ['A', 'F', 'G', 'H'],
    ['A', 'I', 'J', 'K'],
    ['L', 'M', 'N', 'O'],
    ['P', 'Q', 'R', 'S'],
  ];
  assert.deepEqual(largestAdjacentWaysWin(miss, 3), []);
  const hit = [
    ['A', 'X', 'Y', 'Z'],
    ['A', 'C', 'D', 'E'],
    ['A', 'F', 'G', 'H'],
    ['B', 'I', 'J', 'K'],
    ['L', 'M', 'N', 'O'],
    ['P', 'Q', 'R', 'S'],
  ];
  assert.deepEqual(
    largestAdjacentWaysWin(hit, 3).map(([reel, row]) => `${reel}:${row}`),
    ['0:0', '1:0', '2:0'],
  );
});

test('seedAdjacentWaysWin paints a left-to-right 3-kind and retargets', () => {
  const seeded = seedAdjacentWaysWin(board6x4, 3);
  assert.equal(seeded.cells.length, 3);
  assert.deepEqual(seeded.cells, [[0, 1], [1, 1], [2, 1]]);
  const names = new Set(seeded.cells.map(([reel, row]) => seeded.board[reel][row]));
  assert.equal(names.size, 1);
  const events = cueSheetToTumbleEvents(oneDepthSheet, seeded.board, {
    retargetFromBoard: true,
    retargetMode: 'ways',
  });
  const popped = events[0].explodingSymbols.map((cell) => `${cell.reel}:${cell.row}`).sort();
  const ways = largestAdjacentWaysWin(seeded.board, 3).map(([reel, row]) => `${reel}:${row}`).sort();
  assert.deepEqual(popped, ways);
});

test('seedAdjacentWaysWin isolates a 3-kind so later reels do not extend it', () => {
  const crowded = [
    ['A', 'X', 'Y', 'Z'],
    ['A', 'C', 'D', 'E'],
    ['A', 'F', 'G', 'H'],
    ['A', 'I', 'J', 'K'],
    ['A', 'M', 'N', 'O'],
    ['A', 'Q', 'R', 'S'],
  ];
  const seeded = seedAdjacentWaysWin(crowded, 3);
  const ways = largestAdjacentWaysWin(seeded.board, 3);
  assert.equal(ways.length, 3);
  assert.deepEqual(ways.map(([reel, row]) => `${reel}:${row}`).sort(), ['0:1', '1:1', '2:1']);
  const events = cueSheetToTumbleEvents(oneDepthSheet, seeded.board, {
    retargetFromBoard: true,
    retargetMode: 'ways',
  });
  assert.equal(events[0].explodingSymbols.length, 3);
});





