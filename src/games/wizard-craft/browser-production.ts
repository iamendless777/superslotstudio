import {
  loadWizardCraftBrowserAssets,
  wizardCraftProductionBrowserEntries,
  type WizardCraftBrowserAudioAssetId,
  type WizardCraftBrowserAssetLoaderOptions,
} from "./browser-assets.js";
import {
  createWizardCraftTextureBundle,
  type WizardCraftDecodedImage,
  type WizardCraftPixiTextureAdapter,
  type WizardCraftTexture,
  type WizardCraftTextureBundle,
} from "./browser-textures.js";
import {
  WizardCraftCabinetSpriteView,
  type WizardCraftCabinetLighting,
  type WizardCraftCabinetSprite,
  type WizardCraftCabinetStage,
} from "./cabinet-sprite-view.js";
import {
  WizardCraftCanvasUiSpriteView,
  type WizardCraftCanvasMultiplierView,
  type WizardCraftCanvasUiSprite,
  type WizardCraftCanvasUiTextViews,
} from "./canvas-ui-sprite-view.js";
import {
  WizardCraftCharacterSpriteView,
  type WizardCraftCharacterSprite,
} from "./character-sprite-view.js";
import {
  WizardCraftClashSpriteView,
  type WizardCraftClashSprite,
} from "./clash-sprite-view.js";
import {
  WIZARD_CRAFT_AUDIO_CUE_IDS,
  type WizardCraftAudioCueId,
} from "./cues.js";
import { WIZARD_CRAFT_DRAGON_RIG } from "./dragon-rig.js";
import {
  WIZARD_CRAFT_MUSIC_TRACK_ID,
  type WizardCraftMusicTrackId,
} from "./music.js";
import {
  createWizardCraftPixiAssetScene,
  type WizardCraftPixiAssetScene,
  type WizardCraftPixiContainer,
  type WizardCraftPixiDisplayAdapter,
  type WizardCraftPixiSprite,
} from "./pixi-assets.js";
import {
  WizardCraftProductionRuntime,
  type WizardCraftProductionRuntimeOptions,
  type WizardCraftProductionSession,
} from "./production-runtime.js";
import {
  WizardCraftReelSpriteView,
  type WizardCraftReelFrameSprite,
  type WizardCraftSymbolCellView,
  type WizardCraftVsReelOverlayView,
} from "./reel-sprite-view.js";
import {
  WizardCraftWebAudioBackend,
  WizardCraftWebMusicBackend,
  decodeWizardCraftAudioBuffers,
  type WizardCraftWebAudioContextPort,
} from "./web-audio.js";

export interface WizardCraftBrowserPixiContainer
extends WizardCraftPixiContainer, WizardCraftCabinetStage {}

export interface WizardCraftBrowserPixiSprite<
  TTexture extends WizardCraftTexture,
> extends
  WizardCraftPixiSprite<TTexture>,
  WizardCraftCabinetSprite,
  WizardCraftClashSprite,
  WizardCraftReelFrameSprite,
  WizardCraftCanvasUiSprite,
  WizardCraftCharacterSprite {}

export interface WizardCraftBrowserViewComponents {
  readonly reelCells: readonly WizardCraftSymbolCellView[];
  readonly reelOverlays: readonly WizardCraftVsReelOverlayView[];
  readonly cabinetLighting: WizardCraftCabinetLighting;
  readonly uiText: WizardCraftCanvasUiTextViews;
  readonly uiMultipliers: readonly WizardCraftCanvasMultiplierView[];
}

export interface WizardCraftBrowserProductionOptions<
  TTexture extends WizardCraftTexture,
  TContainer extends WizardCraftBrowserPixiContainer,
  TSprite extends WizardCraftBrowserPixiSprite<TTexture>,
