# Motion / Play Motion — Full Handoff

**Date:** 2026-08-20  
**Branch:** `integrate/studio-motion`  
**HEAD:** see latest commit on this branch — *board art brief + portable waiting-reel + 4-scatter.*  
**Repo:** https://github.com/iamendless777/superslotstudio  
**Local path:** `~/Developer/superslotstudio`  
**Goal:** Ship many Stake.com games quickly (target ~2 days each). Motion + templates stay reliable so the bottleneck is **art**, not fighting the studio.

This is the single handoff for a new chat. Read this before touching reel spin or scatter tease.

**GitHub is source of truth.** Do not ask the human to apply patch files. Pull `integrate/studio-motion`, edit, commit, push.

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

## Current truth (2026-08-20)

Work is **live-play pixels** on Morpheus (Waylanders Forge clone, new art). Play Motion is the rehearsal harness. Live SPIN is the product.

**2-scatter, 3-scatter, 4-scatter, and 5-scatter teasers are video-confirmed.** Waiting-reel gaps ~**1390ms**. Live SPIN with two early scatters uses the same schedule. Portable `game-app.js` now accrues the same waiting-reel hold (not last-reel-only). Do not reopen that mechanic unless pixels regress.

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

Prefer the book’s `anticipation[]` if it has any truthy flags (`waitingReelsFromAnticipation`). Else derive from the board (`waitingReelsFromBoard` + `scatterThresholds`).

`compileSpinBook` now fills `reveal.anticipation` via `anticipationFromBoard` (same one-away rule). Live and Play Motion share `getScatterTeaseSchedule`.

Live Preview can plant two early scatters with **Live 2-scatter** (`MathEngine.applyForcedScatterLayout` / `resolveRound({ forceScatterCount: 2 })`). That is a real paid book, not Play Motion. Unforced random 2-scatter uses the same flags.

2-scatter seed → waiting flags `[false, false, true, true, true, true]`. Waiting stop gaps ~**1390ms** (1200 hold + stagger). Unit test: “waiting reels share one hold for every scatter threshold.”

### Play Motion dropdown (3001)

| Option | Path | Status |
|--------|------|--------|
| cluster-hex | ways: seed 3-kind L→R → `playStakeTumble` | works |
| classic-nine | reel spin tracks, no wager | works |
| sticky-five | reel path + sticky pulse | works |
| anticipation-five | older last-reel-hold fixture (planner template) | not the product tease |
| **2-scatter tease** | seed 2 doors on reels 1–2; reels 3–6 each hold the same beat | **video-confirmed 2026-08-20** |
| **3-scatter tease** | seed 3; reel 3 holds then lands the third door; leftover wait for 4+ | **video-confirmed 2026-08-20** |
| **4-scatter tease** | seed 4; leftover wait for 5+ | **video-confirmed 2026-08-20** |
| **5-scatter tease** | seed 5; last reel waits for 6 | **video-confirmed 2026-08-20** |
| **Live 2-scatter** | paid SPIN; `forceScatterCount: 2` through `resolveRound` | **same schedule confirmed 2026-08-20** |

`populateMotionTemplates` **merges** studio-only scatter-tease 2/3/4/5 after planner `cues --all` rewrites `index.json`. Do not add scatter-tease to `src/studio/templates.ts` unless you also update `studio-motion-fixture.test.ts`.

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

Planner templates are still: classic-nine, cluster-hex, sticky-five, anticipation-five. Scatter-tease fixtures live only in studio `public/motion-fixtures/` (not in `src/studio/templates.ts`).

### Studio runtime (`runtime/stake-studio-source/`)

