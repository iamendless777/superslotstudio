import {
  MORPHEUS_SIGNATURE_SCENARIO_ID,
  getMorpheusSignatureCaptureSummary,
} from '../quality/morpheus/MorpheusSignatureCaptureQA.js';

export const STUDIO_WORKFLOW_FORMAT = 'stake-studio-production-workflow-v1';
export const FIDELITY_LEDGER_FORMAT = 'stake-studio-vision-fidelity-v1';

export const PRODUCTION_TRACKS = Object.freeze({
  blueprint: Object.freeze({
    id: 'blueprint',
    label: 'Blueprint',
    description: 'Fast executable production from a proven catalog foundation.',
  }),
  flagship: Object.freeze({
    id: 'flagship',
    label: 'Flagship',
    description: 'Contract-first production for bespoke mechanics, persistent state, and signature spectacle.',
  }),
});

export const BLUEPRINT_FACTORY_STAGE_ORDER = Object.freeze([
  'creative', 'visual', 'audio', 'frontend', 'math', 'certification', 'package',
]);

export const FLAGSHIP_FACTORY_STAGE_ORDER = Object.freeze([
  'vision', 'research', 'contract', 'capability', 'architecture', 'spikes',
  'verticalSlice', 'visual', 'audio', 'frontend', 'math', 'certification', 'package',
]);

export const FLAGSHIP_PREPRODUCTION_STAGES = Object.freeze([
  'vision', 'research', 'contract', 'capability', 'architecture', 'spikes', 'verticalSlice',
]);

export const SPECIALTY_AGENT_ROLES = Object.freeze({
  orchestrator: Object.freeze({ label: 'Game Orchestrator', owns: ['plan', 'approvals', 'dependencies', 'integration'], writes: ['workflow'] }),
  creative: Object.freeze({ label: 'Creative Director', owns: ['vision', 'world', 'player fantasy'], writes: ['vision', 'research'] }),
  mechanic: Object.freeze({ label: 'Mechanic Architect', owns: ['rules', 'state', 'interactions'], writes: ['mechanicContract', 'architecture'] }),
  math: Object.freeze({ label: 'Math Engineer', owns: ['probability', 'books', 'RTP', 'tail behavior'], writes: ['math', 'mathEvidence'] }),
  protocol: Object.freeze({ label: 'Event Protocol Engineer', owns: ['event vocabulary', 'causal order', 'replay payloads'], writes: ['eventProtocol'] }),
  frontend: Object.freeze({ label: 'Gameplay Frontend Engineer', owns: ['runtime state', 'renderer', 'HUD', 'recovery'], writes: ['frontend'] }),
  presentation: Object.freeze({ label: 'Presentation Director', owns: ['choreography', 'readability', 'effect concurrency'], writes: ['presentationDirector', 'animation'] }),
  visual: Object.freeze({ label: 'Art Director', owns: ['art bible', 'assets', 'visual continuity'], writes: ['theme', 'visualFactory', 'atlas'] }),
  audio: Object.freeze({ label: 'Audio Director', owns: ['music', 'SFX', 'mix', 'sync'], writes: ['audio'] }),
  information: Object.freeze({ label: 'Player Information Editor', owns: ['Game Info', 'disclosures', 'rules parity'], writes: ['playerInformation'] }),
  qa: Object.freeze({ label: 'QA and Certification Lead', owns: ['scenarios', 'coverage', 'certification'], writes: ['qaEvidence'] }),
});

const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const strings = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const clone = value => JSON.parse(JSON.stringify(value));
const approved = value => ['approved', 'frozen', 'proven', 'complete'].includes(clean(value));

function normalizedTrack(value) {
  return Object.hasOwn(PRODUCTION_TRACKS, value) ? value : 'blueprint';
}

function defaultDisciplineProof() {
  return {
    math: false,
    events: false,
    frontend: false,
    presentation: false,
    gameInfo: false,
    replay: false,
  };
}

