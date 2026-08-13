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
- [x] Add dedicated replay presentation controls and a result summary fixture.

## Milestone 12 — Classic Nine product baseline

Status: **local math-freeze candidate complete; submission readiness pending**.

- [x] Select a cohesive production theme and player promise.
- [x] Define base-game rules, symbol roles, paylines, and feature behavior.
- [x] Define base and buy-bonus modes with working RTP and win-cap targets.
- [x] Define simulation, artifact, event, frontend, replay, and approval gates.
- [x] Record exact upstream source commits used for the baseline.
- [x] Replace the prototype fruit vocabulary with the Signal Nine schema.
- [x] Implement the game in the official math SDK template.
- [x] Generate and structurally verify the first 1,000-outcome exploratory batch
      per mode.
- [x] Prove small-pool optimizer feasibility for RTP, hit rate, feature frequency,
      win-cap attainability, and working risk limits.
- [x] Confirm optimizer stability and improved diversity with 10,000 outcomes per
      mode.
- [x] Measure and review RTP, hit rate, volatility, tails, and feature frequency
      with 100,000 outcomes per mode.
- [x] Confirm final-scale stability with 999,906 outcomes per mode.
- [x] Add bonus-tail headroom below the working CVaR limit.
- [x] Freeze the reviewed base trial 1 and tuned bonus trial 9 locally.
- [ ] Obtain external Stake Engine math approval before release.

### Milestone 12 exit gate

Review and accept the working direction in
[`classic-nine-product-spec.md`](classic-nine-product-spec.md). Implementation
may begin before final math approval, but production books and displayed values
must remain blocked until simulations pass every recorded gate.

## Milestone 13 — submission-readiness evidence

Status: **reference evidence complete; release-candidate frontend/assets/QA
deferred**.

- [x] Select distinct positive-weight frozen replay IDs for loss, normal win,
      big win, feature trigger, retrigger, and win cap where applicable.
- [x] Record that bonus mode has no zero-payout loss outcome.
- [x] Produce frozen English rules, paytable, modes, RTP, maximum win, feature,
      controls, settlement, and disclaimer copy.
- [x] Produce sweeps-English copy for `social=true`.
- [x] Implement the information panel and runtime standard/sweeps copy selection.
- [x] Set local candidate version `1.0.0` and version the replay route templates.
- [ ] If Signal Nine is selected for release, create and integrate its original
      production visual/audio assets.
- [ ] Complete responsive, popout, jurisdiction, accessibility, and device QA.
- [ ] Stage the checksummed upload bundle without external upload.

## Milestone 14 — multi-game studio boundary

Status: **architecture defined; implementation migration deferred**.

- [x] Define the studio platform, game definition, and game experience layers.
- [x] Record ownership rules for shared and game-specific code and assets.
- [x] Define the minimum self-contained package expected for each future game.
- [x] Define ordered concept, definition, math, experience, integration, QA, and
      submission gates.
- [x] Position Signal Nine as the technical reference game rather than the default
      mechanic or visual template.
- [x] Create and score an initial portfolio of mechanically distinct slot concepts.
- [x] Produce definition sketches for the three-concept shortlist.
- [x] Reject the current prediction mechanic where presentation-only choice could
      mislead players about monetary agency.
- [x] Record the preferred wizard-versus-dragon pixel-art sticky-reel direction.
- [x] Define its four play modes, three bonus tiers, honest anticipation policy,
      art-quality rules, animation layers, audio language, and validation gates.
- [x] Exclude a collect-or-risk wheel from the first game and retain direct
      three-, four-, and five-rune bonus tiers.
- [x] Select the WIZARD CRAFT grayscale cabinet composition.
- [x] Define independently addressable source assets and offline atlas packing.
- [x] Select the ember-and-aether color direction.
- [x] Define the native pixel grid, fixed palette, materials, lighting, motion, and
      vertical-slice asset set.
- [x] Record a working 25,000× maximum win and enforce it in the presentation
      contract.
- [x] Add the deterministic vertical-slice duel event book, resume projection, and
      independent runtime asset-slot registry.
- [x] Define character VS expansion, block, Clash, acknowledgment, tier, and
      recovery behavior before further animation production.
- [x] Defer selectable Wizard/Dragon volatility until balanced-mode math proves
      feasibility; reserve explicit future bet-mode boundaries.
- [x] Add block and Clash-advantage events plus deterministic timing books.
- [x] Define one VS multiplier-reel system across base play, both extra-chance
      modes, immediate feature entry, and all three bonus tiers.
