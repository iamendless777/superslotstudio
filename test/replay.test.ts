import assert from "node:assert/strict";
import test from "node:test";

import {
  HttpReplayError,
  HttpReplayPort,
} from "../src/adapters/http/http-replay-port.js";
import { ReplaySession } from "../src/application/replay-session.js";
import { createHttpReplaySession } from "../src/application/create-http-replay-session.js";
import { parseClassicNineBook } from "../src/games/classic-nine/events.js";
import {
  InvalidReplayConfigurationError,
  InvalidReplayResponseError,
  parseReplayLaunchConfiguration,
  parseReplayResult,
  type ReplayPort,
} from "../src/replay/replay.js";

const book = [
  {
    schemaVersion: 1,
    index: 0,
    type: "reveal",
    payload: {
      grid: [
        ["cherry", "cherry", "cherry"],
        ["lemon", "orange", "plum"],
        ["bell", "seven", "wild"],
      ],
    },
  },
];

const replayUrl =
  "https://game.example/?replay=true&game=classic-nine&version=1&mode=BASE&event=55&rgs_url=https%3A%2F%2Frgs.example&currency=usd&amount=1.25&lang=en&device=mobile&social=true";

function stateValue<T>(session: ReplaySession<T>): string {
  return session.state.value;
}

test("parses a public replay launch without requiring a player session", () => {
  const launch = parseReplayLaunchConfiguration(replayUrl, {
    allowedRgsOrigins: ["https://rgs.example"],
  });
  assert.deepEqual(
    {
      ...launch,
      rgsBaseUrl: launch.rgsBaseUrl.href,
    },
    {
      game: "classic-nine",
      version: "1",
      mode: "BASE",
      event: "55",
      rgsBaseUrl: "https://rgs.example/",
      currency: "USD",
      amount: "1.25",
      language: "en",
      device: "mobile",
      social: true,
    },
  );
  assert.equal(new URL(replayUrl).searchParams.has("sessionID"), false);
});

test("rejects malformed, duplicate, insecure, and unapproved replay inputs", () => {
  for (const url of [
    replayUrl.replace("replay=true", "replay=false"),
    `${replayUrl}&event=56`,
    replayUrl.replace(
      "https%3A%2F%2Frgs.example",
      "https%3A%2F%2Fu%3Ap%40rgs.example",
    ),
    replayUrl.replace(
      "https%3A%2F%2Frgs.example",
      "https%3A%2F%2Frgs.example%2Fpath",
    ),
    replayUrl.replace("amount=1.25", "amount=-1"),
    replayUrl.replace("event=55", "event=..%2Fauthenticate"),
  ]) {
    assert.throws(
      () => parseReplayLaunchConfiguration(url),
      InvalidReplayConfigurationError,
    );
  }
  assert.throws(
    () =>
      parseReplayLaunchConfiguration(replayUrl, {
        allowedRgsOrigins: ["https://trusted.example"],
      }),
    InvalidReplayConfigurationError,
  );
  assert.throws(
    () =>
      parseReplayLaunchConfiguration(replayUrl, {
        allowedRgsOrigins: ["https://rgs.example/path"],
      }),
    InvalidReplayConfigurationError,
  );
  const local = replayUrl.replace(
    "https%3A%2F%2Frgs.example",
    "http%3A%2F%2Flocalhost%3A8080",
  );
  assert.throws(
    () => parseReplayLaunchConfiguration(local),
    InvalidReplayConfigurationError,
  );
  assert.equal(
    parseReplayLaunchConfiguration(local, { allowInsecureHttp: true })
      .rgsBaseUrl.href,
    "http://localhost:8080/",
  );
});

test("composes a lazy Classic Nine HTTP replay session", async () => {
  let calls = 0;
  const session = createHttpReplaySession(replayUrl, {
    parseState: parseClassicNineBook,
    allowedRgsOrigins: ["https://rgs.example"],
    fetch: async () => {
      calls++;
      return new Response(
        JSON.stringify({
          payoutMultiplier: 3,
          costMultiplier: 1,
          state: book,
        }),
      );
    },
  });
  assert.equal(calls, 0);
  await session.load();
  assert.equal(calls, 1);
  assert.equal(stateValue(session), "ready");
});

