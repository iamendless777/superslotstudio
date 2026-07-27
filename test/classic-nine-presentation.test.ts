import assert from "node:assert/strict";
import test from "node:test";

import { projectClassicNinePresentation } from "../src/games/classic-nine/presentation.js";

const events = [
  {
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
  },
  {
    schemaVersion: 1,
    index: 1,
    type: "highlight",
    payload: {
      cells: [
        { column: 0, row: 0 },
        { column: 1, row: 1 },
      ],
    },
  },
] as const;

test("projects deterministic states at each presentation checkpoint", () => {
  const initial = projectClassicNinePresentation(events, "0");
  assert.equal(initial.grid, null);
  assert.equal(initial.complete, false);

  const revealed = projectClassicNinePresentation(events, "1");
  assert.deepEqual(revealed.grid, events[0].payload.grid);
  assert.deepEqual([...revealed.highlightedCells], []);
  assert.equal(revealed.remaining[0]?.type, "highlight");

  const complete = projectClassicNinePresentation(events, "2");
  assert.deepEqual([...complete.highlightedCells], ["0:0", "1:1"]);
  assert.equal(complete.complete, true);
});

test("projection remains presentation-only and rejects malformed books", () => {
  assert.throws(() =>
    projectClassicNinePresentation(
      [{ ...events[0], payload: { ...events[0].payload, payout: 10 } }],
      "0",
    ),
  );
});