- [x] Define additive contributing multipliers, Tier I temporary reels, Tier II
      optional stickies, and Tier III guaranteed early sticky placement.
- [x] Refactor the provisional inward-claim event contract to the approved
      any-reel VS multiplier contract.
- [x] Validate every paid mode and bonus tier with deterministic placeholder
      proofs.
- [x] Run a seeded mechanic-distribution study across 250,000 entries per paid
      mode and record the limits of that evidence.
- [x] Author the first WIZARD CRAFT paytable and physical reel-strip hypothesis
      in the official SDK.
- [ ] Run exploratory official-SDK payout batches to select actual mode costs,
      trigger rates, multiplier ranges, tier weights, RTP allocation, and
      volatility.
- [x] Build and structurally verify official-SDK payout hypothesis 001.
- [x] Reject hypothesis 001 after excessive full-wild ways amplification caused
      56 natural cap results in 1,000 immediate-feature candidates.
- [x] Build payout hypothesis 002, reduce immediate-feature cap candidates from
      56 to 3 per 1,000, and prove 96.50% optimizer feasibility in all modes.
- [x] Regenerate review-candidate integer lookup weights from platform-valid
      books while preserving Tier I/II/III shares and the 0.01% book cap.
- [ ] Promote final integer lookup weights only after isolated official
      verification, cross-mode overlap review, replay inspection, and checksum
      selection.
- [x] Validate a read-only tier-preserving 10,000-book calibration at 96.50% RTP
      for all four modes.
- [x] Identify rare-tier concentration as the blocker: Base Battle has only 15
      Tier III candidates and 2.82 effective books after calibration.
- [x] Regenerate and structurally validate the stratified 100,000-book pool
      after correcting non-decimal paytable awards rejected by the official
      verifier.
- [x] Confirm tier-preserving floating feasibility at 96.50% RTP with at least
      395 conditional effective books in every mode subgroup.
- [x] Reconstruct integer tier-preserving candidates and review exact total
      weight, RTP, CVaR, ETL, tails, and individual-book concentration.
- [x] Run official structural, hash, payout-array, and entry-count verification
      against the integer candidates.
- [x] Run weighted cross-mode payout/event overlap analysis and select
      deterministic loss, near-miss, normal-win, large-win, tier, and cap books.
- [x] Build a deterministic layered WIZARD CRAFT replay shell with Base Tier III,
      near-miss, Siege large-win, and Grimoire large-win fixtures.
- [x] Implement the event-to-animation/audio cue contract with authored review,
      normal, fast-play, and reduced-motion timing profiles.
- [x] Lock the selected reference checksums and audit the replay shell against
      explicit static-composite and motion acceptance gates.
- [x] Freeze candidate English and sweeps-English information contracts for the
      paytable, four modes, three tiers, VS values, controls, RTP visibility,
      settlement, and required disclaimer.
- [x] Add a game-state parser hook at the HTTP boundary and compose a
      WIZARD CRAFT session that fails closed before presenting malformed raw
      Stake events.
- [x] Validate all selected flattened official books against board, symbol,
      lifecycle, tier, sticky, additive multiplier, running-total, and cap rules.
- [x] Enforce approved paid-mode identity for player intent, returned rounds, and
      every reveal inside the returned event stream.
- [x] Add resumable one-event-at-a-time presentation control that checkpoints
      only rendered events and settles only after the complete book.
- [x] Add strict anonymous WIZARD CRAFT replay composition with fixed
      game/version/mode/cost identity, shared book validation, no wallet surface,
      and request-free Play Again.
- [x] Derive WIZARD CRAFT controls, information copy, RTP visibility, speed
      availability, and immediate-feature access from authenticated jurisdiction
      flags, enforcing restrictions at intent boundaries.
- [x] Gate new-round completion on the platform minimum duration and record the
      checked repositories' undocumented duration unit as risk R-020.
- [x] Connect every validated official event to immutable before/after layered
      state and authored visual/audio cue commands, committing state only after
      successful rendering.
- [x] Project exact layered state at resume checkpoints and correct retrigger
      handling to use the server-provided new total.
- [x] Map session lifecycle and every documented RGS failure to safe UI states,
      locking player intent outside idle and preventing raw internal messages
      from reaching standard or sweeps surfaces.
- [x] Bind authenticated amount levels, mode costs, jurisdiction availability,
      speed selection, spacebar intent, and explicit autoplay confirmation into
      a tested WIZARD CRAFT control controller.
