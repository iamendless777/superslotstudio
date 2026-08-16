export const ASSET_ORCHESTRATION_FORMAT = 'stake-studio-asset-orchestration-v1';
export const ASSET_ORCHESTRATION_QA_FORMAT = 'stake-studio-asset-orchestration-qa-v1';

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const HASH_PATTERN = /^[0-9a-f]{8}$/i;
const VIEWPORTS = Object.freeze(['desktop', 'mobile', 'mini']);
const ROW_STATES = Object.freeze([4, 5, 6, 7, 8]);

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const clean = value => String(value ?? '').trim();
const finite = value => Number.isFinite(Number(value));

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hashValue(value) {
  return hashText(JSON.stringify(canonicalize(value)));
}

function sourceSignature(source) {
  const value = clean(source);
  if (!value) return '';
  if (!/^(data:|blob:|https?:|\/)/.test(value)) return value;
  return `${value.length}:${hashText(`${value.slice(0, 48)}:${value.slice(-64)}`)}`;
}

function projectProjection(project = {}) {
  return {
    id: project.id || project.gameId || '',
    symbols: (project.theme?.symbols || []).map(symbol => ({
      name: symbol.name,
      source: sourceSignature(symbol.src),
      motionAssetId: symbol.motionAssetId || '',
    })),
    cabinet: (project.theme?.cabinet?.layers || []).map(layer => ({
      id: layer.id || layer.name || layer.type,
      role: layer.assetPackRole || layer.type || '',
      source: sourceSignature(layer.src),
      x: layer.x, y: layer.y, width: layer.width, height: layer.height,
    })),
    character: {
      poses: Object.fromEntries(Object.entries(project.theme?.character?.poses || {})
        .map(([key, value]) => [key, sourceSignature(value)])),
      placement: project.theme?.character?.placement || null,
    },
    environment: Object.fromEntries(Object.entries(project.theme?.environmentAssets || {})
      .map(([key, value]) => [key, {
        source: sourceSignature(value?.src),
        x: value?.x, y: value?.y, width: value?.width, height: value?.height,
      }])),
    presentationAssets: Object.fromEntries(Object.entries(project.theme?.presentationAssets || {})
      .map(([key, value]) => [key, sourceSignature(value)])),
    motionAssets: (project.animation?.visualEffects?.motionAssets || []).map(asset => ({
      id: asset.id, source: sourceSignature(asset.src), columns: asset.columns, rows: asset.rows,
      frames: asset.frames, fps: asset.fps, loop: asset.loop, blendMode: asset.blendMode,
    })),
    effectBindings: (project.animation?.visualEffects?.bindings || []).map(binding => ({
      id: binding.id, event: binding.event, recipeId: binding.recipeId,
      enabled: binding.enabled !== false, blocking: Boolean(binding.blocking),
    })),
    presentationRecipes: (project.presentationDirector?.recipes || []).map(recipe => ({
      event: recipe.event, enabled: recipe.enabled !== false,
      cues: (recipe.cues || []).map(cue => ({
        at: cue.at, channel: cue.channel, action: cue.action, target: cue.target,
        enabled: cue.enabled !== false,
      })),
    })),
    audio: {
      layers: Object.keys(project.audio?.layers || {}).sort(),
      stingers: Object.keys(project.audio?.stingers || {}).sort(),
    },
    frontendManifest: (project.build?.frontend?.manifest || []).map(file => ({
      path: file.path, bytes: file.bytes, sha256: file.sha256,
    })),
    frontendAssetLineage: (project.build?.frontend?.verification?.assetPackaging?.lineage?.assets || [])
      .map(asset => ({
        id: asset.id, role: asset.role, category: asset.category,
        path: asset.path, bytes: asset.bytes, sha256: asset.sha256,
      })),
  };
}

function evidenceProjection(evidence = {}) {
  const copy = clone(evidence) || {};
  for (const key of ['fingerprint', 'runAt', 'passed', 'issues', 'diagnostics', 'evidenceHash']) delete copy[key];
  return copy;
}

export function getAssetOrchestrationFingerprint(project, evidence = {}) {
  const normalized = normalizeEvidence(evidence);
  return `asset-orchestration-${hashValue({
    format: ASSET_ORCHESTRATION_FORMAT,
    project: projectProjection(project),
    evidence: evidenceProjection(normalized),
  })}`;
}