> {
  readonly session: WizardCraftProductionSession;
  readonly assets: Omit<WizardCraftBrowserAssetLoaderOptions, "entries"> & {
    readonly entries: WizardCraftBrowserAssetLoaderOptions["entries"];
  };
  readonly audioContext: WizardCraftWebAudioContextPort;
  readonly textureAdapter: WizardCraftPixiTextureAdapter<TTexture>;
  readonly displayAdapter: WizardCraftPixiDisplayAdapter<
    TTexture,
    TContainer,
    TSprite
  >;
  readonly createViewComponents: (
    scene: WizardCraftPixiAssetScene<TTexture, TContainer, TSprite>,
  ) => WizardCraftBrowserViewComponents;
  readonly mount?: (root: TContainer) => void | (() => void);
  readonly decodeImage?: (
    blob: Blob,
    options?: ImageBitmapOptions,
  ) => Promise<WizardCraftDecodedImage>;
  readonly initialSize?: {
    readonly width: number;
    readonly height: number;
  };
  readonly autoStart?: boolean;
  readonly staticCharacterPlate?: boolean;
  readonly runtime?: Omit<
    WizardCraftProductionRuntimeOptions,
    "session" | "views" | "audioBackend" | "musicBackend" | "loadedAssets"
  >;
}

export interface WizardCraftBrowserProductionApp<
  TTexture extends WizardCraftTexture,
  TContainer extends WizardCraftBrowserPixiContainer,
  TSprite extends WizardCraftBrowserPixiSprite<TTexture>,
