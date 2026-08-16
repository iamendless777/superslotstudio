import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planMotionTimeline } from "../src/motion/timeline.js";

describe("planMotionTimeline", () => {
  it("classic-lines has reveal + win effects and no cascade steps", () => {
    const timeline = planMotionTimeline({
      styleId: "classic-lines",
      cascadeDepth: 0,
      winCells: ["0:0", "1:0", "2:0"],
    });
    assert.ok(timeline.totalDurationMs > 0);
    assert.ok(timeline.effects.some((e) => e.stepKind === "reveal"));
    assert.ok(timeline.effects.some((e) => e.stepKind === "win"));
    assert.ok(!timeline.effects.some((e) => e.stepKind === "remove"));
  });

  it("cluster-snap expands remove/fall/refill per cascade depth", () => {
    const depth = 3;
    const timeline = planMotionTimeline({
      styleId: "cluster-snap",
      cascadeDepth: depth,
      cellsByDepth: [["0:0", "1:0"], ["2:2"], ["3:3", "4:4"]],
    });
    const removes = timeline.effects.filter((e) => e.stepKind === "remove");
    const falls = timeline.effects.filter((e) => e.stepKind === "fall");
    const refills = timeline.effects.filter((e) => e.stepKind === "refill");
    assert.ok(removes.length >= depth);
    assert.ok(falls.length >= depth);
    assert.ok(refills.length >= depth);
    assert.ok(timeline.totalDurationMs > 1000);
  });

  it("skipReveal produces shorter plan", () => {
    const full = planMotionTimeline({ styleId: "classic-lines" });
    const skipped = planMotionTimeline({
      styleId: "classic-lines",
      skipReveal: true,
    });
    assert.ok(skipped.totalDurationMs < full.totalDurationMs);
  });
});
