# Studio architecture

Super Slot Studio is a production system for multiple independent slot games.
Signal Nine is its reference game, not the studio template for every game's
mechanics, theme, or presentation.

The architecture has three layers. Dependencies point downward: a game experience
may consume its game definition and the studio platform, while neither shared
layer may depend on a particular game's artwork or presentation.

## 1. Studio platform

Shared, game-neutral capabilities:

- launch parsing, RGS transport, authentication, and jurisdiction flags;
- authoritative balance, bet validation, round settlement, recovery, and resume;
- public replay loading and replay-only controls;
- event-envelope versioning and runtime input validation;
- shared UI primitives for loading, errors, settings, information, accessibility,
  localization, and responsive layout;
- math generation, optimization, verification, freeze evidence, and packaging;
- submission checks, checksums, test fixtures, and CI.

The platform must not select outcomes, invent client-side payouts, contain a
game-specific paytable, or assume a particular reel layout or feature mechanic.

## 2. Game definition

One isolated definition per game:

- stable game ID, display name, and semantic version;
- modes, costs, RTP, maximum win, paylines/ways/clusters, and paytable;
- symbols and special-symbol behavior;
- feature triggers, retriggers, multipliers, and win-cap behavior;
- generated books, lookup tables, configuration, freeze manifest, and replay IDs;
- versioned event schema and deterministic presentation projection;
- rules and information-panel content, including sweeps terminology.

This layer describes what happened. It owns no wallet authority and performs no
RGS calls. Once approved, its math artifacts are frozen independently from
presentation-only changes.

## 3. Game experience

The unique player-facing implementation for one game:

- theme, world, characters, symbols, typography, and composition;
- reel or board renderer, animation, anticipation, pacing, and transitions;
- music, ambience, interaction sounds, reveals, wins, and feature audio;
- game-specific controls and explanations;
- responsive behavior and replay presentation.

It consumes validated events and displays them. It must never choose an outcome,
change a payout, mutate the balance, or reinterpret an event to create a different
result.

## Reuse policy

| Capability | Reuse across games | Game-specific |
| --- | --- | --- |
| Wallet/RGS lifecycle | Yes | No |
| Recovery and replay transport | Yes | No |
| Jurisdiction and accessibility controls | Yes | Copy or layout overrides only |
| Math tooling and artifact verification | Yes | Configuration and generated artifacts |
| Event envelope | Yes | Payload schema and event sequence |
| Information-panel component | Yes | Rules, modes, paytable, terminology |
| Loading, error, and settings UI | Yes | Optional visual skin |
| Button/error utility sounds | Prefer shared | Optional themed replacements |
| Gameplay sounds and music | No | Yes |
| Symbols, characters, backgrounds, animation | No | Yes |
| Core mechanic and feature design | No | Yes |

Shared assets should be limited to functional studio UI. Gameplay art and audio
must be commissioned or created after a game concept and mechanic are selected;
using one generic asset pack across games would weaken both clarity and originality.

## Required game package

A future game should be added as a self-contained package with:

```text
games/<game-id>/
  definition/     # modes, rules, event schema, information
  math/           # math-sdk source and frozen artifact evidence
  experience/     # renderer, animation, game-specific art/audio references
  replay/         # reviewed positive-weight scenarios
  submission/     # localized copy, asset manifest, QA and bundle evidence
```

The current repository has these concerns in separate top-level folders while the
first reference game establishes the contracts. Moving files into this shape is a
later migration, not a prerequisite for concept selection.

## New-game gates

Each new game passes these gates in order:

1. **Concept:** player loop, mechanic, audience, originality, and production scope.
2. **Definition:** modes, math targets, event vocabulary, and information outline.
3. **Math proof:** simulations, optimizer results, risk checks, and reviewed freeze.
4. **Experience:** original visual/audio direction and event-driven implementation.
5. **Integration:** wallet lifecycle, jurisdiction behavior, replay, and resume.
6. **QA:** popout, mobile, accessibility, pacing, localization, and asset loading.
7. **Submission:** checksummed bundle, replay catalog, evidence, and approvals.

Work may prototype later gates, but a production asset commitment should not begin
before the concept and definition gates are accepted.

## Signal Nine's role

Signal Nine currently proves the end-to-end technical path:

- frozen math books and lookup tables;
- a versioned event and projection contract;
- public replay examples;
- standard and sweeps information copy;
- shared runtime and settlement boundaries.

Its current presentation may remain a functional reference. It should receive
production game-specific art and audio only if it is deliberately selected as a
release candidate after concept comparison.
