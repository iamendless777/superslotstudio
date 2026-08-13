import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  createWizardCraftHttpGameSession,
  createWizardCraftHttpReplaySession,
  getWizardCraftRuntimeInformation,
  getWizardCraftRuntimePolicy,
  InvalidGameEventError,
  InvalidReplayConfigurationError,
  parseWizardCraftRgsState,
  planWizardCraftRgsCue,
  projectWizardCraftRgsRuntime,
  WizardCraftLayeredPresenter,
  WizardCraftPresentationController,
  WizardCraftReplayController,
  WIZARD_CRAFT_OFFICIAL_EVENT_TYPES,
  WIZARD_CRAFT_PRESENTED_EVENT_TYPES,
} from "../src/index.js";
import { rgsAmount } from "../src/domain/money.js";
import type { RecoveryState } from "../src/recovery/machine.js";
import type { JurisdictionFlags } from "../src/domain/rgs.js";
import type { WizardCraftRgsEvent } from "../src/games/wizard-craft/official.js";
import { balance, config, jurisdiction } from "./fixtures.js";

const replayDirectory = resolve("demo/wizard-craft/replays");
const replayNames = readdirSync(replayDirectory)
  .filter((name) => name.endsWith(".json") && name !== "catalog.json")
  .sort();

function replay(name: string): {
  payoutMultiplier: number;
  events: Array<Record<string, unknown>>;
} {
  return JSON.parse(
    readFileSync(resolve(replayDirectory, name), "utf8"),
  ) as {
    payoutMultiplier: number;
    events: Array<Record<string, unknown>>;
  };
}

test("validates every selected flattened official WIZARD CRAFT book", () => {
  assert.equal(replayNames.length, 10);
  for (const name of replayNames) {
    const book = replay(name);
    const events = parseWizardCraftRgsState(book.events);
    assert.equal(events.length, book.events.length, name);
    assert.equal(events.at(-1)?.type, "finalWin", name);
  }
});

test("rejects malformed official event identity and board shape", () => {
  const unknown = structuredClone(replay("base-near-miss.json").events);
  unknown[0]!.type = "inventedOutcome";
  assert.throws(() => parseWizardCraftRgsState(unknown), InvalidGameEventError);

  const gap = structuredClone(replay("base-near-miss.json").events);
  gap[1]!.index = 9;
  assert.throws(() => parseWizardCraftRgsState(gap), /contiguous index 1/);

  const board = structuredClone(replay("base-near-miss.json").events);
  (board[0]!.board as unknown[]).pop();
  assert.throws(() => parseWizardCraftRgsState(board), /five reels/);
});

test("rejects mechanic contradictions in flattened official books", () => {
  const tierOne = structuredClone(replay("rune-tier-one.json").events);
  const expansion = tierOne.find((event) => event.type === "expandVsReel");
  assert.ok(expansion);
  expansion.persistence = "sticky";
  assert.throws(
    () => parseWizardCraftRgsState(tierOne),
    /sticky only in Tier II or Tier III/,
  );

  const multiplied = structuredClone(replay("base-tier-three.json").events);
  const winInfo = multiplied.find((event) =>
    event.type === "winInfo" &&
    (event.wins as Array<Record<string, unknown>>).some((win) => {
      const meta = win.meta as Record<string, unknown>;
      return (meta.contributingVsReels as unknown[]).length > 0;
    }));
  assert.ok(winInfo);
  const affected = (winInfo.wins as Array<Record<string, unknown>>)
    .find((win) => {
      const meta = win.meta as Record<string, unknown>;
      return (meta.contributingVsReels as unknown[]).length > 0;
    });
  assert.ok(affected);
  (affected.meta as Record<string, unknown>).globalMult = 999;
  assert.throws(
    () => parseWizardCraftRgsState(multiplied),
    /additive contributing multiplier/,
  );

  const final = structuredClone(replay("base-near-miss.json").events);
  final.at(-1)!.amount = 100;
  assert.throws(() => parseWizardCraftRgsState(final), /finalWin matching running total/);
});

