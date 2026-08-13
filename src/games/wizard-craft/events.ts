import {
  createGameEventParser,
  InvalidGameEventError,
  planEventResume,
  type GameEventFor,
  type ResumePlan,
} from "../../events/schema.js";

export const WIZARD_CRAFT_MAX_WIN = 25_000;
export const WIZARD_CRAFT_MAX_BOOK_AMOUNT = WIZARD_CRAFT_MAX_WIN * 100;

export const WIZARD_CRAFT_SYMBOLS = [
  "ember", "crystal", "potion", "scroll", "grimoire", "staff", "crown",
  "wizardSigil", "dragonSigil", "clashRune",
] as const;

export const WIZARD_CRAFT_MODES = [
  "baseBattle", "runeSpark", "siegeSigns", "openGrimoire",
] as const;

export type WizardCraftSymbol = (typeof WIZARD_CRAFT_SYMBOLS)[number];
export type WizardCraftMode = (typeof WIZARD_CRAFT_MODES)[number];
export type WizardCraftSide = "dragon" | "wizard";
export type WizardCraftClashAdvantage = "balanced" | WizardCraftSide;
export type WizardCraftTier = 1 | 2 | 3;
export type WizardCraftGameType = "basegame" | "freegame";
export type WizardCraftPersistence = "spin" | "sticky";

export interface WizardCraftCell {
  readonly reel: number;
  readonly row: number;
}

export interface WizardCraftBoardSymbol {
  readonly name: WizardCraftSymbol;
  readonly wild?: true;
  readonly scatter?: true;
}

export interface WizardCraftReveal {
  readonly board: readonly (readonly WizardCraftBoardSymbol[])[];
  readonly gameType: WizardCraftGameType;
  readonly mode: WizardCraftMode;
  readonly anticipation: readonly number[];
}

export interface WizardCraftFeatureTrigger {
  readonly tier: WizardCraftTier;
  readonly totalFs: number;
  readonly positions: readonly WizardCraftCell[];
}

export interface WizardCraftStartDuel {
  readonly tier: WizardCraftTier;
  readonly totalFs: number;
}

export interface WizardCraftPrepareAttack {
  readonly side: WizardCraftSide;
  readonly targetReel: number;
  readonly intensity: "quick" | "heavy";
}

export interface WizardCraftVsReel {
  readonly reel: number;
  readonly dragonMultiplier: number;
  readonly wizardMultiplier: number;
  readonly appliedMultiplier: number;
  readonly advantage: WizardCraftClashAdvantage;
}

export interface WizardCraftExpandVsReel extends WizardCraftVsReel {
  readonly persistence: WizardCraftPersistence;
}

export interface WizardCraftUpgradeStickyReel extends WizardCraftVsReel {
  readonly previousMultiplier: number;
}

export interface WizardCraftBlockAttack {
  readonly attacker: WizardCraftSide;
  readonly targetReel: number;
}

export interface WizardCraftContributingVsReel {
  readonly reel: number;
  readonly multiplier: number;
}

export interface WizardCraftWin {
  readonly symbol: WizardCraftSymbol;
  readonly win: number;
  readonly positions: readonly WizardCraftCell[];
  readonly multiplier: number;
  readonly contributingVsReels: readonly WizardCraftContributingVsReel[];
}

export interface WizardCraftWinInfo {
  readonly totalWin: number;
  readonly wins: readonly WizardCraftWin[];
}

export interface WizardCraftAmount {
  readonly amount: number;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidGameEventError(path, "object");
  }
  return value as Record<string, unknown>;
}

