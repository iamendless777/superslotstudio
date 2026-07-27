# ADR 0012: Offline Classic Nine math boundary

- Status: Accepted as a draft tooling contract; not approved game math

## Decision

- Keep candidate evaluation and weighted-book analysis under `tools/math`, outside
  the runtime package exports.
- Represent payout multipliers as non-negative safe integers in millionths.
- Make paylines and symbol paytable data explicit, validated configuration.
- Use exact `bigint` ratios for weighted return and hit-rate evidence.
- Permit tooling to derive presentation highlights from evaluated candidate grids,
  but never place payout or probability fields in frontend events.
- Treat the bundled five-line/paytable definition as a reviewable draft only. It
  does not establish production RTP, volatility, reel distribution, or approval.
- Add no runtime RNG or production outcome selector.

## Consequences

Candidate math can be tested deterministically before integrating the upstream math
toolchain. Production books still require distribution design, large-scale
simulation, immutable artifact provenance, risk review, and Stake Engine approval.
