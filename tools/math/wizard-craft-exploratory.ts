/**
 * Seeded WIZARD CRAFT mechanic explorer.
 *
 * This intentionally does not calculate wins, RTP, volatility, or cap
 * attainability. Those require official-SDK reel strips and a frozen paytable.
 */

export type WizardCraftExploratoryMode =
  | "baseBattle"
  | "runeSpark"
  | "siegeSigns"
  | "openGrimoire";

export type WizardCraftExploratoryTier = 1 | 2 | 3;

interface ModeAssumptions {
  readonly cost: number;
  readonly bonusProbability: number;
  readonly tierWeights: readonly [number, number, number];
  readonly baseVsProbabilityPerReel: number;
}

export const WIZARD_CRAFT_EXPLORATORY_ASSUMPTIONS = {
  baseBattle: {
    cost: 1,
    bonusProbability: 1 / 180,
    tierWeights: [0.8, 0.17, 0.03],
    baseVsProbabilityPerReel: 0.055,
  },
  runeSpark: {
    cost: 3,
    bonusProbability: 1 / 90,
    tierWeights: [0.75, 0.2, 0.05],
    baseVsProbabilityPerReel: 0.06,
  },
  siegeSigns: {
    cost: 10,
    bonusProbability: 1 / 45,
    tierWeights: [0.68, 0.24, 0.08],
    baseVsProbabilityPerReel: 0.065,
  },
  openGrimoire: {
    cost: 100,
    bonusProbability: 1,
    tierWeights: [0.55, 0.3, 0.15],
    baseVsProbabilityPerReel: 0,
  },
} as const satisfies Record<WizardCraftExploratoryMode, ModeAssumptions>;

const TIER_SPINS = { 1: 8, 2: 10, 3: 12 } as const;
const MULTIPLIERS = [2, 3, 4, 5, 7, 10, 15, 20, 25, 50] as const;
const MULTIPLIER_WEIGHTS = [30, 24, 17, 11, 7, 5, 3, 1.5, 1, 0.5] as const;

export interface WizardCraftExploratoryReport {
  readonly schemaVersion: 1;
  readonly approvalClaim: false;
  readonly payoutMathIncluded: false;
  readonly seed: number;
  readonly roundsPerMode: number;
  readonly modes: Readonly<Record<WizardCraftExploratoryMode, {
    readonly cost: number;
    readonly rounds: number;
    readonly bonusRounds: number;
    readonly bonusRate: number;
    readonly tierCounts: Readonly<Partial<Record<WizardCraftExploratoryTier, number>>>;
    readonly baseVsReelCount: Readonly<Record<number, number>>;
    readonly featureVsReelCount: Readonly<Record<number, number>>;
    readonly finalStickyCount: Readonly<Record<number, number>>;
    readonly finalStickyCountByTier: Readonly<
      Partial<Record<WizardCraftExploratoryTier, Readonly<Record<number, number>>>>
    >;
    readonly firstStickySpin: Readonly<Record<number, number>>;
    readonly firstStickyReel: Readonly<Record<number, number>>;
    readonly upgrades: Readonly<Record<number, number>>;
    readonly maximumCombinedMultiplier: number;
    readonly tierThreeGuaranteeFailures: number;
  }>>;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function increment(counter: Record<number, number>, key: number): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function weightedIndex(random: () => number, weights: readonly number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    target -= weights[index]!;
    if (target < 0) return index;
  }
  return weights.length - 1;
}

function multiplier(random: () => number): number {
  return MULTIPLIERS[weightedIndex(random, MULTIPLIER_WEIGHTS)]!;
}

function tier(random: () => number, weights: readonly [number, number, number]): WizardCraftExploratoryTier {
  const selected = weightedIndex(random, weights);
  return (selected + 1) as WizardCraftExploratoryTier;
}

function sampleExpandedReels(random: () => number, probabilityPerReel: number): number[] {
  const reels: number[] = [];
  for (let reel = 0; reel < 5; reel += 1) {
    if (random() < probabilityPerReel) reels.push(reel);
  }
  return reels;
}

