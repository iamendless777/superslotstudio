import test from 'node:test';
import assert from 'node:assert/strict';

import { runDreamfallMathSpike } from '../src/engines/factory/spikes/DreamfallMathSpike.js';
import { createDreamfallSignatureTrace } from '../src/engines/morpheus/MorpheusEventProtocol.js';
import {
  MorpheusDreamfallRuntime,
  resumeMorpheusDreamfallSignatureProjection,
  runMorpheusDreamfallSignatureProjection,
} from '../src/engines/presentation/morpheus/MorpheusDreamfallRuntime.js';

function trace() {
  return createDreamfallSignatureTrace().events;
}

function dispatchAndAcknowledge(runtime, event) {
  const command = runtime.dispatch(event);
  if (command.acknowledgement) {
    runtime.acknowledge(command.acknowledgement.id, command.acknowledgement.expectedEvidence);
  }
  return command;
}

test('Morpheus Dreamfall signature runtime projects typed events onto the fixed world and persistent HUD', () => {
  const report = runMorpheusDreamfallSignatureProjection(trace(), { motionMode: 'normal' });
  assert.equal(report.passed, true);
  assert.equal(report.sliceComplete, true);
  assert.equal(report.fullRoundFinalized, false);
  assert.equal(report.state.geometry.cells.length, 48);
  assert.equal(report.state.geometry.world.height, 496);
  assert.ok(report.state.geometry.reels.every(reel => reel.mask.bottom === report.state.geometry.world.bottom));
  assert.equal(report.state.hud.visible, true);
  assert.equal(report.state.hud.chainHit, 5);
  assert.equal(report.state.hud.awardedFreeSpins, 1);
  assert.equal(report.state.hud.freeSpinsRemaining, 7);
  assert.deepEqual(report.state.hud.reelRows, report.state.reelRows);
  assert.equal(report.state.hud.runningWin, 250);
  assert.equal(report.state.hud.finalWin, 0);
  assert.ok(report.acknowledgements.some(item => item.evidence === 'mask-cap-animation-finished'));
  assert.ok(report.acknowledgements.some(item => item.acknowledgementId === 'ack:morpheus:signature:dreamfall:tumble-5'));
  assert.equal(report.visualProof.miniCompactSymbolLegibility.status, 'unresolved');
});

test('Morpheus Dreamfall signature runtime blocks the next event until visible work is acknowledged', () => {
  const events = trace();
  const runtime = new MorpheusDreamfallRuntime({ motionMode: 'normal' });
  const reveal = runtime.dispatch(events[0]);
  assert.equal(reveal.acknowledgement.blocksNextEvent, true);
  assert.throws(() => runtime.dispatch(events[1]), /is blocked until/);
  assert.throws(() => runtime.checkpoint(), /Cannot checkpoint/);
  assert.throws(() => runtime.acknowledge(reveal.acknowledgement.id, 'paint probably finished'), /requires evidence/);
  runtime.acknowledge(reveal.acknowledgement.id, reveal.acknowledgement.expectedEvidence);
  assert.doesNotThrow(() => runtime.dispatch(events[1]));
});

test('Morpheus Dreamfall checkpoint resume reaches the identical state without hidden runtime state', () => {
  const events = trace();
  const continuous = runMorpheusDreamfallSignatureProjection(events, { motionMode: 'normal' });
  const runtime = new MorpheusDreamfallRuntime({ motionMode: 'normal' });
  const reconnectAfter = events.findIndex(event => event.type === 'expandReelHeight') + 1;
  for (let index = 0; index < reconnectAfter; index++) dispatchAndAcknowledge(runtime, events[index]);
  const checkpoint = runtime.checkpoint();
  const recovered = resumeMorpheusDreamfallSignatureProjection(events, checkpoint, { motionMode: 'normal' });
  assert.equal(recovered.stateHash, continuous.stateHash);
  assert.equal(recovered.semanticTraceHash, continuous.semanticTraceHash);
  assert.deepEqual(recovered.state, continuous.state);
  assert.equal(recovered.nextEventIndex, events.length);

  const tampered = structuredClone(checkpoint);
  tampered.state.hud.chainHit += 1;
  assert.throws(() => resumeMorpheusDreamfallSignatureProjection(events, tampered), /checkpoint hash/);
});

test('Morpheus Dreamfall retains legacy flat-spike full-round finalization support', () => {
  const events = runDreamfallMathSpike({ seed: 0xD43AF411, tumbleHits: 6 }).book.events;
  const report = runMorpheusDreamfallSignatureProjection(events, { motionMode: 'normal' });
  assert.equal(report.passed, true);
  assert.equal(report.sliceComplete, false);
  assert.equal(report.fullRoundFinalized, true);
  assert.equal(report.state.hud.finalWin, 60);
  assert.equal(report.nextEventIndex, events.length);
});