function createAgentCoordination() {
  return {
    format: 'stake-studio-agent-coordination-v1',
    orchestrator: 'orchestrator',
    policy: {
      singleWriterPerArtifact: true,
      downstreamRequiresAcceptedHandoff: true,
      specialistsCannotApproveOwnGate: true,
      scopeChangesRequireUserApproval: true,
      conflictingWrites: 'stop-and-reconcile',
    },
    activeRoles: Object.keys(SPECIALTY_AGENT_ROLES),
    workItems: [],
    handoffs: [],
  };
}

export function createProductionWorkflow(track = 'blueprint') {
  return {
    format: STUDIO_WORKFLOW_FORMAT,
    version: 1,
    track: normalizedTrack(track),
    policy: {
      unsupportedBehavior: 'create-capability-task',
      substitution: 'explicit-approval-only',
      automatedScopeReduction: false,
      contractBeforeProduction: true,
    },
    vision: {
      status: 'draft',
      playerFantasy: '',
      marketPosition: '',
      complexityTarget: track === 'flagship' ? 'flagship' : 'focused',
      experiencePillars: [],
      signatureMoments: [],
      approvedAt: null,
    },
    research: {
      status: 'draft', references: [], findings: [], constraints: [], approvedAt: null,
    },
    mechanicContract: {
      status: 'draft',
      sourceOfTruth: '',
      modes: [],
      mechanics: [],
      eventVocabulary: [],
      resolutionOrder: [],
      disclosures: [],
      approvedAt: null,
      fingerprint: null,
    },
    capabilityReview: {
      status: 'draft',
      items: [],
      approvedAt: null,
    },
    architecture: {
      status: 'draft',
      stateOwners: [],
      eventProtocol: [],
      interactionRules: [],
      interactionMatrix: [],
      recoveryRules: [],
      approvedAt: null,
    },
    feasibilitySpikes: {
      status: 'draft',
      items: [],
      approvedAt: null,
    },
    verticalSlice: {
      status: 'draft',
      scenarioIds: [],
      evidence: [],
      proves: [],
      disciplineProof: defaultDisciplineProof(),
      approvedAt: null,
    },
    fidelityLedger: {
      format: FIDELITY_LEDGER_FORMAT,
      entries: [],
    },
    agentCoordination: createAgentCoordination(),
    scenarioLab: {
      format: 'stake-studio-flagship-scenario-lab-v1',
      scenarios: [],
      runs: [],
    },
    runHistory: [],
    updatedAt: null,
  };
}

