# Merging `runtime/stake-studio-source` into the motion layer

## Sources of truth

| Branch | Owns |
|--------|------|
| `motion/multi-style-foundation` | Blueprint, style assessor, effect catalog, timeline, **runtime cue sheet**, domain RGS |
| `agent/recover-game-source` | Full studio UI, VisualEffectRuntime, TumbleChoreography, Morpheus, math publisher, QA panels |

## Coupling rule

The studio runtime **plays cues**; it does not invent the sequence.

```text
Blueprint → planFromBlueprint() → cueSheet.cues[]
                                      ↓
                         VisualEffectRuntime / TumbleChoreography
                                      ↓
                                    pixels
```

Cue names live in `src/motion/runtime-cues.ts` (`cluster.remove`, `reel.stop`, …).
Map each name once inside the runtime. Do not re-plan timing per game in the UI.

## Suggested merge steps

1. Keep `agent/recover-game-source` committed (done: `7c4effa`).
2. On a new branch from `motion/multi-style-foundation`, merge or cherry-pick
   `runtime/stake-studio-source/` only (not competing `src/` domain files).
3. Add a thin adapter:
   `playCueSheet(cueSheet)` → for each cue, `VisualEffectRuntime.play(cue.cue, cue)`.
4. Wire FlagshipWorkflow / StudioProfile to call `planFromBlueprint` when a game
   recipe is selected, then feed `cueSheet` to the studio Preview panel.
5. Replace ad-hoc per-game animation graphs with style profile selection.
6. Push `agent/recover-game-source` when HTTP/SSH size limits are fixed (optional backup).

## Do not

- Duplicate effect timing in both TypeScript motion and JS choreography.
- Let GPT invent new tumble pipelines per title — extend the catalog/styles instead.
