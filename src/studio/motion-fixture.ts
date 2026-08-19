import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeCueName } from "../motion/runtime-cues.js";
import { planFromBlueprint } from "./pipeline.js";
import {
  listTemplateIds,
  loadTemplate,
  type TemplateId,
} from "./templates.js";

export const MOTION_FIXTURE_DIR =
  "runtime/stake-studio-source/public/motion-fixtures";

export interface MotionFixtureCue {
  readonly cue: RuntimeCueName;
  readonly startMs: number;
  readonly durationMs: number;
  readonly stepKind: string;
  readonly depth: number;
  readonly cells: readonly string[];
}

export interface MotionFixtureSheet {
  readonly styleId: string;
  readonly catalogVersion: 2;
  readonly templateId: TemplateId;
  readonly totalDurationMs: number;
  readonly cues: readonly MotionFixtureCue[];
}

export function rehearsalOptionsForTemplate(id: TemplateId) {
  switch (id) {
    case "cluster-hex":
      return {
        cascadeDepth: 2,
        cellsByDepth: [
          ["1:2", "2:2", "3:2"],
          ["2:1", "2:2"],
        ],
        winCells: [] as const,
        skipReveal: true,
        skipWin: true,
      };
    case "classic-nine":
      return { winCells: ["0:0", "1:0", "2:0"] as const };
    case "sticky-five":
      return { winCells: ["1:1", "2:1", "3:1"] as const };
    case "anticipation-five":
      return { winCells: ["0:0", "1:0", "2:0"] as const };
    default:
      return { winCells: ["0:0", "1:0", "2:0"] as const };
  }
}

/** Planned rehearsal sheet for Play Motion. Timing from the domain planner. */
export function buildMotionFixture(id: TemplateId): MotionFixtureSheet {
  const blueprint = loadTemplate(id);
  const plan = planFromBlueprint(blueprint, rehearsalOptionsForTemplate(id));
  return {
    styleId: plan.cueSheet.styleId,
    catalogVersion: 2,
    templateId: id,
    totalDurationMs: plan.cueSheet.totalDurationMs,
    cues: plan.cueSheet.cues.map((cue) => ({
      cue: cue.cue,
      startMs: cue.startMs,
      durationMs: cue.durationMs,
      stepKind: cue.stepKind,
      depth: cue.depth,
      cells: [...cue.cells],
    })),
  };
}

export function listMotionFixtureIds(): readonly TemplateId[] {
  return listTemplateIds();
}

export function fixtureKind(sheet: MotionFixtureSheet): "tumble" | "reel" {
  const tumble = sheet.cues.some(
    (cue) =>
      cue.cue === "cluster.remove" ||
      cue.cue === "symbol.pop" ||
      cue.cue === "symbol.fadeOut",
  );
  return tumble ? "tumble" : "reel";
}

export interface MotionFixtureIndexEntry {
  readonly id: TemplateId;
  readonly styleId: string;
  readonly kind: "tumble" | "reel";
  readonly totalDurationMs: number;
}

export interface MotionFixtureIndex {
  readonly catalogVersion: 2;
  readonly templates: readonly MotionFixtureIndexEntry[];
}

export function buildMotionFixtureIndex(
  ids: readonly TemplateId[] = listTemplateIds(),
): MotionFixtureIndex {
  return {
    catalogVersion: 2,
    templates: ids.map((id) => {
      const sheet = buildMotionFixture(id);
      return {
        id,
        styleId: sheet.styleId,
        kind: fixtureKind(sheet),
        totalDurationMs: sheet.totalDurationMs,
      };
    }),
  };
}

export function writeMotionFixtures(
  repoRoot: string,
  ids: readonly TemplateId[] = listTemplateIds(),
): { dir: string; written: readonly string[]; indexPath: string } {
  const dir = join(repoRoot, MOTION_FIXTURE_DIR);
  mkdirSync(dir, { recursive: true });
  const written = ids.map((id) => {
    const path = join(dir, `${id}.json`);
    writeFileSync(path, `${JSON.stringify(buildMotionFixture(id), null, 2)}\n`);
    return path;
  });
  const indexPath = join(dir, "index.json");
  writeFileSync(
    indexPath,
    `${JSON.stringify(buildMotionFixtureIndex(), null, 2)}\n`,
  );
  return { dir, written, indexPath };
}
