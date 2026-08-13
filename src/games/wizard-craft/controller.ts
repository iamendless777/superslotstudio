import type { RecoveryState } from "../../recovery/machine.js";
import type { WizardCraftRgsEvent } from "./official.js";

export interface WizardCraftPresentationBoundary {
  readonly state: RecoveryState<readonly WizardCraftRgsEvent[]>;
  checkpoint(event: string): Promise<void>;
  completePresentation(): Promise<void>;
}

export interface WizardCraftPresentationClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export type WizardCraftEventPresenter = (
  event: WizardCraftRgsEvent,
) => void | Promise<void>;

export async function presentWizardCraftEvents(
  events: readonly WizardCraftRgsEvent[],
  nextIndex: number,
  present: WizardCraftEventPresenter,
  afterPresented?: (eventIndex: number) => void | Promise<void>,
): Promise<void> {
  if (!Number.isSafeInteger(nextIndex) || nextIndex < 0 || nextIndex > events.length) {
    throw new Error("WIZARD CRAFT resume checkpoint exceeds the event book");
  }
  for (let index = nextIndex; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined || event.index !== index) {
      throw new Error(`Missing validated WIZARD CRAFT event ${index}`);
    }
    await present(event);
    // Stake web-sdk /bet/event records an existing bookEvent.index. The RGS
    // resume cursor therefore identifies the event that may be replayed, not
    // a synthetic one-past-the-end index.
    await afterPresented?.(index);
  }
}

export class WizardCraftPresentationController {
  readonly #session: WizardCraftPresentationBoundary;
  readonly #clock: WizardCraftPresentationClock;
  #running = false;

  constructor(
    session: WizardCraftPresentationBoundary,
    clock: WizardCraftPresentationClock = {
      now: () => Date.now(),
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
    },
  ) {
    this.#session = session;
    this.#clock = clock;
  }

  async presentActiveRound(present: WizardCraftEventPresenter): Promise<void> {
    if (this.#running) throw new Error("WIZARD CRAFT presentation is already running");
    const state = this.#session.state;
    if (state.value !== "active") throw new Error("No active WIZARD CRAFT round");

    const events = state.round.state;
    const presentationStarted = this.#clock.now();
    const checkpoint = state.round.event ?? "0";
    if (!/^(0|[1-9]\d*)$/.test(checkpoint)) {
      throw new Error("Invalid WIZARD CRAFT resume checkpoint");
    }
    const nextIndex = Number(checkpoint);
    if (nextIndex > events.length) {
      throw new Error("WIZARD CRAFT resume checkpoint exceeds the event book");
    }

    this.#running = true;
    try {
      await presentWizardCraftEvents(
        events,
        nextIndex,
        present,
        (index) => this.#session.checkpoint(String(index)),
      );
      if (!state.resumed) {
        const minimum = state.session.jurisdiction.minimumRoundDuration;
        const remaining = Math.max(
          0,
          minimum - (this.#clock.now() - presentationStarted),
        );
        if (remaining > 0) await this.#clock.sleep(remaining);
      }
      await this.#session.completePresentation();
    } finally {
      this.#running = false;
    }
  }
}
