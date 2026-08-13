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
    board: [
      [{ name: "pulse" }, { name: "prism" }, { name: "orbit" }],
      [{ name: "beacon" }, { name: "core", wild: true }, { name: "nova" }],
      [{ name: "crown" }, { name: "portal", scatter: true }, { name: "pulse" }],
    ],
    gameType: "basegame",
    anticipation: [0, 0, 1],
  },
};

const winInfo = {
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
};

const finalWin = {
  schemaVersion: 1,
  index: 2,
  type: "finalWin",
  payload: { amount: 50 },
};

test("validates a normalized Signal Nine production book", () => {
  const events = parseClassicNineBook([reveal, winInfo, finalWin]);
  assert.deepEqual(events.map((event) => event.type), [
    "reveal",
    "winInfo",
    "finalWin",
  ]);
});

test("validates feature, multiplier, total, and win-cap events", () => {
  const feature = [
    reveal,
    {
      schemaVersion: 1,
      index: 1,
      type: "freeSpinTrigger",
      payload: {
        totalFs: 9,
        positions: [
          { reel: 0, row: 0 },
          { reel: 1, row: 1 },
          { reel: 2, row: 2 },
        ],
      },
    },
    {
      schemaVersion: 1,
      index: 2,
      type: "enterBonus",
      payload: { reason: "natural" },
    },
    {
      schemaVersion: 1,
      index: 3,
      type: "updateFreeSpin",
      payload: { amount: 1, total: 9 },
    },
    {
      ...reveal,
      index: 4,
      payload: { ...reveal.payload, gameType: "freegame" },
    },
    {
      schemaVersion: 1,
      index: 5,
      type: "updateGlobalMult",
      payload: { globalMult: 2 },
    },
    {
      schemaVersion: 1,
      index: 6,
      type: "setTotalWin",
      payload: { amount: 500 },
    },
    {
      schemaVersion: 1,
      index: 7,
      type: "wincap",
      payload: { amount: 1_000_000 },
    },
    {
      schemaVersion: 1,
      index: 8,
      type: "finalWin",
      payload: { amount: 1_000_000 },
    },
  ];
  const parsed = parseClassicNineBook(feature);
  assert.equal(parsed.at(-1)?.type, "finalWin");
  assert.equal(parsed.at(-2)?.type, "wincap");
});

test("plans deterministic presentation resume from the next event", () => {
  const plan = planClassicNineResume([reveal, winInfo, finalWin], "1");
  assert.deepEqual(plan.completed.map((event) => event.type), ["reveal"]);
  assert.deepEqual(plan.remaining.map((event) => event.type), [
    "winInfo",
    "finalWin",
  ]);
  assert.equal(plan.nextIndex, 1);
});

test("rejects malformed boards, symbols, wins, cells, and amounts", () => {
  const invalidBooks = [
    [{ ...reveal, payload: { ...reveal.payload, board: [[{ name: "pulse" }]] } }, finalWin],
    [
      {
        ...reveal,
        payload: {
          ...reveal.payload,
          board: [[{ name: "unknown" }, ...reveal.payload.board[0]!.slice(1)], ...reveal.payload.board.slice(1)],
        },
      },
      finalWin,
    ],
    [
      reveal,
      {
        ...winInfo,
        payload: { ...winInfo.payload, totalWin: 51 },
      },
      finalWin,
    ],
    [
      reveal,
      {
        ...winInfo,
        payload: {
          ...winInfo.payload,
          wins: [{
            ...winInfo.payload.wins[0],
            positions: [{ reel: 3, row: 0 }],
          }],
        },
      },
      finalWin,
    ],
    [reveal, { ...finalWin, payload: { amount: -1 } }],
    [
      reveal,
      { ...finalWin, index: 1, type: "wincap", payload: { amount: 100 } },
      finalWin,
    ],
    [{ ...reveal, payload: { ...reveal.payload, payout: 100 } }, finalWin],
  ];
  for (const book of invalidBooks) {
    assert.throws(() => parseClassicNineBook(book), InvalidGameEventError);
  }
});

test("rejects missing reveal, non-terminal endings, index gaps, and bad checkpoints", () => {
  assert.throws(() => parseClassicNineBook([]), InvalidGameEventError);
  assert.throws(
    () => parseClassicNineBook([{ ...finalWin, index: 0 }, finalWin]),
    InvalidGameEventError,
  );
  assert.throws(() => parseClassicNineBook([reveal, winInfo]), InvalidGameEventError);
  assert.throws(
    () => parseClassicNineBook([reveal, { ...finalWin, index: 2 }]),
    InvalidGameEventError,
  );
  assert.throws(
    () => parseClassicNineBook([reveal, { ...finalWin, index: 1 }, finalWin]),
    InvalidGameEventError,
  );
  assert.throws(
    () => planClassicNineResume([reveal, { ...finalWin, index: 1 }], "3"),
    InvalidGameEventError,
  );
});
