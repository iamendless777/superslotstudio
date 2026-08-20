# Motion / Play Motion — Full Handoff

**Date:** 2026-08-20  
**Branch:** `integrate/studio-motion`  
**HEAD:** `8ce256b` — *Tease every reel that is one scatter away.*  
**Repo:** https://github.com/iamendless777/superslotstudio  
**Local path:** `~/Developer/superslotstudio`  
**Goal:** Ship many Stake.com games quickly (target ~2 days each). Motion + templates stay reliable so the bottleneck is **art**, not fighting the studio.

This is the single handoff for a new chat. Read this before touching reel spin or scatter tease.

---

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

Open Preview on **3001**, load Morpheus, hard-refresh after every `git pull`.

Port split: **3000** = ChatGPT/human lane (`npm run dev`). **3001** = agent lane (`npm run dev:agent`). Do not mix them.

After pulling motion/CSS/JS changes: **hard refresh**. Vite live-reload is not enough for spin-track CSS.

```bash
cd ~/Developer/superslotstudio
git pull origin integrate/studio-motion
# then hard-refresh the 3001 tab
```

---

## Current truth (2026-08-20, HEAD 8ce256b)

Work moved from “make Play Motion exist” into **live-play pixels** on Morpheus (Waylanders Forge clone, new art). Play Motion is the rehearsal harness. Live SPIN is the product.

### What a spin looks like now

1. All 6 reels start together. Spin cover is a **filled CSS grid loop** (Stake frontend-template contract): 300% track, `top: -100%`, 3× repeated page, hide **imgs only** (not the cell plates).
2. Reels stop L→R on `getScatterTeaseSchedule` / `getReelStopSchedule`.
3. Landed tiles paint immediately. Pay glow is the tile, not a late overlay.
4. SPIN stays locked until the cascade (if any) finishes. Second SPIN slams remaining reels.
5. Small-win plaques, mode banner, and the door-shaped highlight on the character rig are gone from ordinary spins.

### Scatter anticipation (this is the live mechanic)

Morpheus scatter **count is the feature**, not a 3-scatter binary.

| Count | Mode |
|------:|------|
| 3 | Veil Ascent |
| 4 | Lucid Blessing |
| 5 | Dreamfall |
| 6 | Oneiric Nexus |

**One rule.** As reels land L→R, keep a running scatter count. A still-spinning reel is a **waiting reel** when:

1. Current count is **one away** from the next live threshold (2→3, 3→4, 4→5, 5→6).
2. Leftover reels can still reach that threshold (a reel can hold more than one scatter).

Every waiting reel gets the **same** extra hold (`anticipationHoldMs`, default **1200ms**), applied **sequentially** (accrued). Last reel is not special. Hitting 3 does **not** turn 4/5/6 off.

Prefer the book’s `anticipation[]` if it has any truthy flags. Else derive from the board (`waitingReelsFromBoard` + `scatterThresholds`).

Live and Play Motion share this schedule.

### Play Motion dropdown (3001)

| Option | Path |
|--------|------|
| cluster-hex | ways: seed 3-kind L→R → `playStakeTumble` |
| classic-nine | reel spin tracks, no wager |
| sticky-five | reel path + sticky pulse |
| anticipation-five | older last-reel-hold fixture (planner template) |
| **2-scatter tease** | seed 2 doors on reels 1–2; reels 3–6 each hold the same beat |
| **3-scatter tease** | seed 3; remaining wait for 4+ |
| **4-scatter tease** | seed 4 |
| **5-scatter tease** | seed 5; last reel waits for 6 |

Use **2-scatter tease** first when checking the mechanic. You should see four identical holds, not a dump of reels 3–5 then a long 6.

### Timing (do not invent new numbers unless asked)

- `baseDurationMs` 520, `perReelDelayMs` 120, `perReelDurationMs` 70
- `anticipationHoldMs` **1200** on **each waiting reel**, accrued so gaps stay ~hold
- Live uses project choreography. Rehearsal uses the same hold (the old 2200 last-reel floor is gone)
- QA still uses `getReelStopSchedule(project, true)` = last-reel-only. Do not change that to pass polish QA. Preview/live tease goes through `getScatterTeaseSchedule`.

---

## Do not do (paid for in video)

These were tried, looked worse, and were reverted. Do not revive them.

