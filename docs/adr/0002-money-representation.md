# ADR 0002: Money representation

- Status: Accepted for local architecture

## Decision

Represent all RGS monetary amounts as safe integers in RGS units across domain and
adapter boundaries. Never use binary floating point for authoritative money.
Conversion/localization is presentation-only. The official
[RGS documentation](https://stake-engine.com/docs/rgs) confirms six decimal places
of precision: `1_000_000` represents one unit, and currency affects display only.

Bet selection is restricted to authenticated min/max/step/levels. Balance and
payout are replaced only from authoritative RGS responses.

## Open questions

Confirm maximum safe values, rounding/display rules for sub-cent wins, and how a
future protocol scale change would be versioned. Validate every received integer
against JavaScript's safe-integer range at the adapter boundary.
