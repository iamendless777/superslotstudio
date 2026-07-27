# RGS failure-injection test plan

Status: **deferred until an authorized Stake Engine development/staging session is
available**. This plan avoids contacting Stake Engine with speculative questions;
we will first test the documented recovery model using our own session and game.

## Safety constraints

- Never run against production, another player's session, or real-value funds.
- Use only launch-provided `rgs_url` and disposable development credentials.
- Redact session IDs, cookies, query strings, and response identifiers from stored
  evidence.
- Use the minimum permitted bet and one scenario at a time.
- Do not resend an ambiguous mutation during the test. Re-authenticate and observe.
- Stop immediately if the environment does not explicitly permit testing or if a
  test could affect operator/wallet systems outside the disposable session.

## Instrumentation

Capture monotonic timestamps, request kind, locally generated correlation ID
(diagnostic only; do not imply RGS honors it), browser network outcome, sanitized
HTTP status/error code, and the next Authenticate response's balance and round
shape. Never log credentials or full URLs.

Use browser automation or a local forward proxy to interrupt the **response path**
after dispatch without modifying request bodies. A simple offline toggle before
dispatch tests a definite non-send, not the important ambiguous case.

## Scenarios

### A. Play definitely not sent

1. Authenticate and record sanitized baseline balance/round.
2. Block the request locally before dispatch.
3. Enter reconciliation and authenticate through a fresh page/client.
4. Expect no new active round and no debit.

### B. Play response interrupted after dispatch

1. Authenticate with no active round.
2. Dispatch one minimum Play and cut only the response path.
3. Do not replay Play.
4. Reopen/recreate the client and Authenticate.
5. Record whether an active round and corresponding balance are returned.
6. If active, resume exactly that round; if inactive, return to idle.

### C. Event checkpoint response interrupted

1. Start a long active round and record a known event index.
2. Dispatch the next Event and cut its response.
3. Reload and Authenticate.
4. Record whether `round.event` is the earlier or later checkpoint.
5. Verify either state resumes without another wager and without corrupting payout.

### D. EndRound response interrupted

1. Complete presentation for an active round.
2. Dispatch EndRound once and cut its response.
3. Do not replay EndRound in the same uncertain client state.
4. Reload and Authenticate.
5. If the round is inactive/completed, accept RGS balance and return idle.
6. If it remains active, resume the documented round lifecycle and attempt closure
   only from that newly authenticated authoritative state.

### E. Documented RGS errors

Using non-destructive inputs only, verify UI/state behavior for errors naturally
available in the test environment, such as invalid session, invalid amount,
insufficient balance, or maintenance. Do not manufacture location, limits, or
operator failures.

## Acceptance criteria

- No ambiguous mutation is blindly resent.
- New wagering remains disabled until Authenticate resolves round state.
- Local balance is replaced by the authenticated RGS balance.
- A committed Play is resumed once rather than charged again.
- An uncommitted Play returns safely to idle.
- Event uncertainty changes only the presentation resume point.
- EndRound uncertainty resolves without a second simultaneous wager.
- Sanitized evidence is sufficient to reproduce state transitions.

## Escalation threshold

Contact Stake Engine with a minimal evidence bundle only if:

- Authenticate cannot distinguish committed from uncommitted Play;
- Authenticate returns a state inconsistent with the documented active-round
  lifecycle;
- a fresh authoritative flow cannot close a still-active round;
- the same single request causes multiple debits/payouts; or
- published error behavior materially differs from the official documentation.

The support request should include exact frontend/math versions, UTC timestamps,
sanitized request type/status/error, round active transition, expected versus
observed behavior, and concise reproduction steps. It must not include speculation,
credentials, or a demand for undocumented guarantees.
