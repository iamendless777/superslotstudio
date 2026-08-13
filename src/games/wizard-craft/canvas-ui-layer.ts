import type { WizardCraftPresentationBeat } from "./cues.js";
import type {
  WizardCraftClashAdvantage,
  WizardCraftMode,
  WizardCraftPersistence,
} from "./events.js";
import type { WizardCraftPixiLayer } from "./pixi-scene.js";
import type {
  WizardCraftRenderCommand,
  WizardCraftRuntimeState,
} from "./runtime.js";

const MODE_LABELS: Readonly<Record<WizardCraftMode, string>> = {
  baseBattle: "BASE BATTLE",
  runeSpark: "RUNE SPARK",
  siegeSigns: "SIEGE SIGNS",
  openGrimoire: "OPEN THE GRIMOIRE",
};

const TIER_LABELS = Object.freeze({
  1: "EMBER DUEL\nMULTIPLIER REELS",
  2: "ARCANE SIEGE\nSTICKY CHANCE",
  3: "CROWNFIRE CLASH\nSTICKY GUARANTEED",
} as const);

export interface WizardCraftCanvasUiMultiplier {
  readonly reel: number;
  readonly multiplier: number;
  readonly persistence: WizardCraftPersistence;
  readonly advantage: WizardCraftClashAdvantage;
}

export interface WizardCraftCanvasUiContribution {
  readonly reel: number;
  readonly multiplier: number;
}

export interface WizardCraftCanvasUiState {
  readonly mode: string;
  readonly tier: string | null;
  readonly spin: string | null;
  readonly spinWin: string;
  readonly totalWin: string;
  readonly finalWin: string | null;
  readonly multipliers: readonly WizardCraftCanvasUiMultiplier[];
  readonly maximumLocked: boolean;
}

export interface WizardCraftCanvasUiLayout {
  readonly compact: boolean;
  readonly primaryFontPixels: number;
  readonly secondaryFontPixels: number;
  readonly multiplierFontPixels: number;
}

