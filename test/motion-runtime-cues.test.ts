import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planMotionTimeline } from "../src/motion/timeline.js";
import {
  EFFECT_TO_RUNTIME_CUE,
  listRuntimeCueNames,
  timelineToRuntimeCues,
} from "../src/motion/runtime-cues.js";
import { createCuePlayer } from "../src/motion/player.js";
import { listEffectIds } from "../src/motion/effects.js";

describe("runtime cues", () => {
  it("maps every catalog effect to a runtime cue", () => {
    for (const id of listEffectIds()) {
      assert.ok(EFFECT_TO_RUNTIME_CUE[id], `missing cue for ${id}`);
    }
    assert.ok(listRuntimeCueNames().length >= 10);
  });

  it("converts a cluster timeline into ordered cues", () => {
    const timeline = planMotionTimeline({
      styleId: "cluster-snap",
      cascadeDepth: 2,
      winCells: ["0:0"],
    });
    const sheet = timelineToRuntimeCues(timeline);
    assert.equal(sheet.styleId, "cluster-snap");
    assert.ok(sheet.cues.some((c) => c.cue === "cluster.remove"));
    assert.ok(sheet.cues.some((c) => c.cue === "cluster.fall"));
    assert.ok(sheet.cues.some((c) => c.cue === "win.pulse"));
  });

  it("plays cues in time order without double-firing", () => {
    const sheet = timelineToRuntimeCues(
      planMotionTimeline({ styleId: "classic-lines", winCells: ["0:0"] }),
    );
    const starts: string[] = [];
    const player = createCuePlayer(sheet, {
      onCueStart: (cue) => starts.push(cue.cue),
    });
    let t = 0;
    while (player.tick(t)) t += 50;
    assert.ok(starts.includes("reel.blur"));
    assert.ok(starts.includes("reel.stop"));
    assert.ok(player.isComplete());
    const again = starts.length;
    player.tick(sheet.totalDurationMs + 1000);
    assert.equal(starts.length, again);
  });
});
