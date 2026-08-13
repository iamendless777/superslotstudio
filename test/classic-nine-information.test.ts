import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASSIC_NINE_GAME_VERSION,
  getClassicNineInformation,
} from "../src/index.js";

const prohibitedSweepsTerms =
  /\b(?:bet|bets|wager|buy|bought|gamble|deposit|withdraw|cash|money|currency|fund|payer|rebet)\b|cost of/i;

test("exposes frozen standard information and candidate version", () => {
  const information = getClassicNineInformation({
    social: false,
    displayRtp: true,
  });
  assert.equal(CLASSIC_NINE_GAME_VERSION, "1.0.0");
  assert.equal(information.locale, "en");
  assert.equal(information.paytable.length, 8);
  assert.deepEqual(
    information.modes.map((mode) => [mode.name, mode.amount, mode.rtp]),
    [
      ["Base", "1× base bet", "96.50%"],
      ["Deep Signal", "100× base bet", "96.50%"],
    ],
  );
  assert.match(information.disclaimer, /Malfunction voids all wins and plays/);
  assert.match(information.disclaimer, /© 2026 Stake Engine/);
});

test("selects sweeps terminology without prohibited gambling terms", () => {
  const information = getClassicNineInformation({
    social: true,
    displayRtp: true,
  });
  assert.equal(information.locale, "sweeps_en");
  assert.equal(information.social, true);
  assert.doesNotMatch(JSON.stringify(information), prohibitedSweepsTerms);
  assert.equal(information.modes[1]?.amount, "100× base play amount");
});

test("honors jurisdiction-controlled RTP visibility", () => {
  const information = getClassicNineInformation({
    social: false,
    displayRtp: false,
  });
  assert.ok(information.modes.every((mode) => mode.rtp === null));
});
