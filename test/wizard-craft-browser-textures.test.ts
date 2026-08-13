import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_ASSET_SLOTS,
  createWizardCraftTextureBundle,
  loadWizardCraftBrowserAssets,
  wizardCraftPixiTextureAdapter,
  wizardCraftImageEntry,
  type WizardCraftDecodedImage,
  type WizardCraftTexture,
} from "../src/index.js";

function entries() {
  return WIZARD_CRAFT_ASSET_SLOTS.map((slot) =>
    wizardCraftImageEntry(slot.id, `assets/${slot.id}.png`)
  );
}

async function loadedAssets(manifest = entries()) {
  return loadWizardCraftBrowserAssets({
    baseUrl: "https://studio.cdn.stake-engine.com/wizard-craft/",
    entries: manifest,
    fetch: async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": "3",
      },
    }),
  });
}

class TestTexture implements WizardCraftTexture {
  readonly label: string;
  destroyed = 0;

  constructor(label: string) {
    this.label = label;
  }

  destroy(destroySource?: boolean): void {
    assert.equal(destroySource, false);
    this.destroyed += 1;
  }
}

test("decodes every production image into an addressable Pixi texture", async () => {
  const assets = await loadedAssets();
  const closed: string[] = [];
  const progress: string[] = [];
  let decoded = 0;

  const bundle = await createWizardCraftTextureBundle({
    assets,
    decode: async () => {
      const id = entries()[decoded]!.id;
      decoded += 1;
      return {
        width: 64,
        height: 64,
        close: () => closed.push(id),
      };
    },
    adapter: {
      from: (_image, label) => new TestTexture(label),
    },
    onProgress: ({ loaded, total, id }) => {
      progress.push(`${loaded}/${total}:${id}`);
    },
  });

  assert.equal(bundle.textures.size, WIZARD_CRAFT_ASSET_SLOTS.length);
  assert.equal(bundle.textures.get("dragon.idle")?.label, "dragon.idle");
  assert.equal(progress.length, WIZARD_CRAFT_ASSET_SLOTS.length);

  const textures = [...bundle.textures.values()];
  bundle.destroy();
  bundle.destroy();
  assert.equal(closed.length, WIZARD_CRAFT_ASSET_SLOTS.length);
  assert.equal(textures.every((texture) => texture.destroyed === 1), true);
  assert.equal(bundle.textures.size, 0);
});

test("shares one decoded texture across semantic IDs with the same image URL", async () => {
  const manifest = entries();
  manifest[1] = { ...manifest[1]!, url: manifest[0]!.url };
  const assets = await loadedAssets(manifest);
  let decoded = 0;
  const textures: TestTexture[] = [];
  const bundle = await createWizardCraftTextureBundle({
    assets,
    decode: async () => {
      decoded += 1;
      return { width: 64, height: 64 };
    },
    adapter: {
      from: (_image, label) => {
        const texture = new TestTexture(label);
        textures.push(texture);
        return texture;
      },
    },
  });

  assert.equal(decoded, manifest.length - 1);
  assert.equal(textures.length, manifest.length - 1);
  assert.equal(
    bundle.textures.get(manifest[0]!.id),
    bundle.textures.get(manifest[1]!.id),
  );
  const shared = bundle.textures.get(manifest[0]!.id)! as TestTexture;
  bundle.destroy();
  assert.equal(shared.destroyed, 1);
});

test("atomically cleans up decoded resources when texture creation fails", async () => {
  const assets = await loadedAssets();
  const images: Array<WizardCraftDecodedImage & { closed: boolean }> = [];
  let created = 0;
  const textures: TestTexture[] = [];

  await assert.rejects(() => createWizardCraftTextureBundle({
    assets,
    decode: async () => {
      const image = {
        width: 32,
        height: 32,
        closed: false,
        close() {
          image.closed = true;
        },
      };
      images.push(image);
      return image;
    },
    adapter: {
      from: (_image, label) => {
        created += 1;
        if (created === 3) throw new Error("GPU upload failed");
        const texture = new TestTexture(label);
        textures.push(texture);
        return texture;
      },
    },
  }), /GPU upload failed/);

  assert.equal(images.length, 3);
  assert.equal(images.every((image) => image.closed), true);
  assert.equal(textures.every((texture) => texture.destroyed === 1), true);
});

test("rejects decoded images with impossible dimensions", async () => {
  const assets = await loadedAssets();
  let closed = false;

  await assert.rejects(() => createWizardCraftTextureBundle({
    assets,
    decode: async () => ({
      width: 0,
      height: 64,
      close: () => {
        closed = true;
      },
    }),
    adapter: {
      from: (_image, label) => new TestTexture(label),
    },
  }), /invalid dimensions/);
  assert.equal(closed, true);
});

test("adapts the Pixi Texture.from boundary without importing Pixi", () => {
  const texture = new TestTexture("pixi");
  const adapter = wizardCraftPixiTextureAdapter({
    from: (source) => {
      assert.equal(source.width, 16);
      return texture;
    },
  });

  assert.equal(adapter.from({ width: 16, height: 16 }, "dragon.idle"), texture);
});
