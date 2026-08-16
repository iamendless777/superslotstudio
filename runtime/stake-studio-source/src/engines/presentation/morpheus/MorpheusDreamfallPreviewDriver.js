import {
  createDreamfallSignatureTrace,
  hashMorpheusProtocolValue,
} from '../../morpheus/MorpheusEventProtocol.js';
import {
  MorpheusDreamfallRuntime,
  runMorpheusDreamfallSignatureProjection,
} from './MorpheusDreamfallRuntime.js';
import { hashMorpheusPresentationValue } from './MorpheusDreamfallPresentation.js';

export const MORPHEUS_DREAMFALL_PREVIEW_FORMAT = 'morpheus-dreamfall-preview-driver-v1';
export const MORPHEUS_DREAMFALL_PROJECT_ID = 'morpheus_dreamfall';
export const MORPHEUS_RESERVED_WORLD_ROWS = 8;

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function motionMode(value) {
  if (['normal', 'fast', 'reduced'].includes(value)) return value;
  throw new Error(`Unsupported Morpheus Preview motion mode "${value}".`);
}

function cancelled(reason) {
  const error = new Error(`Morpheus Dreamfall Preview cancelled: ${reason}.`);
  error.name = 'MorpheusDreamfallPreviewCancellation';
  return error;
}

