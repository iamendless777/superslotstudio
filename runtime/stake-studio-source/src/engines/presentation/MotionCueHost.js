/**
 * MotionCueHost — plays a planned motion cue sheet inside stake-studio-source.
 *
 * Timing authority: the cue sheet (from src/motion on the domain side).
 * Pixel authority: PresentationDirectorRuntime, TumbleChoreography, AnimationEngine.
 *
 * This module is intentionally plain JS with no import of the TypeScript motion
 * package so the studio can run standalone. Keep CUE_BRIDGE in sync with
 * src/studio/stake-runtime-bridge.ts.
 */

import { PresentationDirectorRuntime } from './PresentationDirector.js';

export const MOTION_CUE_HOST_VERSION = 1;

/** @typedef {{ cue: string, startMs: number, durationMs: number, easing?: string, staggerMs?: number, cells?: string[], stepKind?: string, depth?: number }} MotionCue */
/** @typedef {{ styleId: string, catalogVersion?: number, totalDurationMs: number, cues: MotionCue[] }} MotionCueSheet */

export const CUE_BRIDGE = Object.freeze({
  'reel.blur': { animState: 'spinning', presentationEvent: null, tumbleAction: null, tumblePhase: null, vfxEvent: null },
  'reel.stop': { animState: 'spinStop', presentationEvent: 'reveal', tumbleAction: null, tumblePhase: null, vfxEvent: null },
  'reel.anticipation': { animState: 'anticipation', presentationEvent: 'anticipation', tumbleAction: null, tumblePhase: null, vfxEvent: null },
  'symbol.dropIn': { animState: 'spinStart', presentationEvent: null, tumbleAction: 'stage-entry', tumblePhase: 'enter', vfxEvent: null },
  'cluster.remove': { animState: null, presentationEvent: 'tumbleBoard', tumbleAction: 'clear-tile', tumblePhase: 'clear', vfxEvent: null },
  'symbol.pop': { animState: null, presentationEvent: null, tumbleAction: 'react-before-clear', tumblePhase: 'reaction', vfxEvent: null },
  'cluster.fall': { animState: null, presentationEvent: 'tumbleBoard', tumbleAction: 'travel-to-destination', tumblePhase: 'fall', vfxEvent: null },
  'cluster.refill': { animState: null, presentationEvent: 'tumbleBoard', tumbleAction: 'stage-entry', tumblePhase: 'enter', vfxEvent: null },
  'board.settle': { animState: null, presentationEvent: null, tumbleAction: 'settle-at-destination', tumblePhase: 'settle', vfxEvent: null },
  'win.pulse': { animState: 'winSmall', presentationEvent: 'winInfo', tumbleAction: null, tumblePhase: null, vfxEvent: 'winInfo' },
  'win.lineTrace': { animState: null, presentationEvent: 'winInfo', tumbleAction: null, tumblePhase: null, vfxEvent: 'winInfo' },
  'win.multiplierFloat': { animState: null, presentationEvent: 'setWin', tumbleAction: null, tumblePhase: null, vfxEvent: 'winInfo' },
  'wild.stickyMorph': { animState: null, presentationEvent: null, tumbleAction: null, tumblePhase: null, vfxEvent: null },
  'board.shake': { animState: null, presentationEvent: 'wincap', tumbleAction: null, tumblePhase: null, vfxEvent: 'winInfo' },
  'symbol.fadeOut': { animState: null, presentationEvent: null, tumbleAction: 'clear-tile', tumblePhase: 'clear', vfxEvent: null },
});

export function resolveCueBridge(cueName) {
  const target = CUE_BRIDGE[cueName];
  if (!target) throw new RangeError(`No bridge target for cue: ${cueName}`);
  return target;
}

function parseCell(cell) {
  if (typeof cell !== 'string') return null;
  const [reel, row] = cell.split(':').map(Number);
  if (!Number.isInteger(reel) || !Number.isInteger(row)) return null;
  return { reel, row };
}

/**
 * @param {object} options
 * @param {object} [options.project] presentation director project blob
 * @param {(cue: MotionCue, bridge: object) => void} [options.onCue]
 * @param {(state: string, cue: MotionCue) => void} [options.onAnimState]
 * @param {(action: string, phase: string, cue: MotionCue) => void} [options.onTumbleAction]
 * @param {(event: string, cue: MotionCue) => void} [options.onPresentationEvent]
 * @param {(item: object, payload: object) => void} [options.executePresentation]
 * @param {(ms: number) => Promise<void>} [options.wait]
 */
export function createMotionCueHost(options = {}) {
  const project = options.project || { presentationDirector: null };
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
    options.onCue?.(cue, bridge);
    if (bridge.animState) options.onAnimState?.(bridge.animState, cue);
    if (bridge.tumbleAction && bridge.tumblePhase) {
      options.onTumbleAction?.(bridge.tumbleAction, bridge.tumblePhase, cue);
    }
    if (bridge.presentationEvent) {
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
      // Fire-and-forget; host clock owns overall sequence timing.
      void director.dispatch(bridge.presentationEvent, payload);
    }
  }

  return {
    version: MOTION_CUE_HOST_VERSION,
    director,

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
 * @param {MotionCueSheet} cueSheet
 * @param {object} hostOptions same as createMotionCueHost
 * @param {number} [stepMs=16]
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
