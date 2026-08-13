/**
 * Authoritative Morpheus contract registry for the approved signature slice.
 *
 * This module is deliberately game-specific. It is the executable vocabulary
 * boundary between the frozen Game Info contract and Morpheus event books.
 */

export const MORPHEUS_CONTRACT_FINGERPRINT = 'morpheus-game-info-v4-100000x-cost-aware-tail-20260811';
export const MORPHEUS_EVENT_SCHEMA_VERSION = 1;
export const MORPHEUS_BOOK_AMOUNT_MULTIPLIER = 100;
export const MORPHEUS_MAX_WIN_MULTIPLIER = 100_000;
export const MORPHEUS_MAX_WIN_AMOUNT = MORPHEUS_MAX_WIN_MULTIPLIER * MORPHEUS_BOOK_AMOUNT_MULTIPLIER;
export const MORPHEUS_MAX_WIN_PROBABILITY_POLICY = 'cost-aware-rtp-allocation-v1';
export const MORPHEUS_MAX_WIN_RTP_ALLOCATION = 0.01;
export const MORPHEUS_BASE_MAX_WIN_HIT_RATE = MORPHEUS_MAX_WIN_RTP_ALLOCATION / MORPHEUS_MAX_WIN_MULTIPLIER;
export const MORPHEUS_BASE_MAX_WIN_ODDS = 1 / MORPHEUS_BASE_MAX_WIN_HIT_RATE;
export const MORPHEUS_ORDINARY_MAX_WIN_MULTIPLIER = MORPHEUS_MAX_WIN_MULTIPLIER - 0.1;
export const MORPHEUS_ORDINARY_MAX_WIN_AMOUNT = MORPHEUS_MAX_WIN_AMOUNT - 10;
export const MORPHEUS_MAX_TOTAL_EXPOSURE_USD = 50_000_000;
export const MORPHEUS_MAX_BASE_BET_USD = 500;
export const MORPHEUS_LUCID_WILD_VALUES = Object.freeze([2, 3, 5, 7, 10, 25, 50, 100, 200, 500, 1000]);
export const MORPHEUS_POSITION_GRID_AGGREGATION = 'additive-excess-v1';
export const MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER = 1024;
export const MORPHEUS_DREAM_ENHANCER_FEATURE_ENTRY_HIT_RATE = 12;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/** @typedef {'natural'|'selectable'|'release-gated'} MorpheusEntryPolicy */
/**
 * @typedef {object} MorpheusModeDefinition
 * @property {string} id
 * @property {number|null} costMultiplier
 * @property {number} [priceClassMultiplier]
 * @property {MorpheusEntryPolicy} entryPolicy
 * @property {string} entry
 * @property {string[]} mechanics
 */

/** @type {Readonly<Record<string, MorpheusModeDefinition>>} */
export const MORPHEUS_MODE_REGISTRY = deepFreeze({
  base: {
    id: 'base', costMultiplier: 1, entryPolicy: 'selectable',
    entry: 'Natural 6x4 adjacent-reel ways, cascades, and natural 3/4/5/6-scatter tier entry.',
    mechanics: ['adjacentWays', 'cascades', 'naturalTierEntry'],
  },
  dream_enhancer: {
    id: 'dream_enhancer', costMultiplier: 3, entryPolicy: 'selectable',
    entry: 'Natural feature entry proven more than five times as likely as Base.',
    featureEntryHitRateTarget: MORPHEUS_DREAM_ENHANCER_FEATURE_ENTRY_HIT_RATE,
    mechanics: ['adjacentWays', 'cascades', 'enhancedNaturalTierEntry'],
  },
  trickster_dream: {
    id: 'trickster_dream', costMultiplier: 75, entryPolicy: 'selectable',
    entry: 'One spin with a persistent 1x position grid. Each win is multiplied by 1 plus the sum of every unique contributing cell value above 1x; after settlement, each contributing cell doubles once, up to 1024x.',
    mechanics: ['adjacentWays', 'cascades', 'positionMultiplierGrid', 'boostedSpecials'],
  },
  nightmare_descent: {
    id: 'nightmare_descent', costMultiplier: null, entryPolicy: 'release-gated',
    entry: 'One extreme spin with three guaranteed random specials revealed and placed sequentially.',
    mechanics: ['guaranteedSpecials', 'sequentialSpecialPlacement'],
  },
  veil_ascent: {
    id: 'veil_ascent', costMultiplier: 100, entryPolicy: 'selectable',
    entry: 'Guaranteed three-scatter Veil tier with 10 free spins.',
    mechanics: ['veilSymbolBar', 'persistentSymbolUpgrade'],
  },
  lucid_blessing: {
    id: 'lucid_blessing', costMultiplier: 200, entryPolicy: 'selectable',
    entry: 'Guaranteed four-scatter Lucid tier with 10 free spins.',
    mechanics: ['symbolFamilyMultipliers', 'threeScatterFiveSpinAward'],
  },
  dreamfall: {
    id: 'dreamfall', costMultiplier: null, priceClassMultiplier: 1000, entryPolicy: 'release-gated',
    entry: 'Guaranteed five-scatter Dreamfall tier with 10 free spins; final 1000x-class price requires official approval.',
    mechanics: ['independentReelGrowth', 'scatterFreeRefill', 'fifthAndLaterTumbleAwards'],
  },
  oneiric_nexus: {
    id: 'oneiric_nexus', costMultiplier: null, entryPolicy: 'natural',
    entry: 'Natural six-scatter top tier with 10 free spins. Each win is multiplied by 1 plus the sum of every unique contributing cell value above 1x; settled contributing cells then double once, up to 1024x. No direct buy without approval.',
    mechanics: ['positionMultiplierGrid', 'threeScatterFiveSpinAward'],
  },
});

