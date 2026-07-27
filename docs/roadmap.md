# Roadmap

## Milestone 0 — source discovery and contracts

Status: **complete and approved**.

- [x] Verify official endpoint connectivity.
- [x] Resolve immutable upstream commits and archive hashes.
- [x] Capture package/version, toolchain, exports, lifecycle, errors, recovery,
      licensing, compatibility, and approval obligations.
- [x] Separate verified facts, decisions, assumptions, and vendor questions.
- [x] Propose ADRs, risk register, and approval evidence matrix.
- [x] Validate documentation and stop before runtime work.
- [ ] Resolve blocking vendor/license questions before dependency selection.
- [x] Research blockers against official RGS docs, repository history, and npm
      metadata; resolve package relationship, money scale, language, and active-round
      happy path.
- [x] Trace ambiguous-response behavior through official clients and web state
      machines; adopt no-retry/authenticate reconciliation and defer a staging test.
- [ ] Locate any external prior documentation PR/review comments before M1.

### Milestone 0 exit gate

Approval to proceed must acknowledge the proposed ADRs and open risks. Adding an
SDK dependency additionally requires exact release/version, commit, integrity,
license text, and supported compatibility confirmation.

## Milestone 1 — local contracts and recovery foundation

Status: **complete; awaiting review**.

- [x] Establish strict TypeScript build and Node test tooling.
- [x] Implement branded, safe-integer six-decimal RGS money.
- [x] Define local balance, configuration, jurisdiction, round, error, and RGS port
      contracts without importing upstream packages.
- [x] Validate untrusted Authenticate responses at runtime and fail closed.
- [x] Implement a pure recovery state machine with explicit side-effect commands.
- [x] Enforce authenticated min/max/step constraints before emitting Play.
- [x] Reconcile ambiguous Play and EndRound outcomes through Authenticate without
      issuing blind mutation retries.
- [x] Keep checkpoints non-monetary and side-effect free in domain state.
- [x] Add a deterministic fake RGS adapter and tests for normal, malformed, rejected,
      committed-ambiguous, and uncommitted-ambiguous flows.
- [x] Add no real networking or Stake Engine SDK dependency.

### Milestone 1 exit gate

Review the local contracts and recovery semantics. A subsequent milestone may add
an orchestration service and game-event schema, but a real Stake Engine adapter
remains separately gated by exact dependency/license acceptance. Staging failure
injection remains deferred until an authorized disposable session exists.

## Milestone 2 — orchestration and game-event contracts

Status: **complete; awaiting review**.

- [x] Serialize external events and recovery commands through one orchestrator.
- [x] Execute each emitted RGS mutation once without automatic retry.
- [x] Distinguish definite RGS rejections from ambiguous transport failures.
- [x] Reconcile ambiguous Play and EndRound results automatically through
      Authenticate.
- [x] Keep checkpoint failures observable but non-monetary.
- [x] Prevent duplicate UI bet events from producing overlapping Play calls.
- [x] Suppress late results and reject new work after orchestrator disposal.
- [x] Define a versioned, typed local game-event envelope and validator registry.
- [x] Validate contiguous indexes and normalized resume checkpoints.
- [x] Add orchestration/event contract tests without real networking or SDK imports.

### Milestone 2 exit gate

Review serialization, disposal, error classification, and the local event-envelope
convention. The next integration milestone can implement an untrusted HTTP adapter
or a version-specific SDK adapter once its dependency/license gate is accepted.
An adapter must normalize upstream event/checkpoint conventions before invoking
the local parser and may not add mutation retry implicitly.

## Milestone 3 — dependency-free HTTP adapter

Status: **complete; awaiting review**.

- [x] Parse and validate documented launch parameters.
- [x] Constrain dynamic `rgs_url` to a host/port without scheme, credentials, path,
      query, or fragment.
- [x] Require HTTPS by default and explicit opt-in for local HTTP development.
- [x] Implement injected-fetch Authenticate, Play, Event, and EndRound calls.
- [x] Validate successful responses for every endpoint before returning domain
      contracts.
- [x] Normalize documented RGS error responses as definite rejections.
- [x] Treat unknown/malformed non-2xx responses, timeout, fetch failure, and invalid
      successful JSON as ambiguous outcomes.
- [x] Fail closed on malformed successful responses and terminal session/location/
      authentication/limit errors.
- [x] Add no request retry, SDK dependency, credentials, or live RGS calls.
- [x] Test endpoint URLs/bodies, validation, timeout, error classes, and launch URL
      security with injected responses.
- [x] Reject duplicate security parameters and support a deployment RGS host
      allowlist before constructing transport.

### Milestone 3 exit gate

Review the launch-host constraints and HTTP error classification. Before a browser
demo or staging test, add game-specific upstream event normalization and a UI-free
application facade. Live failure injection still requires an authorized disposable
Stake Engine development session.

## Milestone 4 — UI-free application boundary

Status: **complete; awaiting review**.

- [x] Add a transport-independent application facade over `RgsPort` orchestration.
- [x] Expose only player intent and presentation lifecycle operations.
- [x] Keep internal Authenticate, Play, and EndRound result events private to the
      application boundary.
- [x] Publish immutable recovery states to presentation subscribers.
- [x] Isolate subscriber failures from monetary command sequencing.
- [x] Isolate orchestration state/checkpoint hooks and their error reporter from
      recovery control flow.
