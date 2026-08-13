# WIZARD CRAFT integer lookup review 001

Date: 2026-07-28

Status: **superseded—official verification rejected the source payout format**.

Post-review note: the isolated official SDK verifier rejected these candidates
because the underlying hypothesis-002 books contain payout values that are not
multiples of 10 book units. This report remains diagnostic evidence only. The
paytable was corrected and all books and weights must be regenerated.

The non-promoting
[`build_tier_lookups.py`](../../math/wizard_craft/build_tier_lookups.py)
builder converts the reviewed 100,000-book floating calibration into integer
lookup candidates. It requires a separate output directory and does not replace
the official SDK publish tables.

## Construction rules

- total weight is exactly `1,000,000,000,000,000,000` per mode;
- hit, feature, and Tier I/II/III group masses are apportioned independently;
- integer remainders are distributed deterministically;
- books with the same payout share their payout-bucket mass evenly;
- no individual book may exceed `0.01%` probability;
- book IDs and payout multipliers are checked against the compressed books while
  the candidate is built.

The individual-book ceiling was added after an uncapped trial assigned `0.542%`
probability to one Rune Spark base-game result. The capped rebuild reduced the
largest book probability to `0.01%` in every mode without changing the intended
group probabilities.

## Integer result

| Mode | RTP | Std. dev. per cost | CVaR, top 0.1% | ETL ≥40× | Largest book |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base Battle | 96.500000000002% | 37.730 | 240.415 | 0.5814 | 0.0100% |
| Rune Spark | 96.500000000002% | 18.909 | 134.084 | 0.3566 | 0.0100% |
| Siege Signs | 96.499999999999% | 5.366 | 80.873 | 0.1622 | 0.0100% |
| Open the Grimoire | 96.500000000000% | 2.254 | 24.785 | 0.0028 | 0.0100% |

| Mode | P(≥5,000× cost) | P(≥10,000× cost) | ETL ≥10,000× | Cap probability |
| --- | ---: | ---: | ---: | ---: |
| Base Battle | 0.000319% | 0.000254% | 0.0570 | 0.000161% |
| Rune Spark | 0.000497% | 0 | 0 | 0.000281% |
| Siege Signs | 0 | 0 | 0 | 0.000014% |
| Open the Grimoire | 0 | 0 | 0 | 0.000001% |

All four candidates are within the working 3-star limits for standard deviation,
tail probabilities, CVaR, and ETL. Their total weights fit unsigned 64-bit
integers. Each mode remains within approximately `1.7e-14` RTP of the 96.50%
target after integerization.

## Remaining gate

This is not yet a math selection. Before promotion:

1. run the official verifier against isolated copies of the candidate tables;
2. measure payout and event-sequence overlap across the four modes;
3. inspect capped-book and maximum-win replay examples;
4. decide whether the modes feel sufficiently distinct despite sharing the same
   underlying cabinet mechanic;
5. select, checksum, and freeze only after those reviews pass.

The temporary review output used for this study is not a production artifact.
