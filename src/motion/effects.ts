/** Versioned primitive motion effects. Pure data — no rendering. */

export const MOTION_CATALOG_VERSION = 1 as const;

export type EasingId =
  | "linear"
  | "quad-out"
  | "quad-in-out"
  | "cubic-out"
  | "back-out"
  | "elastic-out";

export type EffectId =
  | "spin-blur"
  | "spin-stop"
  | "drop-in"
  | "cascade-remove"
  | "cascade-fall"
  | "refill-drop"
  | "settle"
  | "win-pulse"
  | "win-line-trace"
  | "multiplier-float"
  | "anticipation-slow"
  | "sticky-morph"
  | "grid-shake"
  | "fade-out"
  | "pop-scale";

export interface EffectDefinition {
  readonly id: EffectId;
  readonly defaultDurationMs: number;
  readonly defaultEasing: EasingId;
  /** Stagger between targeted cells/reels when the effect applies to many. */
  readonly defaultStaggerMs: number;
  readonly description: string;
}

export const EFFECT_CATALOG: Readonly<Record<EffectId, EffectDefinition>> = {
  "spin-blur": {
    id: "spin-blur",
    defaultDurationMs: 400,
    defaultEasing: "linear",
    defaultStaggerMs: 40,
    description: "Continuous reel motion blur before stop.",
  },
  "spin-stop": {
    id: "spin-stop",
    defaultDurationMs: 280,
    defaultEasing: "back-out",
    defaultStaggerMs: 60,
    description: "Per-reel decelerate and snap into final position.",
  },
  "drop-in": {
    id: "drop-in",
    defaultDurationMs: 320,
    defaultEasing: "cubic-out",
    defaultStaggerMs: 30,
    description: "Symbols enter from above into empty cells.",
  },
  "cascade-remove": {
    id: "cascade-remove",
    defaultDurationMs: 220,
    defaultEasing: "quad-in-out",
    defaultStaggerMs: 20,
    description: "Winning cluster cells shrink/pop out before fall.",
  },
  "cascade-fall": {
    id: "cascade-fall",
    defaultDurationMs: 300,
    defaultEasing: "quad-out",
    defaultStaggerMs: 25,
    description: "Remaining symbols fall into gaps after removal.",
  },
  "refill-drop": {
    id: "refill-drop",
    defaultDurationMs: 340,
    defaultEasing: "cubic-out",
    defaultStaggerMs: 28,
    description: "New symbols drop from above to fill emptied columns.",
  },
  settle: {
    id: "settle",
    defaultDurationMs: 120,
    defaultEasing: "quad-out",
    defaultStaggerMs: 0,
    description: "Soft bounce/settle after motion completes.",
  },
  "win-pulse": {
    id: "win-pulse",
    defaultDurationMs: 450,
    defaultEasing: "elastic-out",
    defaultStaggerMs: 15,
    description: "Highlight winning cells with scale/glow pulse.",
  },
  "win-line-trace": {
    id: "win-line-trace",
    defaultDurationMs: 500,
    defaultEasing: "quad-out",
    defaultStaggerMs: 40,
    description: "Trace payline path across winning symbols.",
  },
  "multiplier-float": {
    id: "multiplier-float",
    defaultDurationMs: 600,
    defaultEasing: "cubic-out",
    defaultStaggerMs: 0,
    description: "Multiplier text floats up and fades.",
  },
  "anticipation-slow": {
    id: "anticipation-slow",
    defaultDurationMs: 700,
    defaultEasing: "quad-out",
    defaultStaggerMs: 80,
    description: "Final reel(s) slow deliberately before stop.",
  },
  "sticky-morph": {
    id: "sticky-morph",
    defaultDurationMs: 360,
    defaultEasing: "back-out",
    defaultStaggerMs: 20,
    description: "Wild expands or locks into sticky state.",
  },
  "grid-shake": {
    id: "grid-shake",
    defaultDurationMs: 180,
    defaultEasing: "linear",
    defaultStaggerMs: 0,
    description: "Whole-grid impact shake on big win or cascade start.",
  },
  "fade-out": {
    id: "fade-out",
    defaultDurationMs: 200,
    defaultEasing: "quad-in-out",
    defaultStaggerMs: 15,
    description: "Opacity fade for exiting symbols.",
  },
  "pop-scale": {
    id: "pop-scale",
    defaultDurationMs: 260,
    defaultEasing: "back-out",
    defaultStaggerMs: 12,
    description: "Quick scale pop for hits and UI feedback.",
  },
};

export function getEffect(id: EffectId): EffectDefinition {
  return EFFECT_CATALOG[id];
}

export function listEffectIds(): readonly EffectId[] {
  return Object.keys(EFFECT_CATALOG) as EffectId[];
}