test("validates replay multipliers and game-specific state", () => {
  const replay = parseReplayResult(
    { payoutMultiplier: 3, costMultiplier: 1, state: book },
    parseClassicNineBook,
  );
  assert.equal(replay.state[0]?.type, "reveal");
  for (const value of [
    null,
    { payoutMultiplier: -1, costMultiplier: 1, state: book },
    { payoutMultiplier: 1, costMultiplier: Number.NaN, state: book },
    { payoutMultiplier: 1, costMultiplier: 1, state: book, extra: true },
  ]) {
    assert.throws(
      () => parseReplayResult(value, parseClassicNineBook),
      InvalidReplayResponseError,
    );
  }
  assert.throws(
    () =>
      parseReplayResult(
        { payoutMultiplier: 1, costMultiplier: 1, state: [] },
        parseClassicNineBook,
      ),
    TypeError,
  );
});

test("loads the documented public GET endpoint without session data", async () => {
  const requests: Array<{ url: string; method: string | undefined }> = [];
  const port = new HttpReplayPort({
    launch: parseReplayLaunchConfiguration(replayUrl),
    parseState: parseClassicNineBook,
    fetch: async (input, init) => {
      requests.push({ url: String(input), method: init?.method });
      return new Response(
        JSON.stringify({
          payoutMultiplier: 3,
          costMultiplier: 1,
          state: book,
        }),
        { status: 200 },
      );
    },
  });
  const replay = await port.load();
  assert.equal(replay.payoutMultiplier, 3);
  assert.deepEqual(requests, [
    {
      url: "https://rgs.example/bet/replay/classic-nine/1/BASE/55",
      method: "GET",
    },
  ]);
  assert.equal(requests[0]!.url.includes("session"), false);
});

test("maps replay HTTP and response failures without authenticated fallback", async () => {
  const launch = parseReplayLaunchConfiguration(replayUrl);
  for (const response of [
    new Response("missing", { status: 404 }),
    new Response("not-json", { status: 200 }),
    new Response(JSON.stringify({ state: book }), { status: 200 }),
  ]) {
    const port = new HttpReplayPort({
      launch,
      parseState: parseClassicNineBook,
      fetch: async () => response,
    });
    await assert.rejects(() => port.load(), HttpReplayError);
  }
});

test("requires user initiation and supports replay again without another fetch", async () => {
  let loads = 0;
  const replay = parseReplayResult(
    { payoutMultiplier: 3, costMultiplier: 1, state: book },
    parseClassicNineBook,
  );
  const port: ReplayPort<typeof replay.state> = {
    async load() {
      loads++;
      return replay;
    },
  };
  const session = new ReplaySession(port);
  await session.load();
  assert.equal(stateValue(session), "ready");
  assert.equal(loads, 1);
  assert.equal(session.play(), replay);
  assert.equal(stateValue(session), "playing");
  session.complete();
  assert.equal(stateValue(session), "complete");
  assert.equal(session.play(), replay);
  session.complete();
  assert.equal(loads, 1);
  assert.equal("bet" in session, false);
});

test("fails closed and suppresses a late load after disposal", async () => {
  let resolve!: (value: {
    payoutMultiplier: number;
    costMultiplier: number;
    state: string;
  }) => void;
  const pending = new Promise<{
    payoutMultiplier: number;
    costMultiplier: number;
    state: string;
  }>((done) => {
    resolve = done;
  });
  const session = new ReplaySession({ load: () => pending });
  const loading = session.load();
  session.dispose();
  resolve({ payoutMultiplier: 0, costMultiplier: 1, state: "late" });
  await loading;
  assert.equal(stateValue(session), "disposed");
  assert.throws(() => session.play());

  const failed = new ReplaySession({
    async load(): Promise<never> {
      throw new Error("offline");
    },
  });
  await failed.load();
  assert.equal(stateValue(failed), "failed");
  assert.throws(() => failed.play());
});
