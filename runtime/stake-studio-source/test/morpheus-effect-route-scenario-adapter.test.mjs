import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameProject } from '../src/engines/schema.js';
import { setProductionTrack } from '../src/engines/factory/FlagshipWorkflow.js';
import {
  getFlagshipScenarioLabSummary,
  runFlagshipScenario,
  upsertFlagshipScenario,
} from '../src/engines/quality/FlagshipScenarioLab.js';
import {
  MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
  MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES,
  getMorpheusEffectRouteCaptureFingerprint,
} from '../src/engines/quality/morpheus/MorpheusEffectRouteCaptureQA.js';

test('effect-route scenarios require fresh complete governed route evidence', () => {
  const project = createGameProject({ name: 'Morpheus Effect Scenario Fixture' });
  project.build.stakeEngine.gameId = 'morpheus_dreamfall';
  project.math.betModes = [{ name: 'base', cost: 1, rtp: project.math.rtp, profile: { entry: 'base' } }];
  const workflow = setProductionTrack(project, 'flagship');
  workflow.architecture.interactionMatrix = [{ id: 'route', left: 'mystery', right: 'star', disposition: 'required' }];
  upsertFlagshipScenario(project, {
    id: 'route-proof', mode: 'base', mechanics: ['mystery', 'star'], promises: ['causality'],
    expected: { evidenceContract: MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT, evidenceRouteId: MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES[0] },
  });
  let run = runFlagshipScenario(project, 'route-proof');
  assert.equal(run.passed, false);

  const routeId = MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES[0];
  project.production.qa = {
    morpheusEffectRouteCaptureAudit: {
      format: MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
      fingerprint: getMorpheusEffectRouteCaptureFingerprint(project),
      runs: Array.from({ length: 12 }, () => ({ routeId, passed: true })),
      passed: false,
      issues: ['fixture intentionally lacks evaluator-complete capture payloads'],
    },
  };
  run = runFlagshipScenario(project, 'route-proof');
  assert.equal(run.passed, false, 'stored passed flags cannot bypass the governed evaluator');
  assert.equal(getFlagshipScenarioLabSummary(project).complete, false);
});
