import {
  MORPHEUS_SIGNATURE_SCENARIO_ID,
  getMorpheusSignatureCaptureSummary,
} from '../quality/morpheus/MorpheusSignatureCaptureQA.js';
import {
  createVisualExcellenceDepartment,
  getVisualExcellenceSummary,
  normalizeVisualExcellenceDepartment,
} from './VisualExcellenceDepartment.js';

export const STUDIO_WORKFLOW_FORMAT = 'stake-studio-production-workflow-v1';
export const FIDELITY_LEDGER_FORMAT = 'stake-studio-vision-fidelity-v1';
export const AGENT_JOB_FORMAT = 'stake-studio-agent-job-v1';

export const AGENT_JOB_LIMITS = Object.freeze({
  jobs: 500,
  dependencies: 50,
  deliverables: 50,
  acceptance: 50,
  evidence: 100,
  history: 50,
  idCharacters: 160,
  textCharacters: 2000,
  minLeaseSeconds: 30,
  maxLeaseSeconds: 3600,
  defaultLeaseSeconds: 900,
});

const AGENT_JOB_TERMINAL_STATUSES = new Set([
  'accepted', 'complete', 'completed', 'cancelled', 'failed', 'handed-off',
]);
const AGENT_JOB_SUCCESS_STATUSES = new Set(['accepted', 'complete', 'completed', 'handed-off']);
const AGENT_JOB_LEASED_STATUSES = new Set(['claimed', 'in-progress']);

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
  presentation: Object.freeze({
    label: 'Visual Director / Orchestrator',
    owns: ['visual direction', 'hierarchy', 'sequence briefs', 'choreography', 'director review'],
    writes: ['presentationDirector', 'visualSequenceBrief', 'visualDirectorReview'],
    doesNotWrite: ['composition implementation', 'animation implementation', 'QA approval', 'human signoff'],
  }),
  visual: Object.freeze({
    label: 'Composition & Asset Specialist',
    owns: ['art bible', 'assets', 'placement', 'anchors', 'layers', 'responsive composition'],
    writes: ['theme', 'visualFactory', 'atlas', 'visualComposition', 'assetPlacement'],
    doesNotWrite: ['motion implementation', 'director review', 'QA approval'],
  }),
  motion_vfx: Object.freeze({
    label: 'Motion & VFX Specialist',
    owns: ['animation', 'easing', 'particles', 'impact', 'camera response', 'transitions'],
    writes: ['visualMotion', 'visualEffects'],
    doesNotWrite: ['visual direction', 'scene composition', 'director review', 'QA approval'],
  }),
  audio: Object.freeze({ label: 'Audio Director', owns: ['music', 'SFX', 'mix', 'sync'], writes: ['audio'] }),
  information: Object.freeze({ label: 'Player Information Editor', owns: ['Game Info', 'disclosures', 'rules parity'], writes: ['playerInformation'] }),
  qa: Object.freeze({ label: 'QA and Certification Lead', owns: ['scenarios', 'coverage', 'certification'], writes: ['qaEvidence'] }),
});

const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const strings = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const clone = value => JSON.parse(JSON.stringify(value));
const approved = value => ['approved', 'frozen', 'proven', 'complete'].includes(clean(value));

const jobText = value => clean(value).slice(0, AGENT_JOB_LIMITS.textCharacters);
const boundedStrings = (value, limit) => strings(value)
  .map(item => item.slice(0, AGENT_JOB_LIMITS.textCharacters))
  .slice(0, limit);

function timestamp(value = null) {
  const date = value instanceof Date ? value : value === null ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Agent-job time must be a valid date.');
  return date.toISOString();
}

function leaseSeconds(value) {
  const seconds = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : AGENT_JOB_LIMITS.defaultLeaseSeconds;
  return Math.max(AGENT_JOB_LIMITS.minLeaseSeconds, Math.min(AGENT_JOB_LIMITS.maxLeaseSeconds, seconds));
}