| Rejected | Why |
|----------|-----|
| HTML overlay grid / second animator | Parallel toy. Cluster path is `playStakeTumble` only. |
| GSAP `y` travel + landing page of true symbols | Empty dark pockets, ghost orbs, last-reel flash. |
| `setSymbolCell` / `.reel-sym` on the spin track | Triggers Pixi flipbooks. Ghost glow, delayed land. |
| Hide entire `.reel-sym` cells while spinning | Empty plates. Hide **imgs only**. |
| Change `--spin-duration` mid-spin | Restarts the CSS animation, jump at the seam. |
| `timeScale` the whole GSAP timeline for “slow-mo” | Stretches stops, yanks settled reels. |
| Fake extra scatters in the blur strip | User: “no need to make fake anything.” Landing tiles are the real board. |
| Last-reel-only hold as the product tease | Misses 3/4/5/6. Only QA `getReelStopSchedule(..., true)` keeps this. |
| Half-hold on middle reels, full on last | Wrong model. Every waiting reel is the same beat. |
| Overlay TOTAL WIN / mode banner on every spin | Ugly. Mode lives in the bonus menu. |
| Door highlight on the character rig | Was meant for the background portal; unreadable. |

**Spin cover contract (Stake frontend-template):** filled 3-page CSS grid, infinite `translateY`, real board underneath, anticipation is **schedule delay** not a second strip. Tests in `preview-motion-polish.test.mjs` lock the CSS.

If pixels go wrong: inspect `createPreviewReelSpinTrack` + `getScatterTeaseSchedule`. Do not invent a travel strip.

---

## 1. Product goal (do not lose this)

1. Style-agnostic motion (not locked to one look).
2. Templates that validate, plan cues, and list art gaps.
3. **Play Motion** and **live SPIN** share pixel authority with a real Stake round.
4. Then: pick art → grade → ship. Motion is not the bottleneck.

Morpheus is a Waylanders Forge clone with new art. Match that game’s *feel* (tumble, 3-kind ways, scatter-count features), not a unique mechanic.

---

## 2. What exists and works

### Domain / TypeScript side (repo root)

| Piece | Role |
|--------|------|
| `src/motion/*` | Style profiles, assess, timeline planner |
| `src/studio/*` | Blueprints, art-brief, templates CLI, stake-runtime-bridge |
| `npm run studio — …` | `assess`, `plan`, `cues`, `templates`, art-gap style flows |
| Tests | `npm test` at repo root — domain suite should stay green |

Planner templates are still: classic-nine, cluster-hex, sticky-five, anticipation-five. Scatter-tease fixtures live only in studio `public/motion-fixtures/` (not in `src/studio/templates.ts`). Do not add them to the planner unless you also update `studio-motion-fixture.test.ts`.

### Studio runtime (`runtime/stake-studio-source/`)

| Piece | Role |
|--------|------|
| `PreviewPanel.js` | Live SPIN, `playStakeTumble`, spin tracks, waiting-reel schedule |
| `PreviewPanelMotion.js` | Motion dropdown + Play Motion (tumble **or** reel rehearsal) |
| `PresentationDirector.js` | `getReelStopSchedule` (QA last-reel) + `getScatterTeaseSchedule` + `waitingReelsFromBoard` |
| `playStakeTumble(board, event)` | **Pixel authority** for cascade |
| `createPreviewReelSpinTrack` | Stake CSS loop (filled, 3× page, imgs hidden) |
| `MotionCueHost.js` | Cue clock fallback (classic-nine if rehearsal adapter misses) |
| `cueSheetToTumbleEvents.js` | Cue sheet → `tumbleBoard` payloads |
| `public/motion-fixtures/*.json` | Rehearsal sheets, including `scatter-tease.json` + `-3/-4/-5` |
| `CUE_BRIDGE` | `win.pulse` / `board.shake` must **not** fire wincap / setWin |
| `npm run dev:agent` | `PORT=3001 STAKE_STUDIO_AGENT=1 STAKE_STUDIO_LIVE_RELOAD=1` |

### Authoritative tumble API

**Preview:** `PreviewPanel.playStakeTumble(board, event)`  
**Portable frontend:** `game-app.js` → `playTumbleBoard(event)`

```js
{
  type: 'tumbleBoard',
  explodingSymbols: [{ reel, row }, ...],
  newSymbols: [[{ name }, ...], ...],  // per reel, prepended at top
}
```

Occupancy: survivors compact, incoming prepended. Row 0 = top.

### Scatter schedule API

```js
waitingReelsFromBoard(board, { isScatter, thresholds })
waitingReelsFromAnticipation(bookReveal.anticipation, reelCount) // null if empty
getScatterTeaseSchedule(project, { reelCount, waiting, holdMs })
scatterThresholds(project) // featureArchitecture.tiers keys, else [3,4,5,6]
```

Unit test: `runtime/stake-studio-source/test/presentation-director.test.mjs`  
(“waiting reels share one hold for every scatter threshold”)

---

## 3. What was broken / still watch

### Fixed this session (video-verified, then iterated)

