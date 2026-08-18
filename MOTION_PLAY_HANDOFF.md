# Motion / Play Motion — Full Handoff

**Date:** 2026-08-18  
**Branch:** `integrate/studio-motion`  
**Repo:** https://github.com/iamendless777/superslotstudio  
**Local path:** `~/Developer/superslotstudio`  
**Goal:** Ship many Stake.com games quickly (target ~2 days each) by making motion + templates reliable so the bottleneck is **art selection**, not fighting the studio.

This document is the single handoff for humans or agents continuing the work.

---

## 1. Product goal (do not lose this)

1. Style-agnostic motion (not locked to one look).
2. Templates (classic-nine, cluster-hex, sticky-five, anticipation-five, …) that validate, plan cues, and list art gaps.
3. **Play Motion** in studio preview must look like a real slot cascade/spin — same visual authority as a live round.
4. Then: pick art → grade → ship. Motion pipeline should not be the bottleneck.

---

## 2. What exists and works

### Domain / TypeScript side (repo root)

| Piece | Role |
|--------|------|
| `src/motion/*` | Style profiles, assess, timeline planner |
| `src/studio/*` | Blueprints, art-brief, templates CLI, stake-runtime-bridge |
| `npm run studio -- …` | `assess`, `plan`, `cues`, `templates`, art-gap style flows |
| Tests | `npm test` at repo root — domain suite should stay green |

### Studio runtime (`runtime/stake-studio-source/`)

| Piece | Role |
|--------|------|
| `MotionCueHost.js` | Plays a cue sheet on a clock; maps cue names → animState / tumbleAction / presentationEvent |
| `playMotionTemplate.js` | Loads `/motion-fixtures/<id>.json`, rAF ticks the host |
| `public/motion-fixtures/classic-nine.json`, `cluster-hex.json` | Static rehearsal sheets |
| `PreviewPanelMotion.js` | Wraps PreviewPanel; injects Motion dropdown + **Play Motion** |
| `src/app.js` | Should import `PreviewPanelMotion` instead of base `PreviewPanel` |
| `CUE_BRIDGE` safety | `win.pulse` / `board.shake` must **not** fire wincap / setWin during rehearsal |
| `npm run dev:agent` | `PORT=3001 STAKE_STUDIO_AGENT=1 STAKE_STUDIO_LIVE_RELOAD=1` |

### Operational setup that works

```bash
# Terminal 1 — leave running (agent lane)
cd ~/Developer/superslotstudio/runtime/stake-studio-source
npm run dev:agent
# → http://127.0.0.1:3001/

# Terminal 2 — git / commands only
cd ~/Developer/superslotstudio
git checkout integrate/studio-motion
git pull origin integrate/studio-motion
```

Open preview on **3001**, load project, use **Motion → cluster-hex → Play Motion**.

---

## 3. What is broken / wrong (read before coding)

### Core architectural mistake

**Play Motion is a parallel toy animator.** It does **not** drive the same path as a real `tumbleBoard` / cascade in Preview or the portable frontend.

Portable game already has correct cascade logic in:

`runtime/stake-studio-source/server/frontend-template/game-app.js` → `playTumbleBoard()`

That path:

- Marks exploding symbols
- Pops / clears with Web Animations
- Rebuilds reel children (survivors + incoming)
- Gravity fall + refill + settle
- Uses `.board > .reel > .symbol`

Play Motion instead:

1. Runs a fixture cue clock
2. Guesses DOM nodes via `findPreviewBoard` / `findSymbolAt`
3. Runs ad-hoc `element.animate()` without changing board occupancy

So timing can be correct while **pixels never look like a slot.**

### Fixture physics mistakes (`cluster-hex.json`)

- `cluster.remove` then `symbol.pop` — reaction should come **before** clear.
- Fall/refill cells are cosmetic; board state never updates.
- Win pulse targets cells that were already “cleared.”
- Multi-depth cascades are independent timed flashes, not dependent state.
- Full-board `symbol.dropIn` on an already-full board is misleading.

### DOM / Preview mistakes

