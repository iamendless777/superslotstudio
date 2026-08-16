# ADR 0014: Multi-style motion system

- Status: Accepted for local architecture

## Context

The studio must support many games without locking presentation into one visual
language. Classic lines, cluster tumble, sticky wilds, and anticipation-heavy
slots need different motion vocabularies. A single hard-coded renderer or one
tumble style would force every game into the same feel and make assessment of
new books impossible.

Presentation remains non-authoritative. Motion only interprets validated events;
it never selects outcomes, calculates payouts, or invents RNG.

## Decision

1. **Effect catalog** — named, versioned primitive effects (spin-stop, drop-in,
   cascade-remove, cascade-fall, settle, win-pulse, multiplier-float,
   anticipation-slow, sticky-morph, etc.) with explicit duration, easing, and
   stagger rules. Effects are pure data.

2. **Style profiles** — named bundles that map game-event kinds and tumble steps
   to ordered effect sequences. Profiles are selectable per game or per mode.
   Multiple profiles may be registered; none is mandatory for domain validity.

3. **Tumble pipeline** — a style-agnostic sequence of step kinds
   (`remove`, `fall`, `refill`, `settle`, `evaluate`) derived from book structure.
   Styles only decide *how* each step is animated, not *whether* it exists.

4. **Assessor** — pure function that inspects a game shape (grid size, win type,
   event types present, cascade depth, sticky markers) and returns compatible
   style IDs plus mismatch reasons. The studio uses this to recognize and
   recommend; the human (or later tooling) selects.

5. **Timeline planner** — given validated events + a chosen style, emits a
   deterministic ordered list of timed effect instances. Renderers consume only
   this plan. Interrupted or resumed play re-plans from checkpoint using the
   same style.

## Consequences

- New games register or select styles; they do not fork the motion core.
- Quality of motion is controlled by the catalog and profile, not by ad-hoc
  per-game animation code from an LLM session.
- Classic Nine and future cluster/tumble games share the same assess/plan path.
- Pixi/Svelte (or any renderer) stays a dumb player of effect instances.
- Domain recovery, money, and RGS boundaries are unchanged.
