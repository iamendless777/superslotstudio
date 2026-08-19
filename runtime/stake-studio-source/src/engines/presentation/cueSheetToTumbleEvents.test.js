import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTumbleOccupancy,
  cueSheetHasReel,
  cueSheetHasTumble,
  cueSheetToTumbleEvents,
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
