import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeClassicNineBooks,
  buildClassicNinePresentationBook,
  CLASSIC_NINE_DRAFT_MATH,
  createClassicNineMathReport,
  evaluateClassicNineGrid,
  formatRatioDecimal,
  multiplierMicros,
  reduceRatio,
  type ClassicNineGrid,
} from "../tools/math/classic-nine.js";

const losingGrid: ClassicNineGrid = [
  ["cherry", "lemon", "orange"],
  ["plum", "bell", "seven"],
  ["wild", "cherry", "lemon"],
];

const winningGrid: ClassicNineGrid = [
  ["cherry", "cherry", "cherry"],
  ["plum", "bell", "seven"],
  ["wild", "lemon", "orange"],
];

test("evaluates configured paylines with exact integer multipliers", () => {
  assert.deepEqual(
    evaluateClassicNineGrid(CLASSIC_NINE_DRAFT_MATH, losingGrid),
    {
      wins: [],
      totalMultiplier: multiplierMicros(0),
    },
  );
  const result = evaluateClassicNineGrid(CLASSIC_NINE_DRAFT_MATH, winningGrid);
  assert.equal(result.totalMultiplier, multiplierMicros(2_000_000));
  assert.deepEqual(
    result.wins.map((win) => [win.lineIndex, win.symbol]),
    [[0, "cherry"]],
  );
});

test("builds presentation-only books from evaluated candidate grids", () => {
  const events = buildClassicNinePresentationBook(
    CLASSIC_NINE_DRAFT_MATH,
    winningGrid,
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["reveal", "highlight"],
  );
  assert.equal("payout" in events[0]!.payload, false);
});

test("analyzes weighted candidate books using exact bigint ratios", () => {
  const analysis = analyzeClassicNineBooks(CLASSIC_NINE_DRAFT_MATH, [
    { grid: losingGrid, weight: 3 },
    { grid: winningGrid, weight: 1 },
  ]);
  assert.equal(analysis.totalWeight, 4n);
  assert.equal(analysis.hitWeight, 1n);
  assert.deepEqual(analysis.hitRatio, { numerator: 1n, denominator: 4n });
  assert.deepEqual(analysis.returnRatio, {
    numerator: 2_000_000n,
    denominator: 4_000_000n,
  });
  assert.equal(analysis.maximumMultiplier, multiplierMicros(2_000_000));
});

test("creates a JSON-safe, reproducible review report", () => {
  const report = createClassicNineMathReport(CLASSIC_NINE_DRAFT_MATH, [
    { grid: losingGrid, weight: 3 },
    { grid: winningGrid, weight: 1 },
  ]);
  assert.deepEqual(report, {
    schemaVersion: 1,
    definitionId: "classic-nine-draft-v1",
    outcomeCount: 2,
    totalWeight: "4",
    hitWeight: "1",
    weightedMultiplierMicros: "2000000",
    returnRatio: ["1", "2"],
    hitRatio: ["1", "4"],
    returnDecimal: "0.500000",
    hitDecimal: "0.250000",
    maximumMultiplierMicros: 2_000_000,
  });
  assert.doesNotThrow(() => JSON.stringify(report));
});

test("reduces and formats exact ratios without floating-point arithmetic", () => {
  assert.deepEqual(reduceRatio(2_000_000n, 4_000_000n), [1n, 2n]);
  assert.deepEqual(reduceRatio(0n, 100n), [0n, 1n]);
  assert.equal(formatRatioDecimal(1n, 3n, 4), "0.3333");
  assert.equal(formatRatioDecimal(3n, 2n, 3), "1.500");
  assert.throws(() => reduceRatio(1n, 0n), RangeError);
  assert.throws(() => formatRatioDecimal(-1n, 2n), RangeError);
  assert.throws(() => formatRatioDecimal(1n, 2n, -1), RangeError);
});

test("rejects invalid multipliers, definitions, weights, and empty analysis", () => {
  assert.throws(() => multiplierMicros(-1), RangeError);
  assert.throws(
    () => analyzeClassicNineBooks(CLASSIC_NINE_DRAFT_MATH, []),
    RangeError,
  );
  assert.throws(
    () =>
      analyzeClassicNineBooks(CLASSIC_NINE_DRAFT_MATH, [
        { grid: losingGrid, weight: 0 },
      ]),
    RangeError,
  );
  assert.throws(
    () =>
      evaluateClassicNineGrid(
        {
          ...CLASSIC_NINE_DRAFT_MATH,
          paylines: [
            [
              { column: 0, row: 0 },
              { column: 0, row: 0 },
              { column: 2, row: 0 },
            ],
          ],
        },
        losingGrid,
      ),
    RangeError,
  );
  assert.throws(
    () =>
      evaluateClassicNineGrid(CLASSIC_NINE_DRAFT_MATH, [
        ["unknown", "lemon", "orange"],
        ...losingGrid.slice(1),
      ] as unknown as ClassicNineGrid),
    RangeError,
  );
});
