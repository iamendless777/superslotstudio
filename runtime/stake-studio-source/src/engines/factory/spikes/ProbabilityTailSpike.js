import { SeededRNG } from '../../math/SeededRNG.js';

export const PROBABILITY_TAIL_SPIKE_FORMAT = 'stake-studio-probability-tail-spike-v1';
export const BOOK_AMOUNT_MULTIPLIER = 100;

export const OFFICIAL_THREE_STAR_TAIL_LIMITS = Object.freeze({
  probabilityAtLeast5000: 1e-2,
  probabilityAtLeast10000: 0.5e-2,
  expectedTailLossAt40Bets: 0.9,
  expectedTailLossAt10000: 0.8,
  cvarUpperPointOnePercent: 800,
});

export const OFFICIAL_THREE_STAR_APPROVAL_PROFILE = Object.freeze({
  maxPayoutMultiplier: 100_000,
  maxTotalExposureUsd: 50_000_000,
});

export const OFFICIAL_PROBABILITY_TAIL_FORMULAS = Object.freeze({
  bookPayout: 'payoutMultiplier / 100',
  rtp: 'sum(bookPayout * weight) / sum(weight) / costMultiplier',
  maximumHitRate: 'sum(weight) / sum(maximumOutcomeWeight)',
  totalExposureUsd: 'maximumPayoutMultiplier * baseBetUsd',
  maximumBaseBetUsd: 'maxTotalExposureUsd / maximumPayoutMultiplier',
  expectedTailLossAt40Bets: 'sum(bookPayout * probability where bookPayout >= 40 * costMultiplier)',
  expectedTailLossAt10000: 'sum(bookPayout * probability where bookPayout >= 10000)',
  cvarUpperPointOnePercent: 'bucketInclusiveCVaR(0.999) / costMultiplier',
});

const clone = value => JSON.parse(JSON.stringify(value));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedOutcome(outcome = {}) {
  const payoutMultiplier = Math.max(0, Math.round(finite(outcome.payoutMultiplier)));
  const weight = Math.max(0, finite(outcome.weight, 1));
  const eventFeature = (outcome.events || []).some(event => event?.type === 'freeSpinTrigger');
  return {
    payoutMultiplier,
    weight,
    featureTriggered: outcome.featureTriggered === undefined
      ? outcome.criteria === 'freegame' || eventFeature
      : Boolean(outcome.featureTriggered),
    maxTriggered: Boolean(outcome.maxTriggered
      ?? (outcome.events || []).some(event => ['maxDream', 'wincap'].includes(event?.type))),
  };
}

function probabilityScale(cost) {
  if (cost >= 1000) return 0.2;
  if (cost >= 500) return 0.5;
  if (cost >= 200) return 0.8;
  return 1;
}

function distributionFromOutcomes(outcomes) {
  const distribution = new Map();
  for (const outcome of outcomes.map(normalizedOutcome)) {
    if (!(outcome.weight > 0)) continue;
    const payout = outcome.payoutMultiplier / BOOK_AMOUNT_MULTIPLIER;
    distribution.set(payout, (distribution.get(payout) || 0) + outcome.weight);
  }
  return distribution;
}

/** Exact bucket-inclusive upper-tail CVaR used by math-sdk. */
export function conditionalValueAtRisk(cutoff, distribution, totalWeight = null) {
  const ordered = [...distribution.entries()].sort((left, right) => left[0] - right[0]);
  const total = totalWeight ?? ordered.reduce((sum, [, weight]) => sum + weight, 0);
  if (!(total > 0) || ordered.length === 0) return 0;
  let cumulative = 0;
  let tailStart = ordered[0][0];
  for (const [payout, weight] of ordered) {
    cumulative += weight / total;
    if (cumulative >= cutoff) {
      tailStart = payout;
      break;
    }
  }
  let tailProbability = 0;
  let tailValue = 0;
  for (const [payout, weight] of ordered) {
    if (payout < tailStart) continue;
    const probability = weight / total;
    tailProbability += probability;
    tailValue += probability * payout;
  }
  return tailProbability > 0 ? tailValue / tailProbability : 0;
}

