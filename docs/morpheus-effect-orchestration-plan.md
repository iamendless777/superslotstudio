# Morpheus: Dreamfall — Effect Orchestration Plan

Historical snapshot: this plan records the orchestration contract and audit state
at the time it was written. Later StakeStudio source and the live project may
supersede its inventory counts, fingerprints, proof totals, and remaining-work
statements. Treat the repository implementation and fresh audits as authoritative.

Status: governed production plan. This document supplements the approved
`morpheus-game-info-v2-100000x-approved-20260811` mechanic contract. It does not
claim that the current production project implements the approved game.

## Product standard

Morpheus must beat the reference standard through original mechanics, causal
readability, persistent-state clarity, audiovisual identity, deterministic
replay/reconnect, and truthful information. A visible effect is complete only
when its authoritative event, state mutation, asset roles, motion, audio,
blocking acknowledgement, recovery behavior, viewport behavior, and fallback
are all declared and proven.

The frontend must never invent an outcome. The governing order is:

1. Predetermined declarations.
2. Final authoritative reveal.
3. Positive, 0.1x-quantized settlement.
4. Special-symbol board reactions.
5. Persistent feature-state reactions.
6. Awards or retriggers.
7. Acknowledged tumble or restricted refill.
8. Recap and ambient cleanup.

An exact 100,000x settlement preempts every later mutation and is followed only
by the terminal round event.

## Render profiles

Base play uses the ordinary 6x4 reel bay. Dreamfall activates a typed,
checkpointed render profile from feature entry through feature exit. It reuses
the existing reel renderer and reserves a 6x8 square-safe world:

- Design bay: x=413, y=16, width=470, height=600.
- Inter-cell gap: 4 design pixels.
- Cell: 75x75 design pixels.
- Mini viewport cell: 23.4375x23.4375 pixels at 0.3125 scale.
- Reels remain bottom-aligned and grow independently from four to eight rows.
- Each reel owns its mask, empty shaft, side rails, and moving top cap.
- Static and motion layers preserve authored aspect and use declared safe
  rectangles. Grown rows receive the same motion eligibility as initial rows.
- Leaving Dreamfall restores the standard base bay and removes the Dreamfall
  persistent HUD.

The previous 33x19.375 mini-cell evidence is rejected. It established that 48
DOM images were present, but not that their on-screen composition or animation
layers were undistorted and recognizable.

## Authoritative effect priority

| Priority | Owner | Events and responsibilities |
|---|---|---|
| P0 | Terminal | `maxWinReached`, `roundTerminated`; preempt all pending board and feature mutation |
| P1 | Predetermined setup | `guaranteedScatters`, `guaranteedSpecialReveal`, `rainingWilds`, `stackedReels`, controlled Enhancer selection |
| P2 | Board authority | `reveal`; commits the visible outcome |
| P3 | Settlement | `winInfo`; opens reactions only for a positive multiple of 10 book units |
| P4 | Special reactions | Mystery, Star, Rift, Veil Wild, Echo Split, Dawn Purge and related board transforms |
| P5 | Persistent systems | position grids, Veil bars/upgrades, Lucid family multipliers, Dreamfall height and chain state |
| P6 | Awards | free-spin awards, retriggers, feature-tier ceremony |
| P7 | Board continuation | acknowledged `tumbleBoard` and restricted refill |
| P8 | Cleanup | recap, ambient release, feature exit |

Parallel work is permitted only after authoritative state is committed, only
for disjoint visual/audio channels, and only when the interaction contract says
it is safe. Shared positions, shared state owners, target selection, board
mutation, refill ownership, and terminal behavior are always serialized.

## Mode journeys

| Mode | Required journey and persistent instrument | Current production gap |
|---|---|---|
| Base | Reveal, ways win, reaction, tumble, recap | Generic route exists; authoritative Morpheus binding coverage is incomplete |
| Dream Enhancer | Moon searches declared candidate gates, settles on authoritative board, then normal loop | No governed search/selection event journey or bespoke audio |
| Trickster Dream | Constellation grid wakes; touched positions double and persist during the one-spin cascade | No live mode-grid instrument or full recovery policy |
| Nightmare Descent | Three sealed reliquaries reveal predetermined specials in sequence and launch them to fixed positions | Reliquary assets, pool/conflict rules, cue family, and final price approval missing |
| Veil Ascent | Paying families route essence to persistent bars; threshold triggers a readable upgrade/reset ritual | No authored bar, routing, overflow policy, or complete choreography |
| Lucid Blessing | Persistent family rack starts at 1x and doubles only the settled winning family; wild excluded | No authored rack, full arithmetic display, or cue family |
| Dreamfall | Square-safe shafts grow independently; chain ladder and +1 awards stay visible | Signature route exists; production spectacle, compact assets, and full-game math are incomplete |
| Oneiric Nexus | Living position plates wake and double unique settled contributing cells | No authored grid/HUD, cap/lifetime policy, or full recovery proof |

