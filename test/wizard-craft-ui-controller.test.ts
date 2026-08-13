import assert from "node:assert/strict";
import test from "node:test";

import { rgsAmount } from "../src/domain/money.js";
import type { PlayRequest } from "../src/domain/rgs.js";
import type { RecoveryState } from "../src/recovery/machine.js";
import {
  WizardCraftUiController,
  type WizardCraftMode,
  type WizardCraftRgsEvent,
} from "../src/index.js";
import { balance, config, jurisdiction } from "./fixtures.js";

class UiSession {
  state: RecoveryState<readonly WizardCraftRgsEvent[]> = {
    value: "uninitialized",
  };
  readonly plays: PlayRequest[] = [];
  readonly listeners = new Set<
    (state: RecoveryState<readonly WizardCraftRgsEvent[]>) => void
  >();

  async start(): Promise<void> {
    this.setState({
      value: "idle",
      session: { balance, config, jurisdiction },
    });
  }

  async placeBet(
    request: PlayRequest & { readonly mode: WizardCraftMode },
  ): Promise<void> {
    this.plays.push(request);
  }

  subscribe(
    listener: (
      state: RecoveryState<readonly WizardCraftRgsEvent[]>,
    ) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setState(state: RecoveryState<readonly WizardCraftRgsEvent[]>): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener(state);
  }
}

test("binds authenticated amount levels, modes, speeds, and base intent", async () => {
  const session = new UiSession();
  const controller = new WizardCraftUiController(session);
  await controller.start();

  assert.deepEqual(controller.state.amountOptions, config.betLevels);
  assert.equal(controller.state.selectedAmount, config.defaultBetLevel);
  assert.deepEqual(
    controller.state.modes.map((mode) => [mode.id, mode.cost]),
    [
      ["baseBattle", 1],
      ["runeSpark", 3],
      ["siegeSigns", 10],
      ["openGrimoire", 100],
    ],
  );
  controller.selectAmount(rgsAmount(100_000));
  controller.selectMode("siegeSigns");
  controller.selectSpeed("superTurbo");
  await controller.play();

  assert.deepEqual(session.plays, [{
    amount: rgsAmount(100_000),
    mode: "siegeSigns",
  }]);
  controller.dispose();
});

test("rejects amounts absent from authenticated betLevels", async () => {
  const session = new UiSession();
  const controller = new WizardCraftUiController(session);
  await controller.start();
  assert.throws(
    () => controller.selectAmount(rgsAmount(500_000)),
    /amount is unavailable/,
  );
  controller.dispose();
});

test("removes jurisdiction-disabled mode, speed, autoplay, and keyboard intent", () => {
  const session = new UiSession();
  session.state = {
    value: "idle",
    session: {
      balance,
      config,
      jurisdiction: {
        ...jurisdiction,
        disabledBuyFeature: true,
        disabledTurbo: true,
        disabledSuperTurbo: true,
        disabledAutoplay: true,
        disabledSpacebar: true,
      },
    },
  };
  const controller = new WizardCraftUiController(session);
  assert.equal(
    controller.state.modes.find((mode) => mode.id === "openGrimoire")?.available,
    false,
  );
  assert.deepEqual(controller.state.speeds, ["normal"]);
  assert.throws(() => controller.selectMode("openGrimoire"), /mode is unavailable/);
  assert.throws(() => controller.selectSpeed("turbo"), /speed is unavailable/);
  assert.throws(() => controller.requestAutoplay(10), /request is unavailable/);
  return controller.handleSpacebar(true).then((handled) => {
    assert.equal(handled, false);
    assert.equal(session.plays.length, 0);
    controller.dispose();
  });
});

test("requires explicit autoplay confirmation and bounds the requested count", async () => {
  const session = new UiSession();
  const controller = new WizardCraftUiController(session);
  await controller.start();

  for (const invalid of [0, 1.5, 1_001]) {
    assert.throws(() => controller.requestAutoplay(invalid));
  }
  controller.requestAutoplay(25);
  assert.equal(controller.state.autoplayConfirmation, 25);
  assert.equal(session.plays.length, 0);
  assert.equal(controller.confirmAutoplay(), 25);
  assert.equal(controller.state.autoplayConfirmation, null);
  assert.equal(session.plays.length, 0);

  controller.requestAutoplay(10);
  controller.cancelAutoplayConfirmation();
  assert.equal(controller.state.autoplayConfirmation, null);
  controller.dispose();
});

test("maps spacebar to one play only when focus and policy allow it", async () => {
  const session = new UiSession();
  const controller = new WizardCraftUiController(session);
  await controller.start();

  assert.equal(await controller.handleSpacebar(false), false);
  assert.equal(session.plays.length, 0);
  assert.equal(await controller.handleSpacebar(true), true);
  assert.equal(session.plays.length, 1);
  controller.dispose();
});

test("locks selection outside idle and resets unavailable selections", async () => {
  const session = new UiSession();
  const controller = new WizardCraftUiController(session);
  await controller.start();
  controller.selectMode("openGrimoire");
  controller.selectSpeed("superTurbo");

  session.setState({
    value: "idle",
    session: {
      balance,
      config,
      jurisdiction: {
        ...jurisdiction,
        disabledBuyFeature: true,
        disabledSuperTurbo: true,
      },
    },
  });
  assert.equal(controller.state.selectedMode, "baseBattle");
  assert.equal(controller.state.selectedSpeed, "normal");

  session.setState({
    value: "starting",
    session: { balance, config, jurisdiction },
    request: { amount: rgsAmount(1_000_000), mode: "baseBattle" },
  });
  assert.throws(() => controller.selectMode("runeSpark"));
  assert.throws(() => controller.selectAmount(rgsAmount(100_000)));
  controller.dispose();
});
