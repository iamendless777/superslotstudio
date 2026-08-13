import type { WizardCraftAssetId } from "./assets.js";
import type { WizardCraftPresentationBeat } from "./cues.js";
import {
  createWizardCraftReelLayout,
  type WizardCraftReelCell,
  type WizardCraftReelLayoutCell,
  type WizardCraftReelOverlay,
  type WizardCraftReelView,
} from "./reel-layer.js";

export interface WizardCraftReelFrameSprite {
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WizardCraftReelSpriteScene {
  sprite(id: WizardCraftAssetId): WizardCraftReelFrameSprite;
}

export interface WizardCraftSymbolCellView {
  setGeometry(cell: WizardCraftReelLayoutCell): void;
  setSymbol(symbol: unknown | null): void;
  setSpinning(spinning: boolean): void;
  setSpinStrength?(strength: 0 | 1 | 2 | 3): void;
  setHighlighted(highlighted: boolean): void;
  setEffect?(
    effect:
      | "land"
      | "win"
      | "anticipate"
      | "dragonClaim"
      | "wizardClaim"
      | "balancedClaim"
      | null,
  ): void;
  destroy(): void;
}

export type WizardCraftOverlayPhase =
  | "stable"
  | "claim"
  | "guarantee"
  | "upgrade"
  | "contribute"
  | "release";

export interface WizardCraftVsReelOverlayView {
  setGeometry(
    reel: number,
    x: number,
    width: number,
    height: number,
  ): void;
  setState(overlay: WizardCraftReelOverlay | null): void;
  setPhase(phase: WizardCraftOverlayPhase, animated?: boolean): void;
  destroy(): void;
}

export interface WizardCraftReelAnimationClock {
  sleep(milliseconds: number): Promise<void>;
}

export interface WizardCraftReelSpriteViewOptions {
  readonly scene: WizardCraftReelSpriteScene;
  readonly cells: readonly WizardCraftSymbolCellView[];
  readonly overlays: readonly WizardCraftVsReelOverlayView[];
  readonly clock?: WizardCraftReelAnimationClock;
  readonly onFeatureProgress?: (current: number, total: number) => void;
}

const MASK_IDS = Object.freeze([
  "reels.mask.1",
  "reels.mask.2",
  "reels.mask.3",
  "reels.mask.4",
  "reels.mask.5",
] as const satisfies readonly WizardCraftAssetId[]);

function delay(
  motion: WizardCraftPresentationBeat["motion"],
  fullMilliseconds: number,
): number {
  if (motion === "none") return 0;
  return motion === "subtle"
    ? Math.round(fullMilliseconds / 2)
    : fullMilliseconds;
}

function assertBoard(
  board: readonly (readonly unknown[])[],
): void {
  if (board.length !== 5 || board.some((reel) => reel.length !== 4)) {
    throw new Error("WIZARD CRAFT reel sprite view requires a 5×4 board");
  }
}

function cellIndex(reel: number, row: number): number {
  return reel * 4 + row;
}

export class WizardCraftReelSpriteView implements WizardCraftReelView {
  readonly #scene: WizardCraftReelSpriteScene;
  readonly #cells: readonly WizardCraftSymbolCellView[];
  readonly #overlays: readonly WizardCraftVsReelOverlayView[];
  readonly #clock: WizardCraftReelAnimationClock;
  readonly #onFeatureProgress:
    | ((current: number, total: number) => void)
    | undefined;
  #epoch = 0;
  #destroyed = false;
  readonly #activeOverlayReels = new Set<number>();

  constructor(options: WizardCraftReelSpriteViewOptions) {
    if (options.cells.length !== 20 || options.overlays.length !== 5) {
      throw new Error("WIZARD CRAFT reel view requires 20 cells and 5 overlays");
    }
    this.#scene = options.scene;
    this.#cells = options.cells;
    this.#overlays = options.overlays;
    this.#clock = options.clock ?? {
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
    };
    this.#onFeatureProgress = options.onFeatureProgress;
    this.#scene.sprite("reels.backing").visible = true;
    // The source is one complete 5×4 divider overlay shared by the five
    // semantic mask slots. Render it once at the full reel-window size;
    // squeezing a copy into every reel creates a noisy repeated mini-grid.
    this.#scene.sprite(MASK_IDS[0]).visible = true;
    for (const id of MASK_IDS.slice(1)) this.#scene.sprite(id).visible = false;
  }