export function normalizeProductionWorkflow(input = {}, fallbackTrack = 'blueprint') {
  const track = normalizedTrack(input.track || fallbackTrack);
  const base = createProductionWorkflow(track);
  const verticalSlice = input.verticalSlice || {};
  return {
    ...base,
    ...input,
    format: STUDIO_WORKFLOW_FORMAT,
    version: 1,
    track,
    policy: { ...base.policy, ...(input.policy || {}) },
    vision: {
      ...base.vision, ...(input.vision || {}),
      experiencePillars: strings(input.vision?.experiencePillars),
      signatureMoments: strings(input.vision?.signatureMoments),
    },
    research: {
      ...base.research, ...(input.research || {}),
      references: strings(input.research?.references),
      findings: strings(input.research?.findings),
      constraints: strings(input.research?.constraints),
    },
    mechanicContract: {
      ...base.mechanicContract, ...(input.mechanicContract || {}),
      modes: strings(input.mechanicContract?.modes),
      mechanics: strings(input.mechanicContract?.mechanics),
      eventVocabulary: strings(input.mechanicContract?.eventVocabulary),
      resolutionOrder: strings(input.mechanicContract?.resolutionOrder),
      disclosures: strings(input.mechanicContract?.disclosures),
    },
    capabilityReview: {
      ...base.capabilityReview, ...(input.capabilityReview || {}),
      items: Array.isArray(input.capabilityReview?.items) ? clone(input.capabilityReview.items) : [],
    },
    architecture: {
      ...base.architecture, ...(input.architecture || {}),
      stateOwners: strings(input.architecture?.stateOwners),
      eventProtocol: strings(input.architecture?.eventProtocol),
      interactionRules: strings(input.architecture?.interactionRules),
      interactionMatrix: Array.isArray(input.architecture?.interactionMatrix) ? clone(input.architecture.interactionMatrix) : [],
      recoveryRules: strings(input.architecture?.recoveryRules),
    },
    feasibilitySpikes: {
      ...base.feasibilitySpikes, ...(input.feasibilitySpikes || {}),
      items: Array.isArray(input.feasibilitySpikes?.items) ? clone(input.feasibilitySpikes.items) : [],
    },
    verticalSlice: {
      ...base.verticalSlice, ...verticalSlice,
      scenarioIds: strings(verticalSlice.scenarioIds),
      evidence: strings(verticalSlice.evidence),
      proves: strings(verticalSlice.proves),
      disciplineProof: { ...base.verticalSlice.disciplineProof, ...(verticalSlice.disciplineProof || {}) },
    },
    fidelityLedger: {
      format: FIDELITY_LEDGER_FORMAT,
      ...(input.fidelityLedger || {}),
      entries: Array.isArray(input.fidelityLedger?.entries) ? clone(input.fidelityLedger.entries) : [],
    },
    agentCoordination: {
      ...createAgentCoordination(),
      ...(input.agentCoordination || {}),
      policy: { ...createAgentCoordination().policy, ...(input.agentCoordination?.policy || {}) },
      activeRoles: strings(input.agentCoordination?.activeRoles || Object.keys(SPECIALTY_AGENT_ROLES))
        .filter(role => Object.hasOwn(SPECIALTY_AGENT_ROLES, role)),
      workItems: Array.isArray(input.agentCoordination?.workItems) ? clone(input.agentCoordination.workItems) : [],
      handoffs: Array.isArray(input.agentCoordination?.handoffs) ? clone(input.agentCoordination.handoffs) : [],
    },
    scenarioLab: {
      format: 'stake-studio-flagship-scenario-lab-v1',
      ...(input.scenarioLab || {}),
      scenarios: Array.isArray(input.scenarioLab?.scenarios) ? clone(input.scenarioLab.scenarios) : [],
      runs: Array.isArray(input.scenarioLab?.runs) ? clone(input.scenarioLab.runs).slice(0, 100) : [],
    },
    runHistory: Array.isArray(input.runHistory) ? clone(input.runHistory) : [],
  };
}

export function ensureProductionWorkflow(project, track = null) {
  project.production ||= {};
  const fallback = track || project.factoryLaunch?.productionTrack || project.production.workflow?.track || 'blueprint';
  project.production.workflow = normalizeProductionWorkflow(project.production.workflow, fallback);
  return project.production.workflow;
}

export function getProductionTrack(project) {
  return ensureProductionWorkflow(project).track;
}

export function getFactoryStageOrder(projectOrTrack = 'blueprint') {
  const track = typeof projectOrTrack === 'string'
    ? normalizedTrack(projectOrTrack)
    : getProductionTrack(projectOrTrack || {});
  return track === 'flagship' ? [...FLAGSHIP_FACTORY_STAGE_ORDER] : [...BLUEPRINT_FACTORY_STAGE_ORDER];
}

export function setProductionTrack(project, track) {
  const nextTrack = normalizedTrack(track);
  const workflow = ensureProductionWorkflow(project);
  if (workflow.track === nextTrack) return workflow;
  const previousRun = project.build?.factoryRun;
  if (previousRun) {
    workflow.runHistory.unshift(clone(previousRun));
    workflow.runHistory = workflow.runHistory.slice(0, 10);
  }
  workflow.track = nextTrack;
  workflow.vision.complexityTarget = nextTrack === 'flagship' ? 'flagship' : 'focused';
  workflow.updatedAt = new Date().toISOString();
  if (project.build) project.build.factoryRun = null;
  return workflow;
}

