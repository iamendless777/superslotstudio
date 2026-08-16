import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  SPECIALTY_AGENT_ROLES,
  createAgentJob,
  ensureProductionWorkflow,
  normalizeProductionWorkflow,
  setProductionTrack,
} from '../src/engines/factory/FlagshipWorkflow.js';
import {
  VISUAL_EXCELLENCE_PROOF_TYPES,
  createVisualExcellenceDepartment,
  createVisualExcellenceJobPlan,
  getVisualExcellenceSummary,
  recordHumanVisualSignoff,
  recordVisualDirectorReview,
  recordVisualExcellenceDelivery,
  upsertVisualSequenceBrief,
} from '../src/engines/factory/VisualExcellenceDepartment.js';

function brief(type, id = type) {
  return {
    id,
    type,
    title: type === 'tumble' ? 'Physical tumble sequence' : 'Authoritative tile connection',
    objective: type === 'tumble'
      ? 'Make a cascade readable as one physical sequence.'
      : 'Show the exact relationship between connected tile cells.',
    playerNeed: 'Understand what changed, why it changed, and when resolution is complete.',
    intensity: type === 'tumble' ? 'normal' : 'major',
    phases: type === 'tumble'
      ? [
        { id: 'recognition', intent: 'Recognize the win', event: 'winInfo', durationMs: 100 },
        { id: 'clear', intent: 'React and clear won symbols', event: 'tumbleClear', durationMs: 220 },
        { id: 'fall', intent: 'Resolve space, fall and settle', event: 'tumbleSettle', durationMs: 380 },
      ]
      : [
        { id: 'interaction', intent: 'Reveal source and target relationship', event: 'tileLink', durationMs: 180 },
        { id: 'propagation', intent: 'Propagate reactions in protocol order', event: 'tileLinkStep', durationMs: 260 },
        { id: 'resolution', intent: 'Acknowledge complete resolution', event: 'tileLinkComplete', durationMs: 120 },
      ],
    viewports: ['desktop', 'mobile', 'mini'],
    motionModes: ['normal', 'fast', 'reduced'],
    authoritativeEventInputs: [{
      event: type === 'tumble' ? 'tumble' : 'tileLink',
      schema: `${type}-event-v1`,
      positionSource: 'protocol event cell coordinates',
      ordering: 'authoritative event sequence',
      requiredFields: ['source', 'targets', 'sequence'],
    }],
    compositionObjectives: ['Resolve all positions from reel-cell anchors.'],
    motionObjectives: ['Preserve causal order and signal completion.'],
    audioCues: ['Synchronize impact with the authoritative resolution event.'],
    frontendCapabilities: ['Relationship graph and cell-anchor resolver.'],
    acceptance: ['Preview and export consume the same sequence contract.'],
  };
}

function acceptDelivery(department, briefId, owner) {
  return recordVisualExcellenceDelivery(department, {
    id: `${briefId}:${owner}`,
    briefId,
    owner,
    artifact: `${owner}:${briefId}`,
    status: 'accepted',
    evidence: [`evidence:${owner}:${briefId}`],
  });
}

test('existing visual lanes are refocused and only Motion/VFX is a new specialist', () => {
  assert.equal(SPECIALTY_AGENT_ROLES.presentation.label, 'Visual Director / Orchestrator');
  assert.equal(SPECIALTY_AGENT_ROLES.visual.label, 'Composition & Asset Specialist');
  assert.equal(SPECIALTY_AGENT_ROLES.motion_vfx.label, 'Motion & VFX Specialist');
  assert.ok(SPECIALTY_AGENT_ROLES.presentation.doesNotWrite.includes('animation implementation'));
  assert.ok(SPECIALTY_AGENT_ROLES.visual.doesNotWrite.includes('motion implementation'));
  assert.ok(SPECIALTY_AGENT_ROLES.motion_vfx.doesNotWrite.includes('scene composition'));
});

test('legacy workflows retain work items and gain the governed department without role duplication', () => {
  const legacy = {
    track: 'flagship',
    agentCoordination: {
      format: 'stake-studio-agent-coordination-v1',
      activeRoles: ['orchestrator', 'presentation', 'visual', 'qa'],
      workItems: [{
        id: 'legacy-animation', owner: 'presentation', artifact: 'legacy.animation', status: 'complete',
      }],
    },
  };
  const workflow = normalizeProductionWorkflow(legacy, 'flagship');
  assert.equal(workflow.agentCoordination.workItems[0].id, 'legacy-animation');
  assert.ok(workflow.agentCoordination.activeRoles.includes('presentation'));
  assert.ok(workflow.agentCoordination.activeRoles.includes('visual'));
  assert.ok(workflow.agentCoordination.activeRoles.includes('motion_vfx'));
  assert.deepEqual(Object.keys(workflow.visualExcellence.roles), ['presentation', 'visual', 'motion_vfx']);
  assert.equal(workflow.visualExcellence.humanSignoff.status, 'required');
});

test('machine-readable briefs require phases and authoritative protocol event inputs', () => {
  const department = createVisualExcellenceDepartment();
  assert.throws(() => upsertVisualSequenceBrief(department, {
    ...brief('tile-connections'), phases: [],
  }), /intentional phase/);
  assert.throws(() => upsertVisualSequenceBrief(department, {
    ...brief('tile-connections'), authoritativeEventInputs: [],
  }), /authoritative protocol event inputs/);
  const next = upsertVisualSequenceBrief(department, brief('tile-connections'));
  const saved = next.briefs[0];
  assert.equal(saved.createdBy, 'presentation');
  assert.deepEqual(saved.viewports, ['desktop', 'mobile', 'mini']);
  assert.deepEqual(saved.motionModes, ['normal', 'fast', 'reduced']);
  assert.equal(saved.authoritativeEventInputs[0].sourceOwner, 'protocol');
});

