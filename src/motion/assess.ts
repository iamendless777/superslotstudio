import {
  getStyle,
  listStyleIds,
  type StyleId,
  type StyleProfile,
  type WinTypeHint,
} from "./styles.js";

export interface GameShape {
  readonly columns: number;
  readonly rows: number;
  readonly winType: WinTypeHint;
  /** Maximum observed cascade depth in books (0 = no tumble). */
  readonly cascadeDepth: number;
  readonly hasStickyWilds: boolean;
  readonly hasAnticipationMarkers: boolean;
  /** Presentation event type names present in sample books. */
  readonly eventTypes: readonly string[];
}

export interface StyleMatch {
  readonly styleId: StyleId;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly mismatches: readonly string[];
}

export interface Assessment {
  readonly shape: GameShape;
  readonly matches: readonly StyleMatch[];
  /** Best matches first; empty if nothing is compatible. */
  readonly recommended: readonly StyleId[];
}

function scoreStyle(shape: GameShape, profile: StyleProfile): StyleMatch {
  const reasons: string[] = [];
  const mismatches: string[] = [];
  let score = 0;

  const caps = profile.capabilities;

  if (caps.winTypes.includes(shape.winType)) {
    score += 40;
    reasons.push(`supports winType ${shape.winType}`);
  } else {
    mismatches.push(
      `winType ${shape.winType} not in [${caps.winTypes.join(", ")}]`,
    );
  }

  if (
    shape.columns >= caps.minColumns &&
    shape.columns <= caps.maxColumns &&
    shape.rows >= caps.minRows &&
    shape.rows <= caps.maxRows
  ) {
    score += 20;
    reasons.push(`grid ${shape.columns}x${shape.rows} in range`);
  } else {
    mismatches.push(
      `grid ${shape.columns}x${shape.rows} outside ${caps.minColumns}-${caps.maxColumns}x${caps.minRows}-${caps.maxRows}`,
    );
  }

  if (shape.cascadeDepth > 0) {
    if (caps.tumble) {
      score += 25;
      reasons.push(`tumble depth ${shape.cascadeDepth} supported`);
    } else {
      mismatches.push(`style does not support tumble (depth ${shape.cascadeDepth})`);
    }
  } else if (!caps.tumble) {
    score += 10;
    reasons.push("non-tumble style fits static board");
  } else {
    // Tumble style on non-tumble game is usable but not ideal
    score += 5;
    reasons.push("tumble style usable without cascades");
  }

  if (shape.hasStickyWilds) {
    if (caps.stickyWilds) {
      score += 10;
      reasons.push("sticky wilds supported");
    } else {
      mismatches.push("sticky wilds required but style lacks sticky-morph path");
    }
  }

  if (shape.hasAnticipationMarkers) {
    if (caps.anticipation) {
      score += 10;
      reasons.push("anticipation supported");
    } else {
      mismatches.push("anticipation markers present; style has no slow-stop");
    }
  }

  // Soft signal from event vocabulary
  if (shape.eventTypes.includes("highlight") && profile.winEffects.length > 0) {
    score += 5;
    reasons.push("highlight events map to win effects");
  }
  if (
    shape.eventTypes.some((t) => t.includes("tumble") || t.includes("cascade")) &&
    caps.tumble
  ) {
    score += 5;
    reasons.push("cascade-related event types present");
  }

  // Hard veto: critical mismatches zero the recommendation weight
  const hardFail =
    mismatches.some((m) => m.startsWith("winType")) ||
    mismatches.some((m) => m.startsWith("grid"));

  return {
    styleId: profile.id,
    score: hardFail ? 0 : score,
    reasons,
    mismatches,
  };
}

/**
 * Assess a game shape against all registered styles.
 * Does not select a style — returns ranked recommendations for the studio.
 */
export function assessGameShape(shape: GameShape): Assessment {
  if (!Number.isInteger(shape.columns) || shape.columns < 1) {
    throw new RangeError("columns must be a positive integer");
  }
  if (!Number.isInteger(shape.rows) || shape.rows < 1) {
    throw new RangeError("rows must be a positive integer");
  }
  if (!Number.isInteger(shape.cascadeDepth) || shape.cascadeDepth < 0) {
    throw new RangeError("cascadeDepth must be a non-negative integer");
  }

  const matches = listStyleIds()
    .map((id) => scoreStyle(shape, getStyle(id)))
    .sort((a, b) => b.score - a.score || a.styleId.localeCompare(b.styleId));

  const recommended = matches
    .filter((m) => m.score > 0 && m.mismatches.length === 0)
    .map((m) => m.styleId);

  // If nothing is perfect, still surface soft matches with score > 0
  const soft =
    recommended.length > 0
      ? recommended
      : matches.filter((m) => m.score > 0).map((m) => m.styleId);

  return { shape, matches, recommended: soft };
}

/** Convenience: Classic Nine 3×3 lines-style shape. */
export function classicNineShape(
  eventTypes: readonly string[] = ["reveal", "highlight"],
): GameShape {
  return {
    columns: 3,
    rows: 3,
    winType: "lines",
    cascadeDepth: 0,
    hasStickyWilds: false,
    hasAnticipationMarkers: false,
    eventTypes,
  };
}
