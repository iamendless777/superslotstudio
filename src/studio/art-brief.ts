import type { Blueprint } from "./blueprint.js";
import { missingArt } from "./blueprint.js";

export interface ArtSlotBrief {
  readonly symbolId: string;
  readonly role: string;
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

function guidanceForRole(role: string, styleId: string): string {
  switch (role) {
    case "low":
      return "Simple readable icon; secondary in wins; keep silhouette clear at small size.";
    case "high":
      return "Hero symbol; stronger silhouette and color; supports win-pulse emphasis.";
    case "wild":
      return styleId.includes("sticky")
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
  const slots = blueprint.symbols.map((s) => ({
    symbolId: s.id,
    role: s.role,
    artKey: s.artKey,
    status: (missing.has(s.id) ? "missing" : "assigned") as "missing" | "assigned",
    guidance: guidanceForRole(s.role, blueprint.styleId),
  }));
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