Every mode still needs explicit entry, core loop, escalation, award/retrigger,
exit, recap, normal/fast/reduced/none behavior, replay behavior, and reconnect
behavior.

## Special and generator choreography

| Mechanic | Required causal presentation | Asset/effect gap |
|---|---|---|
| VEIL_WILD | Pour downward cell by cell, stop visibly before a protected wild or special, then acknowledge | No dedicated pour/stop motion or cue |
| LUCID_WILD | Reveal the authoritative value ladder badge before or with settlement contribution | No compact value badge/rack and no dedicated cue |
| DREAM_RIFT | Contained 2x2 implosion with explicit footprint | Static/motion foundation exists; no dedicated impact/audio contract |
| GOLDEN_RIFT | Larger 3x3 solar fracture with explicit footprint | Static/motion foundation exists; no complete collision/audio contract |
| ECHO_SPLIT | Identify exact winning contributors, split them, and reconcile visible ways change | No ways-accounting presentation or cue |
| DAWN_PURGE | Dissolve lows, hold readable empty cells, then perform the restricted initial refill | No two-stage authored route or empty-board recovery checkpoint |
| ONEIRIC_STAR | Declare target family, chain to every eligible copy, then convert | No separate selection/chain/convert recipes or cue family |
| MYSTERY_VEIL | All Mystery symbols breathe and reveal together while retaining accounting identity | No synchronized reveal recipe/audio contract |
| Raining Wilds | Declare positions, crack the moon, and rain identifiable wild variants before final reveal | Generator assets and cue family missing |
| Stacked Reels | Seal selected columns with banners before the authoritative identical-stack reveal | Banner assets and cue family missing |
| Guaranteed Bonus | Land Gates one by one and escalate distinctly for the 3/4/5/6-scatter tiers | Existing Gate binding uses a legacy event and has no four-tier journey |
| MAX MORPHEUS | Preempt the round, run a blocking full-scene ceremony, show exact 100,000x, terminate deliberately | Existing verdict listens to legacy `wincap`, is nonblocking, and current production config is still 50,000x |

For every board-changing special, the contract must explicitly decide whether
the mutation affects the current settlement or the next board. Under the
approved post-settlement grammar, the default is next-board-only; no frontend
may silently reinterpret this.

## Asset inventory and closure

The saved project currently contains 83 asset files:

- 29 high-resolution visual masters.
- 29 named runtime derivatives.
- 24 motion atlases.
- 1 project spin-control asset.

All 21 symbol identities have static art and all 24 motion atlases are
registered and packaged. This is broad media coverage, not complete
orchestration coverage.

Known closure defects:

- `runtime/background-v1.png` is stale relative to its saved source.
- `runtime/rift-wild-v1.png` is stale relative to its saved source.
- The last compiled frontend output does not declare/package a verifiable match
  for the inner-pillars foreground, flora-left, flora-right, or crown-sigil
  assets. Compiler source now includes those declared layers; regenerate and
  verify the portable output before closing lineage parity.
- Eleven named UI outputs sit outside the compiled manifest even though hashed
  equivalents are packaged.
- `living-rift-core` is shared by three distinct mechanic roles without a
  declared variation/reuse policy.
- `oneiric-impact` is shared across multiple presentation roles without a
  declared semantic variant contract.
- There are no `compact8` symbol assets or authored focal/safe rectangles.
- There are no compact motion variants. The renderer now enforces an aspect-safe
  overlay policy and covers grown rows, but production still needs authored
  compact variants where the 23.4375px mini cell cannot preserve recognition.
- The Dreamfall shaft caps/rails and chain/award HUD are procedural placeholders,
  not authored production assets.