export function initializeFlagshipFromConcept(project, { premise = '', concept = null } = {}) {
  const workflow = setProductionTrack(project, 'flagship');
  workflow.vision = {
    ...workflow.vision,
    status: 'draft',
    playerFantasy: clean(premise),
    marketPosition: 'Original three-star flagship contender',
    complexityTarget: 'flagship',
    experiencePillars: strings(concept?.differentiators),
    signatureMoments: strings([concept?.signatureMoment]),
  };
  workflow.updatedAt = new Date().toISOString();
  return workflow;
}

export function upsertSpecialtyAgentWorkItem(project, input = {}) {
  const workflow = ensureProductionWorkflow(project, 'flagship');
  const coordination = workflow.agentCoordination;
  const id = clean(input.id);
  const owner = clean(input.owner);
  const artifact = clean(input.artifact);
  if (!id) throw new Error('Specialty-agent work requires a stable ID.');
  if (!Object.hasOwn(SPECIALTY_AGENT_ROLES, owner)) throw new Error(`Unknown specialty-agent role "${owner}".`);
  if (!artifact) throw new Error('Specialty-agent work requires one owned artifact.');
  const terminal = new Set(['accepted', 'complete', 'cancelled', 'handed-off']);
  const conflict = coordination.workItems.find(item => item.id !== id
    && clean(item.artifact) === artifact
    && clean(item.owner) !== owner
    && !terminal.has(clean(item.status)));
  if (conflict) throw new Error(`Artifact "${artifact}" already has active writer ${conflict.owner} (${conflict.id}).`);
  const currentIndex = coordination.workItems.findIndex(item => item.id === id);
  const item = {
    ...(currentIndex >= 0 ? coordination.workItems[currentIndex] : {}),
    ...input,
    id,
    owner,
    artifact,
    stage: clean(input.stage),
    status: clean(input.status) || 'planned',
    dependencies: strings(input.dependencies),
    deliverables: strings(input.deliverables),
    acceptance: strings(input.acceptance),
    evidence: strings(input.evidence),
    updatedAt: new Date().toISOString(),
  };
  if (currentIndex >= 0) coordination.workItems[currentIndex] = item;
  else coordination.workItems.push(item);
  workflow.updatedAt = item.updatedAt;
  return clone(item);
}

export function recordSpecialtyAgentHandoff(project, input = {}) {
  const workflow = ensureProductionWorkflow(project, 'flagship');
  const coordination = workflow.agentCoordination;
  const workItem = coordination.workItems.find(item => item.id === clean(input.workItemId));
  if (!workItem) throw new Error(`Unknown specialty-agent work item "${clean(input.workItemId)}".`);
  const from = clean(input.from || workItem.owner);
  const to = clean(input.to);
  if (!Object.hasOwn(SPECIALTY_AGENT_ROLES, from) || !Object.hasOwn(SPECIALTY_AGENT_ROLES, to)) throw new Error('Handoff roles must exist in the specialty-agent directory.');
  if (from === to) throw new Error('A specialist cannot accept its own handoff.');
  if (from !== workItem.owner) throw new Error(`Only the owning ${workItem.owner} lane can hand off ${workItem.id}.`);
  const status = ['proposed', 'accepted', 'rejected'].includes(clean(input.status)) ? clean(input.status) : 'proposed';
  const contract = strings(input.contract);
  const evidence = strings(input.evidence);
  if (status === 'accepted' && (!contract.length || !evidence.length)) throw new Error('Accepted handoffs require a typed contract and evidence.');
  const handoff = {
    id: clean(input.id) || `${workItem.id}:${from}:${to}`,
    workItemId: workItem.id,
    from,
    to,
    status,
    contract,
    evidence,
    recordedAt: new Date().toISOString(),
  };
  const currentIndex = coordination.handoffs.findIndex(item => item.id === handoff.id);
  if (currentIndex >= 0) coordination.handoffs[currentIndex] = handoff;
  else coordination.handoffs.push(handoff);
  if (status === 'accepted') workItem.status = 'handed-off';
  workflow.updatedAt = handoff.recordedAt;
  return clone(handoff);
}

