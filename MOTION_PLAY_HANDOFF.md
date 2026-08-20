# Motion / Play Motion — Full Handoff

**Date:** 2026-08-19  
**Branch:** `integrate/studio-motion`  
**Repo:** https://github.com/iamendless777/superslotstudio  
**Local path:** `~/Developer/superslotstudio`  
**Goal:** Ship many Stake.com games quickly (target ~2 days each) by making motion + templates reliable so the bottleneck is **art selection**, not fighting the studio.

This document is the single handoff for humans or agents continuing the work.

## Start here — 3001 (agent lane, live reload)

```bash
# Terminal 1 — leave this running
cd ~/Developer/superslotstudio
git checkout integrate/studio-motion
git pull origin integrate/studio-motion
npm run dev:agent
# → http://127.0.0.1:3001/
#    rebuilds planner, writes motion fixtures, starts studio with live reload

# Terminal 2 — git / commands only
cd ~/Developer/superslotstudio
```

Open Preview on **3001**, load a project, **Motion → cluster-hex → Play Motion**.

Smoke (60 seconds):
1. cluster-hex — tiles leave, survivors fall, new tiles enter, board restores, no max-win overlay
2. classic-nine — reels blur and stop, no wager deducted
3. sticky-five — stop + sticky pulse
4. anticipation-five — last-reel hold
Status may say “N art missing · motion still plays”. That is the point.

Equivalent (if Terminal 1 is already in the studio folder):

```bash
cd ~/Developer/superslotstudio/runtime/stake-studio-source
npm run dev:agent
```

Port split: **3000** = ChatGPT/human lane (`npm run dev`). **3001** = agent lane (`npm run dev:agent`). Do not mix them.

Fixtures regenerate on `npm run build`, on 3001 boot, and live while 3001 is running if `src/motion` or `src/studio` changes. You do not need to remember `studio:fixtures`. CI fails if generated JSON is not committed.


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
cd ~/Developer/superslotstudio
npm run dev:agent
# → http://127.0.0.1:3001/
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

- Incoming rehearsal symbols are filled from surviving board art (not a math book). Occupancy is real; the round is not certified.
- Ways games (Morpheus / Waylanders-style) seed a left-to-right **3-of-a-kind**, not a cluster blob. Cluster templates still seed a 2×2.
- Unique cluster boards seed a 2×2 matching cluster before tumble so pops look like a win, then restore.

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
- [x] **Smoke check:** Play Motion on Morpheus 6×4.
  - cluster-hex (14:34 + 21:26): `playStakeTumble`, two depths, gravity, restore, no wager.
  - classic-nine (21:43): sequential reel blur/stop, no wager.
  - sticky-five (21:27): reel path + sticky cue (seeds wilds if the live board has none).
  - anticipation-five (21:56): last-reel hold ~1.4s, status `Anticipation`, no wager.

### P1 — Hardening

- [x] Unit test: occupancy + one-depth + sequential second depth (`cueSheetToTumbleEvents.test.js`).
- [x] Integration test: adapter occupancy matches `StakeRoundBook.applyTumbleEvent`.
- [x] Cue host: unknown cue → warn + skip, not throw whole play.
- [x] Stop mapping `symbol.dropIn` → `spinStart` for cascade templates.
- [x] `reel.stop` → `presentationEvent: 'reveal'` only when `allowPresentationEvents` is explicitly true; rehearsal default is no-op.
- [x] Ensure `app.js` import of `PreviewPanelMotion` is stable and documented.
- [x] Confirm fixtures served under Vite on 3001 (`publicDir: 'public'` → `/motion-fixtures/*.json`).

### P2 — Multi-style + art loop (2-day goal)

- [x] CLI: `npm run build` / `npm run dev:agent` write fixtures + index. Play Motion dropdown loads that index. `studio:fixtures` is an alias, not a required extra step.
- [x] Templates each lock a recommended style; Play Motion dropdown lists classic-nine, cluster-hex, sticky-five, anticipation-five.
- [x] Art brief: `npm run studio -- art-brief <template>` — missing symbols + role guidance; motion not blocked on art.
- [x] Classic-nine path: reel blur/stop via Preview `createPreviewReelSpinTrack` + `getReelStopSchedule` (no wager, no setWin).
- [x] Sticky / anticipation templates: fixtures + Play Motion parity (reel path + local sticky morph / anticipation hold).

### P3 — Cleanup

- [x] Remove dead overlay CSS/IDs if any remain (no Play Motion cabinet HTML grid left).
- [x] Trim MotionCueHost comments that claim TumbleChoreography is wired when it is not.
- [ ] Optional: merge `integrate/studio-motion` → `main` after P0 smoke pass.
- [x] Large binary assets: keep out of motion-only PRs.

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

### One command that matters

```bash
cd ~/Developer/superslotstudio
npm run dev:agent          # build + write fixtures + http://127.0.0.1:3001/
```

### Domain (repo root)

```bash
cd ~/Developer/superslotstudio
npm test
npm run studio -- templates
npm run studio -- art-brief cluster-hex
```

### Studio (if already in the runtime folder)

```bash
cd ~/Developer/superslotstudio/runtime/stake-studio-source
npm run dev:agent          # 3001, live reload; syncs fixtures if dist/ exists
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
5. After completion, board restores to the pre-rehearsal occupancy so Play Motion is repeatable.
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

1. Smoke is done for the four templates (2026-08-19).
2. Art loop in parallel: copy the **board** brief, not the recipe, then commission missing roles.
3. Optional: merge `integrate/studio-motion` → `main` after a `git pull` on 3001.
4. If pixels are wrong, inspect `playStakeTumble` / reel tracks — do not revive ad-hoc WAAPI.

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

**Play Motion: ways (Morpheus / Waylanders) → seed 3-kind L→R → playStakeTumble. Cluster → seed 2×2 → tumble. Reel templates → spin tracks. Do not invent a second animator. Art swap is the ship path.**
