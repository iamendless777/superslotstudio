import {
  ART_BIBLE_FIELDS,
  artBibleFingerprint,
  compileArtDirection,
  getVisualCohesionStatus,
  getVisualFactoryTargets,
  normalizeVisualFactoryState,
} from './VisualAssetFactory.js';
import {
  createAssetProductionRun,
  normalizeAssetProductionRun,
  refreshAssetProductionRun,
} from './AssetProductionConductor.js';

export const VISUAL_WORK_ORDER_FORMAT = 'stake-studio-visual-work-order-v1';
export const VISUAL_WORK_ORDER_VERSION = 1;

export const VISUAL_PROVIDER_CONTRACT = Object.freeze({
  active: 'codex-handoff',
  adapters: Object.freeze([
    Object.freeze({ id: 'codex-handoff', label: 'Codex handoff', availability: 'active', cost: 'no project API key', transport: 'portable-work-order' }),
    Object.freeze({ id: 'manual-import', label: 'Artist or local tool', availability: 'active', cost: 'external', transport: 'named-png-pack' }),
    Object.freeze({ id: 'openai-api', label: 'OpenAI API', availability: 'optional', cost: 'paid usage', transport: 'direct-adapter' }),
    Object.freeze({ id: 'spine', label: 'Spine rigging', availability: 'optional', cost: 'paid application', transport: 'asset-pack' }),
  ]),
});

const SLOT_SPECS = Object.freeze({
  background: Object.freeze({ width: 1536, height: 1024, transparent: false, safeArea: 'Keep the central 58% calm, dark, and free of focal objects for the reel window.' }),
  foreground: Object.freeze({ width: 1024, height: 1536, transparent: true, safeArea: 'Keep the central 58% fully transparent and place framing art only around the outer edges.' }),
  symbol: Object.freeze({ width: 1024, height: 1024, transparent: true, safeArea: 'Keep the complete silhouette inside an 82% centered safe area with transparent breathing room.' }),
  characterPose: Object.freeze({ width: 1024, height: 1536, transparent: true, safeArea: 'Keep the complete body, costume, props, and extremities inside an 88% safe area.' }),
  providerLogo: Object.freeze({ width: 1024, height: 1024, transparent: true, safeArea: 'Use one icon-led mark inside a centered 72% safe area; avoid small text.' }),
});

