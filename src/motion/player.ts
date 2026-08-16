import type { RuntimeCue, RuntimeCueSheet } from "./runtime-cues.js";

export interface CuePlayerHandlers {
  readonly onCueStart?: (cue: RuntimeCue, index: number) => void;
  readonly onCueEnd?: (cue: RuntimeCue, index: number) => void;
  readonly onComplete?: () => void;
}

export interface CuePlayer {
  readonly sheet: RuntimeCueSheet;
  /** Advance virtual clock. Returns true while still playing. */
  readonly tick: (elapsedMs: number) => boolean;
  readonly reset: () => void;
  readonly isComplete: () => boolean;
}

/**
 * Deterministic, clock-driven player. No rAF, no DOM — the studio supplies
 * time and handles onCueStart (e.g. VisualEffectRuntime.play(cue)).
 */
export function createCuePlayer(
  sheet: RuntimeCueSheet,
  handlers: CuePlayerHandlers = {},
): CuePlayer {
  const started = new Set<number>();
  const ended = new Set<number>();
  let complete = sheet.cues.length === 0;

  function finishIfDone(): void {
    if (!complete && ended.size === sheet.cues.length) {
      complete = true;
      handlers.onComplete?.();
    }
  }

  return {
    sheet,
    tick(elapsedMs: number): boolean {
      if (complete) return false;
      for (const [index, cue] of sheet.cues.entries()) {
        if (!started.has(index) && elapsedMs >= cue.startMs) {
          started.add(index);
          handlers.onCueStart?.(cue, index);
        }
        const endAt = cue.startMs + cue.durationMs;
        if (started.has(index) && !ended.has(index) && elapsedMs >= endAt) {
          ended.add(index);
          handlers.onCueEnd?.(cue, index);
        }
      }
      finishIfDone();
      return !complete;
    },
    reset(): void {
      started.clear();
      ended.clear();
      complete = sheet.cues.length === 0;
    },
    isComplete(): boolean {
      return complete;
    },
  };
}
