import { GAME_TYPES } from '../../mechanics/registry.js';
import { createProfessionalPresentationDirector } from '../presentation/PresentationDirector.js';
import { evaluateStakeApprovalEconomics } from '../quality/StakeApprovalProfile.js';

export const BLUEPRINT_CATALOG_VERSION = 1;

const baseMode = (rtp, maxWin) => ({
  name: 'base', cost: 1, rtp, maxWin, autoCloseDisabled: false,
  isFeature: true, isBuyBonus: false, distributions: [],
  profile: { entry: 'base', reelSet: 'BR', triggerFreeSpins: true },
});

const bonusMode = (rtp, maxWin, freeSpins, cost = 100) => ({
  name: 'bonus', cost, rtp, maxWin, autoCloseDisabled: true,
  isFeature: true, isBuyBonus: true, distributions: [],
  profile: {
    entry: 'freeSpins', freeSpins, freeSpinReelSet: 'FR',
    freeSpinMultiplier: Number((cost / freeSpins).toFixed(3)), retriggers: true,
    presentationState: 'bonusIdle',
  },
  presentation: { kicker: 'FEATURE START', title: 'BONUS', rule: `${freeSpins} free spins with enhanced feature math` },
});

export const GAME_BLUEPRINTS = {
  rapid_ways: {
    id: 'rapid_ways', version: 1, name: 'Rapid Ways', family: 'Fast sessions', complexity: 'Focused', pace: 'Fast',
    summary: 'A compact 5×3 ways game with short cascade chains, natural free spins, and a direct feature mode.',
    signature: 'Frequent, readable chain reactions with little dead time.',
    gameType: 'ways', grid: { reels: 5, rows: [3, 3, 3, 3, 3] },
    rtp: 0.965, wincap: 5000, wincapRtp: 0.001, volatility: 'high', motionProfile: 'snappy', cadence: 0.78,
    mechanics: ['cascades'],
    mechanicConfig: { cascades: { maxCascades: 4 } },
    freespinTriggers: { basegame: { 3: 8, 4: 12, 5: 16 }, freegame: { 3: 3, 4: 5, 5: 8 } },
    betModes: [baseMode(0.965, 5000), bonusMode(0.965, 5000, 8, 80)],
    creativePrompts: ['What visibly escalates on every cascade?', 'What makes the fourth cascade unmistakably yours?'],
    requiredAudio: ['spinStart', 'reelStop', 'cascadeDrop', 'winSmall', 'winBig', 'bonusTrigger', 'bonusEnd', 'wincap'],
  },
  multiplier_arena: {
    id: 'multiplier_arena', version: 1, name: 'Multiplier Arena', family: 'Escalation', complexity: 'Layered', pace: 'Medium',
    summary: 'A 5×5 ways game where cascades build a persistent feature multiplier and multiplier symbols create spikes.',
    signature: 'The entire presentation climbs with the global multiplier instead of treating every win alike.',
    gameType: 'ways5x5', grid: { reels: 5, rows: [5, 5, 5, 5, 5] },
    rtp: 0.965, wincap: 10000, wincapRtp: 0.001, volatility: 'very-high', motionProfile: 'balanced', cadence: 1,
    mechanics: ['cascades', 'multiplierSymbols', 'increasingMultipliers'],
    mechanicConfig: {
      cascades: { maxCascades: 12 },
      multiplierSymbols: { values: { basegame: { 1: 80, 2: 16, 3: 4 }, freegame: { 2: 55, 3: 28, 5: 12, 10: 5 } } },
      increasingMultipliers: { increment: 1, startValue: 1, maxValue: 100, persistInBonus: true },
    },
    freespinTriggers: { basegame: { 3: 10, 4: 15, 5: 20 }, freegame: { 3: 3, 4: 5, 5: 8 } },
    betModes: [baseMode(0.965, 10000), bonusMode(0.965, 10000, 10, 100)],
    creativePrompts: ['What physical object embodies the global multiplier?', 'How does the arena transform at 5×, 10×, and 25×?'],
    requiredAudio: ['spinStart', 'reelStop', 'cascadeDrop', 'multiplierUp', 'winSmall', 'winMedium', 'winBig', 'bonusTrigger', 'bonusEnd', 'wincap'],
  },
  sticky_reel_forge: {
    id: 'sticky_reel_forge', version: 1, name: 'Sticky Reel Forge', family: 'Persistent reel feature', complexity: 'Layered', pace: 'Measured',
    summary: 'A 5×5 ways game where whole-reel multiplier claims become wild, temporary seals clear after each spin, and sticky seals persist and upgrade only inside the feature.',
    signature: 'Every claimed reel becomes a readable persistent machine state, and only reels contributing to a ways win add their multipliers.',
    gameType: 'ways5x5', grid: { reels: 5, rows: [5, 5, 5, 5, 5] },
    rtp: 0.965, wincap: 10000, wincapRtp: 0.001, volatility: 'very-high', motionProfile: 'cinematic', cadence: 1.08,
    mechanics: ['stickyReelMultipliers'],
    mechanicConfig: {
      stickyReelMultipliers: {
        baseTemporaryChance: 0.055,
        valueWeights: {
          basegame: { 2: 80, 3: 15, 4: 4, 5: 0.9, 10: 0.1 },
          tier1: { 2: 75, 3: 17, 4: 5, 5: 2, 10: 1 },
          tier2: { 2: 68, 3: 18, 4: 7, 5: 4, 10: 2, 15: 0.8, 25: 0.2 },
          tier3: { 2: 60, 3: 20, 4: 8, 5: 6, 10: 3, 15: 1.5, 25: 1, 50: 0.5 },
        },
        tiers: {
          1: { freeSpins: 8, stickyChance: 0, temporaryChance: 0.07, upgradeChance: 0, guaranteedStickyBySpin: 0 },
          2: { freeSpins: 10, stickyChance: 0.018, temporaryChance: 0.055, upgradeChance: 0.05, guaranteedStickyBySpin: 0 },
          3: { freeSpins: 12, stickyChance: 0.025, temporaryChance: 0.055, upgradeChance: 0.07, guaranteedStickyBySpin: 3 },
        },
        directTierWeights: { 1: 55, 2: 30, 3: 15 },
      },
    },
    freespinTriggers: { basegame: { 3: 8, 4: 10, 5: 12 }, freegame: { 3: 2, 4: 3, 5: 4 } },
    betModes: [
      baseMode(0.965, 10000),
      { ...bonusMode(0.965, 10000, 10, 100), profile: { ...bonusMode(0.965, 10000, 10, 100).profile, stickyTierWeights: { 1: 55, 2: 30, 3: 15 } } },
    ],
    creativePrompts: ['What physically claims a whole reel?', 'How are temporary, sticky, and upgraded reel states distinguishable without reading text?'],
    requiredAudio: ['spinStart', 'reelStop', 'reelClaim', 'stickyLock', 'stickyUpgrade', 'temporaryClear', 'winSmall', 'winMedium', 'winBig', 'bonusTrigger', 'bonusEnd', 'wincap'],
  },
  wild_forge: {
    id: 'wild_forge', version: 1, name: 'Wild Forge', family: 'Symbol transformation', complexity: 'Layered', pace: 'Measured',
    summary: 'A 5×4 ways game built around expanding wild reels and a feature mode with stronger wild behavior.',
    signature: 'Wilds forge whole reels into a single dramatic vertical event.',
    gameType: 'ways5x4', grid: { reels: 5, rows: [4, 4, 4, 4, 4] },
    rtp: 0.965, wincap: 7500, wincapRtp: 0.001, volatility: 'high', motionProfile: 'cinematic', cadence: 1.16,
    mechanics: ['expandingWilds'],
    mechanicConfig: { expandingWilds: {} },
    freespinTriggers: { basegame: { 3: 10, 4: 15, 5: 20 }, freegame: { 3: 4, 4: 6, 5: 10 } },
    betModes: [
      baseMode(0.965, 7500),
      { ...bonusMode(0.965, 7500, 12, 100), profile: { ...bonusMode(0.965, 7500, 12, 100).profile, freeSpinExpandingWilds: true } },
    ],
    creativePrompts: ['What causes the wild to expand?', 'What new piece of character or environment animation sells a full wild reel?'],
    requiredAudio: ['spinStart', 'reelStop', 'anticipation', 'winSmall', 'winBig', 'bonusTrigger', 'bonusEnd', 'wincap'],
  },
  cascade_colossus: {
    id: 'cascade_colossus', version: 1, name: 'Cascade Colossus', family: 'Spectacle', complexity: 'Deep', pace: 'Cinematic',
    summary: 'A 6×5 cascade game with symbol multipliers, long chains, and a high-ceiling direct feature.',
    signature: 'The cabinet and character physically react as the cascade chain becomes dangerous.',
    gameType: 'waysLarge', grid: { reels: 6, rows: [5, 5, 5, 5, 5, 5] },
    rtp: 0.965, wincap: 25000, wincapRtp: 0.0015, volatility: 'very-high', motionProfile: 'cinematic', cadence: 1.12,
    mechanics: ['cascades', 'multiplierSymbols', 'increasingMultipliers'],
    mechanicConfig: {
      cascades: { maxCascades: 20 },
      multiplierSymbols: { values: { basegame: { 1: 90, 2: 8, 3: 2 }, freegame: { 2: 50, 3: 30, 5: 15, 10: 5 } } },
      increasingMultipliers: { increment: 2, startValue: 1, maxValue: 250, persistInBonus: true },
    },
    freespinTriggers: { basegame: { 3: 10, 4: 15, 5: 20, 6: 25 }, freegame: { 3: 3, 4: 5, 5: 8, 6: 12 } },
    betModes: [baseMode(0.965, 25000), bonusMode(0.965, 25000, 10, 100)],
    creativePrompts: ['What is the colossus doing while the reels are calm?', 'How does every multiplier milestone alter silhouette, lighting, and music?'],
    requiredAudio: ['spinStart', 'reelStop', 'cascadeDrop', 'multiplierUp', 'winSmall', 'winMedium', 'winBig', 'winMega', 'bonusTrigger', 'bonusEnd', 'wincap'],
  },
};

