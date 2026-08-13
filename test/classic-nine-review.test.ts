import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASSIC_NINE_DRAFT_MATH,
  multiplierMicros,
  type ClassicNineGrid,
} from "../tools/math/classic-nine.js";
import {
  rateMicros,
  reviewClassicNineMath,
  type ClassicNineReviewCriteria,
} from "../tools/math/review.js";

const losingGrid: ClassicNineGrid = [
  ["pulse", "prism", "orbit"],
  ["beacon", "nova", "crown"],
  ["core", "pulse", "prism"],
];
const winningGrid: ClassicNineGrid = [
  ["pulse", "pulse", "pulse"],
  ["beacon", "nova", "crown"],
  ["core", "prism", "orbit"],
];

const criteria: ClassicNineReviewCriteria = {
  definitionId: CLASSIC_NINE_DRAFT_MATH.id,
  returnRate: { minimum: rateMicros(120_000), maximum: rateMicros(130_000) },
  hitRate: { minimum: rateMicros(240_000), maximum: rateMicros(260_000) },
  maximumMultiplier: multiplierMicros(500_000),
};

test("checks an exact analysis against explicit product criteria", () => {
  const result = reviewClassicNineMath(
    CLASSIC_NINE_DRAFT_MATH,
    [
      { grid: losingGrid, weight: 3 },
      { grid: winningGrid, weight: 1 },
    ],
    criteria,
  );
  assert.equal(result.passed, true);
  assert.deepEqual(
    result.checks.map((check) => [check.id, check.passed]),
    [
      ["definition", true],
      ["return-rate", true],
      ["hit-rate", true],
      ["maximum-win", true],
    ],
  );
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("reports every failed criterion instead of approving partial matches", () => {
  const result = reviewClassicNineMath(
    CLASSIC_NINE_DRAFT_MATH,
    [{ grid: winningGrid, weight: 1 }],
    {
      ...criteria,
      definitionId: "another-definition",
      returnRate: { minimum: rateMicros(0), maximum: rateMicros(400_000) },
      hitRate: { minimum: rateMicros(0), maximum: rateMicros(500_000) },
      maximumMultiplier: multiplierMicros(400_000),
    },
  );
  assert.equal(result.passed, false);
  assert.equal(
    result.checks.every((check) => !check.passed),
    true,
  );
});

test("rejects malformed review criteria", () => {
  assert.throws(() => rateMicros(-1), RangeError);
  assert.throws(() => rateMicros(1_000_001), RangeError);
  assert.throws(
    () =>
      reviewClassicNineMath(
        CLASSIC_NINE_DRAFT_MATH,
        [{ grid: losingGrid, weight: 1 }],
        {
          ...criteria,
          returnRate: {
            minimum: rateMicros(600_000),
            maximum: rateMicros(500_000),
          },
        },
      ),
    RangeError,
  );
});
