import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { BuildEngine } from '../src/engines/build/BuildEngine.js';
import { prepareFactoryLaunch } from '../src/engines/factory/FactoryLaunchEngine.js';
import { createFactoryRunReport, getFactoryWorkflowGate } from '../src/engines/factory/FactoryRunEngine.js';
import {
  getFlagshipScenarioLabSummary,
  inspectFlagshipEventTimeline,
  runFlagshipScenario,
  upsertFlagshipScenario,
} from '../src/engines/quality/FlagshipScenarioLab.js';
import {
  FLAGSHIP_FACTORY_STAGE_ORDER,
  SPECIALTY_AGENT_ROLES,
  ensureProductionWorkflow,
  getFactoryStageOrder,
  getFlagshipWorkflowSummary,
  getSpecialtyAgentCoordinationSummary,
  recordSpecialtyAgentHandoff,
  setProductionTrack,
  upsertSpecialtyAgentWorkItem,
} from '../src/engines/factory/FlagshipWorkflow.js';

function fillApprovedPreproduction(project) {
  const workflow = setProductionTrack(project, 'flagship');
  project.production.creative = {
    coreHook: 'Every dream can rewrite the board.',
    signatureMoment: 'The dream world expands while three celestial powers resolve in sequence.',
    differentiators: ['Persistent dream state', 'Causal mixed-special spectacle'],
  };
  project.theme.style = 'premium mythic dream opera';
  project.theme.lore = 'A living dream court tests each player through changing worlds.';
  project.build.stakeEngine.providerName = 'Reality Beast';
  workflow.vision = {
    ...workflow.vision, status: 'approved', playerFantasy: 'Command a dangerous living dream',
    marketPosition: 'Original three-star flagship contender',
    experiencePillars: ['deep mechanical discovery', 'readable spectacle'], signatureMoments: ['Dreamfall'],
  };
  workflow.research = {
    ...workflow.research, status: 'approved', references: ['recording-1'], findings: ['Independent reel masks'], constraints: ['Stake books are authoritative'],
  };
  workflow.mechanicContract = {
    ...workflow.mechanicContract, status: 'frozen', sourceOfTruth: 'GAME_INFO.md', modes: ['base', 'dreamfall'],
    mechanics: ['cascades', 'expand reel'], eventVocabulary: ['reveal', 'expandReelHeight'],
    resolutionOrder: ['reveal', 'win', 'react', 'state', 'tumble'], disclosures: ['RTP', 'maximum win'],
  };
  workflow.fidelityLedger.entries = [{ id: 'dreamfall', title: 'Individual reels expand', status: 'in-progress', evidence: [] }];
  workflow.capabilityReview = {
    status: 'approved', approvedAt: '2026-08-11T00:00:00.000Z',
    items: [{ id: 'variable-reels', promiseId: 'dreamfall', disposition: 'extension', owner: 'frontend' }],
  };
  workflow.architecture = {
    ...workflow.architecture, status: 'approved', stateOwners: ['math owns reel heights'],
    eventProtocol: ['expandReelHeight is typed'], interactionRules: ['one hero effect at a time'],
    recoveryRules: ['restore heights from the book'],
  };
  workflow.feasibilitySpikes = {
    status: 'approved', items: [{ id: 'variable-mask', required: true, status: 'proven', evidence: ['scenario:mask-1'] }],
  };
  workflow.verticalSlice = {
    status: 'proven', scenarioIds: ['dreamfall-slice-1'], evidence: ['replay:101'], proves: ['dreamfall'],
    disciplineProof: { math: true, events: true, frontend: true, presentation: true, gameInfo: true, replay: true },
  };
  return workflow;
}

test('new projects preserve the fast Blueprint path while Flagship has a longer proof-first stage order', () => {
  const project = createGameProject({ name: 'Track Fixture' });
  assert.equal(ensureProductionWorkflow(project).track, 'blueprint');
  assert.deepEqual(getFactoryStageOrder(project), ['creative', 'visual', 'audio', 'frontend', 'math', 'certification', 'package']);
  setProductionTrack(project, 'flagship');
  assert.deepEqual(getFactoryStageOrder(project), [...FLAGSHIP_FACTORY_STAGE_ORDER]);
  const report = createFactoryRunReport('review', { track: 'flagship' });
  assert.equal(report.resumeStage, 'vision');
  assert.deepEqual(Object.keys(report.stages), [...FLAGSHIP_FACTORY_STAGE_ORDER]);
});

test('Flagship production remains blocked until every contract and vertical-slice gate is evidenced', () => {
  const project = createGameProject({ name: 'Flagship Gate Fixture' });
  setProductionTrack(project, 'flagship');
  assert.equal(getFactoryWorkflowGate(project, 'vision').complete, false);
  fillApprovedPreproduction(project);
  const summary = getFlagshipWorkflowSummary(project);
  assert.equal(summary.readyForProduction, true);
  assert.equal(summary.completedGates, summary.totalGates);
  assert.equal(summary.fidelity.complete, false, 'production can begin before final release fidelity evidence exists');
});

test('specialty agents are bounded by single-writer ownership and accepted handoffs', () => {
  const project = createGameProject({ name: 'Agent Coordination Fixture' });
  const workflow = setProductionTrack(project, 'flagship');
  assert.ok(Object.keys(SPECIALTY_AGENT_ROLES).length >= 10);
  assert.equal(workflow.agentCoordination.orchestrator, 'orchestrator');
  assert.equal(workflow.agentCoordination.policy.singleWriterPerArtifact, true);
  assert.equal(workflow.agentCoordination.policy.downstreamRequiresAcceptedHandoff, true);
  assert.equal(workflow.agentCoordination.policy.specialistsCannotApproveOwnGate, true);
  workflow.agentCoordination.policy.singleWriterPerArtifact = false;
  assert.equal(getFlagshipWorkflowSummary(project).agentPolicyEnforced, false);
});

