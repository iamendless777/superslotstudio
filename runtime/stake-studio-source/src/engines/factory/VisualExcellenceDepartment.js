export const VISUAL_EXCELLENCE_FORMAT = 'stake-studio-visual-excellence-v1';
export const VISUAL_SEQUENCE_BRIEF_FORMAT = 'stake-studio-visual-sequence-brief-v1';

export const VISUAL_EXCELLENCE_PROOF_TYPES = Object.freeze(['tile-connections', 'tumble']);
export const VISUAL_INTENSITIES = Object.freeze(['micro', 'normal', 'major', 'peak']);
export const VISUAL_VIEWPORTS = Object.freeze(['desktop', 'mobile', 'mini']);
export const VISUAL_MOTION_MODES = Object.freeze(['normal', 'fast', 'reduced']);
export const VISUAL_BRIEF_STATUSES = Object.freeze([
  'draft', 'approved', 'in-production', 'rendered', 'in-review',
  'revision-required', 'director-approved', 'human-approved',
]);
export const VISUAL_DELIVERY_STATUSES = Object.freeze(['planned', 'submitted', 'accepted', 'rejected']);
export const VISUAL_REVIEW_VERDICTS = Object.freeze(['pending', 'approve', 'revise', 'block']);
export const HUMAN_VISUAL_SIGNOFF_STATUSES = Object.freeze(['required', 'pending', 'approved', 'rejected']);
export const VISUAL_FIRST_PROOF_STATUSES = Object.freeze([
  'planned', 'briefed', 'in-review', 'director-approved', 'revision-required', 'complete',
]);
export const VISUAL_NEXT_ACTION_TYPES = Object.freeze([
  'create-brief', 'produce-specialist-deliveries', 'render-and-qa',
  'refine-specialist-deliveries', 'human-signoff', 'complete',
]);

export const VISUAL_EXCELLENCE_ROLES = Object.freeze({
  presentation: Object.freeze({
    label: 'Visual Director / Orchestrator',
    authority: 'directs-and-reviews',
    owns: ['visual direction', 'hierarchy', 'sequence briefs', 'choreography', 'director review'],
    writes: ['visualSequenceBrief', 'visualDirectorReview'],
    prohibitedWrites: ['compositionImplementation', 'animationImplementation', 'qaApproval', 'humanSignoff'],
  }),
  visual: Object.freeze({
    label: 'Composition & Asset Specialist',
    authority: 'specialist',
    owns: ['placement', 'anchors', 'scale', 'depth', 'layers', 'masks', 'responsive composition'],
    writes: ['visualComposition', 'assetPlacement'],
    prohibitedWrites: ['visualDirection', 'motionImplementation', 'directorReview', 'qaApproval'],
  }),
  motion_vfx: Object.freeze({
    label: 'Motion & VFX Specialist',
    authority: 'specialist',
    owns: ['motion', 'easing', 'particles', 'impact', 'camera response', 'transitions', 'secondary motion'],
    writes: ['visualMotion', 'visualEffects'],
    prohibitedWrites: ['visualDirection', 'sceneComposition', 'directorReview', 'qaApproval'],
  }),
});

const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const strings = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const clone = value => JSON.parse(JSON.stringify(value));
const member = (value, allowed, fallback) => allowed.includes(clean(value)) ? clean(value) : fallback;
const members = (value, allowed, fallback) => {
  const selected = [...new Set(strings(value).filter(item => allowed.includes(item)))];
  return selected.length ? selected : [...fallback];
};

function normalizedPhases(value) {
  if (!Array.isArray(value)) return [];
  return value.map((phase, index) => ({
    id: clean(phase?.id) || `phase-${index + 1}`,
    intent: clean(phase?.intent),
    intensity: member(phase?.intensity, VISUAL_INTENSITIES, 'normal'),
    durationMs: Number.isFinite(Number(phase?.durationMs)) ? Math.max(0, Math.round(Number(phase.durationMs))) : null,
    event: clean(phase?.event),
    completionSignal: clean(phase?.completionSignal),
  })).filter(phase => phase.intent);
}

