import assert from "node:assert/strict";
import test from "node:test";

import type { RgsFailure } from "../src/domain/error.js";
import { rgsAmount } from "../src/domain/money.js";
import type { RecoveryState } from "../src/recovery/machine.js";
import {
  createInitialRecoveryState,
  initialRecoveryState,
  transition,
} from "../src/recovery/machine.js";
import {
  activeRound,
  authenticated,
  balance,
  completedRound,
  debitedBalance,
  paidBalance,
} from "./fixtures.js";

const ambiguousFailure: RgsFailure = {
  kind: "ambiguous",
  operation: "play",
  code: "UNKNOWN",
  message: "response path interrupted",
};

function bootToIdle(): RecoveryState<readonly string[]> {
  const booted = transition(createInitialRecoveryState<readonly string[]>(), {
    type: "BOOT",
  });
  assert.deepEqual(booted.commands, [{ type: "AUTHENTICATE" }]);
  return transition(booted.state, {
    type: "AUTHENTICATED",
    result: authenticated(),
  }).state;
}

test("boots through authoritative authentication", () => {
  const booted = transition(initialRecoveryState, { type: "BOOT" });
  assert.deepEqual(booted.state, { value: "reconciling", reason: "boot" });
  assert.deepEqual(booted.commands, [{ type: "AUTHENTICATE" }]);

  const ready = transition(booted.state, {
    type: "AUTHENTICATED",
    result: authenticated(),
  });
  assert.equal(ready.state.value, "idle");
  assert.deepEqual(ready.commands, []);
});

test("runs a successful active round and settles from the RGS balance", () => {
  const idle = bootToIdle();
  const request = { amount: rgsAmount(1_000_000), mode: "BASE" };
  const starting = transition(idle, { type: "PLACE_BET", request });
  assert.equal(starting.state.value, "starting");
  assert.deepEqual(starting.commands, [{ type: "PLAY", request }]);

  const active = transition(starting.state, {
    type: "PLAY_SUCCEEDED",
    balance: debitedBalance,
    round: activeRound,
  });
  assert.equal(active.state.value, "active");

  const ending = transition(active.state, { type: "PRESENTATION_COMPLETED" });
  assert.equal(ending.state.value, "ending");
  assert.deepEqual(ending.commands, [{ type: "END_ROUND" }]);

  const settled = transition(ending.state, {
    type: "END_ROUND_SUCCEEDED",
    balance: paidBalance,
  });
  assert.equal(settled.state.value, "idle");
  assert.equal(
    settled.state.value === "idle" && settled.state.session.balance.amount,
    11_000_000,
  );
});

test("does not end an already completed round", () => {
  const idle = bootToIdle();
  const request = { amount: rgsAmount(1_000_000), mode: "BASE" };
  const starting = transition(idle, { type: "PLACE_BET", request });
  const active = transition(starting.state, {
    type: "PLAY_SUCCEEDED",
    balance,
    round: completedRound,
  });
  const completed = transition(active.state, {
    type: "PRESENTATION_COMPLETED",
  });
  assert.equal(completed.state.value, "idle");
  assert.deepEqual(completed.commands, []);
});

test("rejects bets outside authenticated constraints without issuing Play", () => {
  const idle = bootToIdle();
  for (const request of [
    { amount: rgsAmount(99_999), mode: "BASE" },
    { amount: rgsAmount(100_001), mode: "BASE" },
    { amount: rgsAmount(1_000_000), mode: "" },
  ]) {
    const rejected = transition(idle, { type: "PLACE_BET", request });
    assert.equal(rejected.state.value, "idle");
    assert.equal(
      rejected.state.value === "idle" && rejected.state.lastFailure?.code,
      "ERR_VAL",
    );
    assert.deepEqual(rejected.commands, []);
  }
});

