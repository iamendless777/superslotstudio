import type { WizardCraftPresentationBeat } from "./cues.js";
import type { WizardCraftPixiLayer } from "./pixi-scene.js";
import type {
  WizardCraftRenderCommand,
  WizardCraftRuntimeState,
  WizardCraftRuntimeVsReel,
} from "./runtime.js";
import { WIZARD_CRAFT_CABINET_RECTS } from "./scene-layout.js";

export interface WizardCraftReelCell {
  readonly reel: number;
  readonly row: number;
}

export interface WizardCraftReelOverlay extends WizardCraftRuntimeVsReel {
  readonly reel: number;
}

export interface WizardCraftReelView {
  layout?(width: number, height: number): void;
  setBoard(board: readonly (readonly unknown[])[] | null): void;
  setOverlay(reel: number, overlay: WizardCraftReelOverlay | null): void;
  setWinningCells(cells: readonly WizardCraftReelCell[]): void;
  setFeatureProgress(current: number, total: number): void;
  spinTo(
    board: readonly (readonly unknown[])[],
    anticipation: readonly number[],
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  claimOverlay(
    overlay: WizardCraftReelOverlay,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  guaranteeSticky(
    overlay: WizardCraftReelOverlay,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  upgradeSticky(
    overlay: WizardCraftReelOverlay,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  releaseTemporary(
    reels: readonly number[],
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  highlightWins(
    cells: readonly WizardCraftReelCell[],
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  cancelAnimations(): void;
  destroy(): void;
}

export interface WizardCraftReelLayoutCell extends WizardCraftReelCell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Authored reel opening inside the shared 640×360 cabinet coordinate space. */
export const WIZARD_CRAFT_REEL_DESIGN_RECT =
  WIZARD_CRAFT_CABINET_RECTS.reels;

export function createWizardCraftReelLayout(
  width: number,
  height: number,
): readonly WizardCraftReelLayoutCell[] {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError("WIZARD CRAFT reel dimensions must be positive");
  }
  const cellWidth = width / 5;
  const cellHeight = height / 4;
  return Object.freeze(
    Array.from({ length: 5 }, (_, reel) =>
      Array.from({ length: 4 }, (_unused, row) => Object.freeze({
        reel,
        row,
        x: reel * cellWidth,
        y: row * cellHeight,
        width: cellWidth,
        height: cellHeight,
      }))
    ).flat(),
  );
}

function board(
  value: WizardCraftRuntimeState["board"],
): readonly (readonly unknown[])[] {
  if (
    value === null ||
    value.length !== 5 ||
    value.some((reel) => reel.length !== 4)
  ) {
    throw new Error("WIZARD CRAFT reel layer requires a 5×4 board");
  }
  return value;
}

function cells(state: WizardCraftRuntimeState): readonly WizardCraftReelCell[] {
  return Object.freeze(
    [...state.highlightedCells].map((key) => {
      const match = /^([0-4]):([0-3])$/.exec(key);
      if (match === null) {
        throw new Error(`Invalid WIZARD CRAFT highlighted cell ${key}`);
      }
      return Object.freeze({ reel: Number(match[1]), row: Number(match[2]) });
    }),
  );
}

function overlay(
  reel: number,
  value: WizardCraftRuntimeVsReel,
): WizardCraftReelOverlay {
  return Object.freeze({ reel, ...value });
}

function overlays(
  state: WizardCraftRuntimeState,
): ReadonlyMap<number, WizardCraftReelOverlay> {
  const result = new Map<number, WizardCraftReelOverlay>();
  for (const [reel, value] of state.stickyVsReels) {
    result.set(reel, overlay(reel, value));
  }
  for (const [reel, value] of state.spinVsReels) {
    if (!result.has(reel)) result.set(reel, overlay(reel, value));
  }
  return result;
}

function eventReel(command: WizardCraftRenderCommand): number {
  const value = command.event.reel;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 4) {
    throw new Error("WIZARD CRAFT reel animation requires a valid event reel");
  }
  return value as number;
}

export class WizardCraftReelLayer implements WizardCraftPixiLayer {
  readonly #view: WizardCraftReelView;

  constructor(view: WizardCraftReelView) {
    this.#view = view;
  }

  layout(width: number, height: number): void {
    this.#view.layout?.(width, height);
  }

  sync(state: WizardCraftRuntimeState): void {
    this.#view.setBoard(state.board);
    const active = overlays(state);
    for (let reel = 0; reel < 5; reel += 1) {
      this.#view.setOverlay(reel, active.get(reel) ?? null);
    }
    this.#view.setWinningCells(cells(state));
    this.#view.setFeatureProgress(state.freeSpin, state.totalFreeSpins);
  }

  async play(
    beat: WizardCraftPresentationBeat,
    command: WizardCraftRenderCommand,
  ): Promise<void> {
    if (beat.channel !== "reels") {
      throw new Error(`Reel layer cannot play ${beat.channel} beat`);
    }
    if (beat.id === "reels.stop" || beat.id === "reels.anticipate-and-stop") {
      const raw = command.event.anticipation;
      const anticipation = Array.isArray(raw)
        ? raw.map((value) => Number(value))
        : [0, 0, 0, 0, 0];
      await this.#view.spinTo(board(command.after.board), anticipation, beat.motion);
      return;
    }
    if (beat.id === "reel.temporary.claim" || beat.id === "reel.sticky.claim") {
      const reel = eventReel(command);
      const active = overlays(command.after).get(reel);
      if (active === undefined) {
        throw new Error("WIZARD CRAFT claim beat requires an active VS overlay");
      }
      const fulfillsTierThreePromise =
        beat.id === "reel.sticky.claim" &&
        command.before.tier === 3 &&
        command.before.stickyVsReels.size === 0;
      if (fulfillsTierThreePromise) {
        await this.#view.guaranteeSticky(active, beat.motion);
      } else {
        await this.#view.claimOverlay(active, beat.motion);
      }
      return;
    }
    if (beat.id === "reel.sticky-upgrade") {
      const reel = eventReel(command);
      const active = overlays(command.after).get(reel);
      if (active === undefined || active.persistence !== "sticky") {
        throw new Error("WIZARD CRAFT upgrade beat requires a sticky VS overlay");
      }
      await this.#view.upgradeSticky(active, beat.motion);
      return;
    }
    if (beat.id === "reels.temporary-release") {
      await this.#view.releaseTemporary(
        Object.freeze([...command.before.spinVsReels.keys()]),
        beat.motion,
      );
      return;
    }
    if (beat.id === "win.ways-highlight") {
      await this.#view.highlightWins(cells(command.after), beat.motion);
      return;
    }
    throw new Error(`Unsupported WIZARD CRAFT reel beat ${beat.id}`);
  }

  cancel(): void {
    this.#view.cancelAnimations();
  }

  destroy(): void {
    this.#view.destroy();
  }
}
