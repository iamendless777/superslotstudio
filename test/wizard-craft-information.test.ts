import assert from "node:assert/strict";
import test from "node:test";

import { getWizardCraftInformation } from "../src/index.js";

const prohibitedSweepsTerms =
  /\b(?:bet|bets|wager|buy|bought|gamble|deposit|withdraw|cash|money|currency|fund|payer|rebet)\b|cost of/i;

test("publishes the approved WIZARD CRAFT math and mode information", () => {
  const information = getWizardCraftInformation({
    social: false,
    displayRtp: true,
  });
  assert.equal(information.title, "WIZARD CRAFT");
  assert.equal(information.paytable.length, 7);
  assert.deepEqual(
    information.modes.map((mode) => [mode.id, mode.amount, mode.rtp]),
    [
      ["baseBattle", "1× base bet", "96.50%"],
      ["runeSpark", "3× base bet", "96.50%"],
      ["siegeSigns", "10× base bet", "96.50%"],
      ["openGrimoire", "100× base bet", "96.50%"],
    ],
  );
  assert.ok(information.modes.every(
    (mode) => mode.maximumWin === "25,000× base bet",
  ));
  assert.deepEqual(information.tiers.map((tier) => tier.spins), [8, 10, 12]);
  assert.match(information.tiers[0]!.rule, /Sticky reels cannot appear/);
  assert.match(information.tiers[1]!.rule, /none is guaranteed/);
  assert.match(information.tiers[2]!.rule, /spin three/);
  assert.match(information.disclaimer, /Malfunction voids all wins and plays/);
});

test("publishes sweeps-safe WIZARD CRAFT information", () => {
  const information = getWizardCraftInformation({
    social: true,
    displayRtp: true,
  });
  assert.equal(information.locale, "sweeps_en");
  assert.doesNotMatch(JSON.stringify(information), prohibitedSweepsTerms);
  assert.equal(information.modes[3]!.amount, "100× base play amount");
  assert.doesNotMatch(information.modes[3]!.access, /purchase/i);
});

test("honors WIZARD CRAFT jurisdiction-controlled RTP visibility", () => {
  const information = getWizardCraftInformation({
    social: false,
    displayRtp: false,
  });
  assert.ok(information.modes.every((mode) => mode.rtp === null));
});

test("lists every obtainable VS value and exact ways awards", () => {
  const information = getWizardCraftInformation({
    social: false,
    displayRtp: true,
  });
  const rules = information.vsRules.join(" ");
  for (const value of [2, 3, 4, 5, 10, 15, 25, 50]) {
    assert.match(rules, new RegExp(`${value}×`));
  }
  assert.deepEqual(information.paytable[0], {
    symbol: "Crown",
    three: "0.10×",
    four: "0.50×",
    five: "2.00×",
  });
});