/** @type {Readonly<Record<string, Readonly<object>>>} */
export const MORPHEUS_MECHANIC_REGISTRY = deepFreeze({
  settlementSymbolHits: {
    id: 'settlementSymbolHits',
    rule: 'One unique contributing paying-family board position per positive quantized resolution, independent of ways multiplicity.',
    zeroQuantizedMutation: 'forbidden',
  },
  veilSymbolBar: {
    id: 'veilSymbolBar',
    rule: 'Winning hits fill a persistent bar; fill resets the bar and permanently upgrades the lowest active paying family to a random available higher family.',
  },
  lucidFamilyMultipliers: {
    id: 'lucidFamilyMultipliers', start: 1, excludes: ['WILD'],
    rule: 'The settled winning family doubles its persistent multiplier; three scatters add five spins.',
  },
  dreamfallReelGrowth: {
    id: 'dreamfallReelGrowth', minimumRows: 4, maximumRows: 8, reels: 6,
    rule: 'Each positive settled winning connection grows one random non-maxed reel by exactly one row.',
  },
  dreamfallTumbleAwards: {
    id: 'dreamfallTumbleAwards', threshold: 5, awardPerHit: 1,
    rule: 'The fifth and every later positive tumble hit in the same chain awards one free spin.',
  },
  dreamfallRefill: {
    id: 'dreamfallRefill', forbiddenSymbols: ['GATE_OF_SLEEP'],
    rule: 'Scatters cannot land in Dreamfall expansion or tumble refills.',
  },
  nexusPositionGrid: {
    id: 'nexusPositionGrid', start: 1,
    aggregation: MORPHEUS_POSITION_GRID_AGGREGATION,
    maximumCellMultiplier: MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER,
    contributorPolicy: 'unique-winning-positions',
    settlementScope: 'current-settlement-before-grid-update',
    rule: 'For each winning connection, effective multiplier = 1 + sum(max(0, contributing cell value - 1)) across unique contributing positions. After the positive quantized settlement, each contributing cell doubles once up to 1024x. Three scatters add five Nexus spins.',
  },
  veilWild: {
    id: 'veilWild', direction: 'down',
    settlementScope: 'next-board-only',
    rule: 'Expands downward and stops before every wild or protected special.',
  },
  lucidWild: {
    id: 'lucidWild', values: MORPHEUS_LUCID_WILD_VALUES, settlementScope: 'current-settlement',
  },
  dreamRift: { id: 'dreamRift', symbol: 'DREAM_RIFT', dimensions: [2, 2], effect: 'authoritativeWildBlock', settlementScope: 'next-board-only' },
  goldenRift: { id: 'goldenRift', symbol: 'GOLDEN_RIFT', dimensions: [3, 3], effect: 'authoritativeWildBlock', settlementScope: 'next-board-only' },
  echoSplit: { id: 'echoSplit', settlementScope: 'current-settlement', rule: 'Publishes exact contributors and effective ways accounting.' },
  dawnPurge: { id: 'dawnPurge', settlementScope: 'next-board-only', rule: 'Removes low symbols, then performs a restricted refill excluding low symbols.' },
  oneiricStar: { id: 'oneiricStar', settlementScope: 'next-board-only', rule: 'Selects a paying family after a positive settlement before converting all authoritative copies for the next board.' },
  mysteryVeil: { id: 'mysteryVeil', settlementScope: 'next-board-only', originalIdentity: 'MYSTERY_VEIL', rule: 'After a positive settlement, synchronously reveals one common paying family for the next board while preserving original identity for transformation and upgrade accounting.' },
  rainingWilds: { id: 'rainingWilds', rule: 'Predetermined wild variants and positions are published before presentation.' },
  guaranteedBonus: { id: 'guaranteedBonus', rule: 'Predetermined scatter tier and positions are published before reveal.' },
  stackedReels: { id: 'stackedReels', rule: 'Predetermined reels and common stack symbol are published before reveal.' },
  maxMorpheus: {
    id: 'maxMorpheus', multiplier: MORPHEUS_MAX_WIN_MULTIPLIER,
    amount: MORPHEUS_MAX_WIN_AMOUNT, terminalCause: 'MAX_MORPHEUS',
    probabilityPolicy: MORPHEUS_MAX_WIN_PROBABILITY_POLICY,
    rtpAllocation: MORPHEUS_MAX_WIN_RTP_ALLOCATION,
    baseModeHitRate: MORPHEUS_BASE_MAX_WIN_HIT_RATE,
    baseModeOdds: MORPHEUS_BASE_MAX_WIN_ODDS,
    ordinaryMaximumMultiplier: MORPHEUS_ORDINARY_MAX_WIN_MULTIPLIER,
    rule: 'Exactly 100,000x is reserved for visible MAX_MORPHEUS. Its per-mode probability equals 1% RTP times mode cost divided by 100,000x, preserving a 1% RTP contribution in every mode; Base odds are 1 in 10,000,000. It terminates the authoritative round and ordinary outcomes stop at 99,999.9x.',
  },
});

