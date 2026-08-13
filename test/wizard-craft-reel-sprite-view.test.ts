import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_ASSET_SLOTS,
  WizardCraftReelSpriteView,
  type WizardCraftAssetId,
  type WizardCraftReelAnimationClock,
  type WizardCraftOverlayPhase,
  type WizardCraftReelLayoutCell,
  type WizardCraftReelOverlay,
} from "../src/index.js";

class Frame {
  visible = false;
  x = 0;
  y = 0;
  width = 0;
  height = 0;
}

class Cell {
  geometry: WizardCraftReelLayoutCell | null = null;
  symbol: unknown | null = null;
  spinning = false;
  spinStrength = 0;
  readonly spinStrengthHistory: number[] = [];
  effect: string | null = null;
  readonly effectHistory: (string | null)[] = [];
  highlighted = false;
  destroyed = 0;
  setGeometry(cell: WizardCraftReelLayoutCell): void {
    this.geometry = cell;
  }
  setSymbol(symbol: unknown | null): void {
    this.symbol = symbol;
  }
  setSpinning(spinning: boolean): void {
    this.spinning = spinning;
  }
  setSpinStrength(strength: 0 | 1 | 2 | 3): void {
    this.spinStrength = strength;
    this.spinStrengthHistory.push(strength);
  }
  setHighlighted(highlighted: boolean): void {
    this.highlighted = highlighted;
  }
  setEffect(effect: string | null): void {
    this.effect = effect;
    this.effectHistory.push(effect);
  }
  destroy(): void {
    this.destroyed += 1;
  }
}

class Overlay {
  geometry: readonly number[] = [];
  state: WizardCraftReelOverlay | null = null;
  phase: WizardCraftOverlayPhase = "stable";
  readonly phaseHistory: WizardCraftOverlayPhase[] = [];
  destroyed = 0;
  setGeometry(reel: number, x: number, width: number, height: number): void {
    this.geometry = [reel, x, width, height];
  }
  setState(state: WizardCraftReelOverlay | null): void {
    this.state = state;
  }
  setPhase(phase: WizardCraftOverlayPhase): void {
    this.phase = phase;
    this.phaseHistory.push(phase);
  }
  destroy(): void {
    this.destroyed += 1;
  }
}

function harness(
  clock: WizardCraftReelAnimationClock = {
    sleep: async (_milliseconds: number) => undefined,
  },
) {
  const frames = new Map<WizardCraftAssetId, Frame>(
    WIZARD_CRAFT_ASSET_SLOTS.map((slot) => [slot.id, new Frame()]),
  );
  const cells = Array.from({ length: 20 }, () => new Cell());
  const overlays = Array.from({ length: 5 }, () => new Overlay());
  const progress: number[][] = [];
  const view = new WizardCraftReelSpriteView({
    scene: { sprite: (id) => frames.get(id)! },
    cells,
    overlays,
    clock,
    onFeatureProgress: (current, total) => progress.push([current, total]),
  });
  return { view, frames, cells, overlays, progress };
}

const board = Array.from({ length: 5 }, (_unused, reel) =>
  Array.from({ length: 4 }, (_other, row) => `${reel}:${row}`)
);

test("lays out all cells, one full divider overlay, overlays, and backing", () => {
  const { view, frames, cells, overlays } = harness();
  view.layout(1_000, 640);

  assert.deepEqual(cells[0]!.geometry, {
    reel: 0,
    row: 0,
    x: 0,
    y: 0,
    width: 200,
    height: 160,
  });
  assert.deepEqual(cells[19]!.geometry, {
    reel: 4,
    row: 3,
    x: 800,
    y: 480,
    width: 200,
    height: 160,
  });
  assert.deepEqual(overlays[3]!.geometry, [3, 600, 200, 640]);
  assert.equal(frames.get("reels.mask.1")!.x, 0);
  assert.equal(frames.get("reels.mask.1")!.width, 1_000);
  assert.equal(frames.get("reels.mask.1")!.height, 640);
  assert.equal(frames.get("reels.mask.1")!.visible, true);
  assert.equal(frames.get("reels.mask.5")!.visible, false);
  assert.equal(frames.get("reels.backing")!.width, 1_000);
});

test("stops reels in order and adds anticipation only to marked reels", async () => {
  const delays: number[] = [];
  const { view, cells } = harness({
    sleep: async (milliseconds: number) => {
      delays.push(milliseconds);
    },
  });

  await view.spinTo(board, [0, 0, 1, 2, 3], "full");
  assert.deepEqual(delays, [80, 80, 260, 320, 380, 240]);
  assert.equal(cells[0]!.symbol, "0:0");
  assert.equal(cells[19]!.symbol, "4:3");
  assert.equal(cells.every((cell) => !cell.spinning), true);
  assert.equal(cells.every((cell) => cell.spinStrength === 0), true);
  assert.deepEqual(cells[0]!.spinStrengthHistory, [0, 0]);
  assert.deepEqual(cells[8]!.spinStrengthHistory, [1, 0]);
  assert.deepEqual(cells[12]!.spinStrengthHistory, [2, 0]);
  assert.deepEqual(cells[16]!.spinStrengthHistory, [3, 0]);
  assert.deepEqual(cells[16]!.effectHistory, ["anticipate", null]);
  assert.equal(cells.every((cell) => cell.effect === null), true);
});

