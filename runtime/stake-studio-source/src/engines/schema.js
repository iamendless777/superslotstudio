import { createProfessionalProductionProfile, normalizeProductionProfile } from './quality/QualityDirector.js';
import { createProfessionalPresentationDirector, normalizePresentationDirector } from './presentation/PresentationDirector.js';
import { createProfessionalAudioDirector, normalizeAudioDirector } from './audio/AudioDirector.js';
import { normalizeVisualFactoryState } from './assets/VisualAssetFactory.js';
import { normalizeCreativeDirectorState } from './creative/CreativeDirector.js';
import { createVisualEffectsState } from './animation/VisualEffectRecipes.js';

/**
 * GameProject schema — the single source of truth for a game.
 * Every engine reads from this. The editor writes to this.
 * Saved as JSON per game in /games/{id}/project.json
 */

export const DEFAULT_SYMBOLS = [
  { id: 'H1', name: 'H1', tier: 'high',    src: '', payouts: { 3: 1.00, 4: 4.00, 5: 20.00 }, special: [] },
  { id: 'H2', name: 'H2', tier: 'high',    src: '', payouts: { 3: 0.80, 4: 3.00, 5: 15.00 }, special: [] },
  { id: 'M1', name: 'M1', tier: 'medium',  src: '', payouts: { 3: 0.30, 4: 1.20, 5: 7.00 },  special: [] },
  { id: 'M2', name: 'M2', tier: 'medium',  src: '', payouts: { 3: 0.25, 4: 1.00, 5: 5.00 },  special: [] },
  { id: 'L1', name: 'L1', tier: 'low',     src: '', payouts: { 3: 0.12, 4: 0.40, 5: 2.00 },  special: [] },
  { id: 'L2', name: 'L2', tier: 'low',     src: '', payouts: { 3: 0.10, 4: 0.30, 5: 1.20 },  special: [] },
  { id: 'L3', name: 'L3', tier: 'low',     src: '', payouts: { 3: 0.04, 4: 0.20, 5: 0.80 },  special: [] },
  { id: 'W',  name: 'W',  tier: 'special', src: '', payouts: {},                               special: ['wild'] },
  { id: 'S',  name: 'S',  tier: 'special', src: '', payouts: {},                               special: ['scatter'] },
];

