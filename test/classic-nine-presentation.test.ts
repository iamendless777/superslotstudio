import assert from "node:assert/strict";
import test from "node:test";

import { projectClassicNinePresentation } from "../src/games/classic-nine/presentation.js";

const events = [
  {
    schemaVersion: 1,
    index: 0,
    type: "reveal",
    payload: {
      board: [
        [{ name: "pulse" }, { name: "prism" }, { name: "orbit" }],
        [{ name: "pulse" }, { name: "core", wild: true }, { name: "nova" }],
        [{ name: "pulse" }, { name: "portal", scatter: true }, { name: "crown" }],
      ],
      gameType: "basegame",
      anticipation: [0, 0, 0],
    },
  },
  {
    schemaVersion: 1,
    index: 1,
    type: "winInfo",
    payload: {
      totalWin: 50,
      wins: [{
        symbol: "pulse",
        kind: 3,
        win: 50,
        positions: [
          { reel: 0, row: 0 },
          { reel: 1, row: 0 },
          { reel: 2, row: 0 },
        ],
        meta: {
          lineIndex: 0,
          multiplier: 1,
          winWithoutMult: 50,
          globalMult: 1,
        },
      }],
    },
  },
  {
    schemaVersion: 1,
    index: 2,
    type: "finalWin",
    payload: { amount: 50 },
  },
] as const;

test("projects deterministic Signal Nine state at each checkpoint", () => {
  const initial = projectClassicNinePresentation(events, "0");
  assert.equal(initial.board, null);
  assert.equal(initial.complete, false);

  const revealed = projectClassicNinePresentation(events, "1");
  assert.deepEqual(revealed.board, events[0].payload.board);
  assert.deepEqual([...revealed.highlightedCells], []);
  assert.equal(revealed.remaining[0]?.type, "winInfo");

  const won = projectClassicNinePresentation(events, "2");
  assert.deepEqual([...won.highlightedCells], ["0:0", "1:0", "2:0"]);

  const complete = projectClassicNinePresentation(events, "3");
  assert.equal(complete.finalWin, 50);
  assert.equal(complete.totalWin, 50);
  assert.equal(complete.complete, true);
});

test("projection remains non-authoritative and rejects malformed books", () => {
  assert.throws(() =>
    projectClassicNinePresentation(
      [{ ...events[0], payload: { ...events[0].payload, payout: 10 } }],
      "0",
    ),
  );
});
