import type { WizardCraftAssetId } from "./assets.js";
import { WIZARD_CRAFT_REEL_DESIGN_RECT } from "./reel-layer.js";
import type {
  WizardCraftClashImpact,
  WizardCraftClashPersistentState,
  WizardCraftClashResponse,
  WizardCraftClashView,
  WIZARD_CRAFT_FIRE_LAYERS,
  WIZARD_CRAFT_MAGIC_LAYERS,
} from "./clash-layer.js";
import type { WizardCraftPresentationBeat } from "./cues.js";

export interface WizardCraftClashSpriteScale {
  set(value: number): void;
}

export interface WizardCraftClashSprite {
  visible: boolean;
  x: number;
  width: number;
  alpha: number;
  readonly scale: WizardCraftClashSpriteScale;
}

export interface WizardCraftClashSpriteScene {
  sprite(id: WizardCraftAssetId): WizardCraftClashSprite;
}

export interface WizardCraftClashAnimationClock {
  sleep(milliseconds: number): Promise<void>;
  tween?(
    milliseconds: number,
    update: (progress: number) => void,
  ): Promise<void>;
}

const FIRE_BEAM_ASSETS = Object.freeze([
  "effects.fire.core",
  "effects.fire.edge",
] as const satisfies readonly WizardCraftAssetId[]);

const FIRE_ORIGIN_ASSETS = Object.freeze([
  "effects.fire.embers",
  "effects.fire.smoke",
] as const satisfies readonly WizardCraftAssetId[]);

const FIRE_ASSETS = Object.freeze([
  ...FIRE_BEAM_ASSETS,
  ...FIRE_ORIGIN_ASSETS,
] as const satisfies readonly WizardCraftAssetId[]);

const MAGIC_ASSETS = Object.freeze([
  "effects.magic.bolt",
  "effects.magic.trail",
  "effects.magic.runes",
] as const satisfies readonly WizardCraftAssetId[]);

const IMPACT_ASSETS = Object.freeze([
  "effects.clash.core",
  "effects.clash.ring",
  "effects.clash.multiplier",
] as const satisfies readonly WizardCraftAssetId[]);

const ALL_EFFECT_ASSETS = Object.freeze([
  ...FIRE_ASSETS,
  ...MAGIC_ASSETS,
  "effects.block.ward",
  "effects.block.firewall",
  ...IMPACT_ASSETS,
] as const satisfies readonly WizardCraftAssetId[]);

type EffectFamily = "fire" | "magic" | "impact";

const PROJECTILE_ORIGIN_X = Object.freeze({
  fire: 155,
  // The clean production plate places the Wizard's casting hand farther
  // right than the earlier reconstructed plate. Keep the energized end of
  // the diagonal bolt physically attached to that hand.
  magic: 598,
} as const satisfies Readonly<Record<"fire" | "magic", number>>);

const CAP_FLARE_SIZE = 120;
const CAP_FLARE_SCALE = CAP_FLARE_SIZE / 72;

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

function hold(
  motion: WizardCraftPresentationBeat["motion"],
  fullMilliseconds: number,
): number {
  if (motion === "none") return 0;
  return motion === "subtle"
    ? Math.round(fullMilliseconds / 2)
    : fullMilliseconds;
}

/**
 * Concrete, independently layered projectile and collision view. Impact
 * positions resolve directly into the shared 640×360 cabinet coordinates.
 */
