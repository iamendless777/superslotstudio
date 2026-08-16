import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_DREAM_ENHANCER_FEATURE_ENTRY_HIT_RATE,
  MORPHEUS_LUCID_WILD_VALUES,
  MORPHEUS_MAX_WIN_PROBABILITY_POLICY,
  MORPHEUS_MAX_WIN_RTP_ALLOCATION,
  MORPHEUS_MAX_WIN_MULTIPLIER,
  MORPHEUS_ORDINARY_MAX_WIN_MULTIPLIER,
  MORPHEUS_MODE_REGISTRY,
  MORPHEUS_POSITION_GRID_AGGREGATION,
  MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER,
} from '../src/engines/morpheus/MorpheusGameContract.js';
import { createMorpheusGovernedModesManifest } from '../src/engines/morpheus/MorpheusProjectContract.js';
import { applyMorpheusLucidWeightCandidate } from '../src/engines/morpheus/MorpheusLucidWeightPolicy.js';
import { evaluateStakeApprovalEconomics } from '../src/engines/quality/StakeApprovalProfile.js';

const path = process.argv[2];
const apply = process.argv.includes('--apply');
if (!path) throw new Error('Usage: node scripts/migrate-morpheus-approved-contract.mjs <project.json>');
let project = JSON.parse(readFileSync(path, 'utf8'));
if (project.build?.stakeEngine?.gameId !== 'morpheus_dreamfall') throw new Error('Refusing to migrate a non-Morpheus project.');

const before = createHash('sha256').update(JSON.stringify(project)).digest('hex');
const priorPublish = project.build?.mathPublish ? JSON.parse(JSON.stringify(project.build.mathPublish)) : null;
const approvedSelectable = Object.values(MORPHEUS_MODE_REGISTRY)
  .filter(mode => mode.entryPolicy === 'selectable' && Number(mode.costMultiplier) > 0);
const existing = new Map((project.math?.betModes || []).map(mode => [mode.name, mode]));

project.math.wincap = MORPHEUS_MAX_WIN_MULTIPLIER;
project.math.wincapRtp = MORPHEUS_MAX_WIN_RTP_ALLOCATION;
project.math.maxWinHitRate = 0;
project.math.maxWinCalibrationPolicy = 'separate-criterion-v1';
project.math.governedModes = createMorpheusGovernedModesManifest();
project.math.betModes = approvedSelectable.map(definition => {
  const mode = existing.get(definition.id);
  if (!mode) throw new Error(`Saved project is missing approved selectable mode ${definition.id}.`);
  const migrated = {
    ...mode,
    cost: definition.costMultiplier,
    rtp: 0.96,
    maxWin: MORPHEUS_MAX_WIN_MULTIPLIER,
    entryPolicy: definition.entryPolicy,
    releaseGated: false,
  };
  if (definition.id === 'trickster_dream') {
    migrated.profile = {
      ...(mode.profile || {}),
      entry: 'base',
      triggerFreeSpins: false,
      positionMultiplierGrid: true,
    };
    migrated.presentation = {
      ...(mode.presentation || {}),
      rule: 'ONE SPIN · 1× POSITION GRID · UNIQUE WINNING POSITIONS DOUBLE AFTER EACH SETTLEMENT',
    };
  }
  if (definition.id === 'dream_enhancer') {
    migrated.profile = {
      ...(mode.profile || {}),
      targetFeatureEntryHitRate: MORPHEUS_DREAM_ENHANCER_FEATURE_ENTRY_HIT_RATE,
    };
  }
  return migrated;
});
project.math.calibration = null;
project.math.mechanicConfig ||= {};
project.math.mechanicConfig.positionMultiplierGrid = {
  aggregation: MORPHEUS_POSITION_GRID_AGGREGATION,
  maximumCellMultiplier: MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER,
  contributorPolicy: 'unique-winning-positions',
  updateTiming: 'after-positive-quantized-settlement',
};
project.math.mechanicConfig.multiplierSymbols ||= {};
project.math.mechanicConfig.multiplierSymbols.approvedValueLadder = [...MORPHEUS_LUCID_WILD_VALUES];
project.math.mechanicConfig.multiplierSymbols.valueWeightStatus = 'pending-production-optimization';
project.math.mechanicConfig.multiplierSymbols.unweightedApprovedValues = MORPHEUS_LUCID_WILD_VALUES.filter(value => (
  !Object.prototype.hasOwnProperty.call(project.math.mechanicConfig.multiplierSymbols.values?.basegame || {}, value)
  || !Object.prototype.hasOwnProperty.call(project.math.mechanicConfig.multiplierSymbols.values?.freegame || {}, value)
));
project = applyMorpheusLucidWeightCandidate(project);

