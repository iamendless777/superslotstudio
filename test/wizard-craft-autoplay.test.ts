import assert from "node:assert/strict";
import test from "node:test";

import {
  WizardCraftAutoplayRunner,
  type WizardCraftControlState,
  type WizardCraftFullRoundDriver,
} from "../src/index.js";

function controlState(
  canPlay = true,
  autoplay = true,
): WizardCraftControlState {
  return {
    ui: {
      phase: canPlay ? "ready" : "playing",
      headline: "",
      message: "",
      canPlay,
      canChangeAmount: canPlay,
      canChangeMode: canPlay,
      canOpenInformation: true,
      requiresReload: false,
      resumedRound: false,
      balance: null,
      policy: {
        social: false,
        showRtp: true,
        showNetPosition: false,
        showSessionTimer: false,
        fullscreen: true,
        autoplay,
        slamStop: true,
        spacebar: true,
        availableSpeeds: ["normal"],
        openGrimoire: true,
        minimumRoundDuration: 0,
      },
      failureCode: null,
    },
    amountOptions: [],
    selectedAmount: null,
    modes: [],
    selectedMode: "baseBattle",
    speeds: ["normal"],
    selectedSpeed: "normal",
    autoplayConfirmation: null,
  };
}

class RoundDriver implements WizardCraftFullRoundDriver {
  controlState = controlState();
  plays = 0;
  onPlay: (() => void) | undefined;

  async playFullRound(): Promise<void> {
    this.plays += 1;
    this.onPlay?.();
  }
}

test("runs confirmed autoplay sequentially through complete rounds", async () => {
  const driver = new RoundDriver();
  const runner = new WizardCraftAutoplayRunner(driver);
  const progress: string[] = [];
  runner.subscribe((state) => {
    progress.push(`${state.status}:${state.completed}/${state.requested}`);
  });

  await runner.startConfirmed(3);

  assert.equal(driver.plays, 3);
  assert.deepEqual(runner.state, {
    status: "completed",
    requested: 3,
    completed: 3,
    remaining: 0,
  });
  assert.deepEqual(progress, [
    "idle:0/0",
    "running:0/3",
    "running:1/3",
    "running:2/3",
    "running:3/3",
    "completed:3/3",
  ]);
});

test("stop finishes the in-progress round and prevents the next one", async () => {
  const driver = new RoundDriver();
  const runner = new WizardCraftAutoplayRunner(driver);
  driver.onPlay = () => {
    runner.stop();
  };

  await runner.startConfirmed(10);

  assert.equal(driver.plays, 1);
  assert.deepEqual(runner.state, {
    status: "stopped",
    requested: 10,
    completed: 1,
    remaining: 9,
  });
});

test("stops before another round if jurisdiction or UI availability changes", async () => {
  const driver = new RoundDriver();
  const runner = new WizardCraftAutoplayRunner(driver);
  driver.onPlay = () => {
    driver.controlState = controlState(true, false);
  };

  await runner.startConfirmed(5);

  assert.equal(driver.plays, 1);
  assert.equal(runner.state.status, "unavailable");
  assert.equal(runner.state.remaining, 4);
});

test("rejects unconfirmed shape, overlap, and initially unavailable autoplay", async () => {
  const driver = new RoundDriver();
  const runner = new WizardCraftAutoplayRunner(driver);

  await assert.rejects(() => runner.startConfirmed(0), /count is unavailable/);
  driver.controlState = controlState(false);
  await assert.rejects(() => runner.startConfirmed(10), /is unavailable/);

  driver.controlState = controlState();
  let release: (() => void) | undefined;
  driver.playFullRound = () => new Promise<void>((resolve) => {
    release = resolve;
  });
  const active = runner.startConfirmed(2);
  await assert.rejects(() => runner.startConfirmed(2), /already running/);
  assert.equal(runner.stop(), true);
  release?.();
  await active;
});
