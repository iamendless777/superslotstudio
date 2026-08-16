# 2-day game production cycle

Goal: ship a new Stake Engine game every ~2 days by never reinventing motion,
recovery, or contracts. Only the recipe and art change.

## Day 0 / morning — recipe (30–90 min)

1. Copy a blueprint template (`classicNineBlueprint` or a cluster template).
2. Set `gameId`, `title`, grid, `winType`, paytable, cascade depth, flags.
3. Run `assessGameShape` / `planFromBlueprint` — lock a **styleId** from recommendations
   (`classic-lines`, `cluster-snap`, `cluster-fluid`, `sticky-lock`, `anticipation-heavy`).
4. Fill `artBrief` and symbol labels. Leave `artKey` null until assets exist.

Output: validated `Blueprint` + motion timeline preview. No Pixi work yet.

## Day 0 / afternoon — math skeleton (2–4 h)

1. Map blueprint paytable into offline math definitions under `tools/math`.
2. Generate candidate books that emit the presentation event contract
   (`reveal` / tumble steps / `highlight`).
3. Run local return / hit-rate review criteria. Iterate weights, not visuals.

Output: draft books + review JSON. Still non-approved.

## Day 1 — art + motion preview (full day)

1. Produce symbol art to match `artBrief`; set each `artKey`.
2. Drop assets into the renderer pack keyed by `artKey`.
3. Play `MotionTimeline.effects` in the preview player (same timeline the studio planned).
4. Tune only **style profile timings** if the feel is wrong — do not fork per-game animation code.

Output: art-complete blueprint + playable local preview.

## Day 2 — RGS path + polish (full day)

1. Wire presentation books through existing domain session (already built).
2. Replay + recovery smoke with fake RGS / authorized staging when available.
3. Export static frontend + math publish files for Stake Engine upload.
4. Checklist: missing art = 0, style match = true, recovery evidence current.

Output: uploadable game package.

## What the studio must never redo per game

- Money units, authenticate recovery, HTTP adapter, event envelope schema
- Effect catalog and tumble step kinds
- Assessor / timeline planner

## What is allowed to change per game

- Blueprint fields
- Style selection (from the registered set)
- Symbol art and audio
- Math weights and mode definitions
- Optional new **style profile** only when an existing one cannot express the feel

## Stretch

- Template pack: lines / cluster / sticky / anticipation blueprints
- CLI: `studio new`, `studio assess`, `studio plan`, `studio art-gap`
- Renderer that only consumes `MotionTimeline` + art map
