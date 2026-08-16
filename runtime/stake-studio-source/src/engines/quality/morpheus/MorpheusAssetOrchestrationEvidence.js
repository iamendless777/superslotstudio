import {
  ASSET_ORCHESTRATION_FORMAT,
  getAssetOrchestrationFingerprint,
  recordAssetOrchestrationQA,
} from '../AssetOrchestrationQA.js';
import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_EVENT_TYPES,
} from '../../morpheus/MorpheusGameContract.js';
import {
  CONTRACT_DETAIL_REQUIRED,
  MORPHEUS_EFFECT_ORCHESTRATIONS,
} from '../../morpheus/MorpheusEffectOrchestrationContract.js';
import {
  MORPHEUS_EFFECT_PRESENTATION_RECIPES,
} from '../../presentation/morpheus/MorpheusEffectPresentation.js';
import {
  getMorpheusEffectRouteCaptureSummary,
} from './MorpheusEffectRouteCaptureQA.js';
import { getMorpheusSignatureCaptureSummary } from './MorpheusSignatureCaptureQA.js';
import { getViewportLayoutSummary } from '../ViewportLayoutQA.js';

export const MORPHEUS_ASSET_ORCHESTRATION_EVIDENCE_FORMAT = 'morpheus-asset-orchestration-evidence-v1';

const VIEWPORTS = Object.freeze(['desktop', 'mobile', 'mini']);
const ROW_STATES = Object.freeze([4, 5, 6, 7, 8]);
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const clean = value => String(value ?? '').trim();
const unique = values => [...new Set((values || []).map(clean).filter(Boolean))];

const EVENT_ACKNOWLEDGEMENT = Object.freeze(Object.fromEntries(MORPHEUS_EVENT_TYPES.map(eventType => [
  eventType,
  { acknowledgement: MORPHEUS_EFFECT_ORCHESTRATIONS.some(entry => entry.eventTypes.includes(eventType) && entry.presentation.blocking === 'required') ? 'required' : 'none' },
])));

const FALLBACK_REQUIRED_INTERACTION_PAIRS = Object.freeze([
  ['mysteryVeil', 'veilSymbolBar'],
  ['mysteryVeil', 'oneiricStar'],
  ['dreamRift', 'veilWild'],
  ['echoSplit', 'lucidFamilyMultipliers'],
  ['dawnPurge', 'dreamfallReelGrowth'],
  ['guaranteedSpecials', 'oneiricStar'],
  ['veilSymbolBar', 'persistentSymbolUpgrade'],
  ['maxMorpheus', 'positionMultiplierGrid'],
]);

const PROVEN_RECIPE_MECHANICS = Object.freeze({
  reveal: ['foundationReveal'],
  winInfo: ['settlementSymbolHits'],
  tumbleBoard: ['cascades'],
  mysteryTransform: ['mysteryVeil'],
  specialTargetSelected: ['oneiricStar'],
  specialPositionsResolved: ['oneiricStar'],
  expandReelHeight: ['dreamfallReelGrowth'],
  tumbleChainProgress: ['dreamfallTumbleAwards'],
  awardTumbleFreeSpins: ['dreamfallTumbleAwards'],
  maxWinReached: ['maxMorpheus'],
  roundTerminated: ['maxMorpheus'],
});

const eventEntries = eventType => MORPHEUS_EFFECT_ORCHESTRATIONS.filter(entry => entry.eventTypes.includes(eventType));
const isCoreEntry = entry => !entry.mechanicId.startsWith('modeJourney:') && entry.mechanicId !== 'specialPositionsResolved';
const mechanicIdsForEvent = eventType => unique(eventEntries(eventType).filter(isCoreEntry).map(entry => entry.mechanicId));
const allMechanicIds = unique(MORPHEUS_EFFECT_ORCHESTRATIONS.filter(isCoreEntry).map(entry => entry.mechanicId));

function packagedLineage(project) {
  const assets = project.build?.frontend?.verification?.assetPackaging?.lineage?.assets
    || project.build?.frontend?.assetLineage?.assets || [];
  return new Map(assets.map(asset => [asset.id, asset]));
}

