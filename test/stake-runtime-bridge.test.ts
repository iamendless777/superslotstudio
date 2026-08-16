import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listRuntimeCueNames } from "../src/motion/runtime-cues.js";
import {
  CUE_BRIDGE,
  dispatchCueToStakeHost,
  resolveCueBridge,
} from "../src/studio/stake-runtime-bridge.js";
import { planFromBlueprint } from "../src/studio/pipeline.js";
import { loadTemplate } from "../src/studio/templates.js";

describe("stake runtime bridge", () => {
  it("defines a target for every runtime cue name", () => {
    for (const name of listRuntimeCueNames()) {
      assert.equal(resolveCueBridge(name).cue, name);
      assert.ok(CUE_BRIDGE[name]);
    }
  });

  it("dispatches cluster cues to tumble actions", () => {
    const plan = planFromBlueprint(loadTemplate("cluster-hex"));
    const tumble: string[] = [];
    const anim: string[] = [];
    for (const cue of plan.cueSheet.cues) {
      dispatchCueToStakeHost(cue, {
        onTumbleAction: (action) => tumble.push(action),
        onAnimState: (state) => anim.push(state),
      });
    }
    assert.ok(tumble.includes("clear-tile"));
    assert.ok(tumble.includes("travel-to-destination"));
    assert.ok(tumble.includes("settle-at-destination"));
  });
});