function normalizedEventInputs(value) {
  if (!Array.isArray(value)) return [];
  return value.map(input => ({
    event: clean(input?.event),
    sourceOwner: 'protocol',
    schema: clean(input?.schema),
    positionSource: clean(input?.positionSource),
    ordering: clean(input?.ordering),
    requiredFields: strings(input?.requiredFields),
  })).filter(input => input.event && input.schema && input.positionSource && input.ordering);
}

function nextAction(type = 'create-brief', input = {}) {
  return {
    type,
    briefId: clean(input.briefId),
    role: clean(input.role) || 'presentation',
    reason: clean(input.reason) || 'Create the first governed visual sequence brief.',
  };
}

export function createVisualExcellenceDepartment() {
  return {
    format: VISUAL_EXCELLENCE_FORMAT,
    name: 'Visual Excellence Department',
    hierarchy: {
      director: 'presentation',
      specialists: ['visual', 'motion_vfx'],
      implementation: 'frontend',
      independentReview: 'qa',
      humanFinalAuthority: true,
    },
    policy: {
      directorDirectsAndReviewsOnly: true,
      specialistsCannotRewriteDirection: true,
      separateArtifactWriters: true,
      authoritativeEventsRequired: true,
      renderedEvidenceRequired: true,
      qaIndependent: true,
      humanFinalSignoffRequired: true,
    },
    roles: clone(VISUAL_EXCELLENCE_ROLES),
    firstProof: {
      types: [...VISUAL_EXCELLENCE_PROOF_TYPES],
      status: 'planned',
      briefIds: [],
    },
    briefs: [],
    deliveries: [],
    reviews: [],
    humanSignoff: {
      status: 'required',
      decidedBy: '',
      decidedAt: null,
      notes: '',
      briefIds: [],
    },
    nextAction: nextAction(),
  };
}

export function normalizeVisualSequenceBrief(input = {}) {
  return {
    ...clone(input),
    format: VISUAL_SEQUENCE_BRIEF_FORMAT,
    id: clean(input.id),
    type: member(input.type, VISUAL_EXCELLENCE_PROOF_TYPES, ''),
    title: clean(input.title),
    status: member(input.status, VISUAL_BRIEF_STATUSES, 'draft'),
    objective: clean(input.objective),
    playerNeed: clean(input.playerNeed),
    intensity: member(input.intensity, VISUAL_INTENSITIES, 'normal'),
    phases: normalizedPhases(input.phases),
    viewports: members(input.viewports, VISUAL_VIEWPORTS, VISUAL_VIEWPORTS),
    motionModes: members(input.motionModes, VISUAL_MOTION_MODES, VISUAL_MOTION_MODES),
    authoritativeEventInputs: normalizedEventInputs(input.authoritativeEventInputs),
    compositionObjectives: strings(input.compositionObjectives),
    motionObjectives: strings(input.motionObjectives),
    audioCues: strings(input.audioCues),
    frontendCapabilities: strings(input.frontendCapabilities),
    acceptance: strings(input.acceptance),
    createdBy: 'presentation',
    createdAt: input.createdAt || null,
    updatedAt: input.updatedAt || null,
  };
}

