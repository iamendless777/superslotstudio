import {
  createGameEventParser,
  InvalidGameEventError,
  planEventResume,
  type GameEventFor,
  type ResumePlan,
} from "../../events/schema.js";

export const CLASSIC_NINE_SYMBOLS = [
  "pulse",
  "prism",
  "orbit",
  "beacon",
  "nova",
  "crown",
  "core",
  "portal",
] as const;

export type ClassicNineSymbol = (typeof CLASSIC_NINE_SYMBOLS)[number];
export type ClassicNineGameType = "basegame" | "freegame";

export interface ClassicNineCell {
  readonly reel: number;
  readonly row: number;
}

export interface ClassicNineBoardSymbol {
  readonly name: ClassicNineSymbol;
  readonly wild?: true;
  readonly scatter?: true;
}

export interface ClassicNineReveal {
  readonly board: readonly (readonly ClassicNineBoardSymbol[])[];
  readonly gameType: ClassicNineGameType;
  readonly anticipation: readonly number[];
}

export interface ClassicNineWin {
  readonly symbol: ClassicNineSymbol;
  readonly kind: 3;
  readonly win: number;
  readonly positions: readonly ClassicNineCell[];
  readonly meta: {
    readonly lineIndex: number;
    readonly multiplier: number;
    readonly winWithoutMult: number;
    readonly globalMult: number;
  };
}

export interface ClassicNineWinInfo {
  readonly totalWin: number;
  readonly wins: readonly ClassicNineWin[];
}

export interface ClassicNineAmount {
  readonly amount: number;
}

export interface ClassicNineLevelAmount extends ClassicNineAmount {
  readonly winLevel: number;
}

export interface ClassicNineFeatureTrigger {
  readonly totalFs: number;
  readonly positions: readonly ClassicNineCell[];
}

export interface ClassicNineFreeSpinUpdate {
  readonly amount: number;
  readonly total: number;
}

export interface ClassicNineMultiplier {
  readonly globalMult: number;
}

export interface ClassicNineEnterBonus {
  readonly reason: "natural" | "bought";
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
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new InvalidGameEventError(path, `object keys ${wanted.join(", ")}`);
  }
}

function integer(
  value: unknown,
  path: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new InvalidGameEventError(
      path,
      `safe integer from ${minimum} to ${maximum}`,
    );
  }
  return value as number;
}

function cell(value: unknown, path: string): ClassicNineCell {
  const input = record(value, path);
  exactKeys(input, ["reel", "row"], path);
  return {
    reel: integer(input.reel, `${path}.reel`, 0, 2),
    row: integer(input.row, `${path}.row`, 0, 2),
  };
}

function cells(
  value: unknown,
  path: string,
  minimum = 1,
  maximum = 9,
): readonly ClassicNineCell[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new InvalidGameEventError(
      path,
      minimum === maximum ? `exactly ${minimum} cells` : `${minimum} to ${maximum} cells`,
    );
  }
  const seen = new Set<string>();
  return value.map((candidate, index) => {
    const result = cell(candidate, `${path}[${index}]`);
    const key = `${result.reel}:${result.row}`;
    if (seen.has(key)) {
      throw new InvalidGameEventError(path, `unique cells; duplicate ${key}`);
    }
    seen.add(key);
    return result;
  });
}

const symbolNames = new Set<string>(CLASSIC_NINE_SYMBOLS);

function boardSymbol(value: unknown, path: string): ClassicNineBoardSymbol {
  const input = record(value, path);
  if (typeof input.name !== "string" || !symbolNames.has(input.name)) {
    throw new InvalidGameEventError(`${path}.name`, "Signal Nine symbol");
  }
  const name = input.name as ClassicNineSymbol;
  const expected =
    name === "core"
      ? ["name", "wild"]
      : name === "portal"
        ? ["name", "scatter"]
        : ["name"];
  exactKeys(input, expected, path);
  if (name === "core" && input.wild !== true) {
    throw new InvalidGameEventError(`${path}.wild`, "true");
  }
  if (name === "portal" && input.scatter !== true) {
    throw new InvalidGameEventError(`${path}.scatter`, "true");
  }
  return {
    name,
    ...(name === "core" ? { wild: true as const } : {}),
    ...(name === "portal" ? { scatter: true as const } : {}),
  };
}

