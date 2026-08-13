# WIZARD CRAFT tier-preserving calibration 001

Date: 2026-07-28

Status: **mathematically feasible; production diversity insufficient**.

The official optimizer can constrain total feature frequency but cannot directly
hold Tier I/II/III shares inside the shared `freegame` criterion. A 10,000-book
pool improved native optimizer stability but still drifted materially:

| Mode | Intended tiers | Native weighted tiers |
| --- | --- | --- |
| Base Battle | 80% / 17% / 3% | 83.03% / 16.60% / 0.37% |
| Rune Spark | 75% / 20% / 5% | 72.63% / 23.77% / 3.61% |
| Siege Signs | 68% / 24% / 8% | 40.43% / 43.02% / 16.55% |
| Open the Grimoire | 55% / 30% / 15% | 62.33% / 29.94% / 7.73% |

The new read-only
[`analyze_tier_rebalance.py`](../../math/wizard_craft/analyze_tier_rebalance.py)
holds these quantities explicitly:

- paid-mode hit probability;
- feature probability;
- intended Tier I/II/III share;
- total probability mass;
- 96.50% RTP.

It uses the official optimizer weights only as a within-group starting shape and
applies a stable exponential payout tilt. It does not write or promote lookup
tables.

## Feasibility result

| Mode | Held feature rate | Held tier shares | RTP | Std. dev. per cost |
| --- | ---: | --- | ---: | ---: |
| Base Battle | 1 in 180 | 80% / 17% / 3% | 96.50% | 9.087 |
| Rune Spark | 1 in 90 | 75% / 20% / 5% | 96.50% | 7.859 |
| Siege Signs | 1 in 45 | 68% / 24% / 8% | 96.50% | 9.781 |
| Open the Grimoire | Immediate | 55% / 30% / 15% | 96.50% | 2.106 |

The target lies comfortably inside each mode's tier-preserving achievable RTP
range. The mechanic, tier ladder, prices, and RTP target are therefore mutually
compatible in the floating feasibility model.

## Diversity warning

The minimum conditional effective-book counts were:

- Base Battle: 2.82;
- Rune Spark: 6.77;
- Siege Signs: 19.73;
- Open the Grimoire: 479.73.

Base Battle and Rune Spark are severely under-sampled in rare feature subgroups.
The 10,000-book pool contains only 15 Base Tier III candidates. A mathematical
solution that concentrates meaningful probability on roughly three effective
books would repeat visibly and is not production quality.

The floating calibration also does not yet produce final uint64 lookup weights.
Integerization must preserve RTP, group masses, book/LUT identity, and total
weight bounds without collapsing diversity.

## Decision

The tier-preserving method is accepted as a feasibility tool, not a production
weight generator.

Next:

1. increase to at least 100,000 candidates per mode;
2. stratify or deliberately oversample rare Tier III feature candidates during
   candidate generation without changing final probabilities;
3. rerun the official optimizer and tier-preserving calibration;
4. require materially higher effective-book counts in every subgroup;
5. add integer weight construction and exact verification only after diversity
   passes;
6. then measure CVaR, ETL, tail probability, payout concentration, and mode
   overlap.