function simulateFeature(
  random: () => number,
  selectedTier: WizardCraftExploratoryTier,
): {
  vsReels: number;
  finalStickies: number;
  firstStickySpin: number;
  firstStickyReel: number;
  upgrades: number;
  maximumCombinedMultiplier: number;
  guaranteeFailed: boolean;
} {
  const sticky = new Map<number, number>();
  const guaranteedSpin = selectedTier === 3 ? 1 + Math.floor(random() * 3) : 0;
  const guaranteedReel = selectedTier === 3 ? Math.floor(random() * 5) : -1;
  let firstStickySpin = 0;
  let firstStickyReel = -1;
  let vsReels = 0;
  let upgrades = 0;
  let maximumCombinedMultiplier = 1;

  for (let spin = 1; spin <= TIER_SPINS[selectedTier]; spin += 1) {
    if (selectedTier === 3 && spin === guaranteedSpin && !sticky.has(guaranteedReel)) {
      sticky.set(guaranteedReel, multiplier(random));
      firstStickySpin = spin;
      firstStickyReel = guaranteedReel;
      vsReels += 1;
    }

    const stickyChance = selectedTier === 2 ? 0.018 : selectedTier === 3 ? 0.025 : 0;
    const temporaryChance = selectedTier === 1 ? 0.07 : 0.055;
    const temporaryValues: number[] = [];

    for (let reel = 0; reel < 5; reel += 1) {
      if (sticky.has(reel)) {
        const upgradeChance = selectedTier === 2 ? 0.05 : 0.07;
        if (random() < upgradeChance) {
          const previous = sticky.get(reel)!;
          const next = Math.max(previous, multiplier(random));
          if (next > previous) {
            sticky.set(reel, next);
            upgrades += 1;
          }
        }
      } else if (random() < stickyChance) {
        sticky.set(reel, multiplier(random));
        vsReels += 1;
        if (firstStickySpin === 0) {
          firstStickySpin = spin;
          firstStickyReel = reel;
        }
      } else if (random() < temporaryChance) {
        temporaryValues.push(multiplier(random));
        vsReels += 1;
      }
    }

    const combined = [
      ...sticky.values(),
      ...temporaryValues,
    ].reduce((sum, value) => sum + value, 0);
    maximumCombinedMultiplier = Math.max(maximumCombinedMultiplier, combined || 1);
  }

  return {
    vsReels,
    finalStickies: sticky.size,
    firstStickySpin,
    firstStickyReel,
    upgrades,
    maximumCombinedMultiplier,
    guaranteeFailed: selectedTier === 3 && (firstStickySpin === 0 || firstStickySpin > 3),
  };
}

export function exploreWizardCraft(
  roundsPerMode: number,
  seed = 0x57435f31,
): WizardCraftExploratoryReport {
  if (!Number.isSafeInteger(roundsPerMode) || roundsPerMode < 1) {
    throw new RangeError("roundsPerMode must be a positive safe integer");
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be a uint32");
  }

  const random = mulberry32(seed);
  const modes = {} as Record<
    WizardCraftExploratoryMode,
    WizardCraftExploratoryReport["modes"][WizardCraftExploratoryMode]
  >;

  for (const selectedMode of Object.keys(
    WIZARD_CRAFT_EXPLORATORY_ASSUMPTIONS,
  ) as WizardCraftExploratoryMode[]) {
    const assumptions = WIZARD_CRAFT_EXPLORATORY_ASSUMPTIONS[selectedMode];
    const tierCounts: Record<number, number> = {};
    const baseVsReelCount: Record<number, number> = {};
    const featureVsReelCount: Record<number, number> = {};
    const finalStickyCount: Record<number, number> = {};
    const finalStickyCountByTier: Partial<
      Record<WizardCraftExploratoryTier, Record<number, number>>
    > = {};
    const firstStickySpin: Record<number, number> = {};
    const firstStickyReel: Record<number, number> = {};
    const upgrades: Record<number, number> = {};
    let bonusRounds = 0;
    let maximumCombinedMultiplier = 1;
    let tierThreeGuaranteeFailures = 0;

    for (let round = 0; round < roundsPerMode; round += 1) {
      if (selectedMode !== "openGrimoire") {
        const expanded = sampleExpandedReels(random, assumptions.baseVsProbabilityPerReel);
        increment(baseVsReelCount, expanded.length);
        maximumCombinedMultiplier = Math.max(
          maximumCombinedMultiplier,
          expanded.reduce((sum) => sum + multiplier(random), 0) || 1,
        );
      }

      if (random() >= assumptions.bonusProbability) continue;
      bonusRounds += 1;
      const selectedTier = tier(random, assumptions.tierWeights);
      increment(tierCounts, selectedTier);
      const feature = simulateFeature(random, selectedTier);
      increment(featureVsReelCount, feature.vsReels);
      increment(finalStickyCount, feature.finalStickies);
      const tierStickies = finalStickyCountByTier[selectedTier] ?? {};
      increment(tierStickies, feature.finalStickies);
      finalStickyCountByTier[selectedTier] = tierStickies;
      increment(firstStickySpin, feature.firstStickySpin);
      increment(firstStickyReel, feature.firstStickyReel);
      increment(upgrades, feature.upgrades);
      maximumCombinedMultiplier = Math.max(
        maximumCombinedMultiplier,
        feature.maximumCombinedMultiplier,
      );
      tierThreeGuaranteeFailures += Number(feature.guaranteeFailed);
    }

    modes[selectedMode] = {
      cost: assumptions.cost,
      rounds: roundsPerMode,
      bonusRounds,
      bonusRate: bonusRounds / roundsPerMode,
      tierCounts,
      baseVsReelCount,
      featureVsReelCount,
      finalStickyCount,
      finalStickyCountByTier,
      firstStickySpin,
      firstStickyReel,
      upgrades,
      maximumCombinedMultiplier,
      tierThreeGuaranteeFailures,
    };
  }

  return {
    schemaVersion: 1,
    approvalClaim: false,
    payoutMathIncluded: false,
    seed,
    roundsPerMode,
    modes,
  };
}

const invokedDirectly = process.argv[1]?.endsWith("wizard-craft-exploratory.js");
if (invokedDirectly) {
  const rounds = Number(process.argv[2] ?? "250000");
  const seed = Number(process.argv[3] ?? "1464037169");
  process.stdout.write(`${JSON.stringify(exploreWizardCraft(rounds, seed), null, 2)}\n`);
}