function leaseToken() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function normalizeAgentJob(input = {}) {
  const lease = input.lease && typeof input.lease === 'object' ? {
    holder: clean(input.lease.holder).slice(0, AGENT_JOB_LIMITS.idCharacters),
    token: clean(input.lease.token),
    claimedAt: input.lease.claimedAt || null,
    heartbeatAt: input.lease.heartbeatAt || null,
    expiresAt: input.lease.expiresAt || null,
    durationSeconds: leaseSeconds(input.lease.durationSeconds),
  } : null;
  return {
    ...clone(input),
    format: AGENT_JOB_FORMAT,
    execution: clean(input.execution) || 'legacy-compatible',
    id: clean(input.id),
    owner: clean(input.owner),
    artifact: jobText(input.artifact),
    stage: jobText(input.stage),
    status: clean(input.status) || 'planned',
    dependencies: boundedStrings(input.dependencies, AGENT_JOB_LIMITS.dependencies),
    deliverables: boundedStrings(input.deliverables, AGENT_JOB_LIMITS.deliverables),
    acceptance: boundedStrings(input.acceptance, AGENT_JOB_LIMITS.acceptance),
    evidence: boundedStrings(input.evidence, AGENT_JOB_LIMITS.evidence),
    progress: jobText(input.progress),
    attempts: Math.max(0, Math.floor(Number(input.attempts) || 0)),
    lease: lease?.holder && lease?.token && lease?.expiresAt ? lease : null,
    history: Array.isArray(input.history) ? clone(input.history).slice(-AGENT_JOB_LIMITS.history) : [],
  };
}

function appendJobHistory(job, event) {
  job.history = [...(job.history || []), event].slice(-AGENT_JOB_LIMITS.history);
}

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
    format: 'stake-studio-agent-coordination-v2',
    jobProtocol: {
      format: AGENT_JOB_FORMAT,
      execution: 'external-agent-claim',
      launchesModels: false,
      launchesCommands: false,
      leaseSeconds: AGENT_JOB_LIMITS.defaultLeaseSeconds,
    },
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
    visualExcellence: createVisualExcellenceDepartment(),
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
    visualExcellence: normalizeVisualExcellenceDepartment(input.visualExcellence),
    agentCoordination: {
      ...createAgentCoordination(),
      ...(input.agentCoordination || {}),
      policy: { ...createAgentCoordination().policy, ...(input.agentCoordination?.policy || {}) },
      activeRoles: [...new Set([
        ...strings(input.agentCoordination?.activeRoles || Object.keys(SPECIALTY_AGENT_ROLES))
          .filter(role => Object.hasOwn(SPECIALTY_AGENT_ROLES, role)),
        'motion_vfx',
      ])],
      jobProtocol: { ...createAgentCoordination().jobProtocol, ...(input.agentCoordination?.jobProtocol || {}) },
      workItems: Array.isArray(input.agentCoordination?.workItems)
        ? input.agentCoordination.workItems.slice(0, AGENT_JOB_LIMITS.jobs).map(normalizeAgentJob)
        : [],
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
  if (id.length > AGENT_JOB_LIMITS.idCharacters) throw new Error(`Agent-job IDs may not exceed ${AGENT_JOB_LIMITS.idCharacters} characters.`);
  if (!Object.hasOwn(SPECIALTY_AGENT_ROLES, owner)) throw new Error(`Unknown specialty-agent role "${owner}".`);
  if (!artifact) throw new Error('Specialty-agent work requires one owned artifact.');
  if (artifact.length > AGENT_JOB_LIMITS.textCharacters) throw new Error(`Agent-job artifacts may not exceed ${AGENT_JOB_LIMITS.textCharacters} characters.`);
  if (!coordination.workItems.some(item => item.id === id) && coordination.workItems.length >= AGENT_JOB_LIMITS.jobs) {
    throw new Error(`Agent-job limit reached (${AGENT_JOB_LIMITS.jobs}). Complete or archive existing work before adding more.`);
  }
  const conflict = coordination.workItems.find(item => item.id !== id
    && clean(item.artifact) === artifact
    && !AGENT_JOB_TERMINAL_STATUSES.has(clean(item.status)));
  if (conflict) throw new Error(`Artifact "${artifact}" already has active writer ${conflict.owner} (${conflict.id}).`);
  const currentIndex = coordination.workItems.findIndex(item => item.id === id);
  const current = currentIndex >= 0 ? coordination.workItems[currentIndex] : null;
  if (current?.execution === 'leased') {
    throw new Error(`Agent job "${id}" uses the leased protocol and cannot be changed through the legacy work-item tool.`);
  }
  if (current?.lease && new Date(current.lease.expiresAt).getTime() > Date.now()) {
    throw new Error(`Agent job "${id}" is claimed by ${current.lease.holder}; use the leased job update tools.`);
  }
  const item = normalizeAgentJob({
    ...(currentIndex >= 0 ? coordination.workItems[currentIndex] : {}),
    ...input,
    id,
    owner,
    artifact,
    stage: clean(input.stage),
    status: clean(input.status) || 'planned',
    dependencies: input.dependencies ?? current?.dependencies,
    deliverables: input.deliverables ?? current?.deliverables,
    acceptance: input.acceptance ?? current?.acceptance,
    evidence: input.evidence ?? current?.evidence,
    updatedAt: new Date().toISOString(),
  });
  if (currentIndex >= 0) coordination.workItems[currentIndex] = item;
  else coordination.workItems.push(item);
  workflow.updatedAt = item.updatedAt;
  return clone(item);
}

