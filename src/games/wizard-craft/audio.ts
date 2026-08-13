import type {
  WizardCraftAudioCueId,
  WizardCraftCueChannel,
  WizardCraftCuePlan,
} from "./cues.js";
import type {
  WizardCraftLayeredRenderer,
  WizardCraftRenderCommand,
} from "./runtime.js";
import type { WizardCraftMusicDirector } from "./music.js";

export interface WizardCraftAudioVoice {
  readonly finished?: Promise<void>;
  stop(fadeMilliseconds: number): void;
}

export interface WizardCraftAudioBackend {
  play(
    cue: WizardCraftAudioCueId,
    channel: WizardCraftCueChannel,
  ): WizardCraftAudioVoice;
}

export interface WizardCraftAudioClock {
  sleep(milliseconds: number): Promise<void>;
}

export interface WizardCraftAudioState {
  readonly muted: boolean;
  readonly activeChannels: readonly WizardCraftCueChannel[];
}

const CHANNEL_FADE_MS = 45;

/**
 * Presentation-only audio. Backend failures are isolated and audio never
 * selects an outcome, advances a checkpoint, or changes runtime state.
 */
export class WizardCraftAudioScheduler {
  readonly #backend: WizardCraftAudioBackend;
  readonly #clock: WizardCraftAudioClock;
  readonly #voices = new Map<WizardCraftCueChannel, WizardCraftAudioVoice>();
  readonly #listeners = new Set<(state: WizardCraftAudioState) => void>();
  #muted = false;
  #disposed = false;

  constructor(
    backend: WizardCraftAudioBackend,
    clock: WizardCraftAudioClock = {
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
    },
  ) {
    this.#backend = backend;
    this.#clock = clock;
  }

  get state(): WizardCraftAudioState {
    return Object.freeze({
      muted: this.#muted,
      activeChannels: Object.freeze([...this.#voices.keys()]),
    });
  }

  subscribe(listener: (state: WizardCraftAudioState) => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    listener(this.state);
    return () => this.#listeners.delete(listener);
  }

  setMuted(muted: boolean): void {
    if (this.#disposed || muted === this.#muted) return;
    this.#muted = muted;
    if (muted) this.stopAll();
    this.#notify();
  }

  async present(plan: WizardCraftCuePlan): Promise<void> {
    if (this.#disposed) return;
    const starts = plan.beats
      .filter((beat) => beat.audio !== undefined)
      .map(async (beat) => {
        if (beat.startMs > 0) await this.#clock.sleep(beat.startMs);
        if (this.#disposed || this.#muted || beat.audio === undefined) return;
        this.#start(beat.channel, beat.audio);
      });
    await Promise.all([
      ...starts,
      this.#clock.sleep(plan.durationMs),
    ]);
  }

  stopChannel(channel: WizardCraftCueChannel): void {
    const voice = this.#voices.get(channel);
    if (voice === undefined) return;
    this.#voices.delete(channel);
    try {
      voice.stop(CHANNEL_FADE_MS);
    } catch {
      // A broken voice cannot interrupt presentation or cleanup.
    }
    this.#notify();
  }

  stopAll(): void {
    for (const channel of [...this.#voices.keys()]) this.stopChannel(channel);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.stopAll();
    this.#disposed = true;
    this.#listeners.clear();
  }

  #start(channel: WizardCraftCueChannel, cue: WizardCraftAudioCueId): void {
    this.stopChannel(channel);
    try {
      const voice = this.#backend.play(cue, channel);
      this.#voices.set(channel, voice);
      if (voice.finished !== undefined) {
        void voice.finished.finally(() => {
          if (this.#voices.get(channel) !== voice) return;
          this.#voices.delete(channel);
          this.#notify();
        }).catch(() => undefined);
      }
      this.#notify();
    } catch {
      // Missing or failed audio remains silent; visual truth still completes.
    }
  }

  #notify(): void {
    if (this.#disposed) return;
    const state = this.state;
    for (const listener of [...this.#listeners]) {
      try {
        listener(state);
      } catch {
        // Audio observers cannot affect the result lifecycle.
      }
    }
  }
}

/** Keeps visual animation and authored audio timing on the same event boundary. */
export class WizardCraftProductionRenderer
implements WizardCraftLayeredRenderer {
  readonly #visual: WizardCraftLayeredRenderer;
  readonly #audio: WizardCraftAudioScheduler;
  readonly #music: WizardCraftMusicDirector | undefined;

  constructor(
    visual: WizardCraftLayeredRenderer,
    audio: WizardCraftAudioScheduler,
    music?: WizardCraftMusicDirector,
  ) {
    this.#visual = visual;
    this.#audio = audio;
    this.#music = music;
  }

  async render(command: WizardCraftRenderCommand): Promise<void> {
    this.#music?.present(command.cue);
    await Promise.all([
      this.#visual.render(command),
      this.#audio.present(command.cue),
    ]);
  }
}