export function normalizeVisualExcellenceDepartment(input = {}) {
  const base = createVisualExcellenceDepartment();
  const briefs = Array.isArray(input.briefs) ? input.briefs.map(normalizeVisualSequenceBrief).filter(brief => brief.id) : [];
  const deliveries = Array.isArray(input.deliveries) ? input.deliveries.map(delivery => ({
    ...clone(delivery),
    id: clean(delivery?.id),
    briefId: clean(delivery?.briefId),
    owner: clean(delivery?.owner),
    artifact: clean(delivery?.artifact),
    status: member(delivery?.status, VISUAL_DELIVERY_STATUSES, 'planned'),
    evidence: strings(delivery?.evidence),
  })).filter(delivery => delivery.id && delivery.briefId) : [];
  const reviews = Array.isArray(input.reviews) ? input.reviews.map(review => ({
    ...clone(review),
    id: clean(review?.id),
    briefId: clean(review?.briefId),
    reviewerRole: 'presentation',
    verdict: member(review?.verdict, VISUAL_REVIEW_VERDICTS, 'pending'),
    evidence: strings(review?.evidence),
    corrections: strings(review?.corrections),
    reviewedAt: review?.reviewedAt || null,
  })).filter(review => review.id && review.briefId) : [];
  return {
    ...base,
    ...clone(input),
    format: VISUAL_EXCELLENCE_FORMAT,
    hierarchy: { ...base.hierarchy, ...(input.hierarchy || {}) },
    policy: { ...base.policy, ...(input.policy || {}) },
    roles: clone(VISUAL_EXCELLENCE_ROLES),
    firstProof: {
      ...base.firstProof,
      ...(input.firstProof || {}),
      types: [...VISUAL_EXCELLENCE_PROOF_TYPES],
      status: member(input.firstProof?.status, VISUAL_FIRST_PROOF_STATUSES, 'planned'),
      briefIds: strings(input.firstProof?.briefIds).filter(id => briefs.some(brief => brief.id === id)),
    },
    briefs,
    deliveries,
    reviews,
    humanSignoff: {
      ...base.humanSignoff,
      ...(input.humanSignoff || {}),
      status: member(input.humanSignoff?.status, HUMAN_VISUAL_SIGNOFF_STATUSES, 'required'),
      decidedBy: clean(input.humanSignoff?.decidedBy),
      notes: clean(input.humanSignoff?.notes),
      briefIds: strings(input.humanSignoff?.briefIds).filter(id => briefs.some(brief => brief.id === id)),
    },
    nextAction: {
      ...base.nextAction,
      ...(input.nextAction || {}),
      type: member(input.nextAction?.type, VISUAL_NEXT_ACTION_TYPES, 'create-brief'),
      briefId: clean(input.nextAction?.briefId),
      role: clean(input.nextAction?.role) || 'presentation',
      reason: clean(input.nextAction?.reason) || base.nextAction.reason,
    },
  };
}

function briefById(department, briefId) {
  const brief = department.briefs.find(item => item.id === clean(briefId));
  if (!brief) throw new Error(`Unknown visual sequence brief "${clean(briefId)}".`);
  return brief;
}

export function upsertVisualSequenceBrief(departmentInput, input = {}) {
  const department = normalizeVisualExcellenceDepartment(departmentInput);
  const brief = normalizeVisualSequenceBrief(input);
  if (!brief.id) throw new Error('A visual sequence brief requires a stable ID.');
  if (!brief.type) throw new Error('A visual sequence brief must be a supported proof type.');
  if (!brief.objective || !brief.playerNeed) throw new Error('A visual sequence brief requires an objective and player need.');
  if (!brief.phases.length) throw new Error('A visual sequence brief requires at least one intentional phase.');
  if (!brief.authoritativeEventInputs.length) throw new Error('A visual sequence brief requires authoritative protocol event inputs.');
  const index = department.briefs.findIndex(item => item.id === brief.id);
  const now = new Date().toISOString();
  brief.createdAt = index >= 0 ? department.briefs[index].createdAt : (brief.createdAt || now);
  brief.updatedAt = now;
  if (index >= 0) department.briefs[index] = brief;
  else department.briefs.push(brief);
  if (!department.firstProof.briefIds.includes(brief.id)) department.firstProof.briefIds.push(brief.id);
  department.firstProof.status = department.firstProof.types.every(type => department.briefs.some(item => item.type === type))
    ? 'briefed' : 'planned';
  department.humanSignoff.status = 'required';
  department.nextAction = nextAction('produce-specialist-deliveries', {
    briefId: brief.id,
    role: 'visual',
    reason: 'Composition and Motion/VFX specialists must deliver separate artifacts from the approved brief.',
  });
  return department;
}

