import type { ResumePlan } from "../../events/schema.js";
import {
  planClassicNineResume,
  type ClassicNineBoardSymbol,
  type ClassicNineEvent,
  type ClassicNineGameType,
} from "./events.js";

export interface ClassicNinePresentation {
  readonly board: readonly (readonly ClassicNineBoardSymbol[])[] | null;
  readonly highlightedCells: ReadonlySet<string>;
  readonly gameType: ClassicNineGameType;
  readonly freeSpin: number;
  readonly totalFreeSpins: number;
  readonly globalMultiplier: number;
  readonly totalWin: number;
  readonly finalWin: number | null;
  readonly capped: boolean;
  readonly nextEventIndex: number;
  readonly remaining: readonly ClassicNineEvent[];
  readonly complete: boolean;
}

function project(plan: ResumePlan<ClassicNineEvent>): ClassicNinePresentation {
  let board: ClassicNinePresentation["board"] = null;
  let gameType: ClassicNineGameType = "basegame";
  let freeSpin = 0;
  let totalFreeSpins = 0;
  let globalMultiplier = 1;
  let totalWin = 0;
  let finalWin: number | null = null;
  let capped = false;
  const highlightedCells = new Set<string>();

  for (const event of plan.completed) {
    if (event.type === "reveal") {
      board = event.payload.board;
      gameType = event.payload.gameType;
      highlightedCells.clear();
    } else if (event.type === "winInfo") {
      highlightedCells.clear();
      for (const win of event.payload.wins) {
        for (const position of win.positions) {
          highlightedCells.add(`${position.reel}:${position.row}`);
        }
      }
    } else if (event.type === "freeSpinTrigger") {
      totalFreeSpins = event.payload.totalFs;
    } else if (event.type === "freeSpinRetrigger") {
      totalFreeSpins = event.payload.totalFs;
    } else if (event.type === "updateFreeSpin") {
      freeSpin = event.payload.amount;
      totalFreeSpins = event.payload.total;
    } else if (event.type === "updateGlobalMult") {
      globalMultiplier = event.payload.globalMult;
    } else if (event.type === "setTotalWin") {
      totalWin = event.payload.amount;
    } else if (event.type === "finalWin") {
      finalWin = event.payload.amount;
      totalWin = event.payload.amount;
    } else if (event.type === "wincap") {
      finalWin = event.payload.amount;
      totalWin = event.payload.amount;
      capped = true;
    }
  }

  return {
    board,
    highlightedCells,
    gameType,
    freeSpin,
    totalFreeSpins,
    globalMultiplier,
    totalWin,
    finalWin,
    capped,
    nextEventIndex: plan.nextIndex,
    remaining: plan.remaining,
    complete: plan.remaining.length === 0,
  };
}

/** Projects validated presentation state without calculating an outcome. */
export function projectClassicNinePresentation(
  state: unknown,
  checkpoint: string | null,
): ClassicNinePresentation {
  return project(planClassicNineResume(state, checkpoint));
}