test("reconciles an ambiguous committed play without issuing another play", () => {
  const idle = bootToIdle();
  const request = { amount: rgsAmount(1_000_000), mode: "BASE" };
  const starting = transition(idle, { type: "PLACE_BET", request });
  const uncertain = transition(starting.state, { type: "PLAY_AMBIGUOUS" });
  assert.deepEqual(uncertain.commands, [{ type: "AUTHENTICATE" }]);

  const recovered = transition(uncertain.state, {
    type: "AUTHENTICATED",
    result: authenticated(activeRound, debitedBalance),
  });
  assert.equal(recovered.state.value, "active");
  assert.equal(
    recovered.state.value === "active" && recovered.state.resumed,
    true,
  );
  assert.deepEqual(recovered.commands, []);
});

test("fails closed on terminal session, authentication, limit, and location rejections", () => {
  const request = { amount: rgsAmount(1_000_000), mode: "BASE" };
  for (const code of ["ERR_IS", "ERR_ATE", "ERR_GLE", "ERR_LOC"] as const) {
    const starting = transition(bootToIdle(), { type: "PLACE_BET", request });
    const rejected = transition(starting.state, {
      type: "PLAY_REJECTED",
      failure: { kind: "rejected", operation: "play", code, message: code },
    });
    assert.equal(rejected.state.value, "failed-closed");
    assert.deepEqual(rejected.commands, []);
  }
});

test("returns idle when an ambiguous play did not commit", () => {
  const idle = bootToIdle();
  const request = { amount: rgsAmount(1_000_000), mode: "BASE" };
  const starting = transition(idle, { type: "PLACE_BET", request });
  const uncertain = transition(starting.state, { type: "PLAY_AMBIGUOUS" });
  const recovered = transition(uncertain.state, {
    type: "AUTHENTICATED",
    result: authenticated(null, balance),
  });
  assert.equal(recovered.state.value, "idle");
  assert.deepEqual(recovered.commands, []);
});

test("reconciles ambiguous end-round from authoritative state", () => {
  const activeState = transition(
    transition(createInitialRecoveryState<readonly string[]>(), {
      type: "BOOT",
    }).state,
    {
      type: "AUTHENTICATED",
      result: authenticated(activeRound, debitedBalance),
    },
  ).state;
  const ending = transition(activeState, { type: "PRESENTATION_COMPLETED" });
  const uncertain = transition(ending.state, { type: "END_ROUND_AMBIGUOUS" });
  assert.deepEqual(uncertain.commands, [{ type: "AUTHENTICATE" }]);

  const committed = transition(uncertain.state, {
    type: "AUTHENTICATED",
    result: authenticated(completedRound, paidBalance),
  });
  assert.equal(committed.state.value, "idle");

  const stillActive = transition(uncertain.state, {
    type: "AUTHENTICATED",
    result: authenticated(activeRound, debitedBalance),
  });
  assert.equal(stillActive.state.value, "active");
});

test("checkpointing never mutates monetary state", () => {
  const activeState = transition(
    transition(createInitialRecoveryState<readonly string[]>(), {
      type: "BOOT",
    }).state,
    {
      type: "AUTHENTICATED",
      result: authenticated(activeRound, debitedBalance),
    },
  ).state;
  const checkpoint = transition(activeState, {
    type: "CHECKPOINT",
    event: "2",
  });
  assert.strictEqual(checkpoint.state, activeState);
  assert.deepEqual(checkpoint.commands, [{ type: "CHECKPOINT", event: "2" }]);
});

test("invalid responses and failed reconciliation fail closed", () => {
  const invalid = transition(initialRecoveryState, {
    type: "INVALID_RESPONSE",
    failure: {
      ...ambiguousFailure,
      kind: "invalid-response",
      operation: "authenticate",
    },
  });
  assert.equal(invalid.state.value, "failed-closed");

  const reconciling = transition(initialRecoveryState, { type: "BOOT" });
  const failed = transition(reconciling.state, {
    type: "AUTHENTICATION_FAILED",
    failure: { ...ambiguousFailure, operation: "authenticate" },
  });
  assert.equal(failed.state.value, "failed-closed");
  assert.deepEqual(failed.commands, []);
});

test("ignores illegal events instead of issuing side effects", () => {
  const idle = bootToIdle();
  const unchanged = transition(idle, { type: "END_ROUND_AMBIGUOUS" });
  assert.strictEqual(unchanged.state, idle);
  assert.deepEqual(unchanged.commands, []);
});