test("WIZARD CRAFT HTTP composition fails closed on malformed round state", async () => {
  const malformed = structuredClone(replay("base-near-miss.json").events);
  malformed[0]!.type = "inventedOutcome";
  const session = createWizardCraftHttpGameSession(
    "https://game.example/?sessionID=s&lang=en&rgs_url=rgs.example",
    {
      fetch: async () => new Response(JSON.stringify({
        balance,
        config: { ...config, jurisdiction },
        round: {
          betID: 9,
          amount: 1_000_000,
          payout: 0,
          payoutMultiplier: 0,
          active: true,
          mode: "baseBattle",
          event: "0",
          state: malformed,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    },
  );

  await session.start();
  assert.equal(session.state.value, "failed-closed");
  if (session.state.value === "failed-closed") {
    assert.equal(session.state.failure.kind, "invalid-response");
    assert.match(session.state.failure.message, /response.round.state/);
  }
});

test("rejects unsupported requested modes and mismatched returned modes", async () => {
  const session = createWizardCraftHttpGameSession(
    "https://game.example/?sessionID=s&lang=en&rgs_url=rgs.example",
    {
      fetch: async () => new Response(JSON.stringify({
        balance,
        config: { ...config, jurisdiction },
        round: null,
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    },
  );
  await session.start();
  await assert.rejects(
    session.placeBet({
      amount: rgsAmount(1_000_000),
      mode: "inventedMode",
    } as never),
    /Unsupported WIZARD CRAFT mode/,
  );

  const events = replay("base-near-miss.json").events;
  const mismatched = createWizardCraftHttpGameSession(
    "https://game.example/?sessionID=s&lang=en&rgs_url=rgs.example",
    {
      fetch: async () => new Response(JSON.stringify({
        balance,
        config: { ...config, jurisdiction },
        round: {
          betID: 10,
          amount: 1_000_000,
          payout: 0,
          payoutMultiplier: 0,
          active: true,
          mode: "runeSpark",
          event: "0",
          state: events,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    },
  );
  await mismatched.start();
  assert.equal(mismatched.state.value, "failed-closed");
});

function activeState(
  events: readonly WizardCraftRgsEvent[],
  event: string | null,
  flags: JurisdictionFlags = jurisdiction,
): RecoveryState<readonly WizardCraftRgsEvent[]> {
  return {
    value: "active",
    resumed: event !== null,
    session: { balance, config, jurisdiction: flags },
    round: {
      id: 22,
      amount: rgsAmount(1_000_000),
      payout: rgsAmount(0),
      payoutMultiplier: 0,
      active: true,
      mode: "baseBattle",
      event,
      state: events,
    },
  };
}

test("presents from the official current-event checkpoint and then settles", async () => {
  const events = parseWizardCraftRgsState(replay("base-near-miss.json").events);
  const checkpoints: string[] = [];
  let completed = 0;
  const boundary = {
    state: activeState(events, "1"),
    checkpoint: async (value: string) => { checkpoints.push(value); },
    completePresentation: async () => { completed += 1; },
  };
  const controller = new WizardCraftPresentationController(boundary);
  const presented: number[] = [];
  await controller.presentActiveRound((event) => { presented.push(event.index); });

  assert.deepEqual(presented, [1, 2]);
  assert.deepEqual(checkpoints, ["1", "2"]);
  assert.equal(completed, 1);
});

test("derives WIZARD CRAFT controls and information from jurisdiction flags", () => {
  const restricted: JurisdictionFlags = {
    ...jurisdiction,
    socialCasino: true,
    disabledFullscreen: true,
    disabledTurbo: true,
    disabledSuperTurbo: false,
    disabledAutoplay: true,
    disabledSlamstop: true,
    disabledSpacebar: true,
    disabledBuyFeature: true,
    displayNetPosition: true,
    displayRTP: false,
    displaySessionTimer: true,
    minimumRoundDuration: 3_000,
  };
  const policy = getWizardCraftRuntimePolicy(restricted);
  assert.deepEqual(policy.availableSpeeds, ["normal", "superTurbo"]);
  assert.equal(policy.fullscreen, false);
  assert.equal(policy.autoplay, false);
  assert.equal(policy.slamStop, false);
  assert.equal(policy.spacebar, false);
  assert.equal(policy.openGrimoire, false);
  assert.equal(policy.minimumRoundDuration, 3_000);
  const information = getWizardCraftRuntimeInformation(restricted);
  assert.equal(information.locale, "sweeps_en");
  assert.ok(information.modes.every((mode) => mode.rtp === null));
});

test("blocks Open the Grimoire when feature purchase is jurisdiction-disabled", async () => {
  const restricted = { ...jurisdiction, disabledBuyFeature: true };
  const session = createWizardCraftHttpGameSession(
    "https://game.example/?sessionID=s&lang=en&rgs_url=rgs.example",
    {
      fetch: async () => new Response(JSON.stringify({
        balance,
        config: { ...config, jurisdiction: restricted },
        round: null,
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    },
  );
  await session.start();
  assert.equal(session.policy?.openGrimoire, false);
  await assert.rejects(
    session.placeBet({
      amount: rgsAmount(1_000_000),
      mode: "openGrimoire",
    }),
    /disabled by jurisdiction/,
  );
});

test("honors minimum round duration before completing a new round", async () => {
  const events = parseWizardCraftRgsState(replay("base-near-miss.json").events);
  const waits: number[] = [];
  let now = 1_000;
  let completed = 0;
  const controller = new WizardCraftPresentationController(
    {
      state: activeState(events, null, {
        ...jurisdiction,
        minimumRoundDuration: 3_000,
      }),
      checkpoint: async () => { now += 200; },
      completePresentation: async () => { completed += 1; },
    },
    {
      now: () => now,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
      },
    },
  );

  await controller.presentActiveRound(() => undefined);
  assert.deepEqual(waits, [2_400]);
  assert.equal(completed, 1);
});

test("does not restart minimum-round timing for a resumed round", async () => {
  const events = parseWizardCraftRgsState(replay("base-near-miss.json").events);
  const waits: number[] = [];
  const controller = new WizardCraftPresentationController(
    {
      state: activeState(events, "1", {
        ...jurisdiction,
        minimumRoundDuration: 3_000,
      }),
      checkpoint: async () => undefined,
      completePresentation: async () => undefined,
    },
    {
      now: () => 0,
      sleep: async (milliseconds) => { waits.push(milliseconds); },
    },
  );
  await controller.presentActiveRound(() => undefined);
  assert.deepEqual(waits, []);
});

test("does not checkpoint or settle a presentation event that throws", async () => {
  const events = parseWizardCraftRgsState(replay("base-near-miss.json").events);
  const checkpoints: string[] = [];
  let completed = 0;
  const controller = new WizardCraftPresentationController({
    state: activeState(events, "1"),
    checkpoint: async (value: string) => { checkpoints.push(value); },
    completePresentation: async () => { completed += 1; },
  });

  await assert.rejects(
    controller.presentActiveRound(() => {
      throw new Error("renderer failed");
    }),
    /renderer failed/,
  );
  assert.deepEqual(checkpoints, []);
  assert.equal(completed, 0);
});

const wizardReplayUrl =
  "https://game.example/?replay=true&game=wizard_craft&version=0.1.0&mode=baseBattle&event=5&rgs_url=https%3A%2F%2Frgs.example&currency=usd&amount=1&lang=en&device=desktop&social=false";

test("composes a strict public WIZARD CRAFT replay without wallet access", async () => {
  const requests: string[] = [];
  const book = replay("base-near-miss.json");
  const session = createWizardCraftHttpReplaySession(wizardReplayUrl, {
    allowedRgsOrigins: ["https://rgs.example"],
    fetch: async (input, init) => {
      requests.push(`${init?.method} ${String(input)}`);
      return new Response(JSON.stringify({
        payoutMultiplier: book.payoutMultiplier / 100,
        costMultiplier: 1,
        state: book.events,
      }));
    },
  });

  assert.equal("placeBet" in session, false);
  assert.equal(requests.length, 0);
  await session.load();
  assert.equal(session.state.value, "ready");
  assert.deepEqual(requests, [
    "GET https://rgs.example/bet/replay/wizard_craft/0.1.0/baseBattle/5",
  ]);

  const presented: number[] = [];
  const controller = new WizardCraftReplayController(session);
  await controller.present((event) => { presented.push(event.index); });
  assert.deepEqual(presented, [0, 1, 2]);
  assert.equal(session.state.value, "complete");

  presented.length = 0;
  await controller.present((event) => { presented.push(event.index); });
  assert.deepEqual(presented, [0, 1, 2]);
  assert.equal(requests.length, 1);
});

test("uses the platform replay version and rejects wrong game, mode, and cost", async () => {
  let calls = 0;
  for (const url of [
    wizardReplayUrl.replace("game=wizard_craft", "game=other"),
    wizardReplayUrl.replace("mode=baseBattle", "mode=invented"),
  ]) {
    assert.throws(
      () => createWizardCraftHttpReplaySession(url, {
        fetch: async () => {
          calls += 1;
          return new Response();
        },
      }),
      InvalidReplayConfigurationError,
    );
  }
  assert.equal(calls, 0);

  const versioned = createWizardCraftHttpReplaySession(
    wizardReplayUrl.replace("version=0.1.0", "version=9.9.9"),
    {
      fetch: async (input) => {
        calls += 1;
        assert.match(String(input), /wizard_craft\/9\.9\.9\/baseBattle\/5$/);
        const book = replay("base-near-miss.json");
        return new Response(JSON.stringify({
          payoutMultiplier: book.payoutMultiplier / 100,
          costMultiplier: 1,
          state: book.events,
        }));
      },
    },
  );
  await versioned.load();
  assert.equal(versioned.state.value, "ready");
  assert.equal(calls, 1);

  const book = replay("base-near-miss.json");
  const wrongCost = createWizardCraftHttpReplaySession(wizardReplayUrl, {
    fetch: async () => new Response(JSON.stringify({
      payoutMultiplier: 0,
      costMultiplier: 3,
      state: book.events,
    })),
  });
  await wrongCost.load();
  assert.equal(wrongCost.state.value, "failed");

  const wrongModeEvents = structuredClone(book.events);
  wrongModeEvents[0]!.mode = "runeSpark";
  const wrongMode = createWizardCraftHttpReplaySession(wizardReplayUrl, {
    fetch: async () => new Response(JSON.stringify({
      payoutMultiplier: 0,
      costMultiplier: 1,
      state: wrongModeEvents,
    })),
  });
  await wrongMode.load();
  assert.equal(wrongMode.state.value, "failed");
});

test("maps every official replay event to a production cue and runtime state", () => {
  assert.deepEqual(
    [...WIZARD_CRAFT_PRESENTED_EVENT_TYPES].sort(),
    [...WIZARD_CRAFT_OFFICIAL_EVENT_TYPES].sort(),
  );
  const replayEventTypes = new Set<string>();
  for (const name of replayNames) {
    const book = replay(name);
    const events = parseWizardCraftRgsState(book.events);
    for (const event of events) {
      replayEventTypes.add(event.type);
      const normal = planWizardCraftRgsCue(event, "normal");
      const fast = planWizardCraftRgsCue(event, "fast");
      const reduced = planWizardCraftRgsCue(event, "reducedMotion");
      assert.equal(normal.eventIndex, event.index, name);
      assert.ok(normal.beats.length > 0, `${name} ${event.type}`);
      assert.ok(fast.durationMs >= 90, `${name} ${event.type}`);
      assert.ok(reduced.beats.every((beat) => beat.motion === "none"));
    }
    const state = projectWizardCraftRgsRuntime(events, events.length);
    assert.equal(state.nextEventIndex, events.length, name);
    assert.equal(state.finalWin, book.payoutMultiplier, name);
    assert.equal(state.spinVsReels.size, 0, name);
  }
  assert.deepEqual(
    WIZARD_CRAFT_OFFICIAL_EVENT_TYPES.filter((type) =>
      !replayEventTypes.has(type)
    ),
    ["prepareAttack", "blockAttack"],
  );
});

test("builds layered before/after render commands and commits after render", async () => {
  const book = replay("base-tier-three.json");
  const events = parseWizardCraftRgsState(book.events);
  const commands: Array<{
    before: number;
    after: number;
    channels: string[];
  }> = [];
  const presenter = new WizardCraftLayeredPresenter({
    render: async (command) => {
      commands.push({
        before: command.before.nextEventIndex,
        after: command.after.nextEventIndex,
        channels: command.cue.beats.map((beat) => beat.channel),
      });
    },
  });
  for (const event of events) await presenter.present(event);

  assert.equal(commands.length, events.length);
  assert.deepEqual(commands[0], {
    before: 0,
    after: 1,
    channels: ["reels", "cabinet", "dragon", "wizard"],
  });
  assert.equal(presenter.state.finalWin, book.payoutMultiplier);
  assert.ok(presenter.state.stickyVsReels.size >= 1);
  assert.equal(presenter.state.spinVsReels.size, 0);
});

test("does not commit layered state when the renderer fails", async () => {
  const events = parseWizardCraftRgsState(replay("base-near-miss.json").events);
  const presenter = new WizardCraftLayeredPresenter({
    render: async () => {
      throw new Error("GPU context lost");
    },
  });
  await assert.rejects(presenter.present(events[0]!), /GPU context lost/);
  assert.equal(presenter.state.nextEventIndex, 0);
  assert.equal(presenter.state.board, null);
});

test("projects the exact layered state required by a resume checkpoint", () => {
  const events = parseWizardCraftRgsState(replay("base-tier-three.json").events);
  const stickyIndex = events.findIndex((event) =>
    event.type === "expandVsReel" && event.persistence === "sticky");
  assert.ok(stickyIndex >= 0);
  const before = projectWizardCraftRgsRuntime(events, stickyIndex);
  const after = projectWizardCraftRgsRuntime(events, stickyIndex + 1);
  assert.equal(before.stickyVsReels.size, 0);
  assert.equal(after.stickyVsReels.size, 1);
  assert.equal(after.nextEventIndex, stickyIndex + 1);
});
