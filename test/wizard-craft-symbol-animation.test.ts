import assert from "node:assert/strict";
import test from "node:test";

import {
  symbolAnimationFor,
  WIZARD_CRAFT_SYMBOL_ANIMATIONS,
  wizardCraftReelSpinFrame,
  wizardCraftSymbolEffectDuration,
  wizardCraftSymbolEffectFrame,
  wizardCraftStandardSymbolFrame,
} from "../src/games/wizard-craft/symbol-animation.js";

test("makes anticipation strengths progressively heavier without a win flash", () => {
  const normal = wizardCraftReelSpinFrame(0, 0.5);
  const first = wizardCraftReelSpinFrame(1, 0.5);
  const second = wizardCraftReelSpinFrame(2, 0.5);
  const third = wizardCraftReelSpinFrame(3, 0.5);

  assert.ok(normal.travelScale < first.travelScale);
  assert.ok(first.travelScale < second.travelScale);
  assert.ok(second.travelScale < third.travelScale);
  assert.ok(normal.plateAlpha > first.plateAlpha);
  assert.ok(first.plateAlpha > second.plateAlpha);
  assert.ok(second.plateAlpha > third.plateAlpha);
  assert.ok(third.plateAlpha >= 0.9);
  assert.throws(() => wizardCraftReelSpinFrame(4 as 3, 0.5), /strength/);
  assert.throws(() => wizardCraftReelSpinFrame(1, 1.1), /phase/);
});

test("authors separate Dragon-red and Wizard-blue wild animation recipes", () => {
  assert.equal(symbolAnimationFor("DRAGON", "winInfo")?.symbol, "DRAGON");
  assert.equal(symbolAnimationFor("WIZARD", "winInfo")?.symbol, "WIZARD");
  assert.equal(symbolAnimationFor("EMBER", "winInfo"), null);
});

test("binds wild animation only to authoritative result-book triggers", () => {
  const valid = new Set(["reelStop", "winInfo", "dragonClaim", "wizardClaim"]);
  for (const animation of Object.values(WIZARD_CRAFT_SYMBOL_ANIMATIONS)) {
    assert.ok(valid.has(animation.trigger));
    assert.ok(animation.totalDurationMs > 0);
    assert.ok(animation.beats.every((beat) =>
      beat.durationMs > 0 &&
      beat.atMs >= 0 &&
      beat.atMs + beat.durationMs <= animation.totalDurationMs
    ));
  }
});

test("keeps claim choreography aligned with character ownership", () => {
  assert.equal(
    symbolAnimationFor("DRAGON", "wizardClaim"),
    null,
  );
  assert.equal(
    symbolAnimationFor("WIZARD", "dragonClaim"),
    null,
  );
  assert.ok(symbolAnimationFor("DRAGON", "dragonClaim"));
  assert.ok(symbolAnimationFor("WIZARD", "wizardClaim"));
});

test("produces bounded deterministic movement curves without changing pixels", () => {
  const start = wizardCraftSymbolEffectFrame("DRAGON", "win", 0);
  const middle = wizardCraftSymbolEffectFrame("DRAGON", "win", 150);
  const end = wizardCraftSymbolEffectFrame("DRAGON", "win", 300);

  assert.equal(start.baseScale, 1);
  assert.ok(middle.baseScale > 1);
  assert.equal(end.baseScale, 1);
  assert.equal(start.auraAlpha, 0);
  assert.ok(middle.auraAlpha > 0);
  assert.equal(end.auraAlpha, 0);
  assert.equal(wizardCraftSymbolEffectDuration("win"), 300);
});

test("keeps character claims quiet on the opposing Wild", () => {
  const mismatch = wizardCraftSymbolEffectFrame("WIZARD", "dragonClaim", 120);
  const match = wizardCraftSymbolEffectFrame("DRAGON", "dragonClaim", 120);

  assert.equal(mismatch.auraAlpha, 0);
  assert.equal(mismatch.baseScale, 1);
  assert.ok(match.auraAlpha > 0);
  assert.ok(match.particlesRotation > 0);
  assert.ok(
    wizardCraftSymbolEffectFrame("WIZARD", "wizardClaim", 120)
      .particlesRotation < 0,
  );
  assert.throws(
    () => wizardCraftSymbolEffectFrame("DRAGON", "win", -1),
    /non-negative/,
  );
});

test("gives every standard symbol a restrained distinctive win motion", () => {
  const symbols = [
    "EMBER", "SCROLL", "POTION", "CRYSTAL",
    "GRIMOIRE", "STAFF", "CROWN", "RUNE",
  ];
  for (const symbol of symbols) {
    const frame = wizardCraftStandardSymbolFrame(symbol, "win", 150);
    assert.ok(
      frame.scaleX !== 1 ||
      frame.scaleY !== 1 ||
      frame.offsetY !== 0 ||
      frame.rotation !== 0,
    );
  }
  assert.deepEqual(
    wizardCraftStandardSymbolFrame("EMBER", "dragonClaim", 120),
    wizardCraftStandardSymbolFrame("UNKNOWN", "win", 120),
  );
});

test("reserves authoritative anticipation motion for the Duel Coin", () => {
  const coin = wizardCraftStandardSymbolFrame("RUNE", "anticipate", 120);
  const egg = wizardCraftStandardSymbolFrame("CROWN", "anticipate", 120);
  assert.ok(coin.scaleX > 1.1);
  assert.equal(egg.scaleX, 1);
  assert.equal(wizardCraftSymbolEffectDuration("anticipate"), 240);
});
