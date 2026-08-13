import { MathEngine } from './MathEngine.js';
import { SeededRNG } from './SeededRNG.js';
import { maximumWinRtpForMode } from './MaximumWinPolicy.js';

export const MATH_AUTOPILOT_FORMAT = 'stake-studio-math-autopilot-v1';
export const MATH_AUTOPILOT_SEED = 0x51a7e;

// Catalog blueprints begin near their known local-simulator scale so daily
// calibration verifies and trims them instead of rediscovering orders of
// magnitude from 1× on every new game. Custom games simply use iteration.
const BLUEPRINT_FACTOR_HINTS = Object.freeze({
  rapid_ways: { base: 1.25, bonus: 13.6 },
  multiplier_arena: { base: 0.0275, bonus: 0.111 },
  sticky_reel_forge: { base: 0.00668, bonus: 0.00372 },
  wild_forge: { base: 0.55, bonus: 4.68 },
  cascade_colossus: { base: 0.033, bonus: 0.129 },
});

const cleanNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function fingerprint(value) {
  const source = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `math-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function calibrationContract(project = {}) {
  const math = project.math || {};
  return {
    gameType: math.gameType,
    grid: math.grid,
    rtp: math.rtp,
    wincap: math.wincap,
    wincapRtp: math.wincapRtp,
    maxWinHitRate: math.maxWinHitRate,
    maxWinCalibrationPolicy: math.maxWinCalibrationPolicy,
    payoutIncrement: math.payoutIncrement,
    specialSymbols: math.specialSymbols,
    bonusMechanics: math.bonusMechanics,
    mechanicConfig: math.mechanicConfig,
    freespinTriggers: math.freespinTriggers,
    reelStrips: math.reelStrips,
    symbols: (project.theme?.symbols || []).map(symbol => ({ name: symbol.name, payouts: symbol.payouts, special: symbol.special })),
    betModes: (math.betModes || []).map(mode => ({
      name: mode.name, cost: mode.cost, rtp: mode.rtp, maxWin: mode.maxWin,
      isBuyBonus: mode.isBuyBonus, profile: mode.profile,
    })),
  };
}

export function mathCalibrationFingerprint(project = {}) {
  return fingerprint(calibrationContract(project));
}

export function getMathCalibrationStatus(project = {}) {
  const calibration = project.math?.calibration || null;
  const currentFingerprint = mathCalibrationFingerprint(project);
  const reports = Array.isArray(calibration?.modes) ? calibration.modes : [];
  const expectedModes = (project.math?.betModes || []).map(mode => mode.name);
  const calibratedModes = new Set(reports.filter(report => report.aligned).map(report => report.name));
  const complete = calibration?.format === MATH_AUTOPILOT_FORMAT
    && calibration.fingerprint === currentFingerprint
    && expectedModes.length > 0
    && expectedModes.every(name => calibratedModes.has(name));
  return {
    exists: Boolean(calibration),
    complete,
    stale: Boolean(calibration && calibration.fingerprint !== currentFingerprint),
    currentFingerprint,
    calibration,
    alignedModes: expectedModes.filter(name => calibratedModes.has(name)).length,
    totalModes: expectedModes.length,
  };
}

export function simulateMathMode(project, modeName, options = {}) {
  const rounds = Math.max(1000, Math.floor(cleanNumber(options.rounds, 50000)));
  const seed = cleanNumber(options.seed, MATH_AUTOPILOT_SEED) >>> 0;
  const mode = (project.math?.betModes || []).find(item => item.name === modeName);
  if (!mode) throw new Error(`Math Autopilot could not find wager mode "${modeName}".`);
  const engine = new MathEngine(project);
  const rng = new SeededRNG(seed);
  const rand = () => rng.random();
  let paid = 0;
  let wagered = 0;
  let hits = 0;
  let maxWin = 0;
  let meanReturn = 0;
  let m2 = 0;
  let invalidPayouts = 0;
  let maxMorpheusHits = 0;
  const includeAllocatedMax = options.includeAllocatedMax !== false;
  for (let index = 0; index < rounds; index++) {
    const round = engine.resolveRound(rand, mode.name, { includeAllocatedMax });
    const normalized = round.normalizedWin;
    paid += round.totalWin;
    wagered += round.wager;
    if (round.totalWin > 0) hits++;
    if (round.maxMorpheusHit === true) maxMorpheusHits++;
    maxWin = Math.max(maxWin, normalized);
    const delta = normalized - meanReturn;
    meanReturn += delta / (index + 1);
    m2 += delta * (normalized - meanReturn);
    const units = Math.round(round.totalWin * 100);
    if (units !== 0 && (units < 10 || units % 10 !== 0)) invalidPayouts++;
  }
  const realizedRtp = wagered > 0 ? paid / wagered : 0;
  const standardDeviation = Math.sqrt(m2 / rounds);
  const standardError = standardDeviation / Math.sqrt(rounds);
  return {
    name: mode.name,
    rounds,
    seed,
    realizedRtp,
    declaredRtp: cleanNumber(mode.rtp, cleanNumber(project.math?.rtp)),
    delta: realizedRtp - cleanNumber(mode.rtp, cleanNumber(project.math?.rtp)),
    hitRate: hits / rounds,
    maxWin,
    standardDeviation,
    standardError,
    invalidPayouts,
    includeAllocatedMax,
    maxMorpheusHits,
  };
}

function factorField(mode) {
  const entry = mode.profile?.entry || (mode.isBuyBonus ? 'freeSpins' : 'base');
  return entry === 'freeSpins' ? 'freeSpinMultiplier' : 'multiplier';
}

function modeSeed(baseSeed, index) {
  return (baseSeed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
}

export function calibratePrototypeMath(project, options = {}) {
  const modes = project.math?.betModes || [];
  if (!modes.length) throw new Error('Math Autopilot needs at least one executable wager mode.');
  const rounds = Math.max(5000, Math.floor(cleanNumber(options.rounds, 50000)));
  const seed = cleanNumber(options.seed, MATH_AUTOPILOT_SEED) >>> 0;
  const maxPasses = Math.min(5, Math.max(1, Math.floor(cleanNumber(options.maxPasses, 3))));
  const tolerance = Math.max(0.001, cleanNumber(options.tolerance, 0.005));
  const force = options.force === true;
  const currentStatus = getMathCalibrationStatus(project);
  if (!force && currentStatus.complete && currentStatus.calibration?.rounds >= rounds) {
    return { ...currentStatus.calibration, reused: true };
  }

  const profileSnapshot = modes.map(mode => JSON.parse(JSON.stringify(mode.profile || {})));
  try {
  const reports = [];
  for (const [index, mode] of modes.entries()) {
    mode.profile ||= {};
    const field = factorField(mode);
    const startingFactor = Math.max(0.000001, cleanNumber(mode.profile[field], 1));
    const hintedFactor = cleanNumber(BLUEPRINT_FACTOR_HINTS[project.blueprint?.id]?.[mode.name], 0);
    let factor = hintedFactor > 0 && !currentStatus.exists ? hintedFactor : startingFactor;
    let result = null;
    const passes = [];
    const declaredRtp = cleanNumber(mode.rtp, cleanNumber(project.math?.rtp));
    const expectedWincapRtp = maximumWinRtpForMode(project.math, mode);
    const calibrationTarget = Math.max(0.000001, declaredRtp - expectedWincapRtp);
    const selectedSeed = modeSeed(seed, index);
    const separateMaxCriterion = project.math?.maxWinCalibrationPolicy === 'separate-criterion-v1';

    for (let pass = 0; pass < maxPasses; pass++) {
      mode.profile[field] = factor;
      result = simulateMathMode(project, mode.name, {
        rounds,
        seed: selectedSeed,
        includeAllocatedMax: !separateMaxCriterion,
      });
      passes.push({ pass: pass + 1, factor, realizedRtp: result.realizedRtp, standardError: result.standardError });
      // Calibration is deterministic for a fixed seed. Statistical uncertainty is
      // useful evidence, but it must not let a volatile mode finish several RTP
      // points away from its executable target.
      if (Math.abs(result.realizedRtp - calibrationTarget) <= tolerance) break;
      if (!(result.realizedRtp > 0)) throw new Error(`${mode.name} produced zero simulated return; its paytable cannot be scaled to the declared RTP.`);
      if (pass < maxPasses - 1) {
        factor = Math.min(10000, Math.max(0.000001, factor * calibrationTarget / result.realizedRtp));
      }
    }

    mode.profile[field] = factor;
    const allowedDelta = Math.max(tolerance, 1.96 * result.standardError);
    const calibrationDelta = result.realizedRtp - calibrationTarget;
    const aligned = Math.abs(calibrationDelta) <= tolerance;
    if (!aligned) {
      throw new Error(`${mode.name} remains ${(Math.abs(calibrationDelta) * 100).toFixed(3)} RTP points from its normal-return target after ${maxPasses} calibration passes.`);
    }
    if (result.invalidPayouts > 0) {
      throw new Error(`${mode.name} produced ${result.invalidPayouts.toLocaleString()} payouts outside the 0.1x Stake increment after calibration.`);
    }
    reports.push({
      ...result,
      aligned,
      allowedDelta,
      calibrationTarget,
      calibrationDelta,
      factorField: field,
      startingFactor,
      hintedFactor: hintedFactor || null,
      calibratedFactor: factor,
      passes,
    });
  }

  project.math.calibration = {
    format: MATH_AUTOPILOT_FORMAT,
    version: 1,
    rounds,
    seed,
    tolerance,
    modes: reports,
    fingerprint: null,
    calibratedAt: new Date().toISOString(),
  };
  project.math.calibration.fingerprint = mathCalibrationFingerprint(project);
  project.build ||= {};
  project.build.mathPublish = {
    totalBooks: 0,
    modes: [],
    officialVerification: false,
    fullStreamIntegrity: false,
    contractFingerprint: null,
    invalidatedBy: `math-autopilot:${project.math.calibration.fingerprint}`,
  };
  project.production ||= {};
  project.production.qa ||= {};
  project.production.qa.gameCertification = null;
  project.production.qa.repairRun = null;
  return project.math.calibration;
  } catch (error) {
    modes.forEach((mode, index) => { mode.profile = profileSnapshot[index]; });
    throw error;
  }
}