/** The mechanic-event vocabulary copied exactly from the frozen contract. */
export const MORPHEUS_FROZEN_EVENT_TYPES = deepFreeze([
  'modeGridStart',
  'positionMultiplierGridUpdate',
  'guaranteedSpecialReveal',
  'symbolBarProgress',
  'symbolUpgrade',
  'symbolMultiplierUpdate',
  'expandReelHeight',
  'tumbleChainProgress',
  'awardTumbleFreeSpins',
  'rainingWilds',
  'stackedReels',
  'guaranteedScatters',
  'mysteryTransform',
  'specialTargetSelected',
  'specialPositionsResolved',
  'maxWinReached',
  'roundTerminated',
]);

/** Stake lifecycle events needed to execute the approved causal order. */
export const MORPHEUS_FOUNDATION_EVENT_TYPES = deepFreeze(['reveal', 'winInfo', 'tumbleBoard']);

export const MORPHEUS_EVENT_TYPES = deepFreeze([
  ...MORPHEUS_FOUNDATION_EVENT_TYPES,
  ...MORPHEUS_FROZEN_EVENT_TYPES,
]);

const event = (phase, payloadType, options = {}) => ({
  phase,
  payloadType,
  persistent: false,
  boardMutation: false,
  acknowledgement: 'none',
  vocabulary: 'frozen-contract',
  ...options,
});

/** @type {Readonly<Record<string, Readonly<object>>>} */
export const MORPHEUS_EVENT_REGISTRY = deepFreeze({
  reveal: event('land', 'MorpheusRevealPayload', { boardMutation: true, vocabulary: 'stake-foundation' }),
  winInfo: event('settlement', 'MorpheusPositiveSettlementPayload', { vocabulary: 'stake-foundation' }),
  tumbleBoard: event('tumble', 'MorpheusTumblePayload', {
    boardMutation: true, acknowledgement: 'required', vocabulary: 'stake-foundation',
  }),
  modeGridStart: event('land', 'MorpheusModeGridStartPayload', { persistent: true }),
  positionMultiplierGridUpdate: event('reaction', 'MorpheusPositionGridUpdatePayload', { persistent: true }),
  guaranteedSpecialReveal: event('land', 'MorpheusGuaranteedSpecialPayload'),
  symbolBarProgress: event('reaction', 'MorpheusSymbolBarProgressPayload', { persistent: true }),
  symbolUpgrade: event('reaction', 'MorpheusSymbolUpgradePayload', { persistent: true, boardMutation: true }),
  symbolMultiplierUpdate: event('reaction', 'MorpheusSymbolMultiplierPayload', { persistent: true }),
  expandReelHeight: event('reaction', 'MorpheusExpandReelPayload', { persistent: true, boardMutation: true }),
  tumbleChainProgress: event('reaction', 'MorpheusTumbleProgressPayload', { persistent: true }),
  awardTumbleFreeSpins: event('reaction', 'MorpheusTumbleAwardPayload', { persistent: true }),
  rainingWilds: event('land', 'MorpheusRainingWildsPayload'),
  stackedReels: event('land', 'MorpheusStackedReelsPayload'),
  guaranteedScatters: event('land', 'MorpheusGuaranteedScattersPayload'),
  mysteryTransform: event('reaction', 'MorpheusMysteryTransformPayload', { boardMutation: true }),
  specialTargetSelected: event('reaction', 'MorpheusSpecialTargetPayload'),
  specialPositionsResolved: event('reaction', 'MorpheusSpecialPositionsPayload', { boardMutation: true }),
  maxWinReached: event('terminal', 'MorpheusMaxWinPayload', { persistent: true, acknowledgement: 'required' }),
  roundTerminated: event('terminal', 'MorpheusRoundTerminatedPayload', { persistent: true }),
});