export class WizardCraftClashSpriteView implements WizardCraftClashView {
  readonly #scene: WizardCraftClashSpriteScene;
  readonly #clock: WizardCraftClashAnimationClock;
  readonly #epochs: Record<EffectFamily, number> = {
    fire: 0,
    magic: 0,
    impact: 0,
  };
  #persistent: WizardCraftClashPersistentState = {
    featureTier: null,
    stickyReels: [],
    capped: false,
  };
  #destroyed = false;

  constructor(
    scene: WizardCraftClashSpriteScene,
    clock: WizardCraftClashAnimationClock = {
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
      tween,
    },
  ) {
    this.#scene = scene;
    this.#clock = clock;
    this.#hideAll();
  }

  setPersistentState(state: WizardCraftClashPersistentState): void {
    this.#assertAvailable();
    this.#persistent = state;
    this.#hideAll();
    this.#restoreCap();
  }

  launchDragonFire(
    _layers: typeof WIZARD_CRAFT_FIRE_LAYERS,
    targetReel: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    return this.#animateFamily("fire", FIRE_ASSETS, targetReel, motion, 330);
  }

  launchWizardMagic(
    _layers: typeof WIZARD_CRAFT_MAGIC_LAYERS,
    targetReel: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    return this.#animateFamily("magic", MAGIC_ASSETS, targetReel, motion, 300);
  }

  async impact(
    clash: WizardCraftClashImpact,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    const epoch = ++this.#epochs.impact;
    const x = WIZARD_CRAFT_REEL_DESIGN_RECT.x +
      (clash.targetReel + 0.5) * WIZARD_CRAFT_REEL_DESIGN_RECT.width / 5 -
      36;
    const scale = 1 + Math.min(0.5, clash.multiplier / 100);
    for (const id of IMPACT_ASSETS) {
      const sprite = this.#scene.sprite(id);
      sprite.x = x;
      sprite.scale.set(scale);
      sprite.visible =
        id !== "effects.clash.multiplier" || this.#persistent.capped;
    }
    this.#scene.sprite("effects.clash.ring").alpha =
      Math.max(0.12, clash.response.flashOpacity);
    this.#showAdvantage(clash.advantage, x);

    const visible = [...IMPACT_ASSETS, "effects.block.firewall", "effects.block.ward"]
      .filter((id) => this.#scene.sprite(id as WizardCraftAssetId).visible) as WizardCraftAssetId[];
    const targetAlpha = new Map(visible.map((id) => [id, this.#scene.sprite(id).alpha]));
    if (motion !== "none" && this.#clock.tween !== undefined) {
      for (const id of visible) this.#scene.sprite(id).alpha = 0;
      await this.#clock.tween(motion === "subtle" ? 25 : 45, (progress) => {
        if (this.#destroyed || epoch !== this.#epochs.impact) return;
        const eased = 1 - Math.pow(1 - progress, 3);
        for (const id of visible) {
          this.#scene.sprite(id).alpha = (targetAlpha.get(id) ?? 1) * progress;
        }
        for (const id of IMPACT_ASSETS) {
          if (this.#scene.sprite(id).visible) {
            this.#scene.sprite(id).scale.set(scale * (0.74 + eased * 0.26));
          }
        }
      });
      if (this.#destroyed || epoch !== this.#epochs.impact) return;
    }

    const milliseconds = hold(motion, 300);
    if (milliseconds > 0) await this.#clock.sleep(milliseconds);
    if (this.#destroyed || epoch !== this.#epochs.impact) return;
    if (motion !== "none") {
      if (this.#clock.tween !== undefined) {
        await this.#clock.tween(motion === "subtle" ? 45 : 90, (progress) => {
          if (this.#destroyed || epoch !== this.#epochs.impact) return;
          for (const id of visible) {
            this.#scene.sprite(id).alpha = (targetAlpha.get(id) ?? 1) * (1 - progress);
          }
          for (const id of IMPACT_ASSETS) {
            if (this.#scene.sprite(id).visible) {
              this.#scene.sprite(id).scale.set(scale * (1 + progress * 0.08));
            }
          }
        });
        if (this.#destroyed || epoch !== this.#epochs.impact) return;
      }
      for (const id of visible) this.#scene.sprite(id).alpha = targetAlpha.get(id) ?? 1;
      for (const id of IMPACT_ASSETS) this.#scene.sprite(id).scale.set(scale);
      this.#hideImpact();
    }
  }

  async blockedImpact(
    attacker: "dragon" | "wizard",
    targetReel: number,
    _response: WizardCraftClashResponse,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    this.#assertAvailable();
    const epoch = ++this.#epochs.impact;
    const x = WIZARD_CRAFT_REEL_DESIGN_RECT.x +
      (targetReel + 0.5) * WIZARD_CRAFT_REEL_DESIGN_RECT.width / 5 -
      36;
    // A block must not resemble a multiplier-bearing collision. Reserve the
    // authored core and gold ring for successful impacts; the defender's ward
    // or firewall carries this outcome by itself.
    this.#scene.sprite("effects.clash.core").visible = false;
    this.#scene.sprite("effects.clash.ring").visible = false;
    this.#scene.sprite("effects.clash.multiplier").visible = false;
    this.#showAdvantage(attacker === "dragon" ? "wizard" : "dragon", x);

    const defense = ["effects.block.firewall", "effects.block.ward"]
      .filter((id) => this.#scene.sprite(id as WizardCraftAssetId).visible) as WizardCraftAssetId[];
    if (motion !== "none" && this.#clock.tween !== undefined) {
      for (const id of defense) this.#scene.sprite(id).alpha = 0;
      await this.#clock.tween(motion === "subtle" ? 25 : 45, (progress) => {
        if (this.#destroyed || epoch !== this.#epochs.impact) return;
        for (const id of defense) this.#scene.sprite(id).alpha = progress;
      });
      if (this.#destroyed || epoch !== this.#epochs.impact) return;
    }

    const milliseconds = hold(motion, 300);
    if (milliseconds > 0) await this.#clock.sleep(milliseconds);
    if (this.#destroyed || epoch !== this.#epochs.impact) return;
    if (motion !== "none") {
      if (this.#clock.tween !== undefined) {
        await this.#clock.tween(motion === "subtle" ? 45 : 90, (progress) => {
          if (this.#destroyed || epoch !== this.#epochs.impact) return;
          for (const id of defense) this.#scene.sprite(id).alpha = 1 - progress;
        });
        if (this.#destroyed || epoch !== this.#epochs.impact) return;
      }
      for (const id of defense) this.#scene.sprite(id).alpha = 1;
      this.#hideImpact();
    }
  }

  async stickySurge(
    reel: number,
    multiplier: number,
    response: WizardCraftClashResponse,
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    await this.impact({
      targetReel: reel,
      advantage: "balanced",
      multiplier,
      response,
    }, motion);
  }

  cancelEffects(): void {
    if (this.#destroyed) return;
    this.#epochs.fire += 1;
    this.#epochs.magic += 1;
    this.#epochs.impact += 1;
    this.#hideAll();
    this.#restoreCap();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#epochs.fire += 1;
    this.#epochs.magic += 1;
    this.#epochs.impact += 1;
    this.#hideAll();
  }

  async #animateFamily(
    family: "fire" | "magic",
    assets: readonly WizardCraftAssetId[],
    targetReel: number,
    motion: WizardCraftPresentationBeat["motion"],
    fullMilliseconds: number,
  ): Promise<void> {
    this.#assertAvailable();
    const epoch = ++this.#epochs[family];
    const targetX = WIZARD_CRAFT_REEL_DESIGN_RECT.x +
      (targetReel + 0.5) * WIZARD_CRAFT_REEL_DESIGN_RECT.width / 5;
    const originX = PROJECTILE_ORIGIN_X[family];
    for (const id of assets) {
      const sprite = this.#scene.sprite(id);
      if (family === "fire" && FIRE_ORIGIN_ASSETS.includes(
        id as (typeof FIRE_ORIGIN_ASSETS)[number],
      )) {
        const smoke = id === "effects.fire.smoke";
        sprite.x = smoke ? 151 : 148;
        sprite.width = smoke ? 18 : 28;
        sprite.visible = true;
        continue;
      }
      // Keep the bright source end attached to its caster. Only the authored
      // beam length changes so its opposite edge reaches the selected reel.
      sprite.x = family === "fire" ? originX : targetX;
      sprite.width = family === "fire"
        ? Math.max(1, targetX - originX)
        : Math.max(1, originX - targetX);
      sprite.visible = true;
    }
    const effectiveMotion = motion;
    if (effectiveMotion !== "none" && this.#clock.tween !== undefined) {
      for (const id of assets) this.#scene.sprite(id).alpha = 0;
      await this.#clock.tween(effectiveMotion === "subtle" ? 30 : 60, (progress) => {
        if (this.#destroyed || epoch !== this.#epochs[family]) return;
        for (const id of assets) this.#scene.sprite(id).alpha = progress;
      });
      if (this.#destroyed || epoch !== this.#epochs[family]) return;
    }
    const milliseconds = hold(motion, fullMilliseconds);
    if (milliseconds > 0) await this.#clock.sleep(milliseconds);
    if (this.#destroyed || epoch !== this.#epochs[family]) return;
    if (motion !== "none") {
      if (this.#clock.tween !== undefined) {
        await this.#clock.tween(motion === "subtle" ? 35 : 70, (progress) => {
          if (this.#destroyed || epoch !== this.#epochs[family]) return;
          for (const id of assets) this.#scene.sprite(id).alpha = 1 - progress;
        });
        if (this.#destroyed || epoch !== this.#epochs[family]) return;
      }
      for (const id of assets) this.#scene.sprite(id).visible = false;
      for (const id of assets) this.#scene.sprite(id).alpha = 1;
    }
  }

  #showAdvantage(
    advantage: WizardCraftClashImpact["advantage"],
    x: number,
  ): void {
    const firewall = this.#scene.sprite("effects.block.firewall");
    const ward = this.#scene.sprite("effects.block.ward");
    firewall.x = x + 10;
    ward.x = x;
    firewall.visible =
      advantage === "dragon" || advantage === "balanced";
    ward.visible =
      advantage === "wizard" || advantage === "balanced";
  }

  #hideImpact(): void {
    for (const id of IMPACT_ASSETS) {
      this.#scene.sprite(id).visible =
        id === "effects.clash.multiplier" && this.#persistent.capped;
    }
    this.#scene.sprite("effects.block.firewall").visible = false;
    this.#scene.sprite("effects.block.ward").visible = false;
    this.#restoreCap();
  }

  #restoreCap(): void {
    const cap = this.#scene.sprite("effects.clash.multiplier");
    cap.x = WIZARD_CRAFT_REEL_DESIGN_RECT.x +
      WIZARD_CRAFT_REEL_DESIGN_RECT.width / 2 -
      CAP_FLARE_SIZE / 2;
    cap.scale.set(CAP_FLARE_SCALE);
    cap.visible = this.#persistent.capped;
  }

  #hideAll(): void {
    for (const id of ALL_EFFECT_ASSETS) {
      this.#scene.sprite(id).visible = false;
      this.#scene.sprite(id).alpha = 1;
      this.#scene.sprite(id).scale.set(1);
    }
  }

  #assertAvailable(): void {
    if (this.#destroyed) {
      throw new Error("WIZARD CRAFT clash sprite view is destroyed");
    }
  }
}