- Audio contains three generic loops and 21 generic stingers, but no distinct
  cue families for most approved mechanics.
- The current character rig proves deterministic playback, but is a limited
  four-page/two-bone presentation system rather than premium articulated acting.

## Studio orchestration record

Every game mechanic and authoritative event must provide a reusable
`stake-studio-asset-orchestration-v1` record containing:

- identity: mechanic, promise, source event, owner, phase, preconditions;
- state: reads, writes, settlement quantum, before/after evidence, checkpoints,
  current-settlement versus next-board disposition;
- spatial truth: source, affected and protected positions, accounting identity,
  footprint, anchor and crop policy;
- dependencies: priority, `after`, `before`, conflicts, safe parallel groups,
  batch key, state owner and terminal behavior;
- presentation: recipe, required asset roles, targets, normal/fast/reduced/none
  durations, blocking acknowledgement, interruption, cleanup and skip policy;
- audio: cue IDs, bus, ducking, concurrency, no-repeat, motion-mode behavior and
  explicit intentional silence;
- recovery: checkpoint placement, replay/reconnect behavior, idempotency key and
  already-applied/pending-ack behavior;
- budgets: maximum simultaneous sprites, emitters, filters, texture memory,
  voices and viewport degradation tier;
- lineage: source SHA, derivative transform/SHA, packaged path/SHA;
- viewport rendering: intrinsic dimensions, intended aspect, fit, safe rectangle,
  crop policy, minimum painted size and fallback asset.

Unknown decisions are recorded as `contract-detail-required`; generic fallback
is never treated as completion.

## Studio acceptance gates

1. Registry closure: every saved and packaged file is registered or explicitly
   intentional; no undeclared output or missing dependency.
2. Lineage parity: source to runtime to package SHA chain is complete and fresh.
3. Role semantics: active asset IDs and SHAs match the event/mechanic allowlist;
   overloaded media has an approved reuse policy.
4. Render integrity: actual archived cell crops prove intrinsic and rendered
   aspect, scale X/Y, object-fit/crop, alpha bounds, focal-feature occupancy,
   clipping and occlusion. Nonuniform scaling over 2% fails unless explicitly
   authored and approved.
5. Recognition: every actual cell crop is compared against every family reference
   at the same output size and must clear a top-one classification margin. Source
   identity alone is insufficient.
6. Viewports: desktop/mobile/mini at 4, 5 and 8 rows, including mixed-special
   boards and persistent HUD/control collision checks.
7. Choreography closure: all 20 authoritative/foundation event types declare
   visual, character, audio, fallback, acknowledgement and recovery decisions.
8. Causality: exact order, blocking, cancellation and terminal preemption; no
   late board substitution or advance through unfinished presentation.
9. Interaction matrix: every legal pair in a shared mode plus selected high-risk
   triples; forbidden pairs and state/footprint ownership are explicit.
10. Motion/recovery parity: normal, fast, reduced and none converge on identical
    event, board, state and acknowledgement hashes; replay/reconnect are
    idempotent.
11. Capture binding: each receipt names active static/motion assets, animation
    frame, VFX recipe, character state, audio cues, transforms, collisions and
    packaged SHAs.
12. Performance/readability: worst-case mixed stacks stay within viewport GPU,
    memory and audio budgets without hiding causality.

## First production proofs

Before broad mechanic implementation, complete these two full-stack traces:

1. Mixed route: Mystery reveal → Star target/convert → Dreamfall reel growth →
   chain/award state → acknowledged tumble.
2. Terminal route: exact 100,000x settlement → MAX MORPHEUS ceremony → terminal
   round event, with every later mutation actively rejected.

Both traces must pass normal, fast, reduced and no-motion presentation;
desktop/mobile/mini capture; replay; reconnect; asset-role binding; audio
collision; and actual rendered-cell recognition.

### Executable proof-route foundation

The causal/state foundation for both routes is now executable without changing
the production math configuration. `MorpheusEffectProofTraces.js` builds typed,
fingerprinted event books for the nine-step mixed route and the four-step exact
MAX route. `MorpheusEffectOrchestrationRuntime.js` projects each authoritative
envelope through the governed P0-P8 entry, requires evidence-bearing
acknowledgement before dispatching the next event, checkpoints only at committed
barriers, and reconstructs the complete source trace before marking it complete.

