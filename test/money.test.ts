import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidRgsAmountError,
  RGS_UNITS_PER_WHOLE,
  isRgsAmount,
  rgsAmount,
  toDisplayUnits,
} from "../src/domain/money.js";

test("accepts non-negative safe integer RGS amounts", () => {
  assert.equal(rgsAmount(0), 0);
  assert.equal(rgsAmount(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.equal(isRgsAmount(1_000_000), true);
});

test("rejects negative, fractional, infinite, and unsafe amounts", () => {
  for (const invalid of [
    -1,
    0.5,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(() => rgsAmount(invalid), InvalidRgsAmountError);
    assert.equal(isRgsAmount(invalid), false);
  }
});

test("converts to display units without changing authoritative representation", () => {
  const authoritative = rgsAmount(1_250_000);
  assert.equal(toDisplayUnits(authoritative), 1.25);
  assert.equal(authoritative, 1_250_000);
  assert.equal(RGS_UNITS_PER_WHOLE, 1_000_000);
});
