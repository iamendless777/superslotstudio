import {
  WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS,
  type WizardCraftAssetId,
} from "./assets.js";
import type {
  WizardCraftCabinetLayout,
  WizardCraftCabinetState,
  WizardCraftCabinetView,
} from "./cabinet-layer.js";
import type { WizardCraftPresentationBeat } from "./cues.js";
import {
  WIZARD_CRAFT_REGISTERED_SCENE_RECT,
  WIZARD_CRAFT_SCENE_SIZE,
  wizardCraftSceneTuple,
} from "./scene-layout.js";

export interface WizardCraftCabinetScale {
  set(value: number): void;
}

export interface WizardCraftCabinetStage {
  x: number;
  y: number;
  readonly scale: WizardCraftCabinetScale;
}

export interface WizardCraftCabinetSprite {
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
}

export interface WizardCraftCabinetSpriteScene {
  readonly root: WizardCraftCabinetStage;
  sprite(id: WizardCraftAssetId): WizardCraftCabinetSprite;
}

export interface WizardCraftCabinetLighting {
  setDragon(intensity: number): void;
  setWizard(intensity: number): void;
  setBalanced(intensity: number): void;
}

export interface WizardCraftCabinetAnimationClock {
  sleep(milliseconds: number): Promise<void>;
  tween?(
    milliseconds: number,
    update: (progress: number) => void,
  ): Promise<void>;
}

export interface WizardCraftCabinetSpriteViewOptions {
  readonly scene: WizardCraftCabinetSpriteScene;
  readonly lighting: WizardCraftCabinetLighting;
  readonly clock?: WizardCraftCabinetAnimationClock;
}

const CABINET_ASSETS = Object.freeze([
  "environment.sky",
  "environment.castle",
  "environment.fog.low",
  "environment.fog.low.static",
  "cabinet.title",
  "cabinet.lintel",
  "cabinet.pillar.dragon",
  "cabinet.pillar.wizard",
  "cabinet.staircase.wizard",
  "cabinet.pillar.dragon.runes",
  "cabinet.pillar.wizard.runes",
  "cabinet.sill",
  "cabinet.crest.base",
  "cabinet.crest.clash",
  ...WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS[1],
  ...WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS[2],
  ...WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS[3],
] as const satisfies readonly WizardCraftAssetId[]);

type CabinetAssetId = (typeof CABINET_ASSETS)[number];
type CabinetRect = readonly [number, number, number, number];

const TIER_REVEAL_RECTS = Object.fromEntries(
  Object.values(WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS)
    .flat()
    .map((id) => [id, [126, 48, 388, 280] as const]),
) as Record<
  (typeof WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS)[1 | 2 | 3][number],
  CabinetRect
>;

const DESIGN_RECTS: Readonly<Record<CabinetAssetId, CabinetRect>> = Object.freeze({
  "environment.sky": [0, 0, WIZARD_CRAFT_SCENE_SIZE.width, WIZARD_CRAFT_SCENE_SIZE.height],
  "environment.castle": [0, 0, WIZARD_CRAFT_SCENE_SIZE.width, WIZARD_CRAFT_SCENE_SIZE.height],
  "environment.fog.low": [0, 286, 640, 74],
  "environment.fog.low.static": [0, 286, 640, 74],
  "cabinet.title": wizardCraftSceneTuple(WIZARD_CRAFT_REGISTERED_SCENE_RECT),
  "cabinet.lintel": wizardCraftSceneTuple(WIZARD_CRAFT_REGISTERED_SCENE_RECT),
  "cabinet.pillar.dragon": wizardCraftSceneTuple(WIZARD_CRAFT_REGISTERED_SCENE_RECT),
  "cabinet.pillar.wizard": wizardCraftSceneTuple(WIZARD_CRAFT_REGISTERED_SCENE_RECT),
  "cabinet.staircase.wizard": wizardCraftSceneTuple(WIZARD_CRAFT_REGISTERED_SCENE_RECT),
  "cabinet.pillar.dragon.runes": wizardCraftSceneTuple(WIZARD_CRAFT_REGISTERED_SCENE_RECT),
  "cabinet.pillar.wizard.runes": wizardCraftSceneTuple(WIZARD_CRAFT_REGISTERED_SCENE_RECT),
  "cabinet.sill": wizardCraftSceneTuple(WIZARD_CRAFT_REGISTERED_SCENE_RECT),
  "cabinet.crest.base": wizardCraftSceneTuple(WIZARD_CRAFT_REGISTERED_SCENE_RECT),
  "cabinet.crest.clash": wizardCraftSceneTuple(WIZARD_CRAFT_REGISTERED_SCENE_RECT),
  ...TIER_REVEAL_RECTS,
});