The mixed fixture preserves `MYSTERY_VEIL` accounting identity, reveals it as
the Star's declared target family, resolves the Star board transform, grows one
Dreamfall reel, publishes the fifth-hit award, and ends at the authoritative
tumble acknowledgement. Its protocol hashes are event `769ce0e1`, board
`838814de`, state `68bf30ad`. The exact-MAX fixture settles 10,000,000 book units
(100,000x) from three visible `MAX_MORPHEUS` contributors, accepts the MAX
acknowledgement, permits only `roundTerminated`, and rejects tumble or any other
mutation. Its protocol hashes are event `f23c663c`, board `2e3094e8`, state
`73460a58`.

Normal, fast, reduced and no-motion playback converge on identical event, state
and semantic trace hashes for both routes. No-motion performs every state
commit, audio decision and acknowledgement barrier while suppressing
route-owned motion. Checkpoint reconnect converges with uninterrupted
mixed-route playback and rejects repeat mutation.

The existing Preview renderer now executes both routes through
`MorpheusEffectOrchestrationPreviewDriver.js`. Typed presentation plans bind
Mystery, Star and MAX events to the saved Mystery seam, Star prism/impact and
MAX ascension atlases; MAX also binds the verdict plate and `wincap` character
state. Each blocking command is acknowledged only after the renderer promise
settles. StudioBridge and MCP expose `play_morpheus_effect_proof_route`, and the
shared Preview state publishes the complete causal trace, asset coverage and
production-readiness verdict. Live Studio playback on 2026-08-11 passed the
nine-event mixed route and four-event terminal route with zero active
diagnostics. The terminal route displayed the authoritative 100,000x value even
though the untouched production project still declares 50,000x.

The seven specialty audio identities now have a deterministic, replaceable
foundation pack rather than generic substitutions. `SpecialtyCueFactory.js`
builds and audits distinct local WAV cues for Mystery reveal, Star target and
conversion, Dreamfall growth/progress/award and MAX; each cue carries its own
fingerprint, bus/concurrency group, priority, ducking and interruption policy.
The live Audio panel installed all 7/7 cues (pack fingerprint
`morpheus-audio-1752fbdc`) and the existing mastering QA decoded all 31/31
project audio assets with no issues (fingerprint `ffd9d0f8`). The mixed route
returned six exact specialty playback receipts with no missing audio; the MAX
route returned terminal cue fingerprint `specialty-8149b138`, priority 100,
ducking enabled and `terminal-preempts-all` interruption policy before the
authoritative round termination.

The reusable full-stack capture gate is now executable through
`MorpheusEffectRouteCaptureQA.js`, `StudioBridge` and MCP. It requires both
routes in normal/fast/reduced/no-motion across desktop/mobile/mini: exactly 24
runs and 57 immutable PNGs, with every normal semantic beat and every other
mode's final state archived. The evaluator rebuilds authority from the frozen
traces, compares causal acknowledgement identity separately from renderer/audio
evidence, validates observed board/HUD projection, proves dispatch was rejected
before each acknowledgement, requires audio receipts, and fails no-motion if a
route-owned effect or presentation tween survives.

Definitive live run `run-20260812000624323` passed all `24/24` runs and `57/57`
semantic checkpoints with no issues. Its format is
`morpheus-effect-route-capture-qa-v4` and its fingerprint is
`morpheus-effect-capture-d4b38bd6`. Every checkpoint has two immutable PNGs:
the untouched composite seen by the player and a static-identity frame that
suppresses only the orchestration canvas while retaining geometry, HUD,
controls, masks and possible occluders. The result is 114 archived PNGs across
desktop, 667x375 mobile and 400x250 mini.

The server decodes each PNG and compares every visible cell against all 21
project symbol families. Composite readability requires the authoritative
family to remain the top match; static identity retains the stronger 0.012
top-one margin. The analyzer mirrors the real two-stage browser pipeline
(authored source -> unscaled game-layout cell -> transformed viewport pixels)
at the crop's native resolution. It never enlarges mini evidence. Across the
final run the minimum static/composite margin was 0.024355 and the minimum best
score was 0.741441. Earlier runs are retained as negative evidence for blank
captures, stretched cells, HUD occlusion, fixed-resolution feature loss and an
invalid shrink-only transform assumption.

