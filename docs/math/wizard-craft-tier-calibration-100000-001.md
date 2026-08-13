# WIZARD CRAFT 100,000-book tier calibration 001

Date: 2026-07-28

Status: **superseded—candidate diversity passed, but payout format later failed
official verification**.

Post-review note: this pool contains payout multipliers that are not multiples of
10 book units. Stake's official verifier rejects that format. The diversity
result remains useful, but the pool cannot be promoted and must be regenerated
from the corrected paytable.

This run generated 100,000 candidates for each of the four paid modes. Feature
generation was deliberately stratified at 45% Tier I, 30% Tier II, and 25%
Tier III. Those are candidate-pool proportions only; they are not player-facing
probabilities.

## Structural result

- all four modes contain exactly 100,000 books;
- book and lookup identities, payouts, and event indexes agree;
- every Tier III feature satisfies the sticky-reel guarantee;
- the three chance modes contain approximately 2,360 Tier III candidates each;
- Open the Grimoire contains 22,900 Tier III candidates.

The chance-mode Tier III pools are therefore more than 150 times deeper than the
15 candidates available in the earlier 10,000-book Base Battle run.

## Why the native optimizer is not the final answer

The official optimizer reached 96.50% RTP in every mode, but its weighted feature
mix still drifted from the intended tier ladder:

| Mode | Intended tiers | Native weighted tiers |
| --- | --- | --- |
| Base Battle | 80% / 17% / 3% | 56.22% / 31.42% / 12.35% |
| Rune Spark | 75% / 20% / 5% | 44.08% / 38.13% / 17.78% |
| Siege Signs | 68% / 24% / 8% | 26.27% / 43.48% / 30.25% |
| Open the Grimoire | 55% / 30% / 15% | 57.96% / 31.04% / 11.00% |

This confirms that final lookup construction must explicitly preserve tier
probability rather than accepting the optimizer's highest-scoring table.

## Tier-preserving floating result

The read-only calibrator held the intended hit rate, feature rate, tier shares,
and 96.50% RTP simultaneously:

| Mode | Feature rate | Tier shares | Std. dev. per cost | Minimum conditional effective books |
| --- | ---: | --- | ---: | ---: |
| Base Battle | 1 in 180 | 80% / 17% / 3% | 39.669 | 650.02 |
| Rune Spark | 1 in 90 | 75% / 20% / 5% | 22.654 | 422.21 |
| Siege Signs | 1 in 45 | 68% / 24% / 8% | 14.478 | 395.48 |
| Open the Grimoire | Immediate | 55% / 30% / 15% | 2.256 | 6,648.45 |

The weakest subgroup now has about 395 effective books, compared with 2.82 in
the prior run. The rare-tier concentration blocker is resolved at candidate-pool
scale.

These volatility figures are diagnostics, not accepted targets. In particular,
the chance modes require tail-risk review before any math can be selected.

## Decision

Proceed to integer tier-preserving lookup construction. The next implementation
must:

1. create valid unsigned-integer weights while preserving group masses;
2. recompute exact RTP, hit rate, feature rate, and tier shares from those
   integers;
3. confirm book/lookup identity and total-weight limits;
4. measure CVaR, ETL, cap probability, payout concentration, and cross-mode
   overlap;
5. reject or retune any mode whose volatility or tail exposure is unsuitable.

No lookup table from this study is promoted, selected, or frozen.
