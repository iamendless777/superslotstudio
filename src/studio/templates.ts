import type { Blueprint } from "./blueprint.js";
import { BLUEPRINT_SCHEMA_VERSION, classicNineBlueprint } from "./blueprint.js";

export type TemplateId =
  | "classic-nine"
  | "cluster-hex"
  | "sticky-five"
  | "anticipation-five";

export function clusterHexBlueprint(): Blueprint {
  return {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    gameId: "cluster-hex",
    title: "Cluster Hex",
    grid: { columns: 6, rows: 6 },
    winType: "cluster",
    styleId: "cluster-snap",
    symbols: [
      { id: "red", label: "Ruby", isWild: false, isScatter: false, artKey: null },
      { id: "blue", label: "Sapphire", isWild: false, isScatter: false, artKey: null },
      { id: "green", label: "Emerald", isWild: false, isScatter: false, artKey: null },
      { id: "yellow", label: "Topaz", isWild: false, isScatter: false, artKey: null },
      { id: "purple", label: "Amethyst", isWild: false, isScatter: false, artKey: null },
      { id: "wild", label: "Crystal Wild", isWild: true, isScatter: false, artKey: null },
    ],
    paytable: [
      { symbolId: "red", count: 5, payoutMillionths: 2_000_000 },
      { symbolId: "red", count: 8, payoutMillionths: 8_000_000 },
      { symbolId: "blue", count: 5, payoutMillionths: 2_500_000 },
      { symbolId: "wild", count: 5, payoutMillionths: 15_000_000 },
    ],
    cascadeDepth: 5,
    hasStickyWilds: false,
    hasAnticipation: false,
    artBrief:
      "Gem cluster. Saturated stones on dark field. Explode-clean remove, snappy fall.",
  };
}

export function stickyFiveBlueprint(): Blueprint {
  return {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    gameId: "sticky-five",
    title: "Sticky Five",
    grid: { columns: 5, rows: 3 },
    winType: "lines",
    styleId: "sticky-lock",
    symbols: [
      { id: "ace", label: "Ace", isWild: false, isScatter: false, artKey: null },
      { id: "king", label: "King", isWild: false, isScatter: false, artKey: null },
      { id: "queen", label: "Queen", isWild: false, isScatter: false, artKey: null },
      { id: "jack", label: "Jack", isWild: false, isScatter: false, artKey: null },
      { id: "ten", label: "Ten", isWild: false, isScatter: false, artKey: null },
      { id: "wild", label: "Sticky Wild", isWild: true, isScatter: false, artKey: null },
      { id: "scatter", label: "Bonus", isWild: false, isScatter: true, artKey: null },
    ],
    paytable: [
      { symbolId: "ace", count: 5, payoutMillionths: 40_000_000 },
      { symbolId: "wild", count: 5, payoutMillionths: 80_000_000 },
      { symbolId: "king", count: 3, payoutMillionths: 5_000_000 },
    ],
    cascadeDepth: 0,
    hasStickyWilds: true,
    hasAnticipation: false,
    artBrief:
      "Card-room premium. Sticky wilds lock with metallic frame morph. Clean royals.",
  };
}

export function anticipationFiveBlueprint(): Blueprint {
  return {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    gameId: "anticipation-five",
    title: "Anticipation Five",
    grid: { columns: 5, rows: 3 },
    winType: "lines",
    styleId: "anticipation-heavy",
    symbols: [
      { id: "fox", label: "Fox", isWild: false, isScatter: false, artKey: null },
      { id: "owl", label: "Owl", isWild: false, isScatter: false, artKey: null },
      { id: "wolf", label: "Wolf", isWild: false, isScatter: false, artKey: null },
      { id: "moon", label: "Moon", isWild: false, isScatter: true, artKey: null },
      { id: "wild", label: "Spirit Wild", isWild: true, isScatter: false, artKey: null },
    ],
    paytable: [
      { symbolId: "fox", count: 5, payoutMillionths: 25_000_000 },
      { symbolId: "moon", count: 3, payoutMillionths: 10_000_000 },
      { symbolId: "wild", count: 5, payoutMillionths: 60_000_000 },
    ],
    cascadeDepth: 0,
    hasStickyWilds: false,
    hasAnticipation: true,
    artBrief:
      "Night forest. Final reel anticipation glow. Soft wildlife icons, strong silhouette.",
  };
}

const TEMPLATES: Record<TemplateId, () => Blueprint> = {
  "classic-nine": classicNineBlueprint,
  "cluster-hex": clusterHexBlueprint,
  "sticky-five": stickyFiveBlueprint,
  "anticipation-five": anticipationFiveBlueprint,
};

export function listTemplateIds(): readonly TemplateId[] {
  return Object.keys(TEMPLATES) as TemplateId[];
}

export function loadTemplate(id: TemplateId): Blueprint {
  const factory = TEMPLATES[id];
  if (!factory) {
    throw new RangeError(`unknown template: ${id}`);
  }
  return factory();
}
