#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classicNineBlueprint,
  missingArt,
  validateBlueprint,
} from "../../src/studio/blueprint.js";
import { planFromBlueprint } from "../../src/studio/pipeline.js";
import { buildArtBrief } from "../../src/studio/art-brief.js";
import {
  buildMotionFixture,
  writeMotionFixtures,
} from "../../src/studio/motion-fixture.js";
import {
  listTemplateIds,
  loadTemplate,
  type TemplateId,
} from "../../src/studio/templates.js";
import { listStyleIds } from "../../src/motion/styles.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function usage(): never {
  console.error(`Usage:
  studio templates
  studio styles
  studio assess [templateId]
  studio plan [templateId]
  studio cues [templateId|--all] [--quiet]
  studio art-gap [templateId]
  studio art-brief [templateId]
  studio dump [templateId]

Templates: ${listTemplateIds().join(", ")}
cues writes runtime/.../public/motion-fixtures/<id>.json
`);
  process.exit(1);
}

function resolveBlueprint(templateId: string | undefined) {
  if (!templateId) return classicNineBlueprint();
  if (!(listTemplateIds() as readonly string[]).includes(templateId)) {
    console.error(`Unknown template: ${templateId}`);
    usage();
  }
  return loadTemplate(templateId as TemplateId);
}

function printCueSheet(id: TemplateId, writtenPath?: string): void {
  const bp = loadTemplate(id);
  const sheet = buildMotionFixture(id);
  console.log(
    JSON.stringify(
      {
        gameId: bp.gameId,
        styleId: sheet.styleId,
        totalDurationMs: sheet.totalDurationMs,
        requiredCues: [...new Set(sheet.cues.map((cue) => cue.cue))],
        written: writtenPath ?? null,
        cues: sheet.cues,
      },
      null,
      2,
    ),
  );
}

function main(): void {
  const argv = process.argv.slice(2);
  const quiet = argv.includes("--quiet");
  const [command, arg] = argv.filter((value) => value !== "--quiet");
  if (!command) usage();

  switch (command) {
    case "templates": {
      for (const id of listTemplateIds()) {
        const bp = loadTemplate(id);
        console.log(
          `${id}\t${bp.title}\t${bp.winType}\t${bp.styleId}\t${bp.grid.columns}x${bp.grid.rows}`,
        );
      }
      return;
    }
    case "styles": {
      for (const id of listStyleIds()) console.log(id);
      return;
    }
    case "assess": {
      const bp = resolveBlueprint(arg);
      const plan = planFromBlueprint(bp);
      console.log(
        JSON.stringify(
          {
            gameId: bp.gameId,
            lockedStyleId: plan.lockedStyleId,
            styleMatchesLocked: plan.styleMatchesLocked,
            recommended: plan.assessment.recommended,
            matches: plan.assessment.matches.map((m) => ({
              styleId: m.styleId,
              score: m.score,
              mismatches: m.mismatches,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    case "plan": {
      const bp = resolveBlueprint(arg);
      const plan = planFromBlueprint(bp);
      console.log(
        JSON.stringify(
          {
            gameId: bp.gameId,
            styleId: plan.lockedStyleId,
            totalDurationMs: plan.timeline.totalDurationMs,
            effectCount: plan.timeline.effects.length,
            effects: plan.timeline.effects.map((e) => ({
              effectId: e.effectId,
              startMs: e.startMs,
              durationMs: e.durationMs,
              stepKind: e.stepKind,
              depth: e.depth,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    case "cues": {
      const ids: TemplateId[] =
        arg === "--all" || arg === "all" || arg === undefined
          ? [...listTemplateIds()]
          : [arg as TemplateId];
      const first = ids[0];
      if (
        ids.length === 1 &&
        first &&
        !(listTemplateIds() as readonly string[]).includes(first)
      ) {
        console.error(`Unknown template: ${first}`);
        usage();
      }
      const result = writeMotionFixtures(repoRoot, ids);
      if (!quiet) {
        for (const id of ids) {
          const path = result.written.find((item) => item.endsWith(`${id}.json`));
          printCueSheet(id, path);
        }
      }
      console.error(
        `[motion-fixtures] ${result.written.length} sheets + index → ${result.dir}`,
      );
      return;
    }
    case "art-gap": {
      const bp = resolveBlueprint(arg);
      const gap = missingArt(bp);
      console.log(
        JSON.stringify(
          {
            gameId: bp.gameId,
            missing: gap,
            complete: gap.length === 0,
          },
          null,
          2,
        ),
      );
      return;
    }
    case "art-brief": {
      const bp = resolveBlueprint(arg);
      console.log(JSON.stringify(buildArtBrief(bp), null, 2));
      return;
    }
    case "dump": {
      const bp = resolveBlueprint(arg);
      const result = validateBlueprint(bp);
      if (!result.ok) {
        console.error(JSON.stringify(result.issues, null, 2));
        process.exit(1);
      }
      console.log(JSON.stringify(result.blueprint, null, 2));
      return;
    }
    default:
      usage();
  }
}

main();
