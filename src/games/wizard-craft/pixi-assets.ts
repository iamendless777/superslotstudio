import {
  WIZARD_CRAFT_ASSET_SLOTS,
  type WizardCraftAssetId,
} from "./assets.js";
import type { WizardCraftTexture } from "./browser-textures.js";
import type { WizardCraftCueChannel } from "./cues.js";

export interface WizardCraftPixiDisplayObject {
  visible: boolean;
}

export interface WizardCraftPixiContainer extends WizardCraftPixiDisplayObject {}

export interface WizardCraftPixiSprite<TTexture extends WizardCraftTexture>
extends WizardCraftPixiDisplayObject {
  readonly texture: TTexture;
}

export interface WizardCraftPixiDisplayAdapter<
  TTexture extends WizardCraftTexture,
  TContainer extends WizardCraftPixiContainer,
  TSprite extends WizardCraftPixiSprite<TTexture>,
> {
  createContainer(label: string): TContainer;
  createSprite(texture: TTexture, label: string): TSprite;
  addChild(parent: TContainer, child: TContainer | TSprite): void;
  destroySprite(sprite: TSprite): void;
  destroyContainer(container: TContainer): void;
}

export type WizardCraftPixiAssetContainers<
  TContainer extends WizardCraftPixiContainer,
> = Readonly<Record<WizardCraftCueChannel, TContainer>>;

export interface WizardCraftPixiAssetScene<
  TTexture extends WizardCraftTexture,
  TContainer extends WizardCraftPixiContainer,
  TSprite extends WizardCraftPixiSprite<TTexture>,
> {
  readonly root: TContainer;
  readonly containers: WizardCraftPixiAssetContainers<TContainer>;
  readonly sprites: ReadonlyMap<WizardCraftAssetId, TSprite>;
  sprite(id: WizardCraftAssetId): TSprite;
  setVisible(id: WizardCraftAssetId, visible: boolean): void;
  setReducedMotion(reduced: boolean): void;
  destroy(): void;
}

export interface WizardCraftPixiAssetSceneOptions<
  TTexture extends WizardCraftTexture,
  TContainer extends WizardCraftPixiContainer,
  TSprite extends WizardCraftPixiSprite<TTexture>,
> {
  readonly textures: ReadonlyMap<WizardCraftAssetId, TTexture>;
  readonly adapter: WizardCraftPixiDisplayAdapter<TTexture, TContainer, TSprite>;
}

const CHANNEL_ORDER = Object.freeze([
  "cabinet",
  "reels",
  "dragon",
  "wizard",
  "clash",
  "ui",
] as const satisfies readonly WizardCraftCueChannel[]);

const ALWAYS_VISIBLE = new Set<WizardCraftAssetId>([
  "environment.sky",
  "environment.castle",
  "environment.base",
  "environment.fog.low",
  "cabinet.title",
  "cabinet.lintel",
  "cabinet.pillar.dragon",
  "cabinet.pillar.wizard",
  "cabinet.staircase.wizard",
  "cabinet.pillar.dragon.runes",
  "cabinet.pillar.wizard.runes",
  "cabinet.sill",
  "cabinet.crest.base",
  "reels.backing",
  "dragon.rear.tail",
  "dragon.front.head",
  "dragon.front.jaw",
  "dragon.front.eye",
  "dragon.front.coil",
  "dragon.idle",
  "wizard.idle",
]);

function channelFor(
  layer: (typeof WIZARD_CRAFT_ASSET_SLOTS)[number]["layer"],
): WizardCraftCueChannel {
  if (
    layer === "environment" ||
    layer === "cabinet" ||
    layer === "dragonRear"
  ) return "cabinet";
  if (layer === "effects") return "clash";
  return layer;
}

export function createWizardCraftPixiAssetScene<
  TTexture extends WizardCraftTexture,
  TContainer extends WizardCraftPixiContainer,
  TSprite extends WizardCraftPixiSprite<TTexture>,
>(
  options: WizardCraftPixiAssetSceneOptions<TTexture, TContainer, TSprite>,
): WizardCraftPixiAssetScene<TTexture, TContainer, TSprite> {
  const missing = WIZARD_CRAFT_ASSET_SLOTS
    .filter((slot) => !options.textures.has(slot.id))
    .map((slot) => slot.id);
  if (missing.length > 0) {
    throw new Error(`Missing WIZARD CRAFT textures: ${missing.join(", ")}`);
  }

  const root = options.adapter.createContainer("wizard-craft.root");
  const mutableContainers = {} as Record<WizardCraftCueChannel, TContainer>;
  const createdContainers: TContainer[] = [root];
  const sprites = new Map<WizardCraftAssetId, TSprite>();

  try {
    for (const channel of CHANNEL_ORDER) {
      const container = options.adapter.createContainer(`wizard-craft.${channel}`);
      mutableContainers[channel] = container;
      createdContainers.push(container);
      options.adapter.addChild(root, container);
    }
    for (const slot of WIZARD_CRAFT_ASSET_SLOTS) {
      const texture = options.textures.get(slot.id)!;
      const sprite = options.adapter.createSprite(texture, slot.id);
      sprite.visible = ALWAYS_VISIBLE.has(slot.id);
      sprites.set(slot.id, sprite);
      options.adapter.addChild(
        mutableContainers[channelFor(slot.layer)],
        sprite,
      );
    }
  } catch (error) {
    for (const sprite of [...sprites.values()].reverse()) {
      try {
        options.adapter.destroySprite(sprite);
      } catch {
        // Continue cleanup while preserving the construction error.
      }
    }
    for (const container of [...createdContainers].reverse()) {
      try {
        options.adapter.destroyContainer(container);
      } catch {
        // Continue cleanup while preserving the construction error.
      }
    }
    throw error;
  }

  const containers = Object.freeze(mutableContainers);
  let destroyed = false;
  const scene = {
    root,
    containers,
    sprites,
    sprite(id: WizardCraftAssetId): TSprite {
      const result = sprites.get(id);
      if (result === undefined) {
        throw new Error(`Unknown WIZARD CRAFT sprite: ${id}`);
      }
      return result;
    },
    setVisible(id: WizardCraftAssetId, visible: boolean): void {
      scene.sprite(id).visible = visible;
    },
    setReducedMotion(reduced: boolean): void {
      for (const slot of WIZARD_CRAFT_ASSET_SLOTS) {
        if (!("reducedMotionReplacement" in slot)) continue;
        scene.sprite(slot.id).visible = !reduced;
        scene.sprite(slot.reducedMotionReplacement).visible = reduced;
      }
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const sprite of [...sprites.values()].reverse()) {
        try {
          options.adapter.destroySprite(sprite);
        } catch {
          // One broken display object cannot leak the rest of the scene.
        }
      }
      sprites.clear();
      for (const channel of [...CHANNEL_ORDER].reverse()) {
        try {
          options.adapter.destroyContainer(containers[channel]);
        } catch {
          // Continue ordered disposal.
        }
      }
      options.adapter.destroyContainer(root);
    },
  } satisfies WizardCraftPixiAssetScene<TTexture, TContainer, TSprite>;

  return Object.freeze(scene);
}