After the v4 capture, the generic Preview replay and performance evidence was
refreshed rather than left stale. Replay passed 23/23 cases with fingerprint
`62049ac1`. Performance passed all three viewports with fingerprint `b10014d6`:
approximately 60 FPS averages, p95 18.2/18.3/18.5ms for desktop/mobile/mini,
and 62,879,064 bytes of measured texture memory.

This remains an audiovisual foundation, not final premium mastering. The route
correctly reports `productionReady: false` because these generated sources are
marked `approvalStatus: foundation`; changing that verdict requires explicit
human audio/art-direction approval or approved replacement masters, not merely
the existence of playable files. No-motion policy, route-specific
desktop/mobile/mini capture sets and crop/classifier-level rendered-cell
recognition during every beat are now proven. Portable compiled-frontend route
wiring and production-book reachability remain required before these routes
satisfy the full-stack gate above.

## Completion boundary

### Dreamfall-only cabinet state

The 8-row bonus no longer inherits the Base cabinet's wide paired columns and
heavy lintel. A dedicated authored foreground,
`morpheus-dreamfall-shaft-pillars-v1.png`, supplies two slim segmented
dreamglass shaft pillars with no crossbeam over the reel field. The typed
`MorpheusDreamfallCabinetProfile` activates it only for project
`morpheus_dreamfall` while the Dreamfall world and square-safe render profile
are active; it replaces the Base foreground for that state and restores Base
unchanged on exit. Preview and compiled frontend consume the same profile.

The profile reserves opening x405–890/y10–625 around the exact reel bay
x413/y16/470×600 and keeps the HUD boundary at y624. The generated transparent
master is 1280×800, SHA-256
`a5767abd57ea96b728e327d172c1684f2e874a07493ec8fc2ef7909a432584a3`.
The compiled mini route visibly activated
`morpheus-dreamfall-cabinet-profile-v1`, hid the Base foreground, and retained
the authoritative route barrier. Full Morpheus regression is 126/126, focused
cabinet/compiler/portable parity is 27/27, and the production build passes.

This also establishes a reusable Studio capability: a mechanic may declare a
typed, state-scoped cabinet profile with its own safe opening, reel bay, HUD
boundary, replacement policy and packaged foreground asset. Layout no longer
has to distort a game's mechanics to fit a single universal cabinet.

### Governed modes versus selectable wagers

The Studio now models the approved eight-mode contract without fabricating
prices. `MorpheusProjectContract` publishes all eight governed modes and their
access policy; only Base, Dream Enhancer, Trickster Dream, Veil Ascent and
Lucid Blessing are selectable wagers today. Nightmare Descent and Dreamfall
remain visible as release-gated with price pending approval. Oneiric Nexus is
visible as natural-entry-only. Preview and compiled Game Info render these in a
separate Feature & Governed Modes section.

`StakeApprovalProfile` replaces the obsolete universal 50,000x validator with
explicit two-star and three-star economics. A three-star project may carry the
exact 100,000x ceiling, $50,000,000 exposure limit, 1,500x maximum cost and a
derived $500 maximum base bet; two-star projects retain the lower bounds.

The saved-project migration remains dry-run-first, and the user has explicitly
authorized its application. The saved project now resolves to eight governed
modes, five selectable modes, 100,000x, 1% MAX RTP allocation and a $500
exposure-safe base bet. The existing 1,875,000-book six-mode publish is marked
invalid and cannot satisfy release gates. A recovery copy of the exact previous
project is retained at
`/private/tmp/morpheus_dreamfall-project-before-100000x-20260811.json`.

The obsolete duplicate 50,000x rejection in BuildEngine was also removed.
Build, paytable and blueprint validation now share `StakeApprovalProfile` as the
single economics authority: the exact 100,000x ceiling passes only for the
three-star profile, while two-star remains capped at 25,000x. Direct validation
against the migrated saved project has zero paytable issues; unresolved release
items are provider identity, remaining flagship promise evidence and new
officially verified contract-matching math books.

The implementation foundation now also enforces two global orchestration
preconditions. Persistent state reacts only after a positive 0.1x-quantized
settlement, and `VEIL_WILD` terminates its downward traversal before the first
protected wild/special. The blocker identity is carried in the event payload,
so the visual stop beat and deterministic replay do not have to infer it from
two completed boards. Studio runtime and generated official math share these
rules; production books have not yet been regenerated.

