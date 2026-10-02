# Stake Studio

[![CI](https://github.com/iamendless777/superslotstudio/actions/workflows/ci.yml/badge.svg?branch=integrate%2Fstudio-motion)](https://github.com/iamendless777/superslotstudio/actions/workflows/ci.yml)

Stake Studio is the factory for creating Stake.com slot games. The canonical branch is
`integrate/studio-motion`. The only app is in `runtime/stake-studio-source`.
Games are projects opened inside Studio; they are not separate copies of the app.
Read the standing identity and operating contract in [AGENTS.md](AGENTS.md).

## Open Studio

Use Node.js 20 or later. From this repository's root:

```sh
npm run setup
npm start
```

Setup installs both locked dependency sets. Run it on a fresh checkout or after
lockfile changes. `npm start` launches the Studio window, or reuses the existing
window. `npm run dev`, `npm run dev:agent`, and `npm run studio` are aliases for
the same app, not separate products.

Use Cabinet, Game Config, Reel Strips, Simulate, Preview, Audio, Atlas, FX Lab,
Spine, Quality, and Build inside that window. Use **New Game** or **Load** to
change projects. The header identifies the current game.

Models connect to that same app through the root `.mcp.json` configuration or
`npm run mcp`; MCP does not launch a separate Studio. Start with `inspect_studio`
and `get_studio_state`. See [the production loop](docs/THE_LOOP.md).

## Repository map

- `runtime/stake-studio-source/`: the Studio UI, server, MCP bridge, build engines,
  runtime assets, and Studio regression tests.
- `src/` and `tools/studio/`: shared domain contracts, motion planner, templates,
  and fixture generation used by the Studio launcher. These are supporting code,
  not another app.
- `tools/math/` and `tools/evidence/`: offline math review and recovery verification.
- `test/`: shared domain and motion-planner tests.
- `agent/`: the live Studio's command inbox.
- `docs/`: production workflow, architecture decisions, and upstream contracts.

The old standalone Classic Nine, replay, and timeline demo pages and demo server
have been removed. Preview games in Studio's **Preview** panel. Their previous
source remains available in Git history.

## Development and verification

```sh
npm run check
npm test
npm run test:studio
npm run build:studio
```

- `check`: strict TypeScript validation for shared code.
- `test`: regenerate motion fixtures, test shared contracts/planning, and test
  the integrated presentation components.
- `test:studio`: the Studio's broader regression suite.
- `build:studio`: regenerate motion fixtures and build the Studio frontend.
- `build` / `studio:fixtures`: compile shared tooling and regenerate the committed
  `runtime/stake-studio-source/public/motion-fixtures` consumed by Studio.
- `studio:cli`: supporting planner CLI, for example
  `npm run studio:cli -- templates` or `npm run studio:cli -- plan cluster-hex`.
- `evidence:recovery`: print a versioned local failure-injection report, for example
  `npm run --silent evidence:recovery > recovery-evidence.json`.

CI runs the locked root install, shared type-check/tests, fixture freshness check,
and root production-dependency audit on pull requests and canonical-branch pushes.
The broader Studio suite and frontend build are separate checks listed above.

Local previews, draft math, and passing tests do not establish production approval.
The shared code does not implement an RGS, wallet, or remote RNG service. See the
[architecture decisions](docs/adr/) and [upstream contract ledger](docs/upstream/README.md).
