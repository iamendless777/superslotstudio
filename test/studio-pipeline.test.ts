import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classicNineBlueprint,
  validateBlueprint,
  missingArt,
} from "../src/studio/blueprint.js";
import { planFromBlueprint } from "../src/studio/pipeline.js";

describe("blueprint + pipeline", () => {
  it("validates classic nine template", () => {
    const result = validateBlueprint(classicNineBlueprint());
    assert.equal(result.ok, true);
  });

  it("lists all symbols as missing art on the seed template", () => {
    const bp = classicNineBlueprint();
    assert.equal(missingArt(bp).length, bp.symbols.length);
  });

  it("plans a classic-lines timeline from the blueprint", () => {
    const plan = planFromBlueprint(classicNineBlueprint(), {
      winCells: ["0:0", "1:1", "2:2"],
    });
    assert.equal(plan.lockedStyleId, "classic-lines");
    assert.equal(plan.styleMatchesLocked, true);
    assert.ok(plan.timeline.effects.length > 0);
    assert.ok(plan.timeline.totalDurationMs > 0);
    assert.ok(plan.readyForMotionPreview);
    assert.ok(plan.readyForArtReview);
  });

  it("rejects invalid blueprint", () => {
    const result = validateBlueprint({ schemaVersion: 1, gameId: "" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.length > 0);
    }
  });
});
