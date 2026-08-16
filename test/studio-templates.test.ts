import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateBlueprint } from "../src/studio/blueprint.js";
import { planFromBlueprint } from "../src/studio/pipeline.js";
import {
  listTemplateIds,
  loadTemplate,
} from "../src/studio/templates.js";

describe("studio templates", () => {
  for (const id of listTemplateIds()) {
    it(`${id} validates and locks a recommended style`, () => {
      const bp = loadTemplate(id);
      const validated = validateBlueprint(bp);
      assert.equal(validated.ok, true);
      const plan = planFromBlueprint(bp);
      assert.equal(plan.lockedStyleId, bp.styleId);
      assert.equal(plan.styleMatchesLocked, true);
      assert.ok(plan.timeline.effects.length > 0);
    });
  }

  it("cluster-hex plans multi-depth cascade effects", () => {
    const plan = planFromBlueprint(loadTemplate("cluster-hex"));
    assert.ok(plan.timeline.effects.some((e) => e.stepKind === "remove"));
    assert.ok(plan.timeline.effects.some((e) => e.stepKind === "fall"));
    assert.ok(plan.timeline.effects.some((e) => e.stepKind === "refill"));
  });
});