export function getSpecialtyAgentCoordinationSummary(project) {
  const coordination = ensureProductionWorkflow(project).agentCoordination;
  const active = coordination.workItems.filter(item => !['accepted', 'complete', 'cancelled', 'handed-off'].includes(clean(item.status)));
  const artifactOwners = new Map();
  const conflicts = [];
  for (const item of active) {
    const artifact = clean(item.artifact);
    const owner = clean(item.owner);
    if (artifactOwners.has(artifact) && artifactOwners.get(artifact) !== owner) conflicts.push(artifact);
    else artifactOwners.set(artifact, owner);
  }
  const pendingHandoffs = coordination.handoffs.filter(item => clean(item.status) === 'proposed');
  return {
    roles: coordination.activeRoles.length,
    workItems: coordination.workItems.length,
    active: active.length,
    acceptedHandoffs: coordination.handoffs.filter(item => clean(item.status) === 'accepted').length,
    pendingHandoffs,
    conflicts: [...new Set(conflicts)],
    healthy: conflicts.length === 0,
  };
}

function gate(stage, label, missing, completeMessage, panel = 'build') {
  return {
    stage,
    label,
    complete: missing.length === 0,
    missing,
    panel,
    message: missing.length
      ? `${label} requires ${missing.length} decision${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`
      : completeMessage,
  };
}

function capabilityDisposition(item = {}) {
  return clean(item.disposition || item.status);
}

