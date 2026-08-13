import assert from "node:assert/strict";
import test from "node:test";

import {
  WizardCraftAudioScheduler,
  WizardCraftProductionRenderer,
  createWizardCraftRuntimeState,
  type WizardCraftAudioBackend,
  type WizardCraftAudioCueId,
  type WizardCraftAudioVoice,
  type WizardCraftCueChannel,
  type WizardCraftCuePlan,
  type WizardCraftRenderCommand,
} from "../src/index.js";

class Voice implements WizardCraftAudioVoice {
  readonly stops: number[] = [];

  stop(fadeMilliseconds: number): void {
    this.stops.push(fadeMilliseconds);
  }
}

class Backend implements WizardCraftAudioBackend {
  readonly plays: Array<{
    cue: WizardCraftAudioCueId;
    channel: WizardCraftCueChannel;
    voice: Voice;
  }> = [];

  play(cue: WizardCraftAudioCueId, channel: WizardCraftCueChannel): Voice {
    const voice = new Voice();
    this.plays.push({ cue, channel, voice });
    return voice;
  }
}

const plan: WizardCraftCuePlan = {
  eventIndex: 0,
  eventType: "expandVsReel",
  durationMs: 1_150,
  beats: [
    {
      id: "dragon.windup",
      channel: "dragon",
      startMs: 0,
      durationMs: 340,
      audio: "dragon.inhale",
      motion: "full",
    },
    {
      id: "dragon.launch",
      channel: "dragon",
      startMs: 300,
      durationMs: 260,
      audio: "dragon.fire.launch",
      motion: "full",
    },
    {
      id: "clash",
      channel: "clash",
      startMs: 500,
      durationMs: 360,
      audio: "clash.impact",
      motion: "full",
    },
  ],
};

test("schedules authored sounds and fades an interrupted channel voice", async () => {
  const backend = new Backend();
  const sleeps: number[] = [];
  const scheduler = new WizardCraftAudioScheduler(backend, {
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });

  await scheduler.present(plan);

  assert.deepEqual(sleeps, [300, 500, 1_150]);
  assert.deepEqual(
    backend.plays.map(({ cue, channel }) => [cue, channel]),
    [
      ["dragon.inhale", "dragon"],
      ["dragon.fire.launch", "dragon"],
      ["clash.impact", "clash"],
    ],
  );
  assert.deepEqual(backend.plays[0]?.voice.stops, [45]);
  assert.deepEqual(scheduler.state.activeChannels, ["dragon", "clash"]);
});

test("mute silences active voices but preserves presentation duration", async () => {
  const backend = new Backend();
  const sleeps: number[] = [];
  const scheduler = new WizardCraftAudioScheduler(backend, {
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });
  await scheduler.present(plan);
  scheduler.setMuted(true);
  await scheduler.present(plan);

  assert.equal(backend.plays.length, 3);
  assert.equal(backend.plays[1]?.voice.stops.length, 1);
  assert.equal(backend.plays[2]?.voice.stops.length, 1);
  assert.equal(sleeps.filter((duration) => duration === 1_150).length, 2);
  assert.equal(scheduler.state.muted, true);
});

test("audio backend failure cannot reject visual presentation", async () => {
  const scheduler = new WizardCraftAudioScheduler({
    play(): WizardCraftAudioVoice {
      throw new Error("missing file");
    },
  }, { sleep: async () => undefined });

  await assert.doesNotReject(() => scheduler.present(plan));
});

test("production renderer waits for both visual and audio boundaries", async () => {
  const order: string[] = [];
  const scheduler = new WizardCraftAudioScheduler(new Backend(), {
    sleep: async () => {
      order.push("audio");
    },
  });
  const renderer = new WizardCraftProductionRenderer({
    async render(): Promise<void> {
      order.push("visual");
    },
  }, scheduler);
  const state = createWizardCraftRuntimeState();
  const command: WizardCraftRenderCommand = {
    event: { index: 0, type: "reveal" },
    before: state,
    after: state,
    cue: { ...plan, beats: [] },
  };

  await renderer.render(command);

  assert.deepEqual(order.sort(), ["audio", "visual"]);
});
