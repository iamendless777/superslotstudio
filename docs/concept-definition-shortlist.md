# First-release concept definition shortlist

Status: **concept review only**.

Historical note: this comparison predates the preferred WIZARD CRAFT concept.
Its Lantern Relay
recommendation remains useful comparison evidence but is no longer the active
direction.

This document expands the three shortlisted pitches into comparable game
definitions. Only Signal Nine has implemented and locally frozen math. Every
number for Lantern Relay and The Last Frequency is a design hypothesis, not an
approved target, measured result, or player-facing claim.

## Shared constraints

All three concepts must:

- resolve each play from one RGS-selected, pre-generated outcome;
- keep balance, payout, RNG, settlement, and round state authoritative on the RGS;
- finish features inside their originating round;
- avoid jackpots, persistent progression, gamble features, and early cashout;
- support standard play, public replay, resume, social terminology, jurisdiction
  flags, reduced motion, small popout, mobile, and keyboard control;
- ship original game-specific presentation assets only after selection.

## Signal Nine

### Player promise

Restore a deep-space receiver by connecting matching signals across a compact 3×3
array. Three Portals open nine Deep Signal scans with a growing amplifier.

### Base mechanic

- Three reels, three rows, and five fixed lines.
- Matching three regular symbols on a line pays.
- Core substitutes for regular symbols; Portal is the feature scatter.
- Multiple line wins add.
- The board, winning positions, and all totals come from the book.

This is immediately readable, but much of its depth sits behind an infrequent
feature. The base game needs unusually strong anticipation and result pacing to
avoid feeling solved after a few plays.

### Feature sequence

1. Three Portals trigger nine Deep Signal scans.
2. The center position is Core wild during the feature.
3. The amplifier starts at 1× and increases after a winning scan, up to 9×.
4. Three Portals during the feature award three additional scans.
5. The sequence ends when scans run out or the 10,000× cap is reached.

### Modes

| Mode | Cost | RTP | Maximum win | Status |
| --- | ---: | ---: | ---: | --- |
| Base | 1× | 96.50% | 10,000× base play | Locally frozen |
| Deep Signal | 100× | 96.50% | 10,000× base play | Locally frozen buy-bonus |

Deep Signal must be hidden when buy features are disabled. The frontend always
sends the unmultiplied base amount.

### Event vocabulary

Existing normalized events cover `reveal`, `winInfo`, `setWin`,
`freeSpinTrigger`, `enterBonus`, `updateFreeSpin`, `updateGlobalMult`,
`freeSpinRetrigger`, `freeSpinEnd`, `setTotalWin`, `finalWin`, and `wincap`.

Replay stories already exist for loss, normal win, big win, natural trigger,
retrigger, bought feature, and cap where applicable.

### Smallest credible asset set

- one observatory background and responsive cabinet treatment;
- eight symbols with idle, land, and win states;
- five line-path effects and Portal anticipation;
- feature background treatment, amplifier, spin counter, and cap sequence;
- one display type family plus accessible fallback;
- base ambience, interaction set, eight symbol accents, win ladder, Portal
  anticipation, feature loop, amplifier layers, and cap cue.

### Principal risks

- Base play is mechanically shallow by current premium-game standards.
- Its existing frozen math limits mechanic changes; substantial depth changes
  require a new math iteration and freeze.
- Production polish may improve perceived quality without solving repeat depth.

### Definition judgment

**Technically ready, creatively conditional.** Select it only if the studio values
the shortest release path over proving a more distinctive first-game mechanic.

## Lantern Relay

### Player promise

Guide living lanterns between moonlit islands. Left-to-right matches draw visible
light routes; Moon Lantern wilds expand and a spirit awakens during the feature.

### Base mechanic

- Five reels and three rows.
- Adjacent matching symbols from the first reel pay as ways.
- A Moon Lantern substitutes for regular lanterns.
- A landed Moon Lantern may expand to its full reel only when the generated book
  explicitly says so.
- Winning ways are presented as illuminated routes across the islands.
- Three Spirit Gates anywhere trigger the feature.

The mechanic remains conventional enough to understand, while path visualization
gives it a clear theme-to-math relationship.

### Feature sequence

1. Three Spirit Gates award a provisional eight free crossings.
2. Each free crossing begins with a 1× route multiplier.
3. Every expanded Moon Lantern in that crossing increases the multiplier before
   wins are presented.
4. Four Spirit Gates award a provisional four additional crossings.
5. The sequence ends when crossings run out or the configured cap is reached.

The multiplier is determined within each generated outcome and does not persist
between paid plays.

### Provisional modes

| Mode | Cost | Working RTP | Working maximum win | Purpose |
| --- | ---: | ---: | ---: | --- |
| Base crossing | 1× | 96.50% | 10,000× base play | Natural feature access |
| Moonwake | 75× | 96.50% | 10,000× base play | Immediate feature |

The 75× cost is a starting hypothesis. Simulation must prove distribution quality,
tail limits, win frequency, and feature value before it becomes product input.

### Proposed event vocabulary

Prefer standard events:

- `reveal`, `winInfo`, `setWin`, `setTotalWin`, `finalWin`, `wincap`;
- `freeSpinTrigger`, `enterBonus`, `updateFreeSpin`, `freeSpinRetrigger`,
  `freeSpinEnd`;
- `updateGlobalMult` for the route multiplier.

One narrow custom event may be justified:

- `expandLantern` with explicit reel indexes and resulting board symbols.

The renderer must receive route positions from `winInfo`; it must not calculate
ways or multipliers.

