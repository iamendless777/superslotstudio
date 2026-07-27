# ADR 0009: HTTP game-session composition root

- Status: Accepted for local architecture

## Context

Browser consumers otherwise need to assemble launch parsing, HTTP transport, and
application orchestration themselves. Repeating that setup risks bypassing launch
validation or inconsistently forwarding timeout and observability policies.

## Decision

- Provide one `createHttpGameSession` composition function.
- Parse and constrain launch data before constructing the HTTP port.
- Preserve HTTPS-by-default and explicit insecure-development opt-in.
- Forward injected `fetch`, timeout, failure classification, and observer hooks.
- Perform no network request during construction; Authenticate begins only through
  `GameSession.start()`.
- Return the narrow `GameSession`, not its internal port or orchestrator.

## Consequences

An application has a safe default assembly path while each component remains
independently testable. The composition root adds no SDK dependency, retry, UI, or
game-specific state assumption.
