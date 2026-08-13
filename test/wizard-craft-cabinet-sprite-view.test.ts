import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_ASSET_SLOTS,
  WizardCraftCabinetSpriteView,
  type WizardCraftAssetId,
  type WizardCraftCabinetAnimationClock,
  type WizardCraftCabinetState,
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
  y = 0;
  width = 0;
  height = 0;
  alpha = 1;
}

function harness(
  clock: WizardCraftCabinetAnimationClock = {
    sleep: async (_milliseconds: number) => undefined,
  },
) {
  const sprites = new Map<WizardCraftAssetId, Sprite>(
    WIZARD_CRAFT_ASSET_SLOTS.map((slot) => [slot.id, new Sprite()]),
  );
  const root = { x: 0, y: 0, scale: new Scale() };
  const light = { dragon: 0, wizard: 0, balanced: 0 };
  const view = new WizardCraftCabinetSpriteView({
    scene: {
      root,
      sprite: (id) => sprites.get(id)!,
    },
    lighting: {
      setDragon: (value) => {
        light.dragon = value;
      },
      setWizard: (value) => {
        light.wizard = value;
      },
      setBalanced: (value) => {
        light.balanced = value;
      },
    },
    clock,
  });
  return { view, sprites, root, light };
}

function state(
  crest: WizardCraftCabinetState["crest"] = "base",
): WizardCraftCabinetState {
  return {
    title: "WIZARD CRAFT",
    tier: crest === "base" ? null : 3,
    crest,
    dragonLight: 0.4,
    wizardLight: 0.6,
    balancedLight: 0.2,
    featureActive: crest !== "base",
    capped: crest === "maximum",
  };
}

test("assembles the authored 640×360 cabinet and scales it as one scene", () => {
  const { view, sprites, root } = harness();
  assert.deepEqual(
    {
      x: sprites.get("cabinet.title")!.x,
      y: sprites.get("cabinet.title")!.y,
      width: sprites.get("cabinet.title")!.width,
      height: sprites.get("cabinet.title")!.height,
    },
    { x: 0, y: 0, width: 640, height: 360 },
  );
  assert.equal(sprites.get("environment.sky")!.width, 640);
  assert.deepEqual(
    {
      x: sprites.get("cabinet.crest.base")!.x,
      y: sprites.get("cabinet.crest.base")!.y,
      width: sprites.get("cabinet.crest.base")!.width,
      height: sprites.get("cabinet.crest.base")!.height,
    },
    { x: 0, y: 0, width: 640, height: 360 },
  );
  assert.equal(sprites.get("cabinet.crest.clash")!.visible, false);

  view.setLayout({
    x: 10,
    y: 20,
    width: 1_280,
    height: 720,
    scale: 2 / 3,
    compact: false,
  });
  assert.equal(root.x, 10);
  assert.equal(root.y, 20);
  assert.equal(root.scale.value, 2);
});

test("reduces the persistent tier watermark in compact layouts", () => {
  const { view, sprites } = harness();
  view.setState(state("clash"));
  const final = sprites.get("effects.tier.3.frame.07")!;
  assert.equal(final.alpha, 0.12);
  view.setLayout({
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    scale: 1 / 6,
    compact: true,
  });
  assert.equal(final.alpha, 0.06);
});

test("restores exact crest and independent Dragon, Wizard, and balanced light", () => {
  const { view, sprites, light } = harness();
  view.setState(state("clash"));
  assert.equal(sprites.get("cabinet.crest.base")!.visible, false);
  assert.equal(sprites.get("cabinet.crest.clash")!.visible, true);
  assert.deepEqual(light, { dragon: 0.4, wizard: 0.6, balanced: 0.2 });
  assert.ok(
    Math.abs(sprites.get("cabinet.pillar.dragon.runes")!.alpha - 0.736) <
      1e-9,
  );
  assert.ok(
    Math.abs(sprites.get("cabinet.pillar.wizard.runes")!.alpha - 0.868) <
      1e-9,
  );

  view.setState(state("maximum"));
  assert.equal(sprites.get("cabinet.crest.clash")!.visible, true);
});