- [x] Mount that controller into a framework-neutral semantic HTML surface with
      focus-managed information and autoplay dialogs, safe status messaging,
      reload, sound, amount, mode, speed, Play, and keyboard controls.
- [x] Add a sequential autoplay runner that accepts only confirmed counts,
      starts a new result only after the prior result has fully presented and
      settled, rechecks jurisdiction availability between results, and stops
      safely after the accepted result completes.
- [x] Add the shared full-round driver used by manual and automatic play,
      including resume-state projection, layered rendering, per-event
      checkpointing, fast-play selection, and complete settlement.
- [x] Add the production audio scheduling boundary with game-specific cue IDs,
      authored beat offsets, per-layer interruption fades, mute synchronization,
      backend-failure isolation, and shared visual/audio event completion.
- [x] Add the Pixi-facing scene adapter with independent reel, Dragon, Wizard,
      clash, cabinet, and UI containers; deterministic beat routing; resume
      restore; rollback on failed animation; overlap protection; and required
      production-asset validation.
- [x] Implement the concrete reel-layer contract with responsive 5×4 geometry,
      authoritative board stops and anticipation, five independently addressable
      temporary/sticky VS overlays, sticky upgrades, release motion, feature
      progress, winning-cell highlights, and direct resume restoration.
- [x] Implement paired Dragon and Wizard character-layer contracts with locked
      red/oxblood and blue/white identities, direct feature/resume state,
      distinct owned/opposing/balanced reel presence, windup, brace, counter,
      launch, claim, recoil, contained-attack, and block choreography.
- [x] Implement the clash/effects-layer contract with the approved seven-layer
      multicolor fire recipe, four-layer blue-white magic recipe, separate
      projectile flights, advantage-aware collision and sticky surge, and hard
      camera/flash/particle bounds including zero-motion fallbacks.
- [x] Implement the cabinet/environment-layer contract with contained 16:9
      desktop, mobile, and popout geometry; title/crest/tier restoration;
      independent Dragon, Wizard, and balanced lighting; anticipation glow;
      feature entry/retrigger/end; exact 25,000× response; and ambient-motion
      control.
- [x] Implement the in-canvas UI-layer contract with exact book-unit win
      formatting, mode and tier labels, feature progress, ordered VS ownership,
      maximum lock, semantic counter animations, and minimum readable desktop
      and mini-player typography.
- [x] Assemble the production runtime factory: required-asset gate, six concrete
      scene layers, visual/audio renderer, full-round and resume driver,
      autoplay, semantic controls, shared resize, and ordered disposal under one
      tested lifecycle.
- [x] Add the browser delivery boundary for production assets and sound:
      complete required-image validation, duplicate/origin/protocol/MIME/size
      rejection, load progress, decoded WebAudio buffers, per-channel gain,
      resumable contexts, and click-free voice interruption.
- [x] Add the browser-to-Pixi texture boundary: MIME-preserving bitmap decode,
      dimension validation, typed asset-ID lookup, deterministic progress,
      atomic failed-upload cleanup, idempotent disposal, and a version-neutral
      `Texture.from` adapter.
- [x] Build the production Pixi asset scene graph with six stable ordered
      containers, typed sprite lookup for every vertical-slice asset, deliberate
      initial visibility, reduced-motion replacement switching, missing-texture
      rejection, partial-construction rollback, and idempotent teardown.
- [x] Implement concrete Dragon and Wizard sprite views that map every existing
      character action to owned idle, windup, attack, claim, or block artwork;
      distinguish quick/heavy timing; preserve static zero-motion communication;
      hold the maximum-win claim; and cancel or dispose without stale poses.
- [x] Implement the concrete clash sprite view with independent concurrent
      multicolor-fire and blue-white-magic flights, normalized server-selected
      reel targeting, advantage-owned ward/firewall responses, bounded
      multiplier-scaled collision layers, persistent cap treatment, static
      zero-motion impacts, and family-scoped cancellation.
- [x] Implement the concrete reel sprite view around replaceable final-symbol
      cells: responsive 5×4 geometry, five aligned masks and overlay channels,
      ordered reel stopping, per-reel anticipation holds, temporary/sticky claim
      and upgrade phases, release, exact winning-cell highlights, feature
      progress, cancellation, teardown, and production resize propagation.
- [x] Implement the concrete 640×360 cabinet/environment sprite view with one
      whole-scene responsive transform, authored component rectangles, exact
      crest restoration, independent Dragon/Wizard/balanced lighting ports,
      moving/static fog selection, tier and retrigger accents, strict 25,000×
      maximum presentation, cancellation rollback, and leak-free teardown.
