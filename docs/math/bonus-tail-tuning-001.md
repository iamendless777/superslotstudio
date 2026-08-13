# Signal Nine bonus-tail tuning 001

Date: 2026-07-28

Status: **tuned candidate verified; explicit math-freeze review pending**.

This pass reused the existing 999,906-outcome books. No mechanics, reels,
paytable values, events, or books were regenerated.

## Problem

The neutral million-scale optimizer result reached a bonus CVaR of `768.593`.
That passed the working 3-star limit of `800`, but left only `31.407` points of
headroom.

The ten neutral trials ranged from `746.928` to `768.593`. Selecting a different
neutral trial improved the result but did not create a comfortable margin.

## Optimizer change

Base-mode scaling remains neutral. Bonus free-game candidates now use:

| Payout range | Scale factor |
| ------------ | ------------ |
| 50×–200× | 1.60 |
| 200×–500× | 1.40 |
| 500×–10,000× | 0.15 |

The separate `wincap` condition remains unchanged at `0.001` RTP with a
10,000× average win. The maximum-win frequency and attainability are therefore
preserved.

The runner also accepts `SIGNAL_NINE_OPT_MODES`, allowing a constrained
bonus-only optimization pass without replacing stable base candidates.

## Candidate search

The first conservative tuning pass produced a trial at CVaR `697.466`.
A stronger second pass produced ten valid 96.5% RTP candidates:

| Trial | Normalized std | CVaR |
| ----- | -------------- | ---- |
| 1 | 1.255 | 670.589 |
| 2 | 1.197 | 666.619 |
| 3 | 1.236 | 652.490 |
| 4 | 1.252 | 682.961 |
| 5 | 1.232 | 670.357 |
| 6 | 1.038 | 649.795 |
| 7 | 1.201 | 655.614 |
| 8 | 1.144 | 654.235 |
| 9 | 1.218 | 639.995 |
| 10 | 1.234 | 667.885 |

Trial 9 was selected for verification because it provided the largest CVaR
margin while preserving the recorded mechanics and risk limits. It is not the
optimizer's highest score, so it must be selected explicitly during a future
freeze.

## Official candidate verification

Trial 9 was temporarily paired with the established base candidate and passed
the official verifier:

| Measurement | Base | Tuned bonus |
| ----------- | ---- | ----------- |
| Official weighted RTP | 96.5000% | 96.5000% |
| Standard deviation per mode cost | 5.916 | 1.218 |
| Maximum-win frequency | 1 in 10,000,087.988 | 1 in 100,000.001 |
| ETL above 40× | 0.251 | 0.100 |
| ETL above 10,000× | 0.001 | 0.100 |
| CVaR | 102.317 | 639.995 |

Bonus CVaR improved by `128.598` from the neutral million-scale candidate and
now has `160.005` points of headroom below the working `800` limit. It is also
below the stricter `700` CVaR threshold.

Independent weighted checks found:

- bonus retrigger probability: `9.4602%`;
- maximum-win frequency: `1 in 100,000.001`;
- largest individual bonus payout mass: approximately `0.2105%`;
- no zero-pay bonus outcomes;
- total integer bonus weight: `1,125,899,906,342,359`, within uint64.

The tuned weighting did not create a dominant individual payout.

## Publish-path state

After verification, both publish lookup tables were restored from their
untouched unit-weight source tables and generated configs were refreshed.

No optimized candidate is currently promoted. The tuned trial remains a review
candidate under the ignored math SDK working library.

## Decision

The tail-risk tuning objective is complete. The next step is an explicit
product/math freeze review of the established base candidate and tuned bonus
trial 9. If accepted, those exact integer tables should be selected, verified
again, checksummed, and assembled into the candidate upload bundle.
