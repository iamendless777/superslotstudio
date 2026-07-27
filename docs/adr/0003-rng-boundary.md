# ADR 0003: RNG boundary

- Status: Accepted for local architecture

## Decision

The runtime engine contains no outcome RNG. Offline math tooling may use randomness
to generate candidate books; production selection is an external Stake Engine/RGS
responsibility requiring confirmation. Cosmetic randomness must be isolated,
seedable for tests, and incapable of affecting bets, events, payouts, or recovery.

## Consequences

Do not implement an RNG service, copy math SDK random-selection internals, or
claim certification. Record artifact IDs/versions rather than secret seeds.
