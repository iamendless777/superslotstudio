import assert from "node:assert/strict";
import test from "node:test";
import { Texture } from "pixi.js";

import {
  WIZARD_CRAFT_ASSET_SLOTS,
  WIZARD_CRAFT_PIXI_COLORS,
  WIZARD_CRAFT_PIXI_DISPLAY_ADAPTER,
  createWizardCraftPixiAssetScene,
  createWizardCraftPixiViewComponents,
  wizardCraftAmbientFogOffset,
  wizardCraftIdleEmberFrame,
  wizardCraftIdleSparkFrame,
} from "../src/index.js";

test("drifts ambient fog slowly on whole pixels and loops without drift", () => {
  const samples = Array.from(
    { length: 25 },
    (_, index) => wizardCraftAmbientFogOffset(index * 250),
  );
  assert.ok(samples.every((value) => Number.isInteger(value)));
  assert.ok(samples.every((value) => value >= -2 && value <= 2));
  assert.equal(wizardCraftAmbientFogOffset(0), 0);
  assert.equal(wizardCraftAmbientFogOffset(6_000), 0);
  assert.throws(() => wizardCraftAmbientFogOffset(-1), /non-negative/);
});

test("cycles sparse Wizard sparkles deterministically without random motion", () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => wizardCraftIdleSparkFrame(index * 140)),
    [0, 1, 2, 3, 4, 5, 0],
  );
  assert.throws(() => wizardCraftIdleSparkFrame(Number.NaN), /finite/);
});

test("cycles sparse Dragon embers independently from Wizard sparkles", () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => wizardCraftIdleEmberFrame(index * 180)),
    [0, 1, 2, 3, 4, 5, 0],
  );
  assert.notEqual(wizardCraftIdleEmberFrame(560), wizardCraftIdleSparkFrame(560));
  assert.throws(() => wizardCraftIdleEmberFrame(-1), /non-negative/);
});

function relativeLuminance(color: number): number {
  const channels = [color >> 16 & 255, color >> 8 & 255, color & 255]
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * channels[0]! +
    0.7152 * channels[1]! +
    0.0722 * channels[2]!;
}