- [x] Implement the concrete canvas UI sprite/text view with exact mode, tier,
      spin, win, final, and 25,000× copy; five independently owned multiplier
      views; desktop/popout typography propagation; bounded visual-only
      count-ups that land on server amounts; field-scoped cancellation; and
      idempotent display-object teardown.
- [x] Assemble the browser production app factory: secure manifest load, bitmap
      and audio decode, GPU texture creation, six-container Pixi asset scene,
      all concrete view construction, WebAudio backend, controls/runtime,
      initial resize, automatic resume/start, mount ownership, staged boot
      rollback, and one idempotent ordered disposal boundary.
- [x] Pin PixiJS 8 and implement the real browser renderer adapters: nearest-
      neighbor `Texture.from`, labeled containers/sprites, explicit non-owning
      texture teardown, 20 Pixi symbol-cell displays, five cloned VS overlay
      displays, additive bounded cabinet lights, responsive Pixi text and reel
      multiplier objects, and an async host-mounted application surface.
- [x] Generate and archive WIZARD CRAFT production-master candidate v1 from the
      locked color reference, preserving the exact title, thick cabinet,
      Dragon/Wizard placement, 5×4 hierarchy, and approved multicolor fire;
      record dimensions, checksum, and explicit non-shippable redraw gates.
- [ ] Redraw and decompose the master candidate into native-grid independent
      cabinet/environment, character, effect, symbol, and UI source assets; do
      not ship crops from the flattened generated candidate.
- [x] Begin independent environment redraw with an empty castle-hall plate and a
      separate lowest-layer sky-back candidate; archive full-resolution sources,
      checksums, provenance, and remaining native-grid/palette/responsive gates.
- [x] Create the independent distant-castle silhouette candidate using a flat
      chroma source and offline alpha extraction; retain transparent tower
      openings, validate the RGBA matte and green spill, and archive both source
      and cleaned checksums without adding browser-time image processing.
- [x] Create separately authored rear-left and rear-right arch candidates—not a
      mirrored pair—with full-resolution chroma sources, offline RGBA extraction,
      alpha bounds, zero visible high-saturation green spill, checksums, and
      explicit native-grid/composite-review gates.
- [x] Create separate upper-left and upper-right hanging-chain candidates with
      readable link holes and asymmetric curves; retain chroma sources, perform
      offline alpha extraction, verify zero visible green spill, and record
      checksums plus link/title-safe cleanup gates.
- [x] Create the independent stone-floor/threshold candidate, extract and verify
      its transparent matte offline, then assemble a deterministic seven-layer
      environment review composite; confirm a quiet cabinet-safe center,
      aligned castle/floor horizon, asymmetric arches, and flag the chains for
      reduced idle alpha plus final title-safe review.
- [x] Complete the environment atmosphere source-candidate pass with separate
      low fog, high mist, and asymmetric pixel-cluster vignette layers; validate
      alpha bounds and zero visible green spill, assemble the deterministic
      atmosphere review composite, and reserve stronger fog opacity for
      anticipation/bonus states with reduced-motion substitutes.
- [x] Begin the cabinet structural redraw with a heavy empty title/lintel source
      plus independently authored Dragon-side and Wizard-side pillar candidates;
      preserve red/blue ownership, validate clean alpha with zero visible green
      spill, and record the required next-stage separation of stone, inlays,
      rune channels, sockets, caps, title backing, and crest socket.
- [x] Add the exact separate WIZARD CRAFT gold wordmark, uninterrupted dark reel
      backing, and heavy red-left/blue-right bottom sill; assemble a deterministic
      cabinet structural review over the environment, confirm the thick decorated
      silhouette and clear reel field, and identify title scale, pillar seam, and
      central VS-socket work for the native-grid redraw.
- [x] Add and validate the cabinet response layers: reject the incorrect first
      divider attempt, confirm the corrected overlay has six vertical and five
      horizontal rail bands for exactly 5×4/20 cells, create separate six-stage
      Dragon and Wizard rune strips plus the empty-socket clash crest, and review
      their readability and isolation from symbols/sticky overlays.
- [x] Create reusable Dragon-owned, Wizard-owned, and balanced/contested sticky-
      reel frame candidates with distinct non-color silhouettes and separate
      live-multiplier sockets; verify zero visible pixels in each central symbol
      region, then review three simultaneous sticky reels and flag only the top
      socket/crest clearance for native-grid reduction.
