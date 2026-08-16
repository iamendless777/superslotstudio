/**
 * GameBlueprint is the studio's fast-path recipe.
 * Fill this, pick a style, slot art keys, generate math + presentation books.
 * Everything else (RGS, recovery, motion timeline) is derived — not redesigned.
 */

import type { StyleId, WinTypeHint } from "../motion/styles.js";

export const BLUEPRINT_SCHEMA_VERSION = 1 as const;

export interface GridSpec {
  readonly columns: number;
  readonly rows: number;
}

export interface SymbolSlot {
  /** Stable key used in math + presentation (e.g. "cherry", "wild"). */
  readonly id: string;
  /** Human label for art brief. */
  readonly label: string;
  readonly isWild: boolean;
  readonly isScatter: boolean;
  /** Optional art asset key; empty means "needs art". */
  readonly artKey: string | null;
}

export interface PayEntry {
  readonly symbolId: string;
  readonly count: number;
  /** Multiplier in integer millionths of stake (1_000_000 = 1x). */
  readonly payoutMillionths: number;
}

export interface Blueprint {
  readonly schemaVersion: typeof BLUEPRINT_SCHEMA_VERSION;
  readonly gameId: string;
  readonly title: string;
  readonly grid: GridSpec;
  readonly winType: WinTypeHint;
  /** Selected motion style; assessor can recommend, human locks it. */
  readonly styleId: StyleId;
  readonly symbols: readonly SymbolSlot[];
  readonly paytable: readonly PayEntry[];
  /** Max cascade depth for cluster games; 0 for lines/ways. */
  readonly cascadeDepth: number;
  readonly hasStickyWilds: boolean;
  readonly hasAnticipation: boolean;
  /** Free-text art direction so artists know the mood without reading code. */
  readonly artBrief: string;
}

export interface BlueprintValidationIssue {
  readonly path: string;
  readonly message: string;
}

