import assert from "node:assert/strict";
import test from "node:test";

import {
  WizardCraftMusicDirector,
  type WizardCraftCuePlan,
  type WizardCraftMusicBackend,
  type WizardCraftMusicTrackId,
  type WizardCraftMusicVoice,
} from "../src/index.js";

class Voice implements WizardCraftMusicVoice {
  readonly gains: Array<[number, number]> = [];
  readonly stops: number[] = [];

  setGain(gain: number, rampMilliseconds: number): void {
    this.gains.push([gain, rampMilliseconds]);
  }

  stop(fadeMilliseconds: number): void {
    this.stops.push(fadeMilliseconds);
  }
}

class Backend implements WizardCraftMusicBackend {
  readonly starts: Array<{ track: WizardCraftMusicTrackId; voice: Voice }> = [];

  startLoop(track: WizardCraftMusicTrackId): Voice {
    const voice = new Voice();
    this.starts.push({ track, voice });
    return voice;
  }
}

function plan(
  audio:
    | "reels.stop"
    | "reels.anticipation"
    | "reel.sticky.claim"
    | "duel.end"
    | "win.final"
    | "win.max",
  durationMs = 800,
): WizardCraftCuePlan {
  return {
    eventIndex: 0,
    eventType: "review",
    durationMs,
    beats: [{
      id: audio,
      channel: "reels",
      startMs: 0,
      durationMs,
      audio,
      motion: "full",
    }],
  };
}

test("starts the original hybrid loop and ducks only for dramatic cues", async () => {
  const backend = new Backend();
  const sleeps: Array<{ duration: number; resolve: () => void }> = [];
  const music = new WizardCraftMusicDirector(backend, {
    sleep: (duration) => new Promise((resolve) => {
      sleeps.push({ duration, resolve });
    }),
  });

  music.setEnabled(true);
  const voice = backend.starts[0]!.voice;
  assert.equal(backend.starts[0]?.track, "music.wizard-craft-hybrid");
  assert.deepEqual(voice.gains, [[0.18, 0]]);

  music.present(plan("reels.stop"));
  assert.deepEqual(voice.gains, [[0.18, 0]]);

  music.present(plan("reels.anticipation", 900));
  assert.equal(music.state.ducked, true);
  assert.deepEqual(voice.gains.at(-1), [0.1, 70]);
  assert.equal(sleeps[0]?.duration, 900);
  sleeps[0]!.resolve();
  await Promise.resolve();
  assert.deepEqual(voice.gains.at(-1), [0.18, 240]);
  assert.equal(music.state.ducked, false);
});

test("a later duck invalidates stale restoration and disabling fades safely", async () => {
  const backend = new Backend();
  const resolves: Array<() => void> = [];
  const music = new WizardCraftMusicDirector(backend, {
    sleep: () => new Promise((resolve) => resolves.push(resolve)),
  });
  music.setEnabled(true);
  const voice = backend.starts[0]!.voice;

  music.present(plan("reel.sticky.claim"));
  music.present(plan("win.max"));
  assert.deepEqual(voice.gains.slice(-2), [[0.075, 70], [0.035, 70]]);

  resolves[0]!();
  await Promise.resolve();
  assert.deepEqual(voice.gains.at(-1), [0.035, 70]);

  resolves[1]!();
  await Promise.resolve();
  assert.deepEqual(voice.gains.at(-1), [0.18, 240]);

  music.setEnabled(false);
  assert.deepEqual(voice.stops, [180]);
  assert.deepEqual(music.state, {
    enabled: false,
    playing: false,
    ducked: false,
    gain: 0.18,
  });
});

test("duel and final endings clear space without matching the maximum duck", () => {
  const backend = new Backend();
  const music = new WizardCraftMusicDirector(backend, {
    sleep: () => new Promise(() => undefined),
  });
  music.setEnabled(true);
  const voice = backend.starts[0]!.voice;
  music.present(plan("duel.end"));
  music.present(plan("win.final"));
  music.present(plan("win.max"));
  assert.deepEqual(
    voice.gains.slice(-3),
    [[0.085, 70], [0.075, 70], [0.035, 70]],
  );
});

test("music backend and observer failures cannot affect presentation", () => {
  const music = new WizardCraftMusicDirector({
    startLoop(): WizardCraftMusicVoice {
      throw new Error("music unavailable");
    },
  });
  music.subscribe(() => {
    throw new Error("observer unavailable");
  });
  assert.doesNotThrow(() => music.setEnabled(true));
  assert.equal(music.state.playing, false);
  assert.doesNotThrow(() => music.present(plan("win.max")));
  music.dispose();
});
