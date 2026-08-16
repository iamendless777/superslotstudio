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
  AGENT_JOB_LIMITS,
  FLAGSHIP_FACTORY_STAGE_ORDER,
  SPECIALTY_AGENT_ROLES,
  claimAgentJob,
  completeAgentJob,
  createAgentJob,
  ensureProductionWorkflow,
  failAgentJob,
  getFactoryStageOrder,
  getFlagshipWorkflowSummary,
  getSpecialtyAgentCoordinationSummary,
  heartbeatAgentJob,
  listAgentJobs,
  recordSpecialtyAgentHandoff,
  recoverStaleAgentJobLeases,
  setProductionTrack,
  updateAgentJob,
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

test('independent agents claim dependency-ready jobs through guarded leases and evidence completion', () => {
  const project = createGameProject({ name: 'Agent Job Protocol Fixture' });
  setProductionTrack(project, 'flagship');
  createAgentJob(project, {
    id: 'contract-job', owner: 'mechanic', artifact: 'contract.rules', stage: 'contract',
    deliverables: ['Typed rules'], acceptance: ['Rules compile'],
  });
  createAgentJob(project, {
    id: 'frontend-job', owner: 'frontend', artifact: 'frontend.runtime', stage: 'frontend',
    dependencies: ['contract-job'], deliverables: ['Runtime adapter'], acceptance: ['Replay passes'],
  });
  assert.throws(() => claimAgentJob(project, {
    jobId: 'frontend-job', agentId: 'frontend-agent-1', role: 'frontend', now: '2026-08-13T12:00:00.000Z',
  }), /blocked by: contract-job/);

  const claimed = claimAgentJob(project, {
    jobId: 'contract-job', agentId: 'mechanic-agent-1', role: 'mechanic', leaseSeconds: 60,
    now: '2026-08-13T12:00:00.000Z',
  });
  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.lease.holder, 'mechanic-agent-1');
  assert.throws(() => heartbeatAgentJob(project, {
    jobId: 'contract-job', agentId: 'mechanic-agent-2', leaseToken: claimed.lease.token,
    now: '2026-08-13T12:00:10.000Z',
  }), /another agent/);
  const heartbeat = heartbeatAgentJob(project, {
    jobId: 'contract-job', agentId: 'mechanic-agent-1', leaseToken: claimed.lease.token,
    now: '2026-08-13T12:00:10.000Z', leaseSeconds: 120,
  });
  assert.equal(heartbeat.status, 'in-progress');
  assert.equal(heartbeat.lease.expiresAt, '2026-08-13T12:02:10.000Z');
  const updated = updateAgentJob(project, {
    jobId: 'contract-job', agentId: 'mechanic-agent-1', leaseToken: claimed.lease.token,
    now: '2026-08-13T12:00:20.000Z', progress: 'Rules compiled', evidence: ['test:contract-rules'],
  });
  assert.deepEqual(updated.evidence, ['test:contract-rules']);
  const completed = completeAgentJob(project, {
    jobId: 'contract-job', agentId: 'mechanic-agent-1', leaseToken: claimed.lease.token,
    now: '2026-08-13T12:00:30.000Z', result: 'Ready for frontend', evidence: ['artifact:contract-v1'],
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.lease, null);

  const available = listAgentJobs(project, { availableOnly: true, now: '2026-08-13T12:00:31.000Z' });
  assert.deepEqual(available.jobs.map(job => job.id), ['frontend-job']);
  const frontend = claimAgentJob(project, {
    jobId: 'frontend-job', agentId: 'frontend-agent-1', role: 'frontend', now: '2026-08-13T12:00:31.000Z',
  });
  assert.equal(frontend.lease.holder, 'frontend-agent-1');
});

test('agent jobs prevent artifact conflicts, recover stale leases, and retain bounded failure evidence', () => {
  const project = createGameProject({ name: 'Agent Recovery Fixture' });
  setProductionTrack(project, 'flagship');
  createAgentJob(project, { id: 'visual-job', owner: 'visual', artifact: 'assets.hero', stage: 'visual' });
  assert.throws(() => createAgentJob(project, {
    id: 'visual-conflict', owner: 'visual', artifact: 'assets.hero', stage: 'visual',
  }), /active writer/);
  const claimed = claimAgentJob(project, {
    jobId: 'visual-job', agentId: 'visual-agent-1', role: 'visual', leaseSeconds: 30,
    now: '2026-08-13T12:00:00.000Z',
  });
  const recovery = recoverStaleAgentJobLeases(project, { now: '2026-08-13T12:00:31.000Z' });
  assert.deepEqual(recovery.recovered, ['visual-job']);
  const reClaimed = claimAgentJob(project, {
    jobId: 'visual-job', agentId: 'visual-agent-2', role: 'visual', leaseSeconds: 30,
    now: '2026-08-13T12:00:32.000Z',
  });
  assert.notEqual(reClaimed.lease.token, claimed.lease.token);
  const failed = failAgentJob(project, {
    jobId: 'visual-job', agentId: 'visual-agent-2', leaseToken: reClaimed.lease.token,
    now: '2026-08-13T12:00:40.000Z', reason: 'Source rig is missing', evidence: ['capture:rig-missing'],
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failureReason, 'Source rig is missing');
  assert.equal(failed.lease, null);
  assert.equal(getSpecialtyAgentCoordinationSummary(project).failed, 1);
});

test('agent-job evidence and history remain bounded during long-running coordination', () => {
  const project = createGameProject({ name: 'Agent Job Bounds Fixture' });
  setProductionTrack(project, 'flagship');
  createAgentJob(project, { id: 'bounded-job', owner: 'qa', artifact: 'qa.bounds' });
  const claimed = claimAgentJob(project, {
    jobId: 'bounded-job', agentId: 'qa-agent', role: 'qa', leaseSeconds: 3600,
    now: '2026-08-13T12:00:00.000Z',
  });
  for (let index = 0; index < 120; index++) {
    updateAgentJob(project, {
      jobId: 'bounded-job', agentId: 'qa-agent', leaseToken: claimed.lease.token,
      now: '2026-08-13T12:00:01.000Z', note: `update ${index}`, evidence: [`evidence ${index}`],
    });
  }
  const job = listAgentJobs(project, { now: '2026-08-13T12:00:02.000Z' }).jobs[0];
  assert.equal(job.evidence.length, AGENT_JOB_LIMITS.evidence);
  assert.equal(job.history.length, AGENT_JOB_LIMITS.history);
  assert.equal(job.evidence.at(-1), 'evidence 119');
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
