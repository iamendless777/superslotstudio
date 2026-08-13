import type { ResumePlan } from "../../events/schema.js";
import {
  planWizardCraftResume,
  type WizardCraftBoardSymbol,
  type WizardCraftClashAdvantage,
  type WizardCraftEvent,
  type WizardCraftGameType,
  type WizardCraftMode,
  type WizardCraftSide,
  type WizardCraftTier,
} from "./events.js";

export interface WizardCraftPresentedVsReel {
  readonly multiplier: number;
  readonly dragonMultiplier: number;
  readonly wizardMultiplier: number;
  readonly advantage: WizardCraftClashAdvantage;
}

export interface WizardCraftPresentation {
  readonly board: readonly (readonly WizardCraftBoardSymbol[])[] | null;
  readonly gameType: WizardCraftGameType;
  readonly mode: WizardCraftMode | null;
  readonly tier: WizardCraftTier | null;
  readonly totalFreeSpins: number;
  readonly freeSpinsRevealed: number;
  readonly spinVsReels: ReadonlyMap<number, WizardCraftPresentedVsReel>;
  readonly stickyVsReels: ReadonlyMap<number, WizardCraftPresentedVsReel>;
  readonly pendingAttack: { readonly side: WizardCraftSide; readonly targetReel: number } | null;
  readonly lastBlock: { readonly attacker: WizardCraftSide; readonly targetReel: number } | null;
  readonly highlightedCells: ReadonlySet<string>;
  readonly totalWin: number;
  readonly finalWin: number | null;
  readonly capped: boolean;
  readonly nextEventIndex: number;
  readonly remaining: readonly WizardCraftEvent[];
  readonly complete: boolean;
}

function project(plan: ResumePlan<WizardCraftEvent>): WizardCraftPresentation {
  let board: WizardCraftPresentation["board"] = null;
  let gameType: WizardCraftGameType = "basegame";
  let mode: WizardCraftMode | null = null;
  let tier: WizardCraftTier | null = null;
  let totalFreeSpins = 0;
  let freeSpinsRevealed = 0;
  let pendingAttack: WizardCraftPresentation["pendingAttack"] = null;
  let lastBlock: WizardCraftPresentation["lastBlock"] = null;
  let totalWin = 0;
  let finalWin: number | null = null;
  let capped = false;
  const spinVsReels = new Map<number, WizardCraftPresentedVsReel>();
  const stickyVsReels = new Map<number, WizardCraftPresentedVsReel>();
  const highlightedCells = new Set<string>();

  for (const event of plan.completed) {
    if (event.type === "reveal") {
      board = event.payload.board;
      gameType = event.payload.gameType;
      mode = event.payload.mode;
      if (gameType === "freegame") freeSpinsRevealed += 1;
      highlightedCells.clear();
    } else if (event.type === "freeSpinTrigger") {
      tier = event.payload.tier;
      totalFreeSpins = event.payload.totalFs;
    } else if (event.type === "startDuel") {
      tier = event.payload.tier;
      totalFreeSpins = event.payload.totalFs;
      spinVsReels.clear();
      stickyVsReels.clear();
    } else if (event.type === "prepareAttack") {
      lastBlock = null;
      pendingAttack = { side: event.payload.side, targetReel: event.payload.targetReel };
    } else if (event.type === "expandVsReel") {
      lastBlock = null;
      const presented = {
        multiplier: event.payload.appliedMultiplier,
        dragonMultiplier: event.payload.dragonMultiplier,
        wizardMultiplier: event.payload.wizardMultiplier,
        advantage: event.payload.advantage,
      };
      (event.payload.persistence === "sticky" ? stickyVsReels : spinVsReels)
        .set(event.payload.reel, presented);
      pendingAttack = null;
    } else if (event.type === "upgradeStickyReel") {
      stickyVsReels.set(event.payload.reel, {
        multiplier: event.payload.appliedMultiplier,
        dragonMultiplier: event.payload.dragonMultiplier,
        wizardMultiplier: event.payload.wizardMultiplier,
        advantage: event.payload.advantage,
      });
    } else if (event.type === "blockAttack") {
      lastBlock = { attacker: event.payload.attacker, targetReel: event.payload.targetReel };
      pendingAttack = null;
    } else if (event.type === "clearSpinReels") {
      spinVsReels.clear();
    } else if (event.type === "winInfo") {
      highlightedCells.clear();
      event.payload.wins.forEach((win) => win.positions.forEach((position) => {
        highlightedCells.add(`${position.reel}:${position.row}`);
      }));
    } else if (event.type === "setTotalWin") {
      totalWin = event.payload.amount;
    } else if (event.type === "wincap") {
      totalWin = event.payload.amount;
      finalWin = event.payload.amount;
      capped = true;
    } else if (event.type === "finalWin") {
      totalWin = event.payload.amount;
      finalWin = event.payload.amount;
    }
  }

  return {
    board, gameType, mode, tier, totalFreeSpins, freeSpinsRevealed,
    spinVsReels, stickyVsReels, pendingAttack, lastBlock, highlightedCells,
    totalWin, finalWin, capped, nextEventIndex: plan.nextIndex,
    remaining: plan.remaining, complete: plan.remaining.length === 0,
  };
}

/** Projects validated WIZARD CRAFT state without calculating an outcome. */
export function projectWizardCraftPresentation(
  state: unknown,
  checkpoint: string | null,
): WizardCraftPresentation {
  return project(planWizardCraftResume(state, checkpoint));
}
