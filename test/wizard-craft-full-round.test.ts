import assert from "node:assert/strict";
import test from "node:test";

import type { PlayRequest, Round } from "../src/domain/rgs.js";
import type { RecoveryState } from "../src/recovery/machine.js";
import {
  WizardCraftFullRoundController,
  WizardCraftUiController,
  type WizardCraftMode,
  type WizardCraftRenderCommand,
  type WizardCraftRgsEvent,
} from "../src/index.js";
import { balance, config, jurisdiction } from "./fixtures.js";

const events: readonly WizardCraftRgsEvent[] = [
  {
    index: 0,
    type: "reveal",
    board: Array.from({ length: 5 }, () =>
      Array.from({ length: 4 }, () => ({ name: "EMBER" }))
    ),
    gameType: "basegame",
    mode: "baseBattle",
    anticipation: [0, 0, 0, 0, 0],
  },
  { index: 1, type: "setTotalWin", amount: 0 },
  { index: 2, type: "finalWin", amount: 0 },
];

class FullRoundSession {
  state: RecoveryState<readonly WizardCraftRgsEvent[]> = {
    value: "idle",
    session: { balance, config, jurisdiction },
  };
  readonly listeners = new Set<
    (state: RecoveryState<readonly WizardCraftRgsEvent[]>) => void
  >();
  readonly checkpoints: string[] = [];
  completions = 0;

  async start(): Promise<void> {}

  async placeBet(
    request: PlayRequest & { readonly mode: WizardCraftMode },
  ): Promise<void> {
    const round: Round<readonly WizardCraftRgsEvent[]> = {
      id: 901,
      amount: request.amount,
      payout: request.amount,
      payoutMultiplier: 0,
      active: false,
      mode: request.mode,
      event: "0",
      state: events,
    };
    this.setState({
      value: "active",
      session: { balance, config, jurisdiction },
      round,
      resumed: false,
    });
  }

  async checkpoint(event: string): Promise<void> {
    this.checkpoints.push(event);
  }

  async completePresentation(): Promise<void> {
    this.completions += 1;
    this.setState({
      value: "idle",
      session: { balance, config, jurisdiction },
    });
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

test("full-round driver renders, checkpoints, and settles before resolving", async () => {
  const session = new FullRoundSession();
  const ui = new WizardCraftUiController(session);
  const rendered: WizardCraftRenderCommand[] = [];
  const driver = new WizardCraftFullRoundController(
    ui,
    session,
    {
      render(command): void {
        rendered.push(command);
      },
    },
    { now: () => 0, sleep: async () => undefined },
  );

  await driver.playFullRound();

  assert.deepEqual(rendered.map((command) => command.event.index), [0, 1, 2]);
  assert.deepEqual(session.checkpoints, ["0", "1", "2"]);
  assert.equal(session.completions, 1);
  assert.equal(driver.controlState.ui.phase, "ready");
  ui.dispose();
});

test("full-round driver does not overlap an already-running result", async () => {
  const session = new FullRoundSession();
  const ui = new WizardCraftUiController(session);
  let release: (() => void) | undefined;
  let renders = 0;
  const driver = new WizardCraftFullRoundController(ui, session, {
    render: () => {
      renders += 1;
      return renders === 1
        ? new Promise<void>((resolve) => {
          release = resolve;
        })
        : undefined;
    },
  });

  const active = driver.playFullRound();
  await Promise.resolve();
  await assert.rejects(
    () => driver.playFullRound(),
    /full round is already running/,
  );
  release?.();
  await active;
  ui.dispose();
});
