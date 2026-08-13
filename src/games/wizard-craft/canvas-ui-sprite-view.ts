import {
  formatWizardCraftMultiplierAmount,
  type WizardCraftCanvasUiLayout,
  type WizardCraftCanvasUiContribution,
  type WizardCraftCanvasUiMultiplier,
  type WizardCraftCanvasUiState,
  type WizardCraftCanvasUiView,
} from "./canvas-ui-layer.js";
import type { WizardCraftPresentationBeat } from "./cues.js";

export interface WizardCraftCanvasUiSprite {
  visible: boolean;
  alpha: number;
}

export interface WizardCraftCanvasTextView {
  text: string;
  visible: boolean;
  alpha: number;
  fontSize: number;
  y: number;
  destroy(): void;
}

export interface WizardCraftCanvasMultiplierView {
  setState(state: WizardCraftCanvasUiMultiplier | null): void;
  setFontSize(pixels: number): void;
  setEmphasized?(emphasized: boolean, animated?: boolean): void;
  destroy(): void;
}

export interface WizardCraftCanvasUiTextViews {
  readonly mode: WizardCraftCanvasTextView;
  readonly tier: WizardCraftCanvasTextView;
  readonly spin: WizardCraftCanvasTextView;
  readonly spinWin: WizardCraftCanvasTextView;
  readonly totalWin: WizardCraftCanvasTextView;
  readonly finalWin: WizardCraftCanvasTextView;
  readonly maximum: WizardCraftCanvasTextView;
}

export interface WizardCraftCanvasUiAnimationClock {
  sleep(milliseconds: number): Promise<void>;
}

export interface WizardCraftCanvasUiSpriteViewOptions {
  readonly text: WizardCraftCanvasUiTextViews;
  readonly multipliers: readonly WizardCraftCanvasMultiplierView[];
  readonly clock?: WizardCraftCanvasUiAnimationClock;
}

type Counter = "spin" | "spinWin" | "totalWin" | "finalWin";

function steps(motion: WizardCraftPresentationBeat["motion"], maximum = false): number {
  if (motion === "none") return 1;
  if (motion === "subtle") return maximum ? 10 : 6;
  return maximum ? 20 : 12;
}

