import { MORPHEUS_LUCID_WILD_VALUES } from './MorpheusGameContract.js';

export const MORPHEUS_LUCID_WEIGHT_POLICY_FORMAT = 'morpheus-lucid-weight-policy-v1';
export const MORPHEUS_LUCID_WEIGHT_DENOMINATOR = 10_000_000;

// Candidate weights preserve the saved branch's existing weighted means while
// making every approved value explicitly reachable. They remain candidates
// until generated-book reachability and final weighted-LUT tails pass.
export const MORPHEUS_LUCID_WEIGHT_CANDIDATE = Object.freeze({
  basegame: Object.freeze({
    2: 2_444_200, 3: 6_387_200, 5: 1_000_000, 7: 100_000,
    10: 50_000, 25: 10_000, 50: 5_000, 100: 2_000,
    200: 1_000, 500: 500, 1000: 100,
  }),
  freegame: Object.freeze({
    2: 4_587_500, 3: 1_275_000, 5: 2_000_000, 7: 1_000_000,
    10: 1_000_000, 25: 100_000, 50: 20_000, 100: 10_000,
    200: 5_000, 500: 2_000, 1000: 500,
  }),
});

const sum = values => values.reduce((total, value) => total + value, 0);

function auditContext(context, weights, expectedMean) {
  const entries = MORPHEUS_LUCID_WILD_VALUES.map(value => [value, Number(weights?.[value]) || 0]);
  const totalWeight = sum(entries.map(([, weight]) => weight));
  const weightedMean = totalWeight > 0
    ? sum(entries.map(([value, weight]) => value * weight)) / totalWeight
    : 0;
  const probability = minimum => totalWeight > 0
    ? sum(entries.filter(([value]) => value >= minimum).map(([, weight]) => weight)) / totalWeight
    : 0;
  const missing = entries.filter(([, weight]) => !Number.isSafeInteger(weight) || weight <= 0).map(([value]) => value);
  const issues = [];
  if (totalWeight !== MORPHEUS_LUCID_WEIGHT_DENOMINATOR) issues.push(`${context} total weight must be exactly 10,000,000.`);
  if (missing.length) issues.push(`${context} missing positive integer weights for ${missing.join(', ')}.`);
  if (Math.abs(weightedMean - expectedMean) > 1e-12) issues.push(`${context} weighted mean must remain exactly ${expectedMean}x.`);
  return {
    context,
    totalWeight,
    weightedMean,
    probabilities: {
      atLeast25: probability(25),
      atLeast100: probability(100),
      atLeast500: probability(500),
      exactly1000: totalWeight > 0 ? (Number(weights?.[1000]) || 0) / totalWeight : 0,
    },
    missing,
    issues,
    passed: issues.length === 0,
  };
}

export function auditMorpheusLucidWeightPolicy(weights = MORPHEUS_LUCID_WEIGHT_CANDIDATE) {
  const contexts = {
    basegame: auditContext('basegame', weights.basegame, 3.15),
    freegame: auditContext('freegame', weights.freegame, 4.7),
  };
  const issues = Object.values(contexts).flatMap(context => context.issues);
  return {
    format: MORPHEUS_LUCID_WEIGHT_POLICY_FORMAT,
    denominator: MORPHEUS_LUCID_WEIGHT_DENOMINATOR,
    status: 'candidate-generation-diversity-audited',
    contexts,
    issues,
    passed: issues.length === 0,
  };
}

export function applyMorpheusLucidWeightCandidate(project = {}) {
  const next = structuredClone(project);
  next.math ||= {};
  next.math.mechanicConfig ||= {};
  next.math.mechanicConfig.multiplierSymbols ||= {};
  next.math.mechanicConfig.multiplierSymbols.values = structuredClone(MORPHEUS_LUCID_WEIGHT_CANDIDATE);
  next.math.mechanicConfig.multiplierSymbols.approvedValueLadder = [...MORPHEUS_LUCID_WILD_VALUES];
  next.math.mechanicConfig.multiplierSymbols.valueWeightStatus = 'candidate-generation-diversity-audited';
  next.math.mechanicConfig.multiplierSymbols.unweightedApprovedValues = [];
  next.math.mechanicConfig.multiplierSymbols.weightPolicy = auditMorpheusLucidWeightPolicy();
  return next;
}