Veil/Lucid persistent-state semantics are now shared across Studio and official
math export. Veil bar progress is the union of unique contributing positions,
not a count of ways records, and every progress event identifies its paying
family and exact hit cells. Threshold overflow is retained; the lowest active
family can promote to any seeded available higher family. Lucid updates use the
frozen `symbolMultiplierUpdate` vocabulary and cannot target a wild family.
Preview and portable frontend consume the new payload without breaking legacy
replays.

Dreamfall's executable loop now owns its chain and award state. The chain
resets at each free spin, increments only on positive quantized settlements,
and mutates the actual remaining-spin total on hit five and every later hit.
Initial, tumble and reel-growth draws exclude scatters at their generation
boundary; authoritative reveal/tumble payloads never expose a symbol that the
math later replaces. Studio runtime and official SDK generation are in parity.

Oneiric Nexus now declares its 1x position grid once and publishes one causal
doubling event per unique settled contributor. This replaces the ambiguous
aggregate update blob with protocol-native `position`, `previous` and `current`
fields while retaining a one-cell compatibility view for existing marker code.
Final multi-cell payout aggregation remains governed and unresolved.

Echo Split now reacts only to authoritative contributing Echo cells. Each
unique contributing cell doubles once, while an Echo elsewhere on the board has
no effect. Its event carries the paying family, exact sources and reconciled
ways-before/ways-after values for animation and replay verification.

Oneiric Star now separates declaration from mutation: target selection is
authoritative and visible before the resolution transforms any copies. Mystery
Veil now carries its original landed identity per position alongside the common
revealed family, including through Veil bar accounting, so mixed Mystery/Veil
replay never conflates transformed and naturally landed symbols.

Dawn Purge now follows its promised two-stage route: positive settlement opens
the purge, exact low/source cells become the readable removal set, and the next
tumble owns a one-time non-low refill. It no longer silently substitutes a
finished board before reveal.

The Studio max path is no longer an ordinary-symbol board with a hidden forced
payout. A contributing `MAX_MORPHEUS` cell visibly causes the exact 100,000x
settlement, then `maxWinReached` preempts continuation and `roundTerminated`
closes the book. No tumble or later persistent mutation is legal. Production
weighting and official book verification remain separate gates.

The old mini stress image remains diagnostic evidence of a defect, not approval
evidence. Fresh v3 run `run-20260811213645272` passes the automated square-safe
render contract across desktop/mobile/mini. Its mini 8-row artifact is
`mini-max-growth-8-row-0ae2fe3e8ad0.png` with SHA-256
`0ae2fe3e8ad0ffdd8b349b8d11e706954b6d1c55cb513cbbcfce251de204fd5a`:
48 square cells, 48 aspect-safe motion flipbooks, grown-row coverage, no
occlusion, and no v3 issues. Human approval and compact8 art direction remain
open because a 23.4375px cell is inherently small even when undistorted. The
whole game remains incomplete until the approved eight-mode math, 96.00%
books/LUTs, exact 100,000x reachable terminal, full mechanic journeys, compiled
frontend parity, and release evidence all pass.

The Lucid ladder is now governed as two separate truths: creative/contract
reachability and optimized probability. All eleven approved values are frozen,
while the saved branch's existing weights remain unchanged until optimization.
`MorpheusProjectContract` reports missing positive Base and Free Game weights,
rejects weighted values outside the ladder, and refuses release status until the
distribution is marked production-optimized. This reusable gate prevents a
Studio from displaying a spectacular value that no generated book can reach,
without encouraging arbitrary probabilities during implementation.

Settlement ownership is no longer an open presentation decision. Lucid value
and contributing Echo ways are current-settlement arithmetic. Mystery, Star,
Rifts, Veil expansion and Dawn are positive-settlement reactions whose board
mutation is next-board-only. Their required route is landed authoritative board
→ quantized positive win → declared reaction/board transform → acknowledged
tumble from the reacted board. Both Studio and generated official SDK code now
enforce this order; MAX termination preempts it.

The saved portable frontend has been recompiled in place at compiler v9 with
112 files and the authoritative runtime enabled. It deliberately reports
production parity false until Lucid weights are optimized. Studio books expose
the reacted state as an explicit board transform before the tumble, and official
SDK replacements retain the winning symbol's explode flag through Mystery,
Star, Rift and Veil transformations.
