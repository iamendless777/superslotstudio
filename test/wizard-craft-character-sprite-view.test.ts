import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_ASSET_SLOTS,
  WIZARD_CRAFT_CHARACTER_PALETTES,
  WizardCraftCharacterSpriteView,
  type WizardCraftAssetId,
  type WizardCraftCharacterState,
} from "../src/index.js";

class Sprite {
  visible = false;
  x = 0;
  y = 0;
  alpha = 1;
}

function scene() {
  const sprites = new Map<WizardCraftAssetId, Sprite>(
    WIZARD_CRAFT_ASSET_SLOTS.map((slot) => [slot.id, new Sprite()]),
  );
  return {
    sprites,
    sprite(id: WizardCraftAssetId): Sprite {
      return sprites.get(id)!;
    },
  };
}

function state(
  side: "dragon" | "wizard",
  capped = false,
): WizardCraftCharacterState {
  return {
    side,
    palette: WIZARD_CRAFT_CHARACTER_PALETTES[side],
    featureActive: true,
    tier: 3,
    claimedReels: 1,
    opposingReels: 1,
    balancedReels: 0,
    capped,
  };
}

test("maps Dragon and Wizard actions to their approved independent poses", async () => {
  const dragonScene = scene();
  const wizardScene = scene();
  const delays: number[] = [];
  const clock = {
    sleep: async (milliseconds: number) => {
      delays.push(milliseconds);
    },
  };
  const dragon = new WizardCraftCharacterSpriteView(
    "dragon",
    dragonScene,
    clock,
  );
  const wizard = new WizardCraftCharacterSpriteView(
    "wizard",
    wizardScene,
    clock,
  );

  assert.equal(dragonScene.sprite("dragon.idle").visible, true);
  assert.equal(dragonScene.sprite("dragon.front.jaw").visible, false);
  assert.equal(dragonScene.sprite("dragon.front.eye").visible, false);
  const heldWindup = dragon.windup("heavy", "none");
  assert.equal(dragonScene.sprite("dragon.inhale").visible, true);
  await heldWindup;
  const heldAttack = dragon.launch("none");
  assert.equal(dragonScene.sprite("dragon.attack.quick").visible, true);
  await heldAttack;
  dragon.cancelAnimations();
  let releaseWindup!: () => void;
  const movingDragon = new WizardCraftCharacterSpriteView(
    "dragon",
    dragonScene,
    {
      sleep: () => new Promise<void>((resolve) => {
        releaseWindup = resolve;
      }),
    },
  );
  const movingWindup = movingDragon.windup("heavy", "full");
  assert.deepEqual(
    {
      x: dragonScene.sprite("dragon.inhale").x,
      y: dragonScene.sprite("dragon.inhale").y,
    },
    { x: -2, y: 1 },
  );
  assert.deepEqual(
    {
      x: dragonScene.sprite("dragon.front.eye.anticipation").x,
      y: dragonScene.sprite("dragon.front.eye.anticipation").y,
    },
    { x: -2, y: 1 },
  );
  assert.deepEqual(
    {
      x: dragonScene.sprite("dragon.front.coil").x,
      y: dragonScene.sprite("dragon.front.coil").y,
    },
    { x: 0, y: 0 },
  );
  releaseWindup();
  await movingWindup;
  let releaseAttack!: () => void;
  const attackingDragon = new WizardCraftCharacterSpriteView(
    "dragon",
    dragonScene,
    {
      sleep: () => new Promise<void>((resolve) => {
        releaseAttack = resolve;
      }),
    },
  );
  const movingAttack = attackingDragon.launch("full");
  assert.deepEqual(
    {
      x: dragonScene.sprite("dragon.attack.quick").x,
      y: dragonScene.sprite("dragon.attack.quick").y,
    },
    { x: 1, y: 0 },
  );
  assert.deepEqual(
    {
      x: dragonScene.sprite("dragon.front.coil").x,
      y: dragonScene.sprite("dragon.front.coil").y,
    },
    { x: 0, y: 0 },
  );
  assert.deepEqual(
    {
      x: dragonScene.sprite("dragon.rear.tail").x,
      y: dragonScene.sprite("dragon.rear.tail").y,
    },
    { x: 0, y: 0 },
  );
  releaseAttack();
  await movingAttack;
  await dragon.windup("heavy", "full");
  assert.equal(dragonScene.sprite("dragon.idle").visible, true);
  assert.equal(dragonScene.sprite("dragon.inhale").visible, false);
  await wizard.launch("subtle");
  assert.equal(wizardScene.sprite("wizard.idle").visible, true);
  assert.equal(wizardScene.sprite("wizard.hat.idle").visible, false);
  assert.equal(wizardScene.sprite("wizard.hat.cast").visible, false);
  let releaseCast!: () => void;
  const movingWizard = new WizardCraftCharacterSpriteView(
    "wizard",
    wizardScene,
    {
      sleep: () => new Promise<void>((resolve) => {
        releaseCast = resolve;
      }),
    },
  );
  const movingCast = movingWizard.launch("full");
  assert.deepEqual(
    {
      x: wizardScene.sprite("wizard.cast.quick").x,
      y: wizardScene.sprite("wizard.cast.quick").y,
    },
    { x: -1, y: 0 },
  );
  assert.deepEqual(
    {
      x: wizardScene.sprite("wizard.body").x,
      y: wizardScene.sprite("wizard.body").y,
    },
    { x: -25, y: 0 },
  );
  releaseCast();
  await movingCast;
  assert.deepEqual(
    {
      x: wizardScene.sprite("wizard.idle").x,
      y: wizardScene.sprite("wizard.idle").y,
    },
    { x: 0, y: 0 },
  );
  assert.deepEqual(delays, [420, 130]);

  await dragon.claim("none");
  assert.equal(dragonScene.sprite("dragon.claim").visible, true);
  await wizard.block("none");
  assert.equal(wizardScene.sprite("wizard.block").visible, true);
});

