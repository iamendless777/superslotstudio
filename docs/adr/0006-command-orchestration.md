# ADR 0006: Command orchestration and event envelopes

- Status: Accepted for local architecture

## Context

The recovery machine is deliberately pure: transitions emit commands but cannot
perform RGS I/O. UI input can be concurrent, while wallet mutations must not
overlap or be retried blindly. Game books also need a local, versioned validation
boundary without claiming that upstream sample event names form a universal API.

## Decision

- A single orchestrator serializes external events and executes machine commands
  through `RgsPort` exactly once.
- Definite `RgsPortError` rejections and ambiguous transport failures remain
  distinct; only ambiguity triggers Authenticate reconciliation.
- Checkpoint failure is observable but never changes monetary state or stops local
  presentation.
- State-change and checkpoint-failure observer exceptions are reported but cannot
  interrupt command sequencing; the observer-error hook is isolated as well.
- Disposal suppresses late results and new commands. It does not claim to cancel a
  mutation already dispatched; a replacement orchestrator must Authenticate.
- Local game events use an explicit schema version, contiguous index, registered
  type, and type-specific payload validator.
- Adapter code will translate upstream book events/checkpoints into the local
  envelope and normalized next-event-index convention.

## Consequences

There is one manageable place for concurrency, error classification, and port
execution. Domain transitions and event parsing remain deterministic and testable.
A future HTTP/SDK adapter cannot bypass validation or introduce retry without a
new architecture decision.