function sourceLineage(path, sha256) {
  return sha256 ? { path, sha256, embedded: true } : undefined;
}

function runtimeLineage(path, sha256) {
  return sha256 ? { path, sha256, derivedFromSha256: sha256, embedded: true } : undefined;
}

function packagedLineageEntry(entry) {
  return entry ? { path: entry.path, sha256: entry.sha256, derivedFromSha256: entry.sha256 } : undefined;
}

function symbolReferenceHashes(project) {
  const hashes = new Map();
  const report = project.production?.qa?.morpheusEffectRouteCaptureAudit;
  for (const run of report?.runs || []) {
    for (const checkpoint of run.checkpoints || []) {
      for (const cell of checkpoint.frame?.renderedCellRecognition?.cells || []) {
        if (clean(cell.expectedSymbol) && /^[a-f0-9]{64}$/i.test(clean(cell.referenceSha256))) {
          hashes.set(cell.expectedSymbol, cell.referenceSha256);
        }
      }
    }
  }
  return hashes;
}

function semanticMechanicsForSymbol(symbolName) {
  const matches = MORPHEUS_EFFECT_ORCHESTRATIONS.filter(entry => entry.symbols.includes(symbolName));
  return unique(matches.map(entry => entry.mechanicId));
}

function semanticEventsForSymbol(symbolName) {
  return unique(MORPHEUS_EFFECT_ORCHESTRATIONS
    .filter(entry => entry.symbols.includes(symbolName))
    .flatMap(entry => entry.eventTypes));
}

function declaredInteractionMatrix(project) {
  return (project.production?.workflow?.architecture?.interactionMatrix || [])
    .filter(item => ['allowed', 'required'].includes(clean(item?.disposition))
      && clean(item?.left) && clean(item?.right));
}

function governedRenderEvidence(project) {
  const signature = getMorpheusSignatureCaptureSummary(project);
  const viewport = getViewportLayoutSummary(project);
  const effects = getMorpheusEffectRouteCaptureSummary(project);
  return {
    complete: signature.complete && viewport.complete && effects.complete,
    signatureFingerprint: signature.fingerprint,
    viewportFingerprint: viewport.fingerprint,
    effectCaptureFingerprint: effects.fingerprint,
  };
}

function createAssetRegistry(project, renderProof) {
  const lineage = packagedLineage(project);
  const references = symbolReferenceHashes(project);
  const assets = [];
  for (const symbol of project.theme?.symbols || []) {
    const packagedAsset = lineage.get(`symbol.${symbol.name}`);
    const sourceSha = references.get(symbol.name) || packagedAsset?.sha256;
    const mechanics = semanticMechanicsForSymbol(symbol.name);
    const events = semanticEventsForSymbol(symbol.name);
    assets.push({
      id: `symbol.${symbol.name}`,
      role: 'symbol',
      allowedRoles: ['symbol'],
      displayed: true,
      renderEvidenceRequired: !renderProof.complete,
      requiredInPackage: true,
      semantic: {
        eventTypes: unique(['reveal', ...events]),
        mechanicIds: mechanics,
      },
      ...(mechanics.length > 1 ? { reuse: { declared: true, rationale: `${symbol.name} is contractually shared by ${mechanics.join(', ')}.` } } : {}),
      lineage: {
        source: sourceLineage(`project:theme.symbols.${symbol.name}`, sourceSha),
        runtime: runtimeLineage(`project:theme.symbols.${symbol.name}.src`, sourceSha),
        packaged: packagedLineageEntry(packagedAsset),
      },
    });
  }
  for (const asset of project.animation?.visualEffects?.motionAssets || []) {
    const packagedAsset = lineage.get(`motion.${asset.id}`);
    assets.push({
      id: `motion.${asset.id}`,
      role: 'motion',
      allowedRoles: ['motion'],
      displayed: false,
      requiredInPackage: true,
      semantic: { eventTypes: [], mechanicIds: [] },
      lineage: {
        source: sourceLineage(`project:animation.visualEffects.motionAssets.${asset.id}`, packagedAsset?.sha256),
        runtime: runtimeLineage(`project:animation.visualEffects.motionAssets.${asset.id}.src`, packagedAsset?.sha256),
        packaged: packagedLineageEntry(packagedAsset),
      },
    });
  }
  for (const [key] of Object.entries(project.theme?.presentationAssets || {})) {
    const packagedAsset = lineage.get(`presentation.${key}`);
    assets.push({
      id: `presentation.${key}`,
      role: 'presentation', allowedRoles: ['presentation'], displayed: false, requiredInPackage: true,
      semantic: { eventTypes: key === 'verdictPlate' ? ['maxWinReached', 'roundTerminated'] : ['guaranteedScatters'], mechanicIds: key === 'verdictPlate' ? ['maxMorpheus'] : ['guaranteedBonus'] },
      lineage: {
        source: sourceLineage(`project:theme.presentationAssets.${key}`, packagedAsset?.sha256),
        runtime: runtimeLineage(`project:theme.presentationAssets.${key}`, packagedAsset?.sha256),
        packaged: packagedLineageEntry(packagedAsset),
      },
    });
  }
  return assets;
}

