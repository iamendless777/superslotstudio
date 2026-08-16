import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPHEUS_PROOF_DISCIPLINES,
  createMorpheusV2QAAdapter,
  evaluateMorpheusV2ContractParity,
} from '../src/engines/quality/morpheus/MorpheusV2ContractParity.js';
import {
  morpheusV2ArtifactsFixture,
  morpheusV2ContractFixture,
} from './fixtures/morpheus-v2-foundation-fixture.mjs';

test('Morpheus v2 foundation fingerprints exact 100,000x economics across all six disciplines', () => {
  const contract = morpheusV2ContractFixture();
  const adapter = createMorpheusV2QAAdapter({ contract, artifacts: morpheusV2ArtifactsFixture(contract) });
  const result = evaluateMorpheusV2ContractParity(adapter);
  assert.equal(result.passed, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.releaseReady, false);
  assert.match(result.fingerprint, /^morpheus-v2-[0-9a-f]{8}$/);
  assert.deepEqual(Object.keys(result.artifactEvidence), [...MORPHEUS_PROOF_DISCIPLINES]);
  assert.ok(Object.values(result.artifactEvidence).every(item => item.passed));
  assert.equal(result.contract.economics.maxWin, 100000);
  assert.equal(result.contract.economics.totalExposure, 50000000);
  assert.equal(result.contract.economics.maxBaseBet, 500);
  assert.match(result.blockers[0], /authoritative math\/protocol contract adapter/i);
});

test('Morpheus v2 foundation rejects contract drift in economics or one discipline artifact', () => {
  const contract = morpheusV2ContractFixture();
  const artifacts = morpheusV2ArtifactsFixture(contract);
  artifacts.presentation.contractFingerprint = 'morpheus-v2-stale';
  let result = evaluateMorpheusV2ContractParity({ contract, artifacts });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(issue => /presentation.*fingerprint/i.test(issue)));

  contract.economics.maxWin = 50000;
  result = evaluateMorpheusV2ContractParity({ contract, artifacts: morpheusV2ArtifactsFixture(contract) });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(issue => /100,000x/.test(issue)));
});

test('Morpheus v2 generic adapter cannot self-attest fixture selectors as authoritative', () => {
  const contract = morpheusV2ContractFixture();
  const source = { moduleExport: { contract }, manifests: morpheusV2ArtifactsFixture(contract) };
  const adapter = createMorpheusV2QAAdapter(source, {
    authority: 'authoritative',
    contract: value => value.moduleExport.contract,
    artifacts: value => value.manifests,
  });
  const result = evaluateMorpheusV2ContractParity(adapter);
  assert.equal(result.passed, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.releaseReady, false);
});
