import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_EXPLORATORY_ASSUMPTIONS,
  exploreWizardCraft,
} from "../tools/math/wizard-craft-exploratory.js";

test("WIZARD CRAFT mechanic exploration is seeded and labels its limits", () => {
  const first = exploreWizardCraft(10_000, 12345);
  const second = exploreWizardCraft(10_000, 12345);
  assert.deepEqual(first, second);
  assert.equal(first.approvalClaim, false);
  assert.equal(first.payoutMathIncluded, false);
});

test("extra-chance assumptions form an increasing trigger ladder", () => {
  const assumptions = WIZARD_CRAFT_EXPLORATORY_ASSUMPTIONS;
  assert.ok(assumptions.baseBattle.bonusProbability < assumptions.runeSpark.bonusProbability);
  assert.ok(assumptions.runeSpark.bonusProbability < assumptions.siegeSigns.bonusProbability);
  assert.equal(assumptions.openGrimoire.bonusProbability, 1);
});

test("Tier III guarantee never fails in the mechanic explorer", () => {
  const report = exploreWizardCraft(100_000, 77);
  for (const mode of Object.values(report.modes)) {
    assert.equal(mode.tierThreeGuaranteeFailures, 0);
  }
});

test("Tier I/II behavior permits zero final stickies while Tier III contributes stickies", () => {
  const report = exploreWizardCraft(100_000, 2026);
  const tiers = report.modes.openGrimoire.finalStickyCountByTier;
  assert.equal(tiers[1]?.[0], report.modes.openGrimoire.tierCounts[1]);
  assert.ok((tiers[2]?.[0] ?? 0) > 0);
  assert.equal(tiers[3]?.[0] ?? 0, 0);
  assert.ok((tiers[3]?.[1] ?? 0) > 0);
  assert.equal(report.modes.openGrimoire.bonusRounds, 100_000);
});
