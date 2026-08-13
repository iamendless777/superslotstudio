import type {
  WizardCraftAudioCueId,
  WizardCraftCuePlan,
} from "./cues.js";

export const WIZARD_CRAFT_MUSIC_TRACK_ID =
  "music.wizard-craft-hybrid" as const;
export type WizardCraftMusicTrackId = typeof WIZARD_CRAFT_MUSIC_TRACK_ID;

export interface WizardCraftMusicVoice {
  setGain(gain: number, rampMilliseconds: number): void;
  stop(fadeMilliseconds: number): void;
}

export interface WizardCraftMusicBackend {
  startLoop(track: WizardCraftMusicTrackId): WizardCraftMusicVoice;
}

export interface WizardCraftMusicClock {
  sleep(milliseconds: number): Promise<void>;
}

export interface WizardCraftMusicState {
  readonly enabled: boolean;
  readonly playing: boolean;
  readonly ducked: boolean;
  readonly gain: number;
}

const NORMAL_GAIN = 0.18;
const DUCK_ATTACK_MS = 70;
const DUCK_RELEASE_MS = 240;
const STOP_FADE_MS = 180;

const DUCK_GAIN = Object.freeze({
  "reels.anticipation": 0.10,
  "duel.tier1": 0.08,
  "duel.tier2": 0.07,
  "duel.tier3": 0.055,
  "duel.enter": 0.09,
  "duel.retrigger": 0.075,
  "duel.end": 0.085,
  "reel.temporary.claim": 0.105,
  "reel.sticky.claim": 0.075,
  "reel.sticky.upgrade": 0.07,
  "attack.block": 0.08,
  "clash.impact": 0.075,
  "clash.balanced": 0.07,
  "win.level": 0.10,
  "win.final": 0.075,
  "win.max": 0.035,
} as const satisfies Partial<Record<WizardCraftAudioCueId, number>>);

/**
 * Presentation-only music policy. It reacts to authored cue plans, never
 * selects results, changes checkpoints, or extends presentation duration.
 */
export class WizardCraftMusicDirector {
  readonly #backend: WizardCraftMusicBackend;
  readonly #clock: WizardCraftMusicClock;
  readonly #listeners = new Set<(state: WizardCraftMusicState) => void>();
  #voice: WizardCraftMusicVoice | null = null;
  #enabled = false;
  #gain = NORMAL_GAIN;
  #duckToken = 0;
  #disposed = false;

  constructor(
    backend: WizardCraftMusicBackend,
    clock: WizardCraftMusicClock = {
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
    },
  ) {
    this.#backend = backend;
    this.#clock = clock;
  }

  get state(): WizardCraftMusicState {
    return Object.freeze({
      enabled: this.#enabled,
      playing: this.#voice !== null,
      ducked: this.#gain < NORMAL_GAIN,
      gain: this.#gain,
    });
  }

  subscribe(listener: (state: WizardCraftMusicState) => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    try {
      listener(this.state);
    } catch {
      // Music observers cannot affect startup or presentation.
    }
    return () => this.#listeners.delete(listener);
  }

  setEnabled(enabled: boolean): void {
    if (this.#disposed || enabled === this.#enabled) return;
    this.#enabled = enabled;
    this.#duckToken += 1;
    if (enabled) {
      try {
        this.#voice = this.#backend.startLoop(WIZARD_CRAFT_MUSIC_TRACK_ID);
        this.#gain = NORMAL_GAIN;
        this.#voice.setGain(NORMAL_GAIN, 0);
      } catch {
        this.#voice = null;
      }
    } else {
      try {
        this.#voice?.stop(STOP_FADE_MS);
      } catch {
        // Music backend failure cannot affect presentation.
      }
      this.#voice = null;
      this.#gain = NORMAL_GAIN;
    }
    this.#notify();
  }

  present(plan: WizardCraftCuePlan): void {
    if (this.#disposed || this.#voice === null) return;
    const gains = plan.beats.flatMap(({ audio }) => {
      if (audio === undefined) return [];
      const gain = DUCK_GAIN[audio as keyof typeof DUCK_GAIN];
      return gain === undefined ? [] : [gain];
    });
    if (gains.length === 0) return;
    const target = Math.min(...gains);
    const token = ++this.#duckToken;
    this.#gain = target;
    try {
      this.#voice.setGain(target, DUCK_ATTACK_MS);
    } catch {
      return;
    }
    this.#notify();
    void this.#clock.sleep(plan.durationMs).then(() => {
      if (
        this.#disposed ||
        this.#voice === null ||
        token !== this.#duckToken
      ) return;
      this.#gain = NORMAL_GAIN;
      try {
        this.#voice.setGain(NORMAL_GAIN, DUCK_RELEASE_MS);
      } catch {
        return;
      }
      this.#notify();
    }).catch(() => undefined);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#duckToken += 1;
    try {
      this.#voice?.stop(STOP_FADE_MS);
    } catch {
      // Cleanup remains best effort.
    }
    this.#voice = null;
    this.#enabled = false;
    this.#gain = NORMAL_GAIN;
    this.#disposed = true;
    this.#listeners.clear();
  }

  #notify(): void {
    if (this.#disposed) return;
    const state = this.state;
    for (const listener of this.#listeners) {
      try {
        listener(state);
      } catch {
        // Music observers cannot affect presentation.
      }
    }
  }
}
