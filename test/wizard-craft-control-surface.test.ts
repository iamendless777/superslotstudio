import assert from "node:assert/strict";
import test from "node:test";

import {
  formatWizardCraftAmount,
  rgsAmount,
} from "../src/index.js";

test("formats integer RGS amounts for presentation without wallet arithmetic", () => {
  assert.equal(formatWizardCraftAmount(rgsAmount(100_000)), "0.10");
  assert.equal(formatWizardCraftAmount(rgsAmount(1_000_000), "USD"), "1.00 USD");
  assert.equal(
    formatWizardCraftAmount(rgsAmount(25_000_001), "SC"),
    "25.000001 SC",
  );
});