function renderWithCancellation(renderPromise, signal, reason) {
  if (signal.aborted) return Promise.reject(cancelled(reason()));
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelled(reason()));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(renderPromise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function checkpointHud(hud = {}) {
  return {
    chainHit: Number(hud.chainHit) || 0,
    freeSpinsRemaining: Number(hud.freeSpinsRemaining) || 0,
    awardedFreeSpins: Number(hud.awardedFreeSpins) || 0,
    runningWin: Number(hud.runningWin) || 0,
    reelRows: [...(hud.reelRows || [])].map(Number),
  };
}

function checkpointProjection(value = {}) {
  return {
    board: clone(value.board || []),
    reelRows: [...(value.reelRows || [])].map(Number),
    hud: checkpointHud(value.hud),
  };
}

/** Bind authoritative runtime state to separately observed DOM state. */
export function createMorpheusPreviewObservationProof(runtimeState, observedState) {
  const expectedProjection = checkpointProjection(runtimeState);
  const observedProjection = checkpointProjection(observedState);
  const expected = {
    boardHash: hashMorpheusPresentationValue(expectedProjection.board),
    stateHash: hashMorpheusPresentationValue(expectedProjection),
    reelRows: expectedProjection.reelRows,
    hud: expectedProjection.hud,
  };
  const observed = {
    boardHash: hashMorpheusPresentationValue(observedProjection.board),
    stateHash: hashMorpheusPresentationValue(observedProjection),
    reelRows: observedProjection.reelRows,
    hud: observedProjection.hud,
  };
  return {
    passed: JSON.stringify(expected) === JSON.stringify(observed),
    expected,
    observed,
  };
}

/** Pure geometry shared by the existing DOM reel renderer and layout proofs. */
export function createMorpheusReservedWorldLayout({
  worldHeight,
  reelRows,
  maximumRows = MORPHEUS_RESERVED_WORLD_ROWS,
}) {
  const height = Number(worldHeight);
  const rows = [...(reelRows || [])].map(Number);
  if (!(height > 0)) throw new Error('Morpheus reserved world requires a positive height.');
  if (rows.length !== 6 || rows.some(value => !Number.isInteger(value) || value < 4 || value > maximumRows)) {
    throw new Error(`Morpheus reserved world requires six reel heights within 4-${maximumRows}.`);
  }
  const cellHeight = height / maximumRows;
  return {
    maximumRows,
    cellHeight,
    worldHeight: height,
    reels: rows.map((rowCount, reel) => {
      const top = (maximumRows - rowCount) * cellHeight;
      return {
        reel,
        rows: rowCount,
        mask: { top, height: rowCount * cellHeight, bottom: height },
        cap: { top, bottom: top },
      };
    }),
  };
}

/**
 * Drives the authoritative trace without owning a renderer. The supplied hook
 * commits commands into PreviewPanel's existing reel/HUD/VFX surfaces, then
 * the driver issues the exact runtime acknowledgement.
 */
export class MorpheusDreamfallPreviewDriver {
  constructor({
    events = createDreamfallSignatureTrace().events,
    checkpoint = null,
    motion = 'normal',
    renderCommand = async () => {},
    commitFinal = async () => {},
    onCheckpoint = async () => {},
    onStatus = () => {},
  } = {}) {
    this.events = events;
    this.sourceEventHash = hashMorpheusProtocolValue(events);
    this.motionMode = motionMode(motion);
    this.renderCommand = renderCommand;
    this.commitFinal = commitFinal;
    this.onCheckpoint = onCheckpoint;
    this.onStatus = onStatus;
    this.checkpoint = checkpoint;
    this.generation = 0;
    this.controller = null;
    this.runtime = null;
    this.playPromise = null;
    this.report = null;
    this.status = 'idle';
    this.reason = null;
    this.activeEvent = null;
    this.lastCheckpoint = checkpoint;
  }

  snapshot() {
    return {
      format: MORPHEUS_DREAMFALL_PREVIEW_FORMAT,
      status: this.status,
      reason: this.reason,
      motionMode: this.motionMode,
      activeEvent: clone(this.activeEvent),
      sourceEventHash: this.sourceEventHash,
      nextEventIndex: this.runtime?.nextEventIndex ?? this.report?.nextEventIndex ?? this.lastCheckpoint?.nextEventIndex ?? 0,
      pendingAcknowledgement: clone(this.runtime?.pendingAcknowledgement || null),
      hud: clone(this.runtime?.state?.hud || this.report?.state?.hud || null),
      reelRows: clone(this.runtime?.state?.reelRows || this.report?.state?.reelRows || null),
      causalPhase: this.runtime?.state?.causalPhase || this.report?.state?.causalPhase || null,
      sliceComplete: Boolean(this.runtime?.state?.sliceComplete || this.report?.sliceComplete),
      fullRoundFinalized: Boolean(this.runtime?.state?.fullRoundFinalized || this.report?.fullRoundFinalized),
      checkpointHash: this.lastCheckpoint?.checkpointHash || null,
      report: clone(this.report),
    };
  }

  publish() {
    this.onStatus(clone(this.snapshot()));
  }

  async play() {
    if (this.playPromise) return this.playPromise;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.status = 'playing';
    this.reason = null;
    this.report = null;
    this.runtime = new MorpheusDreamfallRuntime({ motionMode: this.motionMode, checkpoint: this.checkpoint });
    this.publish();

    this.playPromise = this.run(generation, controller.signal).finally(() => {
      if (generation === this.generation) {
        this.controller = null;
        this.playPromise = null;
      }
    });
    return this.playPromise;
  }

  async run(generation, signal) {
    const runtime = this.runtime;
    try {
      for (let index = runtime.nextEventIndex; index < this.events.length; index++) {
        if (signal.aborted || generation !== this.generation) throw cancelled(this.reason || 'superseded');
        const sourceEvent = this.events[index];
        const command = runtime.dispatch(sourceEvent);
        this.activeEvent = { index: sourceEvent.index, type: sourceEvent.type, semanticHash: command.semanticHash };
        this.publish();
        await renderWithCancellation(this.renderCommand({
          command: clone(command),
          sourceEvent,
          signal,
          immediate: command.presentation?.motionMode === 'reduced',
        }), signal, () => this.reason || 'superseded');
        if (signal.aborted || generation !== this.generation) throw cancelled(this.reason || 'superseded');
        let blockingProof = { attempted: false, rejected: false, error: null };
        if (runtime.pendingAcknowledgement) {
          blockingProof = { attempted: true, rejected: false, error: null };
          try {
            runtime.dispatch(this.events[index + 1] || sourceEvent);
          } catch (error) {
            blockingProof.error = String(error?.message || error);
            blockingProof.rejected = /is blocked until/.test(blockingProof.error);
            if (!blockingProof.rejected) throw error;
          }
          if (!blockingProof.rejected) throw new Error(`Morpheus Preview event ${sourceEvent.index} did not block premature dispatch.`);
        }
        const nextEventBlockedBeforeAck = blockingProof.rejected;
        const acknowledgement = command.acknowledgement?.required
          ? runtime.acknowledge(command.acknowledgement.id, command.acknowledgement.expectedEvidence)
          : null;
        const runtimeSnapshot = runtime.snapshot();
        await this.onCheckpoint({
          command: clone(command),
          sourceEvent,
          acknowledgement: clone(acknowledgement),
          nextEventBlockedBeforeAck,
          blockingProof: clone(blockingProof),
          runtime: runtimeSnapshot,
        });
        if (signal.aborted || generation !== this.generation) throw cancelled(this.reason || 'superseded');
        this.lastCheckpoint = runtime.checkpoint();
        this.publish();
      }
      if (hashMorpheusProtocolValue(this.events) !== this.sourceEventHash) {
        throw new Error('Morpheus Dreamfall source events mutated during Preview playback.');
      }
      this.report = runtime.report();
      this.status = 'completed';
      this.activeEvent = null;
      this.publish();
      return clone(this.report);
    } catch (error) {
      if (generation !== this.generation || signal.aborted) throw cancelled(this.reason || 'superseded');
      this.status = 'failed';
      this.reason = String(error?.message || error);
      this.activeEvent = null;
      this.publish();
      throw error;
    }
  }

  cancel(reason = 'cancelled') {
    this.reason = String(reason);
    this.generation += 1;
    this.controller?.abort(this.reason);
    this.controller = null;
    this.runtime = null;
    this.playPromise = null;
    this.activeEvent = null;
    this.status = 'cancelled';
    this.publish();
    return this.snapshot();
  }

  async finishImmediately(reason = 'finish-immediately') {
    this.reason = String(reason);
    this.generation += 1;
    this.controller?.abort(this.reason);
    this.controller = null;
    this.playPromise = null;
    this.activeEvent = null;
    this.runtime = null;
    const report = runMorpheusDreamfallSignatureProjection(this.events, { motionMode: 'reduced' });
    if (hashMorpheusProtocolValue(this.events) !== this.sourceEventHash) {
      throw new Error('Morpheus Dreamfall source events mutated during immediate Preview settlement.');
    }
    await this.commitFinal({ report: clone(report), reason: this.reason, immediate: true });
    this.report = report;
    this.status = 'completed';
    this.lastCheckpoint = null;
    this.publish();
    return clone(report);
  }
}
