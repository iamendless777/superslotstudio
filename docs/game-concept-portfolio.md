# Initial game concept portfolio

This portfolio compares possible first releases for Super Slot Studio. Every
concept is a slot: one server-selected outcome per play, no persistent progression,
jackpot, gamble feature, early cashout, or client-side payout decision.

The later player-proposed WIZARD CRAFT direction supersedes the
portfolio's earlier recommendation as the preferred concept to validate.

The concepts are intentionally at pitch level. Math targets, event schemas, and
production assets should be designed only after a concept is shortlisted.

## Evaluation scale

Scores run from 1 (weak or expensive) to 5 (strong or economical).

- **Distinctiveness:** recognizable mechanic and presentation identity.
- **Depth:** enough variation to remain interesting beyond a few plays.
- **First-build fit:** ability to prove the studio without excessive new systems.
- **Math feasibility:** confidence that diverse frozen books can express the idea.
- **Production efficiency:** achievable art, animation, and audio scope for a small
  studio. A higher score means less production risk.

## A. Signal Nine

**Pitch:** Restore a damaged deep-space communications array. A 3×3 signal grid
locks matching transmissions onto five lines; feature rounds amplify and retrigger
the recovered signal.

**Player loop:** Play, watch the array acquire nine signals, read line connections,
then enter a free-spin transmission when the trigger pattern lands.

**Identity:** Minimal sci-fi control room, oscilloscopes, interference, relay
clicks, and an escalating synthesized signal motif.

**Why it belongs:** The math, frozen books, event contract, replay catalog, and
information copy already exist. It is the shortest path to an integrated release.

**Risk:** A plain 3×3 line game may feel shallow unless the feature presentation,
signal behavior, and pacing create meaningful variation. It currently proves the
pipeline better than it proves a standout game concept.

## B. Switchyard Surge

**Pitch:** Route volatile energy trains through a neon industrial switchyard.
Winning paths energize track junctions; consecutive cascades reroute the board and
raise a round-local power multiplier.

**Player loop:** A 5×5 cluster result resolves, winning cells discharge, new cargo
cars fall into the yard, and the power meter increases during that same play.
Feature mode begins charged and introduces transformer wilds.

**Identity:** Heavy machinery, wet steel, electrical arcs, rail impacts, warning
bells, and a musical pulse synchronized to the power multiplier.

**Strength:** Cascades, changing paths, and round-local escalation provide visible
depth and strong event-driven presentation.

**Risk:** Requires a new cluster/cascade math model, more animation states, careful
fast-play legibility, and substantially more simulation tuning than Signal Nine.

## C. Lantern Relay

**Pitch:** Send living lanterns across a moonlit archipelago. Matching lanterns
connect between islands, and completed routes awaken a guiding spirit.

**Player loop:** A 5×3 ways result draws luminous paths from left to right.
Expanding lantern wilds can complete several routes at once. Free spins carry a
round-local spirit multiplier that changes with each generated outcome.

**Identity:** Paper lantern craft, dark water, warm reflected light, wind chimes,
wood percussion, and layered vocal tones for larger connections.

**Strength:** Strong emotional identity and a readable relationship between ways,
paths, and audio. It can feel premium without requiring character-heavy animation.

**Risk:** Art direction must avoid generic fantasy imagery. The path renderer and
ways-win explanation need excellent clarity on small screens.

## D. Clockwork Menagerie

**Pitch:** Reassemble mechanical animals inside an eccentric horologist's workshop.
Adjacent reel parts combine into complete creatures; completed creatures activate
distinct one-play modifiers.

**Player loop:** A 5×4 reel result pays combinations and reveals assembled animals.
One may stretch wild across a reel, duplicate a symbol, or add a multiplier.
Feature spins increase the chance of complete mechanisms.

**Identity:** Brass automata, enamel components, hand-drawn workshop diagrams,
springs, escapements, music-box textures, and satisfying mechanical assembly.

**Strength:** Memorable characters and modifiers create variety while remaining
fully represented in a single generated book.

**Risk:** Highest art and animation burden in the portfolio. Several animal
abilities also create more math distributions, events, explanatory copy, and QA.

## E. The Last Frequency

**Pitch:** Tune an abandoned radio telescope through cosmic noise. Each play
reveals three encoded signal fragments before resolving the full reel outcome.
Players may predict which signal family will appear, but prediction changes only
the reveal presentation—not payout, probability, or mode.

**Player loop:** Select an optional signal hypothesis, play a 5×3 slot result, then
watch clues resolve into symbols and wins. Correct predictions unlock a more
dramatic non-monetary reveal. Feature mode decodes increasingly clear transmissions
within the same generated round.

**Identity:** Analog radio hardware, spectral plots, coded voices, tape noise, and
musical phrases emerging from static.

**Strength:** Captures the tension of a guessing game while preserving a valid
stateless slot outcome. It offers unusually strong sound-design potential.

**Risk:** This is the most delicate concept ethically and ergonomically. The UI
must state that prediction is optional and cannot affect wins. If players perceive
the choice as monetary agency, the concept becomes misleading. It should be
rejected unless testing shows the distinction is immediately understood.

## Comparison

| Concept | Distinctiveness | Depth | First-build fit | Math feasibility | Production efficiency | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Signal Nine | 3 | 2 | 5 | 5 | 4 | 19 |
| Switchyard Surge | 4 | 5 | 2 | 3 | 2 | 16 |
| Lantern Relay | 4 | 4 | 4 | 4 | 4 | 20 |
| Clockwork Menagerie | 5 | 5 | 2 | 3 | 1 | 16 |
| The Last Frequency | 5 | 4 | 3 | 3 | 3 | 18 |

These scores are working judgments, not approval results. They deliberately do not
include commercial forecasts without market evidence.

## Initial reading

- **Best balanced first-release candidate:** Lantern Relay. It has a coherent
  mechanic-to-theme relationship and manageable production scope.
- **Fastest technical release:** Signal Nine. Most evidence already exists, but it
  needs a stronger depth proposal before production treatment.
- **Best ambitious follow-up:** Switchyard Surge. Its cascade system would expand
  the studio's reusable capabilities.
- **Highest premium potential and cost:** Clockwork Menagerie.
- **Best experimental direction:** The Last Frequency, subject to comprehension
  testing and a firm rule that prediction never affects the outcome.

This was the initial reading before WIZARD CRAFT was proposed. Retain it as
decision history rather than treating Lantern Relay as the current recommendation.

## Shortlist decision gate

Before selecting a first release, produce a one-page definition sketch for Signal
Nine, Lantern Relay, and The Last Frequency covering:

1. base mechanic and feature sequence;
2. two or three modes and their intended costs;
3. event vocabulary and replay story;
4. target depth without persistent state;
5. smallest credible art/audio set;
6. principal math and player-comprehension risks.

The first production game should be selected only after those three sketches are
reviewed side by side. That comparison is recorded in
[`concept-definition-shortlist.md`](concept-definition-shortlist.md).
