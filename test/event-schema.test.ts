import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT_GAME_EVENT_SCHEMA_VERSION,
  InvalidGameEventError,
  createGameEventParser,
  planEventResume,
} from "../src/events/schema.js";

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidGameEventError(path, "object");
  }
  return value as Record<string, unknown>;
}

const parseEvent = createGameEventParser({
  reveal: (value: unknown, path: string) => {
    const payload = object(value, path);
    if (
      !Array.isArray(payload.symbols) ||
      !payload.symbols.every((item) => typeof item === "string")
    ) {
      throw new InvalidGameEventError(`${path}.symbols`, "string array");
    }
    return { symbols: payload.symbols as string[] };
  },
  setTotal: (value: unknown, path: string) => {
    const payload = object(value, path);
    if (
      typeof payload.amount !== "number" ||
      !Number.isSafeInteger(payload.amount)
    ) {
      throw new InvalidGameEventError(`${path}.amount`, "safe integer");
    }
    return { amount: payload.amount };
  },
});

test("parses registered versioned events into a typed local envelope", () => {
  const event = parseEvent({
    schemaVersion: CURRENT_GAME_EVENT_SCHEMA_VERSION,
    index: 0,
    type: "reveal",
    payload: { symbols: ["A", "K"] },
  });
  assert.equal(event.type, "reveal");
  if (event.type === "reveal")
    assert.deepEqual(event.payload.symbols, ["A", "K"]);
});

test("rejects unknown versions, types, indexes, and malformed payloads", () => {
  for (const input of [
    { schemaVersion: 2, index: 0, type: "reveal", payload: { symbols: [] } },
    { schemaVersion: 1, index: -1, type: "reveal", payload: { symbols: [] } },
    { schemaVersion: 1, index: 0, type: "unknown", payload: {} },
    { schemaVersion: 1, index: 0, type: "reveal", payload: { symbols: [1] } },
  ]) {
    assert.throws(() => parseEvent(input), InvalidGameEventError);
  }
});

test("plans deterministic resume from a normalized next-event checkpoint", () => {
  const events = [
    parseEvent({
      schemaVersion: 1,
      index: 2,
      type: "setTotal",
      payload: { amount: 2 },
    }),
    parseEvent({
      schemaVersion: 1,
      index: 0,
      type: "reveal",
      payload: { symbols: ["A"] },
    }),
    parseEvent({
      schemaVersion: 1,
      index: 1,
      type: "setTotal",
      payload: { amount: 1 },
    }),
  ];
  const plan = planEventResume(events, "2");
  assert.deepEqual(
    plan.completed.map((event) => event.index),
    [0, 1],
  );
  assert.deepEqual(
    plan.remaining.map((event) => event.index),
    [2],
  );
  assert.equal(plan.nextIndex, 2);
});

test("rejects duplicate indexes and invalid checkpoint strings", () => {
  const event = parseEvent({
    schemaVersion: 1,
    index: 0,
    type: "reveal",
    payload: { symbols: ["A"] },
  });
  assert.throws(
    () => planEventResume([event, event], "0"),
    InvalidGameEventError,
  );
  assert.throws(
    () => planEventResume([event], "not-a-number"),
    InvalidGameEventError,
  );
  assert.throws(() => planEventResume([event], ""), InvalidGameEventError);
  assert.throws(() => planEventResume([event], "01"), InvalidGameEventError);
  assert.throws(() => planEventResume([event], "2"), InvalidGameEventError);

  const gap = parseEvent({
    schemaVersion: 1,
    index: 2,
    type: "reveal",
    payload: { symbols: ["A"] },
  });
  assert.throws(
    () => planEventResume([event, gap], "0"),
    InvalidGameEventError,
  );
});
