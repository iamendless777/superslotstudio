import assert from "node:assert/strict";
import test from "node:test";

import {
  WizardCraftCanvasUiSpriteView,
  type WizardCraftCanvasUiAnimationClock,
  type WizardCraftCanvasUiMultiplier,
} from "../src/index.js";

class TextView {
  text = "";
  visible = false;
  alpha = 1;
  fontSize = 0;
  y = 0;
  destroyed = 0;
  destroy(): void {
    this.destroyed += 1;
  }
}

class MultiplierView {
  state: WizardCraftCanvasUiMultiplier | null = null;
  fontSize = 0;
  destroyed = 0;
  emphasized = false;
  emphasisAnimated: boolean | undefined;
  setState(state: WizardCraftCanvasUiMultiplier | null): void {
    this.state = state;
  }
  setFontSize(pixels: number): void {
    this.fontSize = pixels;
  }
  setEmphasized(emphasized: boolean, animated?: boolean): void {
    this.emphasized = emphasized;
    this.emphasisAnimated = animated;
  }
  destroy(): void {
    this.destroyed += 1;
  }
}

function harness(
  clock: WizardCraftCanvasUiAnimationClock = {
    sleep: async (_milliseconds: number) => undefined,
  },
) {
  const text = {
    mode: new TextView(),
    tier: new TextView(),
    spin: new TextView(),
    spinWin: new TextView(),
    totalWin: new TextView(),
    finalWin: new TextView(),
    maximum: new TextView(),
  };
  const multipliers = Array.from({ length: 5 }, () => new MultiplierView());
  const view = new WizardCraftCanvasUiSpriteView({
    text,
    multipliers,
    clock,
  });
  return { view, text, multipliers };
}

test("restores labels, reel ownership, wins, and maximum lock exactly", () => {
  const { view, text, multipliers } = harness();
  view.setState({
    mode: "OPEN THE GRIMOIRE",
    tier: "CROWNFIRE CLASH",
    spin: "3 / 12",
    spinWin: "1.25×",
    totalWin: "50.00×",
    finalWin: "25,000.00×",
    maximumLocked: true,
    multipliers: [{
      reel: 2,
      multiplier: 50,
      persistence: "sticky",
      advantage: "balanced",
    }],
  });

  assert.equal(text.mode.text, "OPEN THE GRIMOIRE");
  assert.equal(text.maximum.text, "MAXIMUM 25,000×");
  assert.equal(multipliers[2]!.state?.multiplier, 50);
  assert.equal(multipliers[0]!.state, null);
});

test("reveals tier copy before settling it at full opacity", async () => {
  const delays: number[] = [];
  const { view, text } = harness({
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });
  await view.animateTier("ARCANE SIEGE\nSTICKY CHANCE", "full");
  assert.equal(text.tier.text, "ARCANE SIEGE\nSTICKY CHANCE");
  assert.equal(text.tier.visible, true);
  assert.equal(text.tier.alpha, 1);
  assert.deepEqual(delays, [200]);
});

test("shows exact retrigger growth without implying an outcome", async () => {
  const { view, text } = harness();
  await view.animateRetrigger(5, 15, "none");
  assert.equal(text.tier.text, "RETRIGGER\n+5 SPINS · 15 TOTAL");
  assert.equal(text.tier.alpha, 1);
});

test("closes a feature with its exact authoritative total", async () => {
  const { view, text } = harness();
  await view.animateFeatureEnd(12_345, "none");
  assert.equal(text.tier.text, "DUEL COMPLETE\n123.45×");
  assert.equal(text.tier.alpha, 1);
});

