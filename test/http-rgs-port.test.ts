import assert from "node:assert/strict";
import test from "node:test";

import {
  HttpRgsPort,
  HttpRgsTransportError,
} from "../src/adapters/http/http-rgs-port.js";
import {
  InvalidLaunchConfigurationError,
  parseLaunchConfiguration,
} from "../src/adapters/http/launch.js";
import { RgsPortError } from "../src/domain/error.js";
import { rgsAmount } from "../src/domain/money.js";

const jurisdiction = {
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
};

const config = {
  minBet: 100_000,
  maxBet: 100_000_000,
  stepBet: 100_000,
  defaultBetLevel: 1_000_000,
  betLevels: [100_000, 1_000_000],
  jurisdiction,
};

const round = {
  betID: 42,
  amount: 1_000_000,
  payout: 2_000_000,
  payoutMultiplier: 2,
  active: true,
  mode: "BASE",
  event: "1",
  state: ["reveal", "win"],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function launch() {
  return parseLaunchConfiguration(
    "https://game.example/index.html?sessionID=session-1&lang=en&device=desktop&rgs_url=rgs.example:443",
  );
}

test("parses documented launch parameters into a constrained RGS base URL", () => {
  const result = launch();
  assert.equal(result.sessionID, "session-1");
  assert.equal(result.language, "en");
  assert.equal(result.device, "desktop");
  assert.equal(result.rgsBaseUrl.href, "https://rgs.example/");
});

test("defaults language/device and requires explicit opt-in for HTTP", () => {
  const url = "https://game.example/?sessionID=s&rgs_url=localhost:8080";
  const defaults = parseLaunchConfiguration(url);
  assert.equal(defaults.language, "en");
  assert.equal(defaults.device, "desktop");
  assert.throws(
    () => parseLaunchConfiguration(url, { protocol: "http:" }),
    InvalidLaunchConfigurationError,
  );
  assert.equal(
    parseLaunchConfiguration(url, {
      protocol: "http:",
      allowInsecureHttp: true,
    }).rgsBaseUrl.href,
    "http://localhost:8080/",
  );
});

test("rejects missing, schemed, credentialed, path, and unsupported device inputs", () => {
  for (const url of [
    "https://game.example/?rgs_url=rgs.example",
    "https://game.example/?sessionID=s&rgs_url=https%3A%2F%2Frgs.example",
    "https://game.example/?sessionID=s&rgs_url=user%40rgs.example",
    "https://game.example/?sessionID=s&rgs_url=rgs.example%2Fpath",
    "https://game.example/?sessionID=s&rgs_url=rgs.example&device=tablet",
  ]) {
    assert.throws(
      () => parseLaunchConfiguration(url),
      InvalidLaunchConfigurationError,
    );
  }
});

test("calls documented endpoints with session-scoped bodies and validates results", async () => {
  const requests: Array<{
    url: string;
    body: unknown;
    signal: AbortSignal | null;
  }> = [];
  const responses = [
    json({
      balance: { amount: 10_000_000, currency: "USD" },
      config,
      round: null,
    }),
    json({ balance: { amount: 9_000_000, currency: "USD" }, round }),
    json({ event: "2" }),
    json({ balance: { amount: 11_000_000, currency: "USD" } }),
  ];
  const fetchStub: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as unknown,
      signal: init?.signal ?? null,
    });
    const response = responses.shift();
    assert.ok(response);
    return response;
  };
  const port = new HttpRgsPort<readonly string[]>({
    launch: launch(),
    fetch: fetchStub,
  });

  assert.equal((await port.authenticate()).balance.amount, 10_000_000);
  assert.equal(
    (await port.play({ amount: rgsAmount(1_000_000), mode: "BASE" })).round.id,
    42,
  );
  assert.equal((await port.checkpoint("2")).event, "2");
  assert.equal((await port.endRound()).balance.amount, 11_000_000);
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "https://rgs.example/wallet/authenticate",
      "https://rgs.example/wallet/play",
      "https://rgs.example/bet/event",
      "https://rgs.example/wallet/end-round",
    ],
  );
  assert.deepEqual(requests[1]?.body, {
    sessionID: "session-1",
    amount: 1_000_000,
    mode: "BASE",
  });
  assert.equal(
    requests.every((request) => request.signal instanceof AbortSignal),
    true,
  );
});

test("maps documented RGS errors to definite port rejections", async () => {
  for (const [status, code] of [
    [400, "ERR_IPB"],
    [500, "ERR_GEN"],
  ] as const) {
    const port = new HttpRgsPort({
      launch: launch(),
      fetch: async () => json({ error: code, message: "Rejected" }, status),
    });
    await assert.rejects(
      port.play({ amount: rgsAmount(1_000_000), mode: "BASE" }),
      (error: unknown) =>
        error instanceof RgsPortError &&
        error.failure.kind === "rejected" &&
        error.failure.code === code,
    );
  }
});

test("treats unverified HTTP, fetch, and JSON failures as ambiguous outcomes", async () => {
  const failures: Array<typeof fetch> = [
    async () => new Response("not json", { status: 401 }),
    async () => json({ error: "UNDOCUMENTED" }, 400),
    async () => new Response("upstream unavailable", { status: 503 }),
    async () => {
      throw new Error("offline");
    },
    async () => new Response("not json", { status: 200 }),
  ];
  for (const fetchStub of failures) {
    const port = new HttpRgsPort({ launch: launch(), fetch: fetchStub });
    await assert.rejects(port.endRound(), HttpRgsTransportError);
  }
});

test("maps malformed successful payloads to invalid-response port errors", async () => {
  const port = new HttpRgsPort({
    launch: launch(),
    fetch: async () =>
      json({ balance: { amount: 0.5, currency: "USD" }, config, round: null }),
  });
  await assert.rejects(
    port.authenticate(),
    (error: unknown) =>
      error instanceof RgsPortError &&
      error.failure.kind === "invalid-response",
  );
});

test("aborts requests at the configured timeout and reports ambiguity", async () => {
  const fetchStub: typeof fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });
  const port = new HttpRgsPort({
    launch: launch(),
    fetch: fetchStub,
    timeoutMs: 5,
  });
  await assert.rejects(port.endRound(), HttpRgsTransportError);
});

test("rejects invalid timeout configuration", () => {
  assert.throws(
    () => new HttpRgsPort({ launch: launch(), timeoutMs: 0 }),
    RangeError,
  );
  assert.throws(
    () => new HttpRgsPort({ launch: launch(), timeoutMs: 1.5 }),
    RangeError,
  );
});
