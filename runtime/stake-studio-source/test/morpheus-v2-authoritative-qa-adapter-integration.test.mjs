import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_EVENT_TYPES,
  MORPHEUS_MODE_REGISTRY,
} from '../src/engines/morpheus/MorpheusGameContract.js';
import {
  buildMorpheusV2AuthoritativeQAFixture,
  createMorpheusV2AuthoritativeQAAdapter,
} from '../src/engines/quality/morpheus/MorpheusV2AuthoritativeQAAdapter.js';
import {
  evaluateMorpheusV2ContractParity,
} from '../src/engines/quality/morpheus/MorpheusV2ContractParity.js';
import {
  evaluateMorpheusV2SignatureSlice,
} from '../src/engines/quality/morpheus/MorpheusV2SignatureSliceQA.js';

test('real Morpheus registry and signature trace are the authoritative QA release seam', () => {
  const fixture = buildMorpheusV2AuthoritativeQAFixture();
  const adapter = createMorpheusV2AuthoritativeQAAdapter();
  const parity = evaluateMorpheusV2ContractParity(adapter);
  const result = evaluateMorpheusV2SignatureSlice(adapter);

  assert.equal(fixture.contract.sourceContractFingerprint, MORPHEUS_CONTRACT_FINGERPRINT);
  assert.deepEqual(fixture.contract.modeIds, Object.keys(MORPHEUS_MODE_REGISTRY));
  assert.equal(fixture.contract.modeIds.length, 8);
  assert.deepEqual(fixture.contract.eventVocabulary, [...MORPHEUS_EVENT_TYPES]);
  assert.equal(fixture.contract.eventVocabulary.length, 20);
  assert.ok(fixture.signatureSlice.events.every(event => event.contractFingerprint === MORPHEUS_CONTRACT_FINGERPRINT));

  assert.equal(parity.fingerprint, result.contractFingerprint);
  assert.equal(parity.authoritative, true);
  assert.equal(parity.releaseReady, true);
  assert.equal(result.passed, true);
  assert.equal(result.authoritative, true);
  assert.equal(result.releaseReady, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.recovery.equality, { event: true, board: true, state: true });
  assert.equal(result.recovery.deterministic, true);
  assert.equal(result.promiseMatrix.complete, true);
  assert.ok(Object.values(result.disciplineProof).every(proof => proof.passed && proof.evidence.length));
  assert.match(result.assertions.find(item => item.id === 'v2.replay.reconnect').evidence.join('\n'), /protocol-event:/);
});

test('real adapter rejects source-fingerprint drift before a release claim can be evaluated', () => {
  const fixture = buildMorpheusV2AuthoritativeQAFixture();
  fixture.signatureSlice.events[1].contractFingerprint = 'morpheus-drifted-contract';
  const driftedAdapter = {
    authority: 'authoritative',
    readContract: () => fixture.contract,
    readArtifacts: () => fixture.artifacts,
    readSignatureSlice: () => fixture.signatureSlice,
  };
  const result = evaluateMorpheusV2SignatureSlice(driftedAdapter);
  assert.equal(result.passed, false);
  assert.equal(result.releaseReady, false);
  assert.ok(result.issues.some(issue => /Event 1 source fingerprint/.test(issue)));
});
