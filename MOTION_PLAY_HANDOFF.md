# Motion / Play Motion — Full Handoff

**Date:** 2026-08-19  
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
| `MotionCueHost.js` | Plays a cue sheet on a clock (classic-nine fallback) |
| `playMotionTemplate.js` | Loads `/motion-fixtures/<id>.json` |
| `cueSheetToTumbleEvents.js` | Adapter: cue sheet → `tumbleBoard` payloads |
| `public/motion-fixtures/classic-nine.json`, `cluster-hex.json` | Rehearsal sheets |
| `PreviewPanelMotion.js` | Motion dropdown + **Play Motion** → `playStakeTumble` for cluster |
| `PreviewPanel.playStakeTumble(board, event)` | **Pixel authority** for cascade |
| `CUE_BRIDGE` safety | `win.pulse` / `board.shake` must **not** fire wincap / setWin |
| `npm run dev:agent` | `PORT=3001 STAKE_STUDIO_AGENT=1 STAKE_STUDIO_LIVE_RELOAD=1` |

### Authoritative tumble API (located 2026-08-19)

**Preview (studio):** `PreviewPanel.playStakeTumble(board, event)`  
Triggered by book events `type === 'tumbleBoard'`.

**Portable frontend:** `game-app.js` → `playTumbleBoard(event)`

**Payload shape:**

```js
{
  type: 'tumbleBoard',
  explodingSymbols: [{ reel, row }, ...],   // also accepts [reel, row]
  newSymbols: [[{ name }, ...], ...],       // per reel, prepended at top
}
```

Occupancy: `applyTumbleEvent` / `applyTumbleOccupancy`  
→ survivors compact, incoming prepended (`[...incoming, ...survivors]`). Row 0 = top.

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

Adapter unit test (no studio):

```bash
node --test runtime/stake-studio-source/src/engines/presentation/cueSheetToTumbleEvents.test.js
```

---

## 3. What was broken / still watch

### Core architectural mistake (fixed for cluster-hex)

Play Motion used to be a parallel toy animator (DOM guess + ad-hoc WAAPI).  
Cluster templates now call `playStakeTumble` only. Classic-nine still uses the cue clock (P2).

### Remaining risks

- Morpheus preview DOM may still differ from portable `.board` — `playStakeTumble` uses `.reel-frame` + tumble layer, not portable children.
- Classic-nine is not on the real reel-stop path yet.
- Unknown cues in MotionCueHost still throw (P1).
- Incoming rehearsal symbols are filled from surviving board art (not a math book). Fine for occupancy rehearsal; not a certified round.

### Overlay era (already rejected)

Full-cabinet HTML grid was correctly removed. **Do not bring it back.**

---

## 4. Target architecture (do this)