- Studio Morpheus preview structure may **not** match portable `.board` layout.
- `board.children[reel].children[row]` can hit overlays / non-symbol nodes.
- Flat `.symbol` index (column-major + row-major) can pick wrong tiles silently.
- WAAPI `fill: 'forwards'` leaves opacity/transform stuck until reset.
- Clock does not wait for animation duration → overlapping cues.
- `symbol.dropIn` maps to `animState: 'spinStart'` (wrong for cascade rehearsal).

### Overlay era (already rejected)

- Full-cabinet HTML grid was correctly removed. **Do not bring it back** as product UX. Debug-only overlays only if temporary and off by default.

---

## 4. Target architecture (do this)

```text
Template / planner / fixture
    → MotionCueSheet (timing + cells + stepKind + depth)
        → Adapter
            → tumbleBoard-shaped payload
                { explodingSymbols, newSymbols?, board? }
            → OR classic reveal / reel payloads
        → Existing Preview presentation path
            (same code as live / replay tumble)
                → Real symbols move
```

**Not:**

```text
CueSheet → random querySelector → ad-hoc WAAPI
```

Domain TS planner remains source of timing authority.  
Studio Preview remains pixel authority — **one** tumble implementation.

---

## 5. TODO list (priority order)

### P0 — Make Play Motion real

- [ ] **Locate** how `PreviewPanel` applies cascade / tumble today (search for `tumbleBoard`, `is-tumbling`, `playTumble`, mechanic clear). Document the exact function names and required payload shape in this file when found.
- [ ] **Adapter:** `motionCueSheetToTumbleEvents(sheet)` → one or more event objects the Preview path already understands.
- [ ] **Wire Play Motion** to call that path only (delete or gut ad-hoc `motionPop` / `motionFall` / `motionRefill` once wired).
- [ ] **Fixture rewrite** for `cluster-hex.json`:
  - Legal order: recognition/reaction → clear → fall → refill → settle (per depth).
  - Cells consistent with gravity (no win on empty cells unless intentional highlight of prior cluster).
  - Prefer generating fixture from a tiny synthetic board + explode set rather than hand-waving cells.
- [ ] **Smoke check:** Play Motion on Morpheus 6×4 — symbols actually leave, others fall, new ones enter; no max-win overlay; no full-cabinet HTML grid.

### P1 — Hardening

- [ ] Integration test: Play Motion triggers same board class / plan markers as a real tumble (or shared helper unit test).
- [ ] Cue host: unknown cue → warn + skip, not throw whole play.
- [ ] Stop mapping `symbol.dropIn` → `spinStart` for cascade templates (neutral or cascade-specific anim state).
- [ ] `reel.stop` → `presentationEvent: 'reveal'` only when executePresentation is explicitly allowed; keep rehearsal no-op by default.
- [ ] Ensure `app.js` import of `PreviewPanelMotion` is stable and documented.
- [ ] Confirm fixtures served under Vite on 3001 (`/motion-fixtures/*.json`).

### P2 — Multi-style + art loop (2-day goal)

- [ ] CLI: `npm run studio -- cues <template>` writes or refreshes `runtime/.../public/motion-fixtures/<template>.json` automatically.
- [ ] Templates each lock a recommended style; Play Motion dropdown lists all templates that have fixtures.
- [ ] Art brief: missing symbols + role guidance; no motion work blocked on art.
- [ ] Classic-nine path: reel blur/stop/anticipation via same Preview reel motion path (not only cluster).
- [ ] Sticky / anticipation templates: fixtures + Play Motion parity.

### P3 — Cleanup

- [ ] Remove dead overlay CSS/IDs if any remain.
- [ ] Trim MotionCueHost comments that claim TumbleChoreography is wired when it is not (or actually wire it).
- [ ] Optional: merge `integrate/studio-motion` → `main` after P0 green and smoke pass.
- [ ] Large binary assets: keep out of motion-only PRs; use Git LFS or asset pipeline if push size hurts again.

---

## 6. Key files (agents start here)

