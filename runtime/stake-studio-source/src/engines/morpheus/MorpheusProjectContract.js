import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_DREAM_ENHANCER_FEATURE_ENTRY_HIT_RATE,
  MORPHEUS_LUCID_WILD_VALUES,
  MORPHEUS_MAX_WIN_PROBABILITY_POLICY,
  MORPHEUS_MAX_WIN_RTP_ALLOCATION,
  MORPHEUS_ORDINARY_MAX_WIN_MULTIPLIER,
  MORPHEUS_MODE_REGISTRY,
  MORPHEUS_POSITION_GRID_AGGREGATION,
  MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER,
} from './MorpheusGameContract.js';

const clone = value => JSON.parse(JSON.stringify(value));

export const MORPHEUS_GOVERNED_MODES_FORMAT = 'morpheus-governed-modes-v1';

export function createMorpheusGovernedModesManifest() {
  return {
    format: MORPHEUS_GOVERNED_MODES_FORMAT,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    modes: Object.values(MORPHEUS_MODE_REGISTRY).map(mode => ({
      id: mode.id,
      entryPolicy: mode.entryPolicy,
      costMultiplier: mode.costMultiplier,
      priceClassMultiplier: mode.priceClassMultiplier ?? null,
      selectable: mode.entryPolicy === 'selectable' && Number(mode.costMultiplier) > 0,
      releaseGated: mode.entryPolicy === 'release-gated',
      entry: mode.entry,
      mechanics: [...mode.mechanics],
    })),
  };
}

export function applyMorpheusGovernedModes(project = {}) {
  const next = clone(project);
  next.math ||= {};
  next.math.governedModes = createMorpheusGovernedModesManifest();
  return next;
}

function isMorpheusProject(project) {
  const id = String(project?.id || project?.build?.stakeEngine?.gameId || '').toLowerCase();
  return id === 'morpheus' || id === 'morpheus_dreamfall' || /morpheus/i.test(String(project?.name || ''));
}

const SELECTABLE_MODE_PROFILES = Object.freeze({
  base: { entry: 'base', reelSet: 'BR', triggerFreeSpins: true },
  dream_enhancer: {
    entry: 'base', reelSet: 'BR', triggerFreeSpins: true,
    targetFeatureEntryHitRate: MORPHEUS_DREAM_ENHANCER_FEATURE_ENTRY_HIT_RATE,
    scatterWeightMultiplier: 3,
  },
  trickster_dream: {
    entry: 'base', reelSet: 'BR', triggerFreeSpins: false, positionMultiplierGrid: true,
  },
  veil_ascent: {
    entry: 'freeSpins', featureTier: 'veil_ascent', freeSpins: 10, retriggers: true,
    reelSet: 'FR', triggerFreeSpins: true,
  },
  lucid_blessing: {
    entry: 'freeSpins', featureTier: 'lucid_blessing', freeSpins: 10, retriggers: true,
    reelSet: 'FR', triggerFreeSpins: true,
  },
});

const SELECTABLE_MODE_PRESENTATION = Object.freeze({
  base: {
    kicker: 'STANDARD PLAY', title: 'BASE',
    rule: '6×4 ways · tumble · 3–6 doors enter the feature',
  },
  dream_enhancer: {
    kicker: 'ENHANCED PLAY', title: 'DREAM ENHANCER',
    rule: 'Same game · doors land more often · about 1 in 12',
  },
  trickster_dream: {
    kicker: 'ONE SPIN', title: 'TRICKSTER DREAM',
    rule: 'One paid spin · 1× position grid · winning cells double after settlement · no free spins',
  },
  veil_ascent: {
    kicker: 'BONUS FEATURE', title: 'VEIL ASCENT',
    rule: '10 free spins · symbol bar upgrades the lowest pay',
  },
  lucid_blessing: {
    kicker: 'BONUS FEATURE', title: 'LUCID BLESSING',
    rule: '10 free spins · winning family doubles · 3 doors add 5',
  },
});

const FEATURE_TIERS = Object.freeze({
  3: { id: 'veil_ascent', name: 'Veil Ascent', mechanic: 'progressiveSymbolUpgrade', spins: 10, meterThreshold: 4, maximumUpgrades: 4 },
  4: { id: 'lucid_blessing', name: 'Lucid Blessing', mechanic: 'persistentSymbolMultipliers', spins: 10 },
  5: { id: 'dreamfall', name: 'Dreamfall', mechanic: 'winningCascadeReelExpansion', spins: 10 },
  6: { id: 'oneiric_nexus', name: 'Oneiric Nexus', mechanic: 'persistentPositionMultiplierGrid', spins: 10 },
});

