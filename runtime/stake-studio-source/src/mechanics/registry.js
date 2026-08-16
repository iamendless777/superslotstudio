/**
 * Mechanics Registry — every game type and bonus mechanic as a pluggable module.
 * Each mechanic declares what it needs, what it provides, and its defaults.
 * The configurator reads this to show available options.
 * The math engine reads this to wire up simulation logic.
 */

export const GAME_TYPES = {
  lines: {
    name: 'Classic Lines',
    description: 'Fixed paylines on spinning reels. Wins on predefined line patterns.',
    defaults: { reels: 5, rows: [3, 3, 3, 3, 3], paylineCount: 20 },
    requires: ['paylines'],
    provides: ['lineWins'],
    compatible: ['cascades', 'stickyWilds', 'expandingWilds', 'walkingWilds', 'multiplierSymbols', 'buyBonus', 'anteBet'],
  },

  ways: {
    name: 'Ways 5x3',
    description: 'Adjacent matching symbols pay from left to right across every active symbol way; the grid determines the exact number of ways.',
    defaults: { reels: 5, rows: [3, 3, 3, 3, 3] },
    requires: [],
    provides: ['waysWins'],
    compatible: ['cascades', 'stickyWilds', 'stickyReelMultipliers', 'expandingWilds', 'multiplierSymbols', 'increasingMultipliers', 'buyBonus', 'anteBet', 'mysterySymbols', 'symbolTransform'],
  },

  ways5x4: {
    name: 'Ways 5x4',
    description: '5 reels, 4 rows — 1024 ways. Common modern format used by many top providers.',
    defaults: { reels: 5, rows: [4, 4, 4, 4, 4] },
    requires: [],
    provides: ['waysWins'],
    compatible: ['cascades', 'stickyWilds', 'stickyReelMultipliers', 'expandingWilds', 'multiplierSymbols', 'increasingMultipliers', 'buyBonus', 'anteBet', 'mysterySymbols', 'symbolTransform', 'randomFeature'],
  },

  ways5x5: {
    name: 'Ways 5x5',
    description: '5 reels, 5 rows — 3125 ways. High-action grid with massive way counts.',
    defaults: { reels: 5, rows: [5, 5, 5, 5, 5] },
    requires: [],
    provides: ['waysWins'],
    compatible: ['cascades', 'stickyWilds', 'stickyReelMultipliers', 'expandingWilds', 'multiplierSymbols', 'increasingMultipliers', 'buyBonus', 'anteBet', 'mysterySymbols', 'symbolTransform', 'randomFeature'],
  },

  waysLarge: {
    name: 'Ways 6x5',
    description: '6 reels, 5 rows — 15,625 ways. Sweet Bonanza, Gates of Olympus style.',
    defaults: { reels: 6, rows: [5, 5, 5, 5, 5, 5] },
    requires: [],
    provides: ['waysWins'],
    compatible: ['cascades', 'multiplierSymbols', 'increasingMultipliers', 'buyBonus', 'anteBet', 'mysterySymbols', 'symbolTransform', 'randomFeature'],
  },

  cluster: {
    name: 'Cluster Pays',
    description: 'Groups of 5+ touching symbols (horizontal/vertical) pay together.',
    defaults: { reels: 7, rows: [7, 7, 7, 7, 7, 7, 7] },
    requires: [],
    provides: ['clusterWins'],
    compatible: ['cascades', 'multiplierSymbols', 'increasingMultipliers', 'buyBonus', 'mysterySymbols', 'symbolTransform', 'randomFeature'],
  },

  scatter: {
    name: 'Scatter / Pay Anywhere',
    description: 'Symbols pay based on total count anywhere on the board, not position.',
    defaults: { reels: 6, rows: [5, 5, 5, 5, 5, 5] },
    requires: [],
    provides: ['scatterWins'],
    compatible: ['cascades', 'multiplierSymbols', 'increasingMultipliers', 'buyBonus', 'anteBet', 'randomFeature'],
  },

  megaways: {
    name: 'Megaways',
    description: 'Random 2-7 symbols per reel each spin. Up to 117,649 ways.',
    defaults: { reels: 6, rows: [7, 7, 7, 7, 7, 7] },
    requires: ['variableRows'],
    provides: ['waysWins', 'variableRows'],
    compatible: ['cascades', 'multiplierSymbols', 'increasingMultipliers', 'buyBonus', 'anteBet', 'mysterySymbols', 'reelExpansion'],
  },

  holdAndSpin: {
    name: 'Hold & Spin',
    description: 'Lock-and-respin bonus. Symbols lock in place, respins until no new symbols land.',
    defaults: { reels: 5, rows: [3, 3, 3, 3, 3] },
    requires: [],
    provides: ['holdAndSpinBonus'],
    compatible: ['coinRespins', 'jackpotRespins', 'collectSymbols', 'multiplierSymbols', 'buyBonus'],
  },

  grid: {
    name: 'Grid Slot',
    description: 'Square grid instead of vertical reels. Often combined with cluster or scatter pays.',
    defaults: { reels: 5, rows: [5, 5, 5, 5, 5] },
    requires: [],
    provides: ['gridLayout'],
    compatible: ['cascades', 'cluster', 'multiplierSymbols', 'increasingMultipliers', 'buyBonus', 'mysterySymbols'],
  },
};