### Replay story

Reviewers should be able to replay:

- base loss and ordinary single-route win;
- overlapping ways with an expanded Moon Lantern;
- natural feature trigger;
- feature crossing with a multiplier;
- retrigger;
- large win and win cap;
- immediate Moonwake feature.

### Smallest credible asset set

- layered moonlit-water background with five island silhouettes;
- six regular lantern families, Moon Lantern wild, and Spirit Gate;
- symbol idle, land, win, wild-expand, and gate-anticipation states;
- reusable route glow, reflection, transition, feature counter, and multiplier;
- base ambience, tactile UI set, lantern tones arranged as a scale, route chords,
  gate anticipation, feature loop, multiplier layers, and win ladder.

This direction can achieve cohesion through lighting and motion rather than
expensive character animation.

### Principal risks

- Ways and overlapping routes can become unreadable in a small popout.
- Expanding wild frequency must support excitement without dominating outcomes.
- Generic fantasy art would erase the concept's distinctiveness.
- The math, event schema, books, and integration are entirely new work.

### Definition judgment

**Best balanced production candidate.** It exercises a reusable ways renderer and
feature system, connects mechanic to presentation, and has a contained asset scope.

## The Last Frequency

### Player promise

Tune an abandoned radio telescope and decode a transmission emerging from cosmic
noise. An optional prediction changes how the signal is revealed, never the
probability or payout.

### Base mechanic

- Five reels and three rows with left-to-right ways.
- Regular symbols represent signal families and observatory equipment.
- Static is wild; a Beacon scatter triggers the feature.
- Before play, the player may optionally predict one of three signal families or
  choose no prediction.
- The RGS outcome is unaffected. A correct prediction changes only a non-monetary
  reveal flourish.

The prediction cannot create an award, multiplier, collection meter, improved
probability, alternate mode, or persistent record.

### Feature sequence

1. Three Beacons award a provisional seven Decode spins.
2. Each generated spin reveals one or more spectral bands.
3. Explicit book events may transform Static symbols or apply a multiplier.
4. Additional Beacons retrigger a provisional three spins.
5. The sequence ends inside the same round.

### Provisional modes

| Mode | Cost | Working RTP | Working maximum win | Purpose |
| --- | ---: | ---: | ---: | --- |
| Tune | 1× | 96.50% | 10,000× base play | Optional prediction and natural feature |
| Decode | 80× | 96.50% | 10,000× base play | Immediate feature |

Prediction is not a mode and has no cost.

### Proposed event vocabulary

Use the same standard ways, free-spin, multiplier, total, final, and cap events as
Lantern Relay. Possible custom events:

- `revealSpectrum` with explicit band IDs and reel positions;
- `transformStatic` with explicit before/after symbols;
- `predictionReveal` with the selected family and boolean match result.

The selected prediction would need checkpoint-safe round event recording so resume
and replay remain deterministic. It may not be used in math evaluation.

### Replay story

Replay coverage needs:

- loss with no prediction;
- correct and incorrect predictions with identical monetary behavior;
- ordinary and overlapping ways;
- natural Decode trigger;
- Static transformation, multiplier, retrigger, large win, and cap;
- immediate Decode feature.

### Smallest credible asset set

- radio-telescope environment and instrument-panel frame;
- six signal symbols, Static wild, and Beacon scatter;
- spectral display, three prediction controls, tuning sweep, transformations,
  feature state, multiplier, and win ladder;
- radio noise layers, UI tuning clicks, signal-family motifs, decoded voices
  without intelligible claims, feature music, and win/cap cues.

### Principal risks

- Players may reasonably assume a pre-play prediction changes their chance to win.
- Explaining that it has no monetary effect may remove the tension that makes the
  interaction attractive.
- The prediction complicates autoplay, replay, resume, social copy, accessibility,
  and event recording without adding mathematical depth.
- Audio-led comprehension is difficult for muted and hearing-impaired players.
- A superficial “choice” can feel deceptive even when disclosed accurately.

### Definition judgment

**Do not select in its current form.** The prediction is presentation complexity,
not slot depth. Remove prediction and it overlaps heavily with Signal Nine; retain
it and the player-comprehension risk is too high for a first release.

## Side-by-side decision

| Question | Signal Nine | Lantern Relay | The Last Frequency |
| --- | --- | --- | --- |
| Math status | Locally frozen | Not started | Not started |
| Core depth | Low–moderate | Moderate–high | Moderate without meaningful choice |
| New reusable capability | Limited | Ways/path renderer | Prediction/event recording |
| Art/audio scope | Moderate | Moderate | Moderate–high |
| Small-screen clarity | Strong | Needs route testing | Needs control testing |
| Principal advantage | Fastest path | Best concept/mechanic fit | Strong audio identity |
| Principal weakness | Shallow base | Entirely new math | Potentially misleading choice |
| Current decision | Keep as reference/fallback | Advance to definition validation | Reject current prediction design |

## Recommendation

At the time of this comparison, the recommendation was to advance **Lantern
Relay** to a non-production definition-validation phase:

1. prove the ways and expanding-wild model in the official math SDK with a small
   exploratory batch;
2. define and unit-test its event schema without building finished presentation;
3. prototype route legibility with simple geometric placeholders;
4. revisit scope after measured distribution and small-screen evidence.

Keep Signal Nine intact as the end-to-end technical reference and fallback release
path. Archive The Last Frequency as research rather than deleting it; its sound
language may inspire a future mechanic that offers real depth without implying
outcome-changing choice.
