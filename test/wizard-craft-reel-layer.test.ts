import assert from "node:assert/strict";
import test from "node:test";

import {
  WizardCraftReelLayer,
  applyWizardCraftRgsEvent,
  createWizardCraftReelLayout,
  createWizardCraftRuntimeState,
  type WizardCraftPresentationBeat,
  type WizardCraftReelCell,
  type WizardCraftReelOverlay,
  type WizardCraftReelView,
  type WizardCraftRenderCommand,
} from "../src/index.js";

class ReelView implements WizardCraftReelView {
  board: readonly (readonly unknown[])[] | null = null;
  readonly overlays = new Map<number, WizardCraftReelOverlay | null>();
  winningCells: readonly WizardCraftReelCell[] = [];
  progress = [0, 0];
  readonly animations: string[] = [];

  setBoard(board: readonly (readonly unknown[])[] | null): void {
    this.board = board;
  }
  setOverlay(reel: number, overlay: WizardCraftReelOverlay | null): void {
    this.overlays.set(reel, overlay);
  }
  setWinningCells(cells: readonly WizardCraftReelCell[]): void {
    this.winningCells = cells;
  }
  setFeatureProgress(current: number, total: number): void {
    this.progress = [current, total];
  }
  spinTo(
    _board: readonly (readonly unknown[])[],
    anticipation: readonly number[],
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.animations.push(`spin:${anticipation.join(",")}:${motion}`);
  }
  claimOverlay(
    overlay: WizardCraftReelOverlay,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.animations.push(`claim:${overlay.reel}:${overlay.persistence}:${motion}`);
  }
  guaranteeSticky(
    overlay: WizardCraftReelOverlay,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.animations.push(`guarantee:${overlay.reel}:${overlay.multiplier}:${motion}`);
  }
  upgradeSticky(
    overlay: WizardCraftReelOverlay,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.animations.push(`upgrade:${overlay.reel}:${overlay.multiplier}:${motion}`);
  }
  releaseTemporary(
    reels: readonly number[],
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.animations.push(`release:${reels.join(",")}:${motion}`);
  }
  highlightWins(
    cells: readonly WizardCraftReelCell[],
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.animations.push(`wins:${cells.length}:${motion}`);
  }
  cancelAnimations(): void {
    this.animations.push("cancel");
  }
  destroy(): void {
    this.animations.push("destroy");
  }
}

const board = Array.from({ length: 5 }, (_unused, reel) =>
  Array.from({ length: 4 }, (_other, row) => ({ name: `${reel}:${row}` }))
);

function beat(id: string, motion: WizardCraftPresentationBeat["motion"] = "full") {
  return {
    id,
    channel: "reels" as const,
    startMs: 0,
    durationMs: 100,
    motion,
  };
}

test("creates a stable five-by-four responsive reel layout", () => {
  const layout = createWizardCraftReelLayout(1_000, 640);
  assert.equal(layout.length, 20);
  assert.deepEqual(layout[0], {
    reel: 0,
    row: 0,
    x: 0,
    y: 0,
    width: 200,
    height: 160,
  });
  assert.deepEqual(layout.at(-1), {
    reel: 4,
    row: 3,
    x: 800,
    y: 480,
    width: 200,
    height: 160,
  });
  assert.throws(() => createWizardCraftReelLayout(0, 640));
});

test("sync restores board, sticky overlays, wins, and feature progress directly", () => {
  const view = new ReelView();
  const layer = new WizardCraftReelLayer(view);
  let state = applyWizardCraftRgsEvent(createWizardCraftRuntimeState(), {
    index: 0,
    type: "reveal",
    board,
    gameType: "freegame",
    mode: "openGrimoire",
  });
  state = applyWizardCraftRgsEvent(state, {
    index: 1,
    type: "expandVsReel",
    reel: 3,
    appliedMultiplier: 25,
    dragonMultiplier: 10,
    wizardMultiplier: 15,
    advantage: "wizard",
    persistence: "sticky",
  });
  state = applyWizardCraftRgsEvent(state, {
    index: 2,
    type: "updateFreeSpin",
    amount: 2,
    total: 12,
  });
  state = {
    ...state,
    highlightedCells: new Set(["0:1", "3:2"]),
  };

  layer.sync(state);

  assert.equal(view.board, board);
  assert.equal(view.overlays.size, 5);
  assert.equal(view.overlays.get(3)?.multiplier, 25);
  assert.equal(view.overlays.get(3)?.persistence, "sticky");
  assert.deepEqual(view.winningCells, [
    { reel: 0, row: 1 },
    { reel: 3, row: 2 },
  ]);
  assert.deepEqual(view.progress, [2, 12]);
});