- [x] Separate persistence from ownership with reusable open-corner/hourglass
      temporary treatment and four-clamp permanent-sticky treatment; add neutral
      claim sweep, multicolor multiplier-upgrade burst, and sparse release
      fragments, validate their alpha mattes, and review simultaneous temporary,
      upgrading, and locked reel states without symbol obstruction.
- [x] Begin the articulated Dragon source rig with separate upper skull, lower
      jaw, curved neck, tapered foreground coil, and eye; validate every matte,
      assemble a deterministic cabinet fit review, confirm the approved
      lower-left wrap and reel-safe head boundary, and retain visible attachment
      sockets only as source-stage guides for later overlap masks/segments.
- [x] Correct the Dragon's mechanical-looking source joints before extending the
      rig: replace the jaw ring, both neck tubes, and both coil sockets with
      organic overlapping cheek/body/tail scales; version the corrected sources,
      supersede the affected v1 candidates, and confirm the revised composite
      preserves articulation without visible robotic anatomy.
- [x] Extend the organic Dragon rig with rear tail-mid, corrected compact tail
      tip, exactly three-taloned sill-bracing claw, and separate long-front/short-
      rear horn sources; reject the four-taloned claw and overlong false tip,
      validate the corrected anatomy, and confirm one continuous tail remains
      below reel and future Wizard-platform space.
- [x] Build the Dragon's modular attack source set with separate nostril tell,
      anatomy-free mouth charge, quick burst, and heavy stream; preserve the
      approved white-hot through blue-lavender fire progression, validate clean
      alpha, and review mouth registration plus bounded reel-crossing attack
      placement without treating the QA composites as runtime art.
- [x] Re-anchor the Wizard to the selected color reference as a small high-right
      duelist with an oversized crooked hat, shadowed face, white beard, narrow
      stance, and leftward cast; reject oversized/front-facing explorations,
      create a tall narrow reactive tower candidate, validate clean alpha, and
      confirm the Dragon/Wizard scale hierarchy in a cabinet fit review.
- [x] Begin the poseable Wizard source rig with independent oversized hat,
      cabinet-readable beard, and compact rear-robe layers; preserve seam-hiding
      overlaps and the approved blue-white silhouette, validate clean alpha, and
      retain the full Wizard only as a registration/proportion guide rather than
      a permanent animation pose.
- [x] Author silhouette-distinct Wizard hat reaction candidates for neutral,
      anticipation, block/recoil, and confirmed win/bonus states; validate clean
      alpha, compare them at reduced size, and lock honest state mappings so near
      misses cannot borrow the celebration silhouette.
- [x] Replace detailed Wizard facial anatomy with a larger clean blue-black
      magical void under the brim and independent blue-white idle, anticipation,
      recoil, and celebration eye pairs; validate clean alpha and review the
      hat/void/eyes/beard overlap stack without requiring facial or brim redraws.
- [x] Correct the Wizard costume away from a tailored royal mage: reject the
      shoe-bearing belted gold-trimmed body and tube-cuff sleeve explorations,
      supersede the gold-edged rear robe, create a plain baggy blue robe that
      pools over and hides the feet, and add a separate oversized casting sleeve
      whose gathered wrist must remain behind the future hand layer.
- [x] Replace the gathered/cuffed casting sleeve with a true classic-Wizard
      drooping sleeve: extend a broad irregular untrimmed bell well below the
      implied forearm, reserve deep interior shadow for the separate hand, and
      prohibit cuffs, wristbands, fitted forearms, piping, and socket-like ends.
- [x] Lock the Wizard's anatomical-left rubber-hose casting glove from the
      user-supplied pixel source: retain the pinky-side three-quarter depth with
      pinky nearest and thumb farthest, remove only the chroma background, and
      hide its rounded arm-hole base beneath the approved sleeve without adding
      a visible wrist or regenerating the hand.
- [x] Require play amounts to belong to server-provided `betLevels` and reject
      incoherent default/list configurations during authentication.
- [ ] Play the selected replay catalog through the actual frontend and review
      timing, anticipation honesty, character reactions, sticky readability,
      and fast-play legibility.
- [ ] Select the first intended release from a reviewed portfolio of game concepts.
- [ ] Migrate to per-game packages only when a second game makes the abstraction
      concrete.

### Milestone 14 exit gate

Compare a small portfolio of original slot concepts and deliberately select the
first release candidate. Do not commission production gameplay art or audio until
that game's concept and definition gates are accepted.
