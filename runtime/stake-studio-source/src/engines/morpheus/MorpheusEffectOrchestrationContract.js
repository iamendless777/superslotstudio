import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_EVENT_TYPES,
  MORPHEUS_MAX_WIN_AMOUNT,
  MORPHEUS_MAX_WIN_MULTIPLIER,
  MORPHEUS_MODE_REGISTRY,
  MORPHEUS_SPECIAL_SYMBOLS,
} from './MorpheusGameContract.js';

/**
 * Presentation-facing orchestration contract for the approved Morpheus game.
 *
 * This registry does not implement mechanics or invent missing design rules. It
 * names the authoritative events, barriers, assets, recovery obligations, and
 * unresolved contract details that every later renderer/audio implementation
 * must satisfy.
 */

export const MORPHEUS_ORCHESTRATION_SCHEMA_VERSION = 1;
export const MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT = MORPHEUS_CONTRACT_FINGERPRINT;
export const CONTRACT_DETAIL_REQUIRED = 'contract-detail-required';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const MORPHEUS_PRIORITY_LADDER = deepFreeze({
  P0: { id: 'P0', rank: 0, name: 'terminal-preemption', rule: 'MAX preempts every non-terminal mutation and tumble.' },
  P1: { id: 'P1', rank: 1, name: 'predetermined-declaration', rule: 'Predetermined generator and mode declarations precede reveal.' },
  P2: { id: 'P2', rank: 2, name: 'authoritative-reveal', rule: 'Reveal commits final landed symbols without late substitution.' },
  P3: { id: 'P3', rank: 3, name: 'positive-settlement', rule: 'A positive, quantized settlement is displayed before reactions.' },
  P4: { id: 'P4', rank: 4, name: 'special-reaction', rule: 'Post-settlement special reactions commit exact board/state changes.' },
  P5: { id: 'P5', rank: 5, name: 'persistent-state', rule: 'Persistent bars, grids, multipliers, geometry, and ladders commit.' },
  P6: { id: 'P6', rank: 6, name: 'award-and-retrigger', rule: 'Awards and retriggers resolve after their causal state change.' },
  P7: { id: 'P7', rank: 7, name: 'acknowledged-tumble', rule: 'The next tumble/refill begins only after required presentation acknowledgement.' },
  P8: { id: 'P8', rank: 8, name: 'recap-and-ambient', rule: 'Recap and ambient cleanup never mutate authoritative outcome state.' },
});

export const MORPHEUS_ASSET_SLOT_TYPES = deepFreeze([
  'static', 'motion', 'hud', 'audio', 'entrance', 'journey', 'recap',
]);

const requiredSlot = (...ids) => ({ status: 'required', ids });
const notApplicableSlot = reason => ({ status: 'not-applicable', ids: [], reason });
const detailSlot = reason => ({ status: CONTRACT_DETAIL_REQUIRED, ids: [], reason });
const silentSlot = reason => ({ status: 'explicit-silence', ids: [], reason });

function assetPlan(namespace, slots = {}) {
  return Object.fromEntries(MORPHEUS_ASSET_SLOT_TYPES.map(type => [
    type,
    slots[type] || detailSlot(`${namespace}.${type} must be authored or explicitly waived.`),
  ]));
}

export const MORPHEUS_EFFECT_MOTION_MODES = deepFreeze(['normal', 'fast', 'reduced', 'none']);

function timingProfile({ normalMs, fastMs, reducedMs, noneMs = 0 } = {}) {
  const timing = value => ({
    required: true,
    durationMs: Number.isFinite(value) ? value : CONTRACT_DETAIL_REQUIRED,
    semanticCommit: 'required',
  });
  return {
    normal: timing(normalMs),
    fast: timing(fastMs),
    reduced: timing(reducedMs),
    none: timing(noneMs),
  };
}

function recoveryPlan(checkpoint = CONTRACT_DETAIL_REQUIRED) {
  return {
    replay: 'required-idempotent',
    reconnect: 'required-idempotent',
    checkpoint,
    alreadyAppliedMutation: 'render-without-reapplying',
    pendingAcknowledgement: 'resume-or-finish-deterministically',
  };
}

function unresolved(field, reason) {
  return { field, status: CONTRACT_DETAIL_REQUIRED, reason };
}

function effect(definition) {
  return {
    contractFingerprint: MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT,
    settlementScope: 'none',
    modes: [],
    symbols: [],
    unresolved: [],
    ...definition,
  };
}