| Piece | Role |
|--------|------|
| `PreviewPanel.js` | Live SPIN, `playStakeTumble`, spin tracks, waiting-reel schedule |
| `PreviewPanelMotion.js` | Motion dropdown + Play Motion (tumble **or** reel rehearsal); merges scatter-tease into the dropdown |
| `PresentationDirector.js` | `getReelStopSchedule` (QA last-reel) + `getScatterTeaseSchedule` + `waitingReelsFromBoard` |
| `StakeRoundBook.js` | `compileSpinBook` + `anticipationFromBoard` |
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
anticipationFromBoard(board, { scatterSymbols, thresholds }) // book fill
```

Unit tests:

- `runtime/stake-studio-source/test/presentation-director.test.mjs` — waiting reels share one hold
- `runtime/stake-studio-source/test/stake-round-book.test.mjs` — `reveal.anticipation` one-away flags
- `runtime/stake-studio-source/test/forced-scatter-tease.test.mjs` — live `forceScatterCount` 2/3/5 matches Play Motion flags

---

## 3. What was broken / still watch

### Fixed (video-verified)

- SPIN stuck behind leftover presentation / tile glows
- Glow loading 1–3s after the tile (unlock was tied to glow, not land)
- Empty grid flash on tumble refill
- Pay light turning off before explode
- Scatter tease: empty last reel, ghost blur, yank, fake scatter density
- GSAP travel pages (empty pockets) — reverted to Stake CSS loop
- Last-reel-only then half-hold middle reels — replaced by waiting-reel rule
- Play Motion dropdown losing scatter-tease after planner `index.json` rebuild
- `compileSpinBook` emitting empty `anticipation: []`

### Still watch

- **Portable `game-app.js`** uses `waitingReelsFromReveal` + accrued holds (same rule as Preview). Boolean `true` still last-reel-only for old books. Do not invent a second animator.
- Incoming rehearsal symbols are still filled from surviving board art (not a certified math book). Occupancy is real; the round is not certified.
- `anticipation-five` planner fixture is the old last-reel demo. Product tease is scatter-tease 2/3/4/5.
- Ways games seed a L→R **3-of-a-kind**. Cluster templates still seed a 2×2.
- `preview-motion-polish.test.mjs` may still have unrelated tumble/connection failures. Do not “fix” those by weakening the spin-track CSS contract.
- 3-scatter Play Motion can flash the Veil Ascent feature plate (3 doors is feature entry). Ordinary 0–2 scatter spins must stay plaque-free.

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

- [x] **Video-confirm 2-scatter tease** (HEAD `a1ee81c` / mechanic from `8ce256b`). Four equal holds on reels 3–6. Human confirmed 2026-08-20.
- [x] Fill `compileSpinBook` `anticipation[]` from the board (`anticipationFromBoard`).
- [x] Keep scatter-tease 2/3/4/5 in Play Motion after planner `index.json` rebuilds (`mergeMotionTemplateIndex`).
- [x] Video-confirm **3-scatter** and **5-scatter** teasers (3 continues waiting for 4; 5 holds last reel for 6). Gaps ~1390ms.
- [x] Live SPIN 2-scatter uses the same schedule (`forceScatterCount: 2` through `resolveRound` / Live 2-scatter). Unforced books share `reveal.anticipation`.
- [x] Video-confirm **4-scatter** tease (same sequential hold; leftover waits for 5+).
- [x] Atlas + Preview copy the **board** art brief (not cluster-hex Ruby/Sapphire). Ways games commission those slots.
- [x] Portable `game-app.js` waiting-reel schedule matches Preview (`waitingReelsFromReveal`, accrued `anticipationHoldMs`).
- [ ] If 1.2s/waiting-reel feels short or long, change **one** number: `anticipationHoldMs`. Do not special-case the last reel.
- [ ] Commission Morpheus **board** art from Atlas → Copy board brief. Swap tiles; keep motion.

### P3 — Cleanup

- [ ] Optional: merge `integrate/studio-motion` → `main` after remaining P2 video pass.
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
runtime/stake-studio-source/src/engines/math/StakeRoundBook.js
runtime/stake-studio-source/src/engines/math/MathEngine.js
runtime/stake-studio-source/src/engines/presentation/cueSheetToTumbleEvents.js
runtime/stake-studio-source/src/engines/presentation/playMotionTemplate.js
runtime/stake-studio-source/public/motion-fixtures/scatter-tease.json
runtime/stake-studio-source/public/motion-fixtures/scatter-tease-3.json
runtime/stake-studio-source/public/motion-fixtures/scatter-tease-4.json
runtime/stake-studio-source/public/motion-fixtures/scatter-tease-5.json

# Art
runtime/stake-studio-source/src/engines/assets/BoardArtBrief.js
runtime/stake-studio-source/src/editor/atlas/AtlasPanel.js

# CSS contract
runtime/stake-studio-source/src/styles.css          ← .preview-reel-spin-track

# Tests
runtime/stake-studio-source/test/presentation-director.test.mjs
runtime/stake-studio-source/test/stake-round-book.test.mjs
runtime/stake-studio-source/test/forced-scatter-tease.test.mjs
runtime/stake-studio-source/test/board-art-brief.test.mjs
runtime/stake-studio-source/test/preview-motion-polish.test.mjs
runtime/stake-studio-source/src/engines/presentation/cueSheetToTumbleEvents.test.js

# Stake reference
runtime/stake-studio-source/server/frontend-template/game-app.js
```

---

## 7. Commands cheat sheet

```bash
cd ~/Developer/superslotstudio
git pull origin integrate/studio-motion
npm run dev:agent          # build + fixtures + http://127.0.0.1:3001/
```

