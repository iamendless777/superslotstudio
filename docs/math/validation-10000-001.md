# Signal Nine 10,000-outcome validation 001

Date: 2026-07-27

Status: **stable validation result; production-scale math still pending**.

This run generated 10,000 deterministic candidate outcomes per mode, ten times
the first feasibility pool. The official Rust optimizer then produced ten weight
sets per mode. The measurements below use the highest-scored pair.

## Structural verification

- Books and lookup tables contain exactly 10,000 entries per mode.
- Book SHA-256, payout-array hashes, lookup payouts, and sidecar entry counts
  match.
- Event and simulation indexes are contiguous.
- Every book ends in `finalWin`.
- Every capped book has a matching `wincap`.
- Every free-game reveal has Core in the center.
- Amplifier values never exceed 9×.

Book SHA-256:

- Base: `9b687c269ef7dd1ea22fa613edcf0bb401b016e242650fc1652e8294924a59ee`
- Bonus: `1ca99af47f6bd82cbf1287e55a75ac81000ff0f2721daa23476115f03890ee93`

## Diversity comparison

| Measurement | 1,000 base | 10,000 base | 1,000 bonus | 10,000 bonus |
| ----------- | ---------- | ----------- | ----------- | ------------ |
| Unique payout values | 107 | 706 | 806 | 2,758 |
| Feature books | 81 | 810 | 1,000 | 10,000 |
| Books with retriggers | 7 | 91 | 98 | 939 |
| Capped books | 1 | 10 | 1 | 10 |
| Average events/book | 8.159 | 8.184 | 51.230 | 51.402 |
| Maximum events/book | 249 | 259 | 247 | 251 |

Diversity increased materially without changing the shape or bounded length of
event sequences.

## Optimized measurements

| Measurement | Base | Bonus |
| ----------- | ---- | ----- |
| Exact weighted RTP | 96.499999994768% | 96.499999999775% |
| Non-zero probability | 25.5882% | 100% |
| Standard deviation per mode cost | 5.7049 | 0.9640 |
| Natural feature frequency | 1 in 169.997 | Immediate |
| Retrigger probability | 0.009759% | 7.8226% |
| Maximum-win frequency | 1 in 10,000,000.061 | 1 in 100,000.000 |
| ETL above 40× | 0.245 | 0.100 |
| ETL above 10,000× | 0.001 | 0.100 |
| CVaR | 91.668 | 613.510 |

Total integer lookup weights remain within unsigned 64-bit range:

- Base: `1,125,899,906,836,205`
- Bonus: `1,125,899,906,837,610`

## Stability decision

The larger candidate pool preserves the intended behavior:

- both modes remain at the 96.50% target;
- base hit rate remains inside 20%–35%;
- natural feature frequency remains inside 1-in-120 to 1-in-220;
- normalized standard deviation remains inside the working limits;
- maximum win remains attainable;
- ETL and CVaR remain below the working 3-star limits;
- mode RTP difference is negligible.

Bonus CVaR increased from `517.546` to `613.510`, but remains below the working
limit of `800`. This value requires continued monitoring as the pool grows.

## Optimizer publish-path behavior

The official Rust optimizer automatically writes its highest-scored result to
`publish_files/lookUpTable_<mode>_0.csv`. A backup taken after optimization is
therefore already optimized. After evaluation, this run restored the unit-weight
publish tables from the untouched source files under `library/lookup_tables`.

No experimental weights are currently promoted.

## Next gate

Proceed to a 100,000-outcome run per mode. That run must:

1. confirm continued metric stability;
2. materially increase payout and event-sequence diversity;
3. verify compressed file size and runtime;
4. retain multiple cap, feature, and retrigger candidates;
5. re-run exact book/LUT, RTP, tail, and normalized-volatility checks.

The 100,000-outcome result remains pre-production. Final generation should move
toward 1,000,000 outcomes per mode only after that gate passes.
