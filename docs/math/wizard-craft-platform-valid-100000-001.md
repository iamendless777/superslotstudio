# WIZARD CRAFT platform-valid 100,000-book review 001

Date: 2026-07-28

Status: **official structural verification passed; overlap and replay review
pending; not frozen**.

The isolated official verifier exposed that hypothesis 002 used two `0.15×`
symbol awards. Those values could produce book payouts that were not multiples
of 10 book units, which Stake rejects. Both awards were changed to `0.20×`, and
all four 100,000-book pools were regenerated.

## Corrected structural result

- exactly 100,000 books and lookup rows per mode;
- zero lookup payouts violate the required 10-unit increment;
- book SHA-256, payout-array hashes, and entry counts pass the official fast-path
  checks;
- Tier III sticky-guarantee failures remain zero;
- chance modes retain 2,361–2,368 Tier III candidates;
- Open the Grimoire retains 22,900 Tier III candidates.

## Integer candidate result

The tier-preserving builder reserves a total cap probability of `3e-7` in every
mode, so 25,000× remains attainable, and caps individual books below `0.01%`.

| Mode | RTP | Std. dev. per cost | CVaR per cost | ETL ≥40× cost |
| --- | ---: | ---: | ---: | ---: |
| Base Battle | 96.50% | 14.735 | 121.694 | 0.2424 |
| Rune Spark | 96.50% | 24.132 | 414.785 | 0.5590 |
| Siege Signs | 96.50% | 26.676 | 614.824 | 0.7179 |
| Open the Grimoire | 96.50% | 2.065 | 27.265 | 0.0019 |

These independently cost-normalized figures pass the working 3-star limits.
Each lookup has exactly `10^18` total integer weight, safely below uint64.

## Official verifier caveat

The official utility accepts Base Battle without warnings. For higher-cost
modes, it reports CVaR and ETL in raw base-bet multiples while comparing them
with limits defined per mode cost. For example, Siege Signs reports CVaR
`6148.24`, exactly ten times its independently normalized `614.824`.

The warnings are retained as evidence and are not represented as an official
risk pass. Risk R-015 now covers all affected cost-normalized volatility
metrics, not standard deviation alone.

## Remaining gate

1. measure payout and event-sequence overlap across all modes;
2. inspect loss, normal win, large win, feature, and cap replays;
3. decide whether the mode experiences are distinct enough;
4. checksum and freeze only after those reviews pass.

No candidate is approved by Stake Engine or frozen by the studio.
