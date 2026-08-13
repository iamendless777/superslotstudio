import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

import {
  WIZARD_CRAFT_AUDIO_CUE_IDS,
  WIZARD_CRAFT_ASSET_SLOTS,
  loadWizardCraftBrowserAssets,
  wizardCraftAudioEntry,
  wizardCraftBattleWinAudioEntries,
  wizardCraftImageEntry,
  wizardCraftMechanicalAudioEntries,
  wizardCraftMusicEntry,
  wizardCraftProductionAudioEntries,
  wizardCraftProductionSoundEntries,
  wizardCraftReviewEffectImageEntries,
  wizardCraftReviewBrowserEntries,
  wizardCraftReviewImageEntries,
  wizardCraftSymbolAudioEntries,
} from "../src/index.js";

function entries() {
  return [
    ...WIZARD_CRAFT_ASSET_SLOTS.map((slot) =>
      wizardCraftImageEntry(slot.id, `assets/${slot.id}.png`)
    ),
    wizardCraftAudioEntry("clash.impact", "assets/clash.impact.ogg"),
  ];
}

const fetchAssets: typeof fetch = async (input) => {
  const url = String(input);
  const audio = url.endsWith(".ogg");
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: {
      "content-type": audio ? "audio/ogg" : "image/png",
      "content-length": "3",
    },
  });
};

test("builds the authored WIZARD CRAFT symbol audio manifest entries", () => {
  const audio = wizardCraftSymbolAudioEntries("cdn/audio/");
  assert.equal(audio.length, 9);
  assert.deepEqual(audio[0], {
    id: "symbol.ember",
    kind: "audio",
    url: "cdn/audio/ember-v1.wav",
  });
  assert.deepEqual(audio.at(-1), {
    id: "symbol.crystal",
    kind: "audio",
    url: "cdn/audio/crystal-v1.wav",
  });
  assert.throws(
    () => wizardCraftSymbolAudioEntries("///"),
    /audio base path cannot be empty/,
  );
});

test("maps reviewed combat effects to their production runtime slots", () => {
  const effects = wizardCraftReviewEffectImageEntries("cdn/wizard-craft/");
  assert.deepEqual(effects, [
    {
      id: "effects.magic.bolt",
      kind: "image",
      url: "cdn/wizard-craft/effects/wizard-magic-bolt-candidate-v1.png",
    },
    {
      id: "effects.clash.core",
      kind: "image",
      url: "cdn/wizard-craft/effects/clash-contact-core-candidate-v1.png",
    },
  ]);
  assert.equal(new Set(effects.map(({ id }) => id)).size, effects.length);
  assert.throws(
    () => wizardCraftReviewEffectImageEntries("///"),
    /image base path cannot be empty/,
  );
});

test("builds a complete existing-file review image manifest", () => {
  const images = wizardCraftReviewImageEntries();
  assert.equal(images.length, WIZARD_CRAFT_ASSET_SLOTS.length);
  assert.deepEqual(
    images.map(({ id }) => id),
    WIZARD_CRAFT_ASSET_SLOTS.map(({ id }) => id),
  );
  assert.equal(new Set(images.map(({ id }) => id)).size, images.length);
  assert.equal(images.every(({ kind }) => kind === "image"), true);
  assert.equal(images.every(({ url }) => existsSync(url)), true);
  assert.equal(
    images.find(({ id }) => id === "effects.magic.bolt")?.url,
    "art-src/wizard-craft/effects/wizard-magic-bolt-diagonal-runtime-v1.png",
  );
  assert.equal(
    images.find(({ id }) => id === "effects.fire.core")?.url,
    "art-src/wizard-craft/effects/dragon-fire-quick-runtime-v1.png",
  );
  assert.equal(
    images.find(({ id }) => id === "dragon.front.jaw.attack")?.url,
    "art-src/wizard-craft/runtime/empty-layer-v1.png",
  );
  assert.equal(
    images.find(({ id }) => id === "symbol.dragon-wild.idle")?.url,
    "art-src/wizard-craft/symbols/dragon-wild/approved-native-68x51-v1.png",
  );
  assert.equal(
    images.find(({ id }) => id === "cabinet.crest.base")?.url,
    "art-src/wizard-craft/cabinet/clash-crest-base-runtime-v1.png",
  );
  assert.equal(
    images.find(({ id }) => id === "cabinet.crest.clash")?.url,
    "art-src/wizard-craft/cabinet/clash-crest-active-runtime-v1.png",
  );
  assert.equal(
    images.find(({ id }) => id === "effects.clash.core")?.url,
    "art-src/wizard-craft/effects/clash-energy-core-runtime-v1.png",
  );
  assert.equal(
    images.find(({ id }) => id === "effects.clash.ring")?.url,
    "art-src/wizard-craft/effects/clash-gold-ring-runtime-v1.png",
  );
  assert.equal(
    images.find(({ id }) => id === "effects.clash.multiplier")?.url,
    "art-src/wizard-craft/effects/clash-cap-flare-runtime-v1.png",
  );
  assert.equal(
    images.find(({ id }) => id === "effects.block.ward")?.url,
    "art-src/wizard-craft/effects/wizard-ward-runtime-v1.png",
  );
  assert.equal(
    images.find(({ id }) => id === "effects.block.firewall")?.url,
    "art-src/wizard-craft/effects/dragon-firewall-runtime-v1.png",
  );
  assert.throws(
    () => wizardCraftReviewImageEntries("///"),
    /image base path cannot be empty/,
  );
});

