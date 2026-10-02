import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CUE_BRIDGE,
  createMotionCueHost,
  playCueSheet,
  resolveCueBridge,
} from '../src/engines/presentation/MotionCueHost.js';

const sampleClusterSheet = {
  styleId: 'cluster-snap',
  catalogVersion: 1,
  totalDurationMs: 1200,
  cues: [
    { cue: 'symbol.dropIn', startMs: 0, durationMs: 320, stepKind: 'reveal', depth: 0, cells: [] },
    { cue: 'cluster.remove', startMs: 320, durationMs: 220, stepKind: 'remove', depth: 0, cells: ['0:1'] },
    { cue: 'cluster.fall', startMs: 540, durationMs: 300, stepKind: 'fall', depth: 0, cells: [] },
    { cue: 'board.settle', startMs: 840, durationMs: 120, stepKind: 'settle', depth: 0, cells: [] },
    { cue: 'win.pulse', startMs: 960, durationMs: 240, stepKind: 'win', depth: 1, cells: ['0:0', '1:0'] },
  ],
};

describe('MotionCueHost', () => {
  it('bridges every known cue name', () => {
    for (const name of Object.keys(CUE_BRIDGE)) {
      assert.equal(resolveCueBridge(name).animState !== undefined, true);
    }
  });

  it('fires tumble actions in clock order', async () => {
    const tumble = [];
    const anim = [];
    const presentation = [];
    await playCueSheet(sampleClusterSheet, {
      onTumbleAction: (action, phase) => tumble.push(`${phase}:${action}`),
      onAnimState: (state) => anim.push(state),
      onPresentationEvent: (event) => presentation.push(event),
      wait: async () => {},
    }, 40);
    assert.ok(tumble.includes('clear:clear-tile'));
    assert.ok(tumble.includes('fall:travel-to-destination'));
    assert.ok(tumble.includes('settle:settle-at-destination'));
    assert.deepEqual(tumble, ['enter:stage-entry', 'clear:clear-tile', 'fall:travel-to-destination', 'settle:settle-at-destination', 'win:win-highlight']);
    assert.equal(anim.includes('spinStart'), false);
    assert.ok(anim.includes('winSmall'));
    assert.deepEqual(presentation, []);
  });

  it('only dispatches opted-in safe reel presentation events', async () => {
    const presentation = [];
    await playCueSheet({
      totalDurationMs: 10,
      cues: [
        { cue: 'reel.stop', startMs: 0, durationMs: 10 },
        { cue: 'win.pulse', startMs: 0, durationMs: 10 },
        { cue: 'board.shake', startMs: 0, durationMs: 10 },
      ],
    }, {
      allowPresentationEvents: true,
      onPresentationEvent: event => presentation.push(event),
      wait: async () => {},
    });
    assert.deepEqual(presentation, ['reveal']);
  });

  it('does not double-fire on extra ticks', () => {
    const fired = [];
    const host = createMotionCueHost({
      onCue: (cue) => fired.push(cue.cue),
      wait: async () => {},
      executePresentation: () => {},
    });
    host.load(sampleClusterSheet);
    host.tick(5000);
    const count = fired.length;
    host.tick(9000);
    assert.equal(fired.length, count);
    assert.equal(host.isComplete(), true);
  });
});
