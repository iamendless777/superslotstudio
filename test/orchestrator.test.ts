import assert from "node:assert/strict";
import test from "node:test";

import { RgsPortError, rejectedRgsFailure } from "../src/domain/error.js";
import { rgsAmount } from "../src/domain/money.js";
import type { PlayResult } from "../src/domain/rgs.js";
import {
  OrchestratorDisposedError,
  RecoveryOrchestrator,
} from "../src/orchestration/orchestrator.js";
import type { RecoveryState } from "../src/recovery/machine.js";
import { FakeRgsPort } from "../src/testing/fake-rgs.js";
import {
  activeRound,
  authenticated,
  balance,
  completedRound,
  debitedBalance,
  paidBalance,
} from "./fixtures.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function standardFake() {
  return new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(),
    play: async () => ({ balance: debitedBalance, round: activeRound }),
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
  });
}

test("orchestrates authenticate, play, checkpoint, and end-round in order", async () => {
  const fake = standardFake();
  const states: string[] = [];
  const orchestrator = new RecoveryOrchestrator({
    port: fake,
    onStateChange: (state) => states.push(state.value),
  });

  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({
    type: "PLACE_BET",
    request: { amount: rgsAmount(1_000_000), mode: "BASE" },
  });
  await orchestrator.dispatch({ type: "CHECKPOINT", event: "1" });
  await orchestrator.dispatch({ type: "PRESENTATION_COMPLETED" });

  assert.equal(orchestrator.state.value, "idle");
  assert.deepEqual(
    fake.calls.map((call) => call.operation),
    ["authenticate", "play", "checkpoint", "end-round"],
  );
  assert.deepEqual(states, [
    "reconciling",
    "idle",
    "starting",
    "active",
    "active",
    "ending",
    "idle",
  ]);
});

test("matches web-sdk immediate settlement for a normal non-bonus win", async () => {
  const normalWin = {
    ...completedRound,
    payout: rgsAmount(2_000_000),
    payoutMultiplier: 2,
  };
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(),
    play: async () => ({ balance: debitedBalance, round: normalWin }),
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({ port: fake });
  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({
    type: "PLACE_BET",
    request: { amount: rgsAmount(1_000_000), mode: "BASE" },
  });

  assert.equal(orchestrator.state.value, "active");
  assert.deepEqual(fake.calls.map((call) => call.operation), [
    "authenticate",
    "play",
    "end-round",
  ]);
  assert.equal(
    orchestrator.state.value === "active" && orchestrator.state.session.balance.amount,
    debitedBalance.amount,
  );

  await orchestrator.dispatch({ type: "PRESENTATION_COMPLETED" });
  const completedState = orchestrator.state as unknown as RecoveryState<readonly string[]>;
  assert.equal(completedState.value, "idle");
  assert.equal(
    completedState.value === "idle" && completedState.session.balance.amount,
    paidBalance.amount,
  );
});

test("reconciles a committed ambiguous play through Authenticate", async () => {
  let round = null as typeof activeRound | null;
  let currentBalance = balance;
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(round, currentBalance),
    play: async () => {
      round = activeRound;
      currentBalance = debitedBalance;
      throw new Error("response interrupted");
    },
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({ port: fake });
  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({
    type: "PLACE_BET",
    request: { amount: rgsAmount(1_000_000), mode: "BASE" },
  });

  assert.equal(orchestrator.state.value, "active");
  assert.equal(
    orchestrator.state.value === "active" && orchestrator.state.resumed,
    true,
  );
  assert.deepEqual(
    fake.calls.map((call) => call.operation),
    ["authenticate", "play", "authenticate"],
  );
});

test("returns idle after an uncommitted ambiguous play", async () => {
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(),
    play: async () => {
      throw new Error("request did not commit");
    },
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({ port: fake });
  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({
    type: "PLACE_BET",
    request: { amount: rgsAmount(1_000_000), mode: "BASE" },
  });
  assert.equal(orchestrator.state.value, "idle");
  assert.deepEqual(
    fake.calls.map((call) => call.operation),
    ["authenticate", "play", "authenticate"],
  );
});

test("does not reconcile a definite rejected play", async () => {
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(),
    play: async () => {
      throw new RgsPortError(
        rejectedRgsFailure("play", "ERR_IPB", "insufficient balance"),
      );
    },
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({ port: fake });
  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({
    type: "PLACE_BET",
    request: { amount: rgsAmount(1_000_000), mode: "BASE" },
  });
  assert.equal(orchestrator.state.value, "idle");
  assert.equal(
    orchestrator.state.value === "idle" && orchestrator.state.lastFailure?.code,
    "ERR_IPB",
  );
  assert.deepEqual(
    fake.calls.map((call) => call.operation),
    ["authenticate", "play"],
  );
});