- [x] Make disposal idempotent, clear subscribers, and reject subsequent intent.
- [x] Test the facade with the deterministic fake adapter and no live networking.

### Milestone 4 exit gate

Review the public application methods and observer isolation. A later game slice
must define its own event validator registry and upstream-state normalization before
adding presentation code. Do not assume a game event format that upstream sources
do not document.

## Milestone 5 — safe HTTP composition root

Status: **complete; awaiting review**.

- [x] Compose launch validation, `HttpRgsPort`, and `GameSession` in one factory.
- [x] Preserve HTTPS, timeout, injected transport, classification, and observer
      configuration.
- [x] Make composition lazy so construction performs no network request.
- [x] Return only the restricted application facade.
- [x] Verify the first request is Authenticate at the constrained RGS origin.
- [x] Reject unsafe launch hosts before transport construction.

### Milestone 5 exit gate

Review the public factory options and lazy-start guarantee. The remaining step
toward a playable slice requires an explicitly selected game design and its event/
state contract; this repository must not manufacture that contract from generic
Stake Engine examples.

## Milestone 6 — Classic Nine presentation contract

Status: **complete; awaiting review**.

- [x] Select and name an original local 3×3 presentation slice.
- [x] Define versioned reveal and highlight events without monetary fields.
- [x] Validate exact payload shapes, symbol vocabulary, grid dimensions, bounded
      unique cells, event order, and contiguous indexes.
- [x] Normalize and validate presentation checkpoints for deterministic resume.
- [x] Keep outcome selection, math, RNG, wager, payout, and balance authority out of
      the game event parser.
- [x] Test valid books, recovery, malformed payloads, and illegal sequences.

### Milestone 6 exit gate

Review the original symbol vocabulary and event lifecycle. A visual renderer may
consume this contract next, but it must remain non-authoritative and must not imply
that its internal testing or appearance constitutes Stake Engine approval.

## Milestone 7 — Classic Nine presentation preview

Status: **complete; awaiting review**.

- [x] Add a pure projector from validated events/checkpoint to visible state.
- [x] Render the 3×3 grid, named symbols, and externally supplied highlights.
- [x] Provide deterministic fixed books with reveal/reset/next controls.
- [x] Add responsive styling, focus visibility, live-region updates, and reduced
      motion support.
- [x] Label the preview as non-monetary, local, and non-approved.
- [x] Add projection tests and a dependency-free local demo server.

### Milestone 7 exit gate

Review the responsive preview and presentation pacing. Production integration still
requires approved game math/artifacts and authorized RGS staging credentials; the
fixture preview does not replace either gate.

## Milestone 8 — offline Classic Nine math foundation

Status: **complete as a draft; awaiting product/math review**.

- [x] Add configurable paylines and symbol triple-paytable data outside runtime.
- [x] Represent multipliers exactly as integer millionths.
- [x] Evaluate candidate grids deterministically without selecting outcomes.
- [x] Derive presentation-only reveal/highlight books from candidate evaluations.
- [x] Analyze weighted candidate books with exact return and hit-rate ratios.
- [x] Validate definitions, weights, bounds, and arithmetic safety.
- [x] Clearly label the five-line paytable as a draft, not approved math.
- [x] Produce a versioned, JSON-safe review report with reduced exact ratios and
      deterministic decimal displays.

### Milestone 8 exit gate

Review paylines, paytable, target return, volatility, maximum win, and distribution
requirements. Do not generate or upload production books until those product inputs
and upstream tooling/provenance gates are accepted.

## Milestone 9 — math review criteria

Status: **tooling complete; awaiting approved product inputs**.

- [x] Represent return and hit-rate bounds as integer millionths.
- [x] Compare exact analysis ratios to those bounds without floating point.
- [x] Check the definition identity and maximum-win ceiling.
- [x] Return all failures in a versioned, JSON-safe review result.
- [x] Keep example criteria unmistakably non-approved.
- [ ] Replace example criteria only after product/math approval is recorded.

### Milestone 9 exit gate

Record approved target return, hit-rate range, maximum win, volatility definition,
and math-definition identity. Passing this local criteria check is evidence for
review; it is not regulatory certification or permission to deploy.

## Milestone 10 — continuous verification

Status: **complete**.

- [x] Run locked dependency installation for every pull request and `main` push.
- [x] Run strict TypeScript checks and the full Node test suite.
- [x] Audit production dependencies at high severity.
- [x] Grant the workflow read-only repository permissions.
- [x] Pin third-party actions to immutable commit SHAs.
- [x] Cancel superseded runs and enforce a bounded job timeout.

## Milestone 11 — public game replay foundation

Status: **application and transport foundation complete; UI pending**.

- [x] Parse the documented replay query contract without a player session.
- [x] Constrain replay RGS origins and reject duplicate parameters.
- [x] Fetch the documented public replay GET endpoint without authentication.
- [x] Compose replay launch parsing, transport, and lifecycle without side effects.
- [x] Validate replay multipliers and game-specific state.
- [x] Require explicit user initiation after automatic loading.
- [x] Disable wagering structurally through a replay-only application API.
- [x] Retain validated state for deterministic replay again.
- [x] Suppress late loads after disposal and expose failure state.
- [ ] Add the dedicated replay presentation controls and result summary.
