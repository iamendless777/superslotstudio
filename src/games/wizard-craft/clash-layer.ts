import type { WizardCraftPresentationBeat } from "./cues.js";
import type { WizardCraftClashAdvantage } from "./events.js";
import type { WizardCraftPixiLayer } from "./pixi-scene.js";
import type {
  WizardCraftRenderCommand,
  WizardCraftRuntimeState,
} from "./runtime.js";

export const WIZARD_CRAFT_FIRE_LAYERS = Object.freeze([
  "white-hot-core",
  "gold",
  "orange",
  "coral",
  "magenta",
  "violet",
  "blue-lavender-edge",
] as const);

export const WIZARD_CRAFT_MAGIC_LAYERS = Object.freeze([
  "white-core",
  "electric-blue-bolt",
  "blue-lavender-trail",
  "arcane-runes",
] as const);

export interface WizardCraftClashResponse {
  readonly shakePixels: number;
  readonly flashOpacity: number;
  readonly particleCount: number;
}

export interface WizardCraftClashPersistentState {
  readonly featureTier: number | null;
  readonly stickyReels: readonly number[];
  readonly capped: boolean;
}

export interface WizardCraftClashImpact {
  readonly targetReel: number;
  readonly advantage: WizardCraftClashAdvantage;
  readonly multiplier: number;
  readonly response: WizardCraftClashResponse;
}

export interface WizardCraftClashView {
  setPersistentState(state: WizardCraftClashPersistentState): void;
  launchDragonFire(
    layers: typeof WIZARD_CRAFT_FIRE_LAYERS,
    targetReel: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  launchWizardMagic(
    layers: typeof WIZARD_CRAFT_MAGIC_LAYERS,
    targetReel: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  impact(
    clash: WizardCraftClashImpact,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  blockedImpact(
    attacker: "dragon" | "wizard",
    targetReel: number,
    response: WizardCraftClashResponse,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  stickySurge(
    reel: number,
    multiplier: number,
    response: WizardCraftClashResponse,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  cancelEffects(): void;
  destroy(): void;
}

export function getWizardCraftClashResponse(
  multiplier: number,
  motion: WizardCraftPresentationBeat["motion"],
): WizardCraftClashResponse {
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new RangeError("WIZARD CRAFT clash multiplier must be non-negative");
  }
  if (motion === "none") {
    return Object.freeze({
      shakePixels: 0,
      flashOpacity: 0,
      particleCount: 0,
    });
  }
  const base = multiplier >= 50
    ? { shakePixels: 6, flashOpacity: 0.28, particleCount: 36 }
    : multiplier >= 10
    ? { shakePixels: 4, flashOpacity: 0.2, particleCount: 24 }
    : { shakePixels: 2, flashOpacity: 0.12, particleCount: 12 };
  return motion === "subtle"
    ? Object.freeze({
      shakePixels: Math.ceil(base.shakePixels / 2),
      flashOpacity: base.flashOpacity / 2,
      particleCount: Math.ceil(base.particleCount / 2),
    })
    : Object.freeze(base);
}

function eventNumber(
  command: WizardCraftRenderCommand,
  key: "reel" | "targetReel" | "appliedMultiplier",
  minimum: number,
  maximum: number,
): number {
  const value = command.event[key];
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(`WIZARD CRAFT clash requires valid ${key}`);
  }
  return value as number;
}

function advantage(command: WizardCraftRenderCommand): WizardCraftClashAdvantage {
  const value = command.event.advantage;
  if (value !== "dragon" && value !== "wizard" && value !== "balanced") {
    throw new Error("WIZARD CRAFT clash requires a valid advantage");
  }
  return value;
}

export class WizardCraftClashLayer implements WizardCraftPixiLayer {
  readonly #view: WizardCraftClashView;

  constructor(view: WizardCraftClashView) {
    this.#view = view;
  }

  sync(state: WizardCraftRuntimeState): void {
    this.#view.setPersistentState(Object.freeze({
      featureTier: state.tier,
      stickyReels: Object.freeze([...state.stickyVsReels.keys()]),
      capped: state.capped,
    }));
  }

  async play(
    beat: WizardCraftPresentationBeat,
    command: WizardCraftRenderCommand,
  ): Promise<void> {
    if (beat.channel !== "clash") {
      throw new Error(`Clash layer cannot play ${beat.channel} beat`);
    }
    if (beat.id === "effects.dragon-fire-flight") {
      await this.#view.launchDragonFire(
        WIZARD_CRAFT_FIRE_LAYERS,
        eventNumber(
          command,
          command.event.type === "blockAttack" ? "targetReel" : "reel",
          0,
          4,
        ),
        beat.motion,
      );
      return;
    }
    if (beat.id === "effects.wizard-magic-flight") {
      await this.#view.launchWizardMagic(
        WIZARD_CRAFT_MAGIC_LAYERS,
        eventNumber(
          command,
          command.event.type === "blockAttack" ? "targetReel" : "reel",
          0,
          4,
        ),
        beat.motion,
      );
      return;
    }
    if (beat.id === "clash.multicolor-impact") {
      const multiplier = eventNumber(
        command,
        "appliedMultiplier",
        2,
        50,
      );
      await this.#view.impact(Object.freeze({
        targetReel: eventNumber(command, "reel", 0, 4),
        advantage: advantage(command),
        multiplier,
        response: getWizardCraftClashResponse(multiplier, beat.motion),
      }), beat.motion);
      return;
    }
    if (beat.id === "clash.blocked-impact") {
      const attacker = command.event.attacker;
      if (attacker !== "dragon" && attacker !== "wizard") {
        throw new Error("WIZARD CRAFT blocked clash requires a valid attacker");
      }
      await this.#view.blockedImpact(
        attacker,
        eventNumber(command, "targetReel", 0, 4),
        getWizardCraftClashResponse(0, beat.motion),
        beat.motion,
      );
      return;
    }
    if (beat.id === "clash.multicolor-surge") {
      const multiplier = eventNumber(
        command,
        "appliedMultiplier",
        2,
        50,
      );
      await this.#view.stickySurge(
        eventNumber(command, "reel", 0, 4),
        multiplier,
        getWizardCraftClashResponse(multiplier, beat.motion),
        beat.motion,
      );
      return;
    }
    throw new Error(`Unsupported WIZARD CRAFT clash beat ${beat.id}`);
  }

  cancel(): void {
    this.#view.cancelEffects();
  }

  destroy(): void {
    this.#view.destroy();
  }
}
