import { MORPHEUS_CONTRACT_FINGERPRINT } from '../../morpheus/MorpheusGameContract.js';
import { hashMorpheusProtocolValue } from '../../morpheus/MorpheusEventProtocol.js';

export const MORPHEUS_EFFECT_PRESENTATION_FORMAT = 'morpheus-effect-presentation-plan-v1';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const authoredMotion = assetId => ({ decision: 'authored-motion', assetIds: [assetId] });
const structuralMotion = action => ({ decision: 'structural-renderer', action, assetIds: [] });
const specialtyAudio = cueId => ({ decision: 'specialty-cue', cueIds: [cueId] });
const existingAudio = cueId => ({ decision: 'existing-cue', cueIds: [cueId] });
const silence = reason => ({ decision: 'intentional-silence', cueIds: [], reason });

export const MORPHEUS_EFFECT_PRESENTATION_RECIPES = Object.freeze({
  modeGridStart: Object.freeze({
    phase: 'living-position-grid-wake',
    visual: structuralMotion('wake-position-grid-and-paint-1x-plates'),
    audio: specialtyAudio('morpheus.audio.position-grid-wake'),
  }),
  positionMultiplierGridUpdate: Object.freeze({
    phase: 'touched-position-double',
    visual: structuralMotion('commit-and-pulse-position-grid-value'),
    audio: specialtyAudio('morpheus.audio.position-grid-double'),
  }),
  guaranteedSpecialReveal: Object.freeze({
    phase: 'nightmare-reliquary-reveal',
    visual: authoredMotion('dreamfall.motion.portal-depth-vapor'),
    supplementalMotionAssetIds: ['dreamfall.motion.announcement-halo'],
    audio: specialtyAudio('morpheus.audio.nightmare-reliquary'),
  }),
  symbolBarProgress: Object.freeze({
    phase: 'veil-family-bar-progress',
    visual: structuralMotion('commit-family-bar-progress-and-route-essence'),
    audio: specialtyAudio('morpheus.audio.veil-bar-progress'),
  }),
  symbolUpgrade: Object.freeze({
    phase: 'veil-persistent-family-upgrade',
    visual: authoredMotion('dreamfall.motion.portal-vapor'),
    supplementalMotionAssetIds: ['dreamfall.motion.announcement-halo'],
    audio: specialtyAudio('morpheus.audio.veil-family-upgrade'),
  }),
  symbolMultiplierUpdate: Object.freeze({
    phase: 'lucid-family-multiplier-double',
    visual: authoredMotion('dreamfall.motion.lucid-wild-current'),
    audio: specialtyAudio('morpheus.audio.lucid-family-double'),
  }),
  rainingWilds: Object.freeze({
    phase: 'predetermined-moon-wild-rain',
    visual: authoredMotion('dreamfall.motion.moon-messenger'),
    supplementalMotionAssetIds: ['dreamfall.motion.portal-depth-vapor'],
    audio: specialtyAudio('morpheus.audio.raining-wilds'),
  }),
  stackedReels: Object.freeze({
    phase: 'predetermined-reel-seal-and-stack',
    visual: structuralMotion('seal-selected-reels-and-show-stack-identity'),
    audio: specialtyAudio('morpheus.audio.stacked-reels'),
  }),
  guaranteedScatters: Object.freeze({
    phase: 'predetermined-gate-tier-awakening',
    visual: authoredMotion('dreamfall.motion.portal-vapor'),
    supplementalMotionAssetIds: ['dreamfall.motion.announcement-halo'],
    audio: specialtyAudio('morpheus.audio.guaranteed-gates'),
  }),
  reveal: Object.freeze({
    phase: 'authoritative-board-land',
    visual: structuralMotion('paint-authoritative-board'),
    audio: silence('The proof begins on the authoritative landed board.'),
  }),
  winInfo: Object.freeze({
    phase: 'positive-settlement-visible',
    visual: structuralMotion('highlight-winning-contributors-and-count-settlement'),
    audio: existingAudio('$winTier'),
  }),
  mysteryTransform: Object.freeze({
    phase: 'mystery-synchronized-reveal',
    visual: authoredMotion('dreamfall.motion.mystery-veil-seam'),
    audio: specialtyAudio('morpheus.audio.mystery-synchronized-reveal'),
  }),
  specialTargetSelected: Object.freeze({
    phase: 'star-target-tell',
    visual: authoredMotion('dreamfall.motion.oneiric-star-prism'),
    audio: specialtyAudio('morpheus.audio.star-target-selected'),
  }),
  specialPositionsResolved: Object.freeze({
    phase: 'star-chain-and-convert',
    visual: authoredMotion('dreamfall.motion.oneiric-star-prism'),
    supplementalMotionAssetIds: ['dreamfall.motion.oneiric-impact'],
    audio: specialtyAudio('morpheus.audio.star-chain-convert'),
  }),
  expandReelHeight: Object.freeze({
    phase: 'dreamfall-shaft-growth',
    visual: structuralMotion('animate-independent-mask-cap-and-new-row'),
    audio: specialtyAudio('morpheus.audio.dreamfall-reel-growth'),
  }),
  tumbleChainProgress: Object.freeze({
    phase: 'dreamfall-chain-instrument',
    visual: structuralMotion('commit-persistent-chain-hud'),
    audio: specialtyAudio('morpheus.audio.dreamfall-chain-progress'),
  }),
  awardTumbleFreeSpins: Object.freeze({
    phase: 'dreamfall-fifth-hit-award',
    visual: structuralMotion('commit-free-spin-award-hud'),
    audio: specialtyAudio('morpheus.audio.dreamfall-free-spin-award'),
  }),
  tumbleBoard: Object.freeze({
    phase: 'acknowledged-tumble',
    visual: structuralMotion('stake-tumble'),
    audio: existingAudio('cascadeDrop'),
  }),
  maxWinReached: Object.freeze({
    phase: 'max-morpheus-terminal-ascension',
    visual: authoredMotion('dreamfall.motion.max-morpheus-ascension'),
    presentationAssetKeys: ['verdictPlate'],
    characterStates: ['wincap'],
    audio: specialtyAudio('morpheus.audio.max-morpheus'),
  }),
  roundTerminated: Object.freeze({
    phase: 'terminal-round-commit',
    visual: structuralMotion('commit-terminal-verdict-and-disable-round-mutation'),
    audio: silence('The preceding MAX ceremony owns the finale cue.'),
  }),
});