export const BONUS_MECHANICS = {
  cascades: {
    name: 'Cascading / Avalanche Wins',
    description: 'Winning symbols disappear, new ones fall in. Chain wins possible.',
    category: 'core',
    configFields: { maxCascades: { type: 'number', default: 0, label: 'Max cascades (0 = unlimited)' } },
  },

  stickyWilds: {
    name: 'Sticky Wilds',
    description: 'Wild symbols stay in place for the duration of the bonus.',
    category: 'wilds',
    configFields: { stickyDuring: { type: 'select', options: ['freespins', 'always'], default: 'freespins', label: 'Sticky during' } },
  },

  stickyReelMultipliers: {
    name: 'Sticky Reel Multipliers',
    description: 'Whole reels become wild multiplier reels; temporary claims clear after a spin while sticky claims and non-decreasing upgrades persist only through the originating feature.',
    category: 'multipliers',
    configFields: {
      baseTemporaryChance: { type: 'number', default: 0.055, label: 'Base temporary claim chance per reel' },
      valueWeights: { type: 'json', default: {
        basegame: { 2: 80, 3: 15, 4: 4, 5: 0.9, 10: 0.1 },
        tier1: { 2: 75, 3: 17, 4: 5, 5: 2, 10: 1 },
        tier2: { 2: 68, 3: 18, 4: 7, 5: 4, 10: 2, 15: 0.8, 25: 0.2 },
        tier3: { 2: 60, 3: 20, 4: 8, 5: 6, 10: 3, 15: 1.5, 25: 1, 50: 0.5 },
      }, label: 'Multiplier value weights' },
      tiers: { type: 'json', default: {
        1: { freeSpins: 8, stickyChance: 0, temporaryChance: 0.07, upgradeChance: 0, guaranteedStickyBySpin: 0 },
        2: { freeSpins: 10, stickyChance: 0.018, temporaryChance: 0.055, upgradeChance: 0.05, guaranteedStickyBySpin: 0 },
        3: { freeSpins: 12, stickyChance: 0.025, temporaryChance: 0.055, upgradeChance: 0.07, guaranteedStickyBySpin: 3 },
      }, label: 'Feature tier rules' },
      directTierWeights: { type: 'json', default: { 1: 55, 2: 30, 3: 15 }, label: 'Direct feature tier weights' },
    },
  },

  walkingWilds: {
    name: 'Walking Wilds',
    description: 'Wild symbols move one position each spin until they walk off.',
    category: 'wilds',
    configFields: { direction: { type: 'select', options: ['left', 'right', 'random'], default: 'left', label: 'Walk direction' } },
  },

  expandingWilds: {
    name: 'Expanding Wilds',
    description: 'Wild symbols expand using the game’s configured direction and coverage before wins are evaluated.',
    category: 'wilds',
    configFields: {},
  },

  multiplierSymbols: {
    name: 'Multiplier Symbols',
    description: 'Symbols carry a multiplier value applied to wins they participate in.',
    category: 'multipliers',
    configFields: {
      values: { type: 'json', default: { basegame: { 1: 1 }, freegame: { 2: 60, 3: 80, 5: 20, 10: 10 } }, label: 'Multiplier weights per gametype' },
    },
  },

  increasingMultipliers: {
    name: 'Increasing Multipliers',
    description: 'Global multiplier increases with each cascade/win. Resets per spin or persists through bonus.',
    category: 'multipliers',
    configFields: {
      increment: { type: 'number', default: 1, label: 'Increment per cascade' },
      startValue: { type: 'number', default: 1, label: 'Starting multiplier' },
      maxValue: { type: 'number', default: 0, label: 'Max multiplier (0 = no limit)' },
      persistInBonus: { type: 'boolean', default: true, label: 'Persist through bonus' },
    },
  },

  buyBonus: {
    name: 'Buy Bonus',
    description: 'Pay a premium to enter the bonus directly.',
    category: 'entry',
    configFields: {
      costMultiplier: { type: 'number', default: 100, label: 'Cost multiplier (e.g. 100 = 100x bet)' },
    },
  },

  anteBet: {
    name: 'Ante Bet',
    description: 'Pay extra per spin to increase bonus trigger chance.',
    category: 'entry',
    configFields: {
      costMultiplier: { type: 'number', default: 1.25, label: 'Cost multiplier' },
      triggerBoost: { type: 'number', default: 2, label: 'Trigger chance multiplier' },
    },
  },

  mysterySymbols: {
    name: 'Mystery Symbols',
    description: 'Special symbols that all reveal as the same random symbol.',
    category: 'symbols',
    configFields: {},
  },

  symbolTransform: {
    name: 'Symbol Transformation',
    description: 'Symbols transform into other symbols under certain conditions.',
    category: 'symbols',
    configFields: {},
  },

  symbolCollection: {
    name: 'Symbol Collection',
    description: 'Collecting specific symbols fills a meter that triggers features.',
    category: 'progression',
    configFields: {
      target: { type: 'number', default: 50, label: 'Symbols needed to trigger' },
    },
  },

  randomFeature: {
    name: 'Random Feature Trigger',
    description: 'Random features can trigger on any spin (extra wilds, multipliers, symbol upgrades).',
    category: 'random',
    configFields: {
      chance: { type: 'number', default: 0.05, label: 'Trigger chance per spin' },
    },
  },

  coinRespins: {
    name: 'Coin Respins',
    description: 'Coins with values appear; respins until no new coins land.',
    category: 'bonus',
    configFields: {
      respins: { type: 'number', default: 3, label: 'Starting respins' },
    },
  },

  featureWheel: {
    name: 'Feature Wheel',
    description: 'Spin a wheel to determine bonus type, multiplier, or prize.',
    category: 'bonus',
    configFields: {
      segments: { type: 'number', default: 8, label: 'Number of wheel segments' },
    },
  },

  reelExpansion: {
    name: 'Reel Expansion',
    description: 'Reels grow taller during features, adding more ways to win.',
    category: 'grid',
    configFields: {
      maxRows: { type: 'number', default: 7, label: 'Maximum rows per reel' },
    },
  },
};

export function getCompatibleMechanics(gameType) {
  const type = GAME_TYPES[gameType];
  if (!type) return [];
  return type.compatible.map(key => ({ key, ...BONUS_MECHANICS[key] })).filter(m => m.name);
}

export function getMechanicsByCategory() {
  const categories = {};
  for (const [key, mech] of Object.entries(BONUS_MECHANICS)) {
    const cat = mech.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ key, ...mech });
  }
  return categories;
}
