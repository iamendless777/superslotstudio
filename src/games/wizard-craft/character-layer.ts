import type { WizardCraftPresentationBeat } from "./cues.js";
import type { WizardCraftSide } from "./events.js";
import type { WizardCraftPixiLayer } from "./pixi-scene.js";
import type {
  WizardCraftRenderCommand,
  WizardCraftRuntimeState,
} from "./runtime.js";

export interface WizardCraftCharacterPalette {
  readonly primary: string;
  readonly shadow: string;
  readonly energy: string;
}

export const WIZARD_CRAFT_CHARACTER_PALETTES = Object.freeze({
  dragon: Object.freeze({
    primary: "red",
    shadow: "oxblood",
    energy: "multicolor-fire",
  }),
  wizard: Object.freeze({
    primary: "blue",
    shadow: "midnight-blue",
    energy: "blue-white-magic",
  }),
} as const satisfies Readonly<
  Record<WizardCraftSide, WizardCraftCharacterPalette>
>);

export interface WizardCraftCharacterState {
  readonly side: WizardCraftSide;
  readonly palette: WizardCraftCharacterPalette;
  readonly featureActive: boolean;
  readonly tier: number | null;
  readonly claimedReels: number;
  readonly opposingReels: number;
  readonly balancedReels: number;
  readonly capped: boolean;
  readonly prepared?: "attacker" | "defender" | null;
}

export interface WizardCraftCharacterView {
  setState(state: WizardCraftCharacterState): void;
  windup(
    intensity: "quick" | "heavy",
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  brace(motion: WizardCraftPresentationBeat["motion"]): void | Promise<void>;
  counter(motion: WizardCraftPresentationBeat["motion"]): void | Promise<void>;
  launch(motion: WizardCraftPresentationBeat["motion"]): void | Promise<void>;
  claim(motion: WizardCraftPresentationBeat["motion"]): void | Promise<void>;
  recoil(motion: WizardCraftPresentationBeat["motion"]): void | Promise<void>;
  containAttack(motion: WizardCraftPresentationBeat["motion"]): void | Promise<void>;
  block(motion: WizardCraftPresentationBeat["motion"]): void | Promise<void>;
  cancelAnimations(): void;
  destroy(): void;
}

function characterState(
  side: WizardCraftSide,
  state: WizardCraftRuntimeState,
): WizardCraftCharacterState {
  const active = new Map([...state.stickyVsReels, ...state.spinVsReels]);
  let claimedReels = 0;
  let opposingReels = 0;
  let balancedReels = 0;
  for (const value of active.values()) {
    if (value.advantage === side) claimedReels += 1;
    else if (value.advantage === "balanced") balancedReels += 1;
    else opposingReels += 1;
  }
  return Object.freeze({
    side,
    palette: WIZARD_CRAFT_CHARACTER_PALETTES[side],
    featureActive: state.tier !== null,
    tier: state.tier,
    claimedReels,
    opposingReels,
    balancedReels,
    capped: state.capped,
    prepared: state.pendingAttack === null || state.pendingAttack === undefined
      ? null
      : state.pendingAttack.side === side
      ? "attacker"
      : "defender",
  });
}

export class WizardCraftCharacterLayer implements WizardCraftPixiLayer {
  readonly #side: WizardCraftSide;
  readonly #view: WizardCraftCharacterView;

  constructor(side: WizardCraftSide, view: WizardCraftCharacterView) {
    this.#side = side;
    this.#view = view;
  }

  sync(state: WizardCraftRuntimeState): void {
    this.#view.setState(characterState(this.#side, state));
  }

  async play(
    beat: WizardCraftPresentationBeat,
    command: WizardCraftRenderCommand,
  ): Promise<void> {
    if (beat.channel !== this.#side || !beat.id.startsWith(`${this.#side}.`)) {
      throw new Error(`${this.#side} layer cannot play ${beat.id}`);
    }
    const action = beat.id.slice(this.#side.length + 1);
    if (action === "windup" || action.endsWith("-windup")) {
      const rawIntensity = command.event.intensity;
      const intensity = rawIntensity === "heavy" || action.startsWith("heavy")
        ? "heavy"
        : "quick";
      await this.#view.windup(intensity, beat.motion);
      return;
    }
    if (action === "anticipation") {
      await this.#view.windup("quick", beat.motion);
      return;
    }
    if (action === "brace") {
      await this.#view.brace(beat.motion);
      return;
    }
    if (action === "counter") {
      await this.#view.counter(beat.motion);
      return;
    }
    if (action === "launch") {
      await this.#view.launch(beat.motion);
      return;
    }
    if (action === "claim") {
      await this.#view.claim(beat.motion);
      return;
    }
    if (action === "recoil") {
      await this.#view.recoil(beat.motion);
      return;
    }
    if (action === "attack-contained") {
      await this.#view.containAttack(beat.motion);
      return;
    }
    if (action === "block") {
      await this.#view.block(beat.motion);
      return;
    }
    throw new Error(`Unsupported WIZARD CRAFT ${this.#side} beat ${beat.id}`);
  }

  cancel(): void {
    this.#view.cancelAnimations();
  }

  destroy(): void {
    this.#view.destroy();
  }
}