const entries = [
  effect({
    id: 'foundation.authoritative-reveal', mechanicId: 'foundationReveal', eventTypes: ['reveal'], priority: 'P2',
    journeyStage: 'land', settlementScope: 'none',
    assets: assetPlan('foundation.reveal', {
      static: requiredSlot('morpheus.symbol.static-set'),
      motion: requiredSlot('morpheus.reveal.symbol-land'),
      hud: notApplicableSlot('Reveal has no independent persistent instrument.'),
      audio: requiredSlot('morpheus.audio.reveal-land'),
      entrance: requiredSlot('morpheus.reveal.entrance'),
      journey: requiredSlot('morpheus.reveal.land-journey'),
      recap: notApplicableSlot('Reveal is represented by the round recap.'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: 'sequential', timing: timingProfile({ normalMs: 420, fastMs: 176, reducedMs: 0 }) },
    recovery: recoveryPlan('after-authoritative-reveal'),
  }),
  effect({
    id: 'foundation.positive-settlement', mechanicId: 'settlementSymbolHits', eventTypes: ['winInfo'], priority: 'P3',
    journeyStage: 'settlement', settlementScope: 'current-settlement',
    assets: assetPlan('foundation.win-info', {
      static: requiredSlot('morpheus.win.contributor-highlight'),
      motion: requiredSlot('morpheus.win.oneiric-impact'),
      hud: requiredSlot('morpheus.hud.win-meter'),
      audio: requiredSlot('morpheus.audio.win-tier'),
      entrance: notApplicableSlot('Settlement follows an authoritative reveal.'),
      journey: requiredSlot('morpheus.win.count-and-contributors'),
      recap: requiredSlot('morpheus.recap.settlement-line'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: 'sequential', timing: timingProfile({ normalMs: 1500, fastMs: 630, reducedMs: 0 }) },
    recovery: recoveryPlan('after-positive-settlement'),
  }),
  effect({
    id: 'foundation.acknowledged-tumble', mechanicId: 'cascades', eventTypes: ['tumbleBoard'], priority: 'P7',
    journeyStage: 'tumble', settlementScope: 'next-board-only',
    assets: assetPlan('foundation.tumble', {
      static: requiredSlot('morpheus.symbol.static-set'),
      motion: requiredSlot('morpheus.tumble.explode-drop-refill'),
      hud: requiredSlot('morpheus.hud.tumble-state'),
      audio: requiredSlot('morpheus.audio.tumble-drop'),
      entrance: notApplicableSlot('Tumble is entered from a settled resolution.'),
      journey: requiredSlot('morpheus.tumble.refill-journey'),
      recap: requiredSlot('morpheus.recap.tumble-chain'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'authoritative-event-acknowledgement', concurrency: 'sequential', timing: timingProfile({ normalMs: 460, fastMs: 195, reducedMs: 0 }) },
    recovery: recoveryPlan('before-and-after-tumble-board'),
  }),

  effect({
    id: 'grid.mode-start', mechanicId: 'positionMultiplierGrid', eventTypes: ['modeGridStart'], priority: 'P1',
    journeyStage: 'mode-entry', settlementScope: 'none', modes: ['trickster_dream', 'oneiric_nexus'],
    assets: assetPlan('grid.mode-start', {
      static: requiredSlot('morpheus.grid.position-plates'), motion: requiredSlot('morpheus.grid.wake'),
      hud: requiredSlot('morpheus.hud.position-grid'), audio: requiredSlot('morpheus.audio.grid-wake'),
      entrance: requiredSlot('morpheus.grid.mode-entrance'), journey: requiredSlot('morpheus.grid.activation-journey'),
      recap: requiredSlot('morpheus.recap.position-grid'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: 'sequential', timing: timingProfile() },
    recovery: recoveryPlan('after-grid-initialization'),
    unresolved: [unresolved('positionAnchorPolicy', 'Grid anchoring through tumbles and variable reel heights is not frozen.')],
  }),
  effect({
    id: 'grid.position-update', mechanicId: 'positionMultiplierGrid', eventTypes: ['positionMultiplierGridUpdate'], priority: 'P5',
    journeyStage: 'persistent-update', settlementScope: 'next-board-only', modes: ['trickster_dream', 'oneiric_nexus'],
    assets: assetPlan('grid.position-update', {
      static: requiredSlot('morpheus.grid.engraved-value'), motion: requiredSlot('morpheus.grid.position-double'),
      hud: requiredSlot('morpheus.hud.position-grid'), audio: requiredSlot('morpheus.audio.position-double'),
      entrance: notApplicableSlot('Grid has already entered.'), journey: requiredSlot('morpheus.grid.touched-position-journey'),
      recap: requiredSlot('morpheus.recap.position-grid'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'group-barrier', concurrency: 'parallel-after-authoritative-commit', timing: timingProfile() },
    recovery: recoveryPlan('after-position-grid-state-commit'),
    unresolved: [unresolved('positionMultiplierCap', 'The persistent position multiplier cap is not frozen.')],
  }),
  effect({
    id: 'nightmare.guaranteed-special-reveal', mechanicId: 'guaranteedSpecials', eventTypes: ['guaranteedSpecialReveal'], priority: 'P1',
    journeyStage: 'predetermined-declaration', settlementScope: 'none', modes: ['nightmare_descent'],
    assets: assetPlan('nightmare.special-reveal', {
      static: requiredSlot('morpheus.nightmare.celestial-reliquary'), motion: requiredSlot('morpheus.nightmare.reliquary-reveal-launch'),
      hud: requiredSlot('morpheus.hud.nightmare-special-count'), audio: requiredSlot('morpheus.audio.nightmare-reliquary'),
      entrance: requiredSlot('morpheus.nightmare.entrance'), journey: requiredSlot('morpheus.nightmare.three-special-journey'),
      recap: requiredSlot('morpheus.recap.nightmare-specials'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'per-special-barrier', concurrency: 'sequential', timing: timingProfile() },
    recovery: recoveryPlan('after-each-special-placement'),
    unresolved: [
      unresolved('specialPoolAndWeights', 'The random-special pool and weights are not frozen.'),
      unresolved('footprintConflictPolicy', 'Duplicate, overlap, edge-fit, and protected-position rules are not frozen.'),
    ],
  }),
  effect({
    id: 'veil.symbol-bar-progress', mechanicId: 'veilSymbolBar', eventTypes: ['symbolBarProgress'], priority: 'P5',
    journeyStage: 'persistent-update', settlementScope: 'next-board-only', modes: ['veil_ascent'],
    assets: assetPlan('veil.bar-progress', {
      static: requiredSlot('morpheus.veil.symbol-family-bar'), motion: requiredSlot('morpheus.veil.essence-route'),
      hud: requiredSlot('morpheus.hud.veil-symbol-bars'), audio: requiredSlot('morpheus.audio.veil-bar-charge'),
      entrance: notApplicableSlot('Bars enter with the mode journey.'), journey: requiredSlot('morpheus.veil.bar-charge-journey'),
      recap: requiredSlot('morpheus.recap.veil-bars'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'group-barrier', concurrency: 'parallel-after-authoritative-commit', timing: timingProfile() },
    recovery: recoveryPlan('after-symbol-bar-state-commit'),
    unresolved: [unresolved('barThresholdsAndOverflow', 'Thresholds, overflow, simultaneous fills, and reset rules are not frozen.')],
  }),
  effect({
    id: 'veil.symbol-upgrade', mechanicId: 'persistentSymbolUpgrade', eventTypes: ['symbolUpgrade'], priority: 'P5',
    journeyStage: 'persistent-upgrade', settlementScope: 'next-board-only', modes: ['veil_ascent'],
    assets: assetPlan('veil.symbol-upgrade', {
      static: requiredSlot('morpheus.veil.upgrade-family-map'), motion: requiredSlot('morpheus.veil.upgrade-ritual'),
      hud: requiredSlot('morpheus.hud.veil-symbol-bars'), audio: requiredSlot('morpheus.audio.veil-upgrade'),
      entrance: notApplicableSlot('Upgrade is a mode-loop beat.'), journey: requiredSlot('morpheus.veil.upgrade-journey'),
      recap: requiredSlot('morpheus.recap.veil-upgrades'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: 'sequential', timing: timingProfile() },
    recovery: recoveryPlan('after-symbol-upgrade-board-commit'),
    unresolved: [unresolved('upgradeSelectionPolicy', 'Available-family ordering and random selection rules are not frozen.')],
  }),
  effect({
    id: 'lucid.family-multiplier-update', mechanicId: 'lucidFamilyMultipliers', eventTypes: ['symbolMultiplierUpdate'], priority: 'P5',
    journeyStage: 'persistent-update', settlementScope: 'next-board-only', modes: ['lucid_blessing'],
    assets: assetPlan('lucid.multiplier-update', {
      static: requiredSlot('morpheus.lucid.family-multiplier-rack'), motion: requiredSlot('morpheus.lucid.family-charge-double'),
      hud: requiredSlot('morpheus.hud.lucid-family-rack'), audio: requiredSlot('morpheus.audio.lucid-family-double'),
      entrance: notApplicableSlot('Rack enters with the mode journey.'), journey: requiredSlot('morpheus.lucid.multiplier-journey'),
      recap: requiredSlot('morpheus.recap.lucid-multipliers'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'group-barrier', concurrency: 'parallel-after-authoritative-commit', timing: timingProfile() },
    recovery: recoveryPlan('after-family-multiplier-state-commit'),
    unresolved: [unresolved('familyMultiplierCapAndComposition', 'Cap and multiple-family/multiple-wild arithmetic are not frozen.')],
  }),
  effect({
    id: 'dreamfall.expand-reel-height', mechanicId: 'dreamfallReelGrowth', eventTypes: ['expandReelHeight'], priority: 'P5',
    journeyStage: 'persistent-geometry', settlementScope: 'next-board-only', modes: ['dreamfall'],
    assets: assetPlan('dreamfall.reel-growth', {
      static: requiredSlot('morpheus.dreamfall.shaft-cap-rails'), motion: requiredSlot('morpheus.dreamfall.quake-glow-rise-reveal-drop'),
      hud: requiredSlot('morpheus.hud.dreamfall-reel-heights'), audio: requiredSlot('morpheus.audio.dreamfall-reel-growth'),
      entrance: notApplicableSlot('Shafts enter with the Dreamfall journey.'), journey: requiredSlot('morpheus.dreamfall.reel-growth-journey'),
      recap: requiredSlot('morpheus.recap.dreamfall-reel-heights'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: 'sequential', timing: timingProfile({ normalMs: 620, fastMs: 260, reducedMs: 0 }) },
    recovery: recoveryPlan('before-and-after-reel-growth'),
    unresolved: [
      unresolved('winningConnectionToReelSelection', 'Selection and multiple-growth ordering are not frozen.'),
      unresolved('allReelsAtMaximumBehavior', 'The outcome when all reels have eight rows is not frozen.'),
    ],
  }),
  effect({
    id: 'dreamfall.tumble-chain-progress', mechanicId: 'dreamfallTumbleAwards', eventTypes: ['tumbleChainProgress'], priority: 'P5',
    journeyStage: 'persistent-update', settlementScope: 'next-board-only', modes: ['dreamfall'],
    assets: assetPlan('dreamfall.chain-progress', {
      static: requiredSlot('morpheus.dreamfall.tumble-chain-ladder'), motion: requiredSlot('morpheus.dreamfall.ladder-step'),
      hud: requiredSlot('morpheus.hud.dreamfall-chain-ladder'), audio: requiredSlot('morpheus.audio.dreamfall-chain-progress'),
      entrance: notApplicableSlot('Ladder enters with Dreamfall.'), journey: requiredSlot('morpheus.dreamfall.chain-progress-journey'),
      recap: requiredSlot('morpheus.recap.dreamfall-chain'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: 'parallel-after-authoritative-commit', timing: timingProfile({ normalMs: 260, fastMs: 110, reducedMs: 0 }) },
    recovery: recoveryPlan('after-tumble-chain-state-commit'),
  }),
  effect({
    id: 'dreamfall.award-tumble-free-spin', mechanicId: 'dreamfallTumbleAwards', eventTypes: ['awardTumbleFreeSpins'], priority: 'P6',
    journeyStage: 'award', settlementScope: 'next-board-only', modes: ['dreamfall'],
    assets: assetPlan('dreamfall.tumble-award', {
      static: requiredSlot('morpheus.dreamfall.free-spin-award'), motion: requiredSlot('morpheus.dreamfall.award-pulse'),
      hud: requiredSlot('morpheus.hud.free-spins'), audio: requiredSlot('morpheus.audio.dreamfall-free-spin-award'),
      entrance: notApplicableSlot('Award is a mode-loop beat.'), journey: requiredSlot('morpheus.dreamfall.award-journey'),
      recap: requiredSlot('morpheus.recap.free-spin-awards'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: 'sequential', timing: timingProfile({ normalMs: 520, fastMs: 220, reducedMs: 0 }) },
    recovery: recoveryPlan('after-free-spin-award-state-commit'),
  }),
  effect({
    id: 'generator.raining-wilds', mechanicId: 'rainingWilds', eventTypes: ['rainingWilds'], priority: 'P1',
    journeyStage: 'predetermined-declaration', settlementScope: 'none', symbols: ['RIFT_WILD'],
    assets: assetPlan('generator.raining-wilds', {
      static: requiredSlot('morpheus.generator.wild-variants'), motion: requiredSlot('morpheus.generator.moon-crack-wild-rain'),
      hud: notApplicableSlot('Generator is represented on the board.'), audio: requiredSlot('morpheus.audio.raining-wilds'),
      entrance: requiredSlot('morpheus.generator.raining-wilds-entrance'), journey: requiredSlot('morpheus.generator.raining-wilds-journey'),
      recap: requiredSlot('morpheus.recap.raining-wilds'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'group-barrier', concurrency: 'parallel-nonconflicting-positions', timing: timingProfile() },
    recovery: recoveryPlan('after-predetermined-wild-declaration'),
    unresolved: [unresolved('variantCountsWeightsAndOverlap', 'Variant counts, weights, and overlap rules are not frozen.')],
  }),
  effect({
    id: 'generator.stacked-reels', mechanicId: 'stackedReels', eventTypes: ['stackedReels'], priority: 'P1',
    journeyStage: 'predetermined-declaration', settlementScope: 'none',
    assets: assetPlan('generator.stacked-reels', {
      static: requiredSlot('morpheus.generator.vertical-dream-banner'), motion: requiredSlot('morpheus.generator.seal-and-stack-reveal'),
      hud: notApplicableSlot('Stack selection is represented on the reels.'), audio: requiredSlot('morpheus.audio.stacked-reels'),
      entrance: requiredSlot('morpheus.generator.stacked-reels-entrance'), journey: requiredSlot('morpheus.generator.stacked-reels-journey'),
      recap: requiredSlot('morpheus.recap.stacked-reels'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'group-barrier', concurrency: 'parallel-nonconflicting-reels', timing: timingProfile() },
    recovery: recoveryPlan('after-predetermined-stack-declaration'),
    unresolved: [unresolved('reelCountSymbolWeightsAndConflicts', 'Selected-reel count, stack-symbol weights, and conflicts are not frozen.')],
  }),
  effect({
    id: 'bonus.guaranteed-scatters', mechanicId: 'guaranteedBonus', eventTypes: ['guaranteedScatters'], priority: 'P1',
    journeyStage: 'predetermined-declaration', settlementScope: 'none', symbols: ['GATE_OF_SLEEP'],
    assets: assetPlan('bonus.guaranteed-scatters', {
      static: requiredSlot('morpheus.bonus.gate-of-sleep'), motion: requiredSlot('morpheus.bonus.gate-land-tier-anticipation'),
      hud: requiredSlot('morpheus.hud.scatter-tier'), audio: requiredSlot('morpheus.audio.gate-tier-anticipation'),
      entrance: requiredSlot('morpheus.bonus.gate-entrance'), journey: requiredSlot('morpheus.bonus.three-four-five-six-gate-journey'),
      recap: requiredSlot('morpheus.recap.guaranteed-bonus'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'per-gate-barrier', concurrency: 'sequential', timing: timingProfile() },
    recovery: recoveryPlan('after-each-guaranteed-scatter'),
    unresolved: [unresolved('tierAwardAndRetriggerPayload', 'Tier-specific award/retrigger events and timing are not frozen.')],
  }),
  effect({
    id: 'mystery.transform', mechanicId: 'mysteryVeil', eventTypes: ['mysteryTransform'], priority: 'P4',
    journeyStage: 'special-reaction', settlementScope: 'next-board-only', symbols: ['MYSTERY_VEIL'],
    assets: assetPlan('special.mystery-veil', {
      static: requiredSlot('morpheus.special.mystery-veil'), motion: requiredSlot('morpheus.special.mystery-synchronized-breath-reveal'),
      hud: notApplicableSlot('Mystery identity is carried by event metadata.'), audio: requiredSlot('morpheus.audio.mystery-synchronized-reveal'),
      entrance: requiredSlot('morpheus.special.mystery-veil-entrance'), journey: requiredSlot('morpheus.special.mystery-transform-journey'),
      recap: requiredSlot('morpheus.recap.mystery-transform'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: 'sequential', timing: timingProfile() },
    recovery: recoveryPlan('after-mystery-transform-board-commit'),
    unresolved: [
      unresolved('candidateSetAndAccountingLifetime', 'Candidate family set and original-identity lifetime are not frozen.'),
    ],
  }),
  effect({
    id: 'star.target-selected', mechanicId: 'oneiricStar', eventTypes: ['specialTargetSelected'], priority: 'P4',
    journeyStage: 'special-target', settlementScope: 'next-board-only', symbols: ['ONEIRIC_STAR'],
    assets: assetPlan('special.oneiric-star-target', {
      static: requiredSlot('morpheus.special.oneiric-star'), motion: requiredSlot('morpheus.special.star-target-tell'),
      hud: requiredSlot('morpheus.hud.star-target-family'), audio: requiredSlot('morpheus.audio.star-target-selected'),
      entrance: requiredSlot('morpheus.special.oneiric-star-entrance'), journey: requiredSlot('morpheus.special.star-target-journey'),
      recap: requiredSlot('morpheus.recap.star-target'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: 'sequential', timing: timingProfile() },
    recovery: recoveryPlan('after-authoritative-target-selection'),
    unresolved: [unresolved('targetEligibilityAndNoTargetBehavior', 'Eligible families and the no-target outcome are not frozen.')],
  }),
  effect({
    id: 'special.positions-resolved', mechanicId: 'specialPositionsResolved', eventTypes: ['specialPositionsResolved'], priority: 'P4',
    journeyStage: 'special-reaction', settlementScope: CONTRACT_DETAIL_REQUIRED,
    assets: assetPlan('special.positions-resolved', {
      static: detailSlot('The concrete special variant must supply its static asset.'),
      motion: detailSlot('The concrete special variant must supply its motion asset.'),
      hud: detailSlot('The concrete special variant must explicitly require or waive HUD.'),
      audio: detailSlot('The concrete special variant must supply audio or explicit silence.'),
      entrance: detailSlot('The concrete special variant must supply or waive entrance.'),
      journey: detailSlot('The concrete special variant must supply a journey.'),
      recap: detailSlot('The concrete special variant must supply or waive recap.'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: CONTRACT_DETAIL_REQUIRED, timing: timingProfile() },
    recovery: recoveryPlan(),
    unresolved: [unresolved('variantDispatch', 'A concrete special variant is required; generic rendering is forbidden.')],
  }),

  ...[
    {
      id: 'special.veil-wild', mechanicId: 'veilWild', symbols: ['VEIL_WILD'],
      settlementScope: 'next-board-only',
      required: ['morpheus.special.veil-wild', 'morpheus.special.veil-pour-and-blocker-stop', 'morpheus.audio.veil-wild-stop'],
      unresolved: [
        unresolved('protectedSetAndMultipleVeils', 'Protected symbols, source overwrite, and multiple-veil ordering are not frozen.'),
      ],
    },
    {
      id: 'special.lucid-wild', mechanicId: 'lucidWild', symbols: ['LUCID_WILD'],
      settlementScope: 'current-settlement',
      required: ['morpheus.special.lucid-wild', 'morpheus.special.lucid-value-ladder', 'morpheus.audio.lucid-value-reveal'],
      unresolved: [
        unresolved('valueWeightsAndComposition', 'Value weights and multiple-wild composition are not frozen.'),
      ],
    },
    {
      id: 'special.dream-rift', mechanicId: 'dreamRift', symbols: ['DREAM_RIFT', 'RIFT_WILD'],
      settlementScope: 'next-board-only',
      required: ['morpheus.special.dream-rift', 'morpheus.special.dream-rift-contained-implosion', 'morpheus.audio.dream-rift'],
      unresolved: [
        unresolved('edgeOverlapAndSourceRetention', 'Footprint edge, overlap, and source-cell rules are not frozen.'),
      ],
    },
    {
      id: 'special.golden-rift', mechanicId: 'goldenRift', symbols: ['GOLDEN_RIFT', 'RIFT_WILD'],
      settlementScope: 'next-board-only',
      required: ['morpheus.special.golden-rift', 'morpheus.special.golden-solar-fracture', 'morpheus.audio.golden-rift'],
      unresolved: [
        unresolved('edgeOverlapAndSourceRetention', 'Footprint edge, overlap, and source-cell rules are not frozen.'),
      ],
    },
    {
      id: 'special.echo-split', mechanicId: 'echoSplit', symbols: ['ECHO_SPLIT'],
      settlementScope: 'current-settlement',
      required: ['morpheus.special.echo-split', 'morpheus.special.echo-mirrored-division-ways', 'morpheus.audio.echo-split'],
      unresolved: [
        unresolved('duplicationWaysWildAndNoSpace', 'Exact duplication, ways, wild, overlap, and no-space rules are not frozen.'),
      ],
    },
    {
      id: 'special.dawn-purge', mechanicId: 'dawnPurge', symbols: ['DAWN_PURGE'],
      settlementScope: 'next-board-only',
      required: ['morpheus.special.dawn-purge', 'morpheus.special.dawn-dissolve-empty-restricted-refill', 'morpheus.audio.dawn-purge'],
      unresolved: [
        unresolved('lowSetAndRefillConstraintLifetime', 'Low families, multiple purges, and refill constraint lifetime are not frozen.'),
      ],
    },
    {
      id: 'special.oneiric-star-resolve', mechanicId: 'oneiricStar', symbols: ['ONEIRIC_STAR'],
      settlementScope: 'next-board-only',
      required: ['morpheus.special.oneiric-star', 'morpheus.special.star-chain-and-convert', 'morpheus.audio.star-chain-convert'],
      unresolved: [],
    },
  ].map(variant => effect({
    ...variant,
    eventTypes: ['specialPositionsResolved'], priority: 'P4', journeyStage: 'special-reaction',
    settlementScope: variant.settlementScope,
    assets: assetPlan(variant.id, {
      static: requiredSlot(variant.required[0]), motion: requiredSlot(variant.required[1]),
      hud: notApplicableSlot('Exact sources and affected positions are presented on the board.'),
      audio: requiredSlot(variant.required[2]), entrance: requiredSlot(`morpheus.${variant.id}.entrance`),
      journey: requiredSlot(`morpheus.${variant.id}.journey`), recap: requiredSlot(`morpheus.${variant.id}.recap`),
    }),
    presentation: { blocking: 'required', acknowledgement: 'presentation-barrier', concurrency: CONTRACT_DETAIL_REQUIRED, timing: timingProfile() },
    recovery: recoveryPlan(),
  })),

  effect({
    id: 'max.max-win-reached', mechanicId: 'maxMorpheus', eventTypes: ['maxWinReached'], priority: 'P0',
    journeyStage: 'terminal-ceremony', settlementScope: 'terminal', symbols: ['MAX_MORPHEUS'],
    assets: assetPlan('max.morpheus', {
      static: requiredSlot('morpheus.max.symbol-and-verdict'), motion: requiredSlot('morpheus.max.full-scene-ascension'),
      hud: requiredSlot('morpheus.hud.exact-100000x'), audio: requiredSlot('morpheus.audio.max-morpheus'),
      entrance: requiredSlot('morpheus.max.entrance'), journey: requiredSlot('morpheus.max.full-scene-journey'),
      recap: requiredSlot('morpheus.recap.max-morpheus'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'authoritative-event-acknowledgement', concurrency: 'exclusive-terminal', timing: timingProfile() },
    recovery: recoveryPlan('after-max-terminal-state-before-termination'),
    terminal: { multiplier: MORPHEUS_MAX_WIN_MULTIPLIER, amount: MORPHEUS_MAX_WIN_AMOUNT, onlyNextEvent: 'roundTerminated' },
    unresolved: [unresolved('skipAndReconnectCeremonyPolicy', 'Skip, count-up, currency display, and reconnect ceremony policy are not frozen.')],
  }),
  effect({
    id: 'max.round-terminated', mechanicId: 'maxMorpheus', eventTypes: ['roundTerminated'], priority: 'P0',
    journeyStage: 'terminal-commit', settlementScope: 'terminal', symbols: ['MAX_MORPHEUS'],
    assets: assetPlan('max.round-terminated', {
      static: requiredSlot('morpheus.max.terminal-verdict'), motion: requiredSlot('morpheus.max.terminal-cleanup'),
      hud: requiredSlot('morpheus.hud.final-win'), audio: silentSlot('Termination reuses no cue; the preceding MAX cue owns the finale.'),
      entrance: notApplicableSlot('Termination follows MAX acknowledgement.'), journey: requiredSlot('morpheus.max.termination-journey'),
      recap: requiredSlot('morpheus.recap.terminal-round'),
    }),
    presentation: { blocking: 'required', acknowledgement: 'terminal-commit', concurrency: 'exclusive-terminal', timing: timingProfile() },
    recovery: recoveryPlan('terminated-round'),
    terminal: { multiplier: MORPHEUS_MAX_WIN_MULTIPLIER, amount: MORPHEUS_MAX_WIN_AMOUNT, onlyNextEvent: null },
  }),
];

const modeJourneyDefinitions = [
  ['base', ['reveal', 'winInfo', 'tumbleBoard'], ['adjacent-ways-cascade', 'natural-tier-entry']],
  ['dream_enhancer', ['guaranteedScatters', 'reveal', 'winInfo', 'tumbleBoard'], ['moon-gate-search', 'enhanced-natural-tier-entry']],
  ['trickster_dream', ['modeGridStart', 'reveal', 'winInfo', 'positionMultiplierGridUpdate', 'tumbleBoard'], ['grid-wake', 'position-double']],
  ['nightmare_descent', ['guaranteedSpecialReveal', 'reveal', 'winInfo', 'specialPositionsResolved', 'tumbleBoard'], ['three-reliquaries', 'sequential-launch']],
  ['veil_ascent', ['guaranteedScatters', 'reveal', 'winInfo', 'symbolBarProgress', 'symbolUpgrade', 'tumbleBoard'], ['bar-charge', 'upgrade-ritual']],
  ['lucid_blessing', ['guaranteedScatters', 'reveal', 'winInfo', 'symbolMultiplierUpdate', 'tumbleBoard'], ['family-rack-charge', 'retrigger-award']],
  ['dreamfall', ['guaranteedScatters', 'reveal', 'winInfo', 'expandReelHeight', 'tumbleChainProgress', 'awardTumbleFreeSpins', 'tumbleBoard'], ['shaft-growth', 'chain-ladder', 'fifth-plus-award']],
  ['oneiric_nexus', ['modeGridStart', 'guaranteedScatters', 'reveal', 'winInfo', 'positionMultiplierGridUpdate', 'tumbleBoard'], ['living-grid', 'position-double', 'retrigger-award']],
];

for (const [modeId, eventTypes, beats] of modeJourneyDefinitions) {
  entries.push(effect({
    id: `mode.${modeId}.journey`, mechanicId: `modeJourney:${modeId}`, eventTypes, priority: 'P8',
    journeyStage: 'mode-journey', settlementScope: 'none', modes: [modeId],
    assets: assetPlan(`mode.${modeId}`, {
      static: requiredSlot(`morpheus.mode.${modeId}.static`), motion: requiredSlot(`morpheus.mode.${modeId}.motion-language`),
      hud: requiredSlot(`morpheus.hud.mode.${modeId}`), audio: requiredSlot(`morpheus.audio.mode.${modeId}`),
      entrance: requiredSlot(`morpheus.mode.${modeId}.entrance`), journey: requiredSlot(...beats.map(beat => `morpheus.mode.${modeId}.${beat}`)),
      recap: requiredSlot(`morpheus.mode.${modeId}.recap`),
    }),
    presentation: { blocking: 'required', acknowledgement: 'journey-stage-barriers', concurrency: 'event-priority-ladder', timing: timingProfile() },
    recovery: recoveryPlan(`mode-${modeId}-journey-checkpoints`),
    unresolved: modeId === 'dream_enhancer'
      ? [unresolved('enhancerSearchEvent', 'No frozen event currently communicates the moon/gate search journey.')]
      : modeId === 'nightmare_descent'
        ? [unresolved('releasePrice', 'Nightmare price remains release-gated.')]
        : modeId === 'dreamfall'
          ? [unresolved('releasePrice', 'Dreamfall final 1000x-class price remains release-gated.')]
          : [],
  }));
}

export const MORPHEUS_EFFECT_ORCHESTRATIONS = deepFreeze(entries);
export const MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY = deepFreeze(Object.fromEntries(
  MORPHEUS_EFFECT_ORCHESTRATIONS.map(entry => [entry.id, entry]),
));

export const MORPHEUS_ORCHESTRATION_PROOF_ROUTES = deepFreeze({
  predeterminedGeneratorDeclarations: {
    id: 'proof.predetermined-generator-declarations',
    contractFingerprint: MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT,
    purpose: 'Prove declared Raining Wild positions and Stacked Reel identity are present on the final authoritative board.',
    steps: [
      { orchestrationId: 'generator.raining-wilds', eventType: 'rainingWilds' },
      { orchestrationId: 'generator.stacked-reels', eventType: 'stackedReels' },
      { orchestrationId: 'foundation.authoritative-reveal', eventType: 'reveal' },
      { orchestrationId: 'foundation.positive-settlement', eventType: 'winInfo' },
      { orchestrationId: 'foundation.acknowledged-tumble', eventType: 'tumbleBoard' },
    ],
    concurrency: 'predetermined-declarations-serialize-when-board-ownership-could-conflict',
    requiredFinalAcknowledgement: 'authoritative-event-acknowledgement',
  },
  nightmareReliquaryDeclarations: {
    id: 'proof.nightmare-reliquary-declarations',
    contractFingerprint: MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT,
    purpose: 'Prove exactly three sequential guaranteed-special declarations match their final authoritative positions.',
    steps: [
      { orchestrationId: 'nightmare.guaranteed-special-reveal', eventType: 'guaranteedSpecialReveal' },
      { orchestrationId: 'nightmare.guaranteed-special-reveal', eventType: 'guaranteedSpecialReveal' },
      { orchestrationId: 'nightmare.guaranteed-special-reveal', eventType: 'guaranteedSpecialReveal' },
      { orchestrationId: 'foundation.authoritative-reveal', eventType: 'reveal' },
      { orchestrationId: 'foundation.positive-settlement', eventType: 'winInfo' },
      { orchestrationId: 'foundation.acknowledged-tumble', eventType: 'tumbleBoard' },
    ],
    concurrency: 'three-reliquaries-sequential-before-authoritative-reveal',
    requiredFinalAcknowledgement: 'authoritative-event-acknowledgement',
  },
  lucidFamilyMultiplierSettlement: {
    id: 'proof.lucid-family-multiplier-settlement',
    contractFingerprint: MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT,
    purpose: 'Prove four guaranteed Gates, authoritative Lucid reveal, non-wild family doubling, and acknowledged tumble.',
    steps: [
      { orchestrationId: 'bonus.guaranteed-scatters', eventType: 'guaranteedScatters' },
      { orchestrationId: 'foundation.authoritative-reveal', eventType: 'reveal' },
      { orchestrationId: 'foundation.positive-settlement', eventType: 'winInfo' },
      { orchestrationId: 'lucid.family-multiplier-update', eventType: 'symbolMultiplierUpdate' },
      { orchestrationId: 'foundation.acknowledged-tumble', eventType: 'tumbleBoard' },
    ],
    concurrency: 'family-state-commit-precedes-cosmetic-rack-charge',
    requiredFinalAcknowledgement: 'authoritative-event-acknowledgement',
  },
  veilAscentUpgrade: {
    id: 'proof.veil-ascent-upgrade',
    contractFingerprint: MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT,
    purpose: 'Prove guaranteed Gates, authoritative Veil settlement, family-bar commit, persistent board upgrade, and acknowledged tumble.',
    steps: [
      { orchestrationId: 'bonus.guaranteed-scatters', eventType: 'guaranteedScatters' },
      { orchestrationId: 'foundation.authoritative-reveal', eventType: 'reveal' },
      { orchestrationId: 'foundation.positive-settlement', eventType: 'winInfo' },
      { orchestrationId: 'veil.symbol-bar-progress', eventType: 'symbolBarProgress' },
      { orchestrationId: 'veil.symbol-upgrade', eventType: 'symbolUpgrade' },
      { orchestrationId: 'foundation.acknowledged-tumble', eventType: 'tumbleBoard' },
    ],
    concurrency: 'bar-state-commit-precedes-persistent-board-upgrade-and-tumble',
    requiredFinalAcknowledgement: 'authoritative-event-acknowledgement',
  },
  tricksterGridSettlement: {
    id: 'proof.trickster-grid-settlement',
    contractFingerprint: MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT,
    purpose: 'Prove grid wake, authoritative settlement, unique touched-cell doubling, and acknowledged tumble.',
    steps: [
      { orchestrationId: 'grid.mode-start', eventType: 'modeGridStart' },
      { orchestrationId: 'foundation.authoritative-reveal', eventType: 'reveal' },
      { orchestrationId: 'foundation.positive-settlement', eventType: 'winInfo' },
      { orchestrationId: 'grid.position-update', eventType: 'positionMultiplierGridUpdate' },
      { orchestrationId: 'grid.position-update', eventType: 'positionMultiplierGridUpdate' },
      { orchestrationId: 'grid.position-update', eventType: 'positionMultiplierGridUpdate' },
      { orchestrationId: 'foundation.acknowledged-tumble', eventType: 'tumbleBoard' },
    ],
    concurrency: 'grid-state-commits-serialize; disjoint-cell-cosmetics-may-parallel-after-commit',
    requiredFinalAcknowledgement: 'authoritative-event-acknowledgement',
  },
  mysteryStarDreamfallTumble: {
    id: 'proof.mystery-star-dreamfall-tumble',
    contractFingerprint: MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT,
    purpose: 'Prove readable sequential Mystery -> Star -> Dreamfall state -> acknowledged tumble causality.',
    steps: [
      { orchestrationId: 'foundation.authoritative-reveal', eventType: 'reveal' },
      { orchestrationId: 'foundation.positive-settlement', eventType: 'winInfo' },
      { orchestrationId: 'mystery.transform', eventType: 'mysteryTransform' },
      { orchestrationId: 'star.target-selected', eventType: 'specialTargetSelected' },
      { orchestrationId: 'special.oneiric-star-resolve', eventType: 'specialPositionsResolved' },
      { orchestrationId: 'dreamfall.expand-reel-height', eventType: 'expandReelHeight' },
      { orchestrationId: 'dreamfall.tumble-chain-progress', eventType: 'tumbleChainProgress' },
      { orchestrationId: 'dreamfall.award-tumble-free-spin', eventType: 'awardTumbleFreeSpins', conditional: 'fifth-and-later-positive-hit' },
      { orchestrationId: 'foundation.acknowledged-tumble', eventType: 'tumbleBoard' },
    ],
    concurrency: 'sequential-authoritative-commits; cosmetics-only-after-commit',
    requiredFinalAcknowledgement: 'authoritative-event-acknowledgement',
  },
  exactMaxTermination: {
    id: 'proof.exact-100000x-max-termination',
    contractFingerprint: MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT,
    purpose: 'Prove exact 100,000x terminal preemption and deliberate round termination.',
    requiredMultiplier: MORPHEUS_MAX_WIN_MULTIPLIER,
    requiredAmount: MORPHEUS_MAX_WIN_AMOUNT,
    steps: [
      { orchestrationId: 'foundation.authoritative-reveal', eventType: 'reveal' },
      { orchestrationId: 'foundation.positive-settlement', eventType: 'winInfo' },
      { orchestrationId: 'max.max-win-reached', eventType: 'maxWinReached' },
      { orchestrationId: 'max.round-terminated', eventType: 'roundTerminated' },
    ],
    forbiddenAfterMax: MORPHEUS_EVENT_TYPES.filter(type => !['roundTerminated'].includes(type)),
  },
});

const knownPriorityIds = Object.keys(MORPHEUS_PRIORITY_LADDER);
const knownEventTypes = new Set(MORPHEUS_EVENT_TYPES);
const knownModes = new Set(Object.keys(MORPHEUS_MODE_REGISTRY));
const knownSpecials = new Set(MORPHEUS_SPECIAL_SYMBOLS);
const slotStatuses = new Set(['required', 'not-applicable', 'explicit-silence', CONTRACT_DETAIL_REQUIRED]);
const settlementScopes = new Set(['none', 'current-settlement', 'next-board-only', 'terminal', CONTRACT_DETAIL_REQUIRED]);
const blockingPolicies = new Set(['required', 'none', CONTRACT_DETAIL_REQUIRED]);
const concurrencyPolicies = new Set([
  'sequential', 'exclusive-terminal', 'parallel-after-authoritative-commit',
  'parallel-nonconflicting-positions', 'parallel-nonconflicting-reels',
  'event-priority-ladder', CONTRACT_DETAIL_REQUIRED,
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertAssetPlan(entry) {
  assert(entry.assets && typeof entry.assets === 'object', `${entry.id} requires an asset plan.`);
  assert(JSON.stringify(Object.keys(entry.assets)) === JSON.stringify(MORPHEUS_ASSET_SLOT_TYPES),
    `${entry.id} must declare static/motion/HUD/audio/entrance/journey/recap slots in contract order.`);
  for (const [type, slot] of Object.entries(entry.assets)) {
    assert(slot && slotStatuses.has(slot.status), `${entry.id}.${type} has an invalid asset status.`);
    assert(Array.isArray(slot.ids), `${entry.id}.${type} asset ids must be an array.`);
    if (slot.status === 'required') assert(slot.ids.length > 0, `${entry.id}.${type} requires at least one authored asset id.`);
    if (slot.status !== 'required') assert(typeof slot.reason === 'string' && slot.reason.length > 0,
      `${entry.id}.${type} must explain every non-required asset slot.`);
    for (const id of slot.ids) {
      assert(typeof id === 'string' && id.startsWith('morpheus.'), `${entry.id}.${type} asset ${id} is not Morpheus-scoped.`);
      assert(!/(^|[.\-_])(generic|fallback|default)([.\-_]|$)/i.test(id), `${entry.id}.${type} silently uses a generic fallback.`);
    }
  }
}

function assertPresentation(entry) {
  const presentation = entry.presentation;
  assert(presentation && blockingPolicies.has(presentation.blocking), `${entry.id} has an invalid blocking requirement.`);
  assert(typeof presentation.acknowledgement === 'string' && presentation.acknowledgement.length > 0,
    `${entry.id} requires an acknowledgement policy.`);
  assert(concurrencyPolicies.has(presentation.concurrency), `${entry.id} has an invalid concurrency policy.`);
  assert(JSON.stringify(Object.keys(presentation.timing)) === JSON.stringify(MORPHEUS_EFFECT_MOTION_MODES),
    `${entry.id} must declare normal/fast/reduced/none timing.`);
  for (const [motionMode, timing] of Object.entries(presentation.timing)) {
    assert(timing.required === true && timing.semanticCommit === 'required',
      `${entry.id}.${motionMode} must preserve the authoritative semantic commit.`);
    assert(Number.isFinite(timing.durationMs) || timing.durationMs === CONTRACT_DETAIL_REQUIRED,
      `${entry.id}.${motionMode} duration must be numeric or contract-detail-required.`);
  }
}

function assertRecovery(entry) {
  assert(entry.recovery?.replay === 'required-idempotent', `${entry.id} must require idempotent replay.`);
  assert(entry.recovery?.reconnect === 'required-idempotent', `${entry.id} must require idempotent reconnect.`);
  assert(typeof entry.recovery?.checkpoint === 'string' && entry.recovery.checkpoint.length > 0,
    `${entry.id} requires a recovery checkpoint contract.`);
  assert(entry.recovery?.alreadyAppliedMutation === 'render-without-reapplying',
    `${entry.id} must prohibit replay/reconnect double mutation.`);
  assert(entry.recovery?.pendingAcknowledgement === 'resume-or-finish-deterministically',
    `${entry.id} must resolve pending acknowledgement deterministically.`);
}

export function assertMorpheusEffectOrchestrationContract(contract = {
  fingerprint: MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT,
  priorityLadder: MORPHEUS_PRIORITY_LADDER,
  entries: MORPHEUS_EFFECT_ORCHESTRATIONS,
  proofRoutes: MORPHEUS_ORCHESTRATION_PROOF_ROUTES,
}) {
  assert(contract.fingerprint === MORPHEUS_CONTRACT_FINGERPRINT,
    `Morpheus orchestration fingerprint mismatch: ${contract.fingerprint}.`);

  const priorities = Object.values(contract.priorityLadder || {});
  assert(JSON.stringify(Object.keys(contract.priorityLadder || {})) === JSON.stringify(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']),
    'Morpheus orchestration priority ladder must contain P0 through P8 in order.');
  assert(new Set(priorities.map(priority => priority.id)).size === 9, 'Morpheus priority ids must be unique.');
  assert(JSON.stringify(priorities.map(priority => priority.rank)) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8]),
    'Morpheus priority ranks must be deterministic from 0 through 8.');

  assert(Array.isArray(contract.entries) && contract.entries.length > 0, 'Morpheus orchestration entries are required.');
  const ids = contract.entries.map(entry => entry.id);
  assert(new Set(ids).size === ids.length, 'Morpheus orchestration entry ids must be unique.');
  const registry = Object.fromEntries(contract.entries.map(entry => [entry.id, entry]));
  const coveredEvents = new Set();
  const coveredModes = new Set();
  const coveredSpecials = new Set();

  for (const entry of contract.entries) {
    assert(entry.contractFingerprint === MORPHEUS_CONTRACT_FINGERPRINT, `${entry.id} fingerprint drifted.`);
    assert(typeof entry.id === 'string' && entry.id.length > 0, 'Every orchestration entry requires an id.');
    assert(typeof entry.mechanicId === 'string' && entry.mechanicId.length > 0, `${entry.id} requires mechanicId.`);
    assert(Array.isArray(entry.eventTypes) && entry.eventTypes.length > 0, `${entry.id} requires eventTypes.`);
    for (const type of entry.eventTypes) {
      assert(knownEventTypes.has(type), `${entry.id} references unknown event type ${type}.`);
      coveredEvents.add(type);
    }
    assert(knownPriorityIds.includes(entry.priority), `${entry.id} references unknown priority ${entry.priority}.`);
    assert(settlementScopes.has(entry.settlementScope), `${entry.id} has invalid settlement scope ${entry.settlementScope}.`);
    assertAssetPlan(entry);
    assertPresentation(entry);
    assertRecovery(entry);
    assert(Array.isArray(entry.unresolved), `${entry.id} unresolved details must be an array.`);
    for (const item of entry.unresolved) {
      assert(item.status === CONTRACT_DETAIL_REQUIRED && typeof item.field === 'string' && typeof item.reason === 'string',
        `${entry.id} unresolved semantics must be explicit contract-detail-required records.`);
    }
    for (const mode of entry.modes) {
      assert(knownModes.has(mode), `${entry.id} references unknown mode ${mode}.`);
      coveredModes.add(mode);
    }
    for (const symbol of entry.symbols) {
      assert(knownSpecials.has(symbol), `${entry.id} references unknown special symbol ${symbol}.`);
      coveredSpecials.add(symbol);
    }
  }

  for (const type of MORPHEUS_EVENT_TYPES) assert(coveredEvents.has(type), `Orchestration registry is missing event ${type}.`);
  for (const mode of knownModes) assert(coveredModes.has(mode), `Orchestration registry is missing mode journey ${mode}.`);
  for (const symbol of knownSpecials) assert(coveredSpecials.has(symbol), `Orchestration registry is missing special variant ${symbol}.`);

  for (const route of Object.values(contract.proofRoutes || {})) {
    assert(route.contractFingerprint === MORPHEUS_CONTRACT_FINGERPRINT, `${route.id} fingerprint drifted.`);
    assert(Array.isArray(route.steps) && route.steps.length > 0, `${route.id} requires proof steps.`);
    for (const step of route.steps) {
      const orchestration = registry[step.orchestrationId];
      assert(orchestration, `${route.id} references unknown orchestration ${step.orchestrationId}.`);
      assert(orchestration.eventTypes.includes(step.eventType),
        `${route.id} step ${step.orchestrationId} does not own event ${step.eventType}.`);
    }
  }

  const mixed = contract.proofRoutes?.mysteryStarDreamfallTumble;
  assert(JSON.stringify(mixed?.steps.map(step => step.eventType)) === JSON.stringify([
    'reveal', 'winInfo', 'mysteryTransform', 'specialTargetSelected', 'specialPositionsResolved',
    'expandReelHeight', 'tumbleChainProgress', 'awardTumbleFreeSpins', 'tumbleBoard',
  ]), 'Mystery -> Star -> Dreamfall -> tumble proof route drifted.');
  assert(mixed.requiredFinalAcknowledgement === 'authoritative-event-acknowledgement',
    'Mixed proof route must end at an authoritative tumble acknowledgement.');

  const terminal = contract.proofRoutes?.exactMaxTermination;
  assert(terminal?.requiredMultiplier === 100_000 && terminal?.requiredAmount === 10_000_000,
    'MAX proof route must bind exact 100,000x / 10,000,000 book units.');
  assert(JSON.stringify(terminal.steps.map(step => step.eventType)) === JSON.stringify([
    'reveal', 'winInfo', 'maxWinReached', 'roundTerminated',
  ]), 'Exact MAX termination proof route drifted.');
  assert(terminal.forbiddenAfterMax.includes('tumbleBoard'), 'MAX proof route must forbid tumble after terminal preemption.');

  return true;
}

export const MORPHEUS_EFFECT_ORCHESTRATION_CONTRACT = deepFreeze({
  schemaVersion: MORPHEUS_ORCHESTRATION_SCHEMA_VERSION,
  fingerprint: MORPHEUS_ORCHESTRATION_CONTRACT_FINGERPRINT,
  priorityLadder: MORPHEUS_PRIORITY_LADDER,
  assetSlotTypes: MORPHEUS_ASSET_SLOT_TYPES,
  entries: MORPHEUS_EFFECT_ORCHESTRATIONS,
  registry: MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY,
  proofRoutes: MORPHEUS_ORCHESTRATION_PROOF_ROUTES,
});
