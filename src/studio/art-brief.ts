import type { Blueprint, SymbolSlot } from "./blueprint.js";
import { missingArt } from "./blueprint.js";

export type ArtRole = "low" | "high" | "wild" | "scatter" | "special";

export interface ArtSlotBrief {
  readonly symbolId: string;
  readonly label: string;
  readonly role: ArtRole;
  readonly artKey: string | null;
  readonly status: "missing" | "assigned";
  readonly guidance: string;
}

export interface ArtBrief {
  readonly gameId: string;
  readonly title: string;
  readonly styleId: Blueprint["styleId"];
  readonly grid: string;
  readonly winType: Blueprint["winType"];
  readonly notes: string;
  readonly slots: readonly ArtSlotBrief[];
  readonly missingCount: number;
  readonly readyToCommission: boolean;
}

function roleForSymbol(symbol: SymbolSlot, regularIndex: number): ArtRole {
  if (symbol.isWild) return "wild";
  if (symbol.isScatter) return "scatter";
  return regularIndex === 0 ? "high" : "low";
}

function guidanceForRole(role: ArtRole, styleId: string): string {
  switch (role) {
    case "low":
      return "Simple readable icon; secondary in wins; keep silhouette clear at small size.";
    case "high":
      return "Hero symbol; stronger silhouette and color; supports win-pulse emphasis.";
    case "wild":
      return styleId.includes("sticky") || styleId === "sticky-lock"
        ? "Wild must read as lockable/sticky; distinct edge treatment for sticky-morph."
        : "Clear wild badge; works under win-pulse and line-trace.";
    case "scatter":
      return "Must read at a glance for anticipation-heavy stops; high contrast.";
    case "special":
      return "Feature/coin/collect — reserve for mechanic beats; avoid cluttering base grid.";
    default:
      return "Match series style; prioritize readability on the configured grid.";
  }
}

/** Turn a blueprint into a commissionable art checklist. */
export function buildArtBrief(blueprint: Blueprint): ArtBrief {
  const missing = new Set(missingArt(blueprint));
  let regularIndex = 0;
  const slots = blueprint.symbols.map((s) => {
    const role = roleForSymbol(s, regularIndex);
    if (role === "high" || role === "low") regularIndex += 1;
    return {
      symbolId: s.id,
      label: s.label,
      role,
      artKey: s.artKey,
      status: (missing.has(s.id) ? "missing" : "assigned") as "missing" | "assigned",
      guidance: guidanceForRole(role, blueprint.styleId),
    };
  });
  return {
    gameId: blueprint.gameId,
    title: blueprint.title,
    styleId: blueprint.styleId,
    grid: `${blueprint.grid.columns}x${blueprint.grid.rows}`,
    winType: blueprint.winType,
    notes: blueprint.artBrief,
    slots,
    missingCount: missing.size,
    readyToCommission: blueprint.symbols.length > 0,
  };
}
