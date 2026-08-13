import assert from "node:assert/strict";
import test from "node:test";

import { GameSession } from "../src/application/game-session.js";
import { rgsAmount } from "../src/domain/money.js";
import { OrchestratorDisposedError } from "../src/orchestration/orchestrator.js";
import { FakeRgsPort } from "../src/testing/fake-rgs.js";
import {
  activeRound,
  authenticated,
  debitedBalance,
  paidBalance,
} from "./fixtures.js";

function fakePort() {
  return new FakeRgsPort({
    authenticate: async () => authenticated(),
    play: async () => ({ balance: debitedBalance, round: activeRound }),
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
  });
}

test("exposes player intent without exposing internal recovery events", async () => {
  const port = fakePort();
  const session = new GameSession({ port });

  await session.start();
  await session.placeBet({ amount: rgsAmount(1_000_000), mode: "BASE" });
  await session.checkpoint("1");
  await session.completePresentation();

  assert.equal(session.state.value, "idle");
  assert.deepEqual(
    port.calls.map((call) => call.operation),
    ["authenticate", "play", "checkpoint", "end-round"],
  );
});

test("isolates state listener failures from recovery sequencing", async () => {
  const observerErrors: unknown[] = [];
  const states: string[] = [];
  const session = new GameSession({
    port: fakePort(),
    onObserverError: (error) => observerErrors.push(error),
  });
  session.subscribe(() => {
    throw new Error("broken view");
  });
  const unsubscribe = session.subscribe((state) => states.push(state.value));

  await session.start();
  unsubscribe();

  assert.equal(session.state.value, "idle");
  assert.deepEqual(states, ["uninitialized", "reconciling", "idle"]);
  assert.equal(observerErrors.length, 3);
});

test("disposal clears listeners and rejects subsequent player intent", async () => {
  let notifications = 0;
  const session = new GameSession({ port: fakePort() });
  session.subscribe(() => notifications++);
  session.dispose();
  session.dispose();

  await assert.rejects(session.start(), OrchestratorDisposedError);
  assert.equal(notifications, 1);
  assert.equal(session.state.value, "uninitialized");
});

test("refreshes idle balance only from the authoritative wallet endpoint", async () => {
  const port = new FakeRgsPort({
    authenticate: async () => authenticated(),
    play: async () => ({ balance: debitedBalance, round: activeRound }),
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
    balance: async () => ({ balance: paidBalance }),
  });
  const session = new GameSession({ port, balancePollMs: false });
  await session.start();
  await session.refreshBalance();

  assert.equal(session.state.value, "idle");
  assert.equal(
    session.state.value === "idle" && session.state.session.balance.amount,
    paidBalance.amount,
  );
  assert.deepEqual(port.calls.map((call) => call.operation), [
    "authenticate",
    "balance",
  ]);
  session.dispose();
});
