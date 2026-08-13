# WIZARD CRAFT official-SDK exploration 001

Date: 2026-07-28

Status: **structural pass; payout hypothesis rejected as overpowered**.

This is the first WIZARD CRAFT candidate model built inside the official Stake
Engine math SDK. It contains the required eight game modules, five physical reel
strips, a 5×4 ways paytable, four paid modes, three feature tiers, temporary and
sticky VS reels, additive contributing multipliers, upgrades, retriggers, and an
attainable 25,000× cap path.

It is not optimized, frozen, publishable, or approved.

## Hypothesis tested

- Seven regular paying symbols.
- Wizard and Dragon wild symbols substitute identically.
- Clash Rune triggers 8, 10, or 12 spins from three, four, or five runes.
- VS reels expand to full wild reels.
- Contributing VS reel values add before multiplying the ways win.
- Provisional VS values: 2×, 3×, 4×, 5×, 7×, 10×, 15×, 20×, 25×, and 50×.
- Tier I uses temporary VS reels only.
- Tier II permits but does not guarantee sticky reels.
- Tier III guarantees a sticky on an unknown reel during spins one through three.

## Verification performed

Six focused official-SDK tests pass:

- game identity, provider field, dimensions, and cap;
- exact four-mode cost ladder;
- tier spin counts and special-symbol registration;
- Siege Signs always has at least one Rune in its emitted base reveal;
- Tier I cannot create sticky reels;
- two contributing VS reels worth 2× and 5× apply an additive 7×.

The streaming book reviewer additionally verifies:

- contiguous book and event indexes;
- terminal payout identity;
- 25,000× cap enforcement;
- paid-mode identity on every reveal;
- tier identity on feature triggers;
- Tier I sticky prohibition;
- Tier III sticky by spin three;
- non-decreasing explicit upgrades;
- temporary VS cleanup;
- Siege Signs' guaranteed Rune.

A corrected 100-book-per-mode smoke batch passed every structural rule.

## 1,000-book payout result

The larger unoptimized run used the candidate quotas directly:

- chance modes: 450 zero, 450 ordinary-win, 99 feature, and one cap candidate;
- Open the Grimoire: 999 feature and one cap candidate.

| Mode | Cost | Equal-weight normalized return | Books reaching cap |
| --- | ---: | ---: | ---: |
| Base Battle | 1× | 210.513 | 2 |
| Rune Spark | 3× | 59.646 | 1 |
| Siege Signs | 10× | 35.722 | 7 |
| Open the Grimoire | 100× | 31.540 | 56 |

The values are return ratios, so `31.540` means 3,154% of the Open the Grimoire
cost. Candidate quotas intentionally distort natural probability and one forced
cap candidate is expected, but 56 cap results in the immediate-feature pool
cannot be explained by quota design. Ordinary feature paths are reaching the cap
far too easily.

## Diagnosis

The interaction is multiplicatively too strong:

1. An expanded reel contains four wild positions.
2. Several expanded reels sharply increase the number of ways.
3. Their multiplier values also add.
4. Sticky reels preserve both advantages over many spins.
5. The top provisional paytable values were borrowed from a much less explosive
   ways shape.

The mechanic is not rejected. The first payout implementation is.

## Decision

Do not optimize this pool and do not increase its simulation count.

The next hypothesis must reduce mathematical amplification while preserving the
visible promise of multiple VS reels. Candidate levers, in recommended order:

1. sharply reduce the base ways paytable;
2. make early reel expansions common but high values materially rarer;
3. constrain 15×–50× values by tier or sticky count;
4. reduce the chance that several full-wild sticky reels coexist;
5. consider whether the applied multiplier adds once per winning way while the
   expanded reel supplies fewer than four wild positions;
6. retain a dedicated forced cap path so 25,000× remains attainable.

Only after a revised 1,000-book pool has a plausible payout range should optimizer
targets and larger batches be introduced.
