# WIZARD CRAFT official-SDK exploration 002

Date: 2026-07-28

Status: **optimizer-feasible small pool; tier-weight stability and production
diversity not proven**.

Hypothesis 002 preserves full-wild VS reels and additive contributing values while
correcting the payout excess found in hypothesis 001.

## Changes from hypothesis 001

- The ways paytable was compressed by roughly 10×.
- Every smallest payable ways result remains at least 0.1×.
- Base and Tier I VS values are limited to 10×.
- Tier II can reach 25×.
- Tier III retains a rare 50× candidate.
- Higher values are substantially rarer in every tier.
- Full-wild visual behavior, sticky probabilities, spin counts, and tier promises
  were not weakened.

## Unoptimized 1,000-book result

| Mode | Hypothesis 001 return | Hypothesis 002 return | H001 cap books | H002 cap books |
| --- | ---: | ---: | ---: | ---: |
| Base Battle | 210.513 | 34.352 | 2 | 1 |
| Rune Spark | 59.646 | 11.031 | 1 | 1 |
| Siege Signs | 35.722 | 6.263 | 7 | 1 |
| Open the Grimoire | 31.540 | 4.577 | 56 | 3 |

These equal-weight figures are not RTP. The candidate quotas deliberately
overrepresent features and cap paths. The important change is that ordinary
feature books no longer collapse into the cap at an unacceptable rate.

Open the Grimoire's unweighted payout distribution was:

- minimum: 0.1× base play;
- median: 34.7× base play, or 0.347× its 100× cost;
- 90th percentile: 539× base play;
- 99th percentile: 11,803.2× base play;
- maximum: 25,000× base play.

That range gives the optimizer both low outcomes and controlled tail candidates.

## Optimizer feasibility

The official Rust optimizer produced candidate integer lookup weights for all four
modes. Independent recomputation from those weights found:

| Mode | RTP | Non-zero probability | Feature probability | Std. dev. per cost | Cap probability |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base Battle | 96.5000% | 25.56% | 1 in 180.00 | 11.222 | 1 in 25,000,000 |
| Rune Spark | 96.5000% | 26.11% | 1 in 90.00 | 6.703 | 1 in 8,333,333 |
| Siege Signs | 96.5000% | 27.22% | 1 in 45.00 | 7.168 | 1 in 2,500,000 |
| Open the Grimoire | 96.5000% | 100% | Immediate | 2.341 | 1 in 250,000 |

All total lookup weights fit unsigned 64-bit integers. These are small-pool
feasibility results, not selected production weights.

## Important tier-mix warning

The optimizer was asked to control total feature frequency, not the share of tiers
inside that feature frequency. The resulting weighted tier shares drifted:

| Mode | Weighted Tier I | Weighted Tier II | Weighted Tier III |
| --- | ---: | ---: | ---: |
| Base Battle | 77.49% | 22.41% | 0.09% |
| Rune Spark | 47.54% | 50.33% | 2.13% |
| Siege Signs | 44.17% | 52.64% | 3.19% |
| Open the Grimoire | 62.05% | 30.74% | 7.21% |

The 1,000-book pool contains too few Tier III candidates, especially Base Battle,
and the optimizer can distort tier identity while solving RTP. This is not an
acceptable final result.

## Decision

Hypothesis 002 passes the first payout-feasibility gate:

- exact target RTP can be reached;
- hit rates are plausible;
- the extra-chance frequency ladder is exact;
- normalized standard deviations are inside the broad platform range;
- the cap remains attainable;
- structural tier and sticky rules still pass.

Do not freeze or publish it. The next gate is a larger, tier-aware candidate pool
and weighting method that preserves explicit Tier I/II/III shares while matching
RTP. Tail metrics, CVaR, ETL, payout concentration, overlap, and replay diversity
also remain unmeasured.
