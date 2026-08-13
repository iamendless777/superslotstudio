import { InvalidGameEventError } from "../../events/schema.js";
import {
  parseWizardCraftBook,
  type WizardCraftSymbol,
} from "./events.js";

export interface WizardCraftRgsEvent {
  readonly index: number;
  readonly type: string;
  readonly [key: string]: unknown;
}

export const WIZARD_CRAFT_OFFICIAL_EVENT_TYPES = Object.freeze([
  "reveal",
  "winInfo",
  "setWin",
  "setTotalWin",
  "freeSpinTrigger",
  "freeSpinRetrigger",
  "enterBonus",
  "startDuel",
  "updateFreeSpin",
  "prepareAttack",
  "expandVsReel",
  "upgradeStickyReel",
  "blockAttack",
  "clearSpinReels",
  "freeSpinEnd",
  "wincap",
  "finalWin",
] as const);

const OFFICIAL_TYPES = new Set<string>(WIZARD_CRAFT_OFFICIAL_EVENT_TYPES);

const SYMBOLS: Readonly<Record<string, WizardCraftSymbol>> = {
  EMBER: "ember",
  CRYSTAL: "crystal",
  POTION: "potion",
  SCROLL: "scroll",
  GRIMOIRE: "grimoire",
  STAFF: "staff",
  CROWN: "crown",
  WIZARD: "wizardSigil",
  DRAGON: "dragonSigil",
  RUNE: "clashRune",
};

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidGameEventError(path, "object");
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new InvalidGameEventError(path, `safe integer at least ${minimum}`);
  }
  return value as number;
}

function symbol(value: unknown, path: string) {
  const input = record(value, path);
  const mapped = typeof input.name === "string" ? SYMBOLS[input.name] : undefined;
  if (mapped === undefined) throw new InvalidGameEventError(`${path}.name`, "WIZARD CRAFT symbol");
  return {
    name: mapped,
    ...(mapped === "wizardSigil" || mapped === "dragonSigil" ? { wild: true as const } : {}),
    ...(mapped === "clashRune" ? { scatter: true as const } : {}),
  };
}

function cell(value: unknown, path: string) {
  const input = record(value, path);
  return {
    reel: integer(input.reel, `${path}.reel`),
    row: integer(input.row, `${path}.row`),
  };
}

function cells(value: unknown, path: string) {
  if (!Array.isArray(value)) throw new InvalidGameEventError(path, "array");
  return value.map((item, index) => cell(item, `${path}[${index}]`));
}

function envelope(index: number, type: string, payload: object) {
  return { schemaVersion: 1, index, type, payload };
}

/**
 * Validates the flattened event arrays returned in Stake round.state. The raw
 * stream is retained for presentation after a normalized mechanic projection
 * passes the stricter WIZARD CRAFT lifecycle validator.
 */
export function parseWizardCraftRgsState(
  value: unknown,
): readonly WizardCraftRgsEvent[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new InvalidGameEventError("round.state", "WIZARD CRAFT event array");
  }
  const raw = value.map((item, position): WizardCraftRgsEvent => {
    const event = record(item, `round.state[${position}]`);
    if (event.index !== position) {
      throw new InvalidGameEventError(
        `round.state[${position}].index`,
        `contiguous index ${position}`,
      );
    }
    if (typeof event.type !== "string" || !OFFICIAL_TYPES.has(event.type)) {
      throw new InvalidGameEventError(
        `round.state[${position}].type`,
        "supported WIZARD CRAFT event",
      );
    }
    return Object.freeze({ ...event, index: position, type: event.type });
  });

  const normalized: object[] = [];
  for (const event of raw) {
    const index = normalized.length;
    if (event.type === "reveal") {
      if (!Array.isArray(event.board) || event.board.length !== 5) {
        throw new InvalidGameEventError(`round.state[${event.index}].board`, "five reels");
      }
      const board = event.board.map((reel, reelIndex) => {
        if (!Array.isArray(reel) || reel.length !== 4) {
          throw new InvalidGameEventError(
            `round.state[${event.index}].board[${reelIndex}]`,
            "four symbols",
          );
        }
        return reel.map((item, row) =>
          symbol(item, `round.state[${event.index}].board[${reelIndex}][${row}]`));
      });
      normalized.push(envelope(index, "reveal", {
        board,
        gameType: event.gameType,
        mode: event.mode,
        anticipation: event.anticipation,
      }));
    } else if (event.type === "freeSpinTrigger") {
      normalized.push(envelope(index, event.type, {
        tier: event.tier,
        totalFs: event.totalFs,
        positions: cells(event.positions, `round.state[${event.index}].positions`),
      }));
    } else if (event.type === "startDuel") {
      normalized.push(envelope(index, event.type, {
        tier: event.tier,
        totalFs: event.totalFs,
      }));
    } else if (event.type === "prepareAttack") {
      normalized.push(envelope(index, event.type, {
        side: event.side,
        targetReel: event.targetReel,
        intensity: event.intensity,
      }));
    } else if (event.type === "expandVsReel") {
      normalized.push(envelope(index, event.type, {
        reel: event.reel,
        dragonMultiplier: event.dragonMultiplier,
        wizardMultiplier: event.wizardMultiplier,
        appliedMultiplier: event.appliedMultiplier,
        advantage: event.advantage,
        persistence: event.persistence,
      }));
    } else if (event.type === "upgradeStickyReel") {
      normalized.push(envelope(index, event.type, {
        reel: event.reel,
        previousMultiplier: event.previousMultiplier,
        dragonMultiplier: event.dragonMultiplier,
        wizardMultiplier: event.wizardMultiplier,
        appliedMultiplier: event.appliedMultiplier,
        advantage: event.advantage,
      }));
    } else if (event.type === "blockAttack") {
      normalized.push(envelope(index, event.type, {
        attacker: event.attacker,
        targetReel: event.targetReel,
      }));
    } else if (event.type === "clearSpinReels") {
      normalized.push(envelope(index, event.type, {}));
    } else if (event.type === "winInfo") {
      if (!Array.isArray(event.wins)) {
        throw new InvalidGameEventError(`round.state[${event.index}].wins`, "array");
      }
      normalized.push(envelope(index, event.type, {
        totalWin: event.totalWin,
        wins: event.wins.map((item, winIndex) => {
          const win = record(item, `round.state[${event.index}].wins[${winIndex}]`);
          const meta = record(win.meta, `round.state[${event.index}].wins[${winIndex}].meta`);
          const mapped = typeof win.symbol === "string" ? SYMBOLS[win.symbol] : undefined;
          if (mapped === undefined) {
            throw new InvalidGameEventError(
              `round.state[${event.index}].wins[${winIndex}].symbol`,
              "WIZARD CRAFT symbol",
            );
          }
          return {
            symbol: mapped,
            win: win.win,
            positions: cells(win.positions, `round.state[${event.index}].wins[${winIndex}].positions`),
            multiplier: meta.globalMult,
            contributingVsReels: meta.contributingVsReels,
          };
        }),
      }));
    } else if (
      event.type === "setTotalWin" ||
      event.type === "wincap" ||
      event.type === "finalWin"
    ) {
      normalized.push(envelope(index, event.type, { amount: event.amount }));
    }
  }

  parseWizardCraftBook(normalized);
  return Object.freeze(raw);
}
