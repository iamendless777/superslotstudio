import {
  assertWizardCraftVerticalSliceAssets,
  WIZARD_CRAFT_ASSET_SLOTS,
  type WizardCraftAssetId,
} from "./assets.js";
import type { WizardCraftAudioCueId } from "./cues.js";
import {
  WIZARD_CRAFT_MUSIC_TRACK_ID,
  type WizardCraftMusicTrackId,
} from "./music.js";

export type WizardCraftBrowserAudioAssetId =
  | WizardCraftAudioCueId
  | WizardCraftMusicTrackId;

export type WizardCraftBrowserAssetKind = "image" | "audio" | "font";

export interface WizardCraftBrowserAssetEntry {
  readonly id: string;
  readonly kind: WizardCraftBrowserAssetKind;
  readonly url: string;
}

export interface WizardCraftBrowserAssetProgress {
  readonly loaded: number;
  readonly total: number;
  readonly id: string;
}

export interface WizardCraftLoadedBrowserAsset {
  readonly id: string;
  readonly kind: WizardCraftBrowserAssetKind;
  readonly url: URL;
  readonly contentType: string;
  readonly bytes: ArrayBuffer;
}

export interface WizardCraftBrowserAssetBundle {
  readonly assets: ReadonlyMap<string, WizardCraftLoadedBrowserAsset>;
  readonly productionAssetIds: ReadonlySet<string>;
  readonly audioAssetIds: ReadonlySet<WizardCraftBrowserAudioAssetId>;
}

export interface WizardCraftBrowserAssetLoaderOptions {
  readonly baseUrl: string | URL;
  readonly entries: readonly WizardCraftBrowserAssetEntry[];
  readonly allowedOrigins?: readonly string[];
  readonly fetch?: typeof globalThis.fetch;
  readonly maximumAssetBytes?: number;
  readonly onProgress?: (progress: WizardCraftBrowserAssetProgress) => void;
}

const CONTENT_TYPES: Readonly<
  Record<WizardCraftBrowserAssetKind, readonly string[]>
> = {
  image: ["image/"],
  audio: ["audio/", "application/octet-stream"],
  font: ["font/", "application/font-", "application/octet-stream"],
};

function validContentType(
  kind: WizardCraftBrowserAssetKind,
  value: string | null,
): boolean {
  if (value === null) return false;
  const normalized = value.toLowerCase().split(";")[0]?.trim() ?? "";
  return CONTENT_TYPES[kind].some((prefix) => normalized.startsWith(prefix));
}

function allowedUrl(
  raw: string,
  base: URL,
  origins: ReadonlySet<string>,
): URL {
  const url = new URL(raw, base);
  if (url.username !== "" || url.password !== "") {
    throw new Error("WIZARD CRAFT assets cannot contain URL credentials");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(`WIZARD CRAFT asset URL must use HTTPS: ${url.href}`);
  }
  if (!origins.has(url.origin)) {
    throw new Error(`WIZARD CRAFT asset origin is not allowed: ${url.origin}`);
  }
  return url;
}