export function createAgentJob(project, input = {}) {
  const workflow = ensureProductionWorkflow(project, 'flagship');
  const id = clean(input.id);
  if (workflow.agentCoordination.workItems.some(item => item.id === id)) {
    throw new Error(`Agent job "${id}" already exists.`);
  }
  const dependencies = boundedStrings(input.dependencies, AGENT_JOB_LIMITS.dependencies);
  for (const dependencyId of dependencies) {
    if (dependencyId === id) throw new Error('An agent job cannot depend on itself.');
    if (!workflow.agentCoordination.workItems.some(item => item.id === dependencyId)) {
      throw new Error(`Unknown agent-job dependency "${dependencyId}".`);
    }
  }
  return upsertSpecialtyAgentWorkItem(project, {
    ...input, dependencies, execution: 'leased', status: clean(input.status) || 'planned',
  });
}

function jobById(coordination, id) {
  const job = coordination.workItems.find(item => item.id === clean(id));
  if (!job) throw new Error(`Unknown agent job "${clean(id)}".`);
  return job;
}

function dependencyState(coordination, job) {
  const blockedBy = [];
  for (const dependencyId of job.dependencies || []) {
    const dependency = coordination.workItems.find(item => item.id === dependencyId);
    if (!dependency || !AGENT_JOB_SUCCESS_STATUSES.has(clean(dependency.status))) blockedBy.push(dependencyId);
  }
  return { satisfied: blockedBy.length === 0, blockedBy };
}

function expiredLease(job, nowMs) {
  return job.lease && new Date(job.lease.expiresAt).getTime() <= nowMs;
}

export function recoverStaleAgentJobLeases(project, { now = null } = {}) {
  const workflow = ensureProductionWorkflow(project, 'flagship');
  const coordination = workflow.agentCoordination;
  const at = timestamp(now);
  const nowMs = new Date(at).getTime();
  const recovered = [];
  for (const job of coordination.workItems) {
    if (!AGENT_JOB_LEASED_STATUSES.has(clean(job.status)) || !expiredLease(job, nowMs)) continue;
    const previousHolder = job.lease.holder;
    const dependency = dependencyState(coordination, job);
    job.status = dependency.satisfied ? 'ready' : 'blocked';
    job.lease = null;
    job.updatedAt = at;
    appendJobHistory(job, { type: 'lease-recovered', at, previousHolder, blockedBy: dependency.blockedBy });
    recovered.push(job.id);
  }
  if (recovered.length) workflow.updatedAt = at;
  return { recovered, at };
}

export function listAgentJobs(project, filters = {}) {
  const recovery = recoverStaleAgentJobLeases(project, { now: filters.now });
  const coordination = ensureProductionWorkflow(project, 'flagship').agentCoordination;
  const status = clean(filters.status);
  const owner = clean(filters.owner);
  const availableOnly = filters.availableOnly === true;
  const jobs = coordination.workItems.map(job => {
    const dependency = dependencyState(coordination, job);
    const available = dependency.satisfied
      && !AGENT_JOB_TERMINAL_STATUSES.has(clean(job.status))
      && !job.lease;
    return { ...clone(job), available, blockedBy: dependency.blockedBy };
  }).filter(job => (!status || job.status === status)
    && (!owner || job.owner === owner)
    && (!availableOnly || job.available));
  return { jobs, recovered: recovery.recovered };
}

