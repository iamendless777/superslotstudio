import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildArtBrief } from "../src/studio/art-brief.js";
import { planFromBlueprint } from "../src/studio/pipeline.js";
import { requiredCues, bindCueSheet } from "../src/studio/runtime-adapter.js";
import { loadTemplate } from "../src/studio/templates.js";

describe("art brief + runtime adapter", () => {
  it("lists missing art with role guidance", () => {
    const brief = buildArtBrief(loadTemplate("cluster-hex"));
    assert.equal(brief.gameId, "cluster-hex");
    assert.ok(brief.missingCount > 0);
    assert.ok(brief.slots.every((s) => s.guidance.length > 10));
    assert.ok(brief.slots.some((s) => s.status === "missing"));
  });

  it("bindCueSheet fires host playCue for planned cues", () => {
    const plan = planFromBlueprint(loadTemplate("classic-nine"), {
      winCells: ["0:0"],
    });
    const played: string[] = [];
    const playback = bindCueSheet(plan.cueSheet, {
      playCue: (c) => played.push(c.cue),
    });
    let t = 0;
    while (playback.tick(t)) t += 40;
    assert.ok(played.length > 0);
    assert.ok(requiredCues(plan.cueSheet).includes("reel.stop"));
  });
});
