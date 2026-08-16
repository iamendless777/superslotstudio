import test from 'node:test';
import assert from 'node:assert/strict';

import { createDreamfallSignatureTrace } from '../src/engines/morpheus/MorpheusEventProtocol.js';
import {
  proveMorpheusDreamfallMotionEquivalence,
  runMorpheusDreamfallSignatureProjection,
} from '../src/engines/presentation/morpheus/MorpheusDreamfallRuntime.js';

const events = () => createDreamfallSignatureTrace().events;

test('Morpheus Dreamfall normal, fast and reduced motion preserve identical semantic state and acknowledgements', () => {
  const proof = proveMorpheusDreamfallMotionEquivalence(events());
  assert.equal(proof.passed, true);
  assert.equal(new Set(proof.reports.map(report => report.stateHash)).size, 1);
  assert.equal(new Set(proof.reports.map(report => report.semanticTraceHash)).size, 1);
  assert.equal(new Set(proof.reports.map(report => report.acknowledgements.length)).size, 1);

  const expansionDurations = proof.reports.map(report => report.commands
    .find(command => command.semantic.eventType === 'expandReelHeight').presentation.durationMs);
  assert.deepEqual(expansionDurations, [620, 260, 0]);
  assert.ok(proof.reports[2].commands.every(command => command.presentation.motionStrategy === 'instant-semantic-commit'));
});

test('Morpheus Dreamfall presentation commands expose independent mask/cap movement and causal order', () => {
  const report = runMorpheusDreamfallSignatureProjection(events(), { motionMode: 'fast' });
  const types = report.commands.map(command => command.semantic.eventType);
  const firstWin = types.indexOf('winInfo');
  const firstExpansion = types.indexOf('expandReelHeight');
  const firstProgress = types.indexOf('tumbleChainProgress');
  const firstAward = types.indexOf('awardTumbleFreeSpins');
  const firstTumble = types.indexOf('tumbleBoard');
  assert.ok(firstWin < firstExpansion
    && firstExpansion < firstProgress
    && firstProgress < firstAward
    && firstAward < firstTumble);

  const expansion = report.commands[firstExpansion];
  assert.equal(expansion.acknowledgement.expectedEvidence, 'mask-cap-animation-finished');
  assert.equal(expansion.acknowledgement.blocksNextEvent, true);
  assert.equal(expansion.semantic.maskBefore.bottom, expansion.semantic.maskAfter.bottom);
  assert.ok(expansion.semantic.maskAfter.y < expansion.semantic.maskBefore.y);
  assert.ok(expansion.semantic.capAfter.anchorY < expansion.semantic.capBefore.anchorY);
  const tumble = report.commands[firstTumble];
  assert.equal(tumble.acknowledgement.id, 'ack:morpheus:signature:dreamfall:tumble-5');
  assert.equal(tumble.acknowledgement.authority, 'protocol-envelope');
  assert.equal(report.sliceComplete, true);
  assert.equal(report.fullRoundFinalized, false);
  assert.equal(report.visualProof.miniCompactSymbolLegibility.status, 'unresolved');
  assert.match(report.visualProof.miniCompactSymbolLegibility.reason, /compact authored-symbol legibility/);
});
