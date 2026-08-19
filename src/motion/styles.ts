import type { EffectId } from "./effects.js";
import type { TumbleStepKind } from "./tumble.js";

export type StyleId =
  | "classic-lines"
  | "cluster-snap"
  | "cluster-fluid"
  | "sticky-lock"
  | "anticipation-heavy";

export type WinTypeHint = "lines" | "ways" | "cluster" | "scatter" | "mixed";

export interface StyleCapabilities {
  readonly winTypes: readonly WinTypeHint[];
  /** Supports multi-depth cascade pipelines. */
  readonly tumble: boolean;
  readonly stickyWilds: boolean;
  readonly anticipation: boolean;
  readonly minColumns: number;
  readonly maxColumns: number;
  readonly minRows: number;
  readonly maxRows: number;
}

export interface StyleProfile {
  readonly id: StyleId;
  readonly label: string;
  readonly description: string;
  readonly capabilities: StyleCapabilities;
  /** Ordered effects for the initial board reveal / spin stop. */
  readonly revealEffects: readonly EffectId[];
  /** Map tumble step kinds to ordered effects. Missing kinds = no motion. */
  readonly tumbleEffects: Readonly<Partial<Record<TumbleStepKind, readonly EffectId[]>>>;
  /** Effects used when highlighting wins (after evaluate). */
  readonly winEffects: readonly EffectId[];
}

export const STYLE_PROFILES: Readonly<Record<StyleId, StyleProfile>> = {
  "classic-lines": {
    id: "classic-lines",
    label: "Classic Lines",
    description:
      "Traditional reel spin-stop with payline trace. No cascade motion.",
    capabilities: {
      winTypes: ["lines", "ways"],
      tumble: false,
      stickyWilds: false,
      anticipation: false,
      minColumns: 3,
      maxColumns: 6,
      minRows: 3,
      maxRows: 5,
    },
    revealEffects: ["spin-blur", "spin-stop", "settle"],
    tumbleEffects: {
      settle: ["settle"],
      evaluate: [],
    },
    winEffects: ["win-line-trace", "win-pulse"],
  },
  "cluster-snap": {
    id: "cluster-snap",
    label: "Cluster Snap",
    description:
      "Sharp remove → fall → refill with short staggers. Punchy cascade feel.",
    capabilities: {
      winTypes: ["cluster"],
      tumble: true,
      stickyWilds: false,
      anticipation: false,
      minColumns: 5,
      maxColumns: 8,
      minRows: 5,
      maxRows: 8,
    },
    revealEffects: ["drop-in", "settle"],
    tumbleEffects: {
      remove: ["pop-scale", "cascade-remove"],
      fall: ["cascade-fall"],
      refill: ["refill-drop"],
      settle: ["settle"],
      evaluate: [],
    },
    winEffects: ["win-pulse", "grid-shake"],
  },
  "cluster-fluid": {
    id: "cluster-fluid",
    label: "Cluster Fluid",
    description:
      "Softer, longer cascade timings for premium cluster games.",
    capabilities: {
      winTypes: ["cluster"],
      tumble: true,
      stickyWilds: false,
      anticipation: false,
      minColumns: 5,
      maxColumns: 8,
      minRows: 5,
      maxRows: 8,
    },
    revealEffects: ["drop-in", "settle"],
    tumbleEffects: {
      remove: ["fade-out", "cascade-remove"],
      fall: ["cascade-fall"],
      refill: ["refill-drop"],
      settle: ["settle"],
      evaluate: [],
    },
    winEffects: ["win-pulse", "multiplier-float"],
  },
  "sticky-lock": {
    id: "sticky-lock",
    label: "Sticky Lock",
    description:
      "Lines/ways base with sticky wild morph and lock emphasis.",
    capabilities: {
      winTypes: ["lines", "ways", "mixed"],
      tumble: false,
      stickyWilds: true,
      anticipation: false,
      minColumns: 3,
      maxColumns: 6,
      minRows: 3,
      maxRows: 5,
    },
    revealEffects: ["spin-blur", "spin-stop", "settle"],
    tumbleEffects: {
      settle: ["settle"],
      evaluate: [],
    },
    winEffects: ["sticky-morph", "win-pulse", "win-line-trace"],
  },
  "anticipation-heavy": {
    id: "anticipation-heavy",
    label: "Anticipation Heavy",
    description:
      "Classic spin with deliberate final-reel slowdown before stop.",
    capabilities: {
      winTypes: ["lines", "ways", "scatter"],
      tumble: false,
      stickyWilds: false,
      anticipation: true,
      minColumns: 3,
      maxColumns: 6,
      minRows: 3,
      maxRows: 5,
    },
    revealEffects: ["spin-blur", "anticipation-slow", "spin-stop", "settle"],
    tumbleEffects: {
      settle: ["settle"],
      evaluate: [],
    },
    winEffects: ["win-line-trace", "win-pulse", "multiplier-float"],
  },
};

export function getStyle(id: StyleId): StyleProfile {
  return STYLE_PROFILES[id];
}

export function listStyleIds(): readonly StyleId[] {
  return Object.keys(STYLE_PROFILES) as StyleId[];
}