test("combines every review image and authored sound for browser boot", () => {
  const entries = wizardCraftReviewBrowserEntries();
  assert.equal(
    entries.length,
    WIZARD_CRAFT_ASSET_SLOTS.length + WIZARD_CRAFT_AUDIO_CUE_IDS.length + 1,
  );
  assert.equal(
    new Set(entries.map(({ id, kind }) => `${kind}:${id}`)).size,
    entries.length,
  );
  assert.deepEqual(
    entries
      .filter(({ id }) => id === "dragon.inhale")
      .map(({ kind }) => kind)
      .sort(),
    ["audio", "image"],
  );
  assert.equal(entries.at(-1)?.id, wizardCraftMusicEntry().id);
  assert.throws(
    () => wizardCraftReviewBrowserEntries("///"),
    /asset base path cannot be empty/,
  );
});

test("builds the authored WIZARD CRAFT mechanical audio manifest entries", () => {
  const audio = wizardCraftMechanicalAudioEntries("cdn/mechanics/");
  assert.equal(audio.length, 14);
  assert.deepEqual(audio[0], {
    id: "reels.stop",
    kind: "audio",
    url: "cdn/mechanics/reels-stop-v1.wav",
  });
  assert.deepEqual(audio.at(-1), {
    id: "reel.temporary.clear",
    kind: "audio",
    url: "cdn/mechanics/temporary-clear-v1.wav",
  });
  assert.equal(new Set(audio.map(({ id }) => id)).size, audio.length);
});

test("builds complete, unique WIZARD CRAFT battle and production audio entries", () => {
  const battle = wizardCraftBattleWinAudioEntries("cdn/battle/");
  assert.equal(battle.length, 11);
  assert.deepEqual(battle[0], {
    id: "dragon.inhale",
    kind: "audio",
    url: "cdn/battle/dragon-inhale-v1.wav",
  });
  assert.deepEqual(battle.at(-1), {
    id: "win.max",
    kind: "audio",
    url: "cdn/battle/win-max-v1.wav",
  });

  const production = wizardCraftProductionAudioEntries("cdn/audio/");
  assert.equal(production.length, 34);
  assert.equal(new Set(production.map(({ id }) => id)).size, production.length);
  assert.deepEqual(
    [...production.map(({ id }) => id)].sort(),
    [...WIZARD_CRAFT_AUDIO_CUE_IDS].sort(),
  );
  assert.equal(production.every(({ kind }) => kind === "audio"), true);
  assert.equal(
    production.find(({ id }) => id === "reels.stop")?.url,
    "cdn/audio/mechanics/reels-stop-v1.wav",
  );
  assert.equal(
    production.find(({ id }) => id === "win.max")?.url,
    "cdn/audio/battle-win/win-max-v1.wav",
  );

  const sound = wizardCraftProductionSoundEntries("cdn/audio/");
  assert.equal(sound.length, 35);
  assert.deepEqual(sound.at(-1), wizardCraftMusicEntry(
    "cdn/audio/music/wizard-craft-hybrid-loop-runtime-v1.mp3",
  ));
});