export function createGameProject(overrides = {}) {
  const base = {
    id: crypto.randomUUID(),
    name: 'Untitled Game',
    version: '0.0.1',
    created: new Date().toISOString(),
    blueprint: null,
    assetPack: null,

    // --- THEME ENGINE ---
    theme: {
      style: '',
      lore: '',
      colorPalette: [],
      cabinet: { layers: [], width: 1280, height: 800 },
      symbols: DEFAULT_SYMBOLS.map(s => ({ ...s })),
      character: null,
    },

    // --- MATH ENGINE ---
    math: {
      gameType: 'ways',   // "lines"|"ways"|"cluster"|"scatter"|"megaways"|"grid"
      grid: { reels: 5, rows: [3, 3, 3, 3, 3] },
      rtp: 0.965,
      wincap: 5000,
      wincapRtp: 0,       // explicit RTP allocation for the rare executable max-win outcome
      maxWinHitRate: 0,   // optional exact per-paid-round probability; takes precedence over wincapRtp
      maxWinCalibrationPolicy: 'legacy-mixed-v1', // opt into separate-criterion-v1 when optimizer owns MAX allocation
      volatility: 'high', // "low"|"medium"|"high"|"very-high"

      betModes: [
        // { name, cost, rtp, maxWin, autoCloseDisabled, isFeature, isBuyBonus, distributions:[] }
      ],
      paylines: null,      // for lines games: { 1:[0,0,0,0,0], ... }
      specialSymbols: {},   // { wild:["W"], scatter:["S"], multiplier:["M"] }

      bonusMechanics: [],   // enabled mechanics: ["cascades","stickyWilds","multipliers","buyBonus",...]
      mechanicConfig: {},   // per-mechanic config: { cascades: { maxCascades: 0 }, ... }
      freespinTriggers: {}, // { basegame:{3:10,4:15,5:20}, freegame:{2:3,3:5} }

      reelStrips: {},       // { BR0: [[sym,...], ...], FR0: [...] }

      distributions: [],    // per betmode distribution configs
      calibration: null,    // deterministic local prototype/review RTP evidence
    },

    // --- ANIMATION ENGINE ---
    animation: {
      states: {
        idle:        { layers: [], duration: null },
        spinStart:   { layers: [], duration: 300 },
        spinning:    { layers: [], duration: null },
        spinStop:    { layers: [], duration: 200 },
        winSmall:    { layers: [], duration: 1500 },
        winMedium:   { layers: [], duration: 2500 },
        winBig:      { layers: [], duration: 4000 },
        winMega:     { layers: [], duration: 5000 },
        wincap:      { layers: [], duration: 6000 },
        anticipation:{ layers: [], duration: null },
        bonusEntry:  { layers: [], duration: 2000 },
        bonusIdle:   { layers: [], duration: null },
        bonusExit:   { layers: [], duration: 2000 },
        freeSpinBanner: { layers: [], duration: 1500 },
      },
      particles: [],
      transitions: [],
      spineAssets: [],
      stateAnimations: {},
      runtime: {
        version: 1,
        profile: 'balanced',
        defaultMix: 0.18,
        reducedMotion: 'respect',
        activeSpineAsset: null,
      },
      visualEffects: createVisualEffectsState(),
    },

    // --- PRESENTATION DIRECTOR ---
    // Reusable event-to-animation/audio/VFX choreography recipes.
    presentationDirector: createProfessionalPresentationDirector(),

    // --- AUDIO ENGINE ---
    audio: {
      factory: {
        version: 1,
        generatedAssets: 0,
        lastSource: null,
      },
      director: createProfessionalAudioDirector(),
      layers: {
        baseMusic: null,      // { src, loop:true, volume }
        bonusMusic: null,
        ambience: null,
      },
      stingers: {
        spinStart: null,
        reelStop: [],         // per-reel stop sounds
        winSmall: null,
        winMedium: null,
        winBig: null,
        winMega: null,
        wincap: null,
        scatterLand: [],      // per-count
        bonusTrigger: null,
        bonusEnd: null,
        anticipation: null,
        cascadeDrop: null,
        multiplierUp: null,
      },
    },

    // --- TEXTURE ATLAS ---
    atlas: {
      assets: [],       // { name, src, width, height }
      packed: null,     // { width, height, dataUrl, frames }
      padding: 2,
      maxSize: 2048,
    },

    // --- REVIEW-GATED VISUAL ASSET FACTORY ---
    visualFactory: null,

    // --- PROVIDER-NEUTRAL CREATIVE DIRECTOR ---
    // Offline today; optional external generators can target the same concept contract later.
    creativeDirector: null,

    // --- PROFESSIONAL PRODUCTION CONTRACT ---
    // Cross-discipline evidence and budgets consumed by Quality Director and Build.
    production: createProfessionalProductionProfile(),

    // --- BUILD CONFIG ---
    build: {
      stakeEngine: {
        gameId: '',
        providerName: '',
        providerNumber: 0,
        teamName: '',
      },
      simulations: {
        base: 500000,
        bonus: 125000,
      },
      frontend: {
        entry: '',
        files: [],
        capabilities: {
          walletLifecycle: false,
          replay: false,
          jurisdiction: false,
          serverOwnedBalance: false,
          responsive: false,
        },
      },
      factoryRun: null,
      output: 'publish',
    },

  };

  if (overrides.id) base.id = overrides.id;
  if (overrides.name) base.name = overrides.name;
  if (overrides.version) base.version = overrides.version;
  if (overrides.blueprint) base.blueprint = overrides.blueprint;
  if (overrides.assetPack) base.assetPack = overrides.assetPack;
  if (overrides.theme) Object.assign(base.theme, overrides.theme);
  if (overrides.math) Object.assign(base.math, overrides.math);
  if (overrides.animation) Object.assign(base.animation, overrides.animation);
  base.animation.visualEffects = createVisualEffectsState(base.animation.visualEffects || {});
  if (overrides.presentationDirector) base.presentationDirector = normalizePresentationDirector(overrides.presentationDirector);
  if (overrides.audio) Object.assign(base.audio, overrides.audio);
  base.audio.director = normalizeAudioDirector(base.audio.director);
  if (overrides.atlas) Object.assign(base.atlas, overrides.atlas);
  if (overrides.visualFactory) base.visualFactory = overrides.visualFactory;
  normalizeVisualFactoryState(base);
  if (overrides.creativeDirector) base.creativeDirector = overrides.creativeDirector;
  normalizeCreativeDirectorState(base);
  if (overrides.production) base.production = normalizeProductionProfile(overrides.production);
  if (overrides.build) Object.assign(base.build, overrides.build);

  if (!base.math.reelStrips?.BR || base.math.reelStrips.BR.length === 0) {
    base.math.reelStrips = { BR: generateDefaultReelStrips(base) };
  }

  return base;
}

export function generateDefaultReelStrips(project) {
  const { reels } = project.math.grid;
  const syms = project.theme.symbols.length > 0 ? project.theme.symbols : DEFAULT_SYMBOLS;
  const isWays = ['ways', 'waysLarge', 'megaways'].includes(project.math.gameType);
  const strips = [];

  for (let r = 0; r < reels; r++) {
    const strip = [];
    for (const sym of syms) {
      let count;
      if (sym.special?.includes('wild')) count = 1;
      else if (sym.special?.includes('scatter')) count = isWays ? 1 : 2;
      else if (isWays && reels >= 6) {
        count = sym.tier === 'high' ? 3 : sym.tier === 'medium' ? 5 : 8;
      } else {
        count = sym.tier === 'high' ? 3 : sym.tier === 'medium' ? 5 : 7;
      }
      for (let i = 0; i < count; i++) strip.push(sym.name);
    }
    distributeStrip(strip);
    strips.push(strip);
  }
  return strips;
}

function distributeStrip(strip) {
  for (let i = strip.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [strip[i], strip[j]] = [strip[j], strip[i]];
  }
}