export async function loadWizardCraftBrowserAssets(
  options: WizardCraftBrowserAssetLoaderOptions,
): Promise<WizardCraftBrowserAssetBundle> {
  const base = new URL(options.baseUrl);
  const origins = new Set([base.origin, ...(options.allowedOrigins ?? [])]);
  const fetcher = options.fetch ?? globalThis.fetch;
  if (fetcher === undefined) throw new Error("Browser fetch is unavailable");
  const maximum = options.maximumAssetBytes ?? 16 * 1024 * 1024;
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new RangeError("WIZARD CRAFT maximum asset size is invalid");
  }

  const ids = new Set<string>();
  for (const entry of options.entries) {
    const scopedId = `${entry.kind}:${entry.id}`;
    if (entry.id.trim() === "" || ids.has(scopedId)) {
      throw new Error(`Invalid or duplicate WIZARD CRAFT asset ID ${entry.id}`);
    }
    ids.add(scopedId);
  }
  const productionIds = new Set(
    options.entries
      .filter((entry) => entry.kind === "image")
      .map((entry) => entry.id),
  );
  assertWizardCraftVerticalSliceAssets(productionIds);

  const assets = new Map<string, WizardCraftLoadedBrowserAsset>();
  const audioIds = new Set<WizardCraftBrowserAudioAssetId>();
  const fetched = new Map<string, Readonly<{
    contentType: string;
    bytes: ArrayBuffer;
  }>>();
  let loaded = 0;
  for (const entry of options.entries) {
    const url = allowedUrl(entry.url, base, origins);
    const fetchKey = `${entry.kind}:${url.href}`;
    let payload = fetched.get(fetchKey);
    if (payload === undefined) {
      const response = await fetcher(url, {
        credentials: "same-origin",
        cache: "force-cache",
        redirect: "error",
      });
      if (!response.ok) {
        throw new Error(`WIZARD CRAFT asset failed to load: ${entry.id}`);
      }
      const contentType = response.headers.get("content-type");
      if (!validContentType(entry.kind, contentType)) {
        throw new Error(`WIZARD CRAFT asset has invalid content type: ${entry.id}`);
      }
      const declared = response.headers.get("content-length");
      if (
        declared !== null &&
        (!/^\d+$/.test(declared) || Number(declared) > maximum)
      ) {
        throw new Error(`WIZARD CRAFT asset exceeds size limit: ${entry.id}`);
      }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > maximum) {
        throw new Error(`WIZARD CRAFT asset exceeds size limit: ${entry.id}`);
      }
      payload = Object.freeze({
        contentType: contentType!.split(";")[0]!.trim().toLowerCase(),
        bytes,
      });
      fetched.set(fetchKey, payload);
    }
    const storageId = entry.kind === "image"
      ? entry.id
      : `${entry.kind}:${entry.id}`;
    assets.set(storageId, Object.freeze({
      id: entry.id,
      kind: entry.kind,
      url,
      contentType: payload.contentType,
      bytes: payload.bytes,
    }));
    if (entry.kind === "audio") {
      audioIds.add(entry.id as WizardCraftBrowserAudioAssetId);
    }
    loaded += 1;
    options.onProgress?.({ loaded, total: options.entries.length, id: entry.id });
  }

  return Object.freeze({
    assets,
    productionAssetIds: productionIds,
    audioAssetIds: audioIds,
  });
}

export function wizardCraftImageEntry(
  id: WizardCraftAssetId,
  url: string,
): WizardCraftBrowserAssetEntry {
  return Object.freeze({ id, kind: "image", url });
}

const WIZARD_CRAFT_REVIEW_EFFECT_IMAGE_FILES = Object.freeze([
  [
    "effects.magic.bolt",
    "effects/wizard-magic-bolt-candidate-v1.png",
  ],
  [
    "effects.clash.core",
    "effects/clash-contact-core-candidate-v1.png",
  ],
] as const satisfies readonly (readonly [WizardCraftAssetId, string])[]);

/**
 * Browser entries for the two reviewed combat-effect candidates used by the
 * vertical slice. These files remain review candidates; exposing their stable
 * runtime slot IDs here does not mark them as final art.
 */
export function wizardCraftReviewEffectImageEntries(
  basePath = "art-src/wizard-craft",
): readonly WizardCraftBrowserAssetEntry[] {
  const normalized = basePath.replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error("WIZARD CRAFT image base path cannot be empty");
  }
  return Object.freeze(
    WIZARD_CRAFT_REVIEW_EFFECT_IMAGE_FILES.map(([id, filename]) =>
      wizardCraftImageEntry(id, `${normalized}/${filename}`)
    ),
  );
}

const WIZARD_CRAFT_REVIEW_IMAGE_FILES: Readonly<
  Partial<Record<WizardCraftAssetId, string>>
