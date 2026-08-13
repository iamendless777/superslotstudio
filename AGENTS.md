# StakeStudio Production Operating Contract

This repository is an established Stake game-production studio. Optimize for shipping complete games with it, not for continually redesigning the studio.

## Sources of truth

- The current official Stake Math SDK, Web SDK, TS Client, and applicable Stake documentation are authoritative for platform behavior.
- Never implement Stake-specific behavior from memory. Read the relevant current source or documentation, identify the contract, then implement and test against it.
- Each game's canonical manifest/project configuration is the source of truth for game identity, SDK versions, layout, assets, layers, reels, symbols, mechanics, animation, audio, math, modes, RTP, volatility, maximum win, and validation requirements.
- Keep important game properties in the canonical configuration rather than scattering hardcoded values through the codebase.

## Production priority

Prefer, in order:

1. An existing reusable studio capability.
2. Game configuration or manifest data.
3. The smallest reusable studio improvement.
4. A clean game-specific implementation.
5. A one-off workaround only when no sound alternative exists.

Do not redesign working systems, create duplicate systems, or change unrelated code merely because a task is difficult.

## Missing-capability rule

When a requested feature is not currently supported, explicitly classify it as one of:

- `EXISTING`: use the current system.
- `NEW CAPABILITY REQUIRED`: build the smallest technically sound reusable foundation, test it independently, integrate it, render/run it, and refine it.
- `ACTUALLY IMPOSSIBLE / SDK CONSTRAINT`: verify the constraint in current code/docs, then implement the closest valid player-facing alternative.

Unknown does not mean impossible, and unsupported does not mean do not build. Do not silently downgrade a requested feature because it requires new work. Do not generalize an unproven feature beyond what the current game genuinely needs.

## Required workflow

Before changing anything:

1. Classify the task: math, mechanics, rendering, assets, placement, layering, animation, effects, UI, audio, SDK integration, build, export, or testing.
2. Read the relevant existing studio implementation and the current game's canonical manifest/project configuration.
3. For Stake-facing behavior, read the relevant official SDK source/docs and identify the exact contract.
4. Determine the smallest correct change and its affected dependencies.

Then implement, run the real result, inspect the evidence, fix discrepancies, and repeat until the requested quality is reached.

## Storage and evidence discipline

- Treat repository, game-project, and iCloud-backed storage as finite production resources. Check free space before any capture, simulation, build, export, or asset-generation run that may write substantial data; do not begin large work with less than 10 GiB free.
- Put scratch files and transient run state in a task-specific directory under `/private/tmp`, never in an iCloud-synced project tree. Remove task-owned scratch data after success or failure.
- Keep one current passing immutable evidence run per governed audit plus, when actively debugging, one current failing run. Do not accumulate superseded capture runs indefinitely.
- Promote a completed run atomically into canonical evidence. A timed-out or failed command must be acknowledged or cancelled before retrying so it cannot continue generating duplicate runs.
- Store compact evaluator-required facts in project manifests. Keep large raw captures and diagnostic grids out of the manifest and avoid copying the same artifacts into repository, project, and output directories.
- Before deleting historical or user-created artifacts, resolve the exact canonical references, report what would be removed and retained, and obtain approval. Prefer recoverable cleanup where it actually releases space.
- Include storage growth and cleanup behavior in verification for any reusable capture, build, simulation, or export capability.

## Player experience and visual execution

- Build new features in the progression `SIMPLE -> WORKING -> BEAUTIFUL -> REFINED`.
- Preserve the intended player experience rather than forcing an unnecessarily literal or fragile implementation.
- Treat major events as orchestrated sequences: anticipation, action, impact, reaction, resolution, and return to gameplay.
- Coordinate timing, easing, hierarchy, intensity, layering, camera, lighting, particles, sound, and recovery. Effects must support one composition instead of competing for attention.
- Build from real assets early when available: placement, layer hierarchy, states, transitions, effects, orchestration, then polish.
- Maintain coherence, readability, continuity, animation consistency, player feedback, and game flow while solving individual features.
- The target is a polished, intentionally designed commercial game, not a merely functional prototype.

## Verification and definition of done

Never claim success from source inspection alone.

- Visual, placement, layering, animation, effects, UI, reel, or symbol change: render/preview and inspect the actual result at relevant viewport sizes.
- Math change: run the appropriate deterministic simulation and verify RTP, distribution/volatility, hit behavior, maximum win, bonus contribution, and relevant tail-risk metrics.
- SDK or RGS change: verify the current contract, run relevant tests/builds, and inspect generated artifacts.
- Mechanic or orchestration change: execute the actual mechanic and inspect its complete event sequence.
- Audio change: audition it in context and run the available mastering/coverage checks.
- Export or submission change: validate the produced bundle and its hashes, formats, limits, metadata, and replay behavior.

A task is complete only when the implementation, canonical configuration, tests, build, runtime behavior, and applicable visual/math/SDK/export evidence agree. State exactly what was verified and what remains unverified.

Build once. Reuse everywhere. Verify everything.
