/**
 * Maps motion RuntimeCueName → stake-studio-source action vocabulary.
 *
 * Motion layer owns *when* (cue sheet times).
 * TumbleChoreography / AnimationEngine / VisualEffectRuntime own *how*.
 */

import type { RuntimeCue, RuntimeCueName } from "../motion/runtime-cues.js";

export type TumbleAction =
  | "recognize-clear-set"
  | "react-before-clear"
  | "clear-tile"
  | "hold-space"
  | "stage-entry"
  | "prepare-destination-state"
  | "travel-to-destination"
  | "apply-destination-state"
  | "settle-at-destination"
  | "confirm-destination-state"
  | "request-next-authoritative-evaluation";

export type StudioAnimState =
  | "spinStart"
  | "spinning"
  | "spinStop"
  | "anticipation"
  | "winSmall"
  | "idle";

export type TumblePhase =
  | "recognition"
  | "reaction"
  | "clear"
  | "space"
  | "enter"
  | "fall"
  | "settle"
  | "evaluate";

export interface CueBridgeTarget {
  readonly cue: RuntimeCueName;
  readonly tumblePhase: TumblePhase | null;
  readonly tumbleAction: TumbleAction | null;
  readonly animState: StudioAnimState | null;
  readonly vfxEvent: string | null;
  readonly notes: string;
}

export const CUE_BRIDGE: Readonly<Record<RuntimeCueName, CueBridgeTarget>> = {
  "reel.blur": {
    cue: "reel.blur",
    tumblePhase: null,
    tumbleAction: null,
    animState: "spinning",
    vfxEvent: null,
    notes: "Continuous reel motion before stop.",
  },
  "reel.stop": {
    cue: "reel.stop",
    tumblePhase: null,
    tumbleAction: null,
    animState: "spinStop",
    vfxEvent: null,
    notes: "Per-reel decelerate into final symbols.",
  },
  "reel.anticipation": {
    cue: "reel.anticipation",
    tumblePhase: null,
    tumbleAction: null,
    animState: "anticipation",
    vfxEvent: null,
    notes: "Slow final reel(s); AnimationProfiles anticipation state.",
  },
  "symbol.dropIn": {
    cue: "symbol.dropIn",
    tumblePhase: "enter",
    tumbleAction: "stage-entry",
    animState: "spinStart",
    vfxEvent: null,
    notes: "Initial board populate or cascade enter.",
  },
  "cluster.remove": {
    cue: "cluster.remove",
    tumblePhase: "clear",
    tumbleAction: "clear-tile",
    animState: null,
    vfxEvent: null,
    notes: "TumbleChoreography clear; needs clearedPositions from book.",
  },
  "symbol.pop": {
    cue: "symbol.pop",
    tumblePhase: "reaction",
    tumbleAction: "react-before-clear",
    animState: null,
    vfxEvent: null,
    notes: "Reaction / scale pop on hit cells.",
  },
  "cluster.fall": {
    cue: "cluster.fall",
    tumblePhase: "fall",
    tumbleAction: "travel-to-destination",
    animState: null,
    vfxEvent: null,
    notes: "Requires movement paths from createTumblePlan.",
  },
  "cluster.refill": {
    cue: "cluster.refill",
    tumblePhase: "enter",
    tumbleAction: "stage-entry",
    animState: null,
    vfxEvent: null,
    notes: "New symbols enter from above after fall.",
  },
  "board.settle": {
    cue: "board.settle",
    tumblePhase: "settle",
    tumbleAction: "settle-at-destination",
    animState: null,
    vfxEvent: null,
    notes: "Soft land after fall/refill.",
  },
  "win.pulse": {
    cue: "win.pulse",
    tumblePhase: null,
    tumbleAction: null,
    animState: "winSmall",
    vfxEvent: "winInfo",
    notes: "Cell pulse + optional VisualEffectRuntime winInfo binding.",
  },
  "win.lineTrace": {
    cue: "win.lineTrace",
    tumblePhase: null,
    tumbleAction: null,
    animState: null,
    vfxEvent: "winInfo",
    notes: "Payline trace; presentation-only.",
  },
  "win.multiplierFloat": {
    cue: "win.multiplierFloat",
    tumblePhase: null,
    tumbleAction: null,
    animState: null,
    vfxEvent: "winInfo",
    notes: "Float text for multipliers.",
  },
  "wild.stickyMorph": {
    cue: "wild.stickyMorph",
    tumblePhase: null,
    tumbleAction: null,
    animState: null,
    vfxEvent: null,
    notes: "Wild lock morph; implement in reel/sprite layer.",
  },
  "board.shake": {
    cue: "board.shake",
    tumblePhase: null,
    tumbleAction: null,
    animState: null,
    vfxEvent: "winInfo",
    notes: "Camera/board impulse; VisualEffectRuntime camera node.",
  },
  "symbol.fadeOut": {
    cue: "symbol.fadeOut",
    tumblePhase: "clear",
    tumbleAction: "clear-tile",
    animState: null,
    vfxEvent: null,
    notes: "Alternate clear presentation.",
  },
};

export function resolveCueBridge(cue: RuntimeCueName): CueBridgeTarget {
  const target = CUE_BRIDGE[cue];
  if (!target) {
    throw new RangeError(`No bridge target for cue: ${cue}`);
  }
  return target;
}

export interface HostDispatch {
  readonly onAnimState?: (state: StudioAnimState, cue: RuntimeCue) => void;
  readonly onTumbleAction?: (
    action: TumbleAction,
    phase: TumblePhase,
    cue: RuntimeCue,
  ) => void;
  readonly onVfxEvent?: (event: string, cue: RuntimeCue) => void;
}

/** Dispatch a single runtime cue to the stake studio host hooks. */
export function dispatchCueToStakeHost(
  cue: RuntimeCue,
  host: HostDispatch,
): CueBridgeTarget {
  const target = resolveCueBridge(cue.cue);
  if (target.animState) host.onAnimState?.(target.animState, cue);
  if (target.tumbleAction && target.tumblePhase) {
    host.onTumbleAction?.(target.tumbleAction, target.tumblePhase, cue);
  }
  if (target.vfxEvent) host.onVfxEvent?.(target.vfxEvent, cue);
  return target;
}
