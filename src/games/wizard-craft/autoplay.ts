import type { WizardCraftControlState } from "./ui-controller.js";

export type WizardCraftAutoplayStatus =
  | "idle"
  | "running"
  | "stopping"
  | "completed"
  | "stopped"
  | "unavailable"
  | "failed";

export interface WizardCraftAutoplayState {
  readonly status: WizardCraftAutoplayStatus;
  readonly requested: number;
  readonly completed: number;
  readonly remaining: number;
}

/**
 * One invocation must cover one complete authoritative round: Play response,
 * validated presentation, checkpoints, and settlement where required.
 */
export interface WizardCraftFullRoundDriver {
  readonly controlState: WizardCraftControlState;
  playFullRound(): Promise<void>;
}

export class WizardCraftAutoplayRunner {
  readonly #driver: WizardCraftFullRoundDriver;
  readonly #listeners = new Set<(state: WizardCraftAutoplayState) => void>();
  #state: WizardCraftAutoplayState = Object.freeze({
    status: "idle",
    requested: 0,
    completed: 0,
    remaining: 0,
  });
  #stopRequested = false;
  #disposed = false;

  constructor(driver: WizardCraftFullRoundDriver) {
    this.#driver = driver;
  }

  get state(): WizardCraftAutoplayState {
    return this.#state;
  }

  subscribe(listener: (state: WizardCraftAutoplayState) => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  async startConfirmed(spins: number): Promise<void> {
    if (this.#disposed) throw new Error("WIZARD CRAFT autoplay is disposed");
    if (this.#state.status === "running" || this.#state.status === "stopping") {
      throw new Error("WIZARD CRAFT autoplay is already running");
    }
    if (!Number.isSafeInteger(spins) || spins < 1 || spins > 1_000) {
      throw new RangeError("WIZARD CRAFT autoplay count is unavailable");
    }
    if (!this.#canStartRound()) {
      throw new Error("WIZARD CRAFT autoplay is unavailable");
    }

    this.#stopRequested = false;
    this.#setState({
      status: "running",
      requested: spins,
      completed: 0,
      remaining: spins,
    });

    while (this.#state.completed < spins) {
      if (this.#stopRequested || this.#disposed) {
        this.#finish("stopped");
        return;
      }
      if (!this.#canStartRound()) {
        this.#finish("unavailable");
        return;
      }

      try {
        await this.#driver.playFullRound();
      } catch {
        this.#finish("failed");
        return;
      }

      const completed = this.#state.completed + 1;
      this.#setState({
        status: this.#stopRequested ? "stopping" : "running",
        requested: spins,
        completed,
        remaining: spins - completed,
      });
    }
    this.#finish(this.#stopRequested ? "stopped" : "completed");
  }

  stop(): boolean {
    if (this.#state.status !== "running") return false;
    this.#stopRequested = true;
    this.#setState({ ...this.#state, status: "stopping" });
    return true;
  }

  reset(): void {
    if (this.#state.status === "running" || this.#state.status === "stopping") {
      throw new Error("WIZARD CRAFT autoplay cannot reset during a round");
    }
    this.#stopRequested = false;
    this.#setState({
      status: "idle",
      requested: 0,
      completed: 0,
      remaining: 0,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopRequested = true;
    this.#listeners.clear();
  }

  #canStartRound(): boolean {
    const state = this.#driver.controlState;
    return state.ui.canPlay && state.ui.policy?.autoplay === true;
  }

  #finish(status: Extract<
    WizardCraftAutoplayStatus,
    "completed" | "stopped" | "unavailable" | "failed"
  >): void {
    this.#setState({ ...this.#state, status });
  }

  #setState(state: WizardCraftAutoplayState): void {
    this.#state = Object.freeze(state);
    if (this.#disposed) return;
    for (const listener of [...this.#listeners]) listener(this.#state);
  }
}