- SPIN stuck behind leftover presentation / tile glows
- Glow loading 1–3s after the tile (unlock was tied to glow, not land)
- Empty grid flash on tumble refill
- Pay light turning off before explode
- Scatter tease: empty last reel, ghost blur, yank, fake scatter density
- GSAP travel pages (empty pockets) — reverted to Stake CSS loop
- Last-reel-only then half-hold middle reels — replaced by waiting-reel rule

### Still watch

- **2-scatter tease on 3001 after `8ce256b` has not been video-confirmed yet.** First job of the next chat: pull, hard refresh, record 2-scatter tease. Expect four equal holds on reels 3–6, real landing tiles, no empty flash.
- Incoming rehearsal symbols are still filled from surviving board art (not a certified math book). Occupancy is real; the round is not certified.
- Studio `compileSpinBook` now fills `reveal.anticipation` from `anticipationFromBoard` (same one-away rule). `waitingReelsFromAnticipation` prefers the book when flags are truthy.
- `anticipation-five` planner fixture is the old last-reel demo. Product tease is scatter-tease 2/3/4/5.
- Ways games seed a L→R **3-of-a-kind**. Cluster templates still seed a 2×2.
- `preview-motion-polish.test.mjs` may still have unrelated tumble/connection failures. Do not “fix” those by weakening the spin-track CSS contract.

### Overlay era (already rejected)

Full-cabinet HTML grid was correctly removed. **Do not bring it back.**

---

## 4. Target architecture

```text
Live SPIN / Play Motion reel
    → waiting flags (book anticipation[] or waitingReelsFromBoard)
    → getScatterTeaseSchedule
    → createPreviewReelSpinTrack (Stake CSS loop)
    → stop L→R; waiting reels accrue the same hold
    → paintReelBoard with the real result column
    → playStakeTumble if the book says so

Cluster Play Motion
    → cueSheetToTumbleEvents
    → playStakeTumble
```

**Not:** CueSheet → querySelector → ad-hoc WAAPI / GSAP travel / fake blur symbols.

Domain TS planner remains source of **template** timing.  
Studio Preview remains **pixel** authority — one tumble, one spin-track.

---

## 5. TODO list

### P0 — Play Motion real (done 2026-08-19)

- [x] Cluster → `playStakeTumble` only
- [x] Classic-nine / sticky / anticipation reel path
- [x] Smoke on Morpheus 6×4
- [x] No HTML overlay grid, no max-win from motion cues

### P1 — Live-play polish (done 2026-08-20)

- [x] Kill small-win plaques / mode banner / rig door highlight on ordinary spins
- [x] SPIN lock = cascade ownership, not glow leftover
- [x] Landed tile + pay light are one
- [x] Solid tumble refill, no empty flash
- [x] Stake CSS spin-track (filled loop, hide imgs)
- [x] Waiting-reel scatter tease for 3/4/5/6
- [x] Play Motion 2/3/4/5-scatter teasers

### P2 — Next chat (do these in order)

- [ ] **Video-confirm `8ce256b` 2-scatter tease.** Four equal holds. If it dumps 3–5 then only 6 hangs, the waiting flags or accrued hold did not load — hard refresh, then inspect `getScatterTeaseSchedule` stops.
- [ ] Video-confirm 3-scatter and 5-scatter teasers (3 continues waiting for 4; 5 holds last reel for 6).
- [ ] Live SPIN: a natural 2-scatter (not only Play Motion) should use the same schedule.
- [ ] If 1.2s/waiting-reel feels short or long, change **one** number: `anticipationHoldMs`. Do not special-case the last reel.
- [x] Optional: fill `compileSpinBook` `anticipation[]` from the board so books match presentation.
- [x] Keep scatter-tease 2/3/4/5 in Play Motion after planner `index.json` rebuilds (`mergeMotionTemplateIndex`).
- [ ] Art loop: Art panel → copy **board** brief. Do not commission cluster-hex as the ways art recipe.

### P3 — Cleanup

- [ ] Optional: merge `integrate/studio-motion` → `main` after P2 video pass.
- [x] Large binary assets: keep out of motion-only PRs.

---

## 6. Key files (agents start here)

