import {
  CLASSIC_NINE_SYMBOLS,
  parseClassicNineBook,
  type ClassicNineCell,
  type ClassicNineEvent,
  type ClassicNineSymbol,
} from "../../src/games/classic-nine/events.js";

export const MULTIPLIER_MICROS_PER_ONE = 1_000_000;

declare const multiplierBrand: unique symbol;
export type MultiplierMicros = number & { readonly [multiplierBrand]: true };

export function multiplierMicros(value: number): MultiplierMicros {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Multiplier must be a non-negative safe integer");
  }
  return value as MultiplierMicros;
}

export type ClassicNineGrid = readonly [
  readonly [ClassicNineSymbol, ClassicNineSymbol, ClassicNineSymbol],
  readonly [ClassicNineSymbol, ClassicNineSymbol, ClassicNineSymbol],
  readonly [ClassicNineSymbol, ClassicNineSymbol, ClassicNineSymbol],
];

export type ClassicNinePayline = readonly [
  ClassicNineCell,
  ClassicNineCell,
  ClassicNineCell,
];

export interface ClassicNineMathDefinition {
  readonly id: string;
  readonly paylines: readonly ClassicNinePayline[];
  readonly triplePaytable: Readonly<
    Record<ClassicNineSymbol, MultiplierMicros>
  >;
}

export interface ClassicNineLineWin {
  readonly lineIndex: number;
  readonly symbol: ClassicNineSymbol;
  readonly cells: ClassicNinePayline;
  readonly multiplier: MultiplierMicros;
}

export interface ClassicNineEvaluation {
  readonly wins: readonly ClassicNineLineWin[];
  readonly totalMultiplier: MultiplierMicros;
}

function assertCell(cell: ClassicNineCell, path: string): void {
  if (
    !Number.isInteger(cell.reel) ||
    cell.reel < 0 ||
    cell.reel > 2 ||
    !Number.isInteger(cell.row) ||
    cell.row < 0 ||
    cell.row > 2
  ) {
    throw new RangeError(`${path} must reference a cell from 0 to 2`);
  }
}

export function validateClassicNineMathDefinition(
  definition: ClassicNineMathDefinition,
): void {
  if (definition.id.length === 0 || definition.paylines.length === 0) {
    throw new RangeError(
      "Math definition requires an id and at least one payline",
    );
  }
  for (const [lineIndex, line] of definition.paylines.entries()) {
    const seen = new Set<string>();
    for (const [cellIndex, cell] of line.entries()) {
      assertCell(cell, `paylines[${lineIndex}][${cellIndex}]`);
      const key = `${cell.reel}:${cell.row}`;
      if (seen.has(key))
        throw new RangeError(`Payline ${lineIndex} repeats ${key}`);
      seen.add(key);
    }
  }
  for (const symbol of CLASSIC_NINE_SYMBOLS) {
    multiplierMicros(definition.triplePaytable[symbol]);
  }
}

export function evaluateClassicNineGrid(
  definition: ClassicNineMathDefinition,
  grid: ClassicNineGrid,
): ClassicNineEvaluation {
  validateClassicNineMathDefinition(definition);
  const registered = new Set<string>(CLASSIC_NINE_SYMBOLS);
  if (
    grid.length !== 3 ||
    grid.some(
      (row) =>
        row.length !== 3 || row.some((symbol) => !registered.has(symbol)),
    )
  ) {
    throw new RangeError("Grid must contain three rows of registered symbols");
  }
  const wins: ClassicNineLineWin[] = [];
  let total = 0;
  for (const [lineIndex, cells] of definition.paylines.entries()) {
    const symbols = cells.map((cell) => {
      const row = grid[cell.row];
      const symbol = row?.[cell.reel];
      if (symbol === undefined)
        throw new RangeError("Payline references an invalid grid cell");
      return symbol;
    });
    const symbol = symbols[0];
    if (
      symbol !== undefined &&
      symbols.every((candidate) => candidate === symbol)
    ) {
      const multiplier = definition.triplePaytable[symbol];
      if (multiplier > 0) {
        total += multiplier;
        if (!Number.isSafeInteger(total))
          throw new RangeError("Total multiplier exceeds safe range");
        wins.push({ lineIndex, symbol, cells, multiplier });
      }
    }
  }
  return { wins, totalMultiplier: multiplierMicros(total) };
}

