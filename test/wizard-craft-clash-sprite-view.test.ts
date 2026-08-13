import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_ASSET_SLOTS,
  WIZARD_CRAFT_FIRE_LAYERS,
  WIZARD_CRAFT_MAGIC_LAYERS,
  WizardCraftClashSpriteView,
  type WizardCraftAssetId,
} from "../src/index.js";

class Scale {
  value = 1;
  set(value: number): void {
    this.value = value;
  }
}

class Sprite {
  visible = false;
  x = 0;
  width = 0;
  alpha = 1;
  readonly scale = new Scale();
}

function scene() {
  const sprites = new Map<WizardCraftAssetId, Sprite>(
    WIZARD_CRAFT_ASSET_SLOTS.map((slot) => [slot.id, new Sprite()]),
  );
  return {
    sprite(id: WizardCraftAssetId): Sprite {
      return sprites.get(id)!;
    },
  };
}

test("runs multicolor fire and blue-white magic as independent flights", async () => {
  const sprites = scene();
  const delays: number[] = [];
  const view = new WizardCraftClashSpriteView(sprites, {
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  await view.launchDragonFire(WIZARD_CRAFT_FIRE_LAYERS, 0, "full");
  await view.launchWizardMagic(WIZARD_CRAFT_MAGIC_LAYERS, 4, "subtle");

  assert.deepEqual(delays, [330, 150]);
  assert.equal(sprites.sprite("effects.fire.core").visible, false);
  assert.equal(sprites.sprite("effects.fire.edge").visible, false);
  assert.equal(sprites.sprite("effects.magic.bolt").visible, false);
  assert.equal(sprites.sprite("effects.magic.runes").visible, false);
  assert.equal(sprites.sprite("effects.fire.core").x, 155);
  assert.ok(Math.abs(sprites.sprite("effects.fire.core").width - 51) < 0.001);
  assert.equal(sprites.sprite("effects.fire.embers").x, 148);
  assert.equal(sprites.sprite("effects.fire.embers").width, 28);
  assert.equal(sprites.sprite("effects.fire.smoke").x, 151);
  assert.equal(sprites.sprite("effects.fire.smoke").width, 18);
  assert.equal(sprites.sprite("effects.magic.bolt").x, 446);
  assert.ok(Math.abs(sprites.sprite("effects.magic.bolt").width - 152) < 0.001);
});

test("ramps projectile energy in and dissipates it without a hard cut", async () => {
  const sprites = scene();
  const tweens: number[] = [];
  const midpointAlpha: number[] = [];
  const view = new WizardCraftClashSpriteView(sprites, {
    sleep: async () => undefined,
    tween: async (milliseconds, update) => {
      tweens.push(milliseconds);
      update(0.5);
      midpointAlpha.push(sprites.sprite("effects.magic.bolt").alpha);
      update(1);
    },
  });

  await view.launchWizardMagic(WIZARD_CRAFT_MAGIC_LAYERS, 2, "full");

  assert.deepEqual(tweens, [60, 70]);
  assert.deepEqual(midpointAlpha, [0.5, 0.5]);
  assert.equal(sprites.sprite("effects.magic.bolt").visible, false);
  assert.equal(sprites.sprite("effects.magic.bolt").alpha, 1);
});

test("places impact at the selected reel and shows advantage-owned blocks", async () => {
  const sprites = scene();
  const view = new WizardCraftClashSpriteView(sprites);
  await view.impact({
    targetReel: 3,
    advantage: "wizard",
    multiplier: 50,
    response: {
      shakePixels: 0,
      flashOpacity: 0,
      particleCount: 0,
    },
  }, "none");

  assert.equal(sprites.sprite("effects.clash.core").x, 350);
  assert.equal(sprites.sprite("effects.clash.core").scale.value, 1.5);
  assert.equal(sprites.sprite("effects.clash.ring").alpha, 0.12);
  assert.equal(sprites.sprite("effects.clash.multiplier").visible, false);
  assert.equal(sprites.sprite("effects.block.ward").visible, true);
  assert.equal(sprites.sprite("effects.block.ward").x, 350);
  assert.equal(sprites.sprite("effects.block.firewall").visible, false);
});

test("blooms and releases an impact without expanding its settled footprint", async () => {
  const sprites = scene();
  const tweens: number[] = [];
  const scales: number[] = [];
  const view = new WizardCraftClashSpriteView(sprites, {
    sleep: async () => undefined,
    tween: async (milliseconds, update) => {
      tweens.push(milliseconds);
      update(0.5);
      scales.push(sprites.sprite("effects.clash.core").scale.value);
      update(1);
    },
  });

  await view.impact({
    targetReel: 2,
    advantage: "balanced",
    multiplier: 50,
    response: { shakePixels: 0, flashOpacity: 0.5, particleCount: 0 },
  }, "full");

  assert.deepEqual(tweens, [45, 90]);
  assert.ok(scales[0]! < 1.5);
  assert.ok(scales[1]! > 1.5);
  assert.equal(sprites.sprite("effects.clash.core").scale.value, 1.5);
  assert.equal(sprites.sprite("effects.clash.core").visible, false);
});

test("shows the defender effect for a blocked attack without a multiplier", async () => {
  const sprites = scene();
  const view = new WizardCraftClashSpriteView(sprites);
  await view.blockedImpact("dragon", 4, {
    shakePixels: 0,
    flashOpacity: 0,
    particleCount: 0,
  }, "none");

  assert.equal(sprites.sprite("effects.clash.core").visible, false);
  assert.equal(sprites.sprite("effects.clash.ring").visible, false);
  assert.equal(sprites.sprite("effects.clash.multiplier").visible, false);
  assert.equal(sprites.sprite("effects.block.ward").visible, true);
  assert.equal(sprites.sprite("effects.block.ward").x, 410);
  assert.equal(sprites.sprite("effects.block.firewall").visible, false);
});

test("sticky surge uses the balanced collision recipe and cap persists", async () => {
  const sprites = scene();
  const view = new WizardCraftClashSpriteView(sprites, {
    sleep: async () => undefined,
  });
  view.setPersistentState({
    featureTier: 3,
    stickyReels: [2],
    capped: true,
  });
  assert.equal(sprites.sprite("effects.clash.multiplier").visible, true);
  assert.equal(sprites.sprite("effects.clash.multiplier").x, 266);
  assert.equal(
    sprites.sprite("effects.clash.multiplier").scale.value,
    5 / 3,
  );

  await view.stickySurge(2, 25, {
    shakePixels: 2,
    flashOpacity: 0.1,
    particleCount: 12,
  }, "subtle");
  assert.equal(sprites.sprite("effects.block.ward").visible, false);
  assert.equal(sprites.sprite("effects.block.firewall").visible, false);
  assert.equal(sprites.sprite("effects.clash.multiplier").visible, true);
  assert.equal(
    sprites.sprite("effects.clash.multiplier").scale.value,
    5 / 3,
  );
});

test("cancellation invalidates flights and destroy rejects new effects", async () => {
  const sprites = scene();
  let release!: () => void;
  const view = new WizardCraftClashSpriteView(sprites, {
    sleep: () => new Promise<void>((resolve) => {
      release = resolve;
    }),
  });
  const flight = view.launchDragonFire(WIZARD_CRAFT_FIRE_LAYERS, 2, "full");
  assert.equal(sprites.sprite("effects.fire.embers").visible, true);
  view.cancelEffects();
  assert.equal(sprites.sprite("effects.fire.embers").visible, false);
  release();
  await flight;

  view.destroy();
  await assert.rejects(
    () => view.launchWizardMagic(WIZARD_CRAFT_MAGIC_LAYERS, 2, "full"),
    /view is destroyed/,
  );
});
