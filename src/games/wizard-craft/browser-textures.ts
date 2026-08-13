import type {
  WizardCraftAssetId,
} from "./assets.js";
import type {
  WizardCraftBrowserAssetBundle,
  WizardCraftLoadedBrowserAsset,
} from "./browser-assets.js";

export interface WizardCraftDecodedImage {
  readonly width: number;
  readonly height: number;
  close?(): void;
}

export interface WizardCraftTexture {
  destroy(destroySource?: boolean): void;
}

/**
 * The only version-specific Pixi seam. A Pixi v8 implementation can delegate
 * to Texture.from(source) while tests and other renderers remain dependency-free.
 */
export interface WizardCraftPixiTextureAdapter<
  TTexture extends WizardCraftTexture,
> {
  from(source: WizardCraftDecodedImage, label: string): TTexture;
}

export interface WizardCraftPixiTextureConstructor<
  TTexture extends WizardCraftTexture,
> {
  from(source: WizardCraftDecodedImage): TTexture;
}

export function wizardCraftPixiTextureAdapter<
  TTexture extends WizardCraftTexture,
>(
  texture: WizardCraftPixiTextureConstructor<TTexture>,
): WizardCraftPixiTextureAdapter<TTexture> {
  return Object.freeze({
    from: (source: WizardCraftDecodedImage) => texture.from(source),
  });
}

export interface WizardCraftTextureRecord<
  TTexture extends WizardCraftTexture,
> {
  readonly id: WizardCraftAssetId;
  readonly image: WizardCraftDecodedImage;
  readonly texture: TTexture;
}

export interface WizardCraftTextureBundle<
  TTexture extends WizardCraftTexture,
> {
  readonly textures: ReadonlyMap<WizardCraftAssetId, TTexture>;
  readonly records: ReadonlyMap<WizardCraftAssetId, WizardCraftTextureRecord<TTexture>>;
  destroy(): void;
}

export interface WizardCraftTextureProgress {
  readonly loaded: number;
  readonly total: number;
  readonly id: WizardCraftAssetId;
}

export interface WizardCraftTextureFactoryOptions<
  TTexture extends WizardCraftTexture,
> {
  readonly assets: WizardCraftBrowserAssetBundle;
  readonly adapter: WizardCraftPixiTextureAdapter<TTexture>;
  readonly decode?: (
    blob: Blob,
    options?: ImageBitmapOptions,
  ) => Promise<WizardCraftDecodedImage>;
  readonly onProgress?: (progress: WizardCraftTextureProgress) => void;
}

function imageAssets(
  bundle: WizardCraftBrowserAssetBundle,
): readonly WizardCraftLoadedBrowserAsset[] {
  return [...bundle.assets.values()].filter((asset) => asset.kind === "image");
}

function closeImage(image: WizardCraftDecodedImage): void {
  try {
    image.close?.();
  } catch {
    // Disposal continues so one browser resource cannot leak the remainder.
  }
}

function destroyRecord<TTexture extends WizardCraftTexture>(
  record: Pick<WizardCraftTextureRecord<TTexture>, "image" | "texture">,
): void {
  try {
    record.texture.destroy(false);
  } catch {
    // The decoded image is still closed below.
  }
  closeImage(record.image);
}

export async function createWizardCraftTextureBundle<
  TTexture extends WizardCraftTexture,
>(
  options: WizardCraftTextureFactoryOptions<TTexture>,
): Promise<WizardCraftTextureBundle<TTexture>> {
  const decode = options.decode ?? globalThis.createImageBitmap;
  if (decode === undefined) {
    throw new Error("Browser image decoding is unavailable");
  }

  const images = imageAssets(options.assets);
  const records = new Map<
    WizardCraftAssetId,
    WizardCraftTextureRecord<TTexture>
  >();
  const resources = new Map<
    string,
    Readonly<{ image: WizardCraftDecodedImage; texture: TTexture }>
  >();

  try {
    for (const asset of images) {
      const id = asset.id as WizardCraftAssetId;
      const resourceKey = `${asset.contentType}:${asset.url.href}`;
      let resource = resources.get(resourceKey);
      if (resource === undefined) {
        const blob = new Blob([asset.bytes], { type: asset.contentType });
        const image = await decode(blob, {
          colorSpaceConversion: "default",
          premultiplyAlpha: "premultiply",
        });
        if (
          !Number.isSafeInteger(image.width) ||
          !Number.isSafeInteger(image.height) ||
          image.width < 1 ||
          image.height < 1
        ) {
          closeImage(image);
          throw new Error(`WIZARD CRAFT image has invalid dimensions: ${id}`);
        }

        let texture: TTexture;
        try {
          texture = options.adapter.from(image, id);
        } catch (error) {
          closeImage(image);
          throw error;
        }
        resource = Object.freeze({ image, texture });
        resources.set(resourceKey, resource);
      }
      const record = Object.freeze({
        id,
        image: resource.image,
        texture: resource.texture,
      });
      records.set(id, record);
      options.onProgress?.({
        loaded: records.size,
        total: images.length,
        id,
      });
    }
  } catch (error) {
    for (const resource of resources.values()) destroyRecord(resource);
    throw error;
  }

  let destroyed = false;
  const textures = new Map(
    [...records].map(([id, record]) => [id, record.texture] as const),
  );
  return Object.freeze({
    textures,
    records,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const resource of resources.values()) destroyRecord(resource);
      textures.clear();
      records.clear();
      resources.clear();
    },
  });
}
