import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidGameEventError,
  parseClassicNineBook,
  planClassicNineResume,
} from "../src/index.js";

const reveal = {
  schemaVersion: 1,
  index: 0,
  type: "reveal",
  payload: {
    grid: [
      ["cherry", "lemon", "orange"],
      ["plum", "bell", "seven"],
      ["wild", "cherry", "lemon"],
    ],
  },
};
const highlight = {
  schemaVersion: 1,
  index: 1,
  type: "highlight",
  payload: {
    cells: [
      { column: 0, row: 0 },
      { column: 1, row: 1 },
    ],
  },
};

test("validates an authoritative Classic Nine presentation book", () => {
  const events = parseClassicNineBook([reveal, highlight]);
  assert.equal(events[0]?.type, "reveal");
  assert.equal(events[1]?.type, "highlight");
});

test("plans deterministic presentation resume from the next event", () => {
  const plan = planClassicNineResume([reveal, highlight], "1");
  assert.deepEqual(
    plan.completed.map((event) => event.type),
    ["reveal"],
  );
  assert.deepEqual(
    plan.remaining.map((event) => event.type),
    ["highlight"],
  );
  assert.equal(plan.nextIndex, 1);
});

test("rejects invalid symbols, grids, cells, and extra payload fields", () => {
  const invalidBooks = [
    [{ ...reveal, payload: { grid: [["wild"]] } }],
    [
      {
        ...reveal,
        payload: {
          grid: [
            ["unknown", "lemon", "orange"],
            ...reveal.payload.grid.slice(1),
          ],
        },
      },
    ],
    [reveal, { ...highlight, payload: { cells: [{ column: 3, row: 0 }] } }],
    [
      reveal,
      {
        ...highlight,
        payload: {
          cells: [
            { column: 0, row: 0 },
            { column: 0, row: 0 },
          ],
        },
      },
    ],
    [{ ...reveal, payload: { ...reveal.payload, payout: 100 } }],
  ];
  for (const book of invalidBooks) {
    assert.throws(() => parseClassicNineBook(book), InvalidGameEventError);
  }
});

test("rejects missing reveal, repeated reveal, index gaps, and bad checkpoints", () => {
  assert.throws(() => parseClassicNineBook([]), InvalidGameEventError);
  assert.throws(
    () => parseClassicNineBook([{ ...highlight, index: 0 }]),
    InvalidGameEventError,
  );
  assert.throws(
    () => parseClassicNineBook([reveal, { ...reveal, index: 1 }]),
    InvalidGameEventError,
  );
  assert.throws(
    () => parseClassicNineBook([reveal, { ...highlight, index: 2 }]),
    InvalidGameEventError,
  );
  assert.throws(
    () =>
      parseClassicNineBook([
        { ...highlight, index: 1 },
        { ...reveal, index: 0 },
      ]),
    InvalidGameEventError,
  );
  assert.throws(
    () => planClassicNineResume([reveal], "2"),
    InvalidGameEventError,
  );
});
