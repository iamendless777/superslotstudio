# TypeScript client contract (`stake-engine@0.1.32`)

## Verified upstream facts

The inspected source is commit
[`df9e126`](https://github.com/StakeEngine/ts-client/tree/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e),
matching npm version `0.1.32`. Exact provenance and license caveats are in the
[version matrix](version-matrix.md).

Public runtime exports are `RGSClient`, `DisplayAmount`, `ParseAmount`, and
`parseBalance`; public types cover authenticate/config, balances, currency,
language, play/end-round/event responses, jurisdiction flags, and rounds
([index](https://github.com/StakeEngine/ts-client/blob/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e/src/index.ts#L1-L20)). `API_MULTIPLIER` is internal (`1_000_000`), despite the README calling it a helper; it is **not exported** in this revision.

`RGSClient`:

- parses `lang`, `device`, `sessionID`, and `rgs_url`; missing session/RGS values
  and unsupported devices throw synchronously
  ([client](https://github.com/StakeEngine/ts-client/blob/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e/src/client.ts#L31-L70));
- exposes `Authenticate`, `Play`, `EndRound`, and `Event`; authentication must
  precede the latter operations;
- enforces step/min/max and, by default, returned bet levels before play
  ([play](https://github.com/StakeEngine/ts-client/blob/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e/src/client.ts#L176-L233));
- emits browser `balanceUpdate` and `roundActive` events, and polls balance every
  60 seconds after play/end-round ([client](https://github.com/StakeEngine/ts-client/blob/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e/src/client.ts#L154-L174));
- treats any non-2xx response as an error after parsing JSON. No timeout,
  cancellation, retry, backoff, reconnect, or idempotency key is implemented;
- marks a round active before the play fetch and clears it on a non-2xx play. A
  transport/JSON exception is not caught, so local round state can remain active;
- restores the active flag when Authenticate returns an active round, but offers
  no resume method beyond exposing `round.state` to the caller
  ([authenticate](https://github.com/StakeEngine/ts-client/blob/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e/src/client.ts#L72-L137)).

## Local integration responsibilities (decision)

- Wrap this package behind a narrow port; application/UI code must not import it.
- Treat RGS responses as authoritative for balance, allowed stakes,
  jurisdiction, and active-round state.
- Use integer RGS units end-to-end. Formatting helpers are presentation-only.
- Do not automatically replay `Play` or `EndRound`. On ambiguous transport
  failure, freeze wagering, recreate the authoritative authentication flow, and
  branch on its returned round before permitting another wager.
- Dispose/own polling and browser events in the adapter design. The upstream
  client exposes no cleanup method, so this is unresolved before implementation.

## Assumptions and open questions

- **Assumption:** browsers with `fetch`, `URL`, `CustomEvent`, `window`, `navigator`,
  and `Intl` are the intended runtime. No official browser matrix is published.
- **Non-blocking unknown:** endpoint idempotency is not claimed because the local
  policy does not automatically retry mutations.
- **Resolved below:** The official RGS pages define the active-round happy path;
  ambiguous mutation retry remains open.
- **Open:** What timeout/reconnect policy and error schema are supported?
- **Open:** Is passing `rgs_url` without a scheme and prepending HTTPS always the
  supported shape?

## Follow-up resolution

The official [RGS details](https://stake-engine.com/docs/rgs) and
[wallet documentation](https://stake-engine.com/docs/rgs/wallet) say a frontend
must continue an active round returned by Authenticate, may persist long-round
progress with `/bet/event`, uses `round.event` to restore presentation position,
and calls end-round once presentation completes. This resolves the intended happy
path, but not whether an ambiguous event/end-round request is safe to retry. See
the [blocking-question research](blocker-research.md).

The official web reference confirms the operational policy: one fetch per request,
no automatic play retry, error UI on play failure, and round hydration through
Authenticate on reload. Failure injection is deferred to an authorized staging
session; see the [test plan](failure-injection-test-plan.md).
