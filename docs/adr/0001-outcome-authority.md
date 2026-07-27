# ADR 0001: Outcome authority

- Status: Accepted for local architecture
- Scope: Local engine boundary; Stake Engine retains external authority

## Context

Math books map a simulation ID to ordered display events and a final payout, and
RGS play returns the selected events. Approval guidance assigns authentication
and bet transactions exclusively to the RGS. See the
[math contract](../upstream/math-sdk-contract.md) and
[client contract](../upstream/ts-client-contract.md).

## Decision

The Stake Engine RGS and immutable approved math artifacts are authoritative for
outcomes, round state, payout, and balance. The local engine renders and validates
returned events; it never chooses, alters, or re-evaluates a monetary outcome.
Malformed or unknown outcome data fails closed and triggers reconciliation.

## Consequences

No RGS, wallet, account system, RNG service, or certification authority will be
built. Internal tests demonstrate local behavior only and never constitute Stake
Engine approval.
