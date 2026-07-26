import type { ResumePlan } from "../../events/schema.js";
import {
  planClassicNineResume,
  type ClassicNineEvent,
  type ClassicNineSymbol,
} from "./events.js";

export interface ClassicNinePresentation {
  readonly grid: readonly (readonly ClassicNineSymbol[])[] | null;
  readonly highlightedCells: ReadonlySet<string>;
  readonly nextEventIndex: number;
  readonly remaining: readonly ClassicNineEvent[];
  readonly complete: boolean;
}

function project(plan: ResumePlan<ClassicNineEvent>): ClassicNinePresentation {
  let grid: ClassicNinePresentation["grid"] = null;
  const highlightedCells = new Set<string>();
  for (const event of plan.completed) {
    if (event.type === "reveal") grid = event.payload.grid;
    if (event.type === "highlight") {
      for (const cell of event.payload.cells) {
        highlightedCells.add(`${cell.column}:${cell.row}`);
      }
    }
  }
  return {
    grid,
    highlightedCells,
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
