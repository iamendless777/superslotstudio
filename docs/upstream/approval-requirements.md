# Stake Engine approval requirements

Source: [official approval guidelines](https://stake-engine.com/docs/approval-guidelines),
including its linked subpages, retrieved **2026-07-26T10:12:01Z**. This is a
mutable web source with no public revision identifier; re-check immediately before
submission. The statements below are **verified as published at retrieval**, not
an approval promise.

## Release gates

### Game and submission

- Approval binds a specific frontend and math version. Submit a finalized game
  plus a short promotional/theme/mechanics description.
- Every wager is stateless and independent. No jackpots, gamble features,
  continuation, or early cashout.
- Use original, legally cleared design/assets; no copied sample assets or Stake
  branding, underage appeal, offensive/explicit material, or unlicensed IP.
- Approved releases permit only minor visual fixes unless Stake Engine requests
  otherwise; math, modes, and mechanics may not be changed post-approval without
  a new direction/review.

### Frontend and communication

- Static files only; load images/fonts from Stake Engine CDN and contact no
  external sources. Support common mobile and small popout views.
- Provide rules/paytable, each mode/cost, RTP, maximum win, symbol payouts,
  feature access, and special values.
- Provide a UI guide, all RGS bet levels including min/max, current balance,
  incremental/final wins, sound disablement, and spacebar bet unless jurisdiction
  flags prohibit it.
- Autoplay, if present, requires confirmation and may not place unbounded
  consecutive wagers from one click. Fast play must remain legible.
- No network/console errors or game-information logging. Test currencies,
  languages, devices, rules, and payouts.

### RGS and recovery-facing behavior

- Authentication and wallet transactions belong exclusively to the Stake Engine
  RGS. Use launch `rgs_url`; honor authenticated min/max/step/default/bet levels
  and every jurisdiction flag.
- Mandatory replay accepts the documented replay query parameters, fetches the
  recorded state, requires user initiation after loading, disables betting,
  reproduces the original result, and permits replay again. Replay is public and
  requires no player session
  ([replay](https://stake-engine.com/docs/approval-guidelines/game-replay-requirements)).
- The guideline does not specify transport retry/idempotency or unfinished-round
  recovery. These remain open questions, not implied requirements.

### Math

- Each `.jsonl.zst` is at most 4.2 GB and each mode at most 10,000,000 events.
- Published range says RTP must be 90.0%–96.70%; modes must remain within 0.5%
  variation. The page's contradictory 97% example is logged in the version matrix.
- Maximum win must match rules and be realistically obtainable; slot games should
  generally use 100k–1m simulations with reasonable diversity/non-zero hit rate.
- Quality-tier exposure, max multiplier/cost, volatility, tail probability, CVaR,
  and ETL limits apply. RGS rejects bets over USD 500,000 with HTTP 400.
  Re-read the [live math page](https://stake-engine.com/docs/approval-guidelines/math-verification) for numeric gates before submission.

### Jurisdiction and quality

- Social mode (`social=true`) requires the published Stake US terminology
  substitutions across rules, UI, and relevant imagery
  ([jurisdiction](https://stake-engine.com/docs/approval-guidelines/jurisdiction-requirements)).
- Publication and placement are discretionary. Internal QA, this matrix, and a
  successful technical test do **not** constitute Stake Engine approval.

## Assumptions and open questions

- **Assumption:** the stricter explicit RTP range governs until the contradictory
  example is clarified.
- **Open:** obtain a versioned checklist while logged in; the public submission
  page says criteria can vary by team trust level.
- **Resolved for integration:** use ISO 639-1 `pl` because both the RGS details and
  client use it; retain the approval page's `po` value as a vendor correction.
- **Open:** confirm precise autoplay semantics, replay state retention/versioning,
  post-approval visual-fix process, and whether each quantitative quality-tier
  limit applies to this project's intended category.
