# ADR 0007: Dependency-free HTTP adapter boundary

- Status: Accepted for local architecture

## Context

The RGS protocol is publicly documented and the upstream TypeScript client is
optional. A concrete adapter is needed to exercise the local port without leaking
launch credentials, trusting dynamic endpoint data, or introducing implicit retry.

## Decision

- Parse `sessionID`, `lang`, `device`, and `rgs_url` once from the launch URL.
- Treat `rgs_url` as a host with optional port, never as a complete arbitrary URL;
  reject credentials, path, query, fragment, or embedded scheme.
- Default to HTTPS. Permit HTTP only through explicit development configuration.
- Reject duplicate security-relevant launch parameters so parsing is unambiguous.
- Allow deployments to require an exact `host[:port]` allowlist before a session
  credential can be sent.
- Inject `fetch` for deterministic tests and keep session values out of errors.
- Use documented POST endpoints and validate every successful endpoint response
  before it crosses `RgsPort`.
- Treat a parsed, documented RGS error code as a definite rejection. An unknown or
  malformed non-2xx response remains ambiguous regardless of HTTP status because
  status class alone does not prove whether a monetary mutation committed.
- Treat fetch rejection, timeout, and invalid successful JSON as ambiguous
  transport outcomes.
- Convert malformed successful responses to `invalid-response` port errors.
- Never retry inside the adapter.

## Consequences

The adapter can be composed with the orchestrator without the Stake Engine npm
package. Tests use injected `fetch` only; no live RGS request or credential is
required. A future SDK adapter must produce the same local error and response
contracts and cannot weaken URL or validation controls.
