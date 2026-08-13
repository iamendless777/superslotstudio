# StakeStudio Flagship Workflow

StakeStudio has two production tracks.

## Blueprint

Use Blueprint for fast prototypes and games intentionally built from the executable catalog. Its saved stages remain:

`creative → visual → audio → frontend → math → certification → package`

## Flagship

Use Flagship for bespoke mechanics, persistent feature state, variable geometry, custom event protocols, or games whose signature experience cannot be represented honestly by a catalog blueprint.

Its production stages are:

`vision → research → contract → capability → architecture → spikes → vertical slice → visual → audio → frontend → math → certification → package`

The factory stops before visual production until every preproduction gate is approved and evidenced. A blueprint may inspire a Flagship concept, but it is not compiled into the project automatically.

## Non-degradation policy

Unsupported behavior becomes a named capability task. Generic substitution, approximation, automated scope reduction, or silent deferral is prohibited. A promise may be changed only with explicit user approval and a recorded Vision Fidelity Ledger entry.

Release requires every approved promise to be either:

- `proven`, with cross-discipline evidence; or
- `approved-change`, with the approved decision recorded.

## Specialty-agent coordination

Flagship projects define governed specialist lanes for orchestration, creative direction, mechanic architecture, math, event protocol, frontend gameplay, presentation, visual art, audio, player information, and certification.

The coordination contract enforces:

- one writer per owned artifact;
- accepted handoffs before downstream work begins;
- specialists cannot approve their own gates;
- scope changes require user approval; and
- conflicting writes stop for reconciliation.

Agents exchange contracts and evidence, not informal assumptions. The Game Orchestrator owns dependencies and integration; it does not silently reinterpret specialist deliverables.

## MCP workflow controls

The Studio MCP exposes reusable project controls:

- `get_production_workflow`
- `set_production_track`
- `update_flagship_workflow`
- `upsert_specialty_agent_work`
- `record_specialty_agent_handoff`
- `upsert_flagship_scenario`
- `run_flagship_scenario`

These tools modify only the workflow contract. They do not alter math, artwork, audio, or frontend output.

Saved scenarios run through the same seeded local `MathEngine` used by the Studio. Each run records an inspectable event timeline, payout and feature-state facts, expectation failures, covered vision promises, and mechanic-pair coverage. Forbidden or approved-deferred pairs can be dispositioned without manufacturing fake test coverage.

## Release artifact

Every build exports `stakestudio/production-workflow.json` alongside blueprint and art-direction provenance. This records the production track, proof gates, no-degradation policy, specialty-agent handoffs, and final fidelity ledger.
