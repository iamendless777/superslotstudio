import {
  MULTIPLIER_MICROS_PER_ONE,
  analyzeClassicNineBooks,
  formatRatioDecimal,
  multiplierMicros,
  type ClassicNineMathDefinition,
  type MultiplierMicros,
  type WeightedClassicNineGrid,
} from "./classic-nine.js";

export const RATE_MICROS_PER_ONE = 1_000_000;

declare const rateBrand: unique symbol;
export type RateMicros = number & { readonly [rateBrand]: true };

export function rateMicros(value: number): RateMicros {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > RATE_MICROS_PER_ONE
  ) {
    throw new RangeError("Rate must be an integer from 0 to 1,000,000");
  }
  return value as RateMicros;
}

export interface ClassicNineReviewCriteria {
  readonly definitionId: string;
  readonly returnRate: {
    readonly minimum: RateMicros;
    readonly maximum: RateMicros;
  };
  readonly hitRate: {
    readonly minimum: RateMicros;
    readonly maximum: RateMicros;
  };
  readonly maximumMultiplier: MultiplierMicros;
}

export interface ClassicNineCriterionResult {
  readonly id: "definition" | "return-rate" | "hit-rate" | "maximum-win";
  readonly passed: boolean;
  readonly actual: string;
  readonly expected: string;
}

export interface ClassicNineReviewResult {
  readonly schemaVersion: 1;
  readonly passed: boolean;
  readonly checks: readonly ClassicNineCriterionResult[];
}

function validateRange(
  name: string,
  range: { readonly minimum: RateMicros; readonly maximum: RateMicros },
): void {
  rateMicros(range.minimum);
  rateMicros(range.maximum);
  if (range.minimum > range.maximum) {
    throw new RangeError(`${name} minimum cannot exceed maximum`);
  }
}

function ratioWithinRange(
  numerator: bigint,
  denominator: bigint,
  minimum: RateMicros,
  maximum: RateMicros,
): boolean {
  const scale = BigInt(RATE_MICROS_PER_ONE);
  return (
    numerator * scale >= denominator * BigInt(minimum) &&
    numerator * scale <= denominator * BigInt(maximum)
  );
}

function formatRateRange(minimum: RateMicros, maximum: RateMicros): string {
  return `${formatRatioDecimal(BigInt(minimum), BigInt(RATE_MICROS_PER_ONE))}..${formatRatioDecimal(BigInt(maximum), BigInt(RATE_MICROS_PER_ONE))}`;
}

export function reviewClassicNineMath(
  definition: ClassicNineMathDefinition,
  books: readonly WeightedClassicNineGrid[],
  criteria: ClassicNineReviewCriteria,
): ClassicNineReviewResult {
  if (criteria.definitionId.length === 0) {
    throw new RangeError("Review criteria require a definition id");
  }
  validateRange("Return-rate", criteria.returnRate);
  validateRange("Hit-rate", criteria.hitRate);
  multiplierMicros(criteria.maximumMultiplier);

  const analysis = analyzeClassicNineBooks(definition, books);
  const checks: ClassicNineCriterionResult[] = [
    {
      id: "definition",
      passed: definition.id === criteria.definitionId,
      actual: definition.id,
      expected: criteria.definitionId,
    },
    {
      id: "return-rate",
      passed: ratioWithinRange(
        analysis.returnRatio.numerator,
        analysis.returnRatio.denominator,
        criteria.returnRate.minimum,
        criteria.returnRate.maximum,
      ),
      actual: formatRatioDecimal(
        analysis.returnRatio.numerator,
        analysis.returnRatio.denominator,
      ),
      expected: formatRateRange(
        criteria.returnRate.minimum,
        criteria.returnRate.maximum,
      ),
    },
    {
      id: "hit-rate",
      passed: ratioWithinRange(
        analysis.hitRatio.numerator,
        analysis.hitRatio.denominator,
        criteria.hitRate.minimum,
        criteria.hitRate.maximum,
      ),
      actual: formatRatioDecimal(
        analysis.hitRatio.numerator,
        analysis.hitRatio.denominator,
      ),
      expected: formatRateRange(
        criteria.hitRate.minimum,
        criteria.hitRate.maximum,
      ),
    },
    {
      id: "maximum-win",
      passed: analysis.maximumMultiplier <= criteria.maximumMultiplier,
      actual: analysis.maximumMultiplier.toString(),
      expected: `<=${criteria.maximumMultiplier}`,
    },
  ];
  return {
    schemaVersion: 1,
    passed: checks.every((check) => check.passed),
    checks,
  };
}

export const EXAMPLE_REVIEW_CRITERIA: ClassicNineReviewCriteria = {
  definitionId: "example-only-not-approved",
  returnRate: { minimum: rateMicros(0), maximum: rateMicros(1_000_000) },
  hitRate: { minimum: rateMicros(0), maximum: rateMicros(1_000_000) },
  maximumMultiplier: multiplierMicros(25 * MULTIPLIER_MICROS_PER_ONE),
};