export function buildClassicNinePresentationBook(
  definition: ClassicNineMathDefinition,
  grid: ClassicNineGrid,
): readonly ClassicNineEvent[] {
  const evaluation = evaluateClassicNineGrid(definition, grid);
  const board = [0, 1, 2].map((reel) =>
    [0, 1, 2].map((row) => {
      const name = grid[row]![reel]!;
      return {
        name,
        ...(name === "core" ? { wild: true } : {}),
        ...(name === "portal" ? { scatter: true } : {}),
      };
    }),
  );
  const events: unknown[] = [{
    schemaVersion: 1,
    index: 0,
    type: "reveal",
    payload: {
      board,
      gameType: "basegame",
      anticipation: [0, 0, 0],
    },
  }];
  if (evaluation.wins.length > 0) {
    const wins = evaluation.wins.map((win) => {
      const amount = Math.floor(win.multiplier / 10_000);
      return {
        symbol: win.symbol,
        kind: 3,
        win: amount,
        positions: win.cells,
        meta: {
          lineIndex: win.lineIndex,
          multiplier: 1,
          winWithoutMult: amount,
          globalMult: 1,
        },
      };
    });
    events.push({
      schemaVersion: 1,
      index: 1,
      type: "winInfo",
      payload: {
        totalWin: wins.reduce((sum, win) => sum + win.win, 0),
        wins,
      },
    });
  }
  events.push({
    schemaVersion: 1,
    index: events.length,
    type: "finalWin",
    payload: { amount: Math.floor(evaluation.totalMultiplier / 10_000) },
  });
  return parseClassicNineBook(events);
}

export interface WeightedClassicNineGrid {
  readonly grid: ClassicNineGrid;
  readonly weight: number;
}

export interface ClassicNineBookAnalysis {
  readonly outcomeCount: number;
  readonly totalWeight: bigint;
  readonly hitWeight: bigint;
  readonly weightedMultiplierMicros: bigint;
  readonly returnRatio: {
    readonly numerator: bigint;
    readonly denominator: bigint;
  };
  readonly hitRatio: {
    readonly numerator: bigint;
    readonly denominator: bigint;
  };
  readonly maximumMultiplier: MultiplierMicros;
}

export interface ClassicNineMathReport {
  readonly schemaVersion: 1;
  readonly definitionId: string;
  readonly outcomeCount: number;
  readonly totalWeight: string;
  readonly hitWeight: string;
  readonly weightedMultiplierMicros: string;
  readonly returnRatio: readonly [numerator: string, denominator: string];
  readonly hitRatio: readonly [numerator: string, denominator: string];
  readonly returnDecimal: string;
  readonly hitDecimal: string;
  readonly maximumMultiplierMicros: number;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function reduceRatio(
  numerator: bigint,
  denominator: bigint,
): readonly [numerator: bigint, denominator: bigint] {
  if (denominator <= 0n)
    throw new RangeError("Ratio denominator must be positive");
  const divisor = greatestCommonDivisor(numerator, denominator);
  if (divisor === 0n) return [0n, 1n];
  return [numerator / divisor, denominator / divisor];
}

export function formatRatioDecimal(
  numerator: bigint,
  denominator: bigint,
  decimalPlaces = 6,
): string {
  if (numerator < 0n)
    throw new RangeError("Ratio numerator must be non-negative");
  if (denominator <= 0n)
    throw new RangeError("Ratio denominator must be positive");
  if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new RangeError("Decimal places must be a non-negative safe integer");
  }
  const whole = numerator / denominator;
  if (decimalPlaces === 0) return whole.toString();
  const scale = 10n ** BigInt(decimalPlaces);
  const fraction = ((numerator % denominator) * scale) / denominator;
  return `${whole}.${fraction.toString().padStart(decimalPlaces, "0")}`;
}