function assertJobLease(job, input, at) {
  if (!AGENT_JOB_LEASED_STATUSES.has(clean(job.status)) || !job.lease) {
    throw new Error(`Agent job "${job.id}" is not currently claimed.`);
  }
  if (expiredLease(job, new Date(at).getTime())) throw new Error(`Agent job "${job.id}" lease has expired.`);
  if (job.lease.holder !== clean(input.agentId) || job.lease.token !== clean(input.leaseToken)) {
    throw new Error(`Agent job "${job.id}" lease belongs to another agent.`);
  }
}

export function claimAgentJob(project, input = {}) {
  const at = timestamp(input.now);
  recoverStaleAgentJobLeases(project, { now: at });
  const workflow = ensureProductionWorkflow(project, 'flagship');
  const coordination = workflow.agentCoordination;
  const job = jobById(coordination, input.jobId);
  const agentId = clean(input.agentId);
  const role = clean(input.role);
  if (!agentId) throw new Error('Claiming an agent job requires a stable agent ID.');
  if (agentId.length > AGENT_JOB_LIMITS.idCharacters) throw new Error(`Agent IDs may not exceed ${AGENT_JOB_LIMITS.idCharacters} characters.`);
  if (!Object.hasOwn(SPECIALTY_AGENT_ROLES, role)) throw new Error(`Unknown specialty-agent role "${role}".`);
  if (role !== job.owner) throw new Error(`Agent job "${job.id}" belongs to the ${job.owner} lane, not ${role}.`);
  if (AGENT_JOB_TERMINAL_STATUSES.has(clean(job.status))) throw new Error(`Agent job "${job.id}" is already ${job.status}.`);
  if (job.lease) throw new Error(`Agent job "${job.id}" is already claimed by ${job.lease.holder}.`);
  const dependency = dependencyState(coordination, job);
  if (!dependency.satisfied) throw new Error(`Agent job "${job.id}" is blocked by: ${dependency.blockedBy.join(', ')}.`);
  const artifactConflict = coordination.workItems.find(candidate => candidate.id !== job.id
    && candidate.artifact === job.artifact
    && candidate.lease
    && !expiredLease(candidate, new Date(at).getTime()));
  if (artifactConflict) throw new Error(`Artifact "${job.artifact}" is leased by ${artifactConflict.lease.holder} (${artifactConflict.id}).`);
  const durationSeconds = leaseSeconds(input.leaseSeconds || coordination.jobProtocol.leaseSeconds);
  job.execution = 'leased';
  job.status = 'claimed';
  job.attempts += 1;
  job.lease = {
    holder: agentId,
    token: leaseToken(),
    claimedAt: at,
    heartbeatAt: at,
    expiresAt: new Date(new Date(at).getTime() + durationSeconds * 1000).toISOString(),
    durationSeconds,
  };
  job.updatedAt = at;
  appendJobHistory(job, { type: 'claimed', at, agentId, attempt: job.attempts });
  workflow.updatedAt = at;
  return clone(job);
}

export function heartbeatAgentJob(project, input = {}) {
  const workflow = ensureProductionWorkflow(project, 'flagship');
  const job = jobById(workflow.agentCoordination, input.jobId);
  const at = timestamp(input.now);
  assertJobLease(job, input, at);
  const durationSeconds = leaseSeconds(input.leaseSeconds || job.lease.durationSeconds);
  job.status = 'in-progress';
  job.lease.heartbeatAt = at;
  job.lease.expiresAt = new Date(new Date(at).getTime() + durationSeconds * 1000).toISOString();
  job.lease.durationSeconds = durationSeconds;
  job.updatedAt = at;
  workflow.updatedAt = at;
  return clone(job);
}