> = Object.freeze({
  // The approved composite remains a reference only. Production is assembled
  // from independent environment, cabinet, character, and effect assets.
  "environment.sky": "runtime/environment-sky.png",
  "environment.castle": "runtime/environment-castle.png",
  "environment.base": "master/wizard-craft-clean-idle-base-runtime-v3.png",
  "environment.fog.low": "runtime/environment-fog.png",
  "environment.fog.low.static": "runtime/environment-fog.png",
  "cabinet.title": "runtime/registered-cabinet-title.png",
  "cabinet.lintel": "runtime/registered-cabinet-lintel.png",
  "cabinet.pillar.dragon": "runtime/registered-cabinet-pillar-dragon.png",
  "cabinet.pillar.wizard": "runtime/registered-cabinet-pillar-wizard.png",
  "cabinet.staircase.wizard": "runtime/approved-wizard-platform-v1.png",
  "cabinet.pillar.dragon.runes":
    "runtime/registered-cabinet-runes-dragon.png",
  "cabinet.pillar.wizard.runes":
    "runtime/registered-cabinet-runes-wizard.png",
  "cabinet.sill": "runtime/registered-cabinet-sill.png",
  "cabinet.crest.base": "cabinet/clash-crest-base-runtime-v1.png",
  "cabinet.crest.clash": "cabinet/clash-crest-active-runtime-v1.png",
  "reels.backing": "runtime/reel-backing.png",
  "reels.vs.expand": "runtime/vs-claim.png",
  "reels.vs.frame.dragon": "runtime/vs-frame-dragon.png",
  "reels.vs.frame.wizard": "runtime/vs-frame-wizard.png",
  "reels.vs.frame.balanced": "runtime/vs-frame-balanced.png",
  "reels.vs.temporary": "runtime/vs-temporary.png",
  "reels.vs.sticky": "runtime/vs-sticky.png",
  "reels.vs.upgrade": "runtime/vs-upgrade.png",
  "reels.vs.release": "runtime/vs-release.png",
  "symbol.ember.idle": "symbols/ember/approved-native-68x51-v1.png",
  "symbol.scroll.idle": "symbols/scroll/approved-native-68x51-v1.png",
  "symbol.potion.idle": "symbols/potion/approved-native-68x51-v1.png",
  "symbol.crystal.idle": "symbols/crystal/approved-native-68x51-v1.png",
  "symbol.grimoire.idle": "symbols/grimoire/approved-native-68x51-v1.png",
  "symbol.staff.idle": "symbols/staff/approved-native-68x51-v1.png",
  "symbol.dragon-egg.idle": "symbols/dragon-egg/approved-native-68x51-v1.png",
  "symbol.duel-coin.idle": "symbols/duel-coin/approved-native-68x51-v1.png",
  "symbol.dragon-wild.idle":
    "symbols/dragon-wild/approved-native-68x51-v1.png",
  "symbol.wizard-wild.idle":
    "symbols/wizard-wild/approved-native-68x51-v1.png",
  "symbol.dragon-wild.eyes":
    "symbols/dragon-wild/anim-eyes-native-68x51-v1.png",
  "symbol.dragon-wild.inner-glow":
    "symbols/dragon-wild/anim-inner-glow-native-68x51-v1.png",
  "symbol.dragon-wild.aura":
    "symbols/dragon-wild/anim-aura-native-68x51-v1.png",
  "symbol.dragon-wild.particles":
    "symbols/dragon-wild/anim-particles-native-68x51-v1.png",
  "symbol.wizard-wild.eyes":
    "symbols/wizard-wild/anim-eyes-native-68x51-v1.png",
  "symbol.wizard-wild.inner-glow":
    "symbols/wizard-wild/anim-inner-glow-native-68x51-v1.png",
  "symbol.wizard-wild.aura":
    "symbols/wizard-wild/anim-aura-native-68x51-v1.png",
  "symbol.wizard-wild.particles":
    "symbols/wizard-wild/anim-particles-native-68x51-v1.png",
  "dragon.rear.tail":
    "runtime/empty-layer-v1.png",
  "dragon.front.head":
    "runtime/empty-layer-v1.png",
  "dragon.front.jaw":
    "runtime/empty-layer-v1.png",
  "dragon.front.jaw.attack":
    "runtime/empty-layer-v1.png",
  "dragon.front.eye":
    "runtime/empty-layer-v1.png",
  "dragon.front.eye.anticipation":
    "native-master-v1/dragon-eye-anticipation-v3-registered.png",
  "dragon.front.eye.attack":
    "native-master-v1/dragon-eye-attack-v3-registered.png",
  "dragon.front.coil":
    "runtime/empty-layer-v1.png",
  "dragon.idle": "runtime/empty-layer-v1.png",
  "dragon.idle.static": "runtime/empty-layer-v1.png",
  "dragon.inhale": "runtime/empty-layer-v1.png",
  "dragon.attack.quick": "runtime/empty-layer-v1.png",
  "dragon.claim": "runtime/empty-layer-v1.png",
  "dragon.block": "runtime/empty-layer-v1.png",
  "wizard.idle": "runtime/empty-layer-v1.png",
  "wizard.idle.static": "runtime/empty-layer-v1.png",
  "wizard.charge": "runtime/empty-layer-v1.png",
  "wizard.cast.quick": "runtime/empty-layer-v1.png",
  "wizard.claim": "runtime/empty-layer-v1.png",
  "wizard.block": "runtime/empty-layer-v1.png",
  "wizard.body": "runtime/empty-layer-v1.png",
  "wizard.hat.idle": "runtime/empty-layer-v1.png",
  "wizard.hat.charge": "native-master-v1/wizard-charge-v3-registered.png",
  "wizard.hat.cast": "native-master-v1/wizard-cast-v3-registered.png",
  "wizard.hat.block": "native-master-v1/wizard-block-v3-registered.png",
  "wizard.eyes": "native-master-v1/wizard-eyes-v3-registered.png",
  "effects.fire.core": "effects/dragon-fire-quick-runtime-v1.png",
  "effects.fire.edge": "effects/dragon-fire-heavy-runtime-v1.png",
  "effects.fire.embers": "effects/dragon-mouth-charge-runtime-v1.png",
  "effects.fire.smoke": "effects/dragon-nostril-charge-runtime-v1.png",
  "effects.magic.bolt": "effects/wizard-magic-bolt-diagonal-runtime-v1.png",
  "effects.magic.trail": "effects/wizard-magic-bolt-diagonal-runtime-v1.png",
  "effects.magic.runes": "effects/wizard-magic-runes-runtime-v1.png",
  "effects.block.ward":
    "effects/wizard-ward-runtime-v1.png",
  "effects.block.firewall": "effects/dragon-firewall-runtime-v1.png",
  "effects.clash.core": "effects/clash-energy-core-runtime-v1.png",
  "effects.clash.ring": "effects/clash-gold-ring-runtime-v1.png",
  "effects.clash.multiplier": "effects/clash-cap-flare-runtime-v1.png",
});