```text
MOTION_PLAY_HANDOFF.md                          ← this file

# Domain
src/motion/
src/studio/

# Live + rehearsal pixels
runtime/stake-studio-source/src/editor/preview/PreviewPanel.js
runtime/stake-studio-source/src/editor/preview/PreviewPanelMotion.js
runtime/stake-studio-source/src/engines/presentation/PresentationDirector.js
runtime/stake-studio-source/src/engines/presentation/cueSheetToTumbleEvents.js
runtime/stake-studio-source/src/engines/presentation/playMotionTemplate.js
runtime/stake-studio-source/public/motion-fixtures/scatter-tease.json
runtime/stake-studio-source/public/motion-fixtures/scatter-tease-3.json
runtime/stake-studio-source/public/motion-fixtures/scatter-tease-4.json
runtime/stake-studio-source/public/motion-fixtures/scatter-tease-5.json

# CSS contract
runtime/stake-studio-source/src/styles.css          ← .preview-reel-spin-track

# Tests
runtime/stake-studio-source/test/presentation-director.test.mjs
runtime/stake-studio-source/test/preview-motion-polish.test.mjs
runtime/stake-studio-source/src/engines/presentation/cueSheetToTumbleEvents.test.js

# Stake reference
runtime/stake-studio-source/server/frontend-template/game-app.js
```

---

## 7. Commands cheat sheet

```bash
cd ~/Developer/superslotstudio
npm run dev:agent          # build + fixtures + http://127.0.0.1:3001/
git pull origin integrate/studio-motion
```

```bash
# Adapter unit test (no studio)
node --test runtime/stake-studio-source/src/engines/presentation/cueSheetToTumbleEvents.test.js

# Waiting-reel schedule
node --test runtime/stake-studio-source/test/presentation-director.test.mjs

# Domain
npm test
npm run studio -- templates
npm run studio -- art-brief cluster-hex
```

---

## 8. Play Motion / live expected behavior

### cascade · ways (cluster-hex clock on a ways game)

1. Status `Seed 3-kind` → `Cascade 1 / N` → `Done`.
2. No HTML grid over the cabinet. No MAXIMUM WIN overlay.
3. Three matching tiles on reels 1–3, survivors fall, new tiles enter, restore.

### 2-scatter tease

1. Status `Seed 2 scatters` → `Reels spinning` → `Tease · waiting for scatter 3` on each leftover reel.
2. Reels 1–2 land two Gate of Sleep doors. Reels 3, 4, 5, **and** 6 each keep spinning, then land, one after another, **same hold**.
3. Landing tiles are the real result. No fake doors in the blur.
4. Board restores so Play Motion is repeatable.

### Live SPIN with 2+ scatters before the last reel

Same schedule as Play Motion. No wager-free shortcut — this is the real round.

---

## 9. Safety rules

Never map during Play Motion / cue rehearsal:

- `board.shake` → `wincap` / max-win UI
- `win.pulse` → `setWin` / full-screen payout

`executePresentation` for Play Motion stays a **no-op** unless a future flag explicitly enables director recipes.

Do not mix 3000 and 3001. Do not commit 50MB art in a motion PR.

---

## 10. Next session (paste this into the new chat)

1. `git pull origin integrate/studio-motion` (HEAD should be `8ce256b` or later). Hard-refresh 3001.
2. Play Motion → **2-scatter tease**. Record it. Waiting reels 3–6 must each hold ~1.2s. If they dump, the new schedule is not loaded.
3. Then **3-scatter** and **5-scatter**. Then a live SPIN that happens to 2-scatter.
4. If hold length is wrong, change `anticipationHoldMs` only.
5. Do not revive GSAP travel, fake scatters, last-reel-only, or an HTML overlay grid.
6. Art loop can run in parallel once the tease video looks like one mechanic.

---

## 11. Branch / PR notes

- Active branch: **`integrate/studio-motion`**
- Related historical: `motion/multi-style-foundation`, `agent/recover-game-source`
- Prefer small commits on motion wiring; no 50MB art blobs
- Remote: `https://github.com/iamendless777/superslotstudio.git` (`iamendless777`)

Recent commits (newest first):

```
8ce256b Tease every reel that is one scatter away.
b47d871 Hold leftover reels after two scatters, last reel longest.   ← superseded
0273958 Give the last reel time to tease.                          ← superseded
d016d2b Match Stake reel spin: filled loop, last-reel hold.
e824bd5 Stop covering tumbles with small-win plaques.
```

`b47d871` / `0273958` last-reel and half-hold behavior is **replaced** by `8ce256b`. Do not restore it.

---

## 12. Non-goals (for now)

- Rebuilding Morpheus art or math from scratch
- New HTML overlay “motion preview grid”
- Three.js / minimax — noise for this ship loop
- Perfect VFX polish before the waiting-reel tease is video-confirmed
- Blocking art on motion perfection

---

## 13. One-line summary for the next agent

**Live + Play Motion share Stake CSS spin tracks and playStakeTumble. Scatter tease = every reel that is one-away from 3/4/5/6 gets the same sequential hold. Confirm 8ce256b on 2-scatter tease before changing pixels. Do not invent a second animator.**
