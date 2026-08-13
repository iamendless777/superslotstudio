# WIZARD CRAFT official SDK verification 003

Date: 2026-08-01

Status: **local candidate verified; not uploaded or externally approved**.

## Source of truth

The frozen 100,000-outcome books and final integer lookup tables for all four
modes were checked inside the official StakeEngine `math-sdk`. The reference
was refreshed to upstream commit `e2f0db9cf04cb3b0202fa3747ce173a46ac0aa7f`,
including the upstream cost normalization and high-cost probability scaling in
`utils/analysis/distribution_functions.py`.

The game passes all 11 tests in `games/wizard_craft/test_game.py`. Stake's
`utils/rgs_verification.py` also passes every book SHA-256, payout-array hash,
lookup format, entry count, RTP, and current 3-star volatility rule without a
warning.

## Final weighted measurements

| Mode | Cost | RTP | Std. dev. per cost | CVaR per cost | ETL ≥40× cost | Max-win frequency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Base Battle | 1× | 96.5000% | 14.724 | 120.285 | 0.243 | 1 in 3,333,333 |
| Rune Spark | 3× | 96.5000% | 6.788 | 58.655 | 0.871 | 1 in 3,333,333 |
| Siege Signs | 10× | 96.5000% | 5.062 | 41.667 | 0.786 | 1 in 3,333,333 |
| Open the Grimoire | 100× | 96.5000% | 1.419 | 7.752 | 0.007 | 1 in 3,333,333 |

All modes have a 25,000× maximum. Tail probabilities at or above 5,000× and
10,000×, ETL above 10,000×, cost-normalized standard deviation, CVaR, and
non-zero hit rates remain within the current local 3-star checks.

## Correction to earlier local notes

Earlier reports quoted Open the Grimoire CVaR values such as `775.249` because
the older SDK utility returned raw base-bet CVaR for high-cost modes. Upstream
now divides CVaR by mode cost. The comparable current value is `7.752`.

## Freeze rule

Any change to books, lookup weights, mode costs, RTP, reels, paytable, feature
rules, or event-producing math invalidates this verification and requires the
official SDK tests and the complete release verifier to run again.
