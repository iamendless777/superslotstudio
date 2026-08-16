import type { RuntimeCue, RuntimeCueSheet } from "../motion/runtime-cues.js";
import { createCuePlayer, type CuePlayer } from "../motion/player.js";

/**
 * Implemented by the presentation runtime (VisualEffectRuntime, etc.).
 * Motion owns *when*; the runtime owns *how it looks*.
 */
export interface MotionRuntimeHost {
  readonly playCue: (cue: RuntimeCue) => void;
  readonly stopCue?: (cue: RuntimeCue) => void;
  readonly onSheetComplete?: () => void;
}

export interface BoundCuePlayback {
  readonly sheet: RuntimeCueSheet;
  readonly player: CuePlayer;
  /** Drive with rAF or a fixed step. Returns false when finished. */
  readonly tick: (elapsedMs: number) => boolean;
  readonly reset: () => void;
}

/**
 * Bind a planned cue sheet to a host runtime.
 * Example:
 *   const playback = bindCueSheet(plan.cueSheet, {
 *     playCue: (c) => visualEffects.play(c.cue, c),
 *   });
 *   // in rAF: playback.tick(performance.now() - t0)
 */
export function bindCueSheet(
  sheet: RuntimeCueSheet,
  host: MotionRuntimeHost,
): BoundCuePlayback {
  const player = createCuePlayer(sheet, {
    onCueStart: (cue) => host.playCue(cue),
    onCueEnd: (cue) => host.stopCue?.(cue),
    onComplete: () => host.onSheetComplete?.(),
  });
  return {
    sheet,
    player,
    tick: (elapsedMs) => player.tick(elapsedMs),
    reset: () => player.reset(),
  };
}

/** Collect unique cue names required by a sheet (for asset/runtime readiness). */
export function requiredCues(
  sheet: RuntimeCueSheet,
): readonly RuntimeCue["cue"][] {
  return [...new Set(sheet.cues.map((c) => c.cue))];
}
