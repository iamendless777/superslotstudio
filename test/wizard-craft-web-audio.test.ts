import assert from "node:assert/strict";
import test from "node:test";

import {
  WizardCraftWebAudioBackend,
  WizardCraftWebMusicBackend,
  decodeWizardCraftAudioBuffers,
  type WizardCraftAudioParamPort,
  type WizardCraftAudioCueId,
  type WizardCraftBufferSourcePort,
  type WizardCraftGainPort,
  type WizardCraftWebAudioContextPort,
} from "../src/index.js";

class Param implements WizardCraftAudioParamPort {
  value = 1;
  readonly calls: Array<[string, number, number]> = [];
  setValueAtTime(value: number, time: number): void {
    this.calls.push(["set", value, time]);
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.calls.push(["ramp", value, time]);
  }
}

class Gain implements WizardCraftGainPort {
  readonly gain = new Param();
  destination: unknown;
  connect(destination: unknown): void {
    this.destination = destination;
  }
}

class Source implements WizardCraftBufferSourcePort {
  buffer: unknown;
  loop = false;
  onended: (() => void) | null = null;
  destination: unknown;
  started = false;
  stoppedAt: number | undefined;
  connect(destination: unknown): void {
    this.destination = destination;
  }
  start(): void {
    this.started = true;
  }
  stop(when?: number): void {
    this.stoppedAt = when;
  }
}

class Context implements WizardCraftWebAudioContextPort {
  currentTime = 10;
  destination = {};
  state = "suspended";
  readonly gains: Gain[] = [];
  readonly sources: Source[] = [];
  resumes = 0;
  decodes = 0;
  createGain(): Gain {
    const gain = new Gain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource(): Source {
    const source = new Source();
    this.sources.push(source);
    return source;
  }
  async decodeAudioData(bytes: ArrayBuffer): Promise<unknown> {
    this.decodes += 1;
    return { length: bytes.byteLength };
  }
  async resume(): Promise<void> {
    this.resumes += 1;
    this.state = "running";
  }
}

test("decodes copied audio buffers and plays through channel gain", async () => {
  const context = new Context();
  const original = new Uint8Array([1, 2, 3]).buffer;
  const decoded = await decodeWizardCraftAudioBuffers(
    context,
    new Map<WizardCraftAudioCueId, ArrayBuffer>([
      ["clash.impact", original],
    ]),
  );
  const backend = new WizardCraftWebAudioBackend(
    context,
    decoded,
    { clash: 0.6 },
  );

  const voice = backend.play("clash.impact", "clash");

  assert.equal(context.decodes, 1);
  assert.equal(context.sources[0]?.started, true);
  assert.deepEqual(context.sources[0]?.buffer, { length: 3 });
  assert.equal(context.gains[0]?.gain.value, 0.6);
  assert.equal(context.resumes, 1);

  voice.stop(50);
  assert.deepEqual(context.gains[0]?.gain.calls, [
    ["set", 0, 10],
    ["ramp", 0.6, 10.008],
    ["set", 0.6, 10],
    ["ramp", 0, 10.05],
  ]);
  assert.equal(context.sources[0]?.stoppedAt, 10.05);
  context.sources[0]?.onended?.();
  await voice.finished;
});

test("rejects missing sounds and invalid channel gain configuration", () => {
  const context = new Context();
  assert.throws(
    () => new WizardCraftWebAudioBackend(
      context,
      new Map(),
      { reels: 1.1 },
    ),
    /gain must be from 0 to 1/,
  );
  const backend = new WizardCraftWebAudioBackend(context, new Map());
  assert.throws(
    () => backend.play("clash.impact", "clash"),
    /Missing WIZARD CRAFT audio/,
  );
});

test("loops decoded production music with bounded gain ramps and fade-out", () => {
  const context = new Context();
  const backend = new WizardCraftWebMusicBackend(
    context,
    new Map([["music.wizard-craft-hybrid", { music: true }]]),
  );
  const voice = backend.startLoop("music.wizard-craft-hybrid");
  const source = context.sources[0]!;
  const gain = context.gains[0]!.gain;

  assert.equal(source.loop, true);
  assert.equal(source.started, true);
  assert.deepEqual(source.buffer, { music: true });
  voice.setGain(0.18, 70);
  voice.setGain(0.055, 70);
  voice.stop(180);
  assert.deepEqual(gain.calls, [
    ["set", 0, 10],
    ["ramp", 0.18, 10.07],
    ["set", 0.18, 10],
    ["ramp", 0.055, 10.07],
    ["set", 0.055, 10],
    ["ramp", 0, 10.18],
  ]);
  assert.equal(source.stoppedAt, 10.18);
  assert.throws(
    () => new WizardCraftWebMusicBackend(context, new Map())
      .startLoop("music.wizard-craft-hybrid"),
    /Missing WIZARD CRAFT music/,
  );
});