test('specialty work rejects conflicting writers and downstream work requires an evidenced handoff', () => {
  const project = createGameProject({ name: 'Agent Handoff Fixture' });
  setProductionTrack(project, 'flagship');
  upsertSpecialtyAgentWorkItem(project, {
    id: 'mechanic-contract', owner: 'mechanic', artifact: 'mechanicContract', stage: 'contract',
    deliverables: ['Frozen rules'], acceptance: ['User approval'],
  });
  assert.throws(() => upsertSpecialtyAgentWorkItem(project, {
    id: 'math-overwrite', owner: 'math', artifact: 'mechanicContract', stage: 'contract',
  }), /active writer/);
  assert.throws(() => recordSpecialtyAgentHandoff(project, {
    workItemId: 'mechanic-contract', from: 'mechanic', to: 'math', status: 'accepted',
  }), /typed contract and evidence/);
  const handoff = recordSpecialtyAgentHandoff(project, {
    workItemId: 'mechanic-contract', from: 'mechanic', to: 'math', status: 'accepted',
    contract: ['Rules fingerprint mc-1'], evidence: ['Approval decision 42'],
  });
  assert.equal(handoff.status, 'accepted');
  const summary = getSpecialtyAgentCoordinationSummary(project);
  assert.equal(summary.acceptedHandoffs, 1);
  assert.equal(summary.active, 0, 'an accepted handoff closes the original writer lane');
  assert.doesNotThrow(() => upsertSpecialtyAgentWorkItem(project, {
    id: 'math-contract-consumer', owner: 'math', artifact: 'mechanicContract', stage: 'math',
  }));
});

test('Flagship launch uses a blueprint as inspiration without compiling it into a design ceiling', () => {
  const project = createGameProject({ name: 'Dream Court' });
  const result = prepareFactoryLaunch(project, {
    name: 'Dream Court', premise: 'A living dream court changes shape around its imprisoned god.',
    providerName: 'Reality Beast', tone: 'mysterious', blueprintId: 'cascade_colossus',
    productionTrack: 'flagship', seed: 'dream-court-flagship',
  });
  assert.equal(result.concept.productionTrack, 'flagship');
  assert.equal(project.production.workflow.track, 'flagship');
  assert.equal(project.blueprint, null);
  assert.equal(project.math.gameType, 'ways', 'the default project is not overwritten by the inspirational blueprint');
  const manifest = JSON.parse(new BuildEngine(project).generateWorkflowFiles()['stakestudio/production-workflow.json']);
  assert.equal(manifest.track, 'flagship');
  assert.equal(manifest.agentCoordination.policy.scopeChangesRequireUserApproval, true);
});

test('scenario lab runs seeded authoritative rounds and proves declared interaction pairs', () => {
  const project = createGameProject({ name: 'Scenario Lab Fixture' });
  project.math.betModes = [{ name: 'base', cost: 1, rtp: 0.965, maxWin: 5000, profile: { entry: 'base' } }];
  const workflow = setProductionTrack(project, 'flagship');
  workflow.mechanicContract.mechanics = ['cascades', 'wilds'];
  workflow.architecture.interactionMatrix = [{ left: 'cascades', right: 'wilds', disposition: 'allowed' }];
  upsertFlagshipScenario(project, {
    id: 'cascade-wild-pair', label: 'Cascade and wild pair', mode: 'base', seed: 117,
    kind: 'interaction', mechanics: ['cascades', 'wilds'], expected: { eventTypes: ['reveal', 'finalWin'] },
  });
  const run = runFlagshipScenario(project, 'cascade-wild-pair');
  assert.equal(run.passed, true);
  assert.deepEqual(run.eventTypes.slice(0, 1), ['reveal']);
  assert.equal(run.eventTypes.at(-1), 'finalWin');
  assert.equal(inspectFlagshipEventTimeline({ state: run.timeline.map(item => item.payload) }).length, run.timeline.length);
  const summary = getFlagshipScenarioLabSummary(project);
  assert.equal(summary.complete, true);
  assert.equal(summary.interactions.covered, 1);
});

test('scenario lab governs the approved interaction matrix instead of inventing a prose Cartesian product', () => {
  const project = createGameProject({ name: 'Declared Interaction Fixture' });
  const workflow = setProductionTrack(project, 'flagship');
  workflow.mechanicContract.mechanics = ['long prose mechanic one', 'long prose mechanic two', 'long prose mechanic three'];
  workflow.architecture.interactionMatrix = [
    { id: 'required-pair', left: 'mystery', right: 'veil', disposition: 'required' },
    { id: 'forbidden-pair', left: 'nexus', right: 'dreamfall', disposition: 'forbidden' },
  ];
  workflow.scenarioLab.scenarios = [{ mechanics: ['mystery', 'veil'] }];
  const summary = getFlagshipScenarioLabSummary(project);
  assert.equal(summary.interactions.requiredPairs, 1);
  assert.equal(summary.interactions.dispositioned, 2);
  assert.equal(summary.interactions.covered, 1);
  assert.equal(summary.interactions.complete, true);
});
