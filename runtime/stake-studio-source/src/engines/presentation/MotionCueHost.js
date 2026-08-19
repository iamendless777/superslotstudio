/**
 * MotionCueHost — plays a planned motion cue sheet inside stake-studio-source.
 *
 * Timing authority: the cue sheet (from src/motion on the domain side).
 * Pixel authority for cascades: PreviewPanel.playStakeTumble (not this host).
 * This host remains the classic-nine / reel-cue clock.
 *
 * IMPORTANT: presentationEvent values must be SAFE for motion rehearsal.
 * Never map board.shake → wincap or win.pulse → setWin; those fire full
 * max-win / payout overlays and make cascade previews look broken.
 *
 * Rehearsal default: presentation events are NOT dispatched unless
 * allowPresentationEvents is explicitly true.
 */

import { PresentationDirectorRuntime } from './PresentationDirector.js';

export const MOTION_CUE_HOST_VERSION = 3;

/** @typedef {{ cue: string, startMs: number, durationMs: number, easing?: string, staggerMs?: number, cells?: string[], stepKind?: string, depth?: number }} MotionCue */
/** @typedef {{ styleId: string, catalogVersion?: number, totalDurationMs: number, cues: MotionCue[] }} MotionCueSheet */

export const CUE_BRIDGE = Object.freeze({
  'reel.blur': { animState: 'spinning', presentationEvent: null, tumbleAction: null, tumblePhase: null, vfxEvent: null },
  'reel.stop': { animState: 'spinStop', presentationEvent: 'reveal', tumbleAction: null, tumblePhase: null, vfxEvent: null },
  'reel.anticipation': { animState: 'anticipation', presentationEvent: 'anticipation', tumbleAction: null, tumblePhase: null, vfxEvent: null },
  // Cascade rehearsal must not kick spinStart. Classic-nine uses reel.blur/stop.
  'symbol.dropIn': { animState: null, presentationEvent: null, tumbleAction: 'stage-entry', tumblePhase: 'enter', vfxEvent: null },
  'cluster.remove': { animState: null, presentationEvent: null, tumbleAction: 'clear-tile', tumblePhase: 'clear', vfxEvent: null },
  'symbol.pop': { animState: null, presentationEvent: null, tumbleAction: 'react-before-clear', tumblePhase: 'reaction', vfxEvent: null },
  'cluster.fall': { animState: null, presentationEvent: null, tumbleAction: 'travel-to-destination', tumblePhase: 'fall', vfxEvent: null },
  'cluster.refill': { animState: null, presentationEvent: null, tumbleAction: 'stage-entry', tumblePhase: 'enter', vfxEvent: null },
  'board.settle': { animState: null, presentationEvent: null, tumbleAction: 'settle-at-destination', tumblePhase: 'settle', vfxEvent: null },
  'win.pulse': { animState: 'winSmall', presentationEvent: null, tumbleAction: 'win-highlight', tumblePhase: 'win', vfxEvent: null },
  'win.lineTrace': { animState: null, presentationEvent: null, tumbleAction: 'win-highlight', tumblePhase: 'win', vfxEvent: null },
  'win.multiplierFloat': { animState: null, presentationEvent: null, tumbleAction: null, tumblePhase: null, vfxEvent: null },
  'wild.stickyMorph': { animState: null, presentationEvent: null, tumbleAction: null, tumblePhase: null, vfxEvent: null },
  'board.shake': { animState: null, presentationEvent: null, tumbleAction: null, tumblePhase: null, vfxEvent: null },
  'symbol.fadeOut': { animState: null, presentationEvent: null, tumbleAction: 'clear-tile', tumblePhase: 'clear', vfxEvent: null },
});

export function resolveCueBridge(cueName, { strict = false } = {}) {
  const target = CUE_BRIDGE[cueName];
  if (target) return target;
  if (strict) throw new RangeError(`No bridge target for cue: ${cueName}`);
  return null;
}

function parseCell(cell) {
  if (typeof cell !== 'string') return null;
  const [reel, row] = cell.split(':').map(Number);
  if (!Number.isInteger(reel) || !Number.isInteger(row)) return null;
  return { reel, row };
}

/**
 * @param {object} options
 * @param {object} [options.project]
 * @param {boolean} [options.allowPresentationEvents=false]
 * @param {(message: string, cue: MotionCue) => void} [options.onWarn]
 */
export function createMotionCueHost(options = {}) {
  const project = options.project || { presentationDirector: null };
  const allowPresentationEvents = options.allowPresentationEvents === true;
  const director = new PresentationDirectorRuntime(project, {
    execute: options.executePresentation || (() => {}),
    wait: options.wait,
  });

  const started = new Set();
  /** @type {MotionCueSheet | null} */
  let sheet = null;
  let complete = true;

  function dispatchCue(cue) {
    const bridge = resolveCueBridge(cue.cue);
    if (!bridge) {
      const message = `unknown cue skipped: ${cue.cue}`;
      options.onWarn?.(message, cue);
      console.warn(`[motion] ${message}`);
      return;
    }
    options.onCue?.(cue, bridge);
    if (bridge.animState) options.onAnimState?.(bridge.animState, cue);
    if (bridge.tumbleAction && bridge.tumblePhase) {
      options.onTumbleAction?.(bridge.tumbleAction, bridge.tumblePhase, cue);
    }
    if (allowPresentationEvents && bridge.presentationEvent) {
      const cells = (cue.cells || []).map(parseCell).filter(Boolean);
      const payload = {
        cells,
        wins: cells.length
          ? [{ positions: cells.map((c) => [c.reel, c.row]) }]
          : [],
        amount: 0,
        depth: cue.depth ?? 0,
        stepKind: cue.stepKind,
        motionCue: cue.cue,
      };
      options.onPresentationEvent?.(bridge.presentationEvent, cue);
      void director.dispatch(bridge.presentationEvent, payload);
    }
  }

  return {
    version: MOTION_CUE_HOST_VERSION,
    director,
    allowPresentationEvents,

    /** @param {MotionCueSheet} next */
    load(next) {
      if (!next || !Array.isArray(next.cues)) {
        throw new TypeError('cue sheet requires cues[]');
      }
      sheet = next;
      started.clear();
      complete = next.cues.length === 0;
    },

    /**
     * Advance virtual clock. Returns true while cues remain.
     * @param {number} elapsedMs
     */
    tick(elapsedMs) {
      if (!sheet || complete) return false;
      for (const [index, cue] of sheet.cues.entries()) {
        if (!started.has(index) && elapsedMs >= cue.startMs) {
          started.add(index);
          dispatchCue(cue);
        }
      }
      if (started.size >= sheet.cues.length && elapsedMs >= sheet.totalDurationMs) {
        complete = true;
        options.onComplete?.(sheet);
        return false;
      }
      return !complete;
    },

    reset() {
      started.clear();
      complete = !sheet || sheet.cues.length === 0;
      director.cancel('reset');
    },

    isComplete() {
      return complete;
    },

    getSheet() {
      return sheet;
    },
  };
}

/**
 * Convenience: play an entire sheet with rAF-style stepping via wait().
 */
export async function playCueSheet(cueSheet, hostOptions = {}, stepMs = 16) {
  const host = createMotionCueHost(hostOptions);
  host.load(cueSheet);
  const wait = hostOptions.wait || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let elapsed = 0;
  while (host.tick(elapsed)) {
    await wait(stepMs);
    elapsed += stepMs;
  }
  return host;
}