function availableSet(value) {
  return new Set(Array.isArray(value) ? value.map(String) : []);
}

/**
 * Build a renderer-facing plan from the exact runtime command and event. The
 * plan names only assets already authored for Morpheus; absent bespoke media is
 * carried as a blocker rather than silently replaced with a generic effect.
 */
export function createMorpheusEffectPresentationPlan({ command, event, catalog = {} }) {
  const recipe = MORPHEUS_EFFECT_PRESENTATION_RECIPES[event?.type];
  if (!recipe) throw new Error(`Morpheus effect presentation has no recipe for ${event?.type}.`);
  if (command.contractFingerprint !== MORPHEUS_CONTRACT_FINGERPRINT) {
    throw new Error('Morpheus effect presentation contract fingerprint drifted.');
  }
  const motionAssets = availableSet(catalog.motionAssetIds);
  const presentationAssets = availableSet(catalog.presentationAssetKeys);
  const characterStates = availableSet(catalog.characterStates);
  const audioCues = availableSet(catalog.audioCueIds);
  const audioCueAssets = catalog.audioCueAssets && typeof catalog.audioCueAssets === 'object' ? catalog.audioCueAssets : {};
  const requiredMotion = [
    ...(recipe.visual.assetIds || []),
    ...(recipe.supplementalMotionAssetIds || []),
  ];
  const missing = {
    motion: requiredMotion.filter(id => !motionAssets.has(id)),
    presentation: (recipe.presentationAssetKeys || []).filter(id => !presentationAssets.has(id)),
    character: (recipe.characterStates || []).filter(id => !characterStates.has(id)),
    audio: recipe.audio.decision === 'specialty-cue'
      ? recipe.audio.cueIds.filter(id => !audioCues.has(id))
      : recipe.audio.decision === 'existing-cue'
        ? recipe.audio.cueIds.filter(id => id !== '$winTier' && !audioCues.has(id)) : [],
  };
  const visualReady = !missing.motion.length && !missing.presentation.length && !missing.character.length;
  const audioReady = !missing.audio.length;
  const requiredSpecialtyCues = recipe.audio.decision === 'specialty-cue' ? recipe.audio.cueIds : [];
  const audioProductionReady = audioReady && requiredSpecialtyCues.every(id => audioCueAssets[id]?.factory?.approvalStatus === 'approved');
  const semantic = {
    routeId: command.routeId,
    eventIndex: event.index,
    eventType: event.type,
    orchestrationId: command.orchestrationId,
    priority: command.priority,
    phase: recipe.phase,
    sourceEventHash: command.sourceEventHash,
    semanticCommitHash: command.semanticCommitHash,
    affectedPositions: clone(event.affectedPositions || []),
    visual: clone(recipe.visual),
    supplementalMotionAssetIds: clone(recipe.supplementalMotionAssetIds || []),
    presentationAssetKeys: clone(recipe.presentationAssetKeys || []),
    characterStates: clone(recipe.characterStates || []),
    audio: clone(recipe.audio),
  };
  return {
    format: MORPHEUS_EFFECT_PRESENTATION_FORMAT,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    semantic,
    semanticHash: hashMorpheusProtocolValue(semantic),
    motionMode: command.motionMode,
    durationMs: command.durationMs,
    timingStatus: command.timingStatus,
    acknowledgementId: command.acknowledgementId,
    blocking: true,
    visualReady,
    audioReady,
    audioProductionReady,
    previewReady: visualReady,
    productionReady: visualReady && audioProductionReady,
    missing,
  };
}

export function summarizeMorpheusEffectPresentationPlans(plans) {
  const missing = { motion: new Set(), presentation: new Set(), character: new Set(), audio: new Set() };
  for (const plan of plans || []) {
    for (const key of Object.keys(missing)) for (const id of plan.missing?.[key] || []) missing[key].add(id);
  }
  const normalizedMissing = Object.fromEntries(Object.entries(missing).map(([key, ids]) => [key, [...ids].sort()]));
  return {
    format: 'morpheus-effect-presentation-coverage-v1',
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    eventCount: (plans || []).length,
    previewReady: (plans || []).length > 0 && plans.every(plan => plan.previewReady),
    productionReady: (plans || []).length > 0 && plans.every(plan => plan.productionReady),
    missing: normalizedMissing,
    fingerprint: hashMorpheusProtocolValue({
      plans: (plans || []).map(plan => ({ eventType: plan.semantic.eventType, semanticHash: plan.semanticHash })),
      missing: normalizedMissing,
    }),
  };
}