function buildSelectableMode(definition, prior = {}) {
  const buy = definition.id === 'veil_ascent' || definition.id === 'lucid_blessing';
  return {
    ...prior,
    name: definition.id,
    cost: definition.costMultiplier,
    rtp: prior.rtp || 0.96,
    maxWin: 100_000,
    autoCloseDisabled: false,
    isFeature: buy || prior.isFeature === true,
    isBuyBonus: buy,
    distributions: Array.isArray(prior.distributions) ? prior.distributions : [],
    entryPolicy: definition.entryPolicy,
    releaseGated: false,
    profile: { ...(prior.profile || {}), ...SELECTABLE_MODE_PROFILES[definition.id] },
    presentation: { ...(prior.presentation || {}), ...SELECTABLE_MODE_PRESENTATION[definition.id] },
  };
}

export function applyMorpheusSelectableModes(project, { overwrite = false } = {}) {
  if (!isMorpheusProject(project)) return { filled: 0 };
  project.math ||= {};
  project.math.governedModes = createMorpheusGovernedModesManifest();
  project.math.wincap = 100_000;
  const selectable = Object.values(MORPHEUS_MODE_REGISTRY)
    .filter((mode) => mode.entryPolicy === 'selectable' && Number(mode.costMultiplier) > 0);
  const existing = new Map((project.math.betModes || []).map((mode) => [mode.name, mode]));
  let filled = 0;
  const nextModes = selectable.map((definition) => {
    const current = existing.get(definition.id);
    if (current && !overwrite) {
      if (Number(current.cost) !== Number(definition.costMultiplier)) {
        current.cost = definition.costMultiplier;
        filled += 1;
      }
      if (!current.presentation?.rule) {
        current.presentation = { ...SELECTABLE_MODE_PRESENTATION[definition.id], ...(current.presentation || {}) };
        filled += 1;
      }
      current.profile = { ...SELECTABLE_MODE_PROFILES[definition.id], ...(current.profile || {}) };
      return current;
    }
    filled += 1;
    return buildSelectableMode(definition, current);
  });
  project.math.betModes = nextModes;
  project.math.featureArchitecture ||= { tiers: {} };
  project.math.featureArchitecture.tiers ||= {};
  for (const [count, tier] of Object.entries(FEATURE_TIERS)) {
    const current = project.math.featureArchitecture.tiers[count] || {};
    project.math.featureArchitecture.tiers[count] = overwrite
      ? { ...current, ...tier }
      : { ...tier, ...current };
  }
  project.math.mechanicConfig ||= {};
  project.math.mechanicConfig.positionMultiplierGrid = {
    aggregation: MORPHEUS_POSITION_GRID_AGGREGATION,
    maximumCellMultiplier: MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER,
    contributorPolicy: 'unique-winning-positions',
    updateTiming: 'after-positive-quantized-settlement',
    ...(project.math.mechanicConfig.positionMultiplierGrid || {}),
  };
  project.math.mechanicConfig.multiplierSymbols ||= {};
  if (overwrite || !project.math.mechanicConfig.multiplierSymbols.approvedValueLadder) {
    project.math.mechanicConfig.multiplierSymbols.approvedValueLadder = [...MORPHEUS_LUCID_WILD_VALUES];
  }
  return { filled, modes: nextModes.map((mode) => mode.name) };
}

