import assert from "node:assert/strict";
import test from "node:test";

import { generateRecoveryEvidence } from "../tools/evidence/recovery.js";

function scenarioById(
  scenarios: Awaited<ReturnType<typeof generateRecoveryEvidence>>["scenarios"],
  id: (typeof scenarios)[number]["id"],
) {
  const scenario = scenarios.find((candidate) => candidate.id === id);
  assert.ok(scenario, `missing evidence scenario: ${id}`);
  return scenario;
}

test("generates deterministic recovery evidence for every planned local scenario", async () => {
  const report = await generateRecoveryEvidence();

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.environment, "deterministic-local-simulation");
  assert.deepEqual(
    report.scenarios.map(({ id }) => id),
    [
      "play-not-committed",
      "play-committed-response-lost",
      "checkpoint-committed-response-lost",
      "end-round-committed-response-lost",
    ],
  );
  for (const scenario of report.scenarios) {
    assert.deepEqual(scenario.assertions, {
      noBlindMutationRetry: true,
      authoritativeBalanceAdopted: true,
      authoritativeRoundAdopted: true,
    });
  }
});

test("reconciles uncommitted and committed Play without a second Play", async () => {
  const { scenarios } = await generateRecoveryEvidence();
  const uncommitted = scenarioById(scenarios, "play-not-committed");
  const committed = scenarioById(scenarios, "play-committed-response-lost");

  assert.deepEqual(uncommitted.calls, ["authenticate", "play", "authenticate"]);
  assert.equal(uncommitted.finalClientState, "idle");
  assert.equal(uncommitted.authoritative.roundActive, false);
  assert.deepEqual(committed.calls, ["authenticate", "play", "authenticate"]);
  assert.equal(committed.finalClientState, "active");
  assert.equal(committed.authoritative.roundActive, true);
  assert.equal(committed.authoritative.balanceAmount, 9_000_000);
});

test("fresh authentication adopts an interrupted committed checkpoint", async () => {
  const { scenarios } = await generateRecoveryEvidence();
  const scenario = scenarioById(
    scenarios,
    "checkpoint-committed-response-lost",
  );

  assert.deepEqual(scenario.calls, [
    "authenticate",
    "checkpoint",
    "authenticate",
  ]);
  assert.equal(scenario.finalClientState, "active");
  assert.equal(scenario.authoritative.checkpoint, "2");
});

test("reconciles interrupted committed EndRound without a second EndRound", async () => {
  const { scenarios } = await generateRecoveryEvidence();
  const scenario = scenarioById(
    scenarios,
    "end-round-committed-response-lost",
  );

  assert.deepEqual(scenario.calls, [
    "authenticate",
    "end-round",
    "authenticate",
  ]);
  assert.equal(scenario.finalClientState, "idle");
  assert.equal(scenario.authoritative.roundActive, false);
  assert.equal(scenario.authoritative.balanceAmount, 11_000_000);
});

test("report is JSON-safe and byte-for-byte deterministic", async () => {
  const first = JSON.stringify(await generateRecoveryEvidence());
  const second = JSON.stringify(await generateRecoveryEvidence());

  assert.equal(first, second);
  assert.deepEqual(JSON.parse(first), JSON.parse(second));
});