function wizardCraftReviewImageFile(id: WizardCraftAssetId): string {
  const direct = WIZARD_CRAFT_REVIEW_IMAGE_FILES[id];
  if (direct !== undefined) return direct;
  if (id === "reels.mask.1") {
    return "runtime/reel-dividers.png";
  }
  if (/^reels\.mask\.[2-5]$/.test(id)) {
    return "runtime/reel-dividers.png";
  }
  if (id.startsWith("dragon.")) {
    return "dragon/dragon-rig-fit-review-v5.png";
  }
  if (id.startsWith("wizard.")) {
    return "wizard/corrected-idle-composite-v1.png";
  }
  const tier = /^effects\.tier\.([1-3])\.frame\.(0[0-7])$/.exec(id);
  if (tier !== null) {
    return `runtime/tier-reveals/tier-${tier[1]}-frame-${tier[2]}.png`;
  }
  throw new Error(`WIZARD CRAFT review image slot is unmapped: ${id}`);
}

/**
 * Complete browser image manifest for the current visual-slice candidates.
 * Some animation states intentionally share a review composite until their
 * final separated frames pass art review.
 */
export function wizardCraftProductionImageEntries(
  basePath = "art-src/wizard-craft",
): readonly WizardCraftBrowserAssetEntry[] {
  const normalized = basePath.replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error("WIZARD CRAFT image base path cannot be empty");
  }
  return Object.freeze(
    WIZARD_CRAFT_ASSET_SLOTS.map(({ id }) =>
      wizardCraftImageEntry(
        id,
        `${normalized}/${wizardCraftReviewImageFile(id)}`,
      )
    ),
  );
}

/** @deprecated Local review alias retained for existing tooling. */
export const wizardCraftReviewImageEntries = wizardCraftProductionImageEntries;

export function wizardCraftAudioEntry(
  id: WizardCraftAudioCueId,
  url: string,
): WizardCraftBrowserAssetEntry {
  return Object.freeze({ id, kind: "audio", url });
}

export function wizardCraftMusicEntry(
  url = "art-src/wizard-craft/audio/music/wizard-craft-hybrid-loop-runtime-v1.mp3",
): WizardCraftBrowserAssetEntry {
  return Object.freeze({
    id: WIZARD_CRAFT_MUSIC_TRACK_ID,
    kind: "audio",
    url,
  });
}

const WIZARD_CRAFT_SYMBOL_AUDIO_FILES = Object.freeze([
  ["symbol.ember", "ember-v1.wav"],
  ["symbol.potion", "potion-v1.wav"],
  ["symbol.dragon-egg", "dragon-egg-v1.wav"],
  ["symbol.dragon-wild", "dragon-wild-v1.wav"],
  ["symbol.scroll", "scroll-v1.wav"],
  ["symbol.grimoire", "grimoire-v1.wav"],
  ["symbol.staff", "staff-v1.wav"],
  ["symbol.wizard-wild", "wizard-wild-v1.wav"],
  ["symbol.crystal", "crystal-v1.wav"],
] as const satisfies readonly (readonly [WizardCraftAudioCueId, string])[]);

function wizardCraftAudioEntries(
  files: readonly (readonly [WizardCraftAudioCueId, string])[],
  basePath: string,
): readonly WizardCraftBrowserAssetEntry[] {
  const normalized = basePath.replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error("WIZARD CRAFT audio base path cannot be empty");
  }
  return files.map(([id, filename]) =>
    wizardCraftAudioEntry(id, `${normalized}/${filename}`)
  );
}