export interface WizardCraftCanvasUiView {
  setState(state: WizardCraftCanvasUiState): void;
  setLayout(layout: WizardCraftCanvasUiLayout): void;
  animateTier(
    label: string,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  animateRetrigger(
    added: number,
    total: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  animateFeatureEnd(
    totalWin: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  animateVsBreakdown(
    contributions: readonly WizardCraftCanvasUiContribution[],
    total: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  animateSpinCounter(
    current: number,
    total: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  animateSpinWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  animateTotalWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  animateFinalWin(
    amount: number,
    maximum: boolean,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  cancelAnimations(): void;
  destroy(): void;
}

export function formatWizardCraftMultiplierAmount(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError("WIZARD CRAFT display amount must be a safe integer");
  }
  const value = amount / 100;
  return `${value.toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}×`;
}

export function createWizardCraftCanvasUiLayout(
  viewportWidth: number,
  viewportHeight: number,
): WizardCraftCanvasUiLayout {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    throw new RangeError("WIZARD CRAFT UI viewport must be positive");
  }
  const compact = viewportWidth < 720 || viewportHeight < 500;
  const scale = Math.min(viewportWidth / 1_920, viewportHeight / 1_080);
  return Object.freeze({
    compact,
    primaryFontPixels: Math.max(compact ? 20 : 24, Math.round(42 * scale)),
    secondaryFontPixels: Math.max(compact ? 14 : 16, Math.round(24 * scale)),
    multiplierFontPixels: Math.max(compact ? 18 : 18, Math.round(30 * scale)),
  });
}

function multiplierState(
  state: WizardCraftRuntimeState,
): readonly WizardCraftCanvasUiMultiplier[] {
  const active = new Map([...state.spinVsReels, ...state.stickyVsReels]);
  return Object.freeze(
    [...active.entries()]
      .sort(([left], [right]) => left - right)
      .map(([reel, value]) => Object.freeze({
        reel,
        multiplier: value.multiplier,
        persistence: value.persistence,
        advantage: value.advantage,
      })),
  );
}

function eventAmount(command: WizardCraftRenderCommand): number {
  const amount = command.event.amount;
  if (!Number.isSafeInteger(amount) || (amount as number) < 0) {
    throw new Error("WIZARD CRAFT UI beat requires a valid amount");
  }
  return amount as number;
}

export class WizardCraftCanvasUiLayer implements WizardCraftPixiLayer {
  readonly #view: WizardCraftCanvasUiView;

  constructor(view: WizardCraftCanvasUiView) {
    this.#view = view;
  }

  sync(state: WizardCraftRuntimeState): void {
    this.#view.setState(Object.freeze({
      mode: state.mode === null ? "READY" : MODE_LABELS[state.mode],
      tier: state.tier === null ? null : TIER_LABELS[state.tier],
      spin: state.tier === null
        ? null
        : `${state.freeSpin} / ${state.totalFreeSpins}`,
      spinWin: formatWizardCraftMultiplierAmount(state.spinWin),
      totalWin: formatWizardCraftMultiplierAmount(state.totalWin),
      finalWin: state.finalWin === null
        ? null
        : formatWizardCraftMultiplierAmount(state.finalWin),
      multipliers: multiplierState(state),
      maximumLocked: state.capped,
    }));
  }

  async play(
    beat: WizardCraftPresentationBeat,
    command: WizardCraftRenderCommand,
  ): Promise<void> {
    if (beat.channel !== "ui") {
      throw new Error(`Canvas UI layer cannot play ${beat.channel} beat`);
    }
    if (beat.id === "ui.tier-entry") {
      const featureTier = command.after.tier;
      if (featureTier === null) {
        throw new Error("WIZARD CRAFT tier entry requires an active tier");
      }
      await this.#view.animateTier(TIER_LABELS[featureTier], beat.motion);
      return;
    }
    if (beat.id === "ui.retrigger") {
      const added = command.after.totalFreeSpins -
        command.before.totalFreeSpins;
      if (added <= 0) {
        throw new Error("WIZARD CRAFT retrigger requires added feature spins");
      }
      await this.#view.animateRetrigger(
        added,
        command.after.totalFreeSpins,
        beat.motion,
      );
      return;
    }
    if (beat.id === "ui.feature-end") {
      await this.#view.animateFeatureEnd(command.after.totalWin, beat.motion);
      return;
    }
    if (beat.id === "win.vs-breakdown") {
      if (command.event.type !== "winInfo") {
        throw new Error("WIZARD CRAFT VS breakdown requires win information");
      }
      if (!Array.isArray(command.event.wins)) {
        throw new Error("WIZARD CRAFT VS breakdown requires authored wins");
      }
      const wins = command.event.wins as readonly {
        readonly multiplier: number;
        readonly contributingVsReels: readonly {
          readonly reel: number;
          readonly multiplier: number;
        }[];
      }[];
      const selected = [...wins]
        .filter((win) => win.contributingVsReels.length >= 2)
        .sort((left, right) =>
          right.contributingVsReels.length - left.contributingVsReels.length ||
          right.multiplier - left.multiplier
        )[0];
      if (selected === undefined) {
        throw new Error("WIZARD CRAFT VS breakdown requires multiple contributing reels");
      }
      await this.#view.animateVsBreakdown(
        selected.contributingVsReels,
        selected.multiplier,
        beat.motion,
      );
      return;
    }
    if (beat.id === "ui.spin-counter") {
      const current = command.event.amount;
      const total = command.event.total;
      if (
        !Number.isSafeInteger(current) ||
        !Number.isSafeInteger(total) ||
        (current as number) < 0 ||
        (total as number) < 0
      ) {
        throw new Error("WIZARD CRAFT spin counter requires valid progress");
      }
      await this.#view.animateSpinCounter(
        current as number,
        total as number,
        beat.motion,
      );
      return;
    }
    if (beat.id === "win.level") {
      await this.#view.animateSpinWin(eventAmount(command), beat.motion);
      return;
    }
    if (beat.id === "win.total-count") {
      await this.#view.animateTotalWin(eventAmount(command), beat.motion);
      return;
    }
    if (beat.id === "win.final-lock") {
      const amount = eventAmount(command);
      await this.#view.animateFinalWin(
        amount,
        amount === 2_500_000 || command.after.capped,
        beat.motion,
      );
      return;
    }
    throw new Error(`Unsupported WIZARD CRAFT canvas UI beat ${beat.id}`);
  }

  layout(viewportWidth: number, viewportHeight: number): void {
    this.#view.setLayout(
      createWizardCraftCanvasUiLayout(viewportWidth, viewportHeight),
    );
  }

  cancel(): void {
    this.#view.cancelAnimations();
  }

  destroy(): void {
    this.#view.destroy();
  }
}
