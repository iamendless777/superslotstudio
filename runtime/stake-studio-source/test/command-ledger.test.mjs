import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMAND_RESULT_LIMIT,
  appendCommandResult,
  compactCommandResultLedger,
  consumeCommandResult,
} from '../server/command-ledger.mjs';

const fixedNow = () => '2026-08-13T18:00:00.000Z';

test('legacy command results compact to bounded metadata-only tombstones', () => {
  const payload = 'x'.repeat(1_000_000);
  const legacy = {
    results: Array.from({ length: COMMAND_RESULT_LIMIT + 5 }, (_, index) => ({
      id: `result-${index}`,
      ok: true,
      result: { payload },
      completedAt: `2026-08-13T17:${String(index % 60).padStart(2, '0')}:00.000Z`,
    })),
  };

  const compacted = compactCommandResultLedger(legacy, { now: fixedNow });

  assert.equal(compacted.results.length, COMMAND_RESULT_LIMIT);
  assert.equal(compacted.results[0].id, 'result-5');
  assert.equal(compacted.results.at(-1).id, `result-${COMMAND_RESULT_LIMIT + 4}`);
  assert.ok(compacted.results.every(result => result.pruned === true && !('result' in result)));
  assert.ok(Buffer.byteLength(JSON.stringify(compacted)) < 50_000);
});

test('appending preserves only the current full result', () => {
  const ledger = {
    results: [
      { id: 'old', ok: true, result: { payload: 'large' }, completedAt: 'earlier' },
    ],
  };
  const current = { id: 'current', ok: true, result: { value: 42 }, completedAt: 'now' };

  const next = appendCommandResult(ledger, current, { now: fixedNow });

  assert.deepEqual(next.results[0], {
    id: 'old', ok: true, completedAt: 'earlier', consumedAt: fixedNow(), pruned: true,
  });
  assert.deepEqual(next.results[1], current);
});

test('consuming returns the full result once and replaces it with a tombstone', () => {
  const full = { id: 'current', ok: true, result: { value: 42 }, completedAt: 'now' };
  const first = consumeCommandResult({ results: [full] }, 'current', { now: fixedNow });

  assert.equal(first.status, 'found');
  assert.deepEqual(first.result, full);
  assert.equal(first.ledger.results[0].pruned, true);
  assert.equal('result' in first.ledger.results[0], false);

  const second = consumeCommandResult(first.ledger, 'current', { now: fixedNow });
  assert.equal(second.status, 'consumed');
});
