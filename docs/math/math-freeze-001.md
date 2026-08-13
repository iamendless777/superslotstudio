# Signal Nine local math freeze 001

Date: 2026-07-28

Status: **local candidate frozen; not uploaded and not externally approved**.

The reviewed base trial 1 and tuned bonus trial 9 have been selected into the
official math SDK publish directory. Configs were regenerated from this exact
state.

## Frozen inputs

- Game mechanics, reels, paytable, feature rules, and 10,000× cap are unchanged.
- Base outcomes: `999,906`.
- Bonus outcomes: `999,906`.
- Base optimizer selection: trial 1.
- Bonus optimizer selection: tuned trial 9.
- Local candidate game version: `1.0.0`.
- Target and exact verified RTP: `96.50%` in both modes.

The selected source trial and final artifact hashes are recorded in
[`freeze-manifest.json`](../../math/classic_nine/freeze-manifest.json).

## Final measurements

| Measurement | Base | Bonus |
| ----------- | ---- | ----- |
| RTP | 96.5000% | 96.5000% |
| Non-zero probability | 25.5882% | 100% |
| Standard deviation per cost | 5.916 | 1.218 |
| Natural feature frequency | 1 in 170.000 | Immediate |
| Retrigger probability | 0.017886% | 9.4602% |
| Maximum-win frequency | 1 in 10,000,087.988 | 1 in 100,000.001 |
| ETL above 40× | 0.251 | 0.100 |
| ETL above 10,000× | 0.001 | 0.100 |
| CVaR | 102.317 | 639.995 |

## Verification completed

- Official book/payout verification sidecars match both compressed books.
- Official lookup format and volatility verification passes.
- Lookup hashes and lengths match `config.json`.
- Required backend config fields are present.
- Total weights fit unsigned 64-bit integers.
- Individual books and lookup tables remain within platform size/event limits.
- No dominant individual tuned bonus payout was detected.
- Tracked game source and official SDK working mirror match.

The official verifier reports raw bonus standard deviation; the value above is
independently normalized by the 100× mode cost.

## Freeze rule

Any subsequent change to mechanics, reels, paytable, outcomes, optimizer
conditions, selected trials, lookup weights, or displayed RTP invalidates this
freeze and requires:

1. a new manifest version;
2. regenerated affected configs and hashes;
3. official math verification;
4. regression tests;
5. a new review decision.

Visual and presentation work may continue as long as it does not change the
frozen math or event contract.

## External state

No S3 upload, Stake Engine submission, external deployment, or approval claim
was made. The large candidate artifacts remain in the ignored local SDK working
library and are identified by the tracked manifest.

The next project phase is submission-readiness work: representative replay IDs,
game information/legal copy, social-language handling, production visual/audio
assets, responsive QA, and final upload-bundle staging.
