import type { WizardCraftAssetId } from "./assets.js";
import type {
  WizardCraftCharacterState,
  WizardCraftCharacterView,
} from "./character-layer.js";
import type { WizardCraftPresentationBeat } from "./cues.js";
import type { WizardCraftSide } from "./events.js";

export interface WizardCraftCharacterSprite {
  visible: boolean;
  x: number;
  y: number;
  alpha: number;
}

export interface WizardCraftCharacterSpriteScene {
  sprite(id: WizardCraftAssetId): WizardCraftCharacterSprite;
}

export interface WizardCraftCharacterAnimationClock {
  sleep(milliseconds: number): Promise<void>;
  tween?(
    milliseconds: number,
    update: (progress: number) => void,
  ): Promise<void>;
}

export interface WizardCraftCharacterSpriteViewOptions {
  readonly staticPlate?: boolean;
}

type CharacterPose =
  | "idle"
  | "windup"
  | "attack"
  | "claim"
  | "block";

const POSES = Object.freeze({
  dragon: Object.freeze({
    idle: "dragon.idle",
    windup: "dragon.inhale",
    attack: "dragon.attack.quick",
    claim: "dragon.claim",
    block: "dragon.block",
  }),
  wizard: Object.freeze({
    idle: "wizard.idle",
    windup: "wizard.charge",
    attack: "wizard.cast.quick",
    claim: "wizard.claim",
    block: "wizard.block",
  }),
} as const satisfies Readonly<
  Record<WizardCraftSide, Readonly<Record<CharacterPose, WizardCraftAssetId>>>
>);

const STATIC_IDLE = Object.freeze({
  dragon: "dragon.idle.static",
  wizard: "wizard.idle.static",
} as const satisfies Readonly<Record<WizardCraftSide, WizardCraftAssetId>>);

const DRAGON_RIG_POSES = Object.freeze([
  "dragon.front.head",
  "dragon.front.jaw",
  "dragon.front.jaw.attack",
  "dragon.front.eye",
  "dragon.front.eye.anticipation",
  "dragon.front.eye.attack",
] as const satisfies readonly WizardCraftAssetId[]);

const DRAGON_HEAD_GROUP = Object.freeze([
  ...Object.values(POSES.dragon),
  STATIC_IDLE.dragon,
  ...DRAGON_RIG_POSES,
] as const satisfies readonly WizardCraftAssetId[]);

const WIZARD_RIG_POSES = Object.freeze([
  "wizard.body",
  "wizard.hat.idle",
  "wizard.hat.charge",
  "wizard.hat.cast",
  "wizard.hat.block",
  "wizard.eyes",
] as const satisfies readonly WizardCraftAssetId[]);

const WIZARD_POSE_GROUP = Object.freeze([
  ...Object.values(POSES.wizard),
  STATIC_IDLE.wizard,
  ...WIZARD_RIG_POSES,
] as const satisfies readonly WizardCraftAssetId[]);

const DRAGON_POSE_OFFSETS = Object.freeze({
  idle: Object.freeze({ x: 0, y: 0 }),
  windup: Object.freeze({ x: -2, y: 1 }),
  attack: Object.freeze({ x: 1, y: 0 }),
  claim: Object.freeze({ x: 0, y: -1 }),
  block: Object.freeze({ x: -1, y: 0 }),
} as const satisfies Readonly<Record<CharacterPose, Readonly<{
  x: number;
  y: number;
}>>>);

const WIZARD_POSE_OFFSETS = Object.freeze({
  idle: Object.freeze({ x: 0, y: 0 }),
  windup: Object.freeze({ x: 0, y: -1 }),
  attack: Object.freeze({ x: -1, y: 0 }),
  claim: Object.freeze({ x: 0, y: -2 }),
  block: Object.freeze({ x: 1, y: 0 }),
} as const satisfies Readonly<Record<CharacterPose, Readonly<{
  x: number;
  y: number;
}>>>);

// The authored Wizard layers share a 640×360 registration canvas. This origin
// seats the robe over the right tower cap while preserving every pose's
// internal hat/body/eye alignment.
const WIZARD_RIG_ORIGIN = Object.freeze({ x: -24, y: 0 });

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

function duration(
  motion: WizardCraftPresentationBeat["motion"],
  intensity: "quick" | "heavy" = "quick",
): number {
  if (motion === "none") return 0;
  const base = intensity === "heavy" ? 420 : 260;
  return motion === "subtle" ? Math.round(base / 2) : base;
}

/**
 * Concrete character view over the production asset scene. It selects authored
 * poses only; outcome authority and attack ownership remain in the layer.
 */
