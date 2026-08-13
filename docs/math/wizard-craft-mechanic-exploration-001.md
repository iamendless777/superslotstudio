# WIZARD CRAFT mechanic exploration 001

Date: 2026-07-28

Status: **seeded mechanic-distribution study; not payout math, production math,
RTP evidence, or an approval claim**.

The explorer ran 250,000 paid rounds per mode with seed `1464037169`, for one
million total modeled entries. It tests whether the approved mode and tier rules
produce understandable frequency ladders before official-SDK reel strips and a
paytable are authored.

The reproducible implementation is
[`wizard-craft-exploratory.ts`](../../tools/math/wizard-craft-exploratory.ts).

## Provisional assumptions tested

| Mode | Cost | Target bonus rate | Tier I / II / III mix | Per-reel base VS chance |
| --- | ---: | ---: | --- | ---: |
| Base Battle | 1× | 1 in 180 | 80% / 17% / 3% | 5.5% |
| Rune Spark | 3× | 1 in 90 | 75% / 20% / 5% | 6.0% |
| Siege Signs | 10× | 1 in 45 | 68% / 24% / 8% | 6.5% |
| Open the Grimoire | 100× | Immediate | 55% / 30% / 15% | Not applicable |

These are design inputs, not measured natural reel probabilities.

## Observed paid-mode behavior

| Mode | Observed bonus rate | Paid spins with any VS reel | Paid spins with 2+ VS reels |
| --- | ---: | ---: | ---: |
| Base Battle | 1 in 179.86 | 24.78% | 2.70% |
| Rune Spark | 1 in 93.03 | 26.61% | 3.20% |
| Siege Signs | 1 in 45.48 | 28.59% | 3.71% |
| Open the Grimoire | Immediate | Not applicable | Not applicable |

The extra-chance ladder remains visible without changing the basic VS mechanic.
Base Battle still produces a VS moment often enough to establish the game's
identity. Multi-reel moments remain uncommon enough to retain anticipation.

Rune Spark's observed feature rate landed farther from its 1-in-90 assumption
than the other modes because 250,000 trials contain only 2,689 triggers. A larger
run would converge, but this is already sufficient for a design-shape check.

## Bonus-tier behavior

Across 250,000 Open the Grimoire entries:

- Tier I appeared 137,865 times and ended with zero sticky reels every time.
- Tier II appeared 74,862 times. It ended with zero stickies 40.04% of the time,
  one sticky 40.30%, two 16.04%, three 3.25%, and four or five 0.37%.
- Tier III appeared 37,273 times. Every result received a sticky by feature spin
  three. Final states contained one sticky 29.73%, two 42.00%, three 22.61%,
  and four or five 5.66%.
- Tier III guarantee failures: zero across all four paid-mode samples.
- First-sticky reel placement remained approximately uniform across the five
  reels.

This supports the intended emotional ladder:

- Tier I is about temporary multiplier spikes.
- Tier II creates real uncertainty about whether persistence begins.
- Tier III guarantees a foothold while preserving uncertainty about its reel and
  how far the sticky map develops.

## Multiplier observation

The provisional value pool was `2×, 3×, 4×, 5×, 7×, 10×, 15×, 20×, 25×, 50×`
with lower values weighted more heavily. The largest additive value observed in a
single simulated state was:

- 73× in Base Battle;
- 78× in Rune Spark;
- 75× in Siege Signs;
- 126× in Open the Grimoire.

This measures only available VS values in the modeled state. It does not mean
those reels formed a payable way, and it is not a payout multiplier result.

## Decision

Keep the current mechanic shape as the first official-SDK hypothesis:

- preserve the 1× / 3× / 10× / 100× cost ladder for the first true math pass;
- preserve the approximately 1-in-180 / 1-in-90 / 1-in-45 bonus-access targets;
- preserve Tier II's roughly 40% zero-sticky possibility as a starting point;
- preserve Tier III's early guaranteed sticky and approximately two-sticky
  median experience;
- start with the tested multiplier value pool, then revise it from real ways-win,
  RTP, variance, and tail measurements.

## What remains unknown

This study cannot determine:

- RTP or RTP contribution by mode;
- hit frequency;
- payout volatility or standard deviation;
- ETL, CVaR, or tail probability;
- whether 25,000× is naturally attainable;
- whether the proposed prices are fair for the actual payout distributions.

Those questions require a five-reel/four-row ways paytable, physical reel strips,
feature evaluation, true win events, and official Stake Engine candidate books.
No production animation should be commissioned from this report alone.