test("holds an ordinary final reel long enough to finish its landing", async () => {
  const delays: number[] = [];
  const { view, cells } = harness({
    sleep: async (milliseconds: number) => {
      delays.push(milliseconds);
    },
  });

  await view.spinTo(board, [0, 0, 0, 0, 0], "full");
  assert.deepEqual(delays, [80, 80, 80, 80, 80, 180]);
  assert.deepEqual(cells[16]!.effectHistory, ["land", null]);
});

test("rejects anticipation strengths outside the authoritative 0–3 range", async () => {
  const { view } = harness();
  await assert.rejects(
    view.spinTo(board, [0, 0, 0, 0, 4], "full"),
    /strengths from 0 to 3/,
  );
  await assert.rejects(
    view.spinTo(board, [0, 0, 0, 0, 1.5], "full"),
    /strengths from 0 to 3/,
  );
});

test("owns temporary, sticky-upgrade, release, and win-highlight states", async () => {
  const { view, cells, overlays, progress } = harness();
  const temporary: WizardCraftReelOverlay = {
    reel: 1,
    multiplier: 5,
    dragonMultiplier: 3,
    wizardMultiplier: 2,
    advantage: "dragon",
    persistence: "spin",
  };
  await view.claimOverlay(temporary, "subtle");
  assert.equal(overlays[1]!.state, temporary);
  assert.equal(overlays[1]!.phase, "stable");

  const sticky = {
    ...temporary,
    multiplier: 25,
    persistence: "sticky" as const,
  };
  await view.guaranteeSticky(sticky, "full");
  assert.equal(overlays[1]!.phase, "stable");
  await view.upgradeSticky(sticky, "full");
  assert.equal(overlays[1]!.state?.multiplier, 25);
  await view.highlightWins([{ reel: 0, row: 1 }, { reel: 4, row: 3 }], "none");
  assert.equal(cells[1]!.highlighted, true);
  assert.equal(cells[19]!.highlighted, true);
  assert.equal(overlays[1]!.phaseHistory.includes("contribute"), false);
  view.setFeatureProgress(3, 12);
  assert.deepEqual(progress, [[3, 12]]);

  await view.releaseTemporary([1], "none");
  assert.equal(overlays[1]!.state, null);
});

test("reduced motion settles every VS claim phase to its truthful stable art", async () => {
  const { view, overlays } = harness();
  const temporary: WizardCraftReelOverlay = {
    reel: 2,
    multiplier: 4,
    dragonMultiplier: 2,
    wizardMultiplier: 2,
    advantage: "balanced",
    persistence: "spin",
  };
  const sticky: WizardCraftReelOverlay = {
    ...temporary,
    multiplier: 8,
    dragonMultiplier: 5,
    wizardMultiplier: 3,
    advantage: "dragon",
    persistence: "sticky",
  };

  await view.claimOverlay(temporary, "none");
  assert.equal(overlays[2]!.phase, "stable");
  await view.guaranteeSticky(sticky, "none");
  assert.equal(overlays[2]!.phase, "stable");
  await view.upgradeSticky({ ...sticky, multiplier: 12 }, "none");
  assert.equal(overlays[2]!.phase, "stable");
});

test("pulses only authored active VS frames used by the winning way", async () => {
  const { view, overlays } = harness();
  const active: WizardCraftReelOverlay = {
    reel: 0,
    multiplier: 5,
    dragonMultiplier: 5,
    wizardMultiplier: 2,
    advantage: "dragon",
    persistence: "sticky",
  };
  view.setOverlay(0, active);
  view.setOverlay(2, { ...active, reel: 2, advantage: "wizard" });
  await view.highlightWins([
    { reel: 0, row: 1 },
    { reel: 1, row: 1 },
    { reel: 3, row: 1 },
  ], "full");
  assert.equal(overlays[0]!.phaseHistory.includes("contribute"), true);
  assert.equal(overlays[2]!.phaseHistory.includes("contribute"), false);
  assert.equal(overlays[0]!.phase, "stable");
});

test("cancellation prevents a late reel stop and teardown is idempotent", async () => {
  let release!: () => void;
  const { view, cells, overlays } = harness({
    sleep: () => new Promise<void>((resolve) => {
      release = resolve;
    }),
  });
  const spin = view.spinTo(board, [0, 0, 0, 0, 0], "full");
  assert.equal(cells.every((cell) => cell.spinning), true);
  view.cancelAnimations();
  assert.equal(cells.every((cell) => !cell.spinning), true);
  release();
  await spin;
  assert.equal(cells[0]!.symbol, null);

  view.destroy();
  view.destroy();
  assert.equal(cells.every((cell) => cell.destroyed === 1), true);
  assert.equal(overlays.every((overlay) => overlay.destroyed === 1), true);
});
