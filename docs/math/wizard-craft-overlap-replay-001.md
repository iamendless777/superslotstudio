# WIZARD CRAFT overlap and replay review 001

Date: 2026-07-28

Status: **weighted overlap gate passed; visual replay review pending**.

The read-only
[`review_mode_overlap.py`](../../math/wizard_craft/review_mode_overlap.py)
compares cost-normalized payout distributions and coarse event choreography from
the current integer candidates. An overlap of zero means no shared probability
shape; one means identical shape.

## Mode overlap

| Modes | All payouts | Positive payouts | All event shapes | Feature event shapes |
| --- | ---: | ---: | ---: | ---: |
| Base / Rune | 81.89% | 30.73% | 69.75% | 88.37% |
| Base / Siege | 75.61% | 10.42% | 61.46% | 82.47% |
| Rune / Siege | 75.57% | 10.28% | 91.69% | 90.30% |
| Chance mode / Grimoire | 1.14%–7.80% | 1.22%–10.67% | below 0.10% | below 0.15% |

The large all-payout overlap between chance modes is primarily their shared
losing-spin mass. Once conditioned on a positive result, their payout profiles
are materially different. High feature-shape overlap is intentional: the
approved Tier I/II/III rules do not change based on entry method.

## Tier ladder

Weighted median payout per mode cost:

| Mode | Tier I | Tier II | Tier III |
| --- | ---: | ---: | ---: |
| Base Battle | 19.3× | 22.7× | 58.4× |
| Rune Spark | 9.17× | 19.3× | 105.37× |
| Siege Signs | 2.73× | 6.47× | 72.48× |
| Open the Grimoire | 0.236× | 0.432× | 1.242× |

The first overlap pass found Base Tier III at only a 2.6× median. Its higher
average came from rare tail wins, so the nominal best tier would often have felt
worse than Tier I. The integer builder now applies a middle-out Base Tier III
shape centered near 50×. This raises its median to 58.4× while retaining low
outcomes, rare tails, exact mode RTP, tier shares, and the 25,000× cap.

## Replay catalog

These local book IDs are deterministic candidates for animation review:

| Mode | Loss | Near miss | Normal 1×-cost win | ~100×-cost win | Maximum win |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base Battle | 3 | 5 | 17 | 29230 | 1875 |
| Rune Spark | 3 | 5 | 140 | 35181 | 3946 |
| Siege Signs | 3 | 3 | 796 | 24680 | 5612 |
| Open the Grimoire | N/A | N/A | 23116 | 83497 | 3946 |

Base Battle Tier III book `67170` is the first required proof replay for the
middle-out correction: 50× payout, 54 events. Tier-specific books are also
available from the generated report for all modes.

## Decision

The numeric overlap and tier-progression gates pass. The chance modes may share
the approved feature choreography because they are entry-probability ladders,
not separate bonus rule sets. Their positive payout profiles remain distinct,
and Open the Grimoire is unmistakably different.

Do not freeze yet. The listed books must be played through the actual frontend
to review timing, anticipation honesty, character reactions, sticky readability,
fast-play legibility, and whether the corrected Tier III result feels better in
motion.