export function recordVisualExcellenceDelivery(departmentInput, input = {}) {
  const department = normalizeVisualExcellenceDepartment(departmentInput);
  briefById(department, input.briefId);
  const owner = clean(input.owner);
  if (!['visual', 'motion_vfx', 'protocol', 'frontend', 'audio', 'qa'].includes(owner)) {
    throw new Error('A visual delivery must belong to composition, motion/VFX, protocol, frontend, audio, or independent QA.');
  }
  const artifact = clean(input.artifact);
  if (!artifact) throw new Error('A visual delivery requires one owned artifact.');
  const conflict = department.deliveries.find(delivery => delivery.id !== clean(input.id)
    && delivery.artifact === artifact
    && !['accepted', 'rejected'].includes(delivery.status));
  if (conflict) throw new Error(`Visual artifact "${artifact}" already has active writer ${conflict.owner}.`);
  const delivery = {
    id: clean(input.id) || `${clean(input.briefId)}:${owner}`,
    briefId: clean(input.briefId),
    owner,
    artifact,
    status: member(input.status, VISUAL_DELIVERY_STATUSES, 'submitted'),
    evidence: strings(input.evidence),
    recordedAt: new Date().toISOString(),
  };
  if (delivery.status === 'accepted' && !delivery.evidence.length) throw new Error('Accepted visual deliveries require evidence.');
  const index = department.deliveries.findIndex(item => item.id === delivery.id);
  if (index >= 0) department.deliveries[index] = delivery;
  else department.deliveries.push(delivery);
  department.nextAction = nextAction('render-and-qa', {
    briefId: delivery.briefId,
    role: 'frontend',
    reason: 'Integrate accepted specialist contracts, render the result, then send it to independent QA.',
  });
  return department;
}

export function recordVisualDirectorReview(departmentInput, input = {}) {
  const department = normalizeVisualExcellenceDepartment(departmentInput);
  const brief = briefById(department, input.briefId);
  const verdict = member(input.verdict, VISUAL_REVIEW_VERDICTS, 'pending');
  const evidence = strings(input.evidence);
  const corrections = strings(input.corrections);
  if (verdict === 'approve' && !evidence.length) throw new Error('Visual Director approval requires rendered evidence.');
  if (verdict === 'approve') {
    const acceptedOwners = new Set(department.deliveries
      .filter(delivery => delivery.briefId === brief.id && delivery.status === 'accepted')
      .map(delivery => delivery.owner));
    const requiredOwners = ['protocol', 'visual', 'motion_vfx', 'frontend', 'qa'];
    if (brief.audioCues.length) requiredOwners.push('audio');
    const missingOwners = requiredOwners
      .filter(owner => !acceptedOwners.has(owner));
    if (missingOwners.length) {
      throw new Error(`Visual Director approval requires accepted handoffs from: ${missingOwners.join(', ')}.`);
    }
  }
  if (['revise', 'block'].includes(verdict) && !corrections.length) throw new Error(`${verdict} review requires explicit corrections.`);
  const review = {
    id: clean(input.id) || `${brief.id}:director-review:${department.reviews.length + 1}`,
    briefId: brief.id,
    reviewerRole: 'presentation',
    verdict,
    evidence,
    corrections,
    reviewedAt: new Date().toISOString(),
  };
  department.reviews.push(review);
  brief.status = verdict === 'approve' ? 'director-approved' : verdict === 'pending' ? 'in-review' : 'revision-required';
  department.firstProof.status = department.firstProof.types.every(type => department.briefs.some(item => item.type === type && item.status === 'director-approved'))
    ? 'director-approved' : 'in-review';
  department.nextAction = verdict === 'approve'
    ? nextAction('human-signoff', { briefId: brief.id, role: 'human', reason: 'The human retains final visual approval.' })
    : nextAction('refine-specialist-deliveries', { briefId: brief.id, role: 'visual', reason: corrections.join(' ') });
  return department;
}

