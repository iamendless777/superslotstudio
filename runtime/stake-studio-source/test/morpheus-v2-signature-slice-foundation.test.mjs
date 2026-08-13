import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMorpheusV2QAAdapter,
} from '../src/engines/quality/morpheus/MorpheusV2ContractParity.js';
import {
  evaluateMorpheusV2SignatureSlice,
} from '../src/engines/quality/morpheus/MorpheusV2SignatureSliceQA.js';
import {
  morpheusV2FoundationInputFixture,
} from './fixtures/morpheus-v2-signature-slice-fixture.mjs';

test('Morpheus v2 signature foundation proves exact events, payloads, snapshots, pay truth, reconnect, and six disciplines', () => {
  const result = evaluateMorpheusV2SignatureSlice(morpheusV2FoundationInputFixture());
  assert.equal(result.passed, true);
  assert.equal(result.releaseReady, false, 'fixture evidence cannot issue a production claim');
  assert.deepEqual(result.exactEvents.actualTypes, [
    'reveal', 'winInfo', 'expandReelHeight', 'tumbleBoard', 'setTotalWin', 'finalWin',
  ]);
  assert.equal(result.snapshots.passed, true);
  assert.equal(result.effectivePay.passed, true);
  assert.deepEqual(result.recovery.equality, { event: true, board: true, state: true });
  assert.equal(result.recovery.deterministic, true);
  assert.equal(result.promiseMatrix.complete, true);
  assert.deepEqual(Object.keys(result.disciplineProof), ['math', 'events', 'frontend', 'presentation', 'gameInfo', 'replay']);
  assert.ok(Object.values(result.disciplineProof).every(item => item.passed && item.evidence.length));
  assert.match(result.blockers[0], /data-only fixture/i);
});

test('Morpheus v2 signature foundation rejects event-order, payload, snapshot, disclosure, and trace drift', () => {
  const input = morpheusV2FoundationInputFixture();
  [input.signatureSlice.events[1], input.signatureSlice.events[2]] = [input.signatureSlice.events[2], input.signatureSlice.events[1]];
  input.signatureSlice.events[2].previousRows = 3;
  input.signatureSlice.boardSnapshots[2].board[2][0] = 'WRONG_SYMBOL';
  input.artifacts.gameInfo.payDisclosure.roundingExamples[1].settled = 0;
  input.signatureSlice.traces.presentation.actual[2].cue = 'late-unacknowledged-rise';
  const result = evaluateMorpheusV2SignatureSlice(input);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(issue => /Event 1 order or payload/.test(issue)));
  assert.ok(result.issues.some(issue => /snapshot.*hash differs/i.test(issue)));
  assert.ok(result.issues.some(issue => /Rounding example/.test(issue)));
  assert.ok(result.issues.some(issue => /Presentation.*trace/i.test(issue)));
  assert.equal(result.disciplineProof.presentation.passed, false);
});

test('Morpheus v2 fixture cannot become authoritative by labelling generic selectors', () => {
  const input = morpheusV2FoundationInputFixture();
  const adapter = createMorpheusV2QAAdapter({ bundle: input }, {
    authority: 'authoritative',
    contract: source => source.bundle.contract,
    artifacts: source => source.bundle.artifacts,
    signatureSlice: source => source.bundle.signatureSlice,
  });
  const result = evaluateMorpheusV2SignatureSlice(adapter);
  assert.equal(result.passed, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.releaseReady, false);
  assert.match(result.blockers[0], /data-only fixture/i);
});
