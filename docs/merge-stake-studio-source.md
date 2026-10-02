# Studio integration

The integration is complete on the canonical `integrate/studio-motion` branch.
Use `npm start` from the repository root to open the one Studio app. Historical
source branches are not development entry points; their work is preserved in Git
history. Do not create another app or repeat the original merge procedure.

## Current ownership

- `src/motion` and `src/studio`: blueprint, style assessor, effect catalog,
  timeline, and generated runtime cue sheets.
- `runtime/stake-studio-source`: Studio UI, VisualEffectRuntime,
  TumbleChoreography, project workflows, math publisher, and QA panels.
- Other root `src` modules: shared domain contracts, recovery, and RGS boundaries.

## Coupling rule

The Studio runtime plays cues; it does not invent the planned sequence.

```text
Blueprint → planFromBlueprint() → cueSheet.cues[]
                                      ↓
                         VisualEffectRuntime / TumbleChoreography
                                      ↓
                                    pixels
```

Cue names live in `src/motion/runtime-cues.ts`. `npm run studio:fixtures`
regenerates the committed JSON consumed by the Studio Preview panel. The app
launcher also rebuilds the planner and syncs fixtures when tooling is installed.

Do not duplicate effect timing in TypeScript motion and JavaScript choreography.
Extend the catalog and style profiles instead of inventing a new pipeline per game.
See [motion cue host](motion-cue-host.md) and [the production loop](THE_LOOP.md).
