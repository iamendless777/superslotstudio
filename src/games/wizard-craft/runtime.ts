import {
  planWizardCraftRgsCue,
  type WizardCraftCuePlan,
  type WizardCraftPlaybackProfile,
} from "./cues.js";
import type {
  WizardCraftClashAdvantage,
  WizardCraftGameType,
  WizardCraftMode,
  WizardCraftPersistence,
  WizardCraftTier,
} from "./events.js";
import type { WizardCraftRgsEvent } from "./official.js";

export interface WizardCraftRuntimeVsReel {
  readonly multiplier: number;
  readonly dragonMultiplier: number;
  readonly wizardMultiplier: number;
  readonly advantage: WizardCraftClashAdvantage;
  readonly persistence: WizardCraftPersistence;
}

export interface WizardCraftRuntimeState {
  readonly board: readonly (readonly unknown[])[] | null;
  readonly gameType: WizardCraftGameType;
  readonly mode: WizardCraftMode | null;
  readonly tier: WizardCraftTier | null;
  readonly freeSpin: number;
  readonly totalFreeSpins: number;
  readonly spinVsReels: ReadonlyMap<number, WizardCraftRuntimeVsReel>;
  readonly stickyVsReels: ReadonlyMap<number, WizardCraftRuntimeVsReel>;
  readonly highlightedCells: ReadonlySet<string>;
  readonly spinWin: number;
  readonly totalWin: number;
  readonly finalWin: number | null;
  readonly capped: boolean;
  readonly pendingAttack?: Readonly<{
    side: "dragon" | "wizard";
    targetReel: number;
    intensity: "quick" | "heavy";
  }> | null;
  readonly nextEventIndex: number;
}

export interface WizardCraftRenderCommand {
  readonly event: WizardCraftRgsEvent;
  readonly before: WizardCraftRuntimeState;
  readonly after: WizardCraftRuntimeState;
  readonly cue: WizardCraftCuePlan;
}

export interface WizardCraftLayeredRenderer {
  render(command: WizardCraftRenderCommand): void | Promise<void>;
}

export function createWizardCraftRuntimeState(): WizardCraftRuntimeState {
  return {
    board: null,
    gameType: "basegame",
    mode: null,
    tier: null,
    freeSpin: 0,
    totalFreeSpins: 0,
    spinVsReels: new Map(),
    stickyVsReels: new Map(),
    highlightedCells: new Set(),
    spinWin: 0,
    totalWin: 0,
    finalWin: null,
    capped: false,
    pendingAttack: null,
    nextEventIndex: 0,
  };
}

function numeric(event: WizardCraftRgsEvent, key: string): number {
  return event[key] as number;
}