test("switches fog for zero motion and bounds tier anticipation accents", async () => {
  const delays: number[] = [];
  const { view, sprites, light } = harness({
    sleep: async (milliseconds: number) => {
      delays.push(milliseconds);
    },
  });
  view.setState(state("clash"));
  view.setAmbientMotion("none");
  assert.equal(sprites.get("environment.fog.low")!.visible, false);
  assert.equal(sprites.get("environment.fog.low.static")!.visible, true);

  await view.anticipation("subtle");
  await view.enterFeature(3, "full");
  assert.deepEqual(delays, [
    120,
    105, 900,
    105, 105, 105, 105, 105, 105, 105,
  ]);
  assert.equal(
    sprites.get("effects.tier.3.frame.07")!.visible,
    true,
  );
  assert.equal(
    sprites.get("effects.tier.3.frame.07")!.alpha,
    0.12,
  );
  assert.equal(light.balanced, 0.2);
  await assert.rejects(() => view.enterFeature(4, "full"), /requires tier/);
});

test("eases cabinet and rune lighting into accents and back to persistence", async () => {
  const tweens: number[] = [];
  const { view, light } = harness({
    sleep: async () => undefined,
    tween: async (milliseconds, update) => {
      tweens.push(milliseconds);
      update(0.5);
      update(1);
    },
  });
  view.setState(state("clash"));

  await view.anticipation("full");

  assert.deepEqual(tweens, [60, 100]);
  assert.deepEqual(light, { dragon: 0.4, wizard: 0.6, balanced: 0.2 });
});

test("crossfades authored tier frames while preserving the final watermark", async () => {
  const tweens: number[] = [];
  const { view, sprites } = harness({
    sleep: async () => undefined,
    tween: async (milliseconds, update) => {
      tweens.push(milliseconds);
      update(0.5);
      update(1);
    },
  });
  view.setState(state("clash"));

  await view.enterFeature(3, "full");

  assert.equal(tweens.filter((value) => value === 35).length, 8);
  assert.equal(sprites.get("effects.tier.3.frame.07")!.visible, true);
  assert.equal(sprites.get("effects.tier.3.frame.07")!.alpha, 0.12);
});

test("holds maximum state, cancels accents, and destroys without leaks", async () => {
  let release!: () => void;
  const { view, sprites, light } = harness({
    sleep: () => new Promise<void>((resolve) => {
      release = resolve;
    }),
  });
  view.setState(state("maximum"));
  const maximum = view.maximumWin(2_500_000, "full");
  assert.equal(light.balanced, 0.65);
  view.cancelAnimations();
  assert.equal(light.balanced, 0.2);
  release();
  await maximum;

  await assert.rejects(
    () => view.maximumWin(2_499_999, "full"),
    /exactly 25,000×/,
  );
  view.destroy();
  view.destroy();
  assert.equal(
    sprites.get("cabinet.title")!.visible,
    false,
  );
  assert.deepEqual(light, { dragon: 0, wizard: 0, balanced: 0 });
});

test("celebrates strong wins below the exclusive maximum treatment", async () => {
  const { view, sprites } = harness();
  view.setState(state("clash"));
  await view.strongWin(10_000, "none");
  assert.equal(sprites.get("cabinet.crest.base")!.visible, false);
  assert.equal(sprites.get("cabinet.crest.clash")!.visible, true);
  await assert.rejects(
    () => view.strongWin(9_999, "full"),
    /100× to below maximum/,
  );
  await assert.rejects(
    () => view.strongWin(2_500_000, "full"),
    /100× to below maximum/,
  );
});

test("makes the duel handoff visible without replaying the tier entrance", async () => {
  const { view, sprites } = harness();
  view.setState(state("base"));
  await view.handoff(3, "none");
  assert.equal(sprites.get("cabinet.crest.base")!.visible, false);
  assert.equal(sprites.get("cabinet.crest.clash")!.visible, true);
});