export class WizardCraftCanvasUiSpriteView implements WizardCraftCanvasUiView {
  readonly #text: WizardCraftCanvasUiTextViews;
  readonly #multipliers: readonly WizardCraftCanvasMultiplierView[];
  readonly #clock: WizardCraftCanvasUiAnimationClock;
  readonly #epochs: Record<Counter, number> = {
    spin: 0,
    spinWin: 0,
    totalWin: 0,
    finalWin: 0,
  };
  #vsEpoch = 0;
  #vsRestore: ((animated: boolean) => void) | null = null;
  #destroyed = false;

  constructor(options: WizardCraftCanvasUiSpriteViewOptions) {
    if (options.multipliers.length !== 5) {
      throw new Error("WIZARD CRAFT canvas UI requires five multiplier views");
    }
    this.#text = options.text;
    this.#multipliers = options.multipliers;
    this.#clock = options.clock ?? {
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
    };
  }

  setState(state: WizardCraftCanvasUiState): void {
    this.#assertAvailable();
    this.#setText(this.#text.mode, state.mode);
    this.#setText(this.#text.tier, state.tier);
    this.#setText(this.#text.spin, state.spin);
    this.#setText(this.#text.spinWin, state.spinWin);
    this.#setText(this.#text.totalWin, state.totalWin);
    this.#setText(this.#text.finalWin, state.finalWin);
    this.#setText(
      this.#text.maximum,
      state.maximumLocked ? "MAXIMUM 25,000×" : null,
    );

    const byReel = new Map(
      state.multipliers.map((multiplier) => [multiplier.reel, multiplier]),
    );
    for (let reel = 0; reel < 5; reel += 1) {
      this.#multipliers[reel]!.setState(byReel.get(reel) ?? null);
    }
  }

  setLayout(layout: WizardCraftCanvasUiLayout): void {
    this.#assertAvailable();
    this.#text.mode.fontSize = layout.secondaryFontPixels;
    this.#text.tier.fontSize = layout.primaryFontPixels;
    this.#text.spin.fontSize = layout.secondaryFontPixels;
    this.#text.spinWin.fontSize = layout.primaryFontPixels;
    this.#text.totalWin.fontSize = layout.primaryFontPixels;
    this.#text.finalWin.fontSize = layout.primaryFontPixels;
    this.#text.maximum.fontSize = layout.primaryFontPixels;
    for (const multiplier of this.#multipliers) {
      multiplier.setFontSize(layout.multiplierFontPixels);
    }
  }

  async animateTier(
    label: string,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    this.#setText(this.#text.tier, label);
    this.#text.tier.alpha = motion === "none" ? 1 : 0.72;
    if (motion !== "none") {
      await this.#clock.sleep(motion === "subtle" ? 100 : 200);
    }
    if (this.#destroyed) return;
    this.#text.tier.alpha = 1;
  }

  async animateRetrigger(
    added: number,
    total: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    this.#setText(this.#text.tier, `RETRIGGER\n+${added} SPINS · ${total} TOTAL`);
    this.#text.tier.alpha = motion === "none" ? 1 : 0.78;
    if (motion !== "none") {
      await this.#clock.sleep(motion === "subtle" ? 130 : 260);
    }
    if (this.#destroyed) return;
    this.#text.tier.alpha = 1;
  }

  async animateVsBreakdown(
    contributions: readonly WizardCraftCanvasUiContribution[],
    total: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    if (
      contributions.length < 2 ||
      contributions.some((item) =>
        !Number.isSafeInteger(item.reel) || item.reel < 0 || item.reel > 4 ||
        !Number.isSafeInteger(item.multiplier) || item.multiplier < 1
      ) ||
      new Set(contributions.map((item) => item.reel)).size !== contributions.length
    ) {
      throw new RangeError("WIZARD CRAFT VS breakdown requires contributing values");
    }
    const values = contributions.map((item) => item.multiplier);
    if (values.reduce((sum, value) => sum + value, 0) !== total) {
      throw new RangeError("WIZARD CRAFT VS breakdown total must equal its values");
    }
    this.#restoreVsBreakdown(false);
    const epoch = ++this.#vsEpoch;
    const equation = `VS WAY ${values.map((value) => `${value}×`).join(" + ")} = ${total}×`;
    const originalText = this.#text.tier.text;
    const originalVisible = this.#text.tier.visible;
    const originalAlpha = this.#text.tier.alpha;
    const originalFontSize = this.#text.tier.fontSize;
    const originalY = this.#text.tier.y;
    this.#vsRestore = (animated) => {
      for (const multiplier of this.#multipliers) {
        multiplier.setEmphasized?.(false, animated);
      }
      this.#text.tier.text = originalText;
      this.#text.tier.visible = originalVisible;
      this.#text.tier.alpha = originalAlpha;
      this.#text.tier.fontSize = originalFontSize;
      this.#text.tier.y = originalY;
      this.#vsRestore = null;
    };
    const contributingReels = new Set(contributions.map((item) => item.reel));
    for (let reel = 0; reel < 5; reel += 1) {
      this.#multipliers[reel]!.setEmphasized?.(
        contributingReels.has(reel),
        motion !== "none",
      );
    }
    const fittedFontSize = Math.max(
      12,
      Math.min(originalFontSize, Math.floor(560 / (equation.length * 0.62))),
    );
    this.#text.tier.fontSize = fittedFontSize;
    this.#text.tier.y = 88;
    this.#setText(this.#text.tier, equation);
    this.#text.tier.alpha = motion === "none" ? 1 : 0.78;
    // Reduced motion keeps one static, readable frame instead of collapsing
    // the explanation into an unpaintable same-turn state change.
    await this.#clock.sleep(
      motion === "none" ? 180 : motion === "subtle" ? 150 : 300,
    );
    if (this.#destroyed || epoch !== this.#vsEpoch) return;
    this.#restoreVsBreakdown(motion !== "none");
  }

  async animateFeatureEnd(
    totalWin: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    this.#setText(
      this.#text.tier,
      `DUEL COMPLETE\n${formatWizardCraftMultiplierAmount(totalWin)}`,
    );
    this.#text.tier.alpha = motion === "none" ? 1 : 0.78;
    if (motion !== "none") {
      await this.#clock.sleep(motion === "subtle" ? 160 : 320);
    }
    if (this.#destroyed) return;
    this.#text.tier.alpha = 1;
  }

  async animateSpinCounter(
    current: number,
    total: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    const epoch = ++this.#epochs.spin;
    this.#setText(this.#text.spin, `${current} / ${total}`);
    this.#text.spin.alpha = motion === "none" ? 1 : 0.72;
    if (motion !== "none") await this.#clock.sleep(motion === "subtle" ? 80 : 160);
    if (this.#destroyed || epoch !== this.#epochs.spin) return;
    this.#text.spin.alpha = 1;
  }

  animateSpinWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    return this.#count("spinWin", this.#text.spinWin, amount, false, motion);
  }

  animateTotalWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    return this.#count("totalWin", this.#text.totalWin, amount, false, motion);
  }

  animateFinalWin(
    amount: number,
    maximum: boolean,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#setText(
      this.#text.maximum,
      maximum ? "MAXIMUM 25,000×" : null,
    );
    return this.#count("finalWin", this.#text.finalWin, amount, maximum, motion);
  }

  cancelAnimations(): void {
    if (this.#destroyed) return;
    for (const counter of Object.keys(this.#epochs) as Counter[]) {
      this.#epochs[counter] += 1;
    }
    this.#vsEpoch += 1;
    this.#restoreVsBreakdown(false);
    for (const view of Object.values(this.#text)) view.alpha = 1;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#vsEpoch += 1;
    this.#restoreVsBreakdown(false);
    for (const counter of Object.keys(this.#epochs) as Counter[]) {
      this.#epochs[counter] += 1;
    }
    for (const view of Object.values(this.#text)) view.destroy();
    for (const multiplier of this.#multipliers) multiplier.destroy();
  }

  async #count(
    counter: Exclude<Counter, "spin">,
    view: WizardCraftCanvasTextView,
    amount: number,
    maximum: boolean,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new RangeError("WIZARD CRAFT UI count amount is invalid");
    }
    const epoch = ++this.#epochs[counter];
    const countSteps = steps(motion, maximum);
    for (let step = 1; step <= countSteps; step += 1) {
      const progress = step / countSteps;
      const eased = 1 - Math.pow(1 - progress, 3);
      const displayed = step === countSteps
        ? amount
        : Math.floor(amount * eased);
      this.#setText(view, formatWizardCraftMultiplierAmount(displayed));
      view.alpha = 0.82 + progress * 0.18;
      if (step < countSteps) await this.#clock.sleep(33);
      if (this.#destroyed || epoch !== this.#epochs[counter]) return;
    }
    view.alpha = 1;
  }

  #setText(view: WizardCraftCanvasTextView, value: string | null): void {
    view.text = value ?? "";
    view.visible = value !== null;
  }

  #restoreVsBreakdown(animated: boolean): void {
    this.#vsRestore?.(animated);
  }

  #assertAvailable(): void {
    if (this.#destroyed) {
      throw new Error("WIZARD CRAFT canvas UI sprite view is destroyed");
    }
  }
}