const PERSISTENT_TIER_ALPHA = 0.12;
const COMPACT_PERSISTENT_TIER_ALPHA = 0.06;

function hold(
  motion: WizardCraftPresentationBeat["motion"],
  fullMilliseconds: number,
): number {
  if (motion === "none") return 0;
  return motion === "subtle"
    ? Math.round(fullMilliseconds / 2)
    : fullMilliseconds;
}

function clampLight(value: number): number {
  return Math.max(0, Math.min(1, value));
}

async function tween(
  milliseconds: number,
  update: (progress: number) => void,
): Promise<void> {
  const steps = Math.max(1, Math.round(milliseconds / 16));
  for (let step = 1; step <= steps; step += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds / steps));
    update(step / steps);
  }
}

/**
 * Concrete 640×360 authored cabinet composition. The parent layout scales it
 * by whole-scene transform, so individual pixel-art pieces never drift apart.
 */
export class WizardCraftCabinetSpriteView implements WizardCraftCabinetView {
  readonly #scene: WizardCraftCabinetSpriteScene;
  readonly #lighting: WizardCraftCabinetLighting;
  readonly #clock: WizardCraftCabinetAnimationClock;
  #state: WizardCraftCabinetState | null = null;
  #epoch = 0;
  #tierEpoch = 0;
  #destroyed = false;
  #compact = false;
  #currentLights = { dragon: 0, wizard: 0, balanced: 0 };

