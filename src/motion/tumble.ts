/** Style-agnostic tumble / cascade step vocabulary. */

export type TumbleStepKind =
  | "remove"
  | "fall"
  | "refill"
  | "settle"
  | "evaluate";

export interface TumbleStep {
  readonly kind: TumbleStepKind;
  /** Zero-based cascade depth; 0 is the first tumble after the initial board. */
  readonly depth: number;
  /** Optional cell keys "column:row" the step targets. Empty means whole grid. */
  readonly cells: readonly string[];
}

export interface TumblePipeline {
  readonly steps: readonly TumbleStep[];
  readonly maxDepth: number;
}

/**
 * Builds a canonical tumble pipeline from cascade depth and optional per-depth
 * cell sets. Styles only map these steps to effects; they do not invent steps.
 */
export function buildTumblePipeline(
  cascadeDepth: number,
  cellsByDepth: readonly (readonly string[])[] = [],
): TumblePipeline {
  if (!Number.isInteger(cascadeDepth) || cascadeDepth < 0) {
    throw new RangeError("cascadeDepth must be a non-negative integer");
  }
  const steps: TumbleStep[] = [];
  for (let depth = 0; depth < cascadeDepth; depth += 1) {
    const cells = cellsByDepth[depth] ?? [];
    steps.push({ kind: "remove", depth, cells });
    steps.push({ kind: "fall", depth, cells: [] });
    steps.push({ kind: "refill", depth, cells: [] });
    steps.push({ kind: "settle", depth, cells: [] });
    steps.push({ kind: "evaluate", depth, cells: [] });
  }
  return { steps, maxDepth: cascadeDepth };
}

/** Minimal non-tumble pipeline: settle then evaluate once (lines / ways). */
export function buildStaticRevealPipeline(): TumblePipeline {
  return {
    steps: [
      { kind: "settle", depth: 0, cells: [] },
      { kind: "evaluate", depth: 0, cells: [] },
    ],
    maxDepth: 0,
  };
}