export const MORPHEUS_SPECIAL_SYMBOLS = deepFreeze([
  'VEIL_WILD', 'LUCID_WILD', 'DREAM_RIFT', 'GOLDEN_RIFT', 'ECHO_SPLIT',
  'DAWN_PURGE', 'ONEIRIC_STAR', 'MAX_MORPHEUS', 'MYSTERY_VEIL',
  'GATE_OF_SLEEP', 'RIFT_WILD',
]);

export const MORPHEUS_CONTRACT_REGISTRY = deepFreeze({
  fingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
  schemaVersion: MORPHEUS_EVENT_SCHEMA_VERSION,
  settlement: {
    amountMultiplier: MORPHEUS_BOOK_AMOUNT_MULTIPLIER,
    settlementQuantumAmount: 10,
    positiveQuantizedMinimumAmount: 10,
    maximumMultiplier: MORPHEUS_MAX_WIN_MULTIPLIER,
    maximumAmount: MORPHEUS_MAX_WIN_AMOUNT,
    maximumProbabilityPolicy: MORPHEUS_MAX_WIN_PROBABILITY_POLICY,
    maximumRtpAllocation: MORPHEUS_MAX_WIN_RTP_ALLOCATION,
    baseMaximumHitRate: MORPHEUS_BASE_MAX_WIN_HIT_RATE,
    baseMaximumHitOdds: MORPHEUS_BASE_MAX_WIN_ODDS,
    ordinaryMaximumMultiplier: MORPHEUS_ORDINARY_MAX_WIN_MULTIPLIER,
    ordinaryMaximumAmount: MORPHEUS_ORDINARY_MAX_WIN_AMOUNT,
    maximumTotalExposureUsd: MORPHEUS_MAX_TOTAL_EXPOSURE_USD,
    maximumBaseBetUsd: MORPHEUS_MAX_BASE_BET_USD,
  },
  modes: MORPHEUS_MODE_REGISTRY,
  mechanics: MORPHEUS_MECHANIC_REGISTRY,
  specialSymbols: MORPHEUS_SPECIAL_SYMBOLS,
  frozenEventTypes: MORPHEUS_FROZEN_EVENT_TYPES,
  foundationEventTypes: MORPHEUS_FOUNDATION_EVENT_TYPES,
  events: MORPHEUS_EVENT_REGISTRY,
});

export function assertMorpheusContractRegistry(registry = MORPHEUS_CONTRACT_REGISTRY) {
  if (registry.fingerprint !== MORPHEUS_CONTRACT_FINGERPRINT) {
    throw new Error(`Morpheus contract fingerprint mismatch: ${registry.fingerprint}.`);
  }
  const modeIds = Object.keys(registry.modes);
  const requiredModes = [
    'base', 'dream_enhancer', 'trickster_dream', 'nightmare_descent',
    'veil_ascent', 'lucid_blessing', 'dreamfall', 'oneiric_nexus',
  ];
  if (JSON.stringify(modeIds) !== JSON.stringify(requiredModes)) {
    throw new Error('Morpheus mode registry drifted from the frozen mode vocabulary.');
  }
  for (const type of MORPHEUS_EVENT_TYPES) {
    if (!registry.events[type]) throw new Error(`Morpheus event registry is missing ${type}.`);
  }
  if (registry.settlement.maximumMultiplier !== 100_000
    || registry.settlement.maximumAmount !== 10_000_000
    || registry.settlement.maximumProbabilityPolicy !== MORPHEUS_MAX_WIN_PROBABILITY_POLICY
    || registry.settlement.maximumRtpAllocation !== 0.01
    || registry.settlement.baseMaximumHitRate !== 1 / 10_000_000
    || registry.settlement.baseMaximumHitOdds !== 10_000_000
    || registry.settlement.ordinaryMaximumMultiplier !== 99_999.9
    || registry.settlement.ordinaryMaximumAmount !== 9_999_990
    || registry.settlement.maximumTotalExposureUsd !== 50_000_000
    || registry.settlement.maximumBaseBetUsd !== 500) {
    throw new Error('Morpheus 100,000x approval profile drifted.');
  }
  return true;
}
