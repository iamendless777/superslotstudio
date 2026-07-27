# Super Slot Studio

[![CI](https://github.com/iamendless777/superslotstudio/actions/workflows/ci.yml/badge.svg)](https://github.com/iamendless777/superslotstudio/actions/workflows/ci.yml)

Dependency-free Stake Engine domain foundation. The current implementation owns
only local contracts, validation, recovery decisions, adapters, and test doubles;
it does not implement an RGS, wallet, RNG service, remote gaming server, or game UI.

## Current boundaries

- Authoritative money is a non-negative safe integer in six-decimal RGS units.
- Upstream data enters through explicit runtime validation.
- `RgsPort` is the only integration-facing domain boundary.
- The pure recovery machine emits commands but performs no I/O.
- Monetary mutations are sent once; ambiguous outcomes reconcile through
  Authenticate rather than blind retry.
- The fake adapter supports deterministic contract and orchestration tests without
  importing a Stake Engine package.
- The serialized orchestrator executes emitted commands exactly once and
  reconciles unknown monetary outcomes through Authenticate.
- Versioned local game-event envelopes reject unknown types, malformed payloads,
  duplicate/gapped indexes, and invalid resume checkpoints.
- The dependency-free HTTP adapter constrains launch-derived RGS hosts, defaults to
  HTTPS, validates every endpoint response, trusts only documented RGS error codes
  as definite rejections, and never retries. Deployments can require an exact RGS
  host allowlist before any session credential is sent.
- The UI-free `GameSession` exposes player intent without exposing internal
  transport-result events to presentation code.
- `createHttpGameSession` provides a lazy, validated composition path from a launch
  URL to the application facade.
- Public replay uses a separate read-only transport and session, requires no player
  session, validates game state, and exposes no wagering operations.
- Classic Nine defines an original 3×3, presentation-only event contract; it never
  selects outcomes or calculates payouts.
- Draft offline Classic Nine evaluation and exact weighted-book analysis live under
  `tools/math`; they are not exported runtime or approved production math. Review
  reports use decimal strings and reduced integer ratios to remain JSON-safe and
  avoid floating-point loss. Offline review criteria can check exact return, hit
  rate, definition identity, and maximum win, but cannot grant production approval.

See the accepted [architecture decisions](docs/adr/) and the
[upstream contract ledger](docs/upstream/README.md).

## Commands

```sh
npm install
npm run check
npm test
npm run demo
```

Pull requests and pushes to `main` run the locked install, strict type-check, full
test suite, and production-dependency audit in GitHub Actions.

The test command builds the strict TypeScript project and runs the compiled tests
with Node's built-in test runner.
The demo command serves the deterministic Classic Nine presentation preview at
`http://127.0.0.1:4173` after building the library.