export function auditMorpheusProjectContract(project = {}) {
  const manifest = project.math?.governedModes;
  const expected = createMorpheusGovernedModesManifest();
  const issues = [];
  if (manifest?.format !== expected.format) issues.push('Governed mode manifest format is missing or stale.');
  if (manifest?.contractFingerprint !== expected.contractFingerprint) issues.push('Governed mode contract fingerprint is missing or stale.');
  const actualIds = (manifest?.modes || []).map(mode => mode.id);
  const expectedIds = expected.modes.map(mode => mode.id);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) issues.push('Governed mode manifest does not contain the exact eight approved modes.');

  const selectableExpected = expected.modes.filter(mode => mode.selectable).map(mode => mode.id);
  const wagerModes = project.math?.betModes || [];
  const wagerIds = wagerModes.map(mode => mode.name);
  if (JSON.stringify(wagerIds) !== JSON.stringify(selectableExpected)) {
    issues.push(`Selectable wager modes must be exactly: ${selectableExpected.join(', ')}.`);
  }
  for (const mode of wagerModes) {
    const definition = expected.modes.find(item => item.id === mode.name);
    if (!definition?.selectable) issues.push(`Mode ${mode.name} is governed but not currently selectable.`);
    else if (Number(mode.cost) !== Number(definition.costMultiplier)) {
      issues.push(`Mode ${mode.name} cost ${mode.cost}x differs from approved ${definition.costMultiplier}x.`);
    }
  }
  const enhancer = wagerModes.find(mode => mode.name === 'dream_enhancer');
  if (enhancer && Number(enhancer.profile?.targetFeatureEntryHitRate) !== MORPHEUS_DREAM_ENHANCER_FEATURE_ENTRY_HIT_RATE) {
    issues.push(`Dream Enhancer optimizer hit-rate target must be 1 in ${MORPHEUS_DREAM_ENHANCER_FEATURE_ENTRY_HIT_RATE}.`);
  }
  const trickster = wagerModes.find(mode => mode.name === 'trickster_dream');
  if (trickster) {
    if (trickster.profile?.entry !== 'base') issues.push('Trickster Dream must execute exactly one paid base-spin lifecycle.');
    if (trickster.profile?.triggerFreeSpins !== false) issues.push('Trickster Dream must not trigger a free-spin lifecycle.');
    if (trickster.profile?.positionMultiplierGrid !== true) issues.push('Trickster Dream must initialize and persist its position-multiplier grid through the one-spin tumble chain.');
  }
  const positionGrid = project.math?.mechanicConfig?.positionMultiplierGrid || {};
  if (Number(project.math?.wincap) !== 100_000) issues.push('Maximum win must be exactly 100,000x.');
  if (Number(project.math?.wincapRtp) !== MORPHEUS_MAX_WIN_RTP_ALLOCATION) {
    issues.push('MAX_MORPHEUS must reserve exactly 1.00% RTP in every selectable mode.');
  }
  if (Number(project.math?.maxWinHitRate) > 0) {
    issues.push('Morpheus must use the cost-aware RTP-allocation policy, not a fixed per-mode MAX hit rate.');
  }
  if (project.math?.maxWinCalibrationPolicy !== 'separate-criterion-v1') {
    issues.push('Morpheus ordinary-return calibration must exclude the separately allocated MAX criterion.');
  }
  if (project.production?.approvedContract?.maximumWinProbabilityPolicy !== MORPHEUS_MAX_WIN_PROBABILITY_POLICY) {
    issues.push(`MAX_MORPHEUS probability policy must be ${MORPHEUS_MAX_WIN_PROBABILITY_POLICY}.`);
  }
  if (Number(project.production?.approvedContract?.ordinaryMaximumPayoutMultiplier) !== MORPHEUS_ORDINARY_MAX_WIN_MULTIPLIER) {
    issues.push('Ordinary outcomes must be contractually capped at 99,999.9x so exact 100,000x remains MAX_MORPHEUS-exclusive.');
  }
  if (positionGrid.aggregation !== MORPHEUS_POSITION_GRID_AGGREGATION) {
    issues.push(`Position-grid aggregation must be ${MORPHEUS_POSITION_GRID_AGGREGATION}.`);
  }
  if (Number(positionGrid.maximumCellMultiplier) !== MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER) {
    issues.push(`Position-grid maximum cell multiplier must be ${MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER}x.`);
  }
  if (positionGrid.contributorPolicy !== 'unique-winning-positions') {
    issues.push('Position-grid contributors must be unique winning positions.');
  }
  if (positionGrid.updateTiming !== 'after-positive-quantized-settlement') {
    issues.push('Position-grid cells must update only after a positive quantized settlement.');
  }

  const multiplierSymbols = project.math?.mechanicConfig?.multiplierSymbols || {};
  const approvedValueLadder = multiplierSymbols.approvedValueLadder || [];
  if (JSON.stringify(approvedValueLadder) !== JSON.stringify(MORPHEUS_LUCID_WILD_VALUES)) {
    issues.push(`LUCID_WILD approved value ladder must be exactly: ${MORPHEUS_LUCID_WILD_VALUES.join(', ')}.`);
  }
  const lucidWildMissingWeights = {};
  for (const context of ['basegame', 'freegame']) {
    const weights = multiplierSymbols.values?.[context] || {};
    lucidWildMissingWeights[context] = MORPHEUS_LUCID_WILD_VALUES.filter(value => {
      const weight = Number(weights[value]);
      return !Number.isFinite(weight) || weight <= 0;
    });
    if (lucidWildMissingWeights[context].length) {
      issues.push(`LUCID_WILD ${context} weights do not make the full approved ladder reachable; missing positive weights for: ${lucidWildMissingWeights[context].join(', ')}.`);
    }
    const unapproved = Object.entries(weights)
      .filter(([value, weight]) => Number(weight) > 0 && !MORPHEUS_LUCID_WILD_VALUES.includes(Number(value)))
      .map(([value]) => Number(value));
    if (unapproved.length) issues.push(`LUCID_WILD ${context} contains unapproved positive values: ${unapproved.join(', ')}.`);
  }
  if (multiplierSymbols.valueWeightStatus !== 'production-optimized') {
    issues.push('LUCID_WILD value weights are not marked production-optimized; probability optimization and final-book verification remain required.');
  }
  return {
    format: 'morpheus-project-contract-audit-v3',
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    governedModeIds: actualIds,
    selectableModeIds: wagerIds,
    lucidWildApprovedValueLadder: [...MORPHEUS_LUCID_WILD_VALUES],
    lucidWildMissingWeights,
    lucidWildValueWeightStatus: multiplierSymbols.valueWeightStatus || 'missing',
    issues,
    passed: issues.length === 0,
  };
}
