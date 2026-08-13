# Signal Nine optimizer feasibility review 001

Date: 2026-07-27

Status: **feasible on the 1,000-outcome candidate pool; not production math**.

The official Rust optimizer produced ten candidate weight sets for each mode.
This review evaluates the highest-scored pair (`base_0_1.csv` and
`bonus_0_1.csv`) without adopting it as the publish lookup table.

## Result

| Measurement | Base | Bonus |
| ----------- | ---- | ----- |
| Exact weighted RTP | 96.499999998953% | 96.499999999982% |
| Non-zero probability | 25.5882% | 100% |
| Standard deviation per mode cost | 5.5888 | 0.8362 |
| Natural feature frequency | 1 in 169.997 | Immediate |
| Retrigger probability | 0.001615% | 6.7359% |
| Maximum-win frequency | 1 in 10,000,000.061 | 1 in 100,000.000 |
| ETL above 40× | 0.285 | 0.100 |
| ETL above 10,000× | 0.001 | 0.100 |
| CVaR | 76.278 | 517.546 |

Both modes have the same 96.50% target return. The base non-zero rate is inside
the working 20%–35% range, and the natural feature rate is inside the working
1-in-120 to 1-in-220 range.

The optimized weights remain valid unsigned 64-bit integers:

- Base total weight: `1,125,899,906,841,954`
- Bonus total weight: `1,125,899,906,842,121`

Book payout arrays remain unchanged, so the existing book/LUT payout identity and
book hashes still apply.

## Verification

The official verifier accepted:

- exact target RTP for both modes;
- book and lookup entry counts;
- book SHA-256 hashes;
- payout-array hashes;
- lookup integer format;
- tail probability, ETL, and CVaR limits;
- cross-mode RTP agreement.

The Rust optimizer automatically writes its highest-scored trial into the
publish lookup path. This behavior was confirmed during the later 10,000-outcome
validation, and the publish tables were then restored from the untouched source
lookup tables. Optimizer trial files remain in the ignored official SDK
worktree; no experimental weights are currently promoted.

## SDK standard-deviation defect

The current official verifier calculates both raw and cost-normalized standard
deviation in `get_distribution_moments`, but returns the raw value. This makes the
100× bonus mode appear to have standard deviation `83.623` instead of the
cost-normalized `0.83623`.

The feasibility table uses the independently recomputed cost-normalized value.
This discrepancy must be rechecked against current Stake Engine verification
before math freeze.

## Decision

The candidate pool is sufficiently expressive to continue. It can meet the
working RTP, hit-rate, feature-frequency, maximum-win, and risk targets through
integer weighting.

This is not evidence that a 1,000-outcome game has adequate production diversity.
The result may overfit the small pool, especially because:

- base has only 107 unique payout values;
- each mode has only one maximum-win candidate;
- rare-path probabilities are derived from very large weights on very few books;
- visual and event-sequence repetition has not been evaluated at production
  scale.

## Next iteration

1. Generate a 10,000-outcome validation pool per mode.
2. Re-run optimization and compare all key metrics for stability.
3. Expand candidate quotas or reels if payout and event diversity remain narrow.
4. Proceed to at least 100,000 outcomes per mode only after the 10,000-outcome
   result remains viable.
5. Preserve final math freeze for the 100,000–1,000,000 outcome production run.
