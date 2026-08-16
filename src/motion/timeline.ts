import { getEffect, type EffectId, type EasingId } from "./effects.js";
import { getStyle, type StyleId } from "./styles.js";
import {
  buildStaticRevealPipeline,
  buildTumblePipeline,
  type TumblePipeline,
  type TumbleStep,
} from "./tumble.js";

export interface EffectInstance {
  readonly effectId: EffectId;
  readonly startMs: number;
  readonly durationMs: number;
  readonly easing: EasingId;
  readonly staggerMs: number;
  readonly cells: readonly string[];
  readonly stepKind: TumbleStep["kind"] | "reveal" | "win";
  readonly depth: number;
}

export interface MotionTimeline {
  readonly styleId: StyleId;
  readonly catalogVersion: 1;
  readonly totalDurationMs: number;
  readonly effects: readonly EffectInstance[];
}

export interface PlanOptions {
  readonly styleId: StyleId;
  /** Cascade depth; 0 uses static reveal pipeline. */
  readonly cascadeDepth?: number;
  readonly cellsByDepth?: readonly (readonly string[])[];
  /** Cells to highlight on win phase. */
  readonly winCells?: readonly string[];
  /** Skip initial reveal effects (resume mid-round). */
  readonly skipReveal?: boolean;
  /** Skip terminal win effects. */
  readonly skipWin?: boolean;
}

function appendEffects(
  target: EffectInstance[],
  effectIds: readonly EffectId[],
  startMs: number,
  cells: readonly string[],
  stepKind: EffectInstance["stepKind"],
  depth: number,
): number {
  let t = startMs;
  for (const effectId of effectIds) {
    const def = getEffect(effectId);
    target.push({
      effectId,
      startMs: t,
      durationMs: def.defaultDurationMs,
      easing: def.defaultEasing,
      staggerMs: def.defaultStaggerMs,
      cells,
      stepKind,
      depth,
    });
    const staggerSpan =
      cells.length > 1 ? def.defaultStaggerMs * (cells.length - 1) : 0;
    t += def.defaultDurationMs + staggerSpan;
  }
  return t;
}

function pipelineFor(options: PlanOptions): TumblePipeline {
  const depth = options.cascadeDepth ?? 0;
  if (depth <= 0) return buildStaticRevealPipeline();
  return buildTumblePipeline(depth, options.cellsByDepth ?? []);
}

/**
 * Plan a deterministic motion timeline for a chosen style.
 * Renderers play `effects` in order using startMs/durationMs only.
 */
export function planMotionTimeline(options: PlanOptions): MotionTimeline {
  const style = getStyle(options.styleId);
  const effects: EffectInstance[] = [];
  let cursor = 0;

  if (!options.skipReveal) {
    cursor = appendEffects(
      effects,
      style.revealEffects,
      cursor,
      [],
      "reveal",
      0,
    );
  }

  const pipeline = pipelineFor(options);
  for (const step of pipeline.steps) {
    const mapped = style.tumbleEffects[step.kind] ?? [];
    cursor = appendEffects(
      effects,
      mapped,
      cursor,
      step.cells,
      step.kind,
      step.depth,
    );
  }

  if (!options.skipWin) {
    cursor = appendEffects(
      effects,
      style.winEffects,
      cursor,
      options.winCells ?? [],
      "win",
      pipeline.maxDepth,
    );
  }

  const totalDurationMs =
    effects.length === 0
      ? 0
      : Math.max(
          ...effects.map((e) => {
            const staggerSpan =
              e.cells.length > 1 ? e.staggerMs * (e.cells.length - 1) : 0;
            return e.startMs + e.durationMs + staggerSpan;
          }),
        );

  return {
    styleId: options.styleId,
    catalogVersion: 1,
    totalDurationMs,
    effects,
  };
}
