import assert from "node:assert/strict";
import test from "node:test";

import {
  WizardCraftCanvasUiLayer,
  applyWizardCraftRgsEvent,
  createWizardCraftCanvasUiLayout,
  createWizardCraftRuntimeState,
  formatWizardCraftMultiplierAmount,
  type WizardCraftCanvasUiLayout,
  type WizardCraftCanvasUiState,
  type WizardCraftCanvasUiView,
  type WizardCraftPresentationBeat,
  type WizardCraftRenderCommand,
} from "../src/index.js";

class UiView implements WizardCraftCanvasUiView {
  state: WizardCraftCanvasUiState | null = null;
  layout: WizardCraftCanvasUiLayout | null = null;
  readonly actions: string[] = [];
  setState(state: WizardCraftCanvasUiState): void {
    this.state = state;
  }
  setLayout(layout: WizardCraftCanvasUiLayout): void {
    this.layout = layout;
  }
  animateTier(
    label: string,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`tier:${label}:${motion}`);
  }
  animateRetrigger(
    added: number,
    total: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`retrigger:${added}:${total}:${motion}`);
  }
  animateFeatureEnd(
    totalWin: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`feature-end:${totalWin}:${motion}`);
  }
  animateVsBreakdown(
    contributions: readonly { readonly reel: number; readonly multiplier: number }[],
    total: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`vs:${contributions.map((item) => `${item.reel}:${item.multiplier}`).join("+")}=${total}:${motion}`);
  }
  animateSpinCounter(
    current: number,
    total: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`spin:${current}/${total}:${motion}`);
  }
  animateSpinWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`spin-win:${amount}:${motion}`);
  }
  animateTotalWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`total:${amount}:${motion}`);
  }
  animateFinalWin(
    amount: number,
    maximum: boolean,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`final:${amount}:${maximum}:${motion}`);
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
    channel: "ui",
    startMs: 0,
    durationMs: 100,
    motion,
  };
}

function command(
  type: string,
  extra: Record<string, unknown>,
): WizardCraftRenderCommand {
  const state = createWizardCraftRuntimeState();
  return {
    event: { index: 0, type, ...extra },
    before: state,
    after: state,
    cue: { eventIndex: 0, eventType: type, durationMs: 1, beats: [] },
  };
}

test("formats authoritative book-unit wins without floating payout math", () => {
  assert.equal(formatWizardCraftMultiplierAmount(0), "0.00×");
  assert.equal(formatWizardCraftMultiplierAmount(125), "1.25×");
  assert.equal(formatWizardCraftMultiplierAmount(2_500_000), "25,000.00×");
  assert.throws(() => formatWizardCraftMultiplierAmount(1.5));
});

test("keeps canvas labels readable in desktop and mini-player layouts", () => {
  const desktop = createWizardCraftCanvasUiLayout(1_920, 1_080);
  assert.equal(desktop.compact, false);
  assert.equal(desktop.primaryFontPixels, 42);
  const mini = createWizardCraftCanvasUiLayout(360, 240);
  assert.equal(mini.compact, true);
  assert.ok(mini.primaryFontPixels >= 20);
  assert.ok(mini.secondaryFontPixels >= 14);
  assert.ok(mini.multiplierFontPixels >= 18);
});