function normalizeEvidence(evidence = {}) {
  return {
    ...clone(evidence),
    authority: {
      contractFingerprint: '', requiredEventCount: 0,
      eventTypes: [], mechanicIds: [], eventDefinitions: {},
      viewports: [...VIEWPORTS], rowStates: [...ROW_STATES],
      captureRequiredEventTypes: [],
      requiredInteractionPairs: [],
      sourceInventoryRequired: false,
      ...(clone(evidence.authority) || {}),
    },
    assets: Array.isArray(evidence.assets) ? clone(evidence.assets) : [],
    files: {
      saved: Array.isArray(evidence.files?.saved) ? clone(evidence.files.saved) : [],
      packaged: Array.isArray(evidence.files?.packaged) ? clone(evidence.files.packaged) : [],
    },
    renderSamples: Array.isArray(evidence.renderSamples) ? clone(evidence.renderSamples) : [],
    choreographies: Array.isArray(evidence.choreographies) ? clone(evidence.choreographies) : [],
    captureBindings: Array.isArray(evidence.captureBindings) ? clone(evidence.captureBindings) : [],
    interactionDispositions: Array.isArray(evidence.interactionDispositions) ? clone(evidence.interactionDispositions) : [],
    interactionScenarios: Array.isArray(evidence.interactionScenarios) ? clone(evidence.interactionScenarios) : [],
    nfr: clone(evidence.nfr) || {},
    sourceAssetInventory: clone(evidence.sourceAssetInventory) || null,
  };
}

