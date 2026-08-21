# Stake Studio

This file is the standing contract. Every chat reads it first.

Games change. The studio does not. Do not carry a game name from memory into the next chat. Read the open project from the live studio.

---

## TAG: STUDIO

**Stake Studio** is the product. It is the factory. It is an app you open. Models plug in. They do not get their own copy.

- Job: produce Stake.com slot games in about 2 days.
- It stays. New games are made *in* it. They are not it.
- Chrome is the factory: Cabinet, Game Config, Reel Strips, Simulate, Preview, Audio, Atlas, FX Lab, Spine, Quality, Build, New Game, Save, Load.
- Math publish, frontend compile, and validate use the **same studio home** as the live window (`resolveStudioHome`). If file tools say there are no projects while a game is on screen, the helper is looking in the wrong folder — that is a studio bug, not a missing game.

## TAG: GAME

**The open project** is the game being made *with* the studio right now.

- Its name is on the studio header and in `inspect_studio` / `get_studio_state` (`openProject`).
- That is the only current game. Not a name from a previous chat. Not a name from this file.
- When that game is done, the human hits **New Game** or **Load**. Then *that* project is the current game.
- The factory will make many games. Never assume the next one is the last one.

## TAG: ENTER

Stake Studio is an app. Open it once. Then plug a model in (Grok, ChatGPT, Claude, Gemini — same door).

1. Studio source: `~/Developer/superslotstudio`, branch `integrate/studio-motion`.
2. `git pull origin integrate/studio-motion`
3. Start the app once (leave it running): `npm run dev`
4. Open the window it prints. Default is `http://127.0.0.1:3000/`. If that address is already up, use it — do not start a second copy.
5. MCP finds that live window. It does not get its own port.
6. Ask the studio who it is, in this order:
   - `inspect_studio`
   - `get_studio_state` (compact; `detail=full` only if asked)
   - `capture_studio_view` if you need pixels
7. Believe those answers. The header chip is the current game. The menus are the factory.

If two studio windows are open, close the extras. Keep one app. Plug models into that.

## TAG: CHROME

Never hide Cabinet / Config / nav / New / Load. Never skin the studio as a player.

If the human cannot see the slot, open the **Preview** panel. Do not delete the editor.

## TAG: TELEMETRY

Spin traces, HUD dumps, and effect orchestration belong to the **open game**. They are not the factory. Do not treat the largest JSON blob as the product.

## TAG: WORK ORDER

1. **Game work** — change the open project using studio panels (Cabinet, Config, Strips, Atlas, Preview, Build). If the studio can do it, do it there.
2. **Studio work** — only when a game task hits a missing or broken factory capability. Fix the studio. Then go back to the open game.

Read `docs/THE_LOOP.md` for the production loop. Dated motion notes live in `MOTION_PLAY_HANDOFF.md` — confirm the open project before following them.