test("fails closed on a definite invalid-session play rejection", async () => {
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(),
    play: async () => {
      throw new RgsPortError(
        rejectedRgsFailure("play", "ERR_IS", "session expired"),
      );
    },
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({ port: fake });
  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({
    type: "PLACE_BET",
    request: { amount: rgsAmount(1_000_000), mode: "BASE" },
  });
  assert.equal(orchestrator.state.value, "failed-closed");
});

test("reconciles ambiguous end-round without blind retry", async () => {
  let round = activeRound as typeof activeRound | null;
  let currentBalance = debitedBalance;
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(round, currentBalance),
    play: async () => ({ balance: debitedBalance, round: activeRound }),
    checkpoint: async (event) => ({ event }),
    endRound: async () => {
      round = completedRound;
      currentBalance = paidBalance;
      throw new Error("response interrupted");
    },
  });
  const orchestrator = new RecoveryOrchestrator({ port: fake });
  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({ type: "PRESENTATION_COMPLETED" });

  assert.equal(orchestrator.state.value, "idle");
  assert.deepEqual(
    fake.calls.map((call) => call.operation),
    ["authenticate", "end-round", "authenticate"],
  );
});

test("checkpoint failure is observed but does not alter active state", async () => {
  const failures: string[] = [];
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(activeRound, debitedBalance),
    play: async () => ({ balance: debitedBalance, round: activeRound }),
    checkpoint: async () => {
      throw new Error("checkpoint unavailable");
    },
    endRound: async () => ({ balance: paidBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({
    port: fake,
    onCheckpointFailure: (failure) => failures.push(failure.kind),
  });
  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({ type: "CHECKPOINT", event: "2" });
  assert.equal(orchestrator.state.value, "active");
  assert.deepEqual(failures, ["ambiguous"]);
});

test("observer exceptions cannot interrupt recovery sequencing", async () => {
  const observerErrors: string[] = [];
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(activeRound, debitedBalance),
    play: async () => ({ balance: debitedBalance, round: activeRound }),
    checkpoint: async () => {
      throw new Error("checkpoint unavailable");
    },
    endRound: async () => ({ balance: paidBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({
    port: fake,
    onStateChange: () => {
      throw new Error("broken state observer");
    },
    onCheckpointFailure: () => {
      throw new Error("broken checkpoint observer");
    },
    onObserverError: (_error, observer) => observerErrors.push(observer),
  });

  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({ type: "CHECKPOINT", event: "2" });

  assert.equal(orchestrator.state.value, "active");
  assert.deepEqual(observerErrors, [
    "state-change",
    "state-change",
    "state-change",
    "checkpoint-failure",
  ]);
});

test("a throwing observer-error hook is also isolated", async () => {
  const orchestrator = new RecoveryOrchestrator({
    port: standardFake(),
    onStateChange: () => {
      throw new Error("broken state observer");
    },
    onObserverError: () => {
      throw new Error("broken error observer");
    },
  });

  await orchestrator.dispatch({ type: "BOOT" });
  assert.equal(orchestrator.state.value, "idle");
});

test("serializes duplicate bet commands so only one Play is emitted", async () => {
  const play = deferred<PlayResult<readonly string[]>>();
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(),
    play: async () => play.promise,
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({ port: fake });
  await orchestrator.dispatch({ type: "BOOT" });
  const event = {
    type: "PLACE_BET" as const,
    request: { amount: rgsAmount(1_000_000), mode: "BASE" },
  };
  const first = orchestrator.dispatch(event);
  const second = orchestrator.dispatch(event);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    fake.calls.filter((call) => call.operation === "play").length,
    1,
  );
  play.resolve({ balance: debitedBalance, round: activeRound });
  await Promise.all([first, second]);
  assert.equal(
    fake.calls.filter((call) => call.operation === "play").length,
    1,
  );
  assert.equal(orchestrator.state.value, "active");
});

test("dispose suppresses late results and rejects new work", async () => {
  const play = deferred<PlayResult<readonly string[]>>();
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => authenticated(),
    play: async () => play.promise,
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({ port: fake });
  await orchestrator.dispatch({ type: "BOOT" });
  const pending = orchestrator.dispatch({
    type: "PLACE_BET",
    request: { amount: rgsAmount(1_000_000), mode: "BASE" },
  });
  await new Promise((resolve) => setImmediate(resolve));
  orchestrator.dispose();
  play.resolve({ balance: debitedBalance, round: activeRound });
  await pending;
  assert.equal(orchestrator.state.value, "starting");
  await assert.rejects(
    orchestrator.dispatch({ type: "PRESENTATION_COMPLETED" }),
    OrchestratorDisposedError,
  );
});

test("failed authentication fails closed", async () => {
  const fake = new FakeRgsPort<readonly string[]>({
    authenticate: async () => {
      throw new Error("offline");
    },
    play: async () => ({ balance: debitedBalance, round: activeRound }),
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({ port: fake });
  await orchestrator.dispatch({ type: "BOOT" });
  assert.equal(orchestrator.state.value, "failed-closed");
});
