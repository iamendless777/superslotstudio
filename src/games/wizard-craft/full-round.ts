import type { RecoveryState } from "../../recovery/machine.js";
import type { WizardCraftFullRoundDriver } from "./autoplay.js";
import {
  WizardCraftPresentationController,
  type WizardCraftPresentationBoundary,
  type WizardCraftPresentationClock,
} from "./controller.js";
import type { WizardCraftRgsEvent } from "./official.js";
import {
  projectWizardCraftRgsRuntime,
  WizardCraftLayeredPresenter,
  type WizardCraftLayeredRenderer,
} from "./runtime.js";
import { WizardCraftUiController } from "./ui-controller.js";

function nextEventIndex(
  state: Extract<
    RecoveryState<readonly WizardCraftRgsEvent[]>,
    { readonly value: "active" }
  >,
): number {
  const checkpoint = state.round.event ?? "0";
  if (!/^(0|[1-9]\d*)$/.test(checkpoint)) {
    throw new Error("Invalid WIZARD CRAFT resume checkpoint");
  }
  const index = Number(checkpoint);
  if (index > state.round.state.length) {
    throw new Error("WIZARD CRAFT resume checkpoint exceeds the event book");
  }
  return index;
}

export class WizardCraftFullRoundController
implements WizardCraftFullRoundDriver {
  readonly #ui: WizardCraftUiController;
  readonly #session: WizardCraftPresentationBoundary;
  readonly #renderer: WizardCraftLayeredRenderer;
  readonly #presentation: WizardCraftPresentationController;
  #running = false;

  constructor(
    ui: WizardCraftUiController,
    session: WizardCraftPresentationBoundary,
    renderer: WizardCraftLayeredRenderer,
    clock?: WizardCraftPresentationClock,
  ) {
    this.#ui = ui;
    this.#session = session;
    this.#renderer = renderer;
    this.#presentation = clock === undefined
      ? new WizardCraftPresentationController(session)
      : new WizardCraftPresentationController(session, clock);
  }

  get controlState() {
    return this.#ui.state;
  }

  async playFullRound(): Promise<void> {
    if (this.#running) {
      throw new Error("WIZARD CRAFT full round is already running");
    }
    this.#running = true;
    try {
      await this.#ui.play();
      await this.#presentActiveRound();
    } finally {
      this.#running = false;
    }
  }

  async resumeActiveRound(): Promise<void> {
    if (this.#running) {
      throw new Error("WIZARD CRAFT full round is already running");
    }
    if (this.#session.state.value !== "active") {
      throw new Error("No active WIZARD CRAFT round to resume");
    }
    this.#running = true;
    try {
      await this.#presentActiveRound();
    } finally {
      this.#running = false;
    }
  }

  async #presentActiveRound(): Promise<void> {
    const profile = this.#ui.state.selectedSpeed === "normal"
      ? "normal"
      : "fast";
    const state = this.#session.state;
    if (state.value !== "active") {
      throw new Error("WIZARD CRAFT Play did not produce an active result");
    }
    const initial = projectWizardCraftRgsRuntime(
      state.round.state,
      nextEventIndex(state),
    );
    const presenter = new WizardCraftLayeredPresenter(
      this.#renderer,
      profile,
      initial,
    );
    await this.#presentation.presentActiveRound((event) =>
      presenter.present(event)
    );
  }
}
