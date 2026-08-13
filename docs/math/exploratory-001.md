# Signal Nine exploratory math review 001

Date: 2026-07-27

Status: **structurally valid candidate batch; math targets not met**.

This review covers 1,000 generated outcomes per mode using the working
distribution quotas and unit lookup weights. It is a candidate-book smoke test,
not a natural-frequency Monte Carlo simulation, optimized math result, production
artifact set, or approval claim.

## Structural result

- Both modes generated compressed books, lookup tables, force records, configs,
  `index.json`, and verification sidecars.
- Official SDK verification confirmed that book hashes, payout-array hashes,
  lookup payouts, and entry counts match.
- Every mode contains exactly 1,000 books and 1,000 lookup rows.
- Event indexes and simulation IDs are contiguous.
- Every book ends with `finalWin`; capped books contain a matching preceding
  `wincap`.
- Every free-game reveal contains Core in the center.
- No emitted amplifier value exceeds 9×.
- Raw unpadded line-win rows remain in the range 0–2.
- A cross-mode sidecar retention defect was discovered during the first run and
  fixed by isolating payout sidecars per SDK simulation batch.

## Exploratory measurements

| Measurement | Base | Bonus |
| ----------- | ---- | ----- |
| Outcomes | 1,000 | 1,000 |
| Candidate criteria | 500 zero, 419 base, 80 feature, 1 cap | 999 feature, 1 cap |
| Unit-weight return | 2,131.38% | 139.1069% |
| Non-zero candidate rate | 50.0% | 100.0% |
| Unique payout multipliers | 107 | 806 |
| Minimum payout | 0× | 10.4× base bet |
| Maximum payout | 10,000× | 10,000× |
| Feature books | 81 | 1,000 |
| Books with retriggers | 7 | 98 |
| Capped books | 1 | 1 |
| Average events per book | 8.159 | 51.230 |
| Maximum events in one book | 249 | 247 |

Book SHA-256:

- Base: `cb844dca5bfeec7c9814fc7a00ad72e6020d978fef260d2e320cfefc15256b4d`
- Bonus: `cc359c5f64ad1087b94df16c3842413e0558410a3eb822befa192027311bae9d`

The unit-weight returns are intentionally not representative of final RTP. The
candidate pool contains forced zero, feature, and cap strata so the optimizer can
assign final integer weights. In particular, one cap book in 1,000 equal-weight
outcomes alone contributes 10× return to the base mode.

## Failed release checks

The official verifier correctly rejects the equal-weight batch:

- Base RTP is 21.3138 instead of the 0.965 target.
- Bonus RTP is 1.391069 instead of the 0.965 target.
- Mode RTPs are far outside the allowed variation.
- Equal weights fail ETL, CVaR, and volatility limits.
- The base candidate mix has a 50% non-zero rate, above the working 20%–35%
  product range.

These failures block any production or approval claim, but they do not invalidate
the candidate-generation mechanics.

## Diversity and mechanic observations

- Base diversity is currently modest at 107 payout values. A larger exploratory
  pool should include more ordinary-win and feature ranges before final
  optimization.
- Bonus diversity is healthy for this small batch at 806 payout values.
- Natural-feature candidates exercise all nine initial scans.
- Retriggers occur in both modes.
- Forced cap candidates are attainable and terminate cleanly.
- Long cap paths remain bounded below 250 events in this sample.

## Next iteration

1. Run the optimizer against this small candidate pool as a feasibility check.
2. Inspect whether integer weights can reach 96.50% in both modes while sharply
   reducing cap and tail exposure.
3. If feasibility or distribution quality is poor, revise candidate quotas and
   reel strips before increasing simulation size.
4. Add explicit measured checks for target base hit rate, natural feature
   frequency, standard deviation, tail probabilities, CVaR, and ETL.
5. Only after the small model behaves plausibly, increase toward 100,000–1,000,000
   outcomes per mode.

The reusable reviewer is
`math/classic_nine/review_exploratory.py`.
