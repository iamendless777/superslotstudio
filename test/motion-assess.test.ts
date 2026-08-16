import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessGameShape,
  classicNineShape,
} from "../src/motion/assess.js";

describe("assessGameShape", () => {
  it("recommends classic-lines for Classic Nine shape", () => {
    const result = assessGameShape(classicNineShape());
    assert.ok(result.recommended.includes("classic-lines"));
    assert.equal(result.matches[0]?.styleId, "classic-lines");
  });

  it("recommends cluster styles for tumble cluster grids", () => {
    const result = assessGameShape({
      columns: 6,
      rows: 6,
      winType: "cluster",
      cascadeDepth: 4,
      hasStickyWilds: false,
      hasAnticipationMarkers: false,
      eventTypes: ["reveal", "tumble", "highlight"],
    });
    assert.ok(result.recommended.includes("cluster-snap"));
    assert.ok(result.recommended.includes("cluster-fluid"));
    assert.ok(!result.recommended.includes("classic-lines"));
  });

  it("flags sticky requirement against non-sticky styles", () => {
    const result = assessGameShape({
      columns: 5,
      rows: 3,
      winType: "lines",
      cascadeDepth: 0,
      hasStickyWilds: true,
      hasAnticipationMarkers: false,
      eventTypes: ["reveal", "highlight"],
    });
    assert.ok(result.recommended.includes("sticky-lock"));
    const classic = result.matches.find((m) => m.styleId === "classic-lines");
    assert.ok(classic);
    assert.ok(
      classic.mismatches.some((m) => m.includes("sticky")),
      "classic-lines should report sticky mismatch",
    );
  });
});
