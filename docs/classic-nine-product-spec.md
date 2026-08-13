# Classic Nine product and math specification

Status: **local math frozen; frontend implementation and Stake Engine approval
pending**.

This document turns the original Classic Nine contract preview into a concrete
game direction. It authorizes implementation and simulation against the targets
below, but it does not claim that the targets have been achieved. Final lookup
weights, measured statistics, rules, and displayed RTP must come from verified
production artifacts.

## Product direction

### Player promise

Classic Nine is a compact retro-futurist line game set inside a deep-space signal
observatory. Every play scans a 3×3 receiver. Winning signals light connected
paths; three Portal symbols open **Deep Signal**, a self-contained sequence of
nine free scans with a growing central amplifier.

The presentation name remains **Classic Nine**. The visual identity is called
**Signal Nine** so the existing technical name and URLs do not need to change.

### Design goals

- Understandable in one play: match three symbols on one of five visible lines.
- Enough variation to avoid a shallow reskin: anticipation, a nine-spin feature,
  retriggers, and a feature multiplier create a clear second game state.
- Short normal results and a legible fast-play path.
- Portrait-first 3×3 cabinet that also works in a small popout.
- Original illustrated observatory assets, custom typography, animation, and
  audio; no sample SDK art, generic fruit, emoji, or Stake branding.
- Each wager remains independent. Deep Signal begins and ends within its
  originating RGS round.

## Symbols and rules

The original fruit vocabulary has been replaced by the Signal Nine event
contract. The locally frozen books and weights are recorded in
[`math-freeze-001.md`](math/math-freeze-001.md).

| Symbol | Role | Frozen three-of-a-kind award |
| ------ | ---- | ----------------------------- |
| Pulse  | Low  | 0.5×                          |
| Prism  | Low  | 0.8×                          |
| Orbit  | Mid  | 1.2×                          |
| Beacon | Mid  | 2.0×                          |
| Nova   | High | 4.0×                          |
| Crown  | High | 8.0×                          |
| Core   | Wild | 12.0×                         |
| Portal | Scatter | Feature trigger only       |

The five lines are the three horizontal rows and the two corner-to-corner
diagonals. Three matching regular symbols on a line pay the table award. Core
substitutes for every regular symbol, uses the highest valid line award when more
than one interpretation is possible, and does not substitute for Portal. Wins on
different lines add.

Three or more Portal symbols anywhere trigger Deep Signal. Portal awards no
separate scatter prize in the working model; its expected value belongs to the
feature.

These awards are locally frozen inputs, not a claim of external approval. All
non-zero production book payouts are at least 0.1× and use 0.1× increments.

## Deep Signal feature

- The initial trigger grants nine free scans.
- Three or more Portal symbols during the feature grant three additional scans.
- The central cell is a Core wild on every free scan.
- The amplifier starts at 1×.
- After each free scan that produces a line win, the amplifier increases by 1,
  up to 9×.
- The current amplifier multiplies all line wins from that scan.
- The feature ends when no scans remain or the round reaches the win cap.
- A cap event ends further evaluation and presents the capped result.

The multiplier is round-local presentation and math state. It never persists to
the next wager.

## Modes and targets

| Mode | RGS name | Cost | Verified RTP | Maximum win | Feature source |
| ---- | -------- | ---- | ---------- | ----------- | -------------- |
| Base game | `base` | 1× | 96.50% | 10,000× | Natural Portal trigger |
| Deep Signal | `bonus` | 100× | 96.50% | 10,000× base bet | Immediate feature |

The `bonus` mode is a buy-bonus mode, not a persistent feature mode. It must be
hidden when `disabledBuyFeature` is true and use the base bet amount in the play
request; the RGS applies the 100× mode cost.

Working distribution targets:

- Base non-zero result frequency: 20%–35%.
- Natural Deep Signal frequency: between 1 in 120 and 1 in 220 base plays.
- Maximum win probability: attainable within 10,000,000 generated events.
- At least 100,000 diverse events per mode before review; target 1,000,000 per
  mode for final optimization.
