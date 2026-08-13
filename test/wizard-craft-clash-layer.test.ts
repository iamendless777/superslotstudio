import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_FIRE_LAYERS,
  WIZARD_CRAFT_MAGIC_LAYERS,
  WizardCraftClashLayer,
  createWizardCraftRuntimeState,
  getWizardCraftClashResponse,
  type WizardCraftClashImpact,
  type WizardCraftClashPersistentState,
  type WizardCraftClashResponse,
  type WizardCraftClashView,
  type WizardCraftPresentationBeat,
  type WizardCraftRenderCommand,
} from "../src/index.js";

class ClashView implements WizardCraftClashView {
  state: WizardCraftClashPersistentState | null = null;
  readonly actions: string[] = [];
  setPersistentState(state: WizardCraftClashPersistentState): void {
    this.state = state;
  }
  launchDragonFire(
    layers: typeof WIZARD_CRAFT_FIRE_LAYERS,
    targetReel: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`fire:${layers.length}:${targetReel}:${motion}`);
  }
  launchWizardMagic(
    layers: typeof WIZARD_CRAFT_MAGIC_LAYERS,
    targetReel: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`magic:${layers.length}:${targetReel}:${motion}`);
  }
  impact(clash: WizardCraftClashImpact): void {
    this.actions.push(
      `impact:${clash.targetReel}:${clash.advantage}:${clash.multiplier}:${clash.response.shakePixels}`,
    );
  }
  blockedImpact(
    attacker: "dragon" | "wizard",
    targetReel: number,
    response: WizardCraftClashResponse,
  ): void {
    this.actions.push(
      `blocked:${attacker}:${targetReel}:${response.particleCount}`,
    );
  }
  stickySurge(
    reel: number,
    multiplier: number,
    response: WizardCraftClashResponse,
  ): void {
    this.actions.push(
      `surge:${reel}:${multiplier}:${response.particleCount}`,
    );
  }
  cancelEffects(): void {
    this.actions.push("cancel");
  }
  destroy(): void {
    this.actions.push("destroy");
  }
}

function beat(
  id: string,
  motion: WizardCraftPresentationBeat["motion"] = "full",
): WizardCraftPresentationBeat {
  return {
    id,
    channel: "clash",
    startMs: 0,
    durationMs: 100,
    motion,
  };
}

function command(
  type: string,
  extra: Record<string, unknown>,
): WizardCraftRenderCommand {
  const state = createWizardCraftRuntimeState();
  return {
    event: { index: 0, type, ...extra },
    before: state,
    after: state,
    cue: { eventIndex: 0, eventType: type, durationMs: 1, beats: [] },
  };
}

test("preserves the approved layered fire and blue-white magic recipes", () => {
  assert.deepEqual(WIZARD_CRAFT_FIRE_LAYERS, [
    "white-hot-core",
    "gold",
    "orange",
    "coral",
    "magenta",
    "violet",
    "blue-lavender-edge",
  ]);
  assert.deepEqual(WIZARD_CRAFT_MAGIC_LAYERS, [
    "white-core",
    "electric-blue-bolt",
    "blue-lavender-trail",
    "arcane-runes",
  ]);
});

test("bounds camera, flash, and particle intensity including reduced motion", () => {
  assert.deepEqual(getWizardCraftClashResponse(5, "full"), {
    shakePixels: 2,
    flashOpacity: 0.12,
    particleCount: 12,
  });
  assert.deepEqual(getWizardCraftClashResponse(25, "subtle"), {
    shakePixels: 2,
    flashOpacity: 0.1,
    particleCount: 12,
  });
  assert.deepEqual(getWizardCraftClashResponse(50, "full"), {
    shakePixels: 6,
    flashOpacity: 0.28,
    particleCount: 36,
  });
  assert.deepEqual(getWizardCraftClashResponse(50, "none"), {
    shakePixels: 0,
    flashOpacity: 0,
    particleCount: 0,
  });
});

test("routes flights, impacts, blocks, and sticky surge to separate effects", async () => {
  const view = new ClashView();
  const layer = new WizardCraftClashLayer(view);
  const expansion = command("expandVsReel", {
    reel: 2,
    appliedMultiplier: 50,
    advantage: "balanced",
  });
  await layer.play(beat("effects.dragon-fire-flight"), expansion);
  await layer.play(beat("effects.wizard-magic-flight"), expansion);
  await layer.play(beat("clash.multicolor-impact"), expansion);
  await layer.play(beat("clash.blocked-impact"), command(
    "blockAttack",
    { attacker: "dragon", targetReel: 4 },
  ));
  await layer.play(beat("clash.multicolor-surge", "subtle"), command(
    "upgradeStickyReel",
    { reel: 2, appliedMultiplier: 25, advantage: "wizard" },
  ));

  assert.deepEqual(view.actions, [
    "fire:7:2:full",
    "magic:4:2:full",
    "impact:2:balanced:50:6",
    "blocked:dragon:4:12",
    "surge:2:25:12",
  ]);
});