export function getFlagshipWorkflowGate(project, stage) {
  const workflow = ensureProductionWorkflow(project, 'flagship');
  if (workflow.track !== 'flagship') return gate(stage, 'Flagship workflow', [], 'Blueprint track does not require this gate.');

  if (stage === 'vision') {
    const missing = [];
    if (!approved(workflow.vision.status)) missing.push('approve the Vision Charter');
    if (!clean(workflow.vision.playerFantasy)) missing.push('player fantasy');
    if (!clean(workflow.vision.marketPosition)) missing.push('market position');
    if (workflow.vision.experiencePillars.length < 2) missing.push('at least two experience pillars');
    if (!workflow.vision.signatureMoments.length) missing.push('a signature moment');
    return gate(stage, 'Vision Charter', missing, 'Vision, ambition and signature experience are approved.', 'quality');
  }
  if (stage === 'research') {
    const missing = [];
    if (!approved(workflow.research.status)) missing.push('approve research');
    if (!workflow.research.references.length) missing.push('behavioral or technical references');
    if (!workflow.research.findings.length) missing.push('research findings');
    if (!workflow.research.constraints.length) missing.push('platform or production constraints');
    return gate(stage, 'Reference and Research', missing, 'References, findings and constraints are approved.', 'quality');
  }
  if (stage === 'contract') {
    const contract = workflow.mechanicContract;
    const missing = [];
    if (!approved(contract.status)) missing.push('approve and freeze the mechanic contract');
    if (!clean(contract.sourceOfTruth)) missing.push('authoritative source document');
    if (!contract.modes.length) missing.push('mode contract');
    if (!contract.mechanics.length) missing.push('mechanic definitions');
    if (!contract.eventVocabulary.length) missing.push('event vocabulary');
    if (!contract.resolutionOrder.length) missing.push('causal resolution order');
    if (!contract.disclosures.length) missing.push('player disclosures');
    if (!workflow.fidelityLedger.entries.length) missing.push('Vision Fidelity Ledger promises');
    return gate(stage, 'Authoritative Game Contract', missing, 'Game Info, mechanics, causal events and promises are frozen.', 'quality');
  }
  if (stage === 'capability') {
    const review = workflow.capabilityReview;
    const allowed = new Set(['supported', 'extension', 'spike', 'platform-blocked', 'approved-deferred']);
    const missing = [];
    if (!approved(review.status)) missing.push('approve the capability review');
    if (!review.items.length) missing.push('map every promised capability');
    const unresolved = review.items.filter(item => !clean(item.id) || !allowed.has(capabilityDisposition(item)) || !clean(item.owner));
    if (unresolved.length) missing.push(`${unresolved.length} unresolved capability item${unresolved.length === 1 ? '' : 's'}`);
    const silent = review.items.filter(item => ['substitute', 'approximate', 'generic-fallback'].includes(capabilityDisposition(item)));
    if (silent.length) missing.push(`${silent.length} forbidden generic substitution${silent.length === 1 ? '' : 's'}`);
    return gate(stage, 'Capability Gap Review', missing, 'Every promise is supported, assigned to an extension/spike, or explicitly dispositioned.', 'build');
  }
  if (stage === 'architecture') {
    const architecture = workflow.architecture;
    const missing = [];
    if (!approved(architecture.status)) missing.push('approve mechanic architecture');
    if (!architecture.stateOwners.length) missing.push('authoritative state ownership');
    if (!architecture.eventProtocol.length) missing.push('typed event protocol');
    if (!architecture.interactionRules.length) missing.push('interaction and concurrency rules');
    if (!architecture.recoveryRules.length) missing.push('replay and reconnect rules');
    return gate(stage, 'Mechanic Architecture', missing, 'State, events, interactions and recovery behavior are approved.', 'build');
  }
  if (stage === 'spikes') {
    const spikes = workflow.feasibilitySpikes;
    const required = spikes.items.filter(item => item.required !== false);
    const incomplete = required.filter(item => !['proven', 'complete', 'approved-deferred'].includes(clean(item.status)) || (!strings(item.evidence).length && clean(item.status) !== 'approved-deferred'));
    const missing = [];
    if (!approved(spikes.status)) missing.push('approve feasibility spike results');
    if (incomplete.length) missing.push(`${incomplete.length} unproven feasibility spike${incomplete.length === 1 ? '' : 's'}`);
    return gate(stage, 'Feasibility Spikes', missing, required.length ? `${required.length} hard technical risk${required.length === 1 ? '' : 's'} proven.` : 'No separate feasibility spikes are required.', 'build');
  }
  if (stage === 'verticalSlice') {
    const slice = workflow.verticalSlice;
    const missing = [];
    const morpheus = slice.scenarioIds.includes(MORPHEUS_SIGNATURE_SCENARIO_ID)
      ? getMorpheusSignatureCaptureSummary(project)
      : null;
    const disciplineProof = {
      ...slice.disciplineProof,
      ...(morpheus ? {
        frontend: morpheus.frontendComplete,
        presentation: morpheus.presentationComplete,
      } : {}),
    };
    if (!approved(slice.status)) missing.push('approve the signature vertical slice');
    if (!slice.scenarioIds.length) missing.push('deterministic scenario IDs');
    if (!slice.evidence.length) missing.push('playable evidence');
    if (!slice.proves.length) missing.push('declared promises proven by the slice');
    const disciplines = Object.entries(disciplineProof).filter(([, value]) => value !== true).map(([key]) => key);
    if (disciplines.length) missing.push(`proof for ${disciplines.join(', ')}`);
    if (morpheus && !morpheus.complete) missing.push(morpheus.stale
      ? 'fresh Morpheus signature capture evidence'
      : 'archived desktop/mobile/mini Morpheus signature captures');
    return {
      ...gate(stage, 'Signature Vertical Slice', missing, 'The signature experience is proven across math, events, frontend, presentation, Game Info and replay.', 'preview'),
      disciplineProof,
      signatureCapture: morpheus ? {
        format: morpheus.format,
        fingerprint: morpheus.fingerprint,
        evidenceHash: morpheus.evidenceHash,
        fresh: morpheus.fresh,
        complete: morpheus.complete,
        coreCaptureCount: morpheus.coreCaptureCount,
        archivedCaptureCount: morpheus.archivedCaptureCount,
      } : null,
    };
  }
  return gate(stage, stage, [`unknown flagship stage "${stage}"`], '', 'build');
}