- No mode may differ from another by more than 0.5 percentage points of RTP.
- Standard deviation, tail probability, CVaR, ETL, exposure, and payout
  concentration must pass the current Stake Engine limits before release.

The hit-rate and trigger ranges guide reel-strip iteration. They are not approval
criteria until measured results are reviewed and explicitly accepted.

## Math implementation contract

Implement the production model from the official `math-sdk` template with:

- game ID `classic-nine`;
- three reels and three rows;
- line-win evaluation for the five specified paylines;
- regular, wild, and scatter symbol definitions;
- base and bonus reel strips;
- deterministic Deep Signal state and retriggers;
- `base` and `bonus` `BetMode` entries using the targets above;
- `auto_close_disabled=false` for base and true only where a zero-payout bonus
  round must remain resumable;
- `is_buybonus=true` only for `bonus`;
- explicit distributions for zero result, base win, free-game trigger, and win
  cap;
- force records for loss, normal win, big win, natural feature, retrigger,
  bought feature, and win cap.

Required publish output per mode:

- `books_<mode>.jsonl.zst`;
- `lookUpTable_<mode>_0.csv`;
- the shared `index.json`;
- backend/frontend configs, force records, and verification sidecars retained as
  review evidence.

Exact RTP must be recomputed from the final integer lookup weights. Book payout
multipliers and lookup-table payout multipliers must match exactly.

## Event and presentation contract

Production events should use the standard Stake event vocabulary where it fits:

1. `reveal`
2. `winInfo`
3. `setWin`
4. `freeSpinTrigger` and `enterBonus`
5. `updateFreeSpin`
6. `updateGlobalMult`
7. `freeSpinRetrigger`
8. `freeSpinEnd`
9. `setTotalWin`, `finalWin`, or `wincap`

The frontend may add narrowly scoped presentation events, but book events remain
authoritative for what is shown. The browser never calculates a payout or selects
an outcome.

The Classic Nine contract now normalizes standard board, win, free-spin,
multiplier, total, and final-win events into a versioned local envelope. It
preserves strict indexes and checkpoint-based resume while keeping payout
calculation outside the browser.

## Frontend acceptance criteria

- Authenticate before enabling play and select `defaultBetLevel`.
- Enforce min, max, step, and membership in `betLevels`.
- Send the unmultiplied base amount for both modes.
- Treat RGS balances as authoritative.
- Settle zero-result, ordinary-win, and bonus-win rounds with the lifecycle
  required by the current web SDK.
- Resume an authenticated active round from its recorded checkpoint.
- Honor all jurisdiction flags and `minimumRoundDuration`.
- Provide required rules, mode costs, measured RTP, maximum win, paytable,
  feature explanation, controls guide, and malfunction disclaimer.
- Provide social terminology when `social=true`.
- Provide a real public replay flow for loss, normal win, big win, win cap, and
  feature examples for each mode.
- Support keyboard, reduced motion, sound disablement, mobile landscape/portrait,
  and small popout layouts.
- Load no external runtime assets or analytics.

## Approval gates

Implementation may proceed in this order:

1. Validate the Signal Nine symbol/event contract against exploratory math books.
2. Create and unit-test the math-sdk game without large simulations.
3. Run exploratory simulations and revise reels/paytable.
4. Freeze reviewed product inputs.
5. Run final simulations, optimize weights, and verify artifacts.
6. Build the production renderer from those verified events.
7. Complete device, recovery, replay, social, and submission QA.

Do not label the math approved, display an RTP, or create a submission bundle
until measured outputs pass the recorded criteria and a product/math review has
accepted them.

## Upstream basis

This baseline was checked against these official source commits on 2026-07-27:

- `math-sdk` `600a37657c75d67c0412bf3952a01d7e7ee99987`
- `web-sdk` `1843d60cedb94b390e641b563f32ad64353bec5e`
- `ts-client` `df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e`

Re-check the live approval guidance immediately before math freeze and
submission.
