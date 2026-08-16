# Morpheus Visual Frontend — New Chat Handoff

Copy the section below into a new chat. This is an execution handoff, not a request for another broad audit.

## Prompt for the new chat

Continue Morpheus from repository commit `d1ef85e` and the current dirty worktree in:

`/Users/phantommac/Developer/superslotstudio/runtime/stake-studio-source`

The immediate goal is **not StakeStudio redesign, release paperwork, math regeneration, or submission packaging**. The immediate goal is to make the actual Morpheus frontend's tile and reel motion look like a polished commercial slot game.

Use the existing **Visual Excellence Department agents immediately**. Do not continue as one chat making isolated CSS/animation guesses.

Required ownership:

1. **Visual Director** — owns the exact current-step brief, compares the complete moving sequence against the reference recordings, accepts or rejects specialist work, and prevents scope jumping.
2. **Motion/VFX specialist** — owns spin cadence, symbol motion, win connections, clear, tumble, fall, impact, chained effects, and return to gameplay.
3. **Composition specialist** — owns tile wells, masking, clipping, cabinet/board occlusion, visible empty space, and whether any transient tile appears behind or outside the cabinet.
4. **Independent visual QA** — records and reviews the actual full-screen frontend continuously. Still screenshots, source inspection, tests, and telemetry cannot substitute for watching the motion.

If only three agents are available, the Visual Director coordinates while the specialists are Motion/VFX, Composition, and independent QA. The human retains final approval.

### Current step — do not jump ahead

Perfect the complete ordinary visual loop, in motion:

`spin start → continuous reel movement → deliberate reel stops → winning relationship → clear → visible empty space → synchronized fall → landing impact → possible next win → return to idle`

Work one defect at a time. Do not proceed to bonus spectacle, submission assets, release gates, provider branding, or math until the human says this ordinary tile loop is visually approved.

The human's standard is natural flow: no random timing, surprise tiles, transient symbols behind the cabinet, overlapping idle/effect motion, unexplained pauses, or effects fighting each other. If a newly dropped tile is also part of another effect, the previous sequence must finish and the next effect must take ownership cleanly.

### Visual environment to preserve

The approved working composition is named:

`full-canvas-cabinet-v1`

Preserve it. The game world fills the canvas; the board lives inside the cabinet; the environment is not a translucent HTML box. Morpheus stays on the right near the cabinet, behind the right flowers/laurel, with his mask visible. The foreground flowers/laurel must not cover the board. The tile wells use the current dark professional inset treatment.

Relevant design note:

`/Users/phantommac/Developer/superslotstudio/runtime/stake-studio-source/FULL_CANVAS_CABINET.md`

### Required visual references

Inspect the recordings themselves. Determine from their contents which recording is the Morpheus defect and which are quality benchmarks; do not guess from filenames.

- `/Users/phantommac/Desktop/Screen Recording 2026-08-14 at 6.58.20 PM.mov`
- `/Users/phantommac/Desktop/Screen Recording 2026-08-14 at 8.43.57 PM.mov`
- `/Users/phantommac/Desktop/Screen Recording 2026-08-14 at 8.52.14 PM.mov`
- `/Users/phantommac/Desktop/Screen Recording 2026-08-14 at 8.53.11 PM.mov`
- `/Users/phantommac/Desktop/Screen Recording 2026-08-14 at 8.55.04 PM.mov`

The user specifically reported:

- random tiles appearing behind the cabinet before a spin;
- spins feeling randomly timed rather than orchestrated;
- tile effects and subsequent dropped effects not reading as one natural sequence.

### Actual runtime to inspect

Canonical project:

`/Users/phantommac/Developer/Game Studio Home/games/morpheus_dreamfall/project.json`

Compiled frontend:

`/Users/phantommac/Developer/Game Studio Home/games/morpheus_dreamfall/frontend`

Usual local frontend URL:

`http://127.0.0.1:4175/?studioPreview=true&device=desktop&studioViewport=desktop&silent=1&morpheusProof=mysteryStarDreamfallTumble`

Run and record the real compiled frontend. Review the moving result at normal speed first, then Fast Play, mobile, and mini only after normal desktop is approved.

StakeStudio currently points to Developer paths through plugin version:

`stake-studio 1.0.0+codex.20260814035052`

Its bridge can report `live:true` and zero diagnostics while `capture_studio_view` still times out because of an old `html2canvas` capture failure. Do not waste the session repeatedly retrying that failure. Use the actual compiled full-screen frontend for current visual work. Do not ask the human to enter StakeStudio to make notes.

### Recent implementation state — technically green, not human-approved

Recent frontend work added:

- continuous reel-spin tracks and deliberate reel stops;
- explicit tile-to-tile SVG win connection routes;
- a canonical tumble phase sequence: recognition, reaction, clear, space, enter, fall, settle, evaluate;
- hidden incoming artwork until gravity starts;
- zero per-tile tumble delay;
- synchronized affected-reel landing impact;
- paused idle-symbol animation while win or tumble choreography owns the board;
- music/soundscape disabled while retaining gameplay SFX.

Key files:

- `server/frontend-template/game-app.js`
- `server/frontend-template/styles.css`
- `server/frontend-compiler.mjs`
- `src/editor/preview/PreviewPanel.js`
- `src/styles.css`
- `test/frontend-natural-motion-flow.test.mjs`

The latest focused source run passed `21/21`; the production Vite build passed with `907` modules; the compiled package had `116/116` declared file hashes matching; the governed route reached `completed:evaluate`; browser logs were empty.

Those facts prove the route executes. They **do not prove visual excellence**. The human explicitly believes the previous chat became lost. Do not present these results as visual approval.

Two live regressions were caught and repaired during the last tumble edit: the exploding-tile and incoming-tile loops still needed their `index` values for rotation and entry distance even after their timing delay was removed. Preserve those indexes while keeping animation delay at zero.

### Evidence and scope discipline

- Preserve the existing immutable Morpheus effect-route evidence `run-20260813072658708` (`84/84`). Do not rerun or replace it unless a real freshness rule requires it.
- Do not overwrite failed/corrective Visual Excellence history. Add new evidence only after fresh continuous-motion review.
- Do not claim Visual Director, QA, or human approval from older evidence after current frontend changes.
- Do not touch math. The current math contract is `math-799905d7`; 500,000 existing books were previously verified and were not regenerated.
- Do not change provider number `0`; Stake assignment is still external/pending.
- Background music remains disabled until visuals are finished. Keep gameplay SFX.
- Preserve all existing dirty-worktree changes. Do not reset, checkout, or replace unrelated work.

### Definition of done for this next chat

The next chat is successful only when:

1. the visual agents have inspected the reference recordings and the actual current frontend;
2. one precise current-step brief is recorded;
3. specialists make the smallest corrections needed for that one step;
4. independent QA watches a fresh continuous recording of the whole step at normal speed;
5. the Visual Director reports exact remaining visual defects without claiming human approval;
6. the human is shown the result and decides whether that single step is perfect enough to advance.

Do not answer with another release-blocker list. Start the visual-agent workflow and work on the moving frontend.

## Repository warning

The worktree is very dirty and contains thousands of lines of coordinated work across frontend, Preview, Visual Excellence, agent jobs, storage, audio, math packaging, and tests. Treat every existing modification as user-owned. Work surgically and never discard unrelated changes.