export function validateBlueprint(value: unknown): {
  readonly ok: true;
  readonly blueprint: Blueprint;
} | {
  readonly ok: false;
  readonly issues: readonly BlueprintValidationIssue[];
} {
  const issues: BlueprintValidationIssue[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, issues: [{ path: "", message: "expected object" }] };
  }
  const input = value as Record<string, unknown>;

  if (input.schemaVersion !== BLUEPRINT_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      message: `expected ${BLUEPRINT_SCHEMA_VERSION}`,
    });
  }
  if (typeof input.gameId !== "string" || input.gameId.length === 0) {
    issues.push({ path: "gameId", message: "non-empty string" });
  }
  if (typeof input.title !== "string" || input.title.length === 0) {
    issues.push({ path: "title", message: "non-empty string" });
  }

  const grid = input.grid;
  if (typeof grid !== "object" || grid === null || Array.isArray(grid)) {
    issues.push({ path: "grid", message: "object with columns/rows" });
  } else {
    const g = grid as Record<string, unknown>;
    if (!Number.isInteger(g.columns) || (g.columns as number) < 1) {
      issues.push({ path: "grid.columns", message: "positive integer" });
    }
    if (!Number.isInteger(g.rows) || (g.rows as number) < 1) {
      issues.push({ path: "grid.rows", message: "positive integer" });
    }
  }

  const winTypes = ["lines", "ways", "cluster", "scatter", "mixed"] as const;
  if (typeof input.winType !== "string" || !winTypes.includes(input.winType as never)) {
    issues.push({ path: "winType", message: `one of ${winTypes.join(", ")}` });
  }

  const styleIds = [
    "classic-lines",
    "cluster-snap",
    "cluster-fluid",
    "sticky-lock",
    "anticipation-heavy",
  ] as const;
  if (typeof input.styleId !== "string" || !styleIds.includes(input.styleId as never)) {
    issues.push({ path: "styleId", message: `one of ${styleIds.join(", ")}` });
  }

  if (!Array.isArray(input.symbols) || input.symbols.length === 0) {
    issues.push({ path: "symbols", message: "non-empty array" });
  } else {
    const ids = new Set<string>();
    for (const [i, sym] of input.symbols.entries()) {
      if (typeof sym !== "object" || sym === null) {
        issues.push({ path: `symbols[${i}]`, message: "object" });
        continue;
      }
      const s = sym as Record<string, unknown>;
      if (typeof s.id !== "string" || s.id.length === 0) {
        issues.push({ path: `symbols[${i}].id`, message: "non-empty string" });
      } else if (ids.has(s.id)) {
        issues.push({ path: `symbols[${i}].id`, message: `duplicate ${s.id}` });
      } else {
        ids.add(s.id);
      }
    }
  }

  if (!Array.isArray(input.paytable)) {
    issues.push({ path: "paytable", message: "array" });
  }

  if (!Number.isInteger(input.cascadeDepth) || (input.cascadeDepth as number) < 0) {
    issues.push({ path: "cascadeDepth", message: "non-negative integer" });
  }
  if (typeof input.hasStickyWilds !== "boolean") {
    issues.push({ path: "hasStickyWilds", message: "boolean" });
  }
  if (typeof input.hasAnticipation !== "boolean") {
    issues.push({ path: "hasAnticipation", message: "boolean" });
  }
  if (typeof input.artBrief !== "string") {
    issues.push({ path: "artBrief", message: "string" });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    blueprint: {
      schemaVersion: BLUEPRINT_SCHEMA_VERSION,
      gameId: input.gameId as string,
      title: input.title as string,
      grid: {
        columns: (input.grid as { columns: number }).columns,
        rows: (input.grid as { rows: number }).rows,
      },
      winType: input.winType as Blueprint["winType"],
      styleId: input.styleId as Blueprint["styleId"],
      symbols: (input.symbols as SymbolSlot[]).map((s) => ({
        id: s.id,
        label: s.label,
        isWild: Boolean(s.isWild),
        isScatter: Boolean(s.isScatter),
        artKey: s.artKey ?? null,
      })),
      paytable: (input.paytable as PayEntry[]).map((p) => ({
        symbolId: p.symbolId,
        count: p.count,
        payoutMillionths: p.payoutMillionths,
      })),
      cascadeDepth: input.cascadeDepth as number,
      hasStickyWilds: input.hasStickyWilds as boolean,
      hasAnticipation: input.hasAnticipation as boolean,
      artBrief: input.artBrief as string,
    },
  };
}

/** Art checklist: which symbol slots still need assets. */
export function missingArt(blueprint: Blueprint): readonly string[] {
  return blueprint.symbols
    .filter((s) => s.artKey === null || s.artKey.length === 0)
    .map((s) => s.id);
}

/** Seed blueprint for Classic Nine so the studio has a known-good template. */
export function classicNineBlueprint(): Blueprint {
  return {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    gameId: "classic-nine",
    title: "Classic Nine",
    grid: { columns: 3, rows: 3 },
    winType: "lines",
    styleId: "classic-lines",
    symbols: [
      { id: "cherry", label: "Cherry", isWild: false, isScatter: false, artKey: null },
      { id: "lemon", label: "Lemon", isWild: false, isScatter: false, artKey: null },
      { id: "orange", label: "Orange", isWild: false, isScatter: false, artKey: null },
      { id: "plum", label: "Plum", isWild: false, isScatter: false, artKey: null },
      { id: "bell", label: "Bell", isWild: false, isScatter: false, artKey: null },
      { id: "seven", label: "Seven", isWild: false, isScatter: false, artKey: null },
      { id: "wild", label: "Wild", isWild: true, isScatter: false, artKey: null },
    ],
    paytable: [
      { symbolId: "seven", count: 3, payoutMillionths: 50_000_000 },
      { symbolId: "bell", count: 3, payoutMillionths: 20_000_000 },
      { symbolId: "wild", count: 3, payoutMillionths: 100_000_000 },
      { symbolId: "cherry", count: 3, payoutMillionths: 5_000_000 },
    ],
    cascadeDepth: 0,
    hasStickyWilds: false,
    hasAnticipation: false,
    artBrief: "Fruit machine classic. Clean icons, high contrast, no clutter.",
  };
}
