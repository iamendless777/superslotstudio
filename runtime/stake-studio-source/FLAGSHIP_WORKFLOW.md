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

Flagship projects define governed specialist lanes for orchestration, creative direction, mechanic architecture, math, event protocol, frontend gameplay, visual direction, composition and assets, motion and VFX, audio, player information, and certification.

The coordination contract enforces:

- one writer per owned artifact;
- accepted handoffs before downstream work begins;
- specialists cannot approve their own gates;
- scope changes require user approval; and
- conflicting writes stop for reconciliation.

Agents exchange contracts and evidence, not informal assumptions. The Game Orchestrator owns dependencies and integration; it does not silently reinterpret specialist deliverables.

Work items are executable coordination records, not model processes. An external agent claims one dependency-ready job, receives a bounded lease, heartbeats while working, and completes or fails it with evidence. Lease tokens prevent another agent from updating the claim, artifact ownership prevents concurrent writers, and expired leases are recoverable. StakeStudio never launches models or arbitrary shell commands on behalf of a job.

## Visual Excellence Department

The Visual Excellence Department is a hierarchy, not three unrestricted writers:

`Visual Director → Composition & Asset + Motion & VFX → Frontend implementation → Render → independent QA → Visual Director review → human final signoff`

The existing `presentation` lane is the Visual Director / Orchestrator. It owns the sequence brief and review verdict but does not implement animation. The existing `visual` lane is the Composition & Asset Specialist. It owns placement, anchors, scale, depth, layers, masks and responsive composition. The added `motion_vfx` lane owns animation, easing, particles, impact, camera response, transitions and secondary motion. Separate artifacts and leased jobs prevent either specialist from overwriting the other's work.

The Creative Director remains authoritative for the world, fantasy and Art Bible. Protocol supplies the authoritative event order and tile relationships. Frontend implements missing reusable renderer capabilities without rewriting visual direction. Audio receives explicit synchronization cues. QA independently verifies rendering, performance, accessibility, replay and viewport behavior. The Visual Director approves the department's result, but the human always retains final visual authority.

Visual sequence briefs are machine-readable. Each brief records the player need, objective, intensity tier (`micro`, `normal`, `major`, or `peak`), intentional phases, authoritative protocol inputs, desktop/mobile/mini coverage, normal/fast/reduced-motion behavior, separate composition and motion objectives, audio synchronization, frontend capability needs, and acceptance criteria. Major events are sequences rather than piles of unrelated effects.

The first governed proof covers two reusable cases:

- **Tile connections:** authoritative event positions become a relationship graph, reel-cell anchors, connection motion, affected-tile reactions, propagation and resolution.
- **Tumble:** recognition, reaction, clear, space resolution, entry, fall, settle and next evaluation.

Each proof requires separate specialist deliveries, an integrated render, independent QA evidence, a Visual Director verdict, and final human signoff. Peak events use peak/max-win language and remain grounded in the game's stateless event contract.

## MCP workflow controls

The Studio MCP exposes reusable project controls:

- `get_production_workflow`
- `set_production_track`
- `update_flagship_workflow`
- `upsert_specialty_agent_work`
- `record_specialty_agent_handoff`
- `create_agent_job`
- `list_agent_jobs`
- `claim_agent_job`
- `heartbeat_agent_job`
- `update_agent_job`
- `complete_agent_job`
- `fail_agent_job`
- `recover_stale_agent_jobs`
- `upsert_flagship_scenario`
- `run_flagship_scenario`

These tools modify only the workflow contract. They do not alter math, artwork, audio, or frontend output.

Saved scenarios run through the same seeded local `MathEngine` used by the Studio. Each run records an inspectable event timeline, payout and feature-state facts, expectation failures, covered vision promises, and mechanic-pair coverage. Forbidden or approved-deferred pairs can be dispositioned without manufacturing fake test coverage.

## Release artifact

Every build exports `stakestudio/production-workflow.json` alongside blueprint and art-direction provenance. This records the production track, proof gates, no-degradation policy, specialty-agent handoffs, and final fidelity ledger.