function contrast(left: number, right: number): number {
  const a = relativeLuminance(left);
  const b = relativeLuminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("creates real Pixi containers, sprites, cells, overlays, lights, and text", async () => {
  const scene = createWizardCraftPixiAssetScene({
    textures: new Map(
      WIZARD_CRAFT_ASSET_SLOTS.map((slot) => [slot.id, Texture.EMPTY]),
    ),
    adapter: WIZARD_CRAFT_PIXI_DISPLAY_ADAPTER,
  });
  const components = createWizardCraftPixiViewComponents(scene);

  assert.equal(scene.root.children.length, 6);
  assert.deepEqual(
    {
      x: scene.containers.reels.x,
      y: scene.containers.reels.y,
    },
    { x: 176, y: 104 },
  );
  assert.equal(components.reelCells.length, 20);
  assert.equal(components.reelOverlays.length, 5);
  assert.equal(components.uiMultipliers.length, 5);
  const tierText = components.uiText.tier as unknown as {
    readonly display: { readonly y: number; readonly style: { readonly align: string } };
  };
  const spinText = components.uiText.spin as unknown as {
    readonly display: { readonly y: number };
  };
  assert.equal(tierText.display.y, 38);
  assert.equal(spinText.display.y, 70);
  assert.equal(tierText.display.style.align, "center");
  const multiplier = components.uiMultipliers[0]!;
  const multiplierLabel = (
    multiplier as unknown as {
      readonly container: {
        readonly children: readonly {
          readonly text?: string;
          readonly style?: { readonly fontSize: number | string };
        }[];
      };
    }
  ).container.children[1]!;
  multiplier.setState({
    reel: 0,
    multiplier: 25,
    persistence: "sticky",
    advantage: "dragon",
  });
  assert.equal(multiplierLabel.text, "25×");
  multiplier.setState({
    reel: 0,
    multiplier: 25,
    persistence: "sticky",
    advantage: "wizard",
  });
  assert.equal(multiplierLabel.text, "25×");
  multiplier.setState({
    reel: 0,
    multiplier: 25,
    persistence: "sticky",
    advantage: "balanced",
  });
  assert.equal(multiplierLabel.text, "25×");
  multiplier.setFontSize(30);
  multiplier.setState({
    reel: 0,
    multiplier: 1_000,
    persistence: "sticky",
    advantage: "wizard",
  });
  assert.equal(multiplierLabel.text, "1000×");
  assert.ok(Number(multiplierLabel.style?.fontSize) >= 13);
  assert.ok(Number(multiplierLabel.style?.fontSize) <= 15);
  multiplier.setState({
    reel: 0,
    multiplier: 50,
    persistence: "sticky",
    advantage: "dragon",
  });
  assert.ok(Number(multiplierLabel.style?.fontSize) >= 17);
  const multiplierContainer = (
    multiplier as unknown as {
      readonly container: {
        readonly x: number;
        readonly y: number;
        readonly scale: { readonly x: number };
      };
    }
  ).container;
  multiplier.setEmphasized?.(true);
  assert.equal(multiplierContainer.scale.x, 1.08);
  assert.ok(Math.abs(multiplierContainer.x - (178 - 52 * 0.04)) < 0.000_001);
  assert.ok(Math.abs(multiplierContainer.y - (107 - 24 * 0.04)) < 0.000_001);
  multiplier.setEmphasized?.(false);
  assert.equal(multiplierContainer.scale.x, 1);
  assert.equal(multiplierContainer.x, 178);
  assert.equal(multiplierContainer.y, 107);
  multiplier.setEmphasized?.(true, true);
  multiplier.setState(null);
  assert.equal(multiplierContainer.scale.x, 1);
  assert.equal(multiplierContainer.x, 178);
  assert.equal(multiplierContainer.y, 107);
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.equal(multiplierContainer.scale.x, 1);

  for (const cell of components.reelCells) cell.destroy();
  for (const overlay of components.reelOverlays) overlay.destroy();
  for (const text of Object.values(components.uiText)) text.destroy();
  for (const multiplier of components.uiMultipliers) multiplier.destroy();
  scene.destroy();
  assert.equal(scene.sprites.size, 0);
});

test("keeps persistence visible through claims and centers sticky upgrades", () => {
  const scene = createWizardCraftPixiAssetScene({
    textures: new Map(
      WIZARD_CRAFT_ASSET_SLOTS.map((slot) => [slot.id, Texture.EMPTY]),
    ),
    adapter: WIZARD_CRAFT_PIXI_DISPLAY_ADAPTER,
  });
  const components = createWizardCraftPixiViewComponents(scene);
  const overlay = components.reelOverlays[2]!;
  const rendered = overlay as unknown as {
    readonly container: {
      readonly children: readonly { visible: boolean }[];
      readonly x: number;
      readonly y: number;
      readonly scale: { readonly x: number };
    };
  };
  overlay.setGeometry(2, 114.4, 57.2, 230);
  overlay.setState({
    reel: 2,
    multiplier: 8,
    dragonMultiplier: 5,
    wizardMultiplier: 3,
    advantage: "dragon",
    persistence: "spin",
  });
  overlay.setPhase("claim");
  assert.equal(rendered.container.children[4]!.visible, true);
  assert.equal(rendered.container.children[6]!.visible, true);

  overlay.setState({
    reel: 2,
    multiplier: 12,
    dragonMultiplier: 8,
    wizardMultiplier: 4,
    advantage: "dragon",
    persistence: "sticky",
  });
  overlay.setPhase("upgrade");
  assert.equal(rendered.container.children[5]!.visible, true);
  assert.equal(rendered.container.children[7]!.visible, true);
  assert.equal(rendered.container.scale.x, 1.04);
  assert.equal(rendered.container.x, 114.4 - 57.2 * 0.02);
  assert.ok(Math.abs(rendered.container.y - (-230 * 0.02)) < 0.000_001);

  overlay.setPhase("guarantee");
  assert.equal(rendered.container.children[5]!.visible, true);
  assert.equal(rendered.container.children[6]!.visible, true);
  assert.equal(rendered.container.children[7]!.visible, true);
  assert.equal(rendered.container.scale.x, 1.06);

  overlay.setPhase("release");
  assert.equal(rendered.container.children[8]!.visible, true);
  assert.equal(rendered.container.children[1]!.visible, false);
  assert.equal(
    (rendered.container as unknown as { readonly alpha: number }).alpha,
    0.55,
  );

  for (const cell of components.reelCells) cell.destroy();
  for (const reelOverlay of components.reelOverlays) reelOverlay.destroy();
  for (const text of Object.values(components.uiText)) text.destroy();
  for (const multiplier of components.uiMultipliers) multiplier.destroy();
  scene.destroy();
});

test("keeps multiplier text above normal-text contrast on every sticky plate", () => {
  const cream = 0xfff7dd;
  assert.ok(contrast(cream, WIZARD_CRAFT_PIXI_COLORS.dragonBadge) >= 4.5);
  assert.ok(contrast(cream, WIZARD_CRAFT_PIXI_COLORS.wizardBadge) >= 4.5);
  assert.ok(contrast(cream, WIZARD_CRAFT_PIXI_COLORS.balancedBadge) >= 4.5);
});