project.production ||= {};
project.production.standard = 'stake-three-star';
project.production.approvedContract = {
  format: 'morpheus-approved-project-contract-v1',
  fingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
  maximumPayoutMultiplier: MORPHEUS_MAX_WIN_MULTIPLIER,
  maximumWinProbabilityPolicy: MORPHEUS_MAX_WIN_PROBABILITY_POLICY,
  maximumWinRtpAllocation: MORPHEUS_MAX_WIN_RTP_ALLOCATION,
  maximumWinCalibrationPolicy: 'separate-criterion-v1',
  baseMaximumWinHitRate: MORPHEUS_MAX_WIN_RTP_ALLOCATION / MORPHEUS_MAX_WIN_MULTIPLIER,
  baseMaximumWinOdds: MORPHEUS_MAX_WIN_MULTIPLIER / MORPHEUS_MAX_WIN_RTP_ALLOCATION,
  ordinaryMaximumPayoutMultiplier: MORPHEUS_ORDINARY_MAX_WIN_MULTIPLIER,
  maximumTotalExposureUsd: 50_000_000,
  maximumBaseBetUsd: 500,
  governedModeIds: Object.keys(MORPHEUS_MODE_REGISTRY),
  selectableModeIds: approvedSelectable.map(mode => mode.id),
  releaseGatedModeIds: ['nightmare_descent', 'dreamfall'],
  naturalOnlyModeIds: ['oneiric_nexus'],
  positionGridAggregation: MORPHEUS_POSITION_GRID_AGGREGATION,
  positionGridMaximumCellMultiplier: MORPHEUS_POSITION_GRID_MAX_CELL_MULTIPLIER,
};
if (project.production.creative?.differentiators?.[1]) {
  project.production.creative.differentiators[1] = 'Five approved selectable wager entries coexist with three governed nonselectable feature modes: release-gated Nightmare and Dreamfall, plus natural-only Oneiric Nexus.';
}

if (priorPublish) {
  project.build.mathPublish = {
    ...priorPublish,
    officialVerification: false,
    fullStreamIntegrity: false,
    rtpAligned: false,
    invalidatedAt: new Date().toISOString(),
    invalidatedBy: MORPHEUS_CONTRACT_FINGERPRINT,
    invalidationReason: 'Saved math migrated from the stale six-mode/50,000x branch to the approved governed eight-mode/100,000x contract. Regenerate all selectable-mode books and natural feature routes.',
    previousContractFingerprint: priorPublish.contractFingerprint || null,
    contractFingerprint: null,
  };
}

const economics = evaluateStakeApprovalEconomics(project);
if (!economics.passed) throw new Error(economics.issues.join('\n'));
const after = createHash('sha256').update(JSON.stringify(project)).digest('hex');
if (apply) writeFileSync(path, `${JSON.stringify(project, null, 2)}\n`);
console.log(JSON.stringify({
  applied: apply,
  before,
  after,
  contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
  wincap: project.math.wincap,
  wincapRtp: project.math.wincapRtp,
  maxWinHitRate: project.math.maxWinHitRate,
  governedModeIds: project.math.governedModes.modes.map(mode => mode.id),
  selectableModeIds: project.math.betModes.map(mode => mode.name),
  stalePublishInvalidated: Boolean(priorPublish),
  maximumBaseBetUsd: economics.maximumBaseBetUsd,
  lucidWildValues: MORPHEUS_LUCID_WILD_VALUES,
  lucidWildUnweightedValues: project.math.mechanicConfig.multiplierSymbols.unweightedApprovedValues,
  positionGrid: project.math.mechanicConfig.positionMultiplierGrid,
}, null, 2));