```text
Template / planner / fixture
    → MotionCueSheet (timing + cells + stepKind + depth)
        → cueSheetToTumbleEvents(sheet, board)
            → tumbleBoard { explodingSymbols, newSymbols }
        → PreviewPanel.playStakeTumble
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

- [x] **Locate** cascade path: `PreviewPanel.playStakeTumble(board, event)` + portable `playTumbleBoard(event)`. Payload `{ explodingSymbols, newSymbols }`.
- [x] **Adapter:** `cueSheetToTumbleEvents(sheet, board)` in `cueSheetToTumbleEvents.js`.
- [x] **Wire Play Motion** for cluster templates to `playStakeTumble` (ad-hoc pop/fall/refill no longer used).
- [x] **Fixture rewrite** `cluster-hex.json` catalogVersion 2: pop → remove per depth; fall/refill cells empty; no dropIn-on-full-board; no win.pulse/shake overlays.
- [ ] **Smoke check:** Play Motion on Morpheus 6×4 — symbols actually leave, others fall, new ones enter; no max-win overlay; no full-cabinet HTML grid.

### P1 — Hardening

- [x] Unit test: occupancy + one-depth + sequential second depth (`cueSheetToTumbleEvents.test.js`).
- [ ] Integration test: Play Motion triggers same board class / plan markers as a real tumble.
- [x] Cue host: unknown cue → warn + skip, not throw whole play.
- [x] Stop mapping `symbol.dropIn` → `spinStart` for cascade templates.
- [x] `reel.stop` → `presentationEvent: 'reveal'` only when `allowPresentationEvents` is explicitly true; rehearsal default is no-op.
- [x] Ensure `app.js` import of `PreviewPanelMotion` is stable and documented.
- [x] Confirm fixtures served under Vite on 3001 (`publicDir: 'public'` → `/motion-fixtures/*.json`).

### P2 — Multi-style + art loop (2-day goal)

- [ ] CLI: `npm run studio -- cues <template>` writes or refreshes fixtures automatically.
- [ ] Templates each lock a recommended style; Play Motion dropdown lists all templates that have fixtures.
- [ ] Art brief: missing symbols + role guidance; no motion work blocked on art.
- [ ] Classic-nine path: reel blur/stop/anticipation via same Preview reel motion path (not only cluster).
- [ ] Sticky / anticipation templates: fixtures + Play Motion parity.

### P3 — Cleanup

- [ ] Remove dead overlay CSS/IDs if any remain.
- [ ] Trim MotionCueHost comments that claim TumbleChoreography is wired when it is not.
- [ ] Optional: merge `integrate/studio-motion` → `main` after P0 smoke pass.
- [ ] Large binary assets: keep out of motion-only PRs.

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
runtime/stake-studio-source/src/engines/presentation/cueSheetToTumbleEvents.js
runtime/stake-studio-source/src/engines/presentation/cueSheetToTumbleEvents.test.js
runtime/stake-studio-source/src/editor/preview/PreviewPanelMotion.js
runtime/stake-studio-source/src/editor/preview/PreviewPanel.js          ← playStakeTumble
runtime/stake-studio-source/src/app.js
runtime/stake-studio-source/public/motion-fixtures/*.json

# Reference implementation of correct cascade pixels
runtime/stake-studio-source/server/frontend-template/game-app.js       ← playTumbleBoard()
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
node --test runtime/stake-studio-source/src/engines/presentation/cueSheetToTumbleEvents.test.js
```

### Studio

```bash
cd ~/Developer/superslotstudio/runtime/stake-studio-source
npm run dev:agent          # 3001, live reload, leave running
```

### Git

```bash
cd ~/Developer/superslotstudio
git fetch origin
git checkout integrate/studio-motion
git pull origin integrate/studio-motion
git status
```

---

## 8. Play Motion expected behavior (definition of done for P0)

When user clicks **Play Motion** with **cluster-hex**:

1. Status shows `Cascade 1 / N` then `Done`.
2. **No** HTML grid covering the cabinet.
3. **No** MAXIMUM WIN / 100,000× overlay from motion cues.
4. A coherent cascade:
   - Cluster tiles react and clear
   - Tiles above fall into gaps (real `playStakeTumble` layer)
   - New tiles enter from above
   - Board settles
5. After completion, board is the post-tumble occupancy (not a cosmetic reset to the pre-spin board unless you spin again).
6. Failures should surface clearly.

---

## 9. Safety rules for motion rehearsal

Never map these during Play Motion / cue rehearsal:

- `board.shake` → `wincap` / max-win UI  
- `win.pulse` → `setWin` / payout celebration that owns the full screen  

Local highlight / shared tumble win classes only.

`executePresentation` for Play Motion should stay a **no-op** unless a future flag explicitly enables director recipes for a controlled demo mode.

---

## 10. Next session

1. Smoke Play Motion cluster-hex on Morpheus 6×4 (P0 last box).
2. If pixels are wrong, inspect `playStakeTumble` vs current `this.board` shape — do not revive ad-hoc WAAPI.
3. P1: unknown-cue warn+skip; confirm Vite serves fixtures.
4. P2: classic-nine via real reel path; auto-write fixtures from CLI.

---

## 11. Branch / PR notes

- Active integration branch: **`integrate/studio-motion`**
- Related historical branches: `motion/multi-style-foundation`, `agent/recover-game-source`
- Prefer small commits on motion wiring; avoid mixing 50MB art blobs into motion-only commits
- Remote: `https://github.com/iamendless777/superslotstudio.git` (account `iamendless777`)

---

## 12. Non-goals (for now)

- Rebuilding Morpheus art or math from scratch
- New HTML overlay “motion preview grid” as user-facing UI
- Perfect multi-style VFX polish before tumble path is shared
- Three.js / minimax — noise for the 2-day cascade ship loop
- Blocking art pipeline on motion perfection — after P0 smoke, art-brief can proceed in parallel

---

## 13. One-line summary for the next agent

**Cluster Play Motion now goes through playStakeTumble. Smoke it on Morpheus 6×4; then classic-nine real reel path and auto fixtures. Do not invent a second animator.**