  layout(width: number, height: number): void {
    this.#assertAvailable();
    const layout = createWizardCraftReelLayout(width, height);
    for (const cell of layout) {
      this.#cells[cellIndex(cell.reel, cell.row)]!.setGeometry(cell);
    }
    for (let reel = 0; reel < 5; reel += 1) {
      const first = layout[cellIndex(reel, 0)]!;
      const mask = this.#scene.sprite(MASK_IDS[reel]!);
      if (reel === 0) {
        mask.x = 0;
        mask.y = 0;
        mask.width = width;
        mask.height = height;
      }
      this.#overlays[reel]!.setGeometry(
        reel,
        first.x,
        first.width,
        height,
      );
    }
    const backing = this.#scene.sprite("reels.backing");
    backing.x = 0;
    backing.y = 0;
    backing.width = width;
    backing.height = height;
  }

  setBoard(board: readonly (readonly unknown[])[] | null): void {
    this.#assertAvailable();
    if (board === null) {
      for (const cell of this.#cells) cell.setSymbol(null);
      return;
    }
    assertBoard(board);
    for (let reel = 0; reel < 5; reel += 1) {
      this.#setReel(reel, board[reel]!);
    }
  }

  setOverlay(reel: number, overlay: WizardCraftReelOverlay | null): void {
    this.#assertReel(reel);
    if (overlay !== null && overlay.reel !== reel) {
      throw new Error("WIZARD CRAFT overlay reel does not match its view");
    }
    this.#overlays[reel]!.setState(overlay);
    this.#overlays[reel]!.setPhase("stable");
    if (overlay === null) this.#activeOverlayReels.delete(reel);
    else this.#activeOverlayReels.add(reel);
  }

  setWinningCells(cells: readonly WizardCraftReelCell[]): void {
    this.#assertAvailable();
    const highlighted = new Set(cells.map((cell) => {
      this.#assertCell(cell);
      return `${cell.reel}:${cell.row}`;
    }));
    for (let reel = 0; reel < 5; reel += 1) {
      for (let row = 0; row < 4; row += 1) {
        this.#cells[cellIndex(reel, row)]!.setHighlighted(
          highlighted.has(`${reel}:${row}`),
        );
      }
    }
  }

  setFeatureProgress(current: number, total: number): void {
    this.#assertAvailable();
    this.#onFeatureProgress?.(current, total);
  }

  async spinTo(
    board: readonly (readonly unknown[])[],
    anticipation: readonly number[],
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    assertBoard(board);
    if (
      anticipation.length !== 5 ||
      anticipation.some((value) =>
        !Number.isSafeInteger(value) || value < 0 || value > 3
      )
    ) {
      throw new Error("WIZARD CRAFT anticipation requires five strengths from 0 to 3");
    }
    const epoch = ++this.#epoch;
    for (let reel = 0; reel < 5; reel += 1) {
      for (let row = 0; row < 4; row += 1) {
        const cell = this.#cells[cellIndex(reel, row)]!;
        cell.setHighlighted(false);
        cell.setSpinStrength?.(anticipation[reel]! as 0 | 1 | 2 | 3);
        cell.setSpinning(true);
      }
    }
    for (let reel = 0; reel < 5; reel += 1) {
      const milliseconds = delay(
        motion,
        80 + (
          anticipation[reel]! > 0
            ? 120 + anticipation[reel]! * 60
            : 0
        ),
      );
      if (milliseconds > 0) await this.#clock.sleep(milliseconds);
      if (this.#destroyed || epoch !== this.#epoch) return;
      this.#setReel(reel, board[reel]!);
      for (let row = 0; row < 4; row += 1) {
        const cell = this.#cells[cellIndex(reel, row)]!;
        cell.setSpinning(false);
        cell.setSpinStrength?.(0);
        cell.setEffect?.(
          motion === "none"
            ? null
            : anticipation[reel]! > 0
            ? "anticipate"
            : "land",
        );
      }
    }
    // The last reel has no following stop delay to carry its landing motion.
    // Hold the completed board long enough for its authored settle (or Duel
    // Coin anticipation) to resolve before the next presentation beat begins.
    const settleMilliseconds = delay(
      motion,
      anticipation.some((strength) => strength > 0) ? 240 : 180,
    );
    if (settleMilliseconds > 0) await this.#clock.sleep(settleMilliseconds);
    if (this.#destroyed || epoch !== this.#epoch) return;
    for (const cell of this.#cells) cell.setEffect?.(null);
  }

  async claimOverlay(
    overlay: WizardCraftReelOverlay,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertReel(overlay.reel);
    const epoch = ++this.#epoch;
    const view = this.#overlays[overlay.reel]!;
    this.#activeOverlayReels.add(overlay.reel);
    view.setState(overlay);
    view.setPhase("claim", motion !== "none");
    const claimEffect = overlay.advantage === "dragon"
      ? "dragonClaim"
      : overlay.advantage === "wizard"
      ? "wizardClaim"
      : "balancedClaim";
    for (let row = 0; row < 4; row += 1) {
      this.#cells[cellIndex(overlay.reel, row)]!.setEffect?.(
        motion === "none" ? null : claimEffect,
      );
    }
    const milliseconds = delay(motion, 240);
    if (milliseconds > 0) await this.#clock.sleep(milliseconds);
    if (this.#destroyed || epoch !== this.#epoch) return;
    for (let row = 0; row < 4; row += 1) {
      this.#cells[cellIndex(overlay.reel, row)]!.setEffect?.(null);
    }
    view.setPhase("stable", motion !== "none");
  }

  async upgradeSticky(
    overlay: WizardCraftReelOverlay,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertReel(overlay.reel);
    if (overlay.persistence !== "sticky") {
      throw new Error("WIZARD CRAFT upgrade view requires a sticky overlay");
    }
    const epoch = ++this.#epoch;
    const view = this.#overlays[overlay.reel]!;
    this.#activeOverlayReels.add(overlay.reel);
    view.setState(overlay);
    view.setPhase("upgrade", motion !== "none");
    const milliseconds = delay(motion, 300);
    if (milliseconds > 0) await this.#clock.sleep(milliseconds);
    if (this.#destroyed || epoch !== this.#epoch) return;
    view.setPhase("stable", motion !== "none");
  }

  async guaranteeSticky(
    overlay: WizardCraftReelOverlay,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertReel(overlay.reel);
    if (overlay.persistence !== "sticky") {
      throw new Error("WIZARD CRAFT guarantee view requires a sticky overlay");
    }
    const epoch = ++this.#epoch;
    const view = this.#overlays[overlay.reel]!;
    this.#activeOverlayReels.add(overlay.reel);
    view.setState(overlay);
    view.setPhase("guarantee", motion !== "none");
    const milliseconds = delay(motion, 500);
    if (milliseconds > 0) await this.#clock.sleep(milliseconds);
    if (this.#destroyed || epoch !== this.#epoch) return;
    view.setPhase("stable", motion !== "none");
  }

  async releaseTemporary(
    reels: readonly number[],
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    for (const reel of reels) {
      this.#assertReel(reel);
      this.#overlays[reel]!.setPhase("release", motion !== "none");
    }
    const epoch = ++this.#epoch;
    const milliseconds = delay(motion, 300);
    if (milliseconds > 0) await this.#clock.sleep(milliseconds);
    if (this.#destroyed || epoch !== this.#epoch) return;
    for (const reel of reels) {
      this.#overlays[reel]!.setState(null);
      this.#activeOverlayReels.delete(reel);
    }
  }

  async highlightWins(
    cells: readonly WizardCraftReelCell[],
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.setWinningCells(cells);
    const winningReels = new Set(cells.map((cell) => cell.reel));
    const contributingReels = [...this.#activeOverlayReels]
      .filter((reel) => winningReels.has(reel));
    for (const reel of contributingReels) {
      this.#overlays[reel]!.setPhase("contribute", motion !== "none");
    }
    for (const cell of cells) {
      this.#cells[cellIndex(cell.reel, cell.row)]!.setEffect?.(
        motion === "none" ? null : "win",
      );
    }
    const epoch = ++this.#epoch;
    const milliseconds = delay(motion, 300);
    if (milliseconds > 0) await this.#clock.sleep(milliseconds);
    if (this.#destroyed || epoch !== this.#epoch) return;
    for (const cell of cells) {
      this.#cells[cellIndex(cell.reel, cell.row)]!.setEffect?.(null);
    }
    for (const reel of contributingReels) {
      this.#overlays[reel]!.setPhase("stable", motion !== "none");
    }
  }

  cancelAnimations(): void {
    if (this.#destroyed) return;
    this.#epoch += 1;
    for (const cell of this.#cells) cell.setSpinning(false);
    for (const cell of this.#cells) cell.setSpinStrength?.(0);
    for (const cell of this.#cells) cell.setEffect?.(null);
    for (const overlay of this.#overlays) overlay.setPhase("stable");
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#epoch += 1;
    for (const cell of this.#cells) cell.destroy();
    for (const overlay of this.#overlays) overlay.destroy();
  }

  #setReel(reel: number, symbols: readonly unknown[]): void {
    for (let row = 0; row < 4; row += 1) {
      this.#cells[cellIndex(reel, row)]!.setSymbol(symbols[row]!);
    }
  }

  #assertCell(cell: WizardCraftReelCell): void {
    this.#assertReel(cell.reel);
    if (!Number.isSafeInteger(cell.row) || cell.row < 0 || cell.row > 3) {
      throw new Error("WIZARD CRAFT winning cell row is invalid");
    }
  }

  #assertReel(reel: number): void {
    this.#assertAvailable();
    if (!Number.isSafeInteger(reel) || reel < 0 || reel > 4) {
      throw new Error("WIZARD CRAFT reel index is invalid");
    }
  }

  #assertAvailable(): void {
    if (this.#destroyed) {
      throw new Error("WIZARD CRAFT reel sprite view is destroyed");
    }
  }
}
