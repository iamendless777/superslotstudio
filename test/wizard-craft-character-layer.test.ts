import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_CHARACTER_PALETTES,
  WizardCraftCharacterLayer,
  applyWizardCraftRgsEvent,
  createWizardCraftRuntimeState,
  type WizardCraftCharacterState,
  type WizardCraftCharacterView,
  type WizardCraftPresentationBeat,
  type WizardCraftRenderCommand,
} from "../src/index.js";

class CharacterView implements WizardCraftCharacterView {
  state: WizardCraftCharacterState | null = null;
  readonly actions: string[] = [];
  setState(state: WizardCraftCharacterState): void {
    this.state = state;
  }
  windup(
    intensity: "quick" | "heavy",
    motion: WizardCraftPresentationBeat["motion"],
  ): void {
    this.actions.push(`windup:${intensity}:${motion}`);
  }
  brace(motion: WizardCraftPresentationBeat["motion"]): void {
    this.actions.push(`brace:${motion}`);
  }
  counter(motion: WizardCraftPresentationBeat["motion"]): void {
    this.actions.push(`counter:${motion}`);
  }
  launch(motion: WizardCraftPresentationBeat["motion"]): void {
    this.actions.push(`launch:${motion}`);
  }
  claim(motion: WizardCraftPresentationBeat["motion"]): void {
    this.actions.push(`claim:${motion}`);
  }
  recoil(motion: WizardCraftPresentationBeat["motion"]): void {
    this.actions.push(`recoil:${motion}`);
  }
  containAttack(motion: WizardCraftPresentationBeat["motion"]): void {
    this.actions.push(`contained:${motion}`);
  }
  block(motion: WizardCraftPresentationBeat["motion"]): void {
    this.actions.push(`block:${motion}`);
  }
  cancelAnimations(): void {
    this.actions.push("cancel");
  }
  destroy(): void {
    this.actions.push("destroy");
  }
}

function beat(
  side: "dragon" | "wizard",
  action: string,
  motion: WizardCraftPresentationBeat["motion"] = "full",
): WizardCraftPresentationBeat {
  return {
    id: `${side}.${action}`,
    channel: side,
    startMs: 0,
    durationMs: 100,
    motion,
  };
}

function command(
  type: string,
  extra: Record<string, unknown> = {},
): WizardCraftRenderCommand {
  const state = createWizardCraftRuntimeState();
  return {
    event: { index: 0, type, ...extra },
    before: state,
    after: state,
    cue: { eventIndex: 0, eventType: type, durationMs: 1, beats: [] },
  };
}

test("locks Dragon red/oxblood and Wizard blue/white identities", () => {
  assert.deepEqual(WIZARD_CRAFT_CHARACTER_PALETTES.dragon, {
    primary: "red",
    shadow: "oxblood",
    energy: "multicolor-fire",
  });
  assert.deepEqual(WIZARD_CRAFT_CHARACTER_PALETTES.wizard, {
    primary: "blue",
    shadow: "midnight-blue",
    energy: "blue-white-magic",
  });
});

test("sync restores feature tier, cap, and character-linked reel presence", () => {
  const dragonView = new CharacterView();
  const wizardView = new CharacterView();
  const dragon = new WizardCraftCharacterLayer("dragon", dragonView);
  const wizard = new WizardCraftCharacterLayer("wizard", wizardView);
  let state = applyWizardCraftRgsEvent(createWizardCraftRuntimeState(), {
    index: 0,
    type: "startDuel",
    tier: 3,
    totalFs: 12,
  });
  state = applyWizardCraftRgsEvent(state, {
    index: 1,
    type: "expandVsReel",
    reel: 1,
    appliedMultiplier: 10,
    dragonMultiplier: 7,
    wizardMultiplier: 3,
    advantage: "dragon",
    persistence: "sticky",
  });
  state = applyWizardCraftRgsEvent(state, {
    index: 2,
    type: "expandVsReel",
    reel: 4,
    appliedMultiplier: 25,
    dragonMultiplier: 12,
    wizardMultiplier: 13,
    advantage: "balanced",
    persistence: "sticky",
  });
  state = { ...state, capped: true };

  dragon.sync(state);
  wizard.sync(state);

  assert.equal(dragonView.state?.tier, 3);
  assert.equal(dragonView.state?.claimedReels, 1);
  assert.equal(dragonView.state?.opposingReels, 0);
  assert.equal(dragonView.state?.balancedReels, 1);
  assert.equal(dragonView.state?.capped, true);
  assert.equal(wizardView.state?.claimedReels, 0);
  assert.equal(wizardView.state?.opposingReels, 1);
  assert.equal(wizardView.state?.balancedReels, 1);
});

test("holds prepared attacker and defender roles across the event checkpoint", () => {
  const dragonView = new CharacterView();
  const wizardView = new CharacterView();
  const dragon = new WizardCraftCharacterLayer("dragon", dragonView);
  const wizard = new WizardCraftCharacterLayer("wizard", wizardView);
  const prepared = applyWizardCraftRgsEvent(createWizardCraftRuntimeState(), {
    index: 0,
    type: "prepareAttack",
    side: "dragon",
    targetReel: 3,
    intensity: "heavy",
  });

  dragon.sync(prepared);
  wizard.sync(prepared);

  assert.equal(dragonView.state?.prepared, "attacker");
  assert.equal(wizardView.state?.prepared, "defender");
  assert.deepEqual(prepared.pendingAttack, {
    side: "dragon",
    targetReel: 3,
    intensity: "heavy",
  });
});

test("routes attack, reaction, and block choreography to the correct character", async () => {
  const view = new CharacterView();
  const dragon = new WizardCraftCharacterLayer("dragon", view);
  await dragon.play(beat("dragon", "heavy-windup"), command(
    "prepareAttack",
    { intensity: "heavy" },
  ));
  await dragon.play(beat("dragon", "anticipation"), command("reveal"));
  await dragon.play(beat("dragon", "launch"), command("expandVsReel"));
  await dragon.play(beat("dragon", "claim", "subtle"), command("expandVsReel"));
  await dragon.play(beat("dragon", "recoil", "none"), command("expandVsReel"));
  await dragon.play(
    beat("dragon", "attack-contained"),
    command("blockAttack"),
  );
  await dragon.play(beat("dragon", "block"), command("blockAttack"));

  assert.deepEqual(view.actions, [
    "windup:heavy:full",
    "windup:quick:full",
    "launch:full",
    "claim:subtle",
    "recoil:none",
    "contained:full",
    "block:full",
  ]);
  await assert.rejects(
    () => dragon.play(beat("wizard", "brace"), command("expandVsReel")),
    /cannot play/,
  );
});