function fingerprint(value) {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function safePart(value, fallback = 'asset') {
  return String(value || fallback).trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
}

function outputFilename(target) {
  if (target.slot === 'background') return 'background.png';
  if (target.slot === 'foreground') return 'foreground.png';
  if (target.slot === 'providerLogo') return 'provider_logo.png';
  if (target.slot === 'characterPose') return `character_${safePart(target.target)}.png`;
  return `${safePart(target.target)}.png`;
}

function artBibleSnapshot(project) {
  const bible = normalizeVisualFactoryState(project).artBible;
  return Object.fromEntries([
    ...ART_BIBLE_FIELDS.map(([field]) => [field, bible[field]]),
    ['lockedFingerprint', bible.lockedFingerprint],
  ]);
}

function referenceAttachment(reference) {
  return {
    id: reference.id,
    name: reference.name,
    role: reference.role,
    mimeType: String(reference.src || '').match(/^data:([^;,]+)/i)?.[1] || null,
    imageFingerprint: reference.imageFingerprint,
    dataUrl: reference.src,
  };
}

function itemPrompt(direction, target, spec) {
  const alpha = spec.transparent
    ? 'Deliver true transparent alpha. Do not use a checkerboard, colored matte, white backdrop, glow, fog, shadow, or reflected color at the canvas edge.'
    : 'Deliver a completely opaque finished background with no transparent pixels.';
  return [
    direction,
    `OUTPUT CONTRACT: Create only ${target.label.toLowerCase()}. Return one PNG named ${outputFilename(target)} at exactly ${spec.width}x${spec.height} pixels.`,
    alpha,
    spec.safeArea,
    'No mockup, UI, reels, watermark, caption, explanatory text, duplicate subject, or alternate layout. Preserve the locked visual lineage exactly.',
  ].join(' ');
}

export function createVisualWorkOrder(project, options = {}) {
  const cohesion = getVisualCohesionStatus(project);
  if (!cohesion.ready) throw new Error(cohesion.validation.issues[0] || (cohesion.bibleDrift ? 'Re-lock the changed Art Direction Bible.' : 'Lock the Art Direction Bible before preparing a visual work order.'));
  let run = normalizeAssetProductionRun(project);
  if (!run || options.replan === true) run = createAssetProductionRun(project, options);
  else run = refreshAssetProductionRun(project);
  if (run.blockers.length) throw new Error(run.blockers[0]);

  const targets = new Map(getVisualFactoryTargets(project).map(target => [target.key, target]));
  const attachments = new Map();
  const items = run.items.map(item => {
    const target = targets.get(item.key);
    if (!target) throw new Error(`Visual target "${item.key}" no longer exists.`);
    const compiled = compileArtDirection(project, target);
    compiled.references.forEach(reference => attachments.set(reference.id, referenceAttachment(reference)));
    const spec = SLOT_SPECS[target.slot];
    return {
      key: item.key,
      slot: target.slot,
      target: target.target || null,
      label: target.label,
      phase: item.phase,
      dependencies: [...item.dependencies],
      state: item.state,
      action: item.state === 'assigned' ? 'preserve' : item.state === 'protected' ? 'hold' : 'generate',
      protectedReason: item.state === 'protected' ? item.lastError : null,
      output: {
        filename: outputFilename(target),
        mimeType: 'image/png',
        width: spec.width,
        height: spec.height,
        transparent: spec.transparent,
        safeArea: spec.safeArea,
      },
      prompt: itemPrompt(compiled.text, target, spec),
      referenceIds: compiled.references.map(reference => reference.id),
      requiredGeneratedReferences: [...item.dependencies],
      acceptance: [
        'Exact filename, PNG encoding, and pixel dimensions',
        spec.transparent ? 'True clean alpha with no matte fringe or cropped silhouette' : 'Fully opaque canvas with a readable reel-safe center',
        'Locked palette, materials, motifs, shape language, and identity continuity',
        'Passes StakeStudio deterministic visual QA before assignment',
      ],
    };
  });

  const now = new Date().toISOString();
  const workOrder = {
    format: VISUAL_WORK_ORDER_FORMAT,
    version: VISUAL_WORK_ORDER_VERSION,
    project: { id: project.build?.stakeEngine?.gameId || project.id || safePart(project.name), name: project.name },
    createdAt: now,
    quality: run.quality,
    provider: VISUAL_PROVIDER_CONTRACT,
    bibleFingerprint: artBibleFingerprint(normalizeVisualFactoryState(project).artBible),
    planFingerprint: run.planFingerprint,
    artBible: artBibleSnapshot(project),
    productionOrder: items.filter(item => item.action === 'generate').map(item => item.key),
    delivery: {
      method: 'named-png-pack',
      instructions: 'Generate the items in productionOrder. For every dependent item, use each finished requiredGeneratedReferences PNG as a visual reference so the authored masters control the family. Return the finished PNG files with the exact output filenames, then import the folder in StakeStudio Game Config > Asset Pack. The compiler routes proven names to slots; release remains blocked until local integrity and whole-pack visual QA pass.',
      allOrPartialAccepted: true,
      approvalRequired: true,
    },
    referenceAttachments: [...attachments.values()],
    items,
  };
  workOrder.fingerprint = fingerprint({
    format: workOrder.format,
    project: workOrder.project,
    quality: workOrder.quality,
    bibleFingerprint: workOrder.bibleFingerprint,
    planFingerprint: workOrder.planFingerprint,
    productionOrder: workOrder.productionOrder,
    items: items.map(item => ({ key: item.key, state: item.state, action: item.action, output: item.output, prompt: item.prompt, referenceIds: item.referenceIds, requiredGeneratedReferences: item.requiredGeneratedReferences })),
  });
  const factory = normalizeVisualFactoryState(project);
  factory.workOrder = workOrder;
  return workOrder;
}

export function getVisualWorkOrderStatus(project) {
  const factory = normalizeVisualFactoryState(project);
  const workOrder = factory.workOrder;
  if (!workOrder || workOrder.format !== VISUAL_WORK_ORDER_FORMAT) return { exists: false, current: false, stale: false, reason: 'Prepare the free visual work order.' };
  const run = refreshAssetProductionRun(project);
  const bibleFingerprint = artBibleFingerprint(factory.artBible);
  const reasons = [];
  if (workOrder.bibleFingerprint !== bibleFingerprint) reasons.push('Art Direction Bible changed');
  if (!run || workOrder.planFingerprint !== run.planFingerprint) reasons.push('production plan changed');
  if (run) {
    const workItems = new Map((workOrder.items || []).map(item => [item.key, item]));
    const actionChanged = run.items.some(item => {
      const action = workItems.get(item.key)?.action;
      if (action === 'generate') return item.state === 'protected';
      if (action === 'preserve') return item.state !== 'assigned';
      if (action === 'hold') return item.state !== 'protected';
      return true;
    });
    if (actionChanged) reasons.push('production decisions changed');
  }
  const current = reasons.length === 0;
  return {
    exists: true,
    current,
    stale: !current,
    reason: current ? 'Ready for Codex or any compatible art tool.' : `${reasons.join(' and ')}; refresh the work order.`,
    fingerprint: workOrder.fingerprint,
    itemCount: workOrder.items?.length || 0,
    actionableCount: workOrder.productionOrder?.length || 0,
    protectedCount: workOrder.items?.filter(item => item.action === 'hold').length || 0,
    preservedCount: workOrder.items?.filter(item => item.action === 'preserve').length || 0,
    embeddedReferences: workOrder.referenceAttachments?.length || 0,
    createdAt: workOrder.createdAt,
  };
}

export function getVisualSlotSpec(slot) {
  return SLOT_SPECS[slot] ? { ...SLOT_SPECS[slot] } : null;
}
