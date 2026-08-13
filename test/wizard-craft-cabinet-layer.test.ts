import assert from "node:assert/strict";
import test from "node:test";

import {
  WizardCraftCabinetLayer,
  applyWizardCraftRgsEvent,
  createWizardCraftCabinetLayout,
  createWizardCraftRuntimeState,
  type WizardCraftCabinetState,
  type WizardCraftCabinetLayout,
  type WizardCraftCabinetView,
  type WizardCraftPresentationBeat,
  type WizardCraftRenderCommand,
} from "../src/index.js";

class CabinetView implements WizardCraftCabinetView {
  state: WizardCraftCabinetState | null = null;
  layout: WizardCraftCabinetLayout | null = null;
  readonly actions: string[] = [];
  setState(state: WizardCraftCabinetState): void {
    this.state = state;
  }
  setLayout(layout: WizardCraftCabinetLayout): void {
    this.layout = layout;
  }
  setAmbientMotion(motion: WizardCraftPresentationBeat["motion"]): void {
    this.actions.push(`ambient:${motion}`);
  }
  anticipation(motion: WizardCraftPresentationBeat["motion"]): void {
    this.actions.push(`anticipation:${motion}`);
  }
  enterFeature(
    tier: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`enter:${tier}:${motion}`);
  }
  handoff(
    tier: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`handoff:${tier}:${motion}`);
  }
  retrigger(
    tier: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`retrigger:${tier}:${motion}`);
  }
  endFeature(motion: WizardCraftPresentationBeat["motion"]): void {
    this.actions.push(`end:${motion}`);
  }
  strongWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`strong:${amount}:${motion}`);
  }
  maximumWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`maximum:${amount}:${motion}`);
  }
  cancelAnimations(): void {
    this.actions.push("cancel");
  }
  destroy(): void {
    this.actions.push("destroy");
  }
}

function beat(
  id: string,
  motion: WizardCraftPresentationBeat["motion"] = "full",
): WizardCraftPresentationBeat {
  return {
    id,
    channel: "cabinet",
    startMs: 0,
    durationMs: 100,
    motion,
  };
}

function command(
  type: string,
  extra: Record<string, unknown> = {},
): WizardCraftRenderCommand {
  const state = createWizardCraftRuntimeState();
  return {
    event: { index: 0, type, ...extra },
    before: state,
    after: state,
    cue: { eventIndex: 0, eventType: type, durationMs: 1, beats: [] },
  };
}

test("contains the 16:9 cabinet in desktop, mobile, and popout viewports", () => {
  assert.deepEqual(createWizardCraftCabinetLayout(1_920, 1_080), {
    x: 0,
    y: 0,
    width: 1_920,
    height: 1_080,
    scale: 1,
    compact: false,
  });
  const portrait = createWizardCraftCabinetLayout(390, 844);
  assert.equal(portrait.width, 390);
  assert.ok(portrait.y > 0);
  assert.equal(portrait.compact, true);
  const popout = createWizardCraftCabinetLayout(640, 360);
  assert.equal(popout.width, 640);
  assert.equal(popout.height, 360);
  assert.equal(popout.compact, true);
});

test("sync restores title, tier, crest, and independent side lighting", () => {
  const view = new CabinetView();
  const layer = new WizardCraftCabinetLayer(view);
  let state = applyWizardCraftRgsEvent(createWizardCraftRuntimeState(), {
    index: 0,
    type: "startDuel",
    tier: 3,
    totalFs: 12,
  });
  state = applyWizardCraftRgsEvent(state, {
    index: 1,
    type: "expandVsReel",
    reel: 0,
    appliedMultiplier: 25,
    dragonMultiplier: 20,
    wizardMultiplier: 5,
    advantage: "dragon",
    persistence: "sticky",
  });
  state = applyWizardCraftRgsEvent(state, {
    index: 2,
    type: "expandVsReel",
    reel: 4,
    appliedMultiplier: 50,
    dragonMultiplier: 25,
    wizardMultiplier: 25,
    advantage: "balanced",
    persistence: "sticky",
  });
  layer.sync(state);

  assert.equal(view.state?.title, "WIZARD CRAFT");
  assert.equal(view.state?.tier, 3);
  assert.equal(view.state?.crest, "clash");
  assert.equal(view.state?.dragonLight, 0.5);
  assert.equal(view.state?.wizardLight, 0);
  assert.equal(view.state?.balancedLight, 1);
});

test("routes anticipation, tiers, retrigger, end, and exact cap presentation", async () => {
  const view = new CabinetView();
  const layer = new WizardCraftCabinetLayer(view);
  await layer.play(
    beat("cabinet.anticipation-glow", "subtle"),
    command("reveal"),
  );
  await layer.play(beat("duel.tier-2"), command(
    "freeSpinTrigger",
    { tier: 2 },
  ));
  await layer.play(beat("duel.handoff"), command(
    "startDuel",
    { tier: 2 },
  ));
  await layer.play(beat("duel.retrigger"), command(
    "freeSpinRetrigger",
    { tier: 2 },
  ));
  await layer.play(beat("duel.end", "none"), command("freeSpinEnd"));
  await layer.play(beat("win.strong-power"), command(
    "finalWin",
    { amount: 10_000 },
  ));
  await layer.play(beat("win.maximum-power"), command(
    "wincap",
    { amount: 2_500_000 },
  ));

  assert.deepEqual(view.actions, [
    "ambient:subtle",
    "anticipation:subtle",
    "ambient:full",
    "enter:2:full",
    "ambient:full",
    "handoff:2:full",
    "ambient:full",
    "retrigger:2:full",
    "ambient:none",
    "end:none",
    "ambient:full",
    "strong:10000:full",
    "ambient:full",
    "maximum:2500000:full",
  ]);
  await assert.rejects(
    () => layer.play(
      beat("win.maximum-power"),
      command("wincap", { amount: 2_499_999 }),
    ),
    /requires 25,000×/,
  );
});