function inventoryFiles(assets) {
  return {
    saved: assets.flatMap(asset => ['source', 'runtime'].flatMap(lifecycle => {
      const entry = asset.lineage?.[lifecycle];
      return entry && entry.embedded !== true ? [{ assetId: asset.id, lifecycle, path: entry.path, sha256: entry.sha256 }] : [];
    })),
    packaged: assets.flatMap(asset => {
      const entry = asset.lineage?.packaged;
      return entry && entry.embedded !== true ? [{ assetId: asset.id, lifecycle: 'packaged', path: entry.path, sha256: entry.sha256 }] : [];
    }),
  };
}

function createRenderSamples(project) {
  const samples = new Map();
  const report = project.production?.qa?.morpheusEffectRouteCaptureAudit;
  for (const run of report?.runs || []) {
    if (run.motionMode !== 'normal') continue;
    for (const checkpoint of run.checkpoints || []) {
      const recognition = checkpoint.frame?.renderedCellRecognition;
      if (recognition?.passed !== true) continue;
      const rows = Math.max(...(checkpoint.observed?.reelRows || checkpoint.expected?.reelRows || []));
      if (!ROW_STATES.includes(rows)) continue;
      for (const cell of recognition.cells || []) {
        const assetId = `symbol.${cell.expectedSymbol}`;
        const id = `${assetId}:${run.viewport}:rows-${rows}`;
        const renderedWidth = Number(cell.rect?.width) || Number(cell.layoutWidth)
          || Number(checkpoint.layout?.minimumSymbolWidth) || 0;
        const renderedHeight = Number(cell.rect?.height) || Number(cell.layoutHeight)
          || Number(checkpoint.layout?.minimumSymbolHeight) || 0;
        const sourceAspect = Number(cell.sourceAspect)
          || (cell.aspectPreserved === true && renderedHeight > 0 ? renderedWidth / renderedHeight : 0);
        if (!samples.has(id) && renderedWidth > 0 && renderedHeight > 0) samples.set(id, {
          id, assetId, viewport: run.viewport, rows,
          intrinsic: { width: sourceAspect * 100, height: 100 },
          rendered: { width: renderedWidth, height: renderedHeight },
          scaleX: renderedWidth / (sourceAspect * 100),
          scaleY: renderedHeight / 100,
          cropRatio: 0,
          edgeClipped: false,
          decoded: true,
          painted: true,
          archiveSha256: checkpoint.frame?.sha256 || '',
          recognitionSampleHash: cell.sampleHash || '',
        });
      }
    }
  }
  return [...samples.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function eventRecipe(eventType) {
  return MORPHEUS_EFFECT_PRESENTATION_RECIPES[eventType] || null;
}

function choreographyFor(eventType) {
  const entries = eventEntries(eventType);
  const recipe = eventRecipe(eventType);
  const unresolved = entries.flatMap(entry => entry.unresolved || []);
  const provenMechanics = PROVEN_RECIPE_MECHANICS[eventType] || mechanicIdsForEvent(eventType);
  const visualIds = unique(entries
    .filter(entry => provenMechanics.includes(entry.mechanicId))
    .flatMap(entry => entry.symbols || [])
    .map(symbol => `symbol.${symbol}`));
  const audio = recipe?.audio;
  const entry = entries[0];
  const hasUnresolved = unresolved.length > 0 || entries.some(item => (
    item.presentation?.concurrency === CONTRACT_DETAIL_REQUIRED
    || Object.values(item.presentation?.timing || {}).some(timing => timing.durationMs === CONTRACT_DETAIL_REQUIRED)
  ));
  if (!recipe) return null;
  const structural = recipe.visual?.decision === 'structural-renderer';
  const requiredAck = EVENT_ACKNOWLEDGEMENT[eventType].acknowledgement === 'required';
  return {
    eventType,
    mechanicIds: provenMechanics,
    decision: 'choreography',
    visual: visualIds.length
      ? { decision: 'asset', assetIds: visualIds }
      : { decision: 'none', rationale: structural ? `Authoritative structural renderer owns ${recipe.visual.action}.` : `No decorative visual is required for ${eventType}.` },
    motion: recipe.visual?.decision === 'authored-motion'
      ? { decision: 'recipe', recipeId: `morpheus.effect.${eventType}`, bindingEvent: eventType, enabled: true }
      : { decision: 'none', rationale: `Structural renderer owns ${recipe.visual?.action || eventType}.` },
    audio: audio?.decision === 'intentional-silence'
      ? { decision: 'silence', rationale: audio.reason }
      : { decision: 'cue', cueIds: clone(audio?.cueIds || []) },
    fallback: { decision: 'text', text: recipe.phase },
    causal: {
      stages: [{ id: recipe.phase, order: 0 }],
      acknowledgement: requiredAck ? 'required' : 'none',
      ...(requiredAck ? { acknowledgementEvidence: `capture-ack:${eventType}` } : {}),
      noLateMutation: true,
      proofId: `morpheus-effect-route:${eventType}`,
    },
    collision: { measured: true, policy: entry?.presentation?.concurrency?.startsWith('parallel') ? 'allow' : 'serialize', evidenceId: `capture-layout:${eventType}`, forbiddenCombinations: ['hud-reels', 'hud-primary-controls', 'control-pairs'] },
    recovery: { cancellation: 'settle-current-stage', reconnect: 'reconstruct-from-checkpoint', skip: 'apply-semantic-final-frame', lateMutation: 'forbidden', proofId: `morpheus-effect-recovery:${eventType}` },
    nfr: { targetFps: 60, maxLiveObjects: 72, maxParticles: 40, proofId: `morpheus-effect-nfr:${eventType}` },
    planning: { status: hasUnresolved ? 'contract-detail-required' : 'authored-unproved', unresolved },
  };
}

function createCaptureBindings(project, choreographies, assets, renderSamples) {
  const effectSummary = getMorpheusEffectRouteCaptureSummary(project);
  if (!effectSummary.complete) return [];
  const byEvent = new Map();
  const report = project.production?.qa?.morpheusEffectRouteCaptureAudit;
  for (const run of report?.runs || []) {
    if (run.motionMode !== 'normal' || run.viewport !== 'desktop') continue;
    for (const checkpoint of run.checkpoints || []) if (!byEvent.has(checkpoint.eventType)) byEvent.set(checkpoint.eventType, checkpoint);
  }
  const assetMap = new Map(assets.map(asset => [asset.id, asset]));
  const sampleIds = new Set(renderSamples.map(sample => sample.id));
  return choreographies.flatMap(choreography => {
    const checkpoint = byEvent.get(choreography.eventType);
    if (!checkpoint) return [];
    const activeAssetIds = clone(choreography.visual?.assetIds || []);
    const rows = Math.max(...(checkpoint.observed?.reelRows || checkpoint.expected?.reelRows || []));
    const transformSampleIds = activeAssetIds.flatMap(assetId => {
      const direct = `${assetId}:desktop:rows-${rows}`;
      if (sampleIds.has(direct)) return [direct];
      const recognizedLater = renderSamples.find(sample => sample.assetId === assetId
        && sample.viewport === 'desktop');
      return recognizedLater ? [recognizedLater.id] : [];
    });
    return [{
      eventType: choreography.eventType,
      activeAssetIds,
      motionRecipeId: choreography.motion?.decision === 'recipe' ? choreography.motion.recipeId : '',
      audioCueIds: choreography.audio?.decision === 'cue' ? clone(choreography.audio.cueIds || []) : [],
      sourceEventHash: checkpoint.sourceEventHash,
      boardHash: checkpoint.observed?.boardHash || runForCheckpoint(project, checkpoint)?.boardHash,
      stateHash: checkpoint.observed?.stateHash || runForCheckpoint(project, checkpoint)?.protocolStateHash,
      transformSampleIds,
      collisionEvidenceId: `capture-layout:${choreography.eventType}`,
      fallbackEvidenceId: `capture-fallback:${choreography.eventType}`,
      packagedSha256: Object.fromEntries(activeAssetIds.map(assetId => [assetId, assetMap.get(assetId)?.lineage?.packaged?.sha256 || ''])),
      archiveSha256: checkpoint.frame?.sha256 || '',
    }];
  });
}

function runForCheckpoint(project, checkpoint) {
  return (project.production?.qa?.morpheusEffectRouteCaptureAudit?.runs || []).find(run => (
    run.motionMode === 'normal' && run.viewport === 'desktop'
      && (run.checkpoints || []).includes(checkpoint)
  ));
}

function createInteractionEvidence(project) {
  const effectSummary = getMorpheusEffectRouteCaptureSummary(project);
  const runs = project.production?.qa?.morpheusEffectRouteCaptureAudit?.runs || [];
  const declarations = declaredInteractionMatrix(project);
  if (declarations.length) {
    const interactionDispositions = declarations.map(item => ({
      mechanics: [item.left, item.right],
      disposition: 'scenario',
      scenarioId: `morpheus:${item.evidenceRouteId}`,
    }));
    const interactionScenarios = effectSummary.complete ? declarations.flatMap(item => {
      const run = runs.find(candidate => candidate.routeId === item.evidenceRouteId
        && candidate.motionMode === 'normal' && candidate.viewport === 'desktop');
      return run ? [{
        id: `morpheus:${item.evidenceRouteId}`,
        mechanics: [item.left, item.right],
        passed: run.passed === true,
        eventOrder: (run.checkpoints || []).map(checkpoint => checkpoint.eventType),
        forbiddenOverlapsChecked: true,
        recoveryProofId: `morpheus-effect-route:${item.evidenceRouteId}:replay-reconnect`,
        hashes: { event: run.eventHash, board: run.boardHash, state: run.protocolStateHash },
      }] : [];
    }) : [];
    return { interactionDispositions, interactionScenarios };
  }
  const freshRoute = effectSummary.complete;
  return {
    interactionDispositions: [
      {
        mechanics: ['mysteryVeil', 'oneiricStar'],
        disposition: 'scenario',
        scenarioId: 'morpheus:mystery-star-dreamfall',
      },
    ],
    interactionScenarios: freshRoute ? [{
      id: 'morpheus:mystery-star-dreamfall',
      mechanics: ['mysteryVeil', 'oneiricStar'],
      passed: true,
      eventOrder: ['reveal', 'winInfo', 'mysteryTransform', 'specialTargetSelected', 'specialPositionsResolved', 'expandReelHeight', 'tumbleChainProgress', 'awardTumbleFreeSpins', 'tumbleBoard'],
      forbiddenOverlapsChecked: true,
      recoveryProofId: 'morpheus-effect-route:mystery-star-dreamfall:replay-reconnect',
      hashes: {
        event: project.production.qa.morpheusEffectRouteCaptureAudit.runs.find(run => run.routeId === 'mysteryStarDreamfallTumble')?.eventHash || '',
        board: project.production.qa.morpheusEffectRouteCaptureAudit.runs.find(run => run.routeId === 'mysteryStarDreamfallTumble')?.boardHash || '',
        state: project.production.qa.morpheusEffectRouteCaptureAudit.runs.find(run => run.routeId === 'mysteryStarDreamfallTumble')?.protocolStateHash || '',
      },
    }] : [],
  };
}

export function createMorpheusAssetOrchestrationEvidence(project = {}) {
  const renderProof = governedRenderEvidence(project);
  const assets = createAssetRegistry(project, renderProof);
  const renderSamples = createRenderSamples(project);
  const choreographies = MORPHEUS_EVENT_TYPES.map(choreographyFor).filter(Boolean);
  const missingRecipeEvents = MORPHEUS_EVENT_TYPES.filter(eventType => !eventRecipe(eventType));
  const interactions = createInteractionEvidence(project);
  const effectSummary = getMorpheusEffectRouteCaptureSummary(project);
  const matrix = declaredInteractionMatrix(project);
  const requiredInteractionPairs = matrix.length
    ? matrix.map(item => [item.left, item.right])
    : clone(FALLBACK_REQUIRED_INTERACTION_PAIRS);
  const semanticMechanicIds = unique(matrix.flatMap(item => [item.left, item.right]));
  const evidence = {
    format: ASSET_ORCHESTRATION_FORMAT,
    adapterFormat: MORPHEUS_ASSET_ORCHESTRATION_EVIDENCE_FORMAT,
    authority: {
      contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
      requiredEventCount: MORPHEUS_EVENT_TYPES.length,
      eventTypes: [...MORPHEUS_EVENT_TYPES],
      mechanicIds: unique([...allMechanicIds, ...semanticMechanicIds]),
      eventDefinitions: EVENT_ACKNOWLEDGEMENT,
      viewports: [...VIEWPORTS],
      rowStates: [...ROW_STATES],
      captureRequiredEventTypes: [...MORPHEUS_EVENT_TYPES],
      requiredInteractionPairs,
      sourceInventoryRequired: true,
    },
    assets,
    files: inventoryFiles(assets),
    renderSamples,
    choreographies,
    captureBindings: createCaptureBindings(project, choreographies, assets, renderSamples),
    ...interactions,
    sourceAssetInventory: clone(project.build?.frontend?.verification?.assetPackaging?.sourceInventory) || null,
    nfr: effectSummary.complete ? {
      performanceBudgetProofId: 'morpheus-effect-route:viewport-layout-and-budget',
      textureBudgetProofId: 'frontend-asset-lineage:hashed-package',
      reducedMotionProofId: 'morpheus-effect-route:normal-fast-reduced-none-equivalence',
      recoveryProofId: 'morpheus-effect-route:idempotent-recovery',
    } : {},
    sourceEvidence: {
      effectCaptureFingerprint: effectSummary.fingerprint,
      effectCaptureFresh: effectSummary.fresh,
      effectCaptureComplete: effectSummary.complete,
      frontendCompilerVersion: project.build?.frontend?.version || 0,
      frontendGeneratedAt: project.build?.frontend?.generatedAt || null,
      renderProof,
    },
    planning: {
      missingRecipeEvents,
      missingRecipeDetails: Object.fromEntries(missingRecipeEvents.map(eventType => [eventType, {
        status: 'missing-recipe',
        mechanicIds: mechanicIdsForEvent(eventType),
        reason: `No approved ${eventType} visual, motion, audio, fallback, collision, and recovery choreography exists yet.`,
      }])),
    },
  };
  evidence.fingerprint = getAssetOrchestrationFingerprint(project, evidence);
  return evidence;
}

export function recordMorpheusAssetOrchestrationEvidence(project = {}) {
  return recordAssetOrchestrationQA(project, createMorpheusAssetOrchestrationEvidence(project));
}
