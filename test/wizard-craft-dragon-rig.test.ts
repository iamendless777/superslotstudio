import assert from "node:assert/strict";
import test from "node:test";

import { WIZARD_CRAFT_DRAGON_RIG } from "../src/index.js";

test("locks every Dragon layer and attachment to the native 640x360 master", () => {
  const { width, height } = WIZARD_CRAFT_DRAGON_RIG.designSize;
  assert.deepEqual({ width, height }, { width: 640, height: 360 });
  assert.deepEqual(
    WIZARD_CRAFT_DRAGON_RIG.layers.map(({ assetId, depth }) => ({
      assetId,
      depth,
    })),
    [
      { assetId: "dragon.rear.tail", depth: "rear" },
      { assetId: "dragon.front.head", depth: "foreground" },
      { assetId: "dragon.front.jaw", depth: "foreground" },
      { assetId: "dragon.front.eye", depth: "foreground" },
      { assetId: "dragon.front.coil", depth: "foreground" },
    ],
  );
  for (const layer of WIZARD_CRAFT_DRAGON_RIG.layers) {
    assert.deepEqual(layer.logicalBounds, { x: 0, y: 0, width, height });
    assert.ok(layer.visibleBounds.x >= 0);
    assert.ok(layer.visibleBounds.y >= 0);
    assert.ok(layer.visibleBounds.x + layer.visibleBounds.width <= width);
    assert.ok(layer.visibleBounds.y + layer.visibleBounds.height <= height);
    assert.ok(layer.pivot.x >= 0 && layer.pivot.x <= width);
    assert.ok(layer.pivot.y >= 0 && layer.pivot.y <= height);
  }
  for (const point of Object.values(WIZARD_CRAFT_DRAGON_RIG.attachments)) {
    assert.ok(point.x >= 0 && point.x <= width);
    assert.ok(point.y >= 0 && point.y <= height);
  }
  assert.deepEqual(WIZARD_CRAFT_DRAGON_RIG.poses.attackJaw, {
    assetId: "dragon.front.jaw.attack",
    logicalBounds: { x: 0, y: 0, width: 640, height: 360 },
    hinge: { x: 116, y: 188 },
    reviewStatus: "clean-registered-hinge-rotation",
  });
});
