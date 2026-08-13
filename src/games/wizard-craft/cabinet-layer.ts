import type { WizardCraftPresentationBeat } from "./cues.js";
import type { WizardCraftPixiLayer } from "./pixi-scene.js";
import type {
  WizardCraftRenderCommand,
  WizardCraftRuntimeState,
} from "./runtime.js";

export interface WizardCraftCabinetLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly compact: boolean;
}

export interface WizardCraftCabinetState {
  readonly title: "WIZARD CRAFT";
  readonly tier: number | null;
  readonly crest: "base" | "clash" | "maximum";
  readonly dragonLight: number;
  readonly wizardLight: number;
  readonly balancedLight: number;
  readonly featureActive: boolean;
  readonly capped: boolean;
}

export interface WizardCraftCabinetView {
  setState(state: WizardCraftCabinetState): void;
  setLayout(layout: WizardCraftCabinetLayout): void;
  setAmbientMotion(motion: WizardCraftPresentationBeat["motion"]): void;
  anticipation(
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  enterFeature(
    tier: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  handoff(
    tier: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  retrigger(
    tier: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  endFeature(
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  strongWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  maximumWin(
    amount: number,
    motion: WizardCraftPresentationBeat["motion"],
  ): void | Promise<void>;
  cancelAnimations(): void;
  destroy(): void;
}

const DESIGN_WIDTH = 1_920;
const DESIGN_HEIGHT = 1_080;

export function createWizardCraftCabinetLayout(
  viewportWidth: number,
  viewportHeight: number,
): WizardCraftCabinetLayout {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    throw new RangeError("WIZARD CRAFT viewport dimensions must be positive");
  }
  const scale = Math.min(
    viewportWidth / DESIGN_WIDTH,
    viewportHeight / DESIGN_HEIGHT,
  );
  const width = DESIGN_WIDTH * scale;
  const height = DESIGN_HEIGHT * scale;
  return Object.freeze({
    x: (viewportWidth - width) / 2,
    y: (viewportHeight - height) / 2,
    width,
    height,
    scale,
    compact: viewportWidth < 720 || viewportHeight < 500,
  });
}

function lighting(state: WizardCraftRuntimeState): {
  readonly dragon: number;
  readonly wizard: number;
  readonly balanced: number;
} {
  const active = new Map([...state.stickyVsReels, ...state.spinVsReels]);
  let dragon = 0;
  let wizard = 0;
  let balanced = 0;
  for (const value of active.values()) {
    const strength = Math.min(1, value.multiplier / 50);
    if (value.advantage === "dragon") dragon += strength;
    else if (value.advantage === "wizard") wizard += strength;
    else balanced += strength;
  }
  return {
    dragon: Math.min(1, dragon),
    wizard: Math.min(1, wizard),
    balanced: Math.min(1, balanced),
  };
}

function tier(command: WizardCraftRenderCommand): number {
  const value = command.event.tier ?? command.after.tier;
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new Error("WIZARD CRAFT cabinet feature beat requires a tier");
  }
  return value;
}

export class WizardCraftCabinetLayer implements WizardCraftPixiLayer {
  readonly #view: WizardCraftCabinetView;

  constructor(view: WizardCraftCabinetView) {
    this.#view = view;
  }

  sync(state: WizardCraftRuntimeState): void {
    const light = lighting(state);
    this.#view.setState(Object.freeze({
      title: "WIZARD CRAFT",
      tier: state.tier,
      crest: state.capped
        ? "maximum"
        : state.stickyVsReels.size > 0
        ? "clash"
        : "base",
      dragonLight: light.dragon,
      wizardLight: light.wizard,
      balancedLight: light.balanced,
      featureActive: state.tier !== null,
      capped: state.capped,
    }));
  }

  async play(
    beat: WizardCraftPresentationBeat,
    command: WizardCraftRenderCommand,
  ): Promise<void> {
    if (beat.channel !== "cabinet") {
      throw new Error(`Cabinet layer cannot play ${beat.channel} beat`);
    }
    this.#view.setAmbientMotion(beat.motion);
    if (beat.id === "cabinet.anticipation-glow") {
      await this.#view.anticipation(beat.motion);
      return;
    }
    if (beat.id.startsWith("duel.tier-") || beat.id === "duel.enter") {
      await this.#view.enterFeature(tier(command), beat.motion);
      return;
    }
    if (beat.id === "duel.handoff") {
      await this.#view.handoff(tier(command), beat.motion);
      return;
    }
    if (beat.id === "duel.retrigger") {
      await this.#view.retrigger(tier(command), beat.motion);
      return;
    }
    if (beat.id === "duel.end") {
      await this.#view.endFeature(beat.motion);
      return;
    }
    if (beat.id === "win.strong-power") {
      const amount = command.event.amount;
      if (
        !Number.isSafeInteger(amount) ||
        (amount as number) < 10_000 ||
        (amount as number) >= 2_500_000
      ) {
        throw new Error("WIZARD CRAFT strong cabinet beat requires 100× to below maximum");
      }
      await this.#view.strongWin(amount as number, beat.motion);
      return;
    }
    if (beat.id === "win.maximum-power") {
      const amount = command.event.amount;
      if (
        !Number.isSafeInteger(amount) ||
        (amount as number) !== 2_500_000
      ) {
        throw new Error("WIZARD CRAFT maximum cabinet beat requires 25,000×");
      }
      await this.#view.maximumWin(amount as number, beat.motion);
      return;
    }
    throw new Error(`Unsupported WIZARD CRAFT cabinet beat ${beat.id}`);
  }

  layout(viewportWidth: number, viewportHeight: number): void {
    this.#view.setLayout(
      createWizardCraftCabinetLayout(viewportWidth, viewportHeight),
    );
  }

  cancel(): void {
    this.#view.cancelAnimations();
  }

  destroy(): void {
    this.#view.destroy();
  }
}
