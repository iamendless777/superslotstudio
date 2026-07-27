import {
  createGameEventParser,
  InvalidGameEventError,
  planEventResume,
  type GameEventFor,
  type ResumePlan,
} from "../../events/schema.js";

export const CLASSIC_NINE_SYMBOLS = [
  "cherry",
  "lemon",
  "orange",
  "plum",
  "bell",
  "seven",
  "wild",
] as const;

export type ClassicNineSymbol = (typeof CLASSIC_NINE_SYMBOLS)[number];
export interface ClassicNineCell {
  readonly column: number;
  readonly row: number;
}
export interface ClassicNineReveal {
  readonly grid: readonly (readonly ClassicNineSymbol[])[];
}
export interface ClassicNineHighlight {
  readonly cells: readonly ClassicNineCell[];
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidGameEventError(path, "object");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  input: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(input).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, i) => key !== wanted[i])
  ) {
    throw new InvalidGameEventError(path, `object keys ${wanted.join(", ")}`);
  }
}

function reveal(value: unknown, path: string): ClassicNineReveal {
  const input = record(value, path);
  exactKeys(input, ["grid"], path);
  if (!Array.isArray(input.grid) || input.grid.length !== 3) {
    throw new InvalidGameEventError(`${path}.grid`, "three rows");
  }
  const symbols = new Set<string>(CLASSIC_NINE_SYMBOLS);
  const grid = input.grid.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== 3) {
      throw new InvalidGameEventError(
        `${path}.grid[${rowIndex}]`,
        "three symbols",
      );
    }
    return row.map((symbol, columnIndex) => {
      if (typeof symbol !== "string" || !symbols.has(symbol)) {
        throw new InvalidGameEventError(
          `${path}.grid[${rowIndex}][${columnIndex}]`,
          "registered Classic Nine symbol",
        );
      }
      return symbol as ClassicNineSymbol;
    });
  });
  return { grid };
}

function highlight(value: unknown, path: string): ClassicNineHighlight {
  const input = record(value, path);
  exactKeys(input, ["cells"], path);
  if (
    !Array.isArray(input.cells) ||
    input.cells.length === 0 ||
    input.cells.length > 9
  ) {
    throw new InvalidGameEventError(`${path}.cells`, "one to nine cells");
  }
  const seen = new Set<string>();
  const cells = input.cells.map((value, index) => {
    const cell = record(value, `${path}.cells[${index}]`);
    exactKeys(cell, ["column", "row"], `${path}.cells[${index}]`);
    if (
      !Number.isInteger(cell.column) ||
      (cell.column as number) < 0 ||
      (cell.column as number) > 2
    ) {
      throw new InvalidGameEventError(
        `${path}.cells[${index}].column`,
        "integer from 0 to 2",
      );
    }
    if (
      !Number.isInteger(cell.row) ||
      (cell.row as number) < 0 ||
      (cell.row as number) > 2
    ) {
      throw new InvalidGameEventError(
        `${path}.cells[${index}].row`,
        "integer from 0 to 2",
      );
    }
    const result = { column: cell.column as number, row: cell.row as number };
    const key = `${result.column}:${result.row}`;
    if (seen.has(key)) {
      throw new InvalidGameEventError(
        `${path}.cells`,
        `unique cells; duplicate ${key}`,
      );
    }
    seen.add(key);
    return result;
  });
  return { cells };
}

const validators = { reveal, highlight } as const;
const parseEvent = createGameEventParser(validators);
export type ClassicNineEvent = GameEventFor<typeof validators>;

export function parseClassicNineBook(
  value: unknown,
): readonly ClassicNineEvent[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidGameEventError("events", "non-empty event array");
  }
  const events = value.map((event, index) =>
    parseEvent(event, `events[${index}]`),
  );
  for (const [position, event] of events.entries()) {
    if (event.index !== position) {
      throw new InvalidGameEventError(
        `events[${position}].index`,
        `ordered contiguous index ${position}`,
      );
    }
  }
  const ordered = planEventResume(events, null).remaining;
  if (ordered[0]?.type !== "reveal") {
    throw new InvalidGameEventError("events[0].type", "reveal");
  }
  if (ordered.slice(1).some((event) => event.type !== "highlight")) {
    throw new InvalidGameEventError(
      "events",
      "one reveal followed only by highlights",
    );
  }
  return ordered;
}

export function planClassicNineResume(
  state: unknown,
  checkpoint: string | null,
): ResumePlan<ClassicNineEvent> {
  return planEventResume(parseClassicNineBook(state), checkpoint);
}