export function wizardCraftSymbolAudioEntries(
  basePath = "art-src/wizard-craft/audio/symbols",
): readonly WizardCraftBrowserAssetEntry[] {
  return wizardCraftAudioEntries(WIZARD_CRAFT_SYMBOL_AUDIO_FILES, basePath);
}

const WIZARD_CRAFT_MECHANICAL_AUDIO_FILES = Object.freeze([
  ["reels.stop", "reels-stop-v1.wav"],
  ["reels.anticipation", "reels-anticipation-v1.wav"],
  ["duel.tier1", "duel-tier1-v1.wav"],
  ["duel.tier2", "duel-tier2-v1.wav"],
  ["duel.tier3", "duel-tier3-v1.wav"],
  ["duel.enter", "duel-enter-v1.wav"],
  ["duel.retrigger", "duel-retrigger-v1.wav"],
  ["duel.end", "duel-end-v1.wav"],
  ["ui.spin-counter", "spin-counter-v1.wav"],
  ["reel.temporary.claim", "temporary-claim-v1.wav"],
  ["reel.sticky.claim", "sticky-claim-v1.wav"],
  ["reel.sticky.upgrade", "sticky-upgrade-v1.wav"],
  ["attack.block", "attack-block-v1.wav"],
  ["reel.temporary.clear", "temporary-clear-v1.wav"],
] as const satisfies readonly (readonly [WizardCraftAudioCueId, string])[]);

export function wizardCraftMechanicalAudioEntries(
  basePath = "art-src/wizard-craft/audio/mechanics",
): readonly WizardCraftBrowserAssetEntry[] {
  return wizardCraftAudioEntries(WIZARD_CRAFT_MECHANICAL_AUDIO_FILES, basePath);
}

const WIZARD_CRAFT_BATTLE_WIN_AUDIO_FILES = Object.freeze([
  ["dragon.inhale", "dragon-inhale-v1.wav"],
  ["dragon.fire.launch", "dragon-fire-launch-v1.wav"],
  ["wizard.charge", "wizard-charge-v1.wav"],
  ["wizard.bolt.launch", "wizard-bolt-launch-v1.wav"],
  ["clash.impact", "clash-impact-v1.wav"],
  ["clash.balanced", "clash-balanced-v1.wav"],
  ["win.ways", "win-ways-v1.wav"],
  ["win.level", "win-level-v1.wav"],
  ["win.total", "win-total-v1.wav"],
  ["win.final", "win-final-v1.wav"],
  ["win.max", "win-max-v1.wav"],
] as const satisfies readonly (readonly [WizardCraftAudioCueId, string])[]);

export function wizardCraftBattleWinAudioEntries(
  basePath = "art-src/wizard-craft/audio/battle-win",
): readonly WizardCraftBrowserAssetEntry[] {
  return wizardCraftAudioEntries(WIZARD_CRAFT_BATTLE_WIN_AUDIO_FILES, basePath);
}

export function wizardCraftProductionAudioEntries(
  basePath = "art-src/wizard-craft/audio",
): readonly WizardCraftBrowserAssetEntry[] {
  const normalized = basePath.replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error("WIZARD CRAFT audio base path cannot be empty");
  }
  return Object.freeze([
    ...wizardCraftSymbolAudioEntries(`${normalized}/symbols`),
    ...wizardCraftMechanicalAudioEntries(`${normalized}/mechanics`),
    ...wizardCraftBattleWinAudioEntries(`${normalized}/battle-win`),
  ]);
}

export function wizardCraftProductionSoundEntries(
  basePath = "art-src/wizard-craft/audio",
): readonly WizardCraftBrowserAssetEntry[] {
  const normalized = basePath.replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error("WIZARD CRAFT audio base path cannot be empty");
  }
  return Object.freeze([
    ...wizardCraftProductionAudioEntries(normalized),
    wizardCraftMusicEntry(
      `${normalized}/music/wizard-craft-hybrid-loop-runtime-v1.mp3`,
    ),
  ]);
}

/**
 * One complete, ordered browser manifest for the current review build.
 * Production boot can consume this directly without hand-merging image,
 * effects-audio, and music entries.
 */
export function wizardCraftProductionBrowserEntries(
  basePath = "art-src/wizard-craft",
): readonly WizardCraftBrowserAssetEntry[] {
  const normalized = basePath.replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error("WIZARD CRAFT asset base path cannot be empty");
  }
  return Object.freeze([
    ...wizardCraftProductionImageEntries(normalized),
    ...wizardCraftProductionSoundEntries(`${normalized}/audio`),
  ]);
}

/** @deprecated Local review alias retained for existing tooling. */
export const wizardCraftReviewBrowserEntries = wizardCraftProductionBrowserEntries;