test("routes reveal, claim, and release beats to the reel view", async () => {
  const view = new ReelView();
  const layer = new WizardCraftReelLayer(view);
  const initial = createWizardCraftRuntimeState();
  const revealed = applyWizardCraftRgsEvent(initial, {
    index: 0,
    type: "reveal",
    board,
    gameType: "basegame",
    mode: "baseBattle",
    anticipation: [0, 0, 0, 1, 1],
  });
  await layer.play(beat("reels.anticipate-and-stop"), {
    event: {
      index: 0,
      type: "reveal",
      anticipation: [0, 0, 0, 1, 1],
    },
    before: initial,
    after: revealed,
    cue: { eventIndex: 0, eventType: "reveal", durationMs: 1, beats: [] },
  });

  const claimed = applyWizardCraftRgsEvent(revealed, {
    index: 1,
    type: "expandVsReel",
    reel: 2,
    appliedMultiplier: 5,
    dragonMultiplier: 3,
    wizardMultiplier: 2,
    advantage: "dragon",
    persistence: "temporary",
  });
  const claimCommand: WizardCraftRenderCommand = {
    event: { index: 1, type: "expandVsReel", reel: 2 },
    before: revealed,
    after: claimed,
    cue: { eventIndex: 1, eventType: "expandVsReel", durationMs: 1, beats: [] },
  };
  await layer.play(beat("reel.temporary.claim", "subtle"), claimCommand);
  await layer.play(beat("reels.temporary-release"), {
    ...claimCommand,
    event: { index: 1, type: "clearSpinReels" },
    before: claimed,
  });

  assert.deepEqual(view.animations, [
    "spin:0,0,0,1,1:full",
    "claim:2:temporary:subtle",
    "release:2:full",
  ]);
});

test("gives Tier III's first sticky a dedicated guarantee treatment", async () => {
  const view = new ReelView();
  const layer = new WizardCraftReelLayer(view);
  const before = {
    ...createWizardCraftRuntimeState(),
    tier: 3 as const,
  };
  const after = applyWizardCraftRgsEvent(before, {
    index: 0,
    type: "expandVsReel",
    reel: 4,
    appliedMultiplier: 25,
    dragonMultiplier: 12,
    wizardMultiplier: 13,
    advantage: "wizard",
    persistence: "sticky",
  });
  await layer.play(beat("reel.sticky.claim"), {
    event: { index: 0, type: "expandVsReel", reel: 4 },
    before,
    after,
    cue: {
      eventIndex: 0,
      eventType: "expandVsReel",
      durationMs: 620,
      beats: [],
    },
  });
  assert.deepEqual(view.animations, ["guarantee:4:25:full"]);
});

test("routes sticky upgrades and winning cells without inferring either", async () => {
  const view = new ReelView();
  const layer = new WizardCraftReelLayer(view);
  let state = applyWizardCraftRgsEvent(createWizardCraftRuntimeState(), {
    index: 0,
    type: "reveal",
    board,
    gameType: "freegame",
    mode: "openGrimoire",
  });
  state = applyWizardCraftRgsEvent(state, {
    index: 1,
    type: "expandVsReel",
    reel: 4,
    appliedMultiplier: 5,
    dragonMultiplier: 2,
    wizardMultiplier: 3,
    advantage: "wizard",
    persistence: "sticky",
  });
  const upgraded = applyWizardCraftRgsEvent(state, {
    index: 2,
    type: "upgradeStickyReel",
    reel: 4,
    appliedMultiplier: 25,
    dragonMultiplier: 10,
    wizardMultiplier: 15,
    advantage: "wizard",
  });
  await layer.play(beat("reel.sticky-upgrade"), {
    event: { index: 2, type: "upgradeStickyReel", reel: 4 },
    before: state,
    after: upgraded,
    cue: {
      eventIndex: 2,
      eventType: "upgradeStickyReel",
      durationMs: 1,
      beats: [],
    },
  });

  const won = {
    ...upgraded,
    highlightedCells: new Set(["0:0", "1:2", "4:3"]),
  };
  await layer.play(beat("win.ways-highlight", "subtle"), {
    event: { index: 3, type: "winInfo" },
    before: upgraded,
    after: won,
    cue: { eventIndex: 3, eventType: "winInfo", durationMs: 1, beats: [] },
  });

  assert.deepEqual(view.animations, [
    "upgrade:4:25:full",
    "wins:3:subtle",
  ]);
});
