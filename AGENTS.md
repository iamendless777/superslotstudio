# Stake Studio

**Product = Stake Studio (the factory).** Target: produce Stake.com slot games in about 2 days.

**Morpheus: Dream Fall is a project loaded in the factory**, the first example so we can see the studio work. They are separate. You do not build a game the way you build a studio. You build the studio that builds the games.

## Agent lock

When the live studio is open (agent server, Preview, Morpheus loaded, MCP connected):

1. Chrome stays: Cabinet, Config, Reelstrips, Simulate, Preview, Audio, Atlas, Visual, Spine, Quality, Build, New, Load.
2. If the human cannot see the slot, open the **Preview panel**. Never hide the editor to “just show the game.” Never skin the studio as a Morpheus player.
3. `inspect_studio` then compact `get_studio_state` are the enter path. Proof traces, Dreamfall HUD dumps, and effect orchestration are **project telemetry**, not the mission.
4. `get_studio_state` with `detail=full` is opt-in. Do not treat the largest JSON blob as the product.

Read `docs/THE_LOOP.md` and `MOTION_PLAY_HANDOFF.md` before changing spin or scatter tease.