> {
  readonly runtime: WizardCraftProductionRuntime;
  readonly textures: WizardCraftTextureBundle<TTexture>;
  readonly scene: WizardCraftPixiAssetScene<TTexture, TContainer, TSprite>;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface WizardCraftReviewBrowserProductionOptions<
  TTexture extends WizardCraftTexture,
  TContainer extends WizardCraftBrowserPixiContainer,
  TSprite extends WizardCraftBrowserPixiSprite<TTexture>,
> extends Omit<
  WizardCraftBrowserProductionOptions<TTexture, TContainer, TSprite>,
  "assets"
> {
  readonly assets: Omit<WizardCraftBrowserAssetLoaderOptions, "entries">;
  readonly assetBasePath?: string;
  /** @deprecated Use assetBasePath. */
  readonly reviewAssetBasePath?: string;
}

const REVIEW_EMBEDDED_ASSETS = Object.freeze([
  "reels.mask.1",
  "reels.mask.2",
  "reels.mask.3",
  "reels.mask.4",
  "reels.mask.5",
  "dragon.idle",
  "dragon.idle.static",
  "dragon.inhale",
  "dragon.attack.quick",
  "dragon.claim",
  "dragon.block",
] as const);

const BASE_PLATE_EMBEDDED_ASSETS = Object.freeze([
  "environment.sky",
  "environment.castle",
  "cabinet.title",
  "cabinet.lintel",
  "cabinet.pillar.dragon",
  "cabinet.pillar.wizard",
  "cabinet.staircase.wizard",
  "cabinet.sill",
  "cabinet.crest.base",
  "dragon.rear.tail",
  "dragon.front.head",
  "dragon.front.jaw",
  "dragon.front.jaw.attack",
  "dragon.front.eye",
  "dragon.front.eye.anticipation",
  "dragon.front.eye.attack",
  "dragon.front.coil",
  "wizard.idle",
  "wizard.idle.static",
  "wizard.charge",
  "wizard.cast.quick",
  "wizard.claim",
  "wizard.block",
  "wizard.body",
  "wizard.hat.idle",
  "wizard.hat.charge",
  "wizard.hat.cast",
  "wizard.hat.block",
  "wizard.eyes",
] as const);

function configureWizardCraftReviewComposition<
  TTexture extends WizardCraftTexture,
  TContainer extends WizardCraftBrowserPixiContainer,
  TSprite extends WizardCraftBrowserPixiSprite<TTexture>,
>(
  scene: WizardCraftPixiAssetScene<TTexture, TContainer, TSprite>,
): void {
  const base = scene.sprite("environment.base");
  base.x = 0;
  base.y = 0;
  base.width = 640;
  base.height = 360;
  base.alpha = 1;
  base.visible = true;
  for (const id of BASE_PLATE_EMBEDDED_ASSETS) {
    const sprite = scene.sprite(id);
    sprite.alpha = 0;
    sprite.visible = false;
  }
  for (const id of REVIEW_EMBEDDED_ASSETS) {
    // Review composites and raster UI stand-ins must never become scene art.
    const sprite = scene.sprite(id);
    sprite.alpha = 0;
    sprite.visible = false;
  }

  // Independent Dragon rig. Rear tail passes behind the live reel window;
  // head, neck, claw, eye, and foreground coil pass in front.
  for (const id of ["dragon.rear.tail"] as const) {
    const sprite = scene.sprite(id);
    const bounds = WIZARD_CRAFT_DRAGON_RIG.layers
      .find(({ assetId }) => assetId === id)!.logicalBounds;
    sprite.x = bounds.x;
    sprite.y = bounds.y;
    sprite.width = bounds.width;
    sprite.height = bounds.height;
    sprite.alpha = 1;
    sprite.visible = true;
  }
  for (const id of [
    "dragon.front.head",
    "dragon.front.jaw",
    "dragon.front.eye",
  ] as const) {
    const sprite = scene.sprite(id);
    const bounds = WIZARD_CRAFT_DRAGON_RIG.layers
      .find(({ assetId }) => assetId === id)!.logicalBounds;
    sprite.x = bounds.x;
    sprite.y = bounds.y;
    sprite.width = bounds.width;
    sprite.height = bounds.height;
    sprite.alpha = 1;
    sprite.visible = true;
  }
  for (const id of [
    "dragon.front.jaw.attack",
    "dragon.front.eye.anticipation",
    "dragon.front.eye.attack",
  ] as const) {
    const sprite = scene.sprite(id);
    sprite.x = 0;
    sprite.y = 0;
    sprite.width = WIZARD_CRAFT_DRAGON_RIG.designSize.width;
    sprite.height = WIZARD_CRAFT_DRAGON_RIG.designSize.height;
    sprite.alpha = 1;
    sprite.visible = false;
  }
  for (const id of [
    "wizard.idle",
    "wizard.idle.static",
    "wizard.charge",
    "wizard.cast.quick",
    "wizard.claim",
    "wizard.block",
    "wizard.body",
    "wizard.hat.idle",
    "wizard.hat.charge",
    "wizard.hat.cast",
    "wizard.hat.block",
    "wizard.eyes",
  ] as const) {
    const sprite = scene.sprite(id);
    sprite.x = -24;
    sprite.y = 0;
    sprite.width = 640;
    sprite.height = 360;
    sprite.alpha = 1;
  }
  scene.sprite("wizard.idle").visible = true;
  scene.sprite("wizard.body").visible = true;
  scene.sprite("wizard.hat.idle").visible = true;
  scene.sprite("wizard.eyes").visible = true;
  for (const id of ["dragon.front.coil"] as const) {
    const sprite = scene.sprite(id);
    const bounds = WIZARD_CRAFT_DRAGON_RIG.layers
      .find(({ assetId }) => assetId === id)!.logicalBounds;
    sprite.x = bounds.x;
    sprite.y = bounds.y;
    sprite.width = bounds.width;
    sprite.height = bounds.height;
    sprite.alpha = 1;
    sprite.visible = true;
  }
  const fireBeam = [
    "effects.fire.core",
    "effects.fire.edge",
  ] as const;
  for (const id of fireBeam) {
    const sprite = scene.sprite(id);
    sprite.x = 92;
    sprite.y = 142;
    sprite.width = 300;
    sprite.height = 94;
  }
  const mouthCharge = scene.sprite("effects.fire.embers");
  mouthCharge.x = 148;
  mouthCharge.y = 178;
  mouthCharge.width = 28;
  mouthCharge.height = 28;
  const nostrilCharge = scene.sprite("effects.fire.smoke");
  nostrilCharge.x = 151;
  nostrilCharge.y = 164;
  nostrilCharge.width = 18;
  nostrilCharge.height = 18;
  const magic = [
    "effects.magic.bolt",
    "effects.magic.trail",
    "effects.magic.runes",
  ] as const;
  for (const id of magic) {
    const sprite = scene.sprite(id);
    sprite.x = 315;
    // The artwork's energized source sits near its vertical center. Align that
    // source with the completed Wizard's casting orb instead of launching the
    // bolt from empty space halfway down the reels.
    sprite.y = 70;
    sprite.width = 320;
    sprite.height = 150;
  }
  for (const id of [
    "effects.clash.core",
    "effects.clash.ring",
    "effects.clash.multiplier",
  ] as const) {
    const sprite = scene.sprite(id);
    sprite.y = 176;
    sprite.width = 72;
    sprite.height = 72;
  }
  const ward = scene.sprite("effects.block.ward");
  ward.y = 176;
  ward.width = 72;
  ward.height = 72;
  const firewall = scene.sprite("effects.block.firewall");
  firewall.y = 164;
  firewall.width = 52;
  firewall.height = 96;

  // The coherent plate remains authoritative after legacy registration code
  // has positioned optional overlays. This prevents contaminated crops from
  // resurfacing during the final scene assembly.
  for (const id of BASE_PLATE_EMBEDDED_ASSETS) {
    const sprite = scene.sprite(id);
    sprite.alpha = 0;
    sprite.visible = false;
  }
  base.alpha = 1;
  base.visible = true;
}

function encodedAudio(
  assets: Awaited<ReturnType<typeof loadWizardCraftBrowserAssets>>,
): ReadonlyMap<WizardCraftBrowserAudioAssetId, ArrayBuffer> {
  return new Map(
    [...assets.assets.values()]
      .filter((asset) => asset.kind === "audio")
      .map((asset) => [
        asset.id as WizardCraftBrowserAudioAssetId,
        asset.bytes,
      ] as const),
  );
}

export async function createWizardCraftBrowserProductionApp<
  TTexture extends WizardCraftTexture,
  TContainer extends WizardCraftBrowserPixiContainer,
  TSprite extends WizardCraftBrowserPixiSprite<TTexture>,
>(
  options: WizardCraftBrowserProductionOptions<TTexture, TContainer, TSprite>,
): Promise<WizardCraftBrowserProductionApp<TTexture, TContainer, TSprite>> {
  const assets = await loadWizardCraftBrowserAssets(options.assets);
  let textures: WizardCraftTextureBundle<TTexture> | null = null;
  let scene: WizardCraftPixiAssetScene<TTexture, TContainer, TSprite> | null =
    null;
  let runtime: WizardCraftProductionRuntime | null = null;
  let unmount: (() => void) | null = null;

  try {
    textures = await createWizardCraftTextureBundle({
      assets,
      adapter: options.textureAdapter,
      ...(options.decodeImage === undefined
        ? {}
        : { decode: options.decodeImage }),
    });
    const decodedAudio = await decodeWizardCraftAudioBuffers(
      options.audioContext,
      encodedAudio(assets),
    );
    const cueIds = new Set<string>(WIZARD_CRAFT_AUDIO_CUE_IDS);
    const decodedEffects = new Map(
      [...decodedAudio].filter(([id]) => cueIds.has(id)),
    ) as ReadonlyMap<WizardCraftAudioCueId, unknown>;
    const audio = new WizardCraftWebAudioBackend(
      options.audioContext,
      decodedEffects,
    );
    const musicBuffer = decodedAudio.get(WIZARD_CRAFT_MUSIC_TRACK_ID);
    const music = musicBuffer === undefined
      ? undefined
      : new WizardCraftWebMusicBackend(
        options.audioContext,
        new Map<WizardCraftMusicTrackId, unknown>([
          [WIZARD_CRAFT_MUSIC_TRACK_ID, musicBuffer],
        ]),
      );
    scene = createWizardCraftPixiAssetScene({
      textures: textures.textures,
      adapter: options.displayAdapter,
    });
    const mounted = options.mount?.(scene.root);
    unmount = typeof mounted === "function" ? mounted : null;
    const components = options.createViewComponents(scene);
    const views = {
      reels: new WizardCraftReelSpriteView({
        scene,
        cells: components.reelCells,
        overlays: components.reelOverlays,
      }),
      dragon: new WizardCraftCharacterSpriteView(
        "dragon",
        scene,
        undefined,
        { staticPlate: options.staticCharacterPlate ?? false },
      ),
      wizard: new WizardCraftCharacterSpriteView(
        "wizard",
        scene,
        undefined,
        { staticPlate: options.staticCharacterPlate ?? false },
      ),
      clash: new WizardCraftClashSpriteView(scene),
      cabinet: new WizardCraftCabinetSpriteView({
        scene,
        lighting: components.cabinetLighting,
      }),
      ui: new WizardCraftCanvasUiSpriteView({
        text: components.uiText,
        multipliers: components.uiMultipliers,
      }),
    };
    runtime = new WizardCraftProductionRuntime({
      ...options.runtime,
      session: options.session,
      views,
      audioBackend: audio,
      ...(music === undefined ? {} : { musicBackend: music }),
      loadedAssets: assets.productionAssetIds,
    });
    if (options.initialSize !== undefined) {
      runtime.resize(options.initialSize.width, options.initialSize.height);
    }
    if (options.autoStart !== false) await runtime.start();

    let disposed = false;
    const ownedRuntime = runtime;
    const ownedScene = scene;
    const ownedTextures = textures;
    const ownedUnmount = unmount;
    return Object.freeze({
      runtime: ownedRuntime,
      textures: ownedTextures,
      scene: ownedScene,
      resize(width: number, height: number): void {
        if (disposed) throw new Error("WIZARD CRAFT browser app is disposed");
        ownedRuntime.resize(width, height);
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        ownedRuntime.dispose();
        try {
          ownedUnmount?.();
        } finally {
          ownedScene.destroy();
          ownedTextures.destroy();
        }
      },
    });
  } catch (error) {
    runtime?.dispose();
    try {
      unmount?.();
    } finally {
      scene?.destroy();
      textures?.destroy();
    }
    if (runtime === null) options.session.dispose();
    throw error;
  }
}

/**
 * Boots the real production lifecycle with the complete current review asset
 * library. The explicit name prevents candidate art from being mistaken for a
 * final, runtime-approved release manifest.
 */
export async function createWizardCraftRegisteredBrowserProductionApp<
  TTexture extends WizardCraftTexture,
  TContainer extends WizardCraftBrowserPixiContainer,
  TSprite extends WizardCraftBrowserPixiSprite<TTexture>,
>(
  options: WizardCraftReviewBrowserProductionOptions<
    TTexture,
    TContainer,
    TSprite
  >,
): Promise<WizardCraftBrowserProductionApp<TTexture, TContainer, TSprite>> {
  const {
    assets,
    assetBasePath,
    reviewAssetBasePath,
    ...production
  } = options;
  const shouldStart = production.autoStart !== false;
  const app = await createWizardCraftBrowserProductionApp({
    ...production,
    autoStart: false,
    staticCharacterPlate: true,
    assets: {
      ...assets,
      entries: wizardCraftProductionBrowserEntries(
        assetBasePath ?? reviewAssetBasePath,
      ),
    },
  });
  configureWizardCraftReviewComposition(app.scene);
  if (shouldStart) await app.runtime.start();
  // Runtime startup restores semantic character/cabinet state. Reapply the
  // review-only visibility lock afterward so opaque embedded composites cannot
  // be re-enabled over the fitted complete plate.
  configureWizardCraftReviewComposition(app.scene);
  return app;
}


/** @deprecated Local review alias retained for existing tooling. */
export const createWizardCraftReviewBrowserProductionApp =
  createWizardCraftRegisteredBrowserProductionApp;