function exactKeys(input: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(input).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new InvalidGameEventError(path, `object keys ${wanted.join(", ")}`);
  }
}

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new InvalidGameEventError(path, `safe integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function tier(value: unknown, path: string): WizardCraftTier {
  return integer(value, path, 1, 3) as WizardCraftTier;
}

function side(value: unknown, path: string): WizardCraftSide {
  if (value !== "dragon" && value !== "wizard") {
    throw new InvalidGameEventError(path, "dragon or wizard");
  }
  return value;
}

function advantage(value: unknown, path: string): WizardCraftClashAdvantage {
  if (value !== "balanced" && value !== "dragon" && value !== "wizard") {
    throw new InvalidGameEventError(path, "balanced, dragon, or wizard");
  }
  return value;
}

function mode(value: unknown, path: string): WizardCraftMode {
  if (typeof value !== "string" || !(WIZARD_CRAFT_MODES as readonly string[]).includes(value)) {
    throw new InvalidGameEventError(path, "WIZARD CRAFT paid mode");
  }
  return value as WizardCraftMode;
}

const symbolNames = new Set<string>(WIZARD_CRAFT_SYMBOLS);

function boardSymbol(value: unknown, path: string): WizardCraftBoardSymbol {
  const input = record(value, path);
  if (typeof input.name !== "string" || !symbolNames.has(input.name)) {
    throw new InvalidGameEventError(`${path}.name`, "WIZARD CRAFT symbol");
  }
  const name = input.name as WizardCraftSymbol;
  const expected = name === "wizardSigil" || name === "dragonSigil"
    ? ["name", "wild"]
    : name === "clashRune" ? ["name", "scatter"] : ["name"];
  exactKeys(input, expected, path);
  if ((name === "wizardSigil" || name === "dragonSigil") && input.wild !== true) {
    throw new InvalidGameEventError(`${path}.wild`, "true");
  }
  if (name === "clashRune" && input.scatter !== true) {
    throw new InvalidGameEventError(`${path}.scatter`, "true");
  }
  return {
    name,
    ...(name === "wizardSigil" || name === "dragonSigil" ? { wild: true as const } : {}),
    ...(name === "clashRune" ? { scatter: true as const } : {}),
  };
}

function cell(value: unknown, path: string): WizardCraftCell {
  const input = record(value, path);
  exactKeys(input, ["reel", "row"], path);
  return {
    reel: integer(input.reel, `${path}.reel`, 0, 4),
    row: integer(input.row, `${path}.row`, 0, 3),
  };
}

function cells(value: unknown, path: string, minimum: number, maximum = 20): readonly WizardCraftCell[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new InvalidGameEventError(path, `${minimum} to ${maximum} unique cells`);
  }
  const seen = new Set<string>();
  return value.map((candidate, index) => {
    const result = cell(candidate, `${path}[${index}]`);
    const key = `${result.reel}:${result.row}`;
    if (seen.has(key)) throw new InvalidGameEventError(path, `unique cells; duplicate ${key}`);
    seen.add(key);
    return result;
  });
}

function reveal(value: unknown, path: string): WizardCraftReveal {
  const input = record(value, path);
  exactKeys(input, ["anticipation", "board", "gameType", "mode"], path);
  if (!Array.isArray(input.board) || input.board.length !== 5) {
    throw new InvalidGameEventError(`${path}.board`, "five reels");
  }
  const board = input.board.map((reel, reelIndex) => {
    if (!Array.isArray(reel) || reel.length !== 4) {
      throw new InvalidGameEventError(`${path}.board[${reelIndex}]`, "four symbols");
    }
    return reel.map((symbol, rowIndex) =>
      boardSymbol(symbol, `${path}.board[${reelIndex}][${rowIndex}]`));
  });
  if (input.gameType !== "basegame" && input.gameType !== "freegame") {
    throw new InvalidGameEventError(`${path}.gameType`, "basegame or freegame");
  }
  if (!Array.isArray(input.anticipation) || input.anticipation.length !== 5) {
    throw new InvalidGameEventError(`${path}.anticipation`, "five non-negative integers");
  }
  return {
    board,
    gameType: input.gameType,
    mode: mode(input.mode, `${path}.mode`),
    anticipation: input.anticipation.map((amount, index) =>
      integer(amount, `${path}.anticipation[${index}]`, 0, 3)),
  };
}

function featureTrigger(value: unknown, path: string): WizardCraftFeatureTrigger {
  const input = record(value, path);
  exactKeys(input, ["positions", "tier", "totalFs"], path);
  const selectedTier = tier(input.tier, `${path}.tier`);
  const positions = cells(input.positions, `${path}.positions`, 3, 5);
  if (positions.length !== selectedTier + 2) {
    throw new InvalidGameEventError(`${path}.positions`, `${selectedTier + 2} positions for tier ${selectedTier}`);
  }
  return { tier: selectedTier, totalFs: integer(input.totalFs, `${path}.totalFs`, 1, 100), positions };
}

function startDuel(value: unknown, path: string): WizardCraftStartDuel {
  const input = record(value, path);
  exactKeys(input, ["tier", "totalFs"], path);
  return {
    tier: tier(input.tier, `${path}.tier`),
    totalFs: integer(input.totalFs, `${path}.totalFs`, 1, 100),
  };
}

function prepareAttack(value: unknown, path: string): WizardCraftPrepareAttack {
  const input = record(value, path);
  exactKeys(input, ["intensity", "side", "targetReel"], path);
  if (input.intensity !== "quick" && input.intensity !== "heavy") {
    throw new InvalidGameEventError(`${path}.intensity`, "quick or heavy");
  }
  return {
    side: side(input.side, `${path}.side`),
    targetReel: integer(input.targetReel, `${path}.targetReel`, 0, 4),
    intensity: input.intensity,
  };
}

function vsReel(value: unknown, path: string, extraKeys: readonly string[]): WizardCraftVsReel {
  const input = record(value, path);
  exactKeys(input, [
    "advantage", "appliedMultiplier", "dragonMultiplier", "reel",
    "wizardMultiplier", ...extraKeys,
  ], path);
  const dragonMultiplier = integer(input.dragonMultiplier, `${path}.dragonMultiplier`, 1, 1_000);
  const wizardMultiplier = integer(input.wizardMultiplier, `${path}.wizardMultiplier`, 1, 1_000);
  const appliedMultiplier = integer(input.appliedMultiplier, `${path}.appliedMultiplier`, 1, 1_000);
  const resolvedAdvantage = advantage(input.advantage, `${path}.advantage`);
  const expected = resolvedAdvantage === "dragon"
    ? dragonMultiplier
    : resolvedAdvantage === "wizard" ? wizardMultiplier : dragonMultiplier;
  if (
    appliedMultiplier !== expected ||
    (resolvedAdvantage === "balanced" && dragonMultiplier !== wizardMultiplier)
  ) {
    throw new InvalidGameEventError(path, "applied multiplier matching the presentation advantage");
  }
  return {
    reel: integer(input.reel, `${path}.reel`, 0, 4),
    dragonMultiplier,
    wizardMultiplier,
    appliedMultiplier,
    advantage: resolvedAdvantage,
  };
}

function expandVsReel(value: unknown, path: string): WizardCraftExpandVsReel {
  const input = record(value, path);
  const parsed = vsReel(value, path, ["persistence"]);
  if (input.persistence !== "spin" && input.persistence !== "sticky") {
    throw new InvalidGameEventError(`${path}.persistence`, "spin or sticky");
  }
  return { ...parsed, persistence: input.persistence };
}

function upgradeStickyReel(value: unknown, path: string): WizardCraftUpgradeStickyReel {
  const input = record(value, path);
  const parsed = vsReel(value, path, ["previousMultiplier"]);
  return {
    ...parsed,
    previousMultiplier: integer(input.previousMultiplier, `${path}.previousMultiplier`, 1, 999),
  };
}

function blockAttack(value: unknown, path: string): WizardCraftBlockAttack {
  const input = record(value, path);
  exactKeys(input, ["attacker", "targetReel"], path);
  return {
    attacker: side(input.attacker, `${path}.attacker`),
    targetReel: integer(input.targetReel, `${path}.targetReel`, 0, 4),
  };
}

function clearSpinReels(value: unknown, path: string): Record<string, never> {
  const input = record(value, path);
  exactKeys(input, [], path);
  return {};
}

function contributingVsReels(value: unknown, path: string): readonly WizardCraftContributingVsReel[] {
  if (!Array.isArray(value) || value.length > 5) {
    throw new InvalidGameEventError(path, "zero to five contributing VS reels");
  }
  const seen = new Set<number>();
  return value.map((candidate, index) => {
    const itemPath = `${path}[${index}]`;
    const input = record(candidate, itemPath);
    exactKeys(input, ["multiplier", "reel"], itemPath);
    const reel = integer(input.reel, `${itemPath}.reel`, 0, 4);
    if (seen.has(reel)) throw new InvalidGameEventError(path, "unique contributing reel indexes");
    seen.add(reel);
    return {
      reel,
      multiplier: integer(input.multiplier, `${itemPath}.multiplier`, 1, 1_000),
    };
  });
}

function winInfo(value: unknown, path: string): WizardCraftWinInfo {
  const input = record(value, path);
  exactKeys(input, ["totalWin", "wins"], path);
  const totalWin = integer(input.totalWin, `${path}.totalWin`, 1, WIZARD_CRAFT_MAX_BOOK_AMOUNT);
  if (!Array.isArray(input.wins) || input.wins.length < 1 || input.wins.length > 20) {
    throw new InvalidGameEventError(`${path}.wins`, "one to twenty ways wins");
  }
  const wins = input.wins.map((candidate, index): WizardCraftWin => {
    const winPath = `${path}.wins[${index}]`;
    const win = record(candidate, winPath);
    exactKeys(win, ["contributingVsReels", "multiplier", "positions", "symbol", "win"], winPath);
    if (typeof win.symbol !== "string" || !symbolNames.has(win.symbol) || win.symbol === "clashRune") {
      throw new InvalidGameEventError(`${winPath}.symbol`, "non-scatter WIZARD CRAFT symbol");
    }
    const positions = cells(win.positions, `${winPath}.positions`, 3);
    const contributing = contributingVsReels(win.contributingVsReels, `${winPath}.contributingVsReels`);
    const positionReels = new Set(positions.map((position) => position.reel));
    if (contributing.some((item) => !positionReels.has(item.reel))) {
      throw new InvalidGameEventError(`${winPath}.contributingVsReels`, "reels used by the winning way");
    }
    const expectedMultiplier = contributing.length === 0
      ? 1
      : contributing.reduce((sum, item) => sum + item.multiplier, 0);
    const multiplier = integer(win.multiplier, `${winPath}.multiplier`, 1, 5_000);
    if (multiplier !== expectedMultiplier) {
      throw new InvalidGameEventError(`${winPath}.multiplier`, `additive contributing multiplier ${expectedMultiplier}`);
    }
    return {
      symbol: win.symbol as WizardCraftSymbol,
      win: integer(win.win, `${winPath}.win`, 1, WIZARD_CRAFT_MAX_BOOK_AMOUNT),
      positions,
      multiplier,
      contributingVsReels: contributing,
    };
  });
  if (wins.reduce((total, win) => total + win.win, 0) !== totalWin) {
    throw new InvalidGameEventError(`${path}.totalWin`, "sum of ways-win amounts");
  }
  return { totalWin, wins };
}

function amount(value: unknown, path: string): WizardCraftAmount {
  const input = record(value, path);
  exactKeys(input, ["amount"], path);
  return { amount: integer(input.amount, `${path}.amount`, 0, WIZARD_CRAFT_MAX_BOOK_AMOUNT) };
}

const validators = {
  reveal,
  freeSpinTrigger: featureTrigger,
  startDuel,
  prepareAttack,
  expandVsReel,
  upgradeStickyReel,
  blockAttack,
  clearSpinReels,
  winInfo,
  setTotalWin: amount,
  wincap: amount,
  finalWin: amount,
} as const;

const parseEvent = createGameEventParser(validators);
export type WizardCraftEvent = GameEventFor<typeof validators>;

function validateLifecycle(events: readonly WizardCraftEvent[]): void {
  const terminal = events.at(-1);
  if (terminal?.type !== "finalWin") {
    throw new InvalidGameEventError(`events[${events.length - 1}].type`, "finalWin");
  }
  if (events.slice(0, -1).some((event) => event.type === "finalWin")) {
    throw new InvalidGameEventError("events", "exactly one terminal finalWin event");
  }
  const capEvents = events.filter((event) => event.type === "wincap");
  if (capEvents.length > 1) throw new InvalidGameEventError("events", "at most one wincap event");
  if (capEvents[0] !== undefined && (
    capEvents[0].payload.amount !== WIZARD_CRAFT_MAX_BOOK_AMOUNT ||
    terminal.payload.amount !== WIZARD_CRAFT_MAX_BOOK_AMOUNT
  )) {
    throw new InvalidGameEventError("events", "wincap and finalWin equal the 25,000x cap");
  }

  let selectedMode: WizardCraftMode | null = null;
  let selectedTier: WizardCraftTier | null = null;
  let duelStarted = false;
  let prepared: WizardCraftPrepareAttack | null = null;
  let freeSpinReveals = 0;
  let firstStickyFreeSpin: number | null = null;
  let runningTotal = 0;
  const sticky = new Map<number, number>();
  const temporary = new Map<number, number>();

  for (const [position, event] of events.entries()) {
    if (event.type === "reveal") {
      if (selectedMode !== null && event.payload.mode !== selectedMode) {
        throw new InvalidGameEventError(`events[${position}].payload.mode`, "one paid mode per book");
      }
      selectedMode = event.payload.mode;
      const scatterCount = event.payload.board.flat().filter(
        (symbol) => symbol.name === "clashRune",
      ).length;
      if (
        event.payload.mode === "siegeSigns" &&
        event.payload.gameType === "basegame" &&
        scatterCount < 1
      ) {
        throw new InvalidGameEventError(
          `events[${position}].payload.board`,
          "Siege Signs base reveal with at least one guaranteed Clash Rune",
        );
      }
      if (
        event.payload.mode === "openGrimoire" &&
        event.payload.gameType !== "freegame"
      ) {
        throw new InvalidGameEventError(
          `events[${position}].payload.gameType`,
          "Open the Grimoire feature reveal",
        );
      }
      if (event.payload.gameType === "freegame") freeSpinReveals += 1;
    } else if (event.type === "startDuel") {
      if (duelStarted) throw new InvalidGameEventError(`events[${position}].type`, "one startDuel event");
      duelStarted = true;
      selectedTier = event.payload.tier;
    } else if (event.type === "prepareAttack") {
      if (prepared !== null) {
        throw new InvalidGameEventError(`events[${position}].type`, "one unresolved prepareAttack");
      }
      prepared = event.payload;
    } else if (event.type === "expandVsReel") {
      if (prepared !== null && prepared.targetReel !== event.payload.reel) {
        throw new InvalidGameEventError(`events[${position}].type`, "expanded reel matching prepareAttack target");
      }
      if (sticky.has(event.payload.reel) || temporary.has(event.payload.reel)) {
        throw new InvalidGameEventError(`events[${position}].payload.reel`, "currently unexpanded reel");
      }
      if (event.payload.persistence === "sticky") {
        if (!duelStarted || selectedTier === 1) {
          throw new InvalidGameEventError(`events[${position}].payload.persistence`, "sticky only in Tier II or Tier III");
        }
        sticky.set(event.payload.reel, event.payload.appliedMultiplier);
        if (firstStickyFreeSpin === null) firstStickyFreeSpin = freeSpinReveals;
      } else {
        temporary.set(event.payload.reel, event.payload.appliedMultiplier);
      }
      prepared = null;
    } else if (event.type === "upgradeStickyReel") {
      const current = sticky.get(event.payload.reel);
      if (
        current === undefined ||
        current !== event.payload.previousMultiplier ||
        event.payload.appliedMultiplier <= current
      ) {
        throw new InvalidGameEventError(`events[${position}].type`, "strict non-decreasing upgrade of an existing sticky reel");
      }
      sticky.set(event.payload.reel, event.payload.appliedMultiplier);
    } else if (event.type === "blockAttack") {
      if (
        prepared?.side !== event.payload.attacker ||
        prepared.targetReel !== event.payload.targetReel
      ) {
        throw new InvalidGameEventError(`events[${position}].type`, "blockAttack matching the preceding prepareAttack");
      }
      prepared = null;
    } else if (event.type === "clearSpinReels") {
      temporary.clear();
    } else if (event.type === "winInfo") {
      for (const win of event.payload.wins) {
        for (const contribution of win.contributingVsReels) {
          const active = sticky.get(contribution.reel) ?? temporary.get(contribution.reel);
          if (active !== contribution.multiplier) {
            throw new InvalidGameEventError(
              `events[${position}].payload.wins`,
              "contributing VS values matching active expanded reels",
            );
          }
        }
      }
    } else if (event.type === "setTotalWin") {
      if (event.payload.amount < runningTotal) {
        throw new InvalidGameEventError(
          `events[${position}].payload.amount`,
          "non-decreasing running total",
        );
      }
      runningTotal = event.payload.amount;
    }
  }
  if (prepared !== null) throw new InvalidGameEventError("events", "completed prepared attack");
  if (temporary.size > 0) throw new InvalidGameEventError("events", "clearSpinReels after temporary VS reels");
  if (selectedMode === "openGrimoire" && !duelStarted) {
    throw new InvalidGameEventError("events", "Open the Grimoire enters a bonus tier");
  }
  if (selectedTier === 3 && (firstStickyFreeSpin === null || firstStickyFreeSpin > 3)) {
    throw new InvalidGameEventError("events", "Tier III sticky by feature spin three");
  }
  if (terminal.payload.amount !== runningTotal) {
    throw new InvalidGameEventError(
      `events[${events.length - 1}].payload.amount`,
      "finalWin matching running total",
    );
  }
}

export function parseWizardCraftBook(value: unknown): readonly WizardCraftEvent[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new InvalidGameEventError("events", "at least two events");
  }
  const events = value.map((event, index) => parseEvent(event, `events[${index}]`));
  for (const [position, event] of events.entries()) {
    if (event.index !== position) {
      throw new InvalidGameEventError(`events[${position}].index`, `ordered contiguous index ${position}`);
    }
  }
  if (!events.some((event) => event.type === "reveal")) {
    throw new InvalidGameEventError("events", "at least one reveal");
  }
  validateLifecycle(events);
  return planEventResume(events, null).remaining;
}

export function planWizardCraftResume(
  state: unknown,
  checkpoint: string | null,
): ResumePlan<WizardCraftEvent> {
  return planEventResume(parseWizardCraftBook(state), checkpoint);
}
