import assert from "node:assert/strict";
import test from "node:test";

import { createHttpGameSession } from "../src/application/create-http-game-session.js";
import { InvalidLaunchConfigurationError } from "../src/adapters/http/launch.js";
import { balance, config, jurisdiction } from "./fixtures.js";

test("composition is lazy and authenticates through the constrained endpoint", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  const fetchStub: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as unknown,
    });
    return new Response(
      JSON.stringify({
        balance,
        config: { ...config, jurisdiction },
        round: null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const session = createHttpGameSession(
    "https://game.example/?sessionID=session-1&lang=en&device=desktop&rgs_url=rgs.example",
    { fetch: fetchStub },
  );

  assert.equal(requests.length, 0);
  assert.equal(session.state.value, "uninitialized");
  await session.start();

  assert.equal(session.state.value, "idle");
  assert.deepEqual(requests, [
    {
      url: "https://rgs.example/wallet/authenticate",
      body: { sessionID: "session-1", language: "en" },
    },
  ]);
});

test("composition preserves launch security before transport construction", () => {
  let calls = 0;
  assert.throws(
    () =>
      createHttpGameSession(
        "https://game.example/?sessionID=s&rgs_url=https%3A%2F%2Fevil.example",
        {
          fetch: async () => {
            calls++;
            return new Response();
          },
        },
      ),
    InvalidLaunchConfigurationError,
  );
  assert.equal(calls, 0);
});

test("composition enforces a deployment RGS host allowlist", () => {
  let calls = 0;
  assert.throws(
    () =>
      createHttpGameSession(
        "https://game.example/?sessionID=s&rgs_url=untrusted.example",
        {
          allowedRgsHosts: ["rgs.example"],
          fetch: async () => {
            calls++;
            return new Response();
          },
        },
      ),
    InvalidLaunchConfigurationError,
  );
  assert.equal(calls, 0);
});
