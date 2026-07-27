# ADR 0008: UI-free application session boundary

- Status: Accepted for local architecture

## Context

The recovery orchestrator accepts both player intent and internal transport-result
events. A presentation layer should not be able to fabricate successful Play,
Authenticate, or EndRound events, and view callback failures must not interrupt
monetary sequencing.

## Decision

- Expose a `GameSession` facade with only start, place-bet, checkpoint,
  presentation-complete, subscribe, state-read, and dispose operations.
- Keep internal recovery events behind the facade.
- Serialize every operation through the existing recovery orchestrator.
- Immediately publish the current state when a listener subscribes.
- Isolate listener, checkpoint-failure, state-change, and observer-error callback
  exceptions from session control.
- Clear listeners and reject new intent after disposal.
- Keep game-specific event parsing outside this facade until a game schema is
  selected and documented.

## Consequences

A future browser application can depend on player-intent methods rather than the
full recovery event union. The facade remains independent of HTTP and upstream SDK
implementations because it accepts the narrow local `RgsPort`.
