# ADR 0010: Classic Nine presentation contract

- Status: Accepted for local architecture

## Context

The generic event envelope cannot produce a playable slice until a game owns an
explicit event vocabulary. Upstream sample event names are examples, not a
universal protocol, so the first local game contract must be identified as an
original presentation decision.

## Decision

- Define “Classic Nine” as a 3×3 presentation using seven named symbols.
- Require exactly one index-zero `reveal` event followed by zero or more
  `highlight` events.
- Validate exact payload keys, grid dimensions, symbol names, cell bounds, unique
  highlighted cells, contiguous indexes, and normalized resume checkpoints.
- Keep events presentation-only: they contain no wager, balance, payout,
  multiplier, probability, weight, RNG seed, or outcome-selection instruction.
- Treat the RGS-returned round and approved artifact as authoritative. This parser
  neither generates a book nor calculates whether highlighted cells win.

## Consequences

Classic Nine can now validate and resume an externally supplied presentation book
without implementing math or RNG. A math artifact producer must emit this exact
versioned contract and remains separately subject to simulation and approval gates.
