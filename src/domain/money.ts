const RGS_UNITS_PER_WHOLE = 1_000_000;

declare const rgsAmountBrand: unique symbol;

/** A non-negative monetary value represented in authoritative integer RGS units. */
export type RgsAmount = number & { readonly [rgsAmountBrand]: true };

export class InvalidRgsAmountError extends RangeError {
  readonly value: unknown;

  constructor(value: unknown) {
    super(
      `Expected a non-negative safe integer RGS amount, received ${String(value)}`,
    );
    this.name = "InvalidRgsAmountError";
    this.value = value;
  }
}

export function rgsAmount(value: number): RgsAmount {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidRgsAmountError(value);
  }

  return value as RgsAmount;
}

export function isRgsAmount(value: unknown): value is RgsAmount {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Presentation-only conversion. Never use the result for wallet calculations. */
export function toDisplayUnits(value: RgsAmount): number {
  return value / RGS_UNITS_PER_WHOLE;
}

export { RGS_UNITS_PER_WHOLE };
