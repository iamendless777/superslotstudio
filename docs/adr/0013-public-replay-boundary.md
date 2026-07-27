# ADR 0013: Public replay boundary

- Status: Accepted for local architecture

## Context

Stake Engine's replay guidance requires public, session-free replay loading, user
initiation, disabled betting, deterministic rewatch, and a documented read-only GET
endpoint. Replay state remains untrusted and game-specific.

## Decision

- Parse every replay query parameter exactly once and require `replay=true`.
- Accept only an HTTPS RGS origin by default and allow a deployment origin allowlist.
- Never accept, require, or transmit a player session for replay.
- Fetch only the documented public replay endpoint with URL-encoded path segments.
- Validate multipliers and delegate `state` validation to the selected game parser.
- Keep replay in a separate read-only session with no wager or normal-session API.
- Auto-load data, but require explicit user initiation before entering `playing`.
- Permit replay again from the locally retained validated result.

## Consequences

Classic Nine can consume validated replay books without crossing into wallet or
outcome-selection code. The UI still must render loading, failure, ready, playing,
and completed states and show replay bet/result information before submission.
