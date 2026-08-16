import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MixedSpecialSchedulerSpike,
  runMixedSpecialSchedulerSpike,
} from '../src/engines/factory/spikes/MixedSpecialSchedulerSpike.js';

test('Morpheus mixed-special spike proves sequential and parallel groups with blocking acknowledgements', async () => {
  const starts = [];
  let releaseParallel;
  const parallelReady = new Promise(resolve => { releaseParallel = resolve; });
  const input = {
    state: { sequence: [], charges: {} },
    groups: [
      {
        id: 'authoritative-reveal', mode: 'sequential', actions: [
          { id: 'mystery-target', mechanic: 'mysteryVeil', blocking: true },
          { id: 'star-transform', mechanic: 'oneiricStar', blocking: true },
        ],
      },
      {
        id: 'readable-impacts', mode: 'parallel', actions: [
          { id: 'rift-impact', mechanic: 'dreamRift', blocking: true },
          { id: 'nexus-charge', mechanic: 'oneiricNexus', blocking: true },
        ],
      },
    ],
  };

  const result = await runMixedSpecialSchedulerSpike(input, async (action, context) => {
    starts.push(action.id);
    if (action.id === 'rift-impact' || action.id === 'nexus-charge') {
      if (starts.includes('rift-impact') && starts.includes('nexus-charge')) releaseParallel();
      await parallelReady;
    }
    context.mutate(action.id, state => {
      state.sequence.push(action.id);
      state.charges[action.mechanic] = (state.charges[action.mechanic] || 0) + 1;
    });
    context.acknowledge(`settled:${action.id}`);
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.groups.map(group => group.mode), ['sequential', 'parallel']);
  assert.deepEqual(starts.slice(0, 2), ['mystery-target', 'star-transform']);
  assert.deepEqual(new Set(starts.slice(2)), new Set(['rift-impact', 'nexus-charge']));
  assert.ok(result.groups.flatMap(group => group.actions).every(action => action.acknowledged.startsWith('settled:')));
  const starStart = result.trace.find(item => item.type === 'action-start' && item.actionId === 'star-transform').sequence;
  const mysteryComplete = result.trace.find(item => item.type === 'action-complete' && item.actionId === 'mystery-target').sequence;
  assert.ok(starStart > mysteryComplete, 'the second sequential mechanic cannot start before the first acknowledgement and completion');
});

test('Morpheus mixed-special spike blocks forbidden concurrency and missing acknowledgements', async () => {
  let invoked = false;
  await assert.rejects(() => runMixedSpecialSchedulerSpike({
    state: {},
    forbiddenInteractions: [{ left: 'maxMorpheus', right: 'tumble', reason: 'maximum win terminates the round' }],
    groups: [{
      id: 'forbidden-finale', mode: 'parallel', actions: [
        { id: 'maximum', mechanic: 'maxMorpheus', blocking: true },
        { id: 'next-tumble', mechanic: 'tumble', blocking: true },
      ],
    }],
  }, async () => { invoked = true; }), /Forbidden parallel interaction/);
  assert.equal(invoked, false, 'forbidden groups are rejected before either mechanic starts');

  await assert.rejects(() => runMixedSpecialSchedulerSpike({
    state: {},
    groups: [{ id: 'blocking-proof', mode: 'sequential', actions: [{ id: 'veil-stop', mechanic: 'veilWild', blocking: true }] }],
  }, async () => {}), /completed without acknowledgement/);
});

test('Morpheus mixed-special spike rejects state mutation after an action or schedule closes', async () => {
  const scheduler = new MixedSpecialSchedulerSpike({ state: { value: 0 } });
  let retainedContext;
  const result = await scheduler.run([
    { id: 'state-commit', mode: 'sequential', actions: [{ id: 'commit', mechanic: 'symbolUpgrade', blocking: true }] },
  ], async (_action, context) => {
    retainedContext = context;
    context.mutate('authoritative-state', state => { state.value = 1; });
    context.acknowledge('frontend-settled');
  });
  assert.equal(result.state.value, 1);
  assert.throws(() => retainedContext.mutate('late-effect', state => { state.value = 2; }), /Late state mutation rejected/);
  assert.equal(retainedContext.readState().value, 1);
});
