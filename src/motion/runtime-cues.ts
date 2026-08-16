import type { EffectId } from "./effects.js";
import type { EffectInstance, MotionTimeline } from "./timeline.js";

/**
 * Stable cue names for the presentation runtime (VisualEffectRuntime /
 * TumbleChoreography / AnimationEngine). The motion layer owns planning;
 * the runtime owns pixels. Keep this map the only coupling point.
 */
export type RuntimeCueName =
  | "reel.blur"
  | "reel.stop"
  | "symbol.dropIn"
  | "cluster.remove"
  | "cluster.fall"
  | "cluster.refill"
  | "board.settle"
  | "win.pulse"
  | "win.lineTrace"
  | "win.multiplierFloat"
  | "reel.anticipation"
  | "wild.stickyMorph"
  | "board.shake"
  | "symbol.fadeOut"
  | "symbol.pop";

export const EFFECT_TO_RUNTIME_CUE: Readonly<Record<EffectId, RuntimeCueName>> =
  {
    "spin-blur": "reel.blur",
    "spin-stop": "reel.stop",
    "drop-in": "symbol.dropIn",
    "cascade-remove": "cluster.remove",
    "cascade-fall": "cluster.fall",
    "refill-drop": "cluster.refill",
    settle: "board.settle",
    "win-pulse": "win.pulse",
    "win-line-trace": "win.lineTrace",
    "multiplier-float": "win.multiplierFloat",
    "anticipation-slow": "reel.anticipation",
    "sticky-morph": "wild.stickyMorph",
    "grid-shake": "board.shake",
    "fade-out": "symbol.fadeOut",
    "pop-scale": "symbol.pop",
  };

export interface RuntimeCue {
  readonly cue: RuntimeCueName;
  readonly effectId: EffectId;
  readonly startMs: number;
  readonly durationMs: number;
  readonly easing: EffectInstance["easing"];
  readonly staggerMs: number;
  readonly cells: readonly string[];
  readonly stepKind: EffectInstance["stepKind"];
  readonly depth: number;
}

export interface RuntimeCueSheet {
  readonly styleId: MotionTimeline["styleId"];
  readonly catalogVersion: 1;
  readonly totalDurationMs: number;
  readonly cues: readonly RuntimeCue[];
}

/** Convert a planned motion timeline into runtime cues the studio can play. */
export function timelineToRuntimeCues(
  timeline: MotionTimeline,
): RuntimeCueSheet {
  const cues = timeline.effects.map((effect) => ({
    cue: EFFECT_TO_RUNTIME_CUE[effect.effectId],
    effectId: effect.effectId,
    startMs: effect.startMs,
    durationMs: effect.durationMs,
    easing: effect.easing,
    staggerMs: effect.staggerMs,
    cells: effect.cells,
    stepKind: effect.stepKind,
    depth: effect.depth,
  }));
  return {
    styleId: timeline.styleId,
    catalogVersion: 1,
    totalDurationMs: timeline.totalDurationMs,
    cues,
  };
}

export function listRuntimeCueNames(): readonly RuntimeCueName[] {
  return [...new Set(Object.values(EFFECT_TO_RUNTIME_CUE))];
}