```bash
node --test runtime/stake-studio-source/src/engines/presentation/cueSheetToTumbleEvents.test.js
node --test runtime/stake-studio-source/test/presentation-director.test.mjs
node --test runtime/stake-studio-source/test/board-art-brief.test.mjs
node --test runtime/stake-studio-source/test/forced-scatter-tease.test.mjs
node --test runtime/stake-studio-source/test/stake-round-book.test.mjs
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

### 2-scatter tease (confirmed)

1. Status `Seed 2 scatters` → `Reels spinning` → `Tease · waiting for scatter 3` on each leftover reel.
2. Reels 1–2 land two Gate of Sleep doors. Reels 3, 4, 5, **and** 6 each keep spinning, then land, one after another, **same hold**.
3. Landing tiles are the real result. No fake doors in the blur.
4. Board restores so Play Motion is repeatable.

### 3-scatter tease (confirmed)

Same hold. Reels 1–2 land two doors quickly. Reel 3 holds, then lands the third door. Reels 4–6 keep the same beat, waiting for 4+.

### 4-scatter tease (confirmed)

Same hold. Reels 1–4 land doors. Reels 5–6 keep the beat, waiting for 5+.

### 5-scatter tease (confirmed)

Same hold. Reels 1–5 land doors (3/4/5 each after a wait). Reel 6 holds for 6 and does **not** get a planted door.

### Live SPIN with 2+ scatters before the last reel

Same schedule as Play Motion. **Live 2-scatter** is a paid `resolveRound` with `forceScatterCount: 2` — not a wager-free rehearsal. Landing tiles are the real book; a ways win may tumble after the tease.

---

## 9. Safety rules

Never map during Play Motion / cue rehearsal:

- `board.shake` → `wincap` / max-win UI
- `win.pulse` → `setWin` / full-screen payout

`executePresentation` for Play Motion stays a **no-op** unless a future flag explicitly enables director recipes.

Do not mix 3000 and 3001. Do not commit 50MB art in a motion PR.

---

## 10. Next session (paste this into the new chat)

Continue Stake Studio from `integrate/studio-motion` (pull first). Read `MOTION_PLAY_HANDOFF.md`. GitHub is source of truth — pull, commit, push. Do not ask for patch files.

1. `git pull origin integrate/studio-motion`. Hard-refresh 3001.
2. **2/3/4/5-scatter Play Motion and live 2-scatter are video-confirmed.** Portable frontend uses the same waiting-reel hold. Do not reopen unless pixels regress.
3. If hold length is wrong, change `anticipationHoldMs` only.
4. Do not revive GSAP travel, fake scatters, last-reel-only, or an HTML overlay grid.
5. Art: Atlas → **Copy board brief**. Commission those slots. Do not use cluster-hex gems for a ways board.
6. Optional: merge `integrate/studio-motion` → `main`.

---

## 11. Branch / PR notes

- Active branch: **`integrate/studio-motion`**
- Related historical: `motion/multi-style-foundation`, `agent/recover-game-source`
- Prefer small commits on motion wiring; no 50MB art blobs
- Remote: `https://github.com/iamendless777/superslotstudio.git` (`iamendless777`)
- Push from the agent with GitHub connected. Do not leave work only in a sandbox.

Recent commits (newest first):

```
this commit  Copy board art brief; portable waiting-reel; confirm 4-scatter.
d7bb42b Confirm 3/5-scatter Play Motion and live 2-scatter.
bd89fab Update motion handoff after confirmed 2-scatter tease.
a1ee81c Fill reveal.anticipation from waiting-reel schedule.
4d8f8b1 Update motion handoff to waiting-reel tease (8ce256b).
8ce256b Tease every reel that is one scatter away.
b47d871 Hold leftover reels after two scatters, last reel longest.   ← superseded
0273958 Give the last reel time to tease.                          ← superseded
```

`b47d871` / `0273958` last-reel and half-hold behavior is **replaced** by `8ce256b` + `a1ee81c`. Do not restore it.

---

## 12. Non-goals (for now)

- Rebuilding Morpheus art or math from scratch
- New HTML overlay “motion preview grid”
- Three.js / minimax — noise for this ship loop
- Perfect VFX polish before art ships
- Blocking art on motion perfection

---

## 13. One-line summary for the next agent

**4-scatter confirmed. Atlas copies the board art brief (not cluster-hex). Portable frontend now accrues the same waiting-reel hold. Next: hold-length feel (`anticipationHoldMs`) and commission Morpheus board art. Same Stake CSS tracks + playStakeTumble. Do not invent a second animator.**