function reveal(value: unknown, path: string): ClassicNineReveal {
  const input = record(value, path);
  exactKeys(input, ["anticipation", "board", "gameType"], path);
  if (!Array.isArray(input.board) || input.board.length !== 3) {
    throw new InvalidGameEventError(`${path}.board`, "three reels");
  }
  const board = input.board.map((reel, reelIndex) => {
    if (!Array.isArray(reel) || reel.length !== 3) {
      throw new InvalidGameEventError(
        `${path}.board[${reelIndex}]`,
        "three symbols",
      );
    }
    return reel.map((symbol, rowIndex) =>
      boardSymbol(symbol, `${path}.board[${reelIndex}][${rowIndex}]`),
    );
  });
  if (
    input.gameType !== "basegame" &&
    input.gameType !== "freegame"
  ) {
    throw new InvalidGameEventError(
      `${path}.gameType`,
      "basegame or freegame",
    );
  }
  if (!Array.isArray(input.anticipation) || input.anticipation.length !== 3) {
    throw new InvalidGameEventError(
      `${path}.anticipation`,
      "three non-negative integers",
    );
  }
  return {
    board,
    gameType: input.gameType,
    anticipation: input.anticipation.map((amount, index) =>
      integer(amount, `${path}.anticipation[${index}]`, 0),
    ),
  };
}

function winInfo(value: unknown, path: string): ClassicNineWinInfo {
  const input = record(value, path);
  exactKeys(input, ["totalWin", "wins"], path);
  const totalWin = integer(input.totalWin, `${path}.totalWin`, 1);
  if (!Array.isArray(input.wins) || input.wins.length === 0 || input.wins.length > 5) {
    throw new InvalidGameEventError(`${path}.wins`, "one to five line wins");
  }
  const lineIndexes = new Set<number>();
  const wins = input.wins.map((value, index): ClassicNineWin => {
    const winPath = `${path}.wins[${index}]`;
    const win = record(value, winPath);
    exactKeys(win, ["kind", "meta", "positions", "symbol", "win"], winPath);
    if (
      typeof win.symbol !== "string" ||
      !symbolNames.has(win.symbol) ||
      win.symbol === "portal"
    ) {
      throw new InvalidGameEventError(
        `${winPath}.symbol`,
        "non-scatter Signal Nine symbol",
      );
    }
    if (win.kind !== 3) {
      throw new InvalidGameEventError(`${winPath}.kind`, "3");
    }
    const meta = record(win.meta, `${winPath}.meta`);
    exactKeys(
      meta,
      ["globalMult", "lineIndex", "multiplier", "winWithoutMult"],
      `${winPath}.meta`,
    );
    const lineIndex = integer(
      meta.lineIndex,
      `${winPath}.meta.lineIndex`,
      0,
      4,
    );
    if (lineIndexes.has(lineIndex)) {
      throw new InvalidGameEventError(
        `${path}.wins`,
        `unique line indexes; duplicate ${lineIndex}`,
      );
    }
    lineIndexes.add(lineIndex);
    return {
      symbol: win.symbol as ClassicNineSymbol,
      kind: 3,
      win: integer(win.win, `${winPath}.win`, 1),
      positions: cells(win.positions, `${winPath}.positions`, 3, 3),
      meta: {
        lineIndex,
        multiplier: integer(
          meta.multiplier,
          `${winPath}.meta.multiplier`,
          1,
        ),
        winWithoutMult: integer(
          meta.winWithoutMult,
          `${winPath}.meta.winWithoutMult`,
          1,
        ),
        globalMult: integer(
          meta.globalMult,
          `${winPath}.meta.globalMult`,
          1,
          9,
        ),
      },
    };
  });
  const summedWin = wins.reduce((sum, win) => sum + win.win, 0);
  if (!Number.isSafeInteger(summedWin) || summedWin !== totalWin) {
    throw new InvalidGameEventError(
      `${path}.totalWin`,
      "sum of line-win amounts",
    );
  }
  return { totalWin, wins };
}

