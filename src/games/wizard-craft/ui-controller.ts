import type { RgsAmount } from "../../domain/money.js";
import type { PlayRequest } from "../../domain/rgs.js";
import type { RecoveryState } from "../../recovery/machine.js";
import {
  WIZARD_CRAFT_MODES,
  type WizardCraftMode,
} from "./events.js";
import type { WizardCraftRgsEvent } from "./official.js";
import {
  getWizardCraftRuntimePolicy,
  isWizardCraftModeAvailable,
  type WizardCraftSpeed,
} from "./policy.js";
import { getWizardCraftUiState, type WizardCraftUiState } from "./ui-state.js";

const MODE_COSTS: Readonly<Record<WizardCraftMode, number>> = {
  baseBattle: 1,
  runeSpark: 3,
  siegeSigns: 10,
  openGrimoire: 100,
};

export interface WizardCraftUiSession {
  readonly state: RecoveryState<readonly WizardCraftRgsEvent[]>;
  start(): Promise<void>;
  placeBet(
    request: PlayRequest & { readonly mode: WizardCraftMode },
  ): Promise<void>;
  subscribe(
    listener: (
      state: RecoveryState<readonly WizardCraftRgsEvent[]>,
    ) => void,
  ): () => void;
}

export interface WizardCraftModeControl {
  readonly id: WizardCraftMode;
  readonly cost: number;
  readonly available: boolean;
}

export interface WizardCraftControlState {
  readonly ui: WizardCraftUiState;
  readonly amountOptions: readonly RgsAmount[];
  readonly selectedAmount: RgsAmount | null;
  readonly modes: readonly WizardCraftModeControl[];
  readonly selectedMode: WizardCraftMode;
  readonly speeds: readonly WizardCraftSpeed[];
  readonly selectedSpeed: WizardCraftSpeed;
  readonly autoplayConfirmation: number | null;
}

export class WizardCraftUiController {
  readonly #session: WizardCraftUiSession;
  readonly #listeners = new Set<(state: WizardCraftControlState) => void>();
  readonly #unsubscribe: () => void;
  #selectedAmount: RgsAmount | null = null;
  #selectedMode: WizardCraftMode = "baseBattle";
  #selectedSpeed: WizardCraftSpeed = "normal";
  #autoplayConfirmation: number | null = null;

  constructor(session: WizardCraftUiSession) {
    this.#session = session;
    this.#unsubscribe = session.subscribe((state) => {
      if ("session" in state) {
        const { config, jurisdiction } = state.session;
        if (
          this.#selectedAmount === null ||
          !config.betLevels.includes(this.#selectedAmount)
        ) {
          this.#selectedAmount = config.defaultBetLevel;
        }
        const policy = getWizardCraftRuntimePolicy(jurisdiction);
        if (!policy.availableSpeeds.includes(this.#selectedSpeed)) {
          this.#selectedSpeed = "normal";
        }
        if (!isWizardCraftModeAvailable(this.#selectedMode, policy)) {
          this.#selectedMode = "baseBattle";
        }
        if (!policy.autoplay) this.#autoplayConfirmation = null;
      }
      this.#notify();
    });
  }

  get state(): WizardCraftControlState {
    const recovery = this.#session.state;
    const ui = getWizardCraftUiState(recovery);
    const amountOptions = "session" in recovery
      ? recovery.session.config.betLevels
      : [];
    const modes = WIZARD_CRAFT_MODES.map((id) => Object.freeze({
      id,
      cost: MODE_COSTS[id],
      available: ui.policy === null
        ? id !== "openGrimoire"
        : isWizardCraftModeAvailable(id, ui.policy),
    }));
    return Object.freeze({
      ui,
      amountOptions,
      selectedAmount: this.#selectedAmount,
      modes: Object.freeze(modes),
      selectedMode: this.#selectedMode,
      speeds: ui.policy?.availableSpeeds ?? Object.freeze(["normal"] as const),
      selectedSpeed: this.#selectedSpeed,
      autoplayConfirmation: this.#autoplayConfirmation,
    });
  }

  start(): Promise<void> {
    return this.#session.start();
  }

  subscribe(listener: (state: WizardCraftControlState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return () => this.#listeners.delete(listener);
  }

  selectAmount(amount: RgsAmount): void {
    const state = this.state;
    if (!state.ui.canChangeAmount || !state.amountOptions.includes(amount)) {
      throw new RangeError("WIZARD CRAFT play amount is unavailable");
    }
    this.#selectedAmount = amount;
    this.#notify();
  }

  selectMode(mode: WizardCraftMode): void {
    const state = this.state;
    if (
      !state.ui.canChangeMode ||
      !state.modes.some((item) => item.id === mode && item.available)
    ) {
      throw new RangeError("WIZARD CRAFT mode is unavailable");
    }
    this.#selectedMode = mode;
    this.#notify();
  }

  selectSpeed(speed: WizardCraftSpeed): void {
    if (!this.state.speeds.includes(speed)) {
      throw new RangeError("WIZARD CRAFT speed is unavailable");
    }
    this.#selectedSpeed = speed;
    this.#notify();
  }

  async play(): Promise<void> {
    const state = this.state;
    if (!state.ui.canPlay || state.selectedAmount === null) {
      throw new Error("WIZARD CRAFT is not ready to play");
    }
    this.#autoplayConfirmation = null;
    await this.#session.placeBet({
      amount: state.selectedAmount,
      mode: state.selectedMode,
    });
  }

  async handleSpacebar(focusAllowsPlay: boolean): Promise<boolean> {
    const state = this.state;
    if (!focusAllowsPlay || state.ui.policy?.spacebar !== true || !state.ui.canPlay) {
      return false;
    }
    await this.play();
    return true;
  }

  requestAutoplay(spins: number): void {
    const state = this.state;
    if (
      state.ui.policy?.autoplay !== true ||
      !state.ui.canPlay ||
      !Number.isSafeInteger(spins) ||
      spins < 1 ||
      spins > 1_000
    ) {
      throw new RangeError("WIZARD CRAFT automatic play request is unavailable");
    }
    this.#autoplayConfirmation = spins;
    this.#notify();
  }

  cancelAutoplayConfirmation(): void {
    this.#autoplayConfirmation = null;
    this.#notify();
  }

  confirmAutoplay(): number {
    if (this.#autoplayConfirmation === null) {
      throw new Error("WIZARD CRAFT automatic play is not awaiting confirmation");
    }
    const spins = this.#autoplayConfirmation;
    this.#autoplayConfirmation = null;
    this.#notify();
    return spins;
  }

  dispose(): void {
    this.#unsubscribe();
    this.#listeners.clear();
  }

  #notify(): void {
    const state = this.state;
    for (const listener of [...this.#listeners]) listener(state);
  }
}
