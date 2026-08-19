import { assessGameShape, type Assessment, type GameShape } from "../motion/assess.js";
import { planMotionTimeline, type MotionTimeline } from "../motion/timeline.js";
import {
  timelineToRuntimeCues,
  type RuntimeCueSheet,
} from "../motion/runtime-cues.js";
import type { StyleId } from "../motion/styles.js";
import { missingArt, type Blueprint } from "./blueprint.js";

export interface StudioPlan {
  readonly blueprint: Blueprint;
  readonly assessment: Assessment;
  readonly lockedStyleId: StyleId;
  readonly styleMatchesLocked: boolean;
  readonly timeline: MotionTimeline;
  /** Cues for VisualEffectRuntime / TumbleChoreography. */
  readonly cueSheet: RuntimeCueSheet;
  readonly missingArtIds: readonly string[];
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
 * One call from recipe → assessment + motion plan + runtime cues.
 * This is the studio "recognize and attack" entry point.
 */
export function planFromBlueprint(
  blueprint: Blueprint,
  options?: {
    readonly winCells?: readonly string[];
    readonly overrideStyleId?: StyleId;
    readonly cellsByDepth?: readonly (readonly string[])[];
    readonly cascadeDepth?: number;
    readonly skipReveal?: boolean;
    readonly skipWin?: boolean;
  },
): StudioPlan {
  const assessment = assessGameShape(shapeFromBlueprint(blueprint));
  const lockedStyleId = options?.overrideStyleId ?? blueprint.styleId;
  const styleMatchesLocked = assessment.recommended.includes(lockedStyleId);
  const timeline = planMotionTimeline({
    styleId: lockedStyleId,
    cascadeDepth: options?.cascadeDepth ?? blueprint.cascadeDepth,
    ...(options?.cellsByDepth ? { cellsByDepth: options.cellsByDepth } : {}),
    winCells: options?.winCells ?? [],
    ...(options?.skipReveal ? { skipReveal: true } : {}),
    ...(options?.skipWin ? { skipWin: true } : {}),
  });
  const cueSheet = timelineToRuntimeCues(timeline);
  const missingArtIds = missingArt(blueprint);

  return {
    blueprint,
    assessment,
    lockedStyleId,
    styleMatchesLocked,
    timeline,
    cueSheet,
    missingArtIds,
    readyForArtReview: missingArtIds.length > 0,
    readyForMotionPreview: true,
  };
}
