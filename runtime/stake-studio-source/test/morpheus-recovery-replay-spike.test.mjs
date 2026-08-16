import test from 'node:test';
import assert from 'node:assert/strict';

import { runRecoveryReplaySpike } from '../src/engines/factory/spikes/RecoveryReplaySpike.js';

const fixture = () => ({
  initialBoard: [
    ['OBOL', 'POPPY'],
    ['LAUREL', 'MORPHEUS'],
  ],
  initialState: {
    multiplierGrid: { '0:0': 1 },
    symbolUpgrades: {},
    reelRows: [2, 2],
    totalWin: 0,
  },
  events: [
    { id: 'reveal', type: 'reveal' },
    {
      id: 'nexus-charge', type: 'positionMultiplierGridUpdate',
      persistentStatePatch: { multiplierGrid: { '0:0': 2 } },
    },
    {
      id: 'tumble', type: 'tumbleBoard',
      boardChanges: [{ reel: 0, row: 1, to: 'NYX' }],
    },
    {
      id: 'veil-upgrade', type: 'symbolUpgrade',
      persistentStatePatch: { symbolUpgrades: { OBOL: 'LAUREL' } },
      boardChanges: [{ reel: 0, row: 0, to: 'LAUREL' }],
    },
    { id: 'settled-win', type: 'setTotalWin', statePatch: { totalWin: 1.2 } },
    {
      id: 'dreamfall-expansion', type: 'expandReelHeight',
      persistentStatePatch: { reelRows: [3, 2] },
      board: [
        ['MOON_MOTH', 'LAUREL', 'NYX'],
        ['LAUREL', 'MORPHEUS'],
      ],
    },
  ],
  reconnectAfter: 4,
});

test('Morpheus recovery spike checkpoints every persistent mutation after state commit', () => {
  const result = runRecoveryReplaySpike(fixture());
  assert.equal(result.passed, true);
  assert.deepEqual(result.checkpoints.map(checkpoint => checkpoint.eventIndex), [1, 3, 5]);
  for (const checkpoint of result.checkpoints) {
    const timeline = result.continuous.timeline.find(item => item.eventIndex === checkpoint.eventIndex);
    assert.equal(checkpoint.stateHash, timeline.stateHash);
    assert.equal(checkpoint.boardHash, timeline.boardHash);
    assert.equal(checkpoint.nextEventIndex, checkpoint.eventIndex + 1);
  }
  assert.equal(result.checkpoint.eventIndex, 3, 'reconnect chooses the latest committed checkpoint at or before disconnection');
});

test('Morpheus reconnect reconstructs identical event, board, and persistent-state hashes', () => {
  const first = runRecoveryReplaySpike(fixture());
  const second = runRecoveryReplaySpike(fixture());
  assert.deepEqual(first.equality, { event: true, board: true, state: true });
  assert.equal(first.deterministic, true);
  assert.equal(first.recovered.eventHash, first.continuous.eventHash);
  assert.equal(first.recovered.boardHash, first.continuous.boardHash);
  assert.equal(first.recovered.stateHash, first.continuous.stateHash);
  assert.equal(first.recovered.eventHash, second.recovered.eventHash);
  assert.equal(first.recovered.boardHash, second.recovered.boardHash);
  assert.equal(first.recovered.stateHash, second.recovered.stateHash);
  assert.deepEqual(first.recovered.board, [
    ['MOON_MOTH', 'LAUREL', 'NYX'],
    ['LAUREL', 'MORPHEUS'],
  ]);
  assert.deepEqual(first.recovered.state.reelRows, [3, 2]);
});

test('Morpheus recovery spike refuses a false persistent checkpoint', () => {
  const input = fixture();
  input.events = [{ id: 'false-persistence', type: 'symbolUpgrade', persistentChange: true }];
  input.reconnectAfter = 1;
  assert.throws(() => runRecoveryReplaySpike(input), /did not change authoritative state/);
});