export function updateAgentJob(project, input = {}) {
  const workflow = ensureProductionWorkflow(project, 'flagship');
  const job = jobById(workflow.agentCoordination, input.jobId);
  const at = timestamp(input.now);
  assertJobLease(job, input, at);
  job.status = 'in-progress';
  if (input.progress !== undefined) job.progress = jobText(input.progress);
  const evidence = boundedStrings(input.evidence, AGENT_JOB_LIMITS.evidence);
  job.evidence = [...job.evidence, ...evidence].slice(-AGENT_JOB_LIMITS.evidence);
  const note = jobText(input.note);
  appendJobHistory(job, { type: 'updated', at, agentId: job.lease.holder, ...(note ? { note } : {}) });
  job.updatedAt = at;
  workflow.updatedAt = at;
  return clone(job);
}

export function completeAgentJob(project, input = {}) {
  const workflow = ensureProductionWorkflow(project, 'flagship');
  const job = jobById(workflow.agentCoordination, input.jobId);
  const at = timestamp(input.now);
  assertJobLease(job, input, at);
  const evidence = boundedStrings(input.evidence, AGENT_JOB_LIMITS.evidence);
  job.evidence = [...job.evidence, ...evidence].slice(-AGENT_JOB_LIMITS.evidence);
  if (!job.evidence.length) throw new Error(`Agent job "${job.id}" completion requires evidence.`);
  const agentId = job.lease.holder;
  job.status = 'completed';
  job.progress = jobText(input.result) || job.progress;
  job.completedAt = at;
  job.completedBy = agentId;
  job.lease = null;
  job.updatedAt = at;
  appendJobHistory(job, { type: 'completed', at, agentId });
  workflow.updatedAt = at;
  return clone(job);
}

export function failAgentJob(project, input = {}) {
  const workflow = ensureProductionWorkflow(project, 'flagship');
  const job = jobById(workflow.agentCoordination, input.jobId);
  const at = timestamp(input.now);
  assertJobLease(job, input, at);
  const reason = jobText(input.reason);
  if (!reason) throw new Error(`Agent job "${job.id}" failure requires a reason.`);
  const evidence = boundedStrings(input.evidence, AGENT_JOB_LIMITS.evidence);
  job.evidence = [...job.evidence, ...evidence].slice(-AGENT_JOB_LIMITS.evidence);
  const agentId = job.lease.holder;
  job.status = 'failed';
  job.failureReason = reason;
  job.failedAt = at;
  job.failedBy = agentId;
  job.lease = null;
  job.updatedAt = at;
  appendJobHistory(job, { type: 'failed', at, agentId, reason });
  workflow.updatedAt = at;
  return clone(job);
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
  if (status === 'accepted') {
    workItem.status = 'handed-off';
    workItem.lease = null;
    workItem.updatedAt = handoff.recordedAt;
    appendJobHistory(workItem, { type: 'handed-off', at: handoff.recordedAt, from, to, handoffId: handoff.id });
  }
  workflow.updatedAt = handoff.recordedAt;
  return clone(handoff);
}

export function getSpecialtyAgentCoordinationSummary(project) {
  const coordination = ensureProductionWorkflow(project).agentCoordination;
  const active = coordination.workItems.filter(item => !AGENT_JOB_TERMINAL_STATUSES.has(clean(item.status)));
  const artifactOwners = new Map();
  const conflicts = [];
  for (const item of active) {
    const artifact = clean(item.artifact);
    if (artifactOwners.has(artifact)) conflicts.push(artifact);
    else artifactOwners.set(artifact, item.id);
  }
  const pendingHandoffs = coordination.handoffs.filter(item => clean(item.status) === 'proposed');
  const nowMs = Date.now();
  return {
    roles: coordination.activeRoles.length,
    workItems: coordination.workItems.length,
    active: active.length,
    acceptedHandoffs: coordination.handoffs.filter(item => clean(item.status) === 'accepted').length,
    claimed: active.filter(item => item.lease && !expiredLease(item, nowMs)).length,
    staleLeases: active.filter(item => expiredLease(item, nowMs)).length,
    completed: coordination.workItems.filter(item => AGENT_JOB_SUCCESS_STATUSES.has(clean(item.status))).length,
    failed: coordination.workItems.filter(item => clean(item.status) === 'failed').length,
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
  const visualExcellence = getVisualExcellenceSummary(workflow.visualExcellence);
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
    visualExcellence,
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