function amount(value: unknown, path: string): ClassicNineAmount {
  const input = record(value, path);
  exactKeys(input, ["amount"], path);
  return { amount: integer(input.amount, `${path}.amount`, 0) };
}

function levelAmount(value: unknown, path: string): ClassicNineLevelAmount {
  const input = record(value, path);
  exactKeys(input, ["amount", "winLevel"], path);
  return {
    amount: integer(input.amount, `${path}.amount`, 0),
    winLevel: integer(input.winLevel, `${path}.winLevel`, 1, 10),
  };
}

function featureTrigger(
  value: unknown,
  path: string,
): ClassicNineFeatureTrigger {
  const input = record(value, path);
  exactKeys(input, ["positions", "totalFs"], path);
  return {
    totalFs: integer(input.totalFs, `${path}.totalFs`, 1),
    positions: cells(input.positions, `${path}.positions`, 3),
  };
}

function enterBonus(value: unknown, path: string): ClassicNineEnterBonus {
  const input = record(value, path);
  exactKeys(input, ["reason"], path);
  if (input.reason !== "natural" && input.reason !== "bought") {
    throw new InvalidGameEventError(
      `${path}.reason`,
      "natural or bought",
    );
  }
  return { reason: input.reason };
}

function updateFreeSpin(
  value: unknown,
  path: string,
): ClassicNineFreeSpinUpdate {
  const input = record(value, path);
  exactKeys(input, ["amount", "total"], path);
  const total = integer(input.total, `${path}.total`, 1);
  return {
    amount: integer(input.amount, `${path}.amount`, 1, total),
    total,
  };
}

function multiplier(value: unknown, path: string): ClassicNineMultiplier {
  const input = record(value, path);
  exactKeys(input, ["globalMult"], path);
  return {
    globalMult: integer(input.globalMult, `${path}.globalMult`, 1, 9),
  };
}

const validators = {
  reveal,
  winInfo,
  setWin: levelAmount,
  setTotalWin: amount,
  finalWin: amount,
  wincap: amount,
  freeSpinTrigger: featureTrigger,
  freeSpinRetrigger: featureTrigger,
  enterBonus,
  updateFreeSpin,
  updateGlobalMult: multiplier,
  freeSpinEnd: levelAmount,
} as const;

const parseEvent = createGameEventParser(validators);
export type ClassicNineEvent = GameEventFor<typeof validators>;

export function parseClassicNineBook(
  value: unknown,
): readonly ClassicNineEvent[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new InvalidGameEventError("events", "at least two events");
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
  if (!events.some((event) => event.type === "reveal")) {
    throw new InvalidGameEventError("events", "at least one reveal");
  }
  const terminal = events.at(-1);
  if (terminal?.type !== "finalWin") {
    throw new InvalidGameEventError(
      `events[${events.length - 1}].type`,
      "finalWin",
    );
  }
  if (events.slice(0, -1).some((event) => event.type === "finalWin")) {
    throw new InvalidGameEventError(
      "events",
      "exactly one terminal finalWin event",
    );
  }
  const capEvents = events.filter((event) => event.type === "wincap");
  if (capEvents.length > 1) {
    throw new InvalidGameEventError("events", "at most one wincap event");
  }
  if (
    capEvents[0] !== undefined &&
    capEvents[0].payload.amount !== terminal.payload.amount
  ) {
    throw new InvalidGameEventError(
      "events",
      "matching wincap and finalWin amounts",
    );
  }
  for (const [position, event] of events.entries()) {
    if (
      event.type === "winInfo" &&
      !events.slice(0, position).some((candidate) => candidate.type === "reveal")
    ) {
      throw new InvalidGameEventError(
        `events[${position}].type`,
        "winInfo after reveal",
      );
    }
  }
  return planEventResume(events, null).remaining;
}

export function planClassicNineResume(
  state: unknown,
  checkpoint: string | null,
): ResumePlan<ClassicNineEvent> {
  return planEventResume(parseClassicNineBook(state), checkpoint);
}
