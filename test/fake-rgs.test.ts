import assert from "node:assert/strict";
import test from "node:test";

import { rgsAmount } from "../src/domain/money.js";
import { FakeRgsPort } from "../src/testing/fake-rgs.js";
import {
  activeRound,
  authenticated,
  debitedBalance,
  paidBalance,
} from "./fixtures.js";

test("fake adapter records contract calls without importing an upstream SDK", async () => {
  const fake = new FakeRgsPort({
    authenticate: async () => authenticated(),
    play: async () => ({ balance: debitedBalance, round: activeRound }),
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: paidBalance }),
    balance: async () => ({ balance: paidBalance }),
  });

  const request = { amount: rgsAmount(1_000_000), mode: "BASE" };
  await fake.authenticate();
  await fake.play(request);
  await fake.checkpoint("1");
  await fake.endRound();
  await fake.balance();

  assert.deepEqual(fake.calls, [
    { operation: "authenticate" },
    { operation: "play", input: request },
    { operation: "checkpoint", input: "1" },
    { operation: "end-round" },
    { operation: "balance" },
  ]);
});