export function auditThreeStarApprovalProfile(input = {}) {
  const profile = { ...OFFICIAL_THREE_STAR_APPROVAL_PROFILE, ...(input.profile || {}) };
  const maximumPayoutMultiplier = Math.max(0, finite(input.maximumPayoutMultiplier));
  const baseBetUsd = Math.max(0, finite(input.baseBetUsd));
  const totalExposureUsd = maximumPayoutMultiplier * baseBetUsd;
  const maximumBaseBetUsd = maximumPayoutMultiplier > 0
    ? profile.maxTotalExposureUsd / maximumPayoutMultiplier
    : Infinity;
  const checks = {
    maximumPayoutMultiplier: maximumPayoutMultiplier <= profile.maxPayoutMultiplier,
    totalExposureUsd: totalExposureUsd <= profile.maxTotalExposureUsd,
  };
  const report = {
    profile: 'official-three-star',
    limits: profile,
    maximumPayoutMultiplier,
    baseBetUsd,
    totalExposureUsd,
    maximumBaseBetUsd,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
  return { ...report, evidenceHash: hashText(JSON.stringify(report)) };
}

export function auditProbabilityTailMode(input = {}, options = {}) {
  const name = String(input.name || '').trim();
  const cost = finite(input.cost, 1);
  assert(name, 'Probability/tail modes require a name.');
  assert(cost > 0, `Mode ${name} requires a positive cost multiplier.`);
  const outcomes = (input.outcomes || []).map(normalizedOutcome).filter(outcome => outcome.weight > 0);
  assert(outcomes.length > 0, `Mode ${name} requires at least one positive-weight outcome.`);
  const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
  const distribution = distributionFromOutcomes(outcomes);
  const weightedPayout = [...distribution.entries()]
    .reduce((sum, [payout, weight]) => sum + payout * weight, 0);
  const averagePayout = weightedPayout / totalWeight;
  const rtp = averagePayout / cost;
  const variance = [...distribution.entries()].reduce((sum, [payout, weight]) => (
    sum + ((payout - averagePayout) ** 2) * (weight / totalWeight)
  ), 0);
  const featureWeight = outcomes.reduce((sum, outcome) => sum + (outcome.featureTriggered ? outcome.weight : 0), 0);
  const maximumWin = Math.max(0, finite(input.maximumWin ?? options.maximumWin));
  const maximumWeight = outcomes.reduce((sum, outcome) => {
    const payout = outcome.payoutMultiplier / BOOK_AMOUNT_MULTIPLIER;
    return sum + ((outcome.maxTriggered || (maximumWin > 0 && payout >= maximumWin)) ? outcome.weight : 0);
  }, 0);
  let probabilityAtLeast5000 = 0;
  let probabilityAtLeast10000 = 0;
  let expectedTailLossAt40Bets = 0;
  let expectedTailLossAt10000 = 0;
  for (const [payout, weight] of distribution.entries()) {
    const probability = weight / totalWeight;
    if (payout >= 5000) probabilityAtLeast5000 += probability;
    if (payout >= 10000) {
      probabilityAtLeast10000 += probability;
      expectedTailLossAt10000 += payout * probability;
    }
    if (payout >= 40 * cost) expectedTailLossAt40Bets += payout * probability;
  }
  const scale = probabilityScale(cost);
  probabilityAtLeast5000 *= scale;
  probabilityAtLeast10000 *= scale;
  const cvarUpperPointOnePercent = conditionalValueAtRisk(0.999, distribution, totalWeight) / cost;
  const targetRtp = input.targetRtp == null ? options.targetRtp : finite(input.targetRtp);
  const rtpTolerance = Math.max(0, finite(input.rtpTolerance ?? options.rtpTolerance, 0.005));
  const limits = { ...OFFICIAL_THREE_STAR_TAIL_LIMITS, ...(options.tailLimits || {}), ...(input.tailLimits || {}) };
  const maxReachabilityOdds = Math.max(1, finite(input.maxReachabilityOdds ?? options.maxReachabilityOdds, 10_000_000));
  const maximumHitRate = maximumWeight > 0 ? totalWeight / maximumWeight : Infinity;
  const approval = auditThreeStarApprovalProfile({
    maximumPayoutMultiplier: maximumWin,
    baseBetUsd: input.baseBetUsd ?? options.baseBetUsd ?? 0,
    profile: input.approvalProfile ?? options.approvalProfile,
  });
  const checks = {
    rtp: targetRtp == null || Math.abs(rtp - targetRtp) <= rtpTolerance,
    maximumReachable: maximumWin <= 0 || (maximumWeight > 0 && maximumHitRate <= maxReachabilityOdds),
    probabilityAtLeast5000: probabilityAtLeast5000 <= limits.probabilityAtLeast5000,
    probabilityAtLeast10000: probabilityAtLeast10000 <= limits.probabilityAtLeast10000,
    expectedTailLossAt40Bets: expectedTailLossAt40Bets <= limits.expectedTailLossAt40Bets,
    expectedTailLossAt10000: expectedTailLossAt10000 <= limits.expectedTailLossAt10000,
    cvarUpperPointOnePercent: cvarUpperPointOnePercent <= limits.cvarUpperPointOnePercent,
    approvalProfile: approval.passed,
  };
  const report = {
    name,
    cost,
    totalWeight,
    outcomes: outcomes.length,
    targetRtp,
    rtpTolerance,
    rtp,
    averagePayout,
    standardDeviation: Math.sqrt(variance) / cost,
    featureProbability: featureWeight / totalWeight,
    maximumWin,
    maximumWeight,
    maximumHitRate,
    probabilityScale: scale,
    tails: {
      probabilityAtLeast5000,
      probabilityAtLeast10000,
      expectedTailLossAt40Bets,
      expectedTailLossAt10000,
      cvarUpperPointOnePercent,
    },
    formulas: OFFICIAL_PROBABILITY_TAIL_FORMULAS,
    approval,
    limits,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
  return { ...report, evidenceHash: hashText(JSON.stringify(report)) };
}

/** Audit already-generated Stake book/LUT-shaped outcome records. */
export function auditProbabilityTailRecords(input = {}) {
  const modes = (input.modes || []).map(mode => auditProbabilityTailMode(mode, input));
  assert(modes.length > 0, 'Probability/tail audit requires at least one mode.');
  const byName = Object.fromEntries(modes.map(mode => [mode.name, mode]));
  const base = byName[input.baseMode || 'base'];
  const enhancer = byName[input.enhancerMode || 'dream_enhancer'];
  const minimumRatio = finite(input.enhancerMinimumRatio, 5);
  const enhancerRatio = base && enhancer
    ? (base.featureProbability > 0
      ? enhancer.featureProbability / base.featureProbability
      : enhancer.featureProbability > 0 ? Infinity : 0)
    : null;
  const enhancerRatioPassed = enhancerRatio === null || enhancerRatio > minimumRatio;
  const report = {
    format: PROBABILITY_TAIL_SPIKE_FORMAT,
    source: input.source || 'weighted-records',
    seed: input.seed ?? null,
    rounds: input.rounds ?? null,
    baseMode: base?.name || null,
    enhancerMode: enhancer?.name || null,
    enhancerMinimumRatio: minimumRatio,
    enhancerRatio,
    enhancerRatioPassed,
    modes,
    passed: enhancerRatioPassed && modes.every(mode => mode.passed),
  };
  return { ...report, evidenceHash: hashText(JSON.stringify(report)) };
}

/**
 * Produce reusable seeded evidence from mode samplers, then apply the same
 * weighted audit used for final LUT records. Samplers return Stake book fields.
 */
export function runSeededProbabilityTailSpike(input = {}) {
  const seed = Number.isSafeInteger(Number(input.seed)) ? Number(input.seed) : 0x51A7E;
  const rounds = Math.max(1, Math.floor(finite(input.rounds, 100_000)));
  const modeInputs = input.modes || [];
  assert(modeInputs.length > 0, 'Seeded probability/tail spike requires at least one mode sampler.');
  const modes = modeInputs.map((mode, modeIndex) => {
    assert(typeof mode.sample === 'function', `Mode ${mode.name || modeIndex} requires a sample function.`);
    const rng = new SeededRNG((seed + Math.imul(modeIndex + 1, 0x9E3779B1)) >>> 0);
    const outcomes = [];
    for (let round = 0; round < rounds; round++) {
      outcomes.push({ weight: 1, ...mode.sample({
        mode: mode.name,
        round,
        random: () => rng.random(),
        rng,
      }) });
    }
    return { ...mode, sample: undefined, outcomes };
  });
  return auditProbabilityTailRecords({
    ...input,
    source: 'seeded-sampler',
    seed,
    rounds,
    modes,
  });
}

export function cloneProbabilityTailReport(report) {
  return clone(report);
}
