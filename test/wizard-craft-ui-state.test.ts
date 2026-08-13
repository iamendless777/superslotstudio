import assert from "node:assert/strict";
import test from "node:test";

import type { RgsErrorCode } from "../src/domain/error.js";
import { rgsAmount } from "../src/domain/money.js";
import type { RecoveryState } from "../src/recovery/machine.js";
import {
  getWizardCraftUiState,
  type WizardCraftRgsEvent,
} from "../src/index.js";
import { balance, config, jurisdiction } from "./fixtures.js";

const session = { balance, config, jurisdiction };

test("locks controls throughout connection, play, recovery, and settlement", () => {
  const states: Array<RecoveryState<readonly WizardCraftRgsEvent[]>> = [
    { value: "uninitialized" },
    { value: "reconciling", reason: "boot" },
    {
      value: "starting",
      session,
      request: { amount: rgsAmount(1_000_000), mode: "baseBattle" },
    },
    {
      value: "active",
      session,
      resumed: true,
      round: {
        id: 1,
        amount: rgsAmount(1_000_000),
        payout: rgsAmount(0),
        payoutMultiplier: 0,
        active: true,
        mode: "baseBattle",
        event: "1",
        state: [],
      },
    },
    {
      value: "ending",
      session,
      round: {
        id: 1,
        amount: rgsAmount(1_000_000),
        payout: rgsAmount(0),
        payoutMultiplier: 0,
        active: true,
        mode: "baseBattle",
        event: "2",
        state: [],
      },
    },
  ];
  for (const state of states) {
    const view = getWizardCraftUiState(state);
    assert.equal(view.canPlay, false, state.value);
    assert.equal(view.canChangeAmount, false, state.value);
    assert.equal(view.canChangeMode, false, state.value);
  }
  assert.equal(getWizardCraftUiState(states[3]!).resumedRound, true);
});

test("enables player intent only in idle and retains server balance", () => {
  const view = getWizardCraftUiState({ value: "idle", session });
  assert.equal(view.phase, "ready");
  assert.equal(view.canPlay, true);
  assert.equal(view.canChangeAmount, true);
  assert.equal(view.canChangeMode, true);
  assert.deepEqual(view.balance, { amount: balance.amount, unit: "USD" });
  assert.equal(view.policy?.showRtp, true);
});

test("maps every documented failure to safe copy without leaking raw errors", () => {
  const codes: readonly RgsErrorCode[] = [
    "ERR_VAL", "ERR_IPB", "ERR_IS", "ERR_ATE", "ERR_GLE", "ERR_LOC",
    "ERR_GEN", "ERR_MAINTENANCE", "UNKNOWN",
  ];
  for (const code of codes) {
    const secret = `internal-${code}-trace`;
    const view = getWizardCraftUiState({
      value: "failed-closed",
      failure: {
        kind: "rejected",
        operation: "play",
        code,
        message: secret,
      },
    });
    assert.equal(view.phase, "blocked");
    assert.equal(view.requiresReload, true);
    assert.equal(view.failureCode, code);
    assert.equal(view.canPlay, false);
    assert.doesNotMatch(JSON.stringify(view), new RegExp(secret));
  }
});

test("gives malformed server state distinct fail-closed copy", () => {
  const view = getWizardCraftUiState({
    value: "failed-closed",
    failure: {
      kind: "invalid-response",
      operation: "play",
      code: "UNKNOWN",
      message: "raw parser internals",
    },
  });
  assert.equal(view.headline, "Result could not be verified");
  assert.match(view.message, /Presentation is stopped/);
  assert.equal(view.requiresReload, true);
  assert.doesNotMatch(JSON.stringify(view), /raw parser internals/);
});

test("keeps recoverable idle rejections visible without disabling correction", () => {
  const view = getWizardCraftUiState({
    value: "idle",
    session,
    lastFailure: {
      kind: "rejected",
      operation: "play",
      code: "ERR_IPB",
      message: "server detail",
    },
  });
  assert.equal(view.phase, "ready");
  assert.equal(view.headline, "Insufficient balance");
  assert.equal(view.canPlay, true);
  assert.equal(view.canChangeAmount, true);
  assert.equal(view.requiresReload, false);
});

test("uses terminology safe for standard and sweeps surfaces", () => {
  const sweeps = {
    ...session,
    jurisdiction: { ...jurisdiction, socialCasino: true },
  };
  const view = getWizardCraftUiState({ value: "idle", session: sweeps });
  const prohibited =
    /\b(?:bet|bets|wager|buy|bought|gamble|deposit|withdraw|cash|money|currency|fund|payer|rebet)\b|cost of/i;
  assert.doesNotMatch(JSON.stringify(view), prohibited);
  assert.equal(view.policy?.social, true);
});
