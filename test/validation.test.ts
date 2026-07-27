import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidRgsResponseError,
  parseAuthenticateResult,
  parseEndRoundResult,
  parseEventResult,
  parsePlayResult,
} from "../src/validation/rgs.js";

const validResponse = {
  balance: { amount: 10_000_000, currency: "USD" },
  config: {
    minBet: 100_000,
    maxBet: 100_000_000,
    stepBet: 100_000,
    defaultBetLevel: 1_000_000,
    betLevels: [100_000, 1_000_000],
    jurisdiction: {
      socialCasino: false,
      disabledFullscreen: false,
      disabledTurbo: false,
      disabledSuperTurbo: false,
      disabledAutoplay: false,
      disabledSlamstop: false,
      disabledSpacebar: false,
      disabledBuyFeature: false,
      displayNetPosition: false,
      displayRTP: true,
      displaySessionTimer: false,
      minimumRoundDuration: 0,
    },
  },
  round: {
    betID: 42,
    amount: 1_000_000,
    payout: 2_000_000,
    payoutMultiplier: 2,
    active: true,
    mode: "BASE",
    event: "1",
    state: [{ type: "reveal" }],
  },
};

test("parses a complete authenticate response into local contracts", () => {
  const result = parseAuthenticateResult(validResponse);
  assert.equal(result.balance.amount, 10_000_000);
  assert.equal(result.config.stepBet, 100_000);
  assert.equal(result.jurisdiction.displayRTP, true);
  assert.equal(result.round?.id, 42);
  assert.deepEqual(result.round?.state, [{ type: "reveal" }]);
});

test("accepts roundID and an absent round", () => {
  const withRoundId = structuredClone(validResponse);
  delete (withRoundId.round as { betID?: number }).betID;
  (withRoundId.round as { roundID?: number }).roundID = 7;
  assert.equal(parseAuthenticateResult(withRoundId).round?.id, 7);

  assert.equal(
    parseAuthenticateResult({ ...validResponse, round: null }).round,
    null,
  );
});

test("fails closed on unsafe monetary values", () => {
  const response = structuredClone(validResponse);
  response.balance.amount = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(
    () => parseAuthenticateResult(response),
    (error: unknown) =>
      error instanceof InvalidRgsResponseError &&
      error.path === "response.balance.amount",
  );
});

test("fails closed on malformed jurisdiction and incoherent bet config", () => {
  const badJurisdiction = structuredClone(validResponse);
  (
    badJurisdiction.config.jurisdiction as { disabledAutoplay: unknown }
  ).disabledAutoplay = "no";
  assert.throws(
    () => parseAuthenticateResult(badJurisdiction),
    InvalidRgsResponseError,
  );

  const badConfig = structuredClone(validResponse);
  badConfig.config.minBet = 2_000_000;
  badConfig.config.maxBet = 1_000_000;
  assert.throws(
    () => parseAuthenticateResult(badConfig),
    InvalidRgsResponseError,
  );

  const missingState: { round: Record<string, unknown> } & Record<
    string,
    unknown
  > = structuredClone(validResponse);
  delete missingState.round.state;
  assert.throws(
    () => parseAuthenticateResult(missingState),
    InvalidRgsResponseError,
  );
});

test("validates Play, EndRound, and Event endpoint results", () => {
  assert.equal(
    parsePlayResult({
      balance: validResponse.balance,
      round: validResponse.round,
    }).round.id,
    42,
  );
  assert.equal(
    parseEndRoundResult({ balance: validResponse.balance }).balance.amount,
    10_000_000,
  );
  assert.equal(parseEventResult({ event: "2" }).event, "2");
  assert.throws(() => parseEventResult({ event: 2 }), InvalidRgsResponseError);
});
