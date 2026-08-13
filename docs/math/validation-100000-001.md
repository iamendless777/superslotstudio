# Signal Nine 100,000-outcome validation 001

Date: 2026-07-28

Status: **production-scale diversity gate passed; final math freeze pending**.

This run generated 100,000 deterministic candidate outcomes per mode with the
official Stake Engine math SDK. The official Rust optimizer produced ten integer
weight sets per mode. Measurements below use the highest-scored pair, verified
before the publish tables were restored to unit weights.

## Generation and artifact verification

- Generation completed in 146.84 seconds with two simulation workers.
- Books and lookup tables contain exactly 100,000 entries per mode.
- Book SHA-256, payout-array hashes, lookup payouts, and sidecar entry counts
  match.
- Event indexes and terminal events passed the structural reviewer.
- Every capped book has a matching `wincap`.
- Every free-game reveal has Core in the center.
- Amplifier values never exceed 9×.

Book SHA-256:

- Base: `41998cf99dfc787c52aba6f598fea416a651054db453b7c06758cc9093b78788`
- Bonus: `c59538d4a3f1c58d01b25ae1564223985347189e582fcbe3f70517d6541c479a`

Compressed publish sizes:

| File | Size |
| ---- | ---- |
| Base books | 9.2 MB |
| Bonus books | 59 MB |
| Base lookup table | 1.0 MB |
| Bonus lookup table | 1.3 MB |

The 142 MB working library and both compressed books remain comfortably below
the Stake Engine file and event-count limits.

## Diversity comparison

| Measurement | 10,000 base | 100,000 base | 10,000 bonus | 100,000 bonus |
| ----------- | ----------- | ------------ | ------------ | ------------- |
| Unique payout values | 706 | 2,619 | 2,758 | 4,069 |
| Feature books | 810 | 8,100 | 10,000 | 100,000 |
| Books with retriggers | 91 | 835 | 939 | 9,044 |
| Capped books | 10 | 100 | 10 | 100 |
| Average events/book | 8.184 | 8.171 | 51.402 | 51.299 |
| Maximum events/book | 259 | 276 | 251 | 261 |

Diversity increased materially while average and maximum event-sequence lengths
remained stable.

## Optimized measurements

| Measurement | Base | Bonus |
| ----------- | ---- | ----- |
| Official weighted RTP | 96.5000% | 96.5000% |
| Non-zero probability | 25.5882% | 100% |
| Standard deviation per mode cost | 6.040 | 1.094 |
| Natural feature frequency | 1 in 170.000 | Immediate |
| Retrigger probability | 0.018801% | 8.6743% |
| Maximum-win frequency | 1 in 10,000,008.054 | 1 in 100,000.001 |
| ETL above 40× | 0.240 | 0.100 |
| ETL above 10,000× | 0.001 | 0.100 |
| CVaR | 111.528 | 677.512 |

The official verifier reports raw standard deviation for the 100× bonus mode.
The table independently normalizes its raw value of `109.398` by the mode cost.

Total integer lookup weights remain within unsigned 64-bit range:

- Base: `1,125,899,906,800,897`
- Bonus: `1,125,899,906,792,906`

## Gate decision

The 100,000-outcome gate passes:

- both modes remain at the 96.50% target;
- base hit rate remains inside the working 20%–35% range;
- natural feature frequency remains inside 1-in-120 to 1-in-220;
- normalized volatility remains inside the working limits;
- maximum win remains represented and attainable;
- ETL and CVaR remain below the working 3-star limits;
- payout diversity increased without event-sequence growth or file-size pressure.

Bonus CVaR increased from `613.510` at 10,000 outcomes to `677.512` at 100,000.
This remains below the working limit of `800`, but the upward estimate means
bonus-tail stability is the primary risk for the final larger run.

## Publish-path state

The official optimizer automatically promoted its highest-scored trial while it
ran. After verification, both publish lookup tables were restored from the
untouched unit-weight source tables and the generated configs were refreshed.

No experimental optimizer weights are currently promoted.

## Next gate

Proceed to 1,000,000 outcomes per mode before freezing math. That run must:

1. confirm bonus CVaR remains below the working limit with adequate margin;
2. verify RTP, hit rate, feature frequency, volatility, and tails again;
3. confirm payout and sequence diversity continue to improve;
4. retain sufficient replay candidates for loss, normal win, big win, feature,
   retrigger, and cap scenarios;
5. produce the candidate final integer lookup weights and upload bundle only
   after explicit product/math review.
