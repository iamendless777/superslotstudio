# ADR 0011: Non-authoritative Classic Nine renderer

- Status: Accepted for local architecture

## Decision

- Project visible grid/highlight state only from validated Classic Nine events and
  the normalized next-event checkpoint.
- Keep projection pure and deterministic; it performs no I/O or monetary work.
- Provide a static responsive preview using fixed books rather than random data.
- Label the preview as a local presentation fixture with no wallet, wager, payout
  calculation, or approval claim.
- Support keyboard focus and reduced-motion preferences.

## Consequences

Presentation behavior can be reviewed visually and tested without suggesting that
the renderer determines outcomes. Production artwork, audio, math artifacts, and
Stake Engine approval remain separate future evidence gates.
