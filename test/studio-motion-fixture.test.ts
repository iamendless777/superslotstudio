import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  MOTION_FIXTURE_DIR,
  buildMotionFixture,
  buildMotionFixtureIndex,
  fixtureKind,
  listMotionFixtureIds,
} from "../src/studio/motion-fixture.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureDir = join(repoRoot, MOTION_FIXTURE_DIR);

describe("motion fixtures", () => {
  it("every template produces a playable cue sheet", () => {
    for (const id of listMotionFixtureIds()) {
      const sheet = buildMotionFixture(id);
      assert.equal(sheet.templateId, id);
      assert.ok(sheet.cues.length > 0, id);
      assert.ok(sheet.totalDurationMs > 0, id);
    }
  });

  it("cluster-hex pop happens before remove, with explode cells", () => {
    const sheet = buildMotionFixture("cluster-hex");
    const depth0 = sheet.cues.filter((cue) => cue.depth === 0);
    const pop = depth0.findIndex((cue) => cue.cue === "symbol.pop");
    const remove = depth0.findIndex((cue) => cue.cue === "cluster.remove");
    assert.ok(pop >= 0);
    assert.ok(remove > pop);
    assert.deepEqual(depth0[pop]?.cells, ["1:2", "2:2", "3:2"]);
    assert.equal(
      sheet.cues.some((cue) => cue.cue === "win.pulse" || cue.cue === "board.shake"),
      false,
    );
  });

  it("anticipation-five includes reel.anticipation", () => {
    const sheet = buildMotionFixture("anticipation-five");
    assert.ok(sheet.cues.some((cue) => cue.cue === "reel.anticipation"));
    assert.ok(sheet.cues.some((cue) => cue.cue === "reel.stop"));
  });

  it("sticky-five includes sticky morph without cascade", () => {
    const sheet = buildMotionFixture("sticky-five");
    assert.ok(sheet.cues.some((cue) => cue.cue === "wild.stickyMorph"));
    assert.equal(sheet.cues.some((cue) => cue.cue === "cluster.remove"), false);
  });

  it("index lists tumble vs reel kinds for every template", () => {
    const index = buildMotionFixtureIndex();
    assert.equal(index.templates.length, listMotionFixtureIds().length);
    const byId = Object.fromEntries(index.templates.map((entry) => [entry.id, entry]));
    assert.equal(byId["cluster-hex"]?.kind, "tumble");
    assert.equal(byId["classic-nine"]?.kind, "reel");
    assert.equal(byId["sticky-five"]?.kind, "reel");
    assert.equal(byId["anticipation-five"]?.kind, "reel");
    assert.equal(fixtureKind(buildMotionFixture("cluster-hex")), "tumble");
  });

  it("checked-in fixtures and index match the planner", () => {
    const index = JSON.parse(
      readFileSync(join(fixtureDir, "index.json"), "utf8"),
    );
    assert.deepEqual(index, buildMotionFixtureIndex());
    for (const id of listMotionFixtureIds()) {
      const onDisk = JSON.parse(readFileSync(join(fixtureDir, `${id}.json`), "utf8"));
      assert.deepEqual(onDisk, buildMotionFixture(id), id);
    }
  });
});
