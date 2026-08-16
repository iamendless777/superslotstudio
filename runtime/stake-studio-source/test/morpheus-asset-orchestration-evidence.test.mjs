import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMorpheusAssetOrchestrationEvidence,
} from '../src/engines/quality/morpheus/MorpheusAssetOrchestrationEvidence.js';
import {
  evaluateAssetOrchestrationQA,
} from '../src/engines/quality/AssetOrchestrationQA.js';
import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_EVENT_TYPES,
} from '../src/engines/morpheus/MorpheusGameContract.js';

function project() {
  return {
    id: 'morpheus_dreamfall',
    theme: { symbols: [], presentationAssets: {} },
    animation: { visualEffects: { motionAssets: [] } },
    build: { frontend: { version: 10, verification: { assetPackaging: { lineage: { format: 'stake-studio-frontend-asset-lineage-v1', assets: [] } } } } },
    production: { qa: {} },
  };
}

test('Morpheus adapter inventories the full contract and remains fail-closed without fresh live route evidence', () => {
  const value = project();
  const evidence = createMorpheusAssetOrchestrationEvidence(value);
  const result = evaluateAssetOrchestrationQA(value, evidence);
  assert.equal(evidence.authority.contractFingerprint, MORPHEUS_CONTRACT_FINGERPRINT);
  assert.deepEqual(evidence.authority.eventTypes, MORPHEUS_EVENT_TYPES);
  assert.equal(evidence.choreographies.length, MORPHEUS_EVENT_TYPES.length);
  assert.equal(evidence.authority.requiredInteractionPairs.length, 8);
  assert.equal(result.passed, false);
  const ids = new Set(result.diagnostics.map(item => item.id));
  assert.equal(ids.has('capture.missing:mysteryTransform'), true);
  assert.equal(ids.has('interaction.missing:dawnPurge::dreamfallReelGrowth'), true);
  assert.equal(ids.has('nfr.missing:reducedMotionProofId'), true);
});

test('new event recipes are Morpheus-scoped authored decisions and remain unproved without captures', () => {
  const evidence = createMorpheusAssetOrchestrationEvidence(project());
  const grid = evidence.choreographies.find(item => item.eventType === 'modeGridStart');
  assert.equal(grid.decision, 'choreography');
  assert.equal(grid.motion.decision, 'none');
  assert.match(grid.motion.rationale, /Structural renderer owns wake-position-grid/);
  assert.deepEqual(evidence.planning.missingRecipeEvents, []);
  const result = evaluateAssetOrchestrationQA(project(), evidence);
  assert.equal(result.diagnostics.some(item => item.id === 'capture.missing:modeGridStart'), true);
});

test('pre-reveal declarations may bind a later authoritative render sample', () => {
  const source = new URL('../src/engines/quality/morpheus/MorpheusAssetOrchestrationEvidence.js', import.meta.url);
  return import('node:fs/promises').then(({ readFile }) => readFile(source, 'utf8')).then(text => {
    assert.match(text, /recognizedLater = renderSamples\.find/);
    assert.match(text, /recognizedLater \? \[recognizedLater\.id\] : \[\]/);
  });
});
