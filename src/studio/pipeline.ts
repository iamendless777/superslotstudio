import { assessGameShape, type Assessment, type GameShape } from "../motion/assess.js";
import { planMotionTimeline, type MotionTimeline } from "../motion/timeline.js";
import type { StyleId } from "../motion/styles.js";
import { missingArt, type Blueprint } from "./blueprint.js";

export interface StudioPlan {
  readonly blueprint: Blueprint;
  readonly assessment: Assessment;
  readonly lockedStyleId: StyleId;
  readonly styleMatchesLocked: boolean;
  readonly timeline: MotionTimeline;
  readonly missingArtIds: readonly string[];
  /** True when art slots are filled and style is compatible. */
  readonly readyForArtReview: boolean;
  readonly readyForMotionPreview: boolean;
}

export function shapeFromBlueprint(blueprint: Blueprint): GameShape {
  return {
    columns: blueprint.grid.columns,
    rows: blueprint.grid.rows,
    winType: blueprint.winType,
    cascadeDepth: blueprint.cascadeDepth,
    hasStickyWilds: blueprint.hasStickyWilds,
    hasAnticipationMarkers: blueprint.hasAnticipation,
    eventTypes: ["reveal", "highlight"],
  };
}

/**
 * One call from recipe → assessment + motion plan.
 * This is the studio "recognize and attack" entry point.
 */
export function planFromBlueprint(
  blueprint: Blueprint,
  options?: {
    readonly winCells?: readonly string[];
    readonly overrideStyleId?: StyleId;
  },
): StudioPlan {
  const assessment = assessGameShape(shapeFromBlueprint(blueprint));
  const lockedStyleId = options?.overrideStyleId ?? blueprint.styleId;
  const styleMatchesLocked = assessment.recommended.includes(lockedStyleId);
  const timeline = planMotionTimeline({
    styleId: lockedStyleId,
    cascadeDepth: blueprint.cascadeDepth,
    winCells: options?.winCells ?? [],
  });
  const missingArtIds = missingArt(blueprint);

  return {
    blueprint,
    assessment,
    lockedStyleId,
    styleMatchesLocked,
    timeline,
    missingArtIds,
    readyForArtReview: missingArtIds.length > 0,
    readyForMotionPreview: true,
  };
}