```text
MOTION_PLAY_HANDOFF.md                          ← this file

# Domain
src/motion/
src/studio/
src/studio/stake-runtime-bridge.ts

# Studio presentation
runtime/stake-studio-source/src/engines/presentation/MotionCueHost.js
runtime/stake-studio-source/src/engines/presentation/playMotionTemplate.js
runtime/stake-studio-source/src/editor/preview/PreviewPanelMotion.js
runtime/stake-studio-source/src/editor/preview/PreviewPanel.js          ← find real tumble here
runtime/stake-studio-source/src/app.js
runtime/stake-studio-source/public/motion-fixtures/*.json

# Reference implementation of correct cascade pixels
runtime/stake-studio-source/server/frontend-template/game-app.js       ← playTumbleBoard()

# Dev scripts
runtime/stake-studio-source/package.json                               ← dev:agent
runtime/stake-studio-source/scripts/start-stake-studio.mjs
```

---

## 7. Commands cheat sheet

### Domain (repo root)

```bash
cd ~/Developer/superslotstudio
npm test
npm run studio -- templates
npm run studio -- cues cluster-hex
npm run studio -- cues classic-nine
```

### Studio

```bash
cd ~/Developer/superslotstudio/runtime/stake-studio-source
npm run dev:agent          # 3001, live reload, leave running
# optional: PORT=3000 npm run dev   # human / other tools
```

### Git

```bash
cd ~/Developer/superslotstudio
git fetch origin
git checkout integrate/studio-motion
git pull origin integrate/studio-motion
git status
```

### If checkout blocked by local edits

```bash
git stash push -u -m "wip"
git pull origin integrate/studio-motion
# or commit on a side branch — do not force-lose Morpheus art work blindly
```

---

## 8. Play Motion expected behavior (definition of done for P0)

When user clicks **Play Motion** with **cluster-hex**:

1. Toolbar/status shows phase names (optional but useful).
2. **No** HTML grid covering the cabinet.
3. **No** MAXIMUM WIN / 100,000× overlay from motion cues.
4. A coherent cascade:
   - Cluster tiles react and clear
   - Tiles above fall into gaps (real layout or shared tumble helper)
   - New tiles enter from above
   - Board settles
   - Optional win pulse on a **sensible** set of cells
5. After completion, board returns to a clean settled state (or explicit reset).
6. Console may log `[motion]` cue lines; failures should surface clearly.

---

## 9. Safety rules for motion rehearsal

Never map these during Play Motion / cue rehearsal:

- `board.shake` → `wincap` / max-win UI  
- `win.pulse` → `setWin` / payout celebration that owns the full screen  

Local highlight / shared tumble win classes only.

`executePresentation` for Play Motion should stay a **no-op** unless a future flag explicitly enables director recipes for a controlled demo mode.

---

## 10. Suggested next implementation session (concrete)

1. Open `PreviewPanel.js` and search: `tumble`, `is-tumbling`, `exploding`, `cascade`, `mechanic`.
2. Note the public method that presents a tumble (or mirror `playTumbleBoard` logic into a shared module both portable + Preview can call).
3. Implement `cueSheetToTumblePayload(sheet)` for one depth of cluster-hex.
4. Point `playMotionStylePreview()` at that method; remove DOM-guess animators.
5. Fix fixture order + cells; re-test on 3001.
6. Add a small test or checklist entry to this handoff when green.

---

## 11. Branch / PR notes

- Active integration branch: **`integrate/studio-motion`**
- Related historical branches: `motion/multi-style-foundation`, `agent/recover-game-source` (heavy studio WIP / art)
- Prefer small commits on motion wiring; avoid mixing 50MB art blobs into motion-only commits
- Remote: `https://github.com/iamendless777/superslotstudio.git` (account `iamendless777`)

---

## 12. Non-goals (for now)

- Rebuilding Morpheus art or math from scratch
- New HTML overlay “motion preview grid” as user-facing UI
- Perfect multi-style VFX polish before tumble path is shared
- Blocking art pipeline on motion perfection — after P0, art-brief can proceed in parallel

---

## 13. One-line summary for the next agent

**Wire Play Motion to the existing tumble/cascade presentation path; stop inventing a second animator; fix fixtures to match real board state; then expand templates and art-brief for the 2-day ship loop.**
