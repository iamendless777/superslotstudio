import type {
  WizardCraftAudioBackend,
  WizardCraftAudioVoice,
} from "./audio.js";
import type {
  WizardCraftAudioCueId,
  WizardCraftCueChannel,
} from "./cues.js";
import type {
  WizardCraftMusicBackend,
  WizardCraftMusicTrackId,
  WizardCraftMusicVoice,
} from "./music.js";

export interface WizardCraftAudioParamPort {
  value: number;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
}

export interface WizardCraftGainPort {
  readonly gain: WizardCraftAudioParamPort;
  connect(destination: unknown): void;
}

export interface WizardCraftBufferSourcePort {
  buffer: unknown;
  loop?: boolean;
  onended: (() => void) | null;
  connect(destination: unknown): void;
  start(): void;
  stop(when?: number): void;
}

export class WizardCraftWebMusicBackend implements WizardCraftMusicBackend {
  readonly #context: WizardCraftWebAudioContextPort;
  readonly #buffers: ReadonlyMap<WizardCraftMusicTrackId, unknown>;

  constructor(
    context: WizardCraftWebAudioContextPort,
    buffers: ReadonlyMap<WizardCraftMusicTrackId, unknown>,
  ) {
    this.#context = context;
    this.#buffers = buffers;
  }

  startLoop(track: WizardCraftMusicTrackId): WizardCraftMusicVoice {
    const buffer = this.#buffers.get(track);
    if (buffer === undefined) {
      throw new Error(`Missing WIZARD CRAFT music ${track}`);
    }
    if (this.#context.state === "suspended") {
      void this.#context.resume?.().catch(() => undefined);
    }
    const source = this.#context.createBufferSource();
    const gain = this.#context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(this.#context.destination);
    gain.gain.value = 0;
    source.start();
    let stopped = false;
    return Object.freeze({
      setGain: (value: number, rampMilliseconds: number): void => {
        if (stopped) return;
        if (
          !Number.isFinite(value) || value < 0 || value > 1 ||
          !Number.isFinite(rampMilliseconds) || rampMilliseconds < 0
        ) {
          throw new RangeError("WIZARD CRAFT music gain transition is invalid");
        }
        const now = this.#context.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(
          value,
          now + rampMilliseconds / 1_000,
        );
        gain.gain.value = value;
      },
      stop: (fadeMilliseconds: number): void => {
        if (stopped) return;
        stopped = true;
        const seconds = Math.max(0, fadeMilliseconds) / 1_000;
        const now = this.#context.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + seconds);
        source.stop(now + seconds);
      },
    });
  }
}

export interface WizardCraftWebAudioContextPort {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  createGain(): WizardCraftGainPort;
  createBufferSource(): WizardCraftBufferSourcePort;
  decodeAudioData(bytes: ArrayBuffer): Promise<unknown>;
  resume?(): Promise<void>;
}

export class WizardCraftWebAudioBackend implements WizardCraftAudioBackend {
  readonly #context: WizardCraftWebAudioContextPort;
  readonly #buffers: ReadonlyMap<WizardCraftAudioCueId, unknown>;
  readonly #channelGain: Readonly<Record<WizardCraftCueChannel, number>>;

  constructor(
    context: WizardCraftWebAudioContextPort,
    buffers: ReadonlyMap<WizardCraftAudioCueId, unknown>,
    channelGain: Partial<Record<WizardCraftCueChannel, number>> = {},
  ) {
    this.#context = context;
    this.#buffers = buffers;
    this.#channelGain = Object.freeze({
      reels: channelGain.reels ?? 0.75,
      dragon: channelGain.dragon ?? 0.9,
      wizard: channelGain.wizard ?? 0.9,
      clash: channelGain.clash ?? 0.85,
      cabinet: channelGain.cabinet ?? 0.8,
      ui: channelGain.ui ?? 0.7,
    });
    for (const gain of Object.values(this.#channelGain)) {
      if (!Number.isFinite(gain) || gain < 0 || gain > 1) {
        throw new RangeError("WIZARD CRAFT channel gain must be from 0 to 1");
      }
    }
  }

  play(
    cue: WizardCraftAudioCueId,
    channel: WizardCraftCueChannel,
  ): WizardCraftAudioVoice {
    const buffer = this.#buffers.get(cue);
    if (buffer === undefined) throw new Error(`Missing WIZARD CRAFT audio ${cue}`);
    if (this.#context.state === "suspended") {
      void this.#context.resume?.().catch(() => undefined);
    }
    const source = this.#context.createBufferSource();
    const gain = this.#context.createGain();
    source.buffer = buffer;
    const targetGain = this.#channelGain[channel];
    const now = this.#context.currentTime;
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(targetGain, now + 0.008);
    gain.gain.value = targetGain;
    source.connect(gain);
    gain.connect(this.#context.destination);
    let settled = false;
    let resolveFinished: (() => void) | undefined;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    source.onended = () => {
      if (settled) return;
      settled = true;
      resolveFinished?.();
    };
    source.start();
    return Object.freeze({
      finished,
      stop: (fadeMilliseconds: number): void => {
        if (settled) return;
        const seconds = Math.max(0, fadeMilliseconds) / 1_000;
        const now = this.#context.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + seconds);
        source.stop(now + seconds);
      },
    });
  }
}

export async function decodeWizardCraftAudioBuffers<TId extends string>(
  context: WizardCraftWebAudioContextPort,
  encoded: ReadonlyMap<TId, ArrayBuffer>,
): Promise<ReadonlyMap<TId, unknown>> {
  const decoded = new Map<TId, unknown>();
  for (const [id, bytes] of encoded) {
    decoded.set(id, await context.decodeAudioData(bytes.slice(0)));
  }
  return decoded;
}
