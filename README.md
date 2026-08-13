# Super Slot Studio

[![CI](https://github.com/realitybeast/superslotstudio/actions/workflows/ci.yml/badge.svg)](https://github.com/realitybeast/superslotstudio/actions/workflows/ci.yml)

Dependency-free foundation for a multi-game Stake Engine slot studio. The current
implementation owns local contracts, validation, recovery decisions, adapters,
math evidence, and a reference-game preview; it does not implement an RGS, wallet,
RNG service, or remote gaming server.

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
[upstream contract ledger](docs/upstream/README.md). The
[studio architecture](docs/studio-architecture.md) defines what is shared across
games and what must remain unique to each game. The
[initial concept portfolio](docs/game-concept-portfolio.md) and
[definition shortlist](docs/concept-definition-shortlist.md) preserve the concept
selection history. Recovered WIZARD CRAFT source includes its typed event,
runtime, presentation, information, browser, Pixi, audio, and control contracts,
plus the official-SDK math implementation and recorded math evidence. Its former
standalone concept, art-bible, visual-acceptance, and browser-demo documents were
not present in the recovered repository and are therefore not claimed here.

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

### WIZARD CRAFT recovery status

The deterministic WIZARD CRAFT replay fixtures under
`demo/wizard-craft/replays` are regenerated from the selected books in the
surviving official-SDK publish library. The original production image and audio
files referenced by the runtime manifest were not present in the recovered
workspace or GitHub history. WIZARD CRAFT is therefore not visually or
acoustically release-ready.

Ordinary CI continues to verify the complete typed asset manifest and runtime
loading behavior without inventing replacement media. After the original
production files are restored under `art-src/wizard-craft`, run the filesystem,
audio-uniqueness, and mobile-payload certification gates explicitly:

```sh
WIZARD_CRAFT_PRODUCTION_ASSET_AUDIT=1 npm test
```

Those gates intentionally fail when any required production file is missing.

The working Signal Nine math-sdk game is under `math/classic_nine`. Copy that
folder to `games/classic_nine` in the pinned official math-sdk checkout, run the
SDK setup, and execute:

```sh
env/bin/python -m unittest discover -s games/classic_nine -p 'test_*.py' -v
```

Simulation, optimization, analysis, and format checks are intentionally disabled
in its `run.py` until exploratory math review begins.