export class WizardCraftCharacterSpriteView
implements WizardCraftCharacterView {
  readonly #side: WizardCraftSide;
  readonly #scene: WizardCraftCharacterSpriteScene;
  readonly #clock: WizardCraftCharacterAnimationClock;
  readonly #staticPlate: boolean;
  #epoch = 0;
  #destroyed = false;
  #reducedMotion = false;

  constructor(
    side: WizardCraftSide,
    scene: WizardCraftCharacterSpriteScene,
    clock: WizardCraftCharacterAnimationClock = {
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
      tween,
    },
    options: WizardCraftCharacterSpriteViewOptions = {},
  ) {
    this.#side = side;
    this.#scene = scene;
    this.#clock = clock;
    this.#staticPlate = options.staticPlate ?? false;
    this.#show("idle");
  }

  setState(state: WizardCraftCharacterState): void {
    this.#assertAvailable();
    if (state.side !== this.#side) {
      throw new Error(`WIZARD CRAFT ${this.#side} view received ${state.side} state`);
    }
    this.#show(
      state.capped
        ? "claim"
        : state.prepared === "attacker"
        ? "windup"
        : state.prepared === "defender"
        ? "block"
        : "idle",
    );
  }

  windup(
    intensity: "quick" | "heavy",
    motion: WizardCraftPresentationBeat["motion"],
  ): Promise<void> {
    return this.#animate("windup", motion, intensity);
  }

  brace(motion: WizardCraftPresentationBeat["motion"]): Promise<void> {
    return this.#animate("block", motion);
  }

  counter(motion: WizardCraftPresentationBeat["motion"]): Promise<void> {
    return this.#animate("attack", motion);
  }

  launch(motion: WizardCraftPresentationBeat["motion"]): Promise<void> {
    return this.#animate("attack", motion);
  }

  claim(motion: WizardCraftPresentationBeat["motion"]): Promise<void> {
    return this.#animate("claim", motion);
  }

  recoil(motion: WizardCraftPresentationBeat["motion"]): Promise<void> {
    return this.#animate("idle", motion);
  }

  containAttack(motion: WizardCraftPresentationBeat["motion"]): Promise<void> {
    return this.#animate("attack", motion);
  }

  block(motion: WizardCraftPresentationBeat["motion"]): Promise<void> {
    return this.#animate("block", motion);
  }

  cancelAnimations(): void {
    if (this.#destroyed) return;
    this.#epoch += 1;
    this.#show("idle");
  }

  setReducedMotion(reduced: boolean): void {
    this.#assertAvailable();
    this.#reducedMotion = reduced;
    this.#show("idle");
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#epoch += 1;
    for (const id of this.#allPoseIds()) this.#scene.sprite(id).visible = false;
  }

  async #animate(
    pose: CharacterPose,
    motion: WizardCraftPresentationBeat["motion"],
    intensity: "quick" | "heavy" = "quick",
  ): Promise<void> {
    this.#assertAvailable();
    if (this.#staticPlate) {
      const effectiveMotion = this.#reducedMotion ? "none" : motion;
      const milliseconds = duration(effectiveMotion, intensity);
      if (this.#side === "dragon" && milliseconds > 0) {
        const epoch = ++this.#epoch;
        this.#show("idle");
        const accent = this.#scene.sprite(
          pose === "attack" || pose === "claim"
            ? "dragon.front.eye.attack"
            : "dragon.front.eye.anticipation",
        );
        accent.visible = true;
        accent.alpha = effectiveMotion === "subtle" ? 0.78 : 1;
        await this.#clock.sleep(milliseconds);
        if (this.#destroyed || epoch !== this.#epoch) return;
        accent.visible = false;
        accent.alpha = 1;
        return;
      }
      if (this.#side === "wizard" && milliseconds > 0) {
        const epoch = ++this.#epoch;
        this.#show("idle");
        const idleEyes = this.#scene.sprite("wizard.eyes");
        idleEyes.visible = false;
        const accentId = pose === "attack" || pose === "claim"
          ? "wizard.hat.cast"
          : pose === "block"
          ? "wizard.hat.block"
          : "wizard.hat.charge";
        const accent = this.#scene.sprite(accentId);
        accent.x = 0;
        accent.y = 0;
        accent.visible = true;
        accent.alpha = effectiveMotion === "subtle" ? 0.82 : 1;
        await this.#clock.sleep(milliseconds);
        if (this.#destroyed || epoch !== this.#epoch) return;
        this.#show("idle");
        return;
      }
      if (milliseconds > 0) await this.#clock.sleep(milliseconds);
      return;
    }
    const epoch = ++this.#epoch;
    const effectiveMotion = this.#reducedMotion ? "none" : motion;
    this.#setCharacterOffset(pose, effectiveMotion !== "none");
    const entrance = this.#transitionTo(pose, effectiveMotion, epoch);
    if (entrance !== undefined) await entrance;
    if (this.#destroyed || epoch !== this.#epoch) return;
    const milliseconds = duration(effectiveMotion, intensity);
    if (milliseconds > 0) await this.#clock.sleep(milliseconds);
    if (this.#destroyed || epoch !== this.#epoch) return;
    if (effectiveMotion !== "none") {
      const recovery = this.#transitionTo("idle", effectiveMotion, epoch);
      if (recovery !== undefined) await recovery;
    }
  }

  #transitionTo(
    pose: CharacterPose,
    motion: WizardCraftPresentationBeat["motion"],
    epoch: number,
  ): Promise<void> | undefined {
    const next = this.#poseId(pose);
    const previous = this.#allPoseIds().find(
      (id) => this.#scene.sprite(id).visible && id !== next,
    );
    if (motion === "none" || previous === undefined || this.#clock.tween === undefined) {
      this.#show(pose);
      this.#setCharacterOffset(pose, motion !== "none");
      return;
    }
    for (const id of this.#allPoseIds()) {
      if (id !== previous && id !== next) this.#scene.sprite(id).visible = false;
    }
    const from = this.#scene.sprite(previous);
    const to = this.#scene.sprite(next);
    from.visible = true;
    from.alpha = 1;
    to.visible = true;
    to.alpha = 0;
    const milliseconds = motion === "subtle" ? 40 : 80;
    return this.#clock.tween(milliseconds, (progress) => {
      if (this.#destroyed || epoch !== this.#epoch) return;
      from.alpha = 1 - progress;
      to.alpha = progress;
    }).then(() => {
      if (this.#destroyed || epoch !== this.#epoch) return;
      from.visible = false;
      from.alpha = 1;
      to.alpha = 1;
    });
  }

  #show(pose: CharacterPose): void {
    for (const id of this.#allPoseIds()) {
      const sprite = this.#scene.sprite(id);
      sprite.visible = false;
      sprite.alpha = 1;
    }
    if (this.#staticPlate) {
      if (this.#side === "wizard") {
        const eyes = this.#scene.sprite("wizard.eyes");
        eyes.x = 0;
        eyes.y = 0;
        eyes.visible = true;
      }
      return;
    }
    this.#setCharacterOffset("idle", false);
    const id = this.#poseId(pose);
    this.#scene.sprite(id).visible = true;
    if (this.#side === "dragon") {
      // Dragon facial poses are flattened offline from one registered source.
      // Component layers remain available to the rig lab, but never combine
      // live in production where hidden anatomy could expose seams.
    } else {
      // Completed Wizard poses are flattened offline to preserve the casting
      // sleeve, staff, orb, face, and robe silhouette as one coherent asset.
    }
  }

  #poseId(pose: CharacterPose): WizardCraftAssetId {
    return pose === "idle" && this.#reducedMotion
      ? STATIC_IDLE[this.#side]
      : POSES[this.#side][pose];
  }

  #setCharacterOffset(pose: CharacterPose, travel: boolean): void {
    const offsets = this.#side === "dragon"
      ? DRAGON_POSE_OFFSETS
      : WIZARD_POSE_OFFSETS;
    const offset = travel ? offsets[pose] : offsets.idle;
    const group = this.#side === "dragon"
      ? DRAGON_HEAD_GROUP
      : WIZARD_POSE_GROUP;
    for (const id of group) {
      const sprite = this.#scene.sprite(id);
      const origin = this.#side === "wizard"
        ? (WIZARD_RIG_POSES.includes(id as (typeof WIZARD_RIG_POSES)[number])
          ? WIZARD_RIG_ORIGIN
          : { x: 0, y: 0 })
        : { x: 0, y: 0 };
      sprite.x = origin.x + offset.x;
      sprite.y = origin.y + offset.y;
    }
  }

  #allPoseIds(): readonly WizardCraftAssetId[] {
    return Object.freeze([
      ...Object.values(POSES[this.#side]),
      STATIC_IDLE[this.#side],
      ...(this.#side === "dragon" ? DRAGON_RIG_POSES : []),
      ...(this.#side === "wizard" ? WIZARD_RIG_POSES : []),
    ]);
  }

  #assertAvailable(): void {
    if (this.#destroyed) {
      throw new Error(`WIZARD CRAFT ${this.#side} character view is destroyed`);
    }
  }
}
