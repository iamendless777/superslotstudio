# ADR 0004: Round recovery

- Status: Accepted — evidence-backed; staging verification deferred

## Decision

Model `idle`, `starting`, `active`, `ending`, `reconciling`, and `failed-closed`
states. Authenticate first; if it reports an active round, disable new wagers,
restore game-owned `round.state` and `round.event`, and continue it. Long rounds
may checkpoint presentation progress through `/bet/event`. Never automatically
retry a state-changing request after a timeout/unknown transport result. End a
round only after presentation completes and its authoritative state is known.

UI animation completion is not monetary settlement. Reload/reconnect must recover
from RGS state, not browser memory. Persist no credentials or invented outcomes.

## Open questions

The happy-path resume/close sequence and official reference behavior support
authenticate-based reconciliation without mutation retry. Endpoint idempotency is
not assumed or required. Validate response-path interruption in an authorized
staging session before production; escalate only if observed state contradicts the
documented model.