test('job plan has separate writers, explicit handoffs, independent QA, and Director review last', () => {
  const plan = createVisualExcellenceJobPlan(brief('tile-connections'));
  assert.deepEqual(plan.map(job => job.owner), [
    'protocol', 'presentation', 'visual', 'motion_vfx', 'audio', 'frontend', 'qa', 'presentation',
  ]);
  assert.equal(new Set(plan.map(job => job.artifact)).size, plan.length);
  assert.deepEqual(plan.find(job => job.owner === 'frontend').dependencies.sort(), [
    'visual:tile-connections:audio',
    'visual:tile-connections:composition',
    'visual:tile-connections:motion',
  ]);
  assert.deepEqual(plan.find(job => job.owner === 'qa').dependencies, ['visual:tile-connections:implementation']);
  assert.deepEqual(plan.at(-1).dependencies, ['visual:tile-connections:qa']);

  const project = createGameProject({ name: 'Visual Jobs Fixture' });
  setProductionTrack(project, 'flagship');
  for (const job of plan) createAgentJob(project, job);
  const saved = ensureProductionWorkflow(project).agentCoordination.workItems;
  assert.equal(saved.length, plan.length);
  assert.equal(saved.every(job => job.execution === 'leased'), true);
  assert.equal(ensureProductionWorkflow(project).agentCoordination.jobProtocol.launchesModels, false);
});

test('job plan omits audio work and dependency when the approved brief has no audio cues', () => {
  const input = brief('tumble');
  input.audioCues = [];
  const plan = createVisualExcellenceJobPlan(input);
  assert.equal(plan.some(job => job.owner === 'audio'), false);
  const implementation = plan.find(job => job.owner === 'frontend');
  assert.deepEqual(implementation.dependencies, [
    'visual:tumble:composition',
    'visual:tumble:motion',
  ]);
});

test('Director cannot approve before every specialist and implementation handoff including independent QA', () => {
  let department = upsertVisualSequenceBrief(createVisualExcellenceDepartment(), brief('tile-connections'));
  for (const owner of ['protocol', 'visual', 'motion_vfx', 'audio', 'frontend']) {
    department = acceptDelivery(department, 'tile-connections', owner);
  }
  assert.throws(() => recordVisualDirectorReview(department, {
    briefId: 'tile-connections', verdict: 'approve', evidence: ['capture:desktop'],
  }), /qa/);
  department = acceptDelivery(department, 'tile-connections', 'qa');
  department = recordVisualDirectorReview(department, {
    briefId: 'tile-connections', verdict: 'approve',
    evidence: ['capture:desktop', 'capture:mobile', 'capture:mini'],
  });
  assert.equal(department.briefs[0].status, 'director-approved');
  assert.equal(department.humanSignoff.status, 'required');
  assert.equal(department.nextAction.type, 'human-signoff');
});

test('tile connections and tumbles complete only after Director review and human final signoff', () => {
  let department = createVisualExcellenceDepartment();
  for (const type of VISUAL_EXCELLENCE_PROOF_TYPES) {
    department = upsertVisualSequenceBrief(department, brief(type));
    for (const owner of ['protocol', 'visual', 'motion_vfx', 'audio', 'frontend', 'qa']) {
      department = acceptDelivery(department, type, owner);
    }
    department = recordVisualDirectorReview(department, {
      briefId: type,
      verdict: 'approve',
      evidence: [`render:${type}:desktop`, `render:${type}:mobile`, `render:${type}:mini`],
    });
  }
  assert.equal(getVisualExcellenceSummary(department).firstProofComplete, false);
  department = recordHumanVisualSignoff(department, {
    status: 'approved',
    decidedBy: 'human-owner',
    briefIds: ['tile-connections', 'tumble'],
    notes: 'Approved after direct visual inspection.',
  });
  const summary = getVisualExcellenceSummary(department);
  assert.equal(summary.firstProofComplete, true);
  assert.deepEqual(summary.humanApprovedTypes, ['tile-connections', 'tumble']);
  assert.equal(summary.humanSignoff.status, 'approved');
  assert.equal(summary.nextAction.type, 'complete');
});

test('Visual Director review requests explicit corrections and never writes specialist deliveries', () => {
  let department = upsertVisualSequenceBrief(createVisualExcellenceDepartment(), brief('tumble'));
  assert.throws(() => recordVisualExcellenceDelivery(department, {
    briefId: 'tumble', owner: 'presentation', artifact: 'animation:tumble', status: 'submitted',
  }), /must belong to composition/);
  assert.throws(() => recordVisualDirectorReview(department, {
    briefId: 'tumble', verdict: 'revise', evidence: ['capture:tumble'],
  }), /explicit corrections/);
  department = recordVisualDirectorReview(department, {
    briefId: 'tumble', verdict: 'revise', evidence: ['capture:tumble'],
    corrections: ['Increase settle readability without changing reel geometry.'],
  });
  assert.equal(department.briefs[0].status, 'revision-required');
  assert.equal(department.nextAction.type, 'refine-specialist-deliveries');
});
