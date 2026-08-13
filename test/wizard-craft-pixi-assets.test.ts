import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_ASSET_SLOTS,
  createWizardCraftPixiAssetScene,
  type WizardCraftPixiContainer,
  type WizardCraftPixiSprite,
  type WizardCraftTexture,
} from "../src/index.js";

class Texture implements WizardCraftTexture {
  destroy(): void {}
}

class Container implements WizardCraftPixiContainer {
  visible = true;
  readonly label: string;
  readonly children: Array<Container | Sprite> = [];
  destroyed = 0;

  constructor(label: string) {
    this.label = label;
  }
}

class Sprite implements WizardCraftPixiSprite<Texture> {
  visible = true;
  readonly texture: Texture;
  readonly label: string;
  destroyed = 0;

  constructor(texture: Texture, label: string) {
    this.texture = texture;
    this.label = label;
  }
}

function textures() {
  return new Map(WIZARD_CRAFT_ASSET_SLOTS.map((slot) => [
    slot.id,
    new Texture(),
  ] as const));
}

function adapter(failAt?: string) {
  return {
    createContainer: (label: string) => new Container(label),
    createSprite: (texture: Texture, label: string) => {
      if (label === failAt) throw new Error("sprite construction failed");
      return new Sprite(texture, label);
    },
    addChild: (parent: Container, child: Container | Sprite) => {
      parent.children.push(child);
    },
    destroySprite: (sprite: Sprite) => {
      sprite.destroyed += 1;
    },
    destroyContainer: (container: Container) => {
      container.destroyed += 1;
    },
  };
}

test("builds six ordered containers and assigns every asset to its scene layer", () => {
  const scene = createWizardCraftPixiAssetScene({
    textures: textures(),
    adapter: adapter(),
  });

  assert.deepEqual(
    scene.root.children.map((child) => child.label),
    [
      "wizard-craft.cabinet",
      "wizard-craft.reels",
      "wizard-craft.dragon",
      "wizard-craft.wizard",
      "wizard-craft.clash",
      "wizard-craft.ui",
    ],
  );
  assert.equal(scene.sprites.size, WIZARD_CRAFT_ASSET_SLOTS.length);
  assert.equal(
    scene.containers.dragon.children.includes(scene.sprite("dragon.idle")),
    true,
  );
  assert.equal(
    scene.containers.clash.children.includes(scene.sprite("effects.fire.core")),
    true,
  );
  assert.equal(scene.sprite("cabinet.title").visible, true);
  assert.equal(scene.sprite("dragon.idle").visible, true);
  assert.equal(scene.sprite("wizard.idle").visible, true);
  assert.equal(scene.sprite("dragon.attack.quick").visible, false);

  const cabinetOrder = scene.containers.cabinet.children.map(
    (child) => child.label,
  );
  assert.ok(
    cabinetOrder.indexOf("dragon.rear.tail") <
      cabinetOrder.indexOf("cabinet.pillar.wizard") &&
      cabinetOrder.indexOf("cabinet.pillar.wizard") <
        cabinetOrder.indexOf("cabinet.staircase.wizard"),
    "the Dragon tail must pass behind the rune tower and Wizard stairs",
  );
});

test("switches authored static replacements for reduced motion", () => {
  const scene = createWizardCraftPixiAssetScene({
    textures: textures(),
    adapter: adapter(),
  });

  scene.setReducedMotion(true);
  assert.equal(scene.sprite("dragon.idle").visible, false);
  assert.equal(scene.sprite("dragon.idle.static").visible, true);
  assert.equal(scene.sprite("wizard.idle").visible, false);
  assert.equal(scene.sprite("wizard.idle.static").visible, true);
  assert.equal(scene.sprite("environment.fog.low").visible, false);
  assert.equal(scene.sprite("environment.fog.low.static").visible, true);

  scene.setReducedMotion(false);
  assert.equal(scene.sprite("dragon.idle").visible, true);
  assert.equal(scene.sprite("dragon.idle.static").visible, false);
});

test("fails before scene use when any texture is absent", () => {
  const incomplete = textures();
  incomplete.delete("wizard.block");
  assert.throws(() => createWizardCraftPixiAssetScene({
    textures: incomplete,
    adapter: adapter(),
  }), /Missing WIZARD CRAFT textures: wizard.block/);
});

test("cleans partial construction and disposes a complete scene once", () => {
  const usedAdapter = adapter("dragon.inhale");
  const containers: Container[] = [];
  const sprites: Sprite[] = [];
  const trackingAdapter = {
    ...usedAdapter,
    createContainer(label: string) {
      const container = usedAdapter.createContainer(label);
      containers.push(container);
      return container;
    },
    createSprite(texture: Texture, label: string) {
      const sprite = usedAdapter.createSprite(texture, label);
      sprites.push(sprite);
      return sprite;
    },
  };

  assert.throws(() => createWizardCraftPixiAssetScene({
    textures: textures(),
    adapter: trackingAdapter,
  }), /sprite construction failed/);
  assert.equal(containers.every((container) => container.destroyed === 1), true);
  assert.equal(sprites.every((sprite) => sprite.destroyed === 1), true);

  const scene = createWizardCraftPixiAssetScene({
    textures: textures(),
    adapter: adapter(),
  });
  const root = scene.root;
  const createdSprites = [...scene.sprites.values()];
  scene.destroy();
  scene.destroy();
  assert.equal(root.destroyed, 1);
  assert.equal(createdSprites.every((sprite) => sprite.destroyed === 1), true);
});