export function createClassicNineMathReport(
  definition: ClassicNineMathDefinition,
  books: readonly WeightedClassicNineGrid[],
  decimalPlaces = 6,
): ClassicNineMathReport {
  const analysis = analyzeClassicNineBooks(definition, books);
  const returnRatio = reduceRatio(
    analysis.returnRatio.numerator,
    analysis.returnRatio.denominator,
  );
  const hitRatio = reduceRatio(
    analysis.hitRatio.numerator,
    analysis.hitRatio.denominator,
  );
  return {
    schemaVersion: 1,
    definitionId: definition.id,
    outcomeCount: analysis.outcomeCount,
    totalWeight: analysis.totalWeight.toString(),
    hitWeight: analysis.hitWeight.toString(),
    weightedMultiplierMicros: analysis.weightedMultiplierMicros.toString(),
    returnRatio: [returnRatio[0].toString(), returnRatio[1].toString()],
    hitRatio: [hitRatio[0].toString(), hitRatio[1].toString()],
    returnDecimal: formatRatioDecimal(
      analysis.returnRatio.numerator,
      analysis.returnRatio.denominator,
      decimalPlaces,
    ),
    hitDecimal: formatRatioDecimal(
      analysis.hitRatio.numerator,
      analysis.hitRatio.denominator,
      decimalPlaces,
    ),
    maximumMultiplierMicros: analysis.maximumMultiplier,
  };
}

export function analyzeClassicNineBooks(
  definition: ClassicNineMathDefinition,
  books: readonly WeightedClassicNineGrid[],
): ClassicNineBookAnalysis {
  if (books.length === 0)
    throw new RangeError("At least one weighted book is required");
  let totalWeight = 0n;
  let hitWeight = 0n;
  let weightedMultiplierMicros = 0n;
  let maximumMultiplier = multiplierMicros(0);
  for (const book of books) {
    if (!Number.isSafeInteger(book.weight) || book.weight <= 0) {
      throw new RangeError("Book weight must be a positive safe integer");
    }
    const evaluation = evaluateClassicNineGrid(definition, book.grid);
    const weight = BigInt(book.weight);
    totalWeight += weight;
    weightedMultiplierMicros += weight * BigInt(evaluation.totalMultiplier);
    if (evaluation.totalMultiplier > 0) hitWeight += weight;
    if (evaluation.totalMultiplier > maximumMultiplier)
      maximumMultiplier = evaluation.totalMultiplier;
  }
  return {
    outcomeCount: books.length,
    totalWeight,
    hitWeight,
    weightedMultiplierMicros,
    returnRatio: {
      numerator: weightedMultiplierMicros,
      denominator: totalWeight * BigInt(MULTIPLIER_MICROS_PER_ONE),
    },
    hitRatio: { numerator: hitWeight, denominator: totalWeight },
    maximumMultiplier,
  };
}

export const CLASSIC_NINE_DRAFT_MATH: ClassicNineMathDefinition = {
  id: "signal-nine-working-v1",
  paylines: [
    [
      { reel: 0, row: 0 },
      { reel: 1, row: 0 },
      { reel: 2, row: 0 },
    ],
    [
      { reel: 0, row: 1 },
      { reel: 1, row: 1 },
      { reel: 2, row: 1 },
    ],
    [
      { reel: 0, row: 2 },
      { reel: 1, row: 2 },
      { reel: 2, row: 2 },
    ],
    [
      { reel: 0, row: 0 },
      { reel: 1, row: 1 },
      { reel: 2, row: 2 },
    ],
    [
      { reel: 0, row: 2 },
      { reel: 1, row: 1 },
      { reel: 2, row: 0 },
    ],
  ],
  triplePaytable: {
    pulse: multiplierMicros(500_000),
    prism: multiplierMicros(800_000),
    orbit: multiplierMicros(1_200_000),
    beacon: multiplierMicros(2_000_000),
    nova: multiplierMicros(4_000_000),
    crown: multiplierMicros(8_000_000),
    core: multiplierMicros(12_000_000),
    portal: multiplierMicros(0),
  },
};
