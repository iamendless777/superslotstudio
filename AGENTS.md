# Stake Studio

This file is the standing contract. Every chat reads it first.

Games change. The studio does not. Do not carry a game name from memory into the next chat. Read the open project from the live studio.

---

## TAG: STUDIO

**Stake Studio** is the product. It is the factory.

- Job: produce Stake.com slot games in about 2 days.
- It stays. New games are made *in* it. They are not it.
- Chrome is the factory: Cabinet, Game Config, Reel Strips, Simulate, Preview, Audio, Atlas, FX Lab, Spine, Quality, Build, New Game, Save, Load.
- You build the studio that builds the games. You do not build a game the way you build a studio.

## TAG: GAME

**The open project** is the game being made *with* the studio right now.

- Its name is on the studio header and in `inspect_studio` / `get_studio_state` (`openProject`).
- That is the only current game. Not a name from a previous chat. Not a name from this file.
- When that game is done, the human hits **New Game** or **Load**. Then *that* project is the current game.
- The factory will make many games. Never assume the next one is the last one.

## TAG: ENTER

1. Studio source: `~/Developer/superslotstudio`, branch `integrate/studio-motion`.
2. `git pull origin integrate/studio-motion`
3. Start the studio (leave this running): `npm run dev:agent`
4. Open the studio window: `http://127.0.0.1:3001/`
5. Ask the studio who it is, in this order:
   - `inspect_studio`
   - `get_studio_state` (compact; `detail=full` only if asked)
   - `capture_studio_view` if you need pixels
6. Believe those answers. The header chip is the current game. The menus are the factory.

## TAG: CHROME

Never hide Cabinet / Config / nav / New / Load. Never skin the studio as a player.

If the human cannot see the slot, open the **Preview** panel. Do not delete the editor.

## TAG: TELEMETRY

Spin traces, HUD dumps, and effect orchestration belong to the **open game**. They are not the factory. Do not treat the largest JSON blob as the product.

## TAG: WORK ORDER

1. **Game work** — change the open project using studio panels (Cabinet, Config, Strips, Atlas, Preview, Build). If the studio can do it, do it there.
2. **Studio work** — only when a game task hits a missing or broken factory capability. Fix the studio. Then go back to the open game.

Read `docs/THE_LOOP.md` for the production loop. Dated motion notes live in `MOTION_PLAY_HANDOFF.md` — confirm the open project before following them.