test("animates registered Dragon eye accents over the coherent static plate", async () => {
  const sprites = scene();
  let release!: () => void;
  const dragon = new WizardCraftCharacterSpriteView(
    "dragon",
    sprites,
    {
      sleep: () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    },
    { staticPlate: true },
  );

  const anticipation = dragon.windup("heavy", "full");
  assert.equal(sprites.sprite("dragon.front.eye.anticipation").visible, true);
  assert.equal(sprites.sprite("dragon.front.eye.attack").visible, false);
  release();
  await anticipation;
  assert.equal(sprites.sprite("dragon.front.eye.anticipation").visible, false);

  const attack = dragon.launch("subtle");
  assert.equal(sprites.sprite("dragon.front.eye.attack").visible, true);
  assert.equal(sprites.sprite("dragon.front.eye.attack").alpha, 0.78);
  release();
  await attack;
  assert.equal(sprites.sprite("dragon.front.eye.attack").visible, false);
  assert.equal(sprites.sprite("dragon.front.eye.attack").alpha, 1);
});

test("animates registered Wizard eyes and hand energy over the coherent plate", async () => {
  const sprites = scene();
  let release!: () => void;
  const wizard = new WizardCraftCharacterSpriteView(
    "wizard",
    sprites,
    {
      sleep: () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    },
    { staticPlate: true },
  );

  assert.equal(sprites.sprite("wizard.eyes").visible, true);
  assert.equal(sprites.sprite("wizard.eyes").x, 0);
  const charge = wizard.windup("heavy", "full");
  assert.equal(sprites.sprite("wizard.eyes").visible, false);
  assert.equal(sprites.sprite("wizard.hat.charge").visible, true);
  release();
  await charge;
  assert.equal(sprites.sprite("wizard.hat.charge").visible, false);
  assert.equal(sprites.sprite("wizard.eyes").visible, true);

  const cast = wizard.launch("subtle");
  assert.equal(sprites.sprite("wizard.hat.cast").visible, true);
  assert.equal(sprites.sprite("wizard.hat.cast").alpha, 0.82);
  release();
  await cast;
  assert.equal(sprites.sprite("wizard.hat.cast").visible, false);
  assert.equal(sprites.sprite("wizard.eyes").visible, true);
});

test("sync validates character ownership and holds the cap claim pose", () => {
  const sprites = scene();
  const view = new WizardCraftCharacterSpriteView("dragon", sprites);
  view.setState(state("dragon", true));
  assert.equal(sprites.sprite("dragon.claim").visible, true);
  assert.throws(() => view.setState(state("wizard")), /received wizard state/);
});

test("keeps preparation poses visible until the attack resolves", () => {
  const attackerSprites = scene();
  const defenderSprites = scene();
  const attacker = new WizardCraftCharacterSpriteView("dragon", attackerSprites);
  const defender = new WizardCraftCharacterSpriteView("wizard", defenderSprites);

  attacker.setState({ ...state("dragon"), prepared: "attacker" });
  defender.setState({ ...state("wizard"), prepared: "defender" });

  assert.equal(attackerSprites.sprite("dragon.inhale").visible, true);
  assert.equal(attackerSprites.sprite("dragon.idle").visible, false);
  assert.equal(defenderSprites.sprite("wizard.block").visible, true);
  assert.equal(defenderSprites.sprite("wizard.idle").visible, false);
});

test("crossfades full-motion pose entry and recovery without hard cuts", async () => {
  const sprites = scene();
  const durations: number[] = [];
  const midpointVisibility: boolean[] = [];
  const view = new WizardCraftCharacterSpriteView("wizard", sprites, {
    sleep: async () => undefined,
    tween: async (milliseconds, update) => {
      durations.push(milliseconds);
      update(0.5);
      midpointVisibility.push(
        sprites.sprite("wizard.idle").visible &&
          sprites.sprite("wizard.cast.quick").visible,
      );
      update(1);
    },
  });

  await view.launch("full");

  assert.deepEqual(durations, [80, 80]);
  assert.deepEqual(midpointVisibility, [true, true]);
  assert.equal(sprites.sprite("wizard.idle").visible, true);
  assert.equal(sprites.sprite("wizard.cast.quick").visible, false);
  assert.equal(sprites.sprite("wizard.idle").alpha, 1);
});

test("reduced motion uses authored static idle and cancellation restores it", async () => {
  const sprites = scene();
  const delays: number[] = [];
  const view = new WizardCraftCharacterSpriteView("wizard", sprites, {
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });
  view.setReducedMotion(true);
  assert.equal(sprites.sprite("wizard.idle.static").visible, true);

  const animation = view.windup("heavy", "full");
  assert.equal(sprites.sprite("wizard.charge").visible, true);
  assert.deepEqual(
    {
      x: sprites.sprite("wizard.body").x,
      y: sprites.sprite("wizard.body").y,
    },
    { x: -24, y: 0 },
  );
  view.cancelAnimations();
  assert.equal(sprites.sprite("wizard.idle.static").visible, true);
  await animation;
  assert.deepEqual(delays, []);
  assert.equal(sprites.sprite("wizard.idle.static").visible, true);
});

test("destroy hides owned poses and rejects future state", () => {
  const sprites = scene();
  const view = new WizardCraftCharacterSpriteView("dragon", sprites);
  view.destroy();
  view.destroy();
  assert.equal(sprites.sprite("dragon.idle").visible, false);
  assert.throws(() => view.setState(state("dragon")), /view is destroyed/);
});
