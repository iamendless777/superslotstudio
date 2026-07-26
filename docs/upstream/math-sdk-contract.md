# Math SDK contract

## Verified upstream facts

Inspected commit
[`600a376`](https://github.com/StakeEngine/math-sdk/tree/600a37657c75d67c0412bf3952a01d7e7ee99987)
has no tag/release. Setuptools declares `stakeengine==0.0.0` and Python `>=3.12`;
Rust/Cargo is additionally required for optimization. The repository is MIT
licensed; copies/substantial portions must retain its copyright and permission
notice, and it is provided without warranty.

This is a source framework rather than a documented public Python package API.
Relevant modules provide game configuration/state, board and win calculations,
event construction, simulation, optimization, analysis, compression, lookup and
force-file generation, and optional uploads. Required publication outputs include
books, lookup tables, and index files
([quick start](https://github.com/StakeEngine/math-sdk/blob/600a37657c75d67c0412bf3952a01d7e7ee99987/docs/math_docs/quickstart.md#L12-L40)).

Each simulated book has an ID, ordered `events`, and a final
`payoutMultiplier`; the corresponding lookup table maps the ID to weight and
payout. RGS play returns the events for frontend playback. The frontend must
interpret only the game-owned event schema; SDK sample event names are examples,
not a universal wire contract.

The SDK uses Python's `random` module in simulation/board generation
([board](https://github.com/StakeEngine/math-sdk/blob/600a37657c75d67c0412bf3952a01d7e7ee99987/src/calculations/board.py#L1-L28)). It generates offline candidate outcomes; it does not establish the production RGS selection RNG contract.

## Lifecycle and failure behavior

Simulation creates complete, static outcome books and supporting selection data;
the RGS selects/returns an outcome and owns transactional lifecycle. The math SDK
does not document runtime retry, reconnect, or unfinished-round behavior. Upload
helpers are optional tooling and must not be embedded in the game runtime.

Approval limits (mutable guidance retrieved 2026-07-26) include at most 4.2 GB
per `.jsonl.zst`, at most 10,000,000 events per mode, and simulation/math/risk
review. See [approval requirements](approval-requirements.md); those requirements
are gates, not guarantees that an output will be approved.

## Local decision

- Math artifacts are immutable, versioned build inputs. The frontend never
  generates authoritative outcomes or selects payouts.
- All randomness remains outside the runtime engine adapter. No RNG service will
  be built.
- Game-specific book-event schemas will be versioned and validated at the
  boundary. Unknown/malformed events fail closed without changing wallet state.
- We may study the MIT SDK and use it as intended, but will not copy/fork its
  internals into the runtime.

## Open questions

Ask Stake Engine for a supported tagged release, packaging/install procedure,
artifact schema/versioning rules, deterministic reproducibility expectations,
production selection/RNG responsibilities, upload credential boundary, and the
compatible RGS/client/web revision set.
