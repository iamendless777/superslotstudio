# ADR 0005: Package boundaries

- Status: Accepted for local architecture

## Decision

Future packages will separate:

1. pure engine/domain state and validated game-event schema;
2. a narrow Stake Engine port and version-specific client adapter;
3. rendering/audio/input UI;
4. offline math artifact/schema validation; and
5. test fixtures/conformance tooling.

Only the adapter may import a Stake Engine client. Domain/UI APIs expose local
types, never upstream package types. Math SDK and web SDK remain offline/reference
dependencies unless separately approved. Pin exact versions and integrity; never
use floating branches.

## Consequences

No SDK dependency is added in Milestone 0. Upgrades require provenance, license,
contract-diff, compatibility, recovery, and approval-matrix review.