export function applyWizardCraftRgsEvent(
  state: WizardCraftRuntimeState,
  event: WizardCraftRgsEvent,
): WizardCraftRuntimeState {
  const spinVsReels = new Map(state.spinVsReels);
  const stickyVsReels = new Map(state.stickyVsReels);
  const highlightedCells = new Set(state.highlightedCells);
  let next: WizardCraftRuntimeState = {
    ...state,
    spinVsReels,
    stickyVsReels,
    highlightedCells,
    nextEventIndex: event.index + 1,
  };

  if (event.type === "reveal") {
    highlightedCells.clear();
    next = {
      ...next,
      board: event.board as readonly (readonly unknown[])[],
      gameType: event.gameType as WizardCraftGameType,
      mode: event.mode as WizardCraftMode,
      spinWin: 0,
    };
  } else if (event.type === "prepareAttack") {
    next = {
      ...next,
      pendingAttack: {
        side: event.side as "dragon" | "wizard",
        targetReel: numeric(event, "targetReel"),
        intensity: event.intensity as "quick" | "heavy",
      },
    };
  } else if (event.type === "freeSpinTrigger" || event.type === "startDuel") {
    if (event.type === "startDuel") {
      spinVsReels.clear();
      stickyVsReels.clear();
    }
    next = {
      ...next,
      tier: numeric(event, "tier") as WizardCraftTier,
      totalFreeSpins: numeric(event, "totalFs"),
    };
  } else if (event.type === "updateFreeSpin") {
    next = {
      ...next,
      freeSpin: numeric(event, "amount"),
      totalFreeSpins: numeric(event, "total"),
    };
  } else if (event.type === "freeSpinRetrigger") {
    next = {
      ...next,
      totalFreeSpins: numeric(event, "totalFs"),
    };
  } else if (event.type === "expandVsReel") {
    const reel = numeric(event, "reel");
    const value: WizardCraftRuntimeVsReel = {
      multiplier: numeric(event, "appliedMultiplier"),
      dragonMultiplier: numeric(event, "dragonMultiplier"),
      wizardMultiplier: numeric(event, "wizardMultiplier"),
      advantage: event.advantage as WizardCraftClashAdvantage,
      persistence: event.persistence as WizardCraftPersistence,
    };
    (value.persistence === "sticky" ? stickyVsReels : spinVsReels).set(reel, value);
    next = { ...next, pendingAttack: null };
  } else if (event.type === "upgradeStickyReel") {
    stickyVsReels.set(numeric(event, "reel"), {
      multiplier: numeric(event, "appliedMultiplier"),
      dragonMultiplier: numeric(event, "dragonMultiplier"),
      wizardMultiplier: numeric(event, "wizardMultiplier"),
      advantage: event.advantage as WizardCraftClashAdvantage,
      persistence: "sticky",
    });
  } else if (event.type === "blockAttack") {
    next = { ...next, pendingAttack: null };
  } else if (event.type === "clearSpinReels") {
    spinVsReels.clear();
  } else if (event.type === "winInfo") {
    highlightedCells.clear();
    for (const item of event.wins as Array<Record<string, unknown>>) {
      for (const position of item.positions as Array<Record<string, number>>) {
        highlightedCells.add(`${position.reel}:${position.row}`);
      }
    }
    next = { ...next, spinWin: numeric(event, "totalWin") };
  } else if (event.type === "setWin") {
    next = { ...next, spinWin: numeric(event, "amount") };
  } else if (event.type === "setTotalWin") {
    next = { ...next, totalWin: numeric(event, "amount") };
  } else if (event.type === "wincap") {
    const amount = numeric(event, "amount");
    next = { ...next, totalWin: amount, finalWin: amount, capped: true };
  } else if (event.type === "finalWin") {
    const amount = numeric(event, "amount");
    next = { ...next, totalWin: amount, finalWin: amount };
  }
  return next;
}

export function projectWizardCraftRgsRuntime(
  events: readonly WizardCraftRgsEvent[],
  nextIndex: number,
): WizardCraftRuntimeState {
  let state = createWizardCraftRuntimeState();
  for (let index = 0; index < nextIndex; index += 1) {
    const event = events[index];
    if (event === undefined) throw new Error(`Missing WIZARD CRAFT event ${index}`);
    state = applyWizardCraftRgsEvent(state, event);
  }
  return state;
}

export class WizardCraftLayeredPresenter {
  readonly #renderer: WizardCraftLayeredRenderer;
  readonly #profile: WizardCraftPlaybackProfile;
  #state: WizardCraftRuntimeState;

  constructor(
    renderer: WizardCraftLayeredRenderer,
    profile: WizardCraftPlaybackProfile = "normal",
    initialState: WizardCraftRuntimeState = createWizardCraftRuntimeState(),
  ) {
    this.#renderer = renderer;
    this.#profile = profile;
    this.#state = initialState;
  }

  get state(): WizardCraftRuntimeState {
    return this.#state;
  }

  async present(event: WizardCraftRgsEvent): Promise<void> {
    if (event.index !== this.#state.nextEventIndex) {
      throw new Error(`Expected WIZARD CRAFT event ${this.#state.nextEventIndex}`);
    }
    const after = applyWizardCraftRgsEvent(this.#state, event);
    const command = {
      event,
      before: this.#state,
      after,
      cue: planWizardCraftRgsCue(event, this.#profile),
    };
    await this.#renderer.render(command);
    this.#state = after;
  }
}