test("keeps every authored cue acoustically independent at the file boundary", () => {
  const audio = wizardCraftProductionAudioEntries();
  const fingerprints = audio.map(({ url }) =>
    createHash("sha256").update(readFileSync(url)).digest("hex")
  );
  assert.equal(new Set(fingerprints).size, audio.length);
});

test("keeps the unique production payload within mobile delivery budgets", () => {
  const unique = new Map(
    wizardCraftReviewBrowserEntries().map((entry) => [entry.url, entry]),
  );
  let images = 0;
  let audio = 0;
  for (const entry of unique.values()) {
    const bytes = statSync(entry.url).size;
    if (entry.kind === "image") images += bytes;
    if (entry.kind === "audio") audio += bytes;
  }
  assert.ok(images <= 5_000_000, `image payload is ${images} bytes`);
  assert.ok(audio <= 2_250_000, `audio payload is ${audio} bytes`);
  assert.ok(
    images + audio <= 7_250_000,
    `total payload is ${images + audio} bytes`,
  );
});

test("loads a complete same-origin production manifest with progress", async () => {
  const progress: string[] = [];
  const bundle = await loadWizardCraftBrowserAssets({
    baseUrl: "https://studio.cdn.stake-engine.com/wizard-craft/",
    entries: entries(),
    fetch: fetchAssets,
    onProgress: ({ loaded, total, id }) => {
      progress.push(`${loaded}/${total}:${id}`);
    },
  });

  assert.equal(bundle.assets.size, entries().length);
  assert.equal(
    bundle.productionAssetIds.size,
    WIZARD_CRAFT_ASSET_SLOTS.length,
  );
  assert.equal(bundle.audioAssetIds.has("clash.impact"), true);
  assert.equal(progress.length, entries().length);
  assert.match(progress.at(-1) ?? "", new RegExp(`^${entries().length}/`));
});

test("fetches a shared texture once while retaining each semantic asset ID", async () => {
  const manifest = entries();
  manifest[1] = { ...manifest[1]!, url: manifest[0]!.url };
  let fetches = 0;
  const bundle = await loadWizardCraftBrowserAssets({
    baseUrl: "https://studio.cdn.stake-engine.com/wizard-craft/",
    entries: manifest,
    fetch: async (...args) => {
      fetches += 1;
      return fetchAssets(...args);
    },
  });

  assert.equal(fetches, manifest.length - 1);
  assert.equal(bundle.assets.size, manifest.length);
  assert.equal(
    bundle.assets.get(manifest[0]!.id)?.bytes,
    bundle.assets.get(manifest[1]!.id)?.bytes,
  );
});

test("rejects incomplete, external, insecure, mistyped, and oversized assets", async () => {
  await assert.rejects(() => loadWizardCraftBrowserAssets({
    baseUrl: "https://studio.cdn.stake-engine.com/game/",
    entries: [],
    fetch: fetchAssets,
  }), /Missing WIZARD CRAFT production assets/);

  const external = entries();
  external[0] = { ...external[0]!, url: "https://tracker.example/asset.png" };
  await assert.rejects(() => loadWizardCraftBrowserAssets({
    baseUrl: "https://studio.cdn.stake-engine.com/game/",
    entries: external,
    fetch: fetchAssets,
  }), /origin is not allowed/);

  const insecure = entries();
  insecure[0] = { ...insecure[0]!, url: "http://studio.example/asset.png" };
  await assert.rejects(() => loadWizardCraftBrowserAssets({
    baseUrl: "https://studio.cdn.stake-engine.com/game/",
    entries: insecure,
    allowedOrigins: ["http://studio.example"],
    fetch: fetchAssets,
  }), /must use HTTPS/);

  await assert.rejects(() => loadWizardCraftBrowserAssets({
    baseUrl: "https://studio.cdn.stake-engine.com/game/",
    entries: entries(),
    fetch: async () => new Response("html", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  }), /invalid content type/);

  await assert.rejects(() => loadWizardCraftBrowserAssets({
    baseUrl: "https://studio.cdn.stake-engine.com/game/",
    entries: entries(),
    maximumAssetBytes: 2,
    fetch: fetchAssets,
  }), /exceeds size limit/);
});