export function recordHumanVisualSignoff(departmentInput, input = {}) {
  const department = normalizeVisualExcellenceDepartment(departmentInput);
  const status = member(input.status, HUMAN_VISUAL_SIGNOFF_STATUSES, 'pending');
  const briefIds = strings(input.briefIds);
  if (!['approved', 'rejected'].includes(status)) throw new Error('Human signoff records an approved or rejected decision.');
  if (!clean(input.decidedBy)) throw new Error('Human signoff requires the approving person.');
  if (!briefIds.length) throw new Error('Human signoff requires at least one visual brief.');
  const briefs = briefIds.map(id => briefById(department, id));
  if (status === 'approved' && briefs.some(brief => brief.status !== 'director-approved')) {
    throw new Error('Human approval requires Visual Director approval for every selected brief.');
  }
  department.humanSignoff = {
    status,
    decidedBy: clean(input.decidedBy),
    decidedAt: new Date().toISOString(),
    notes: clean(input.notes),
    briefIds,
  };
  if (status === 'approved') briefs.forEach(brief => { brief.status = 'human-approved'; });
  department.firstProof.status = department.firstProof.types.every(type => department.briefs.some(item => item.type === type && item.status === 'human-approved'))
    ? 'complete' : status === 'rejected' ? 'revision-required' : department.firstProof.status;
  department.nextAction = status === 'approved'
    ? nextAction('complete', { role: 'orchestrator', reason: 'The governed visual proof has final human approval.' })
    : nextAction('refine-specialist-deliveries', { role: 'presentation', reason: department.humanSignoff.notes || 'Human review rejected the current visual result.' });
  return department;
}

export function createVisualExcellenceJobPlan(briefInput = {}) {
  const brief = normalizeVisualSequenceBrief(briefInput);
  if (!brief.id) throw new Error('A visual job plan requires a saved brief ID.');
  const prefix = `visual:${brief.id}`;
  const specialistJobs = [
    { id: `${prefix}:protocol`, owner: 'protocol', artifact: `visualEventInputs:${brief.id}`, stage: 'visual', dependencies: [] },
    { id: `${prefix}:direction`, owner: 'presentation', artifact: `visualSequenceBrief:${brief.id}`, stage: 'visual', dependencies: [`${prefix}:protocol`] },
    { id: `${prefix}:composition`, owner: 'visual', artifact: `visualComposition:${brief.id}`, stage: 'visual', dependencies: [`${prefix}:direction`] },
    { id: `${prefix}:motion`, owner: 'motion_vfx', artifact: `visualMotion:${brief.id}`, stage: 'visual', dependencies: [`${prefix}:direction`] },
  ];
  if (brief.audioCues.length) {
    specialistJobs.push({ id: `${prefix}:audio`, owner: 'audio', artifact: `visualAudioSync:${brief.id}`, stage: 'audio', dependencies: [`${prefix}:direction`] });
  }
  const implementationDependencies = [`${prefix}:composition`, `${prefix}:motion`];
  if (brief.audioCues.length) implementationDependencies.push(`${prefix}:audio`);
  return [
    ...specialistJobs,
    { id: `${prefix}:implementation`, owner: 'frontend', artifact: `visualImplementation:${brief.id}`, stage: 'frontend', dependencies: implementationDependencies },
    { id: `${prefix}:qa`, owner: 'qa', artifact: `visualQa:${brief.id}`, stage: 'certification', dependencies: [`${prefix}:implementation`] },
    { id: `${prefix}:director-review`, owner: 'presentation', artifact: `visualDirectorReview:${brief.id}`, stage: 'visual', dependencies: [`${prefix}:qa`] },
  ].map(job => ({
    ...job,
    deliverables: [`Owned ${job.artifact} contract`],
    acceptance: ['Evidence attached', 'No conflicting artifact writer'],
  }));
}

export function getVisualExcellenceSummary(departmentInput) {
  const department = normalizeVisualExcellenceDepartment(departmentInput);
  const coveredTypes = VISUAL_EXCELLENCE_PROOF_TYPES.filter(type => department.briefs.some(brief => brief.type === type));
  const humanApprovedTypes = VISUAL_EXCELLENCE_PROOF_TYPES.filter(type => department.briefs.some(brief => brief.type === type && brief.status === 'human-approved'));
  return {
    format: department.format,
    roles: Object.keys(department.roles),
    briefCount: department.briefs.length,
    deliveryCount: department.deliveries.length,
    reviewCount: department.reviews.length,
    coveredTypes,
    humanApprovedTypes,
    firstProofComplete: humanApprovedTypes.length === VISUAL_EXCELLENCE_PROOF_TYPES.length,
    humanSignoff: clone(department.humanSignoff),
    nextAction: clone(department.nextAction),
  };
}