  constructor(options: WizardCraftCabinetSpriteViewOptions) {
    this.#scene = options.scene;
    this.#lighting = options.lighting;
    this.#clock = options.clock ?? {
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
      tween,
    };
    for (const id of CABINET_ASSETS) {
      const sprite = this.#scene.sprite(id);
      const [x, y, width, height] = DESIGN_RECTS[id]!;
      sprite.x = x;
      sprite.y = y;
      sprite.width = width;
      sprite.height = height;
      sprite.alpha = 1;
      sprite.visible = id !== "environment.fog.low.static" &&
        id !== "cabinet.crest.clash" &&
        !id.startsWith("effects.tier.");
    }
    this.#applyLighting();
  }

  setState(state: WizardCraftCabinetState): void {
    this.#assertAvailable();
    this.#state = state;
    this.#scene.sprite("cabinet.title").visible = true;
    this.#scene.sprite("cabinet.crest.base").visible = state.crest === "base";
    this.#scene.sprite("cabinet.crest.clash").visible = state.crest !== "base";
    this.#settleTierFrame(state.tier);
    this.#applyLighting();
  }

  setLayout(layout: WizardCraftCabinetLayout): void {
    this.#assertAvailable();
    this.#compact = layout.compact;
    this.#scene.root.x = layout.x;
    this.#scene.root.y = layout.y;
    // Cabinet layout is expressed from a 1920×1080 target; art is 640×360.
    this.#scene.root.scale.set(layout.scale * 3);
    if (this.#state?.tier !== null && this.#state?.tier !== undefined) {
      const final = this.#scene.sprite(
        WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS[
          this.#state.tier as 1 | 2 | 3
        ][7]!,
      );
      if (final.visible) final.alpha = this.#persistentTierAlpha();
    }
  }

  setAmbientMotion(motion: WizardCraftPresentationBeat["motion"]): void {
    this.#assertAvailable();
    const movingFog = this.#scene.sprite("environment.fog.low");
    const staticFog = this.#scene.sprite("environment.fog.low.static");
    movingFog.visible = motion !== "none";
    staticFog.visible = motion === "none";
    movingFog.alpha = motion === "subtle" ? 0.65 : 1;
  }

  async anticipation(
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    await this.#accent(motion, 240, 0.2);
  }

  async enterFeature(
    tier: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertTier(tier);
    this.#scene.sprite("cabinet.crest.base").visible = tier === 1;
    this.#scene.sprite("cabinet.crest.clash").visible = tier > 1;
    await Promise.all([
      this.#playTierReveal(tier, motion),
      this.#accent(motion, 900, tier * 0.12),
    ]);
  }

  async retrigger(
    tier: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertTier(tier);
    await this.#accent(motion, 300, tier * 0.1);
  }

  async handoff(
    tier: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertTier(tier);
    this.#scene.sprite("cabinet.crest.base").visible = tier === 1;
    this.#scene.sprite("cabinet.crest.clash").visible = tier > 1;
    await this.#accent(motion, 180, 0.08 + tier * 0.04);
  }

  async endFeature(
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    this.#scene.sprite("cabinet.crest.base").visible = true;
    this.#scene.sprite("cabinet.crest.clash").visible = false;
    this.#hideTierFrames();
    await this.#accent(motion, 220, 0.08);
  }

  async maximumWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    if (amount !== 2_500_000) {
      throw new Error("WIZARD CRAFT cabinet maximum requires exactly 25,000×");
    }
    this.#scene.sprite("cabinet.crest.base").visible = false;
    this.#scene.sprite("cabinet.crest.clash").visible = true;
    this.#scene.sprite("cabinet.title").alpha = 1;
    await this.#accent(motion, 520, 0.45, true);
  }

  async strongWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    if (amount < 10_000 || amount >= 2_500_000) {
      throw new Error("WIZARD CRAFT cabinet strong win requires 100× to below maximum");
    }
    this.#scene.sprite("cabinet.crest.base").visible = false;
    this.#scene.sprite("cabinet.crest.clash").visible = true;
    await this.#accent(motion, 460, 0.28);
  }

  cancelAnimations(): void {
    if (this.#destroyed) return;
    this.#epoch += 1;
    this.#tierEpoch += 1;
    this.#restorePersistent();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#epoch += 1;
    this.#tierEpoch += 1;
    for (const id of CABINET_ASSETS) this.#scene.sprite(id).visible = false;
    this.#setLighting(0, 0, 0);
  }

  async #accent(
    motion: WizardCraftPresentationBeat["motion"],
    fullMilliseconds: number,
    balancedBoost: number,
    holdMaximum = false,
  ): Promise<void> {
    this.#assertAvailable();
    const epoch = ++this.#epoch;
    const state = this.#state;
    const target = {
      dragon: state?.dragonLight ?? 0,
      wizard: state?.wizardLight ?? 0,
      balanced: clampLight((state?.balancedLight ?? 0) + balancedBoost),
    };
    if (motion !== "none" && this.#clock.tween !== undefined) {
      await this.#transitionLighting(target, motion === "subtle" ? 30 : 60, epoch);
      if (this.#destroyed || epoch !== this.#epoch) return;
    } else {
      this.#setLighting(target.dragon, target.wizard, target.balanced);
    }
    const milliseconds = hold(motion, fullMilliseconds);
    if (milliseconds > 0) await this.#clock.sleep(milliseconds);
    if (this.#destroyed || epoch !== this.#epoch) return;
    if (motion !== "none" && !holdMaximum) {
      if (this.#clock.tween !== undefined && state !== null) {
        await this.#transitionLighting({
          dragon: state.dragonLight,
          wizard: state.wizardLight,
          balanced: state.balancedLight,
        }, motion === "subtle" ? 50 : 100, epoch);
      } else {
        this.#restorePersistent();
      }
    }
  }

  async #playTierReveal(
    tier: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    this.#assertTier(tier);
    const epoch = ++this.#tierEpoch;
    const frames = WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS[tier as 1 | 2 | 3];
    this.#hideTierFrames();
    if (motion === "none") {
      const final = this.#scene.sprite(frames[7]!);
      final.alpha = this.#persistentTierAlpha();
      final.visible = true;
      return;
    }
    const delay = motion === "subtle" ? 55 : 105;
    let previous: WizardCraftAssetId | null = null;
    for (const id of frames) {
      if (this.#destroyed || epoch !== this.#tierEpoch) return;
      const sprite = this.#scene.sprite(id);
      sprite.visible = true;
      if (this.#clock.tween !== undefined) {
        sprite.alpha = 0;
        const blend = motion === "subtle" ? 20 : 35;
        await this.#clock.tween(blend, (progress) => {
          if (this.#destroyed || epoch !== this.#tierEpoch) return;
          sprite.alpha = progress;
          if (previous !== null) this.#scene.sprite(previous).alpha = 1 - progress;
        });
        if (this.#destroyed || epoch !== this.#tierEpoch) return;
        if (previous !== null) this.#scene.sprite(previous).visible = false;
        sprite.alpha = 1;
        await this.#clock.sleep(delay - blend);
      } else {
        this.#hideTierFrames();
        sprite.alpha = 1;
        sprite.visible = true;
        await this.#clock.sleep(delay);
      }
      previous = id;
    }
    if (this.#destroyed || epoch !== this.#tierEpoch) return;
    this.#hideTierFrames();
    const final = this.#scene.sprite(frames[7]!);
    final.alpha = this.#persistentTierAlpha();
    final.visible = true;
  }

  #settleTierFrame(tier: number | null): void {
    this.#hideTierFrames();
    if (tier === null) return;
    this.#assertTier(tier);
    const final = this.#scene.sprite(
      WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS[tier as 1 | 2 | 3][7]!,
    );
    final.alpha = this.#persistentTierAlpha();
    final.visible = true;
  }

  #persistentTierAlpha(): number {
    return this.#compact
      ? COMPACT_PERSISTENT_TIER_ALPHA
      : PERSISTENT_TIER_ALPHA;
  }

  #hideTierFrames(): void {
    for (const id of Object.values(WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS).flat()) {
      const sprite = this.#scene.sprite(id);
      sprite.visible = false;
      sprite.alpha = 1;
    }
  }

  #applyLighting(): void {
    const state = this.#state;
    this.#setLighting(
      state?.dragonLight ?? 0,
      state?.wizardLight ?? 0,
      state?.balancedLight ?? 0,
    );
  }

  #setLighting(dragonValue: number, wizardValue: number, balancedValue: number): void {
    const balanced = clampLight(balancedValue);
    const dragonBase = clampLight(dragonValue);
    const wizardBase = clampLight(wizardValue);
    this.#currentLights = { dragon: dragonBase, wizard: wizardBase, balanced };
    this.#lighting.setDragon(dragonBase);
    this.#lighting.setWizard(wizardBase);
    this.#lighting.setBalanced(balanced);
    const dragon = clampLight(dragonBase + balanced);
    const wizard = clampLight(wizardBase + balanced);
    this.#scene.sprite("cabinet.pillar.dragon.runes").alpha =
      0.34 + dragon * 0.66;
    this.#scene.sprite("cabinet.pillar.wizard.runes").alpha =
      0.34 + wizard * 0.66;
  }

  async #transitionLighting(
    target: { dragon: number; wizard: number; balanced: number },
    milliseconds: number,
    epoch: number,
  ): Promise<void> {
    const start = this.#currentLights;
    await this.#clock.tween?.(milliseconds, (progress) => {
      if (this.#destroyed || epoch !== this.#epoch) return;
      const eased = 1 - Math.pow(1 - progress, 3);
      this.#setLighting(
        start.dragon + (target.dragon - start.dragon) * eased,
        start.wizard + (target.wizard - start.wizard) * eased,
        start.balanced + (target.balanced - start.balanced) * eased,
      );
    });
  }

  #restorePersistent(): void {
    if (this.#state !== null) {
      this.#scene.sprite("cabinet.crest.base").visible =
        this.#state.crest === "base";
      this.#scene.sprite("cabinet.crest.clash").visible =
        this.#state.crest !== "base";
    }
    this.#applyLighting();
  }

  #assertTier(tier: number): void {
    this.#assertAvailable();
    if (tier !== 1 && tier !== 2 && tier !== 3) {
      throw new Error("WIZARD CRAFT cabinet sprite view requires tier 1, 2, or 3");
    }
  }

  #assertAvailable(): void {
    if (this.#destroyed) {
      throw new Error("WIZARD CRAFT cabinet sprite view is destroyed");
    }
  }
}
