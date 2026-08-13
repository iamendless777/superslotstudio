import { assertWizardCraftVerticalSliceAssets } from "./assets.js";
import {
  WizardCraftAudioScheduler,
  WizardCraftProductionRenderer,
  type WizardCraftAudioBackend,
  type WizardCraftAudioClock,
} from "./audio.js";
import { WizardCraftAutoplayRunner } from "./autoplay.js";
import {
  WizardCraftCabinetLayer,
  type WizardCraftCabinetView,
} from "./cabinet-layer.js";
import {
  WizardCraftCanvasUiLayer,
  type WizardCraftCanvasUiView,
} from "./canvas-ui-layer.js";
import {
  WizardCraftCharacterLayer,
  type WizardCraftCharacterView,
} from "./character-layer.js";
import {
  WizardCraftClashLayer,
  type WizardCraftClashView,
} from "./clash-layer.js";
import {
  mountWizardCraftControlSurface,
  type WizardCraftControlSurface,
  type WizardCraftControlSurfaceOptions,
} from "./control-surface.js";
import type {
  WizardCraftPresentationBoundary,
  WizardCraftPresentationClock,
} from "./controller.js";
import { WizardCraftFullRoundController } from "./full-round.js";
import type { WizardCraftRgsEvent } from "./official.js";
import {
  WizardCraftPixiSceneRenderer,
  type WizardCraftPixiClock,
} from "./pixi-scene.js";
import {
  WizardCraftMusicDirector,
  type WizardCraftMusicBackend,
  type WizardCraftMusicClock,
} from "./music.js";
import {
  WIZARD_CRAFT_REEL_DESIGN_RECT,
  WizardCraftReelLayer,
  type WizardCraftReelView,
} from "./reel-layer.js";
import {
  WizardCraftUiController,
  type WizardCraftUiSession,
} from "./ui-controller.js";

export interface WizardCraftProductionSession
extends WizardCraftUiSession, WizardCraftPresentationBoundary {
  dispose(): void;
}

export interface WizardCraftProductionViews {
  readonly reels: WizardCraftReelView;
  readonly dragon: WizardCraftCharacterView;
  readonly wizard: WizardCraftCharacterView;
  readonly clash: WizardCraftClashView;
  readonly cabinet: WizardCraftCabinetView;
  readonly ui: WizardCraftCanvasUiView;
}

export interface WizardCraftProductionRuntimeOptions {
  readonly session: WizardCraftProductionSession;
  readonly views: WizardCraftProductionViews;
  readonly audioBackend: WizardCraftAudioBackend;
  readonly loadedAssets: ReadonlySet<string>;
  readonly controlRoot?: HTMLElement;
  readonly controls?: Omit<
    WizardCraftControlSurfaceOptions,
    "roundDriver" | "autoplayRunner" | "audioScheduler" | "musicDirector"
  >;
  readonly presentationClock?: WizardCraftPresentationClock;
  readonly pixiClock?: WizardCraftPixiClock;
  readonly audioClock?: WizardCraftAudioClock;
  readonly musicBackend?: WizardCraftMusicBackend;
  readonly musicClock?: WizardCraftMusicClock;
}

export class WizardCraftProductionRuntime {
  readonly ui: WizardCraftUiController;
  readonly fullRound: WizardCraftFullRoundController;
  readonly autoplay: WizardCraftAutoplayRunner;
  readonly audio: WizardCraftAudioScheduler;
  readonly music: WizardCraftMusicDirector | null;
  readonly scene: WizardCraftPixiSceneRenderer;
  readonly #session: WizardCraftProductionSession;
  readonly #reelLayer: WizardCraftReelLayer;
  readonly #cabinetLayer: WizardCraftCabinetLayer;
  readonly #uiLayer: WizardCraftCanvasUiLayer;
  readonly #controls: WizardCraftControlSurface | null;
  #disposed = false;

  constructor(options: WizardCraftProductionRuntimeOptions) {
    assertWizardCraftVerticalSliceAssets(options.loadedAssets);
    this.#session = options.session;
    this.ui = new WizardCraftUiController(options.session);
    this.#reelLayer = new WizardCraftReelLayer(options.views.reels);
    this.#cabinetLayer = new WizardCraftCabinetLayer(options.views.cabinet);
    this.#uiLayer = new WizardCraftCanvasUiLayer(options.views.ui);
    this.scene = new WizardCraftPixiSceneRenderer({
      reels: this.#reelLayer,
      dragon: new WizardCraftCharacterLayer("dragon", options.views.dragon),
      wizard: new WizardCraftCharacterLayer("wizard", options.views.wizard),
      clash: new WizardCraftClashLayer(options.views.clash),
      cabinet: this.#cabinetLayer,
      ui: this.#uiLayer,
    }, options.pixiClock);
    this.audio = new WizardCraftAudioScheduler(
      options.audioBackend,
      options.audioClock,
    );
    this.music = options.musicBackend === undefined
      ? null
      : new WizardCraftMusicDirector(options.musicBackend, options.musicClock);
    const renderer = new WizardCraftProductionRenderer(
      this.scene,
      this.audio,
      this.music ?? undefined,
    );
    this.fullRound = new WizardCraftFullRoundController(
      this.ui,
      options.session,
      renderer,
      options.presentationClock,
    );
    this.autoplay = new WizardCraftAutoplayRunner(this.fullRound);
    this.#controls = options.controlRoot === undefined
      ? null
      : mountWizardCraftControlSurface(options.controlRoot, this.ui, {
        ...options.controls,
        roundDriver: this.fullRound,
        autoplayRunner: this.autoplay,
        audioScheduler: this.audio,
        ...(this.music === null ? {} : { musicDirector: this.music }),
      });
  }

  async start(): Promise<void> {
    if (this.#disposed) throw new Error("WIZARD CRAFT runtime is disposed");
    await this.ui.start();
    if (this.#session.state.value === "active") {
      await this.fullRound.resumeActiveRound();
    }
  }

  resize(width: number, height: number): void {
    if (this.#disposed) throw new Error("WIZARD CRAFT runtime is disposed");
    this.#reelLayer.layout(
      WIZARD_CRAFT_REEL_DESIGN_RECT.width,
      WIZARD_CRAFT_REEL_DESIGN_RECT.height,
    );
    this.#cabinetLayer.layout(width, height);
    this.#uiLayer.layout(width, height);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#controls?.dispose();
    this.autoplay.dispose();
    this.ui.dispose();
    this.audio.dispose();
    this.music?.dispose();
    this.scene.dispose();
    this.#session.dispose();
  }
}

export type { WizardCraftRgsEvent };
