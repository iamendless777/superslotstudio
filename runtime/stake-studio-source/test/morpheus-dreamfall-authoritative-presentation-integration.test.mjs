import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDreamfallSignatureTrace,
  hashMorpheusProtocolValue,
  reconstructMorpheusTrace,
} from '../src/engines/morpheus/MorpheusEventProtocol.js';
import {
  adaptMorpheusDreamfallEvent,
  MorpheusDreamfallRuntime,
  runMorpheusDreamfallSignatureProjection,
} from '../src/engines/presentation/morpheus/MorpheusDreamfallRuntime.js';

function acknowledge(runtime, command) {
  if (command.acknowledgement) {
    runtime.acknowledge(command.acknowledgement.id, command.acknowledgement.expectedEvidence);
  }
}

test('Morpheus presentation projects the authoritative six-event envelope trace without mutation', () => {
  const trace = createDreamfallSignatureTrace();
  const originalEvents = structuredClone(trace.events);
  const authoritative = reconstructMorpheusTrace(trace.events);

  const adapted = trace.events.map(adaptMorpheusDreamfallEvent);
  assert.deepEqual(adapted.map(event => event.payload), trace.events.map(event => event.payload));
  assert.deepEqual(adapted.map(event => event.sourceEvent), originalEvents);
  assert.deepEqual(adapted.map(event => event.sourceEventHash), authoritative.timeline.map(item => item.eventHash));

  const report = runMorpheusDreamfallSignatureProjection(trace.events, { motionMode: 'normal' });
  assert.deepEqual(trace.events, originalEvents);
  assert.equal(trace.events.length, 6);
  assert.equal(report.nextEventIndex, 6);
  assert.deepEqual(report.commands.map(command => command.semantic.eventIndex), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(report.commands.map(command => command.semantic.eventType), [
    'reveal',
    'winInfo',
    'expandReelHeight',
    'tumbleChainProgress',
    'awardTumbleFreeSpins',
    'tumbleBoard',
  ]);
  assert.equal(report.contractFingerprint, trace.contractFingerprint);
  assert.ok(report.sourceTrace.every(item => item.contractFingerprint === trace.contractFingerprint));
  assert.deepEqual(report.sourceTrace.map(item => item.sourceEventHash), authoritative.timeline.map(item => item.eventHash));
  assert.equal(hashMorpheusProtocolValue(trace.events), authoritative.eventHash);
  assert.equal(report.sliceComplete, true);
  assert.equal(report.fullRoundFinalized, false);
  assert.equal(report.state.completed, false);
  assert.equal(report.state.signatureCyclesCompleted, 1);
  assert.equal(report.acknowledgements.at(-1).acknowledgementId,
    trace.events.at(-1).blocking.acknowledgement.id);
  assert.equal(report.visualProof.miniCompactSymbolLegibility.status, 'unresolved');
});

test('Morpheus presentation rejects authoritative progress before reel growth', () => {
  const events = createDreamfallSignatureTrace().events;
  const runtime = new MorpheusDreamfallRuntime();
  acknowledge(runtime, runtime.dispatch(events[0]));
  acknowledge(runtime, runtime.dispatch(events[1]));

  const reorderedProgress = structuredClone(events[3]);
  reorderedProgress.index = 2;
  assert.throws(() => runtime.dispatch(reorderedProgress), /progress must follow authoritative reel growth/);
  assert.equal(runtime.nextEventIndex, 2);
  assert.equal(runtime.state.causalPhase, 'positive-win-shown');
});

test('Morpheus authoritative slice completes only after the tumble acknowledgement', () => {
  const events = createDreamfallSignatureTrace().events;
  const runtime = new MorpheusDreamfallRuntime();
  for (const event of events.slice(0, -1)) acknowledge(runtime, runtime.dispatch(event));

  const tumble = runtime.dispatch(events.at(-1));
  assert.equal(tumble.acknowledgement.id, events.at(-1).blocking.acknowledgement.id);
  assert.equal(tumble.acknowledgement.completesSlice, true);
  assert.equal(runtime.state.sliceAwaitingAcknowledgement, true);
  assert.equal(runtime.state.sliceComplete, false);
  assert.throws(() => runtime.report(), /report is blocked/);

  acknowledge(runtime, tumble);
  assert.equal(runtime.state.sliceAwaitingAcknowledgement, false);
  assert.equal(runtime.state.sliceComplete, true);
  assert.equal(runtime.report().passed, true);
});