export function getFidelityLedgerSummary(project) {
  const workflow = ensureProductionWorkflow(project);
  const entries = workflow.fidelityLedger.entries;
  const provenStatuses = new Set(['proven', 'approved-change']);
  const unresolved = entries.filter(entry => !provenStatuses.has(clean(entry.status)) || (clean(entry.status) === 'proven' && !strings(entry.evidence).length));
  const forbidden = entries.filter(entry => ['removed', 'substituted', 'silently-deferred'].includes(clean(entry.status)));
  return {
    total: entries.length,
    proven: entries.length - unresolved.length,
    unresolved,
    forbidden,
    complete: entries.length > 0 && unresolved.length === 0 && forbidden.length === 0,
  };
}

export function getFlagshipWorkflowSummary(project) {
  const workflow = ensureProductionWorkflow(project);
  const gates = Object.fromEntries(FLAGSHIP_PREPRODUCTION_STAGES.map(stage => [stage, getFlagshipWorkflowGate(project, stage)]));
  const fidelity = getFidelityLedgerSummary(project);
  const policyEnforced = workflow.policy.unsupportedBehavior === 'create-capability-task'
    && workflow.policy.substitution === 'explicit-approval-only'
    && workflow.policy.automatedScopeReduction === false
    && workflow.policy.contractBeforeProduction === true;
  const agentPolicyEnforced = workflow.agentCoordination.policy.singleWriterPerArtifact === true
    && workflow.agentCoordination.policy.downstreamRequiresAcceptedHandoff === true
    && workflow.agentCoordination.policy.specialistsCannotApproveOwnGate === true
    && workflow.agentCoordination.policy.scopeChangesRequireUserApproval === true
    && workflow.agentCoordination.policy.conflictingWrites === 'stop-and-reconcile';
  const agents = getSpecialtyAgentCoordinationSummary(project);
  return {
    track: workflow.track,
    stages: getFactoryStageOrder(workflow.track),
    gates,
    completedGates: Object.values(gates).filter(item => item.complete).length,
    totalGates: FLAGSHIP_PREPRODUCTION_STAGES.length,
    readyForProduction: workflow.track !== 'flagship' || Object.values(gates).every(item => item.complete),
    fidelity,
    policyEnforced,
    agentPolicyEnforced,
    agents,
  };
}

export function validateProductionWorkflow(project, { release = false } = {}) {
  const summary = getFlagshipWorkflowSummary(project);
  if (summary.track !== 'flagship') return [];
  const issues = [];
  if (!summary.policyEnforced) issues.push('Flagship no-degradation policy is not enforced.');
  if (!summary.agentPolicyEnforced) issues.push('Flagship specialty-agent handoff policy is not enforced.');
  for (const gate of Object.values(summary.gates)) if (!gate.complete) issues.push(gate.message);
  if (release && !summary.fidelity.complete) {
    issues.push(summary.fidelity.total
      ? `${summary.fidelity.unresolved.length} flagship promise${summary.fidelity.unresolved.length === 1 ? '' : 's'} lack final cross-discipline evidence.`
      : 'The flagship Vision Fidelity Ledger is empty.');
  }
  return issues;
}

export function createProductionWorkflowManifest(project) {
  const workflow = ensureProductionWorkflow(project);
  const summary = getFlagshipWorkflowSummary(project);
  return {
    format: STUDIO_WORKFLOW_FORMAT,
    version: 1,
    track: workflow.track,
    policy: clone(workflow.policy),
    agentCoordination: clone(workflow.agentCoordination),
    preproduction: Object.fromEntries(Object.entries(summary.gates).map(([id, value]) => [id, {
      complete: value.complete, message: value.message,
    }])),
    fidelity: {
      format: FIDELITY_LEDGER_FORMAT,
      total: summary.fidelity.total,
      proven: summary.fidelity.proven,
      complete: summary.fidelity.complete,
      entries: clone(workflow.fidelityLedger.entries),
    },
    workflow: clone(workflow),
  };
}