test("sync restores mode, tier, progress, wins, ownership, and cap lock", () => {
  const view = new UiView();
  const layer = new WizardCraftCanvasUiLayer(view);
  let state = applyWizardCraftRgsEvent(createWizardCraftRuntimeState(), {
    index: 0,
    type: "reveal",
    board: [],
    gameType: "freegame",
    mode: "openGrimoire",
  });
  state = applyWizardCraftRgsEvent(state, {
    index: 1,
    type: "startDuel",
    tier: 3,
    totalFs: 12,
  });
  state = applyWizardCraftRgsEvent(state, {
    index: 2,
    type: "updateFreeSpin",
    amount: 3,
    total: 12,
  });
  state = applyWizardCraftRgsEvent(state, {
    index: 3,
    type: "expandVsReel",
    reel: 2,
    appliedMultiplier: 50,
    dragonMultiplier: 25,
    wizardMultiplier: 25,
    advantage: "balanced",
    persistence: "sticky",
  });
  state = {
    ...state,
    spinWin: 125,
    totalWin: 2_500_000,
    finalWin: 2_500_000,
    capped: true,
  };
  layer.sync(state);

  assert.equal(view.state?.mode, "OPEN THE GRIMOIRE");
  assert.equal(
    view.state?.tier,
    "CROWNFIRE CLASH\nSTICKY GUARANTEED",
  );
  assert.equal(view.state?.spin, "3 / 12");
  assert.equal(view.state?.spinWin, "1.25×");
  assert.equal(view.state?.totalWin, "25,000.00×");
  assert.equal(view.state?.maximumLocked, true);
  assert.deepEqual(view.state?.multipliers, [{
    reel: 2,
    multiplier: 50,
    persistence: "sticky",
    advantage: "balanced",
  }]);
});

test("routes spin, win, total, and final counters with semantic motion", async () => {
  const view = new UiView();
  const layer = new WizardCraftCanvasUiLayer(view);
  await layer.play(beat("ui.spin-counter"), command(
    "updateFreeSpin",
    { amount: 4, total: 12 },
  ));
  await layer.play(beat("win.level", "subtle"), command(
    "setWin",
    { amount: 500 },
  ));
  await layer.play(beat("win.total-count"), command(
    "setTotalWin",
    { amount: 1_250 },
  ));
  await layer.play(beat("win.final-lock", "none"), command(
    "finalWin",
    { amount: 2_500_000 },
  ));

  assert.deepEqual(view.actions, [
    "spin:4/12:full",
    "spin-win:500:subtle",
    "total:1250:full",
    "final:2500000:true:none",
  ]);
});

test("explains an authored additive multi-reel VS multiplier", async () => {
  const view = new UiView();
  const layer = new WizardCraftCanvasUiLayer(view);
  await layer.play(beat("win.vs-breakdown", "subtle"), command("winInfo", {
    wins: [
      {
        multiplier: 8,
        contributingVsReels: [
          { reel: 1, multiplier: 3 },
          { reel: 4, multiplier: 5 },
        ],
      },
      {
        multiplier: 12,
        contributingVsReels: [
          { reel: 0, multiplier: 2 },
          { reel: 2, multiplier: 4 },
          { reel: 3, multiplier: 6 },
        ],
      },
    ],
  }));
  assert.deepEqual(view.actions, ["vs:0:2+2:4+3:6=12:subtle"]);
});

test("reveals the tier mechanic promise during bonus entry", async () => {
  const view = new UiView();
  const layer = new WizardCraftCanvasUiLayer(view);
  const before = createWizardCraftRuntimeState();
  const after = {
    ...before,
    tier: 2 as const,
  };
  await layer.play(beat("ui.tier-entry"), {
    event: {
      index: 0,
      type: "freeSpinTrigger",
      tier: 2,
      totalFs: 10,
      positions: [],
    },
    before,
    after,
    cue: {
      eventIndex: 0,
      eventType: "freeSpinTrigger",
      durationMs: 900,
      beats: [],
    },
  });
  assert.deepEqual(
    view.actions,
    ["tier:ARCANE SIEGE\nSTICKY CHANCE:full"],
  );
});

test("states the exact number of spins added by a retrigger", async () => {
  const view = new UiView();
  const layer = new WizardCraftCanvasUiLayer(view);
  const before = {
    ...createWizardCraftRuntimeState(),
    totalFreeSpins: 10,
  };
  const after = {
    ...before,
    totalFreeSpins: 15,
  };
  await layer.play(beat("ui.retrigger"), {
    event: { index: 0, type: "freeSpinRetrigger", totalFs: 15 },
    before,
    after,
    cue: {
      eventIndex: 0,
      eventType: "freeSpinRetrigger",
      durationMs: 820,
      beats: [],
    },
  });
  assert.deepEqual(view.actions, ["retrigger:5:15:full"]);
});
