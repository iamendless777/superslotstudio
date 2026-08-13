import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureProductionWorkflow,
  getFlagshipWorkflowGate,
  setProductionTrack,
} from '../src/engines/factory/FlagshipWorkflow.js';
import {
  getFlagshipScenarioLabSummary,
  runFlagshipScenario,
  upsertFlagshipScenario,
} from '../src/engines/quality/FlagshipScenarioLab.js';
import { getGameCertificationSummary } from '../src/engines/quality/GameCertificationQA.js';
import {
  MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
  MORPHEUS_SIGNATURE_SCENARIO_ID,
  recordMorpheusSignatureCaptureQA,
} from '../src/engines/quality/morpheus/MorpheusSignatureCaptureQA.js';
import {
  createHealthyMorpheusCaptureEvidence,
  createMorpheusCaptureFixtureProject,
} from './fixtures/morpheus-signature-capture-fixture.mjs';

function configuredWorkflow(project) {
  setProductionTrack(project, 'flagship');
  const workflow = ensureProductionWorkflow(project, 'flagship');
  workflow.verticalSlice = {
    status: 'proven',
    scenarioIds: [MORPHEUS_SIGNATURE_SCENARIO_ID],
    evidence: ['gate6:authoritative-contract'],
    proves: ['Dreamfall signature presentation'],
    disciplineProof: { math: true, events: true, frontend: true, presentation: true, gameInfo: true, replay: true },
  };
  return workflow;
}

test('Morpheus vertical-slice frontend and presentation truth is derived from fresh archived evidence', () => {
  const project = createMorpheusCaptureFixtureProject();
  configuredWorkflow(project);
  let gate = getFlagshipWorkflowGate(project, 'verticalSlice');
  assert.equal(gate.complete, false);
  assert.equal(gate.disciplineProof.frontend, false);
  assert.equal(gate.disciplineProof.presentation, false);
  assert.match(gate.message, /archived desktop\/mobile\/mini/);

  recordMorpheusSignatureCaptureQA(project, createHealthyMorpheusCaptureEvidence(project));
  gate = getFlagshipWorkflowGate(project, 'verticalSlice');
  assert.equal(gate.complete, true);
  assert.equal(gate.disciplineProof.frontend, true);
  assert.equal(gate.disciplineProof.presentation, true);
  assert.equal(gate.signatureCapture.archivedCaptureCount, 16);

  project.theme.cabinet.width += 1;
  gate = getFlagshipWorkflowGate(project, 'verticalSlice');
  assert.equal(gate.complete, false);
  assert.equal(gate.signatureCapture.fresh, false);
  assert.equal(gate.disciplineProof.frontend, false);
  assert.equal(gate.disciplineProof.presentation, false);
});

test('authoritative Flagship scenario run binds to the current capture evidence hash', () => {
  const project = createMorpheusCaptureFixtureProject();
  configuredWorkflow(project);
  upsertFlagshipScenario(project, {
    id: MORPHEUS_SIGNATURE_SCENARIO_ID,
    label: 'Morpheus Dreamfall signature v2',
    mode: 'dreamfall',
    kind: 'signature',
    mechanics: ['dreamfallReelGrowth'],
    promises: ['signature spectacle'],
    expected: { evidenceContract: MORPHEUS_SIGNATURE_CAPTURE_FORMAT, authoritativeSource: 'createDreamfallSignatureTrace' },
  });
  let run = runFlagshipScenario(project, MORPHEUS_SIGNATURE_SCENARIO_ID);
  assert.equal(run.passed, false);
  assert.equal(run.source, 'authoritative-morpheus-signature-capture');

  const summary = recordMorpheusSignatureCaptureQA(project, createHealthyMorpheusCaptureEvidence(project));
  run = runFlagshipScenario(project, MORPHEUS_SIGNATURE_SCENARIO_ID);
  assert.equal(run.passed, true);
  assert.equal(run.captureFingerprint, summary.fingerprint);
  assert.equal(run.captureEvidenceHash, summary.evidenceHash);
  assert.equal(run.frontendPassed, true);
  assert.equal(run.presentationPassed, true);
  assert.equal(getFlagshipScenarioLabSummary(project).complete, true);

  project.animation.runtime.reducedMotion = 'ignore';
  assert.equal(getFlagshipScenarioLabSummary(project).complete, false, 'evidence drift invalidates the saved authoritative scenario result');
});

test('game certification adds a blocking Morpheus signature visual-proof stage', () => {
  const project = createMorpheusCaptureFixtureProject();
  configuredWorkflow(project);
  let summary = getGameCertificationSummary(project);
  let stage = summary.stages.find(item => item.id === 'signature-visual-proof');
  assert.equal(stage.complete, false);
  assert.match(stage.details, /No archived/);

  recordMorpheusSignatureCaptureQA(project, createHealthyMorpheusCaptureEvidence(project));
  summary = getGameCertificationSummary(project);
  stage = summary.stages.find(item => item.id === 'signature-visual-proof');
  assert.equal(stage.complete, true);
  assert.match(stage.details, /16\/16 archived captures/);
});