function addDiagnostic(diagnostics, id, scope, message) {
  diagnostics.push({ id, scope, message });
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function pairKey(left, right) {
  return [clean(left), clean(right)].sort().join('::');
}

function requiredInteractionPairKeys(authority) {
  const declared = Array.isArray(authority.requiredInteractionPairs)
    ? authority.requiredInteractionPairs : [];
  if (declared.length) return uniqueStrings(declared.map(pair => (
    Array.isArray(pair) && pair.length === 2 ? pairKey(pair[0], pair[1]) : ''
  )));
  const required = [];
  for (let left = 0; left < authority.mechanics.length; left++) {
    for (let right = left + 1; right < authority.mechanics.length; right++) {
      required.push(pairKey(authority.mechanics[left], authority.mechanics[right]));
    }
  }
  return required;
}

function lineageEntries(asset) {
  return ['source', 'runtime', 'packaged'].flatMap(lifecycle => {
    const entry = asset.lineage?.[lifecycle];
    return entry ? [{ assetId: asset.id, lifecycle, ...entry }] : [];
  });
}

function validateAuthority(evidence, diagnostics) {
  const authority = evidence.authority;
  const events = uniqueStrings(authority.eventTypes);
  const mechanics = uniqueStrings(authority.mechanicIds);
  if (!clean(authority.contractFingerprint)) {
    addDiagnostic(diagnostics, 'schema.authority.contract-fingerprint', 'authority', 'contractFingerprint is required');
  }
  if (!events.length) addDiagnostic(diagnostics, 'schema.authority.events', 'authority', 'at least one authoritative event type is required');
  if (duplicateValues(authority.eventTypes || []).length) addDiagnostic(diagnostics, 'schema.authority.duplicate-events', 'authority', 'eventTypes contains duplicates');
  if (Number(authority.requiredEventCount) !== events.length) {
    addDiagnostic(diagnostics, 'schema.authority.event-count', 'authority', `requiredEventCount ${Number(authority.requiredEventCount) || 0} does not equal ${events.length}`);
  }
  const viewports = uniqueStrings(authority.viewports);
  for (const viewport of VIEWPORTS) {
    if (!viewports.includes(viewport)) addDiagnostic(diagnostics, `schema.authority.viewport:${viewport}`, 'authority', `${viewport} viewport evidence is required`);
  }
  const rows = [...new Set((authority.rowStates || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
  if (JSON.stringify(rows) !== JSON.stringify(ROW_STATES)) {
    addDiagnostic(diagnostics, 'schema.authority.row-states', 'authority', 'rowStates must cover exactly 4, 5, 6, 7, and 8 rows');
  }
  const interactionPairs = requiredInteractionPairKeys({ ...authority, mechanics });
  for (const key of interactionPairs) {
    const pair = key.split('::');
    if (pair.length !== 2 || pair.some(mechanic => !mechanics.includes(mechanic))) {
      addDiagnostic(diagnostics, `schema.authority.interaction-pair:${key || '(missing)'}`, 'authority', 'required interaction pair must contain two authoritative mechanics');
    }
  }
  if (duplicateValues((authority.requiredInteractionPairs || []).map(pair => (
    Array.isArray(pair) && pair.length === 2 ? pairKey(pair[0], pair[1]) : ''
  )).filter(Boolean)).length) {
    addDiagnostic(diagnostics, 'schema.authority.duplicate-interaction-pairs', 'authority', 'requiredInteractionPairs contains duplicates');
  }
  return { events, mechanics, viewports, rows, interactionPairs };
}

function validateRegistry(evidence, authority, diagnostics) {
  const assets = evidence.assets;
  const ids = assets.map(asset => clean(asset.id));
  for (const duplicate of duplicateValues(ids)) addDiagnostic(diagnostics, `registry.duplicate-asset:${duplicate}`, duplicate, 'asset id is duplicated');
  const assetMap = new Map(assets.filter(asset => clean(asset.id)).map(asset => [clean(asset.id), asset]));
  const lineageMap = new Map();

  for (const asset of assets) {
    const id = clean(asset.id);
    if (!id) {
      addDiagnostic(diagnostics, 'schema.asset.missing-id', 'asset', 'asset id is required');
      continue;
    }
    const role = clean(asset.role);
    if (!role) addDiagnostic(diagnostics, `semantic.missing-role:${id}`, id, 'asset role is required');
    const allowedRoles = uniqueStrings(asset.allowedRoles);
    if (!allowedRoles.includes(role)) addDiagnostic(diagnostics, `semantic.role-not-allowed:${id}`, id, `role ${role || '(empty)'} is not in allowedRoles`);

    const eventIds = uniqueStrings(asset.semantic?.eventTypes);
    const mechanicIds = uniqueStrings(asset.semantic?.mechanicIds);
    for (const eventType of eventIds) if (!authority.events.includes(eventType)) {
      addDiagnostic(diagnostics, `semantic.unknown-event:${id}:${eventType}`, id, `${eventType} is not authoritative`);
    }
    for (const mechanicId of mechanicIds) if (!authority.mechanics.includes(mechanicId)) {
      addDiagnostic(diagnostics, `semantic.unknown-mechanic:${id}:${mechanicId}`, id, `${mechanicId} is not authoritative`);
    }
    const semanticRoles = uniqueStrings([role, ...(asset.semantic?.roles || [])]);
    if ((mechanicIds.length > 1 || semanticRoles.length > 1)
      && !(asset.reuse?.declared === true && clean(asset.reuse?.rationale))) {
      addDiagnostic(diagnostics, `semantic.undeclared-overload:${id}`, id, 'multi-mechanic or multi-role reuse requires an explicit rationale');
    }

    const source = asset.lineage?.source;
    const runtime = asset.lineage?.runtime;
    const packaged = asset.lineage?.packaged;
    if (asset.displayed !== false && !runtime) addDiagnostic(diagnostics, `lineage.missing-runtime:${id}`, id, 'displayed asset has no runtime derivative');
    if (asset.requiredInPackage !== false && !packaged) addDiagnostic(diagnostics, `lineage.missing-package:${id}`, id, 'required packaged derivative is missing');
    for (const entry of lineageEntries(asset)) {
      if (!clean(entry.path) || !SHA256_PATTERN.test(clean(entry.sha256))) {
        addDiagnostic(diagnostics, `lineage.invalid-${entry.lifecycle}:${id}`, id, `${entry.lifecycle} path/SHA-256 is invalid`);
        continue;
      }
      const key = `${entry.lifecycle}:${clean(entry.path)}`;
      if (lineageMap.has(key)) addDiagnostic(diagnostics, `registry.duplicate-path:${key}`, id, `${entry.lifecycle} path is assigned more than once`);
      lineageMap.set(key, { ...entry, sha256: clean(entry.sha256) });
    }
    if (source && runtime && clean(runtime.derivedFromSha256) !== clean(source.sha256)) {
      addDiagnostic(diagnostics, `lineage.stale-runtime:${id}`, id, 'runtime derivative does not identify the current source SHA-256');
    }
    if (runtime && packaged && clean(packaged.derivedFromSha256) !== clean(runtime.sha256)) {
      addDiagnostic(diagnostics, `lineage.stale-package:${id}`, id, 'packaged derivative does not identify the current runtime SHA-256');
    }
  }

  for (const [collection, lifecycleSet] of [['saved', new Set(['source', 'runtime'])], ['packaged', new Set(['packaged'])]]) {
    const files = evidence.files[collection];
    for (const duplicate of duplicateValues(files.map(file => clean(file.path)))) {
      addDiagnostic(diagnostics, `registry.duplicate-${collection}-file:${duplicate}`, collection, `${duplicate} occurs more than once`);
    }
    for (const file of files) {
      const path = clean(file.path);
      const lifecycle = clean(file.lifecycle || (collection === 'packaged' ? 'packaged' : 'runtime'));
      const assetId = clean(file.assetId);
      const key = `${lifecycle}:${path}`;
      const declared = lineageMap.get(key);
      if (!path || !SHA256_PATTERN.test(clean(file.sha256)) || !lifecycleSet.has(lifecycle)) {
        addDiagnostic(diagnostics, `registry.invalid-${collection}-file:${path || '(missing)'}`, collection, 'file path, lifecycle, or SHA-256 is invalid');
      } else if (!declared || declared.assetId !== assetId) {
        addDiagnostic(diagnostics, `registry.orphan-${collection}:${path}`, collection, 'file is not owned by the matching asset lineage entry');
      } else if (clean(file.sha256) !== declared.sha256) {
        addDiagnostic(diagnostics, `registry.stale-${collection}:${path}`, collection, 'file SHA-256 differs from its lineage declaration');
      }
    }
  }

  for (const entry of lineageMap.values()) {
    if (entry.embedded === true) continue;
    const collection = entry.lifecycle === 'packaged' ? evidence.files.packaged : evidence.files.saved;
    if (!collection.some(file => clean(file.path) === clean(entry.path)
      && clean(file.lifecycle || (entry.lifecycle === 'packaged' ? 'packaged' : 'runtime')) === entry.lifecycle
      && clean(file.assetId) === entry.assetId)) {
      addDiagnostic(diagnostics, `registry.unaccounted-${entry.lifecycle}:${entry.assetId}`, entry.assetId, `${entry.lifecycle} lineage entry has no file inventory receipt`);
    }
  }
  return assetMap;
}

function validateRenderEvidence(evidence, authority, assetMap, diagnostics) {
  const samples = evidence.renderSamples;
  const sampleIds = samples.map(sample => clean(sample.id));
  for (const duplicate of duplicateValues(sampleIds)) addDiagnostic(diagnostics, `render.duplicate-sample:${duplicate}`, duplicate, 'render sample id is duplicated');
  const sampleMap = new Map(samples.filter(sample => clean(sample.id)).map(sample => [clean(sample.id), sample]));
  for (const sample of samples) {
    const id = clean(sample.id) || '(missing)';
    const asset = assetMap.get(clean(sample.assetId));
    if (!asset) {
      addDiagnostic(diagnostics, `render.unknown-asset:${id}`, id, 'render sample references an unknown asset');
      continue;
    }
    if (!authority.viewports.includes(clean(sample.viewport))) addDiagnostic(diagnostics, `render.unknown-viewport:${id}`, id, 'render sample viewport is not authoritative');
    const intrinsicWidth = Number(sample.intrinsic?.width);
    const intrinsicHeight = Number(sample.intrinsic?.height);
    const renderedWidth = Number(sample.rendered?.width);
    const renderedHeight = Number(sample.rendered?.height);
    if (![intrinsicWidth, intrinsicHeight, renderedWidth, renderedHeight].every(value => finite(value) && value > 0)) {
      addDiagnostic(diagnostics, `render.invalid-dimensions:${id}`, id, 'intrinsic and rendered dimensions must be positive');
      continue;
    }
    const scaleX = Number(sample.scaleX);
    const scaleY = Number(sample.scaleY);
    const expectedScaleX = renderedWidth / intrinsicWidth;
    const expectedScaleY = renderedHeight / intrinsicHeight;
    if (!finite(scaleX) || !finite(scaleY)
      || Math.abs(scaleX - expectedScaleX) > 0.001 || Math.abs(scaleY - expectedScaleY) > 0.001) {
      addDiagnostic(diagnostics, `render.scale-evidence-drift:${id}`, id, 'reported scaleX/scaleY do not match intrinsic and rendered dimensions');
    }
    const nonuniformity = Math.abs(expectedScaleX - expectedScaleY) / Math.max(expectedScaleX, expectedScaleY);
    if (nonuniformity > 0.02 && sample.nonuniformScaleApproved !== true) {
      addDiagnostic(diagnostics, `render.nonuniform-scale:${id}`, id, `${(nonuniformity * 100).toFixed(2)}% nonuniformity exceeds the 2% limit`);
    }
    if ((sample.edgeClipped === true || Number(sample.cropRatio) > 0.02) && sample.cropApproved !== true) {
      addDiagnostic(diagnostics, `render.unapproved-crop:${id}`, id, 'render is clipped or exceeds the 2% crop allowance');
    }
    if (sample.decoded !== true || sample.painted !== true) addDiagnostic(diagnostics, `render.not-painted:${id}`, id, 'asset is not decoded and visibly painted');
  }

  for (const asset of assetMap.values()) {
    if (asset.displayed === false || asset.renderEvidenceRequired === false) continue;
    for (const viewport of authority.viewports) {
      const matches = samples.filter(sample => clean(sample.assetId) === clean(asset.id) && clean(sample.viewport) === viewport);
      if (clean(asset.role) === 'symbol') {
        for (const rows of authority.rows) if (!matches.some(sample => Number(sample.rows) === rows)) {
          addDiagnostic(diagnostics, `viewport.missing:${asset.id}:${viewport}:rows-${rows}`, asset.id, `${viewport} lacks ${rows}-row symbol evidence`);
        }
      } else if (!matches.length) {
        addDiagnostic(diagnostics, `viewport.missing:${asset.id}:${viewport}`, asset.id, `${viewport} render evidence is missing`);
      }
    }
  }
  return sampleMap;
}

function requireRationale(value) {
  return clean(value?.rationale).length > 0;
}

function validateChoreographies(evidence, authority, assetMap, diagnostics) {
  const byEvent = new Map();
  for (const choreography of evidence.choreographies) {
    const eventType = clean(choreography.eventType);
    if (!authority.events.includes(eventType)) {
      addDiagnostic(diagnostics, `choreography.unknown-event:${eventType || '(missing)'}`, eventType || 'choreography', 'choreography event is not authoritative');
      continue;
    }
    if (byEvent.has(eventType)) addDiagnostic(diagnostics, `choreography.duplicate:${eventType}`, eventType, 'event has more than one choreography decision');
    byEvent.set(eventType, choreography);
  }

  for (const eventType of authority.events) {
    const choreography = byEvent.get(eventType);
    if (!choreography) {
      addDiagnostic(diagnostics, `choreography.missing:${eventType}`, eventType, 'authoritative event has no choreography decision');
      continue;
    }
    const mechanicIds = uniqueStrings(choreography.mechanicIds);
    for (const mechanicId of mechanicIds) if (!authority.mechanics.includes(mechanicId)) {
      addDiagnostic(diagnostics, `choreography.unknown-mechanic:${eventType}:${mechanicId}`, eventType, `${mechanicId} is not authoritative`);
    }
    if (!['choreography', 'none'].includes(choreography.decision)
      || (choreography.decision === 'none' && !requireRationale(choreography))) {
      addDiagnostic(diagnostics, `choreography.invalid-decision:${eventType}`, eventType, 'decision must be choreography or an explicitly rationalized none');
    }

    const visual = choreography.visual || {};
    if (!['asset', 'none'].includes(visual.decision) || (visual.decision === 'none' && !requireRationale(visual))) {
      addDiagnostic(diagnostics, `choreography.visual-decision:${eventType}`, eventType, 'visual channel requires asset or explicit none');
    }
    const assetIds = uniqueStrings(visual.assetIds);
    if (visual.decision === 'asset' && !assetIds.length) addDiagnostic(diagnostics, `choreography.visual-assets:${eventType}`, eventType, 'visual asset decision has no asset ids');
    for (const assetId of assetIds) {
      const asset = assetMap.get(assetId);
      if (!asset) {
        addDiagnostic(diagnostics, `choreography.unknown-asset:${eventType}:${assetId}`, eventType, `${assetId} is not registered`);
        continue;
      }
      if (!uniqueStrings(asset.semantic?.eventTypes).includes(eventType)) {
        addDiagnostic(diagnostics, `semantic.event-not-allowed:${eventType}:${assetId}`, eventType, `${assetId} is not allowed for ${eventType}`);
      }
      for (const mechanicId of mechanicIds) if (!uniqueStrings(asset.semantic?.mechanicIds).includes(mechanicId)) {
        addDiagnostic(diagnostics, `semantic.mechanic-not-allowed:${eventType}:${assetId}:${mechanicId}`, eventType, `${assetId} is not allowed for ${mechanicId}`);
      }
    }

    const motion = choreography.motion || {};
    if (!['recipe', 'none'].includes(motion.decision) || (motion.decision === 'none' && !requireRationale(motion))) {
      addDiagnostic(diagnostics, `choreography.motion-decision:${eventType}`, eventType, 'motion channel requires recipe or explicit none');
    }
    if (motion.decision === 'recipe') {
      if (!clean(motion.recipeId) || motion.enabled !== true) addDiagnostic(diagnostics, `choreography.motion-disabled:${eventType}`, eventType, 'motion recipe must be named and enabled');
      if (clean(motion.bindingEvent) !== eventType
        && !(motion.adapter?.from === eventType && motion.adapter?.to === motion.bindingEvent && clean(motion.adapter?.fingerprint))) {
        addDiagnostic(diagnostics, `choreography.legacy-binding:${eventType}`, eventType, `${clean(motion.bindingEvent) || '(missing)'} is not an approved adapter target`);
      }
    }

    const audio = choreography.audio || {};
    if (!['cue', 'silence'].includes(audio.decision) || (audio.decision === 'silence' && !requireRationale(audio))) {
      addDiagnostic(diagnostics, `choreography.audio-decision:${eventType}`, eventType, 'audio channel requires cue or intentional silence');
    }
    if (audio.decision === 'cue' && !uniqueStrings(audio.cueIds).length) addDiagnostic(diagnostics, `choreography.audio-cues:${eventType}`, eventType, 'audio cue decision has no cue ids');

    const fallback = choreography.fallback || {};
    if (!['asset', 'text', 'procedural', 'none'].includes(fallback.decision)
      || (fallback.decision === 'none' && !requireRationale(fallback))) {
      addDiagnostic(diagnostics, `choreography.fallback:${eventType}`, eventType, 'fallback decision is incomplete');
    }
    if (fallback.decision === 'asset' && !assetMap.has(clean(fallback.assetId))) addDiagnostic(diagnostics, `choreography.fallback-asset:${eventType}`, eventType, 'fallback asset is not registered');

    const causal = choreography.causal || {};
    const stages = Array.isArray(causal.stages) ? causal.stages : [];
    if (!stages.length || stages.some((stage, index) => clean(stage.id) === '' || Number(stage.order) !== index)) {
      addDiagnostic(diagnostics, `choreography.causal-order:${eventType}`, eventType, 'causal stages must be named and ordered contiguously from zero');
    }
    const requiredAck = authority.eventDefinitions?.[eventType]?.acknowledgement === 'required';
    if (!['required', 'none'].includes(causal.acknowledgement)
      || (requiredAck && causal.acknowledgement !== 'required')
      || (causal.acknowledgement === 'required' && !clean(causal.acknowledgementEvidence))) {
      addDiagnostic(diagnostics, `choreography.acknowledgement:${eventType}`, eventType, 'acknowledgement decision/evidence does not satisfy the event contract');
    }
    if (causal.noLateMutation !== true || !clean(causal.proofId)) addDiagnostic(diagnostics, `choreography.causal-proof:${eventType}`, eventType, 'no-late-mutation causal proof is missing');

    const collision = choreography.collision || {};
    if (collision.measured !== true || !['allow', 'serialize', 'replace', 'queue'].includes(collision.policy)
      || !clean(collision.evidenceId) || !Array.isArray(collision.forbiddenCombinations)) {
      addDiagnostic(diagnostics, `choreography.collision:${eventType}`, eventType, 'measured collision policy/evidence is incomplete');
    }
    const recovery = choreography.recovery || {};
    if (!clean(recovery.cancellation) || !clean(recovery.reconnect) || !clean(recovery.skip)
      || recovery.lateMutation !== 'forbidden' || !clean(recovery.proofId)) {
      addDiagnostic(diagnostics, `choreography.recovery:${eventType}`, eventType, 'cancellation/reconnect/skip/late-mutation recovery policy is incomplete');
    }
    const nfr = choreography.nfr || {};
    if (!(Number(nfr.targetFps) >= 30) || !finite(nfr.maxLiveObjects) || !finite(nfr.maxParticles) || !clean(nfr.proofId)) {
      addDiagnostic(diagnostics, `choreography.nfr:${eventType}`, eventType, 'performance object/particle budget proof is incomplete');
    }
  }
  return byEvent;
}

function validateCaptureBindings(evidence, authority, assetMap, sampleMap, choreographies, diagnostics) {
  const required = uniqueStrings(authority.captureRequiredEventTypes).length
    ? uniqueStrings(authority.captureRequiredEventTypes) : authority.events;
  const byEvent = new Map();
  for (const binding of evidence.captureBindings) {
    const eventType = clean(binding.eventType);
    if (byEvent.has(eventType)) addDiagnostic(diagnostics, `capture.duplicate:${eventType}`, eventType, 'event has duplicate capture bindings');
    byEvent.set(eventType, binding);
  }
  for (const eventType of required) {
    const binding = byEvent.get(eventType);
    if (!binding) {
      addDiagnostic(diagnostics, `capture.missing:${eventType}`, eventType, 'required event has no capture binding');
      continue;
    }
    const choreography = choreographies.get(eventType);
    const activeAssetIds = uniqueStrings(binding.activeAssetIds);
    const expectedAssets = uniqueStrings(choreography?.visual?.assetIds);
    if (JSON.stringify([...activeAssetIds].sort()) !== JSON.stringify([...expectedAssets].sort())) {
      addDiagnostic(diagnostics, `capture.asset-binding:${eventType}`, eventType, 'captured active assets differ from the choreography');
    }
    if (clean(binding.motionRecipeId) !== (choreography?.motion?.decision === 'recipe' ? clean(choreography.motion.recipeId) : '')) {
      addDiagnostic(diagnostics, `capture.motion-binding:${eventType}`, eventType, 'captured motion recipe differs from the choreography');
    }
    const expectedAudio = choreography?.audio?.decision === 'cue' ? uniqueStrings(choreography.audio.cueIds) : [];
    if (JSON.stringify(uniqueStrings(binding.audioCueIds).sort()) !== JSON.stringify(expectedAudio.sort())) {
      addDiagnostic(diagnostics, `capture.audio-binding:${eventType}`, eventType, 'captured audio cues differ from the choreography');
    }
    if (![binding.sourceEventHash, binding.boardHash, binding.stateHash].every(value => HASH_PATTERN.test(clean(value)))) {
      addDiagnostic(diagnostics, `capture.hashes:${eventType}`, eventType, 'event/board/state hashes are missing or invalid');
    }
    if (!clean(binding.collisionEvidenceId) || !clean(binding.fallbackEvidenceId)) {
      addDiagnostic(diagnostics, `capture.proof-binding:${eventType}`, eventType, 'collision or fallback evidence binding is missing');
    }
    const transformIds = uniqueStrings(binding.transformSampleIds);
    if (activeAssetIds.length && (!transformIds.length || transformIds.some(id => !sampleMap.has(id)))) {
      addDiagnostic(diagnostics, `capture.transform-binding:${eventType}`, eventType, 'capture does not bind valid transform samples');
    }
    for (const assetId of activeAssetIds) {
      const asset = assetMap.get(assetId);
      if (!asset) continue;
      const expectedSha = clean(asset.lineage?.packaged?.sha256);
      if (!expectedSha || clean(binding.packagedSha256?.[assetId]) !== expectedSha) {
        addDiagnostic(diagnostics, `capture.package-sha:${eventType}:${assetId}`, eventType, `${assetId} packaged SHA-256 is not bound to the capture`);
      }
    }
  }
}

function validateInteractions(evidence, authority, diagnostics) {
  const requiredPairs = authority.interactionPairs;
  const dispositions = new Map();
  for (const disposition of evidence.interactionDispositions) {
    const mechanics = uniqueStrings(disposition.mechanics);
    const key = mechanics.length === 2 ? pairKey(mechanics[0], mechanics[1]) : '';
    if (!key) {
      addDiagnostic(diagnostics, 'interaction.invalid-disposition', 'interaction', 'interaction disposition must identify exactly two mechanics');
      continue;
    }
    if (dispositions.has(key)) addDiagnostic(diagnostics, `interaction.duplicate:${key}`, key, 'interaction pair has duplicate dispositions');
    dispositions.set(key, disposition);
  }
  for (const key of requiredPairs) {
    const disposition = dispositions.get(key);
    if (!disposition) {
      addDiagnostic(diagnostics, `interaction.missing:${key}`, key, 'mechanic pair has no scenario or explicit disposition');
      continue;
    }
    if (!['scenario', 'impossible', 'platform-blocked'].includes(disposition.disposition)) {
      addDiagnostic(diagnostics, `interaction.invalid:${key}`, key, 'interaction disposition is invalid');
      continue;
    }
    if (disposition.disposition !== 'scenario') {
      if (!clean(disposition.rationale) || !clean(disposition.proofId)) addDiagnostic(diagnostics, `interaction.unproved-disposition:${key}`, key, 'non-scenario disposition lacks rationale/proof');
      continue;
    }
    const scenario = evidence.interactionScenarios.find(item => clean(item.id) === clean(disposition.scenarioId));
    if (!scenario) {
      addDiagnostic(diagnostics, `interaction.missing-scenario:${key}`, key, 'scenario disposition has no matching scenario');
      continue;
    }
    if (pairKey(...uniqueStrings(scenario.mechanics)) !== key || scenario.passed !== true
      || !Array.isArray(scenario.eventOrder) || !scenario.eventOrder.length
      || scenario.forbiddenOverlapsChecked !== true || !clean(scenario.recoveryProofId)
      || ![scenario.hashes?.event, scenario.hashes?.board, scenario.hashes?.state].every(value => HASH_PATTERN.test(clean(value)))) {
      addDiagnostic(diagnostics, `interaction.failed-scenario:${key}`, key, 'scenario lacks deterministic event/collision/recovery/hash proof');
    }
  }
}

function validateGlobalNfr(evidence, diagnostics) {
  for (const key of ['performanceBudgetProofId', 'textureBudgetProofId', 'reducedMotionProofId', 'recoveryProofId']) {
    if (!clean(evidence.nfr?.[key])) addDiagnostic(diagnostics, `nfr.missing:${key}`, 'nfr', `${key} is required`);
  }
}

function validateSourceAssetInventory(evidence, authority, diagnostics) {
  const inventory = evidence.sourceAssetInventory;
  if (!authority.sourceInventoryRequired && !inventory) return 0;
  if (!inventory || inventory.format !== 'stake-studio-source-asset-inventory-v1') {
    addDiagnostic(diagnostics, 'source-inventory.missing', 'source-inventory', 'a compiler-derived source asset inventory is required');
    return 0;
  }
  const files = Array.isArray(inventory.files) ? inventory.files : [];
  if (!files.length || Number(inventory.fileCount) !== files.length) {
    addDiagnostic(diagnostics, 'source-inventory.file-count', 'source-inventory', 'source inventory fileCount must equal its non-empty files list');
  }
  const allowed = new Set(['content-bound', 'owned-source-master', 'stale-runtime-derivative', 'unbound']);
  for (const file of files) {
    const path = clean(file.path);
    if (!path.startsWith('assets/') || !SHA256_PATTERN.test(clean(file.sha256)) || !allowed.has(clean(file.status))) {
      addDiagnostic(diagnostics, `source-inventory.invalid:${path || '(missing)'}`, 'source-inventory', 'asset path, SHA-256, or ownership status is invalid');
      continue;
    }
    if (file.status === 'stale-runtime-derivative') {
      addDiagnostic(diagnostics, `source-inventory.stale-runtime:${path}`, path, 'named runtime derivative differs from its semantically owned shipped content');
    } else if (file.status === 'unbound') {
      addDiagnostic(diagnostics, `source-inventory.unbound:${path}`, path, 'saved asset has no semantic owner or shipped-content binding');
    }
  }
  return files.length;
}

export function evaluateAssetOrchestrationQA(project, rawEvidence = {}) {
  const evidence = normalizeEvidence(rawEvidence);
  const diagnostics = [];
  if (evidence.format !== ASSET_ORCHESTRATION_FORMAT) {
    addDiagnostic(diagnostics, 'schema.format', 'report', `format must be ${ASSET_ORCHESTRATION_FORMAT}`);
  }
  const fingerprint = getAssetOrchestrationFingerprint(project, evidence);
  if (clean(evidence.fingerprint) !== fingerprint) addDiagnostic(diagnostics, 'schema.fingerprint', 'report', 'asset orchestration fingerprint is stale or missing');
  const authority = validateAuthority(evidence, diagnostics);
  const assetMap = validateRegistry(evidence, authority, diagnostics);
  const sampleMap = validateRenderEvidence(evidence, authority, assetMap, diagnostics);
  const choreographies = validateChoreographies(evidence, authority, assetMap, diagnostics);
  validateCaptureBindings(evidence, authority, assetMap, sampleMap, choreographies, diagnostics);
  validateInteractions(evidence, authority, diagnostics);
  validateGlobalNfr(evidence, diagnostics);
  const sourceInventoryFiles = validateSourceAssetInventory(evidence, authority, diagnostics);
  diagnostics.sort((left, right) => left.id.localeCompare(right.id) || left.message.localeCompare(right.message));
  return {
    format: ASSET_ORCHESTRATION_QA_FORMAT,
    fingerprint,
    evidenceHash: hashValue(evidenceProjection(evidence)),
    passed: diagnostics.length === 0,
    diagnostics,
    issues: diagnostics.map(item => `${item.id}: ${item.message}`),
    counts: {
      assets: evidence.assets.length,
      savedFiles: evidence.files.saved.length,
      packagedFiles: evidence.files.packaged.length,
      renderSamples: evidence.renderSamples.length,
      authoritativeEvents: authority.events.length,
      choreographyDecisions: evidence.choreographies.length,
      captureBindings: evidence.captureBindings.length,
      interactionPairs: authority.mechanics.length * (authority.mechanics.length - 1) / 2,
      requiredInteractionPairs: authority.interactionPairs.length,
      sourceInventoryFiles,
    },
  };
}

export function recordAssetOrchestrationQA(project, rawEvidence = {}) {
  project.production ||= {};
  project.production.qa ||= {};
  const evidence = normalizeEvidence({ ...rawEvidence, format: ASSET_ORCHESTRATION_FORMAT });
  evidence.fingerprint = getAssetOrchestrationFingerprint(project, evidence);
  const evaluation = evaluateAssetOrchestrationQA(project, evidence);
  project.production.qa.assetOrchestrationAudit = {
    format: ASSET_ORCHESTRATION_QA_FORMAT,
    fingerprint: evaluation.fingerprint,
    evidenceHash: evaluation.evidenceHash,
    runAt: rawEvidence.runAt || new Date().toISOString(),
    passed: evaluation.passed,
    issues: evaluation.issues,
    diagnostics: evaluation.diagnostics,
    evidence,
  };
  return getAssetOrchestrationSummary(project);
}

export function getAssetOrchestrationSummary(project) {
  const report = project.production?.qa?.assetOrchestrationAudit || null;
  const evidence = report?.evidence || null;
  const fingerprint = evidence ? getAssetOrchestrationFingerprint(project, evidence) : null;
  const fresh = Boolean(report?.format === ASSET_ORCHESTRATION_QA_FORMAT
    && report.fingerprint === fingerprint && evidence?.fingerprint === fingerprint);
  const evaluation = fresh ? evaluateAssetOrchestrationQA(project, evidence) : null;
  return {
    format: ASSET_ORCHESTRATION_QA_FORMAT,
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    evidenceHash: fresh ? evaluation?.evidenceHash || null : null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && report.passed && evaluation?.passed),
    passed: Boolean(fresh && report.passed),
    issues: fresh ? evaluation?.issues || [] : [],
    diagnostics: fresh ? evaluation?.diagnostics || [] : [],
    counts: fresh ? evaluation?.counts || {} : {},
    runAt: fresh ? report.runAt || null : null,
  };
}
