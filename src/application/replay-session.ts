import type { ReplayPort, ReplayResult } from "../replay/replay.js";

export type ReplaySessionState<TState> =
  | { readonly value: "uninitialized" }
  | { readonly value: "loading" }
  | { readonly value: "ready"; readonly replay: ReplayResult<TState> }
  | { readonly value: "playing"; readonly replay: ReplayResult<TState> }
  | { readonly value: "complete"; readonly replay: ReplayResult<TState> }
  | { readonly value: "failed"; readonly error: unknown }
  | { readonly value: "disposed" };

/** Read-only replay lifecycle. This API deliberately exposes no wager methods. */
export class ReplaySession<TState> {
  readonly #port: ReplayPort<TState>;
  #state: ReplaySessionState<TState> = { value: "uninitialized" };
  #disposed = false;

  constructor(port: ReplayPort<TState>) {
    this.#port = port;
  }

  get state(): ReplaySessionState<TState> {
    return this.#state;
  }

  async load(): Promise<void> {
    if (this.#state.value !== "uninitialized") {
      throw new Error("Replay can only be loaded once");
    }
    this.#state = { value: "loading" };
    try {
      const replay = await this.#port.load();
      if (!this.#disposed) {
        this.#state = { value: "ready", replay };
      }
    } catch (error) {
      if (!this.#disposed) {
        this.#state = { value: "failed", error };
      }
    }
  }

  play(): ReplayResult<TState> {
    if (this.#state.value !== "ready" && this.#state.value !== "complete") {
      throw new Error("Replay is not ready to play");
    }
    const replay = this.#state.replay;
    this.#state = { value: "playing", replay };
    return replay;
  }

  complete(): void {
    if (this.#state.value !== "playing") {
      throw new Error("Replay is not playing");
    }
    this.#state = { value: "complete", replay: this.#state.replay };
  }

  dispose(): void {
    this.#disposed = true;
    this.#state = { value: "disposed" };
  }
}