const clone = value => JSON.parse(JSON.stringify(value));

function fingerprint(value) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `bp-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function seededRandom(seedText) {
  let seed = 0;
  for (const character of String(seedText)) seed = Math.imul(seed ^ character.charCodeAt(0), 0x45d9f3b) >>> 0;
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function generateBlueprintReelStrips(project, blueprint) {
  const random = seededRandom(`${project.id}:${blueprint.id}:${blueprint.version}`);
  const symbols = project.theme?.symbols || [];
  const strips = [];
  for (let reel = 0; reel < blueprint.grid.reels; reel++) {
    const strip = [];
    for (const symbol of symbols) {
      const special = symbol.special || [];
      const count = special.includes('wild') ? 1 : special.includes('scatter') ? 1
        : symbol.tier === 'high' ? 3 : symbol.tier === 'medium' ? 5 : 8;
      for (let index = 0; index < count; index++) strip.push(symbol.name);
    }
    for (let index = strip.length - 1; index > 0; index--) {
      const target = Math.floor(random() * (index + 1));
      [strip[index], strip[target]] = [strip[target], strip[index]];
    }
    strips.push(strip);
  }
  return { BR: strips, FR: strips.map((strip, reel) => [...strip.slice(reel + 1), ...strip.slice(0, reel + 1)]) };
}

export function validateBlueprintDefinition(blueprint) {
  const issues = [];
  const type = GAME_TYPES[blueprint?.gameType];
  if (!blueprint?.id) issues.push('Blueprint has no ID.');
  if (!type) issues.push(`Unknown game type "${blueprint?.gameType}".`);
  if (type) {
    for (const mechanic of blueprint.mechanics || []) {
      if (!type.compatible.includes(mechanic)) issues.push(`${type.name} is not compatible with ${mechanic}.`);
    }
  }
  if (blueprint.grid?.rows?.length !== blueprint.grid?.reels) issues.push('Grid row count does not match reel count.');
  if (!(blueprint.rtp >= 0.92 && blueprint.rtp <= 0.965)) issues.push('Target RTP is outside the studio Stake range.');
  const approval = evaluateStakeApprovalEconomics({
    production: { standard: blueprint.approvalProfile || 'stake-two-star' },
    math: { wincap: blueprint.wincap, betModes: blueprint.betModes || [] },
  });
  issues.push(...approval.issues);
  const modeNames = new Set();
  for (const mode of blueprint.betModes || []) {
    if (modeNames.has(mode.name)) issues.push(`Bet mode "${mode.name}" is duplicated.`);
    modeNames.add(mode.name);
    if (!(mode.cost > 0 && mode.cost <= 1500)) issues.push(`Bet mode "${mode.name}" has an invalid cost.`);
    if (Math.abs(mode.rtp - blueprint.rtp) > 0.005) issues.push(`Bet mode "${mode.name}" is more than 0.5 RTP points from the blueprint.`);
  }
  return issues;
}

export function getBlueprint(id) {
  return GAME_BLUEPRINTS[id] || null;
}

export function getBlueprintSummary(blueprint) {
  return {
    id: blueprint.id,
    name: blueprint.name,
    gameType: blueprint.gameType,
    grid: `${blueprint.grid.reels}×${blueprint.grid.rows[0]}`,
    mechanics: blueprint.mechanics.length,
    modes: blueprint.betModes.length,
    rtp: blueprint.rtp,
    wincap: blueprint.wincap,
    fingerprint: fingerprint(blueprint),
  };
}

export function applyGameBlueprint(project, blueprintId) {
  const blueprint = getBlueprint(blueprintId);
  if (!blueprint) throw new Error(`Unknown game blueprint "${blueprintId}".`);
  const definitionIssues = validateBlueprintDefinition(blueprint);
  if (definitionIssues.length) throw new Error(definitionIssues.join(' '));

  project.math.gameType = blueprint.gameType;
  project.math.grid = clone(blueprint.grid);
  project.math.rtp = blueprint.rtp;
  project.math.wincap = blueprint.wincap;
  project.math.wincapRtp = blueprint.wincapRtp;
  project.math.payoutIncrement = 0.1;
  project.math.volatility = blueprint.volatility;
  project.math.paylines = blueprint.gameType === 'lines' ? {} : null;
  project.math.bonusMechanics = clone(blueprint.mechanics);
  project.math.mechanicConfig = clone(blueprint.mechanicConfig);
  project.math.specialSymbols = {
    wild: (project.theme?.symbols || []).filter(symbol => (symbol.special || []).includes('wild')).map(symbol => symbol.name),
    scatter: (project.theme?.symbols || []).filter(symbol => (symbol.special || []).includes('scatter')).map(symbol => symbol.name),
    multiplier: (project.theme?.symbols || []).filter(symbol => (symbol.special || []).includes('multiplier')).map(symbol => symbol.name),
  };
  project.math.freespinTriggers = clone(blueprint.freespinTriggers);
  project.math.betModes = clone(blueprint.betModes);
  project.math.distributions = [];
  project.math.reelStrips = generateBlueprintReelStrips(project, blueprint);
  project.math.calibration = null;

  const director = createProfessionalPresentationDirector();
  for (const recipe of director.recipes) {
    recipe.duration = Math.round(recipe.duration * blueprint.cadence);
    recipe.cues = recipe.cues.map(item => ({ ...item, at: Math.round(item.at * blueprint.cadence) }));
  }
  project.presentationDirector = director;
  project.animation ||= {};
  project.animation.runtime ||= {};
  project.animation.runtime.profile = blueprint.motionProfile;
  project.animation.runtime.reducedMotion = 'respect';

  project.production ||= {};
  project.production.presentation ||= {};
  project.production.rig ||= {};
  project.production.qa ||= {};
  project.production.presentation.interruptionAudit = null;
  project.production.rig.stressAudits = {};
  project.production.rig.certifications = {};
  project.production.presentation.reelChoreographyReviewed = false;
  project.production.presentation.winEscalationReviewed = false;
  project.production.qa.deterministicReplayVerified = false;
  project.production.qa.replayAudit = null;
  project.production.qa.viewportAudit = null;
  project.production.qa.assetIntegrityAudit = null;
  project.production.qa.playerInformationAudit = null;

  project.build ||= {};
  project.build.mathPublish = {
    totalBooks: 0, modes: [], officialVerification: false, fullStreamIntegrity: false, contractFingerprint: null,
    invalidatedBy: `blueprint:${blueprint.id}`,
  };
  project.blueprint = {
    id: blueprint.id,
    version: blueprint.version,
    catalogVersion: BLUEPRINT_CATALOG_VERSION,
    fingerprint: fingerprint(blueprint),
    appliedAt: new Date().toISOString(),
    summary: getBlueprintSummary(blueprint),
    creativePrompts: clone(blueprint.creativePrompts),
    requiredAudio: clone(blueprint.requiredAudio),
  };
  return {
    blueprint: project.blueprint,
    preserved: ['project identity', 'theme and artwork', 'audio files', 'Spine assets', 'provider settings'],
    invalidated: ['math books', 'official math verification', 'rules approval', 'replay approval', 'presentation approvals'],
  };
}

export function validateAppliedBlueprint(project) {
  if (!project.blueprint) return { applied: false, valid: true, issues: [], drift: [] };
  const blueprint = getBlueprint(project.blueprint.id);
  if (!blueprint) return { applied: true, valid: false, issues: [`Applied blueprint "${project.blueprint.id}" is not in this catalog.`], drift: [] };
  const issues = [];
  if (project.blueprint.fingerprint !== fingerprint(blueprint)) issues.push('The applied blueprint version no longer matches the current catalog definition.');
  const drift = [];
  if (project.math?.gameType !== blueprint.gameType) drift.push(`game type changed to ${project.math?.gameType}`);
  const enabled = new Set(project.math?.bonusMechanics || []);
  for (const mechanic of blueprint.mechanics) if (!enabled.has(mechanic)) drift.push(`removed ${mechanic}`);
  const modeNames = new Set((project.math?.betModes || []).map(mode => mode.name));
  for (const mode of blueprint.betModes) if (!modeNames.has(mode.name)) drift.push(`removed ${mode.name} mode`);
  return { applied: true, valid: issues.length === 0, blueprint, issues, drift };
}

export function createBlueprintManifest(project) {
  const validation = validateAppliedBlueprint(project);
  return {
    format: 'stake-studio-game-blueprint-v1',
    catalogVersion: BLUEPRINT_CATALOG_VERSION,
    applied: project.blueprint || null,
    valid: validation.valid,
    drift: validation.drift,
  };
}
