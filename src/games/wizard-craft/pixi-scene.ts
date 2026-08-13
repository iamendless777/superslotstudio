import type {
  WizardCraftCueChannel,
  WizardCraftPresentationBeat,
} from "./cues.js";
import type {
  WizardCraftLayeredRenderer,
  WizardCraftRenderCommand,
  WizardCraftRuntimeState,
} from "./runtime.js";

export interface WizardCraftPixiClock {
  sleep(milliseconds: number): Promise<void>;
}

/**
 * Implemented by one concrete Pixi Container per scene layer. Only this small
 * interface depends on the eventual Pixi implementation and production assets.
 */
export interface WizardCraftPixiLayer {
  sync(state: WizardCraftRuntimeState): void | Promise<void>;
  play(
    beat: WizardCraftPresentationBeat,
    command: WizardCraftRenderCommand,
  ): void | Promise<void>;
  cancel(): void;
  destroy(): void;
}

export type WizardCraftPixiScene = Readonly<
  Record<WizardCraftCueChannel, WizardCraftPixiLayer>
>;

const LAYER_ORDER = Object.freeze([
  "cabinet",
  "reels",
  "dragon",
  "wizard",
  "clash",
  "ui",
] as const satisfies readonly WizardCraftCueChannel[]);

/**
 * Deterministic Pixi-facing renderer. It never interprets outcome data: layers
 * receive immutable before/after projections and authored presentation beats.
 */
export class WizardCraftPixiSceneRenderer
implements WizardCraftLayeredRenderer {
  readonly #scene: WizardCraftPixiScene;
  readonly #clock: WizardCraftPixiClock;
  #rendering = false;
  #disposed = false;

  constructor(
    scene: WizardCraftPixiScene,
    clock: WizardCraftPixiClock = {
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
    },
  ) {
    this.#scene = scene;
    this.#clock = clock;
  }

  async render(command: WizardCraftRenderCommand): Promise<void> {
    if (this.#disposed) throw new Error("WIZARD CRAFT Pixi scene is disposed");
    if (this.#rendering) {
      throw new Error("WIZARD CRAFT Pixi scene is already rendering");
    }
    if (command.event.index !== command.before.nextEventIndex) {
      throw new Error("WIZARD CRAFT Pixi command is out of sequence");
    }

    this.#rendering = true;
    this.#cancelAll();
    await this.#syncAll(command.before);
    try {
      const beats = command.cue.beats.map(async (beat) => {
        if (beat.startMs > 0) await this.#clock.sleep(beat.startMs);
        if (this.#disposed) return;
        await this.#scene[beat.channel].play(beat, command);
      });
      await Promise.all([
        ...beats,
        this.#clock.sleep(command.cue.durationMs),
      ]);
      if (this.#disposed) return;
      await this.#syncAll(command.after);
    } catch (error) {
      this.#cancelAll();
      try {
        await this.#syncAll(command.before);
      } catch {
        // Preserve the originating render failure for the checkpoint boundary.
      }
      throw error;
    } finally {
      this.#rendering = false;
    }
  }

  async restore(state: WizardCraftRuntimeState): Promise<void> {
    if (this.#disposed) throw new Error("WIZARD CRAFT Pixi scene is disposed");
    if (this.#rendering) {
      throw new Error("WIZARD CRAFT Pixi scene is already rendering");
    }
    this.#cancelAll();
    await this.#syncAll(state);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelAll();
    for (const channel of LAYER_ORDER) {
      try {
        this.#scene[channel].destroy();
      } catch {
        // Destruction continues so one broken container cannot leak the rest.
      }
    }
  }

  async #syncAll(state: WizardCraftRuntimeState): Promise<void> {
    for (const channel of LAYER_ORDER) {
      await this.#scene[channel].sync(state);
    }
  }

  #cancelAll(): void {
    for (const channel of LAYER_ORDER) {
      try {
        this.#scene[channel].cancel();
      } catch {
        // Cleanup is best-effort and cannot replace an authoritative failure.
      }
    }
  }
}