test("shows the exact additive VS reel equation without inventing values", async () => {
  let release!: () => void;
  const { view, text, multipliers } = harness({
    sleep: () => new Promise<void>((resolve) => {
      release = resolve;
    }),
  });
  text.tier.text = "CROWNFIRE CLASH";
  text.tier.visible = true;
  text.tier.fontSize = 42;
  text.tier.y = 38;
  const animation = view.animateVsBreakdown([
    { reel: 0, multiplier: 3 },
    { reel: 2, multiplier: 5 },
    { reel: 4, multiplier: 10 },
  ], 18, "full");
  assert.equal(text.tier.text, "VS WAY 3× + 5× + 10× = 18×");
  assert.ok(text.tier.fontSize < 42);
  assert.equal(text.tier.y, 88);
  assert.deepEqual(multipliers.map((item) => item.emphasized), [true, false, true, false, true]);
  release();
  await animation;
  assert.equal(text.tier.text, "CROWNFIRE CLASH");
  assert.equal(text.tier.visible, true);
  assert.equal(text.tier.fontSize, 42);
  assert.equal(text.tier.y, 38);
  assert.equal(multipliers.every((item) => !item.emphasized), true);
  await assert.rejects(
    view.animateVsBreakdown([{ reel: 0, multiplier: 3 }, { reel: 1, multiplier: 5 }], 9, "none"),
    /total must equal/,
  );
});

test("cancelling a VS equation immediately restores the exact prior state", async () => {
  let release!: () => void;
  const { view, text, multipliers } = harness({
    sleep: () => new Promise<void>((resolve) => {
      release = resolve;
    }),
  });
  text.tier.text = "ARCANE SIEGE";
  text.tier.visible = true;
  text.tier.alpha = 1;
  text.tier.fontSize = 24;
  text.tier.y = 38;
  const animation = view.animateVsBreakdown([
    { reel: 1, multiplier: 5 },
    { reel: 3, multiplier: 10 },
  ], 15, "full");
  view.cancelAnimations();
  assert.equal(text.tier.text, "ARCANE SIEGE");
  assert.equal(text.tier.fontSize, 24);
  assert.equal(text.tier.y, 38);
  assert.equal(multipliers.every((item) => !item.emphasized), true);
  assert.equal(multipliers.every((item) => item.emphasisAnimated === false), true);
  release();
  await animation;
  assert.equal(text.tier.text, "ARCANE SIEGE");
});

test("reduced motion holds a static VS equation long enough to read", async () => {
  const delays: number[] = [];
  const { view, text, multipliers } = harness({
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });
  await view.animateVsBreakdown([
    { reel: 0, multiplier: 2 },
    { reel: 3, multiplier: 10 },
  ], 12, "none");
  assert.deepEqual(delays, [180]);
  assert.equal(text.tier.alpha, 1);
  assert.equal(multipliers.every((item) => !item.emphasized), true);
});

test("applies readable typography to labels and all five reel multipliers", () => {
  const { view, text, multipliers } = harness();
  view.setLayout({
    compact: true,
    primaryFontPixels: 20,
    secondaryFontPixels: 14,
    multiplierFontPixels: 18,
  });
  assert.equal(text.tier.fontSize, 20);
  assert.equal(text.mode.fontSize, 14);
  assert.equal(text.finalWin.fontSize, 20);
  assert.equal(multipliers.every((view) => view.fontSize === 18), true);
});

test("count-ups finish on exact server amounts and maximum copy", async () => {
  const delays: number[] = [];
  const { view, text } = harness({
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });
  await view.animateSpinWin(125, "subtle");
  await view.animateTotalWin(1_250, "full");
  await view.animateFinalWin(2_500_000, true, "full");

  assert.equal(text.spinWin.text, "1.25×");
  assert.equal(text.totalWin.text, "12.50×");
  assert.equal(text.finalWin.text, "25,000.00×");
  assert.equal(text.maximum.text, "MAXIMUM 25,000×");
  assert.equal(delays.length, 5 + 11 + 19);
});

test("counter cancellation blocks stale completion and teardown is idempotent", async () => {
  let release!: () => void;
  const { view, text, multipliers } = harness({
    sleep: () => new Promise<void>((resolve) => {
      release = resolve;
    }),
  });
  const counter = view.animateSpinCounter(4, 12, "full");
  assert.equal(text.spin.alpha, 0.72);
  view.cancelAnimations();
  assert.equal(text.spin.alpha, 1);
  release();
  await counter;

  view.destroy();
  view.destroy();
  assert.equal(text.mode.destroyed, 1);
  assert.equal(multipliers.every((view) => view.destroyed === 1), true);
  assert.throws(() => view.setLayout({
    compact: false,
    primaryFontPixels: 42,
    secondaryFontPixels: 24,
    multiplierFontPixels: 30,
  }), /view is destroyed/);
});
