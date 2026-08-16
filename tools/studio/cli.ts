#!/usr/bin/env node
import {
  classicNineBlueprint,
  missingArt,
  validateBlueprint,
} from "../../src/studio/blueprint.js";
import { planFromBlueprint } from "../../src/studio/pipeline.js";
import {
  listTemplateIds,
  loadTemplate,
  type TemplateId,
} from "../../src/studio/templates.js";
import { listStyleIds } from "../../src/motion/styles.js";

function usage(): never {
  console.error(`Usage:
  studio templates
  studio styles
  studio assess [templateId]
  studio plan [templateId]
  studio art-gap [templateId]
  studio dump [templateId]

Templates: ${listTemplateIds().join(", ")}
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

function main(): void {
  const [, , command, arg] = process.argv;
  if (!command) usage();

  switch (command) {
    case "templates": {
      for (const id of listTemplateIds()) {
        const bp = loadTemplate(id);
        console.log(`${id}\t${bp.title}\t${bp.winType}\t${bp.styleId}\t${bp.grid.columns}x${bp.grid.rows}`);
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
      console.log(JSON.stringify({
        gameId: bp.gameId,
        lockedStyleId: plan.lockedStyleId,
        styleMatchesLocked: plan.styleMatchesLocked,
        recommended: plan.assessment.recommended,
        matches: plan.assessment.matches.map((m) => ({
          styleId: m.styleId,
          score: m.score,
          mismatches: m.mismatches,
        })),
      }, null, 2));
      return;
    }
    case "plan": {
      const bp = resolveBlueprint(arg);
      const plan = planFromBlueprint(bp);
      console.log(JSON.stringify({
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
      }, null, 2));
      return;
    }
    case "art-gap": {
      const bp = resolveBlueprint(arg);
      const gap = missingArt(bp);
      console.log(JSON.stringify({
        gameId: bp.gameId,
        missing: gap,
        complete: gap.length === 0,
      }, null, 2));
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
