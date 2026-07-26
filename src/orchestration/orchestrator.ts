import {
  RgsPortError,
  ambiguousRgsFailure,
  type RgsFailure,
} from "../domain/error.js";
import type { RgsPort } from "../domain/rgs.js";
import {
  createInitialRecoveryState,
  transition,
  type RecoveryCommand,
  type RecoveryEvent,
  type RecoveryState,
} from "../recovery/machine.js";

export class OrchestratorDisposedError extends Error {
  constructor() {
    super("Recovery orchestrator is disposed");
    this.name = "OrchestratorDisposedError";
  }
}

export interface RecoveryOrchestratorOptions<TState> {
  readonly port: RgsPort<TState>;
  readonly onStateChange?: (state: RecoveryState<TState>) => void;
  readonly onCheckpointFailure?: (failure: RgsFailure) => void;
  readonly classifyUnknownFailure?: (
    operation: RgsFailure["operation"],
    error: unknown,
  ) => RgsFailure;
  readonly onObserverError?: (
    error: unknown,
    observer: "state-change" | "checkpoint-failure",
  ) => void;
}

/**
 * Serializes UI events and executes commands emitted by the pure recovery machine.
 * It never retries a command. A new instance must authenticate before it can wager.
 */
export class RecoveryOrchestrator<TState = unknown> {
  #state: RecoveryState<TState> = createInitialRecoveryState<TState>();
  #tail: Promise<void> = Promise.resolve();
  #disposed = false;
  readonly #options: RecoveryOrchestratorOptions<TState>;

  constructor(options: RecoveryOrchestratorOptions<TState>) {
    this.#options = options;
  }

  get state(): RecoveryState<TState> {
    return this.#state;
  }

  dispatch(event: RecoveryEvent<TState>): Promise<void> {
    if (this.#disposed) {
      return Promise.reject(new OrchestratorDisposedError());
    }

    const work = this.#tail.then(async () => {
      if (this.#disposed) {
        throw new OrchestratorDisposedError();
      }
      await this.#process(event);
    });
    this.#tail = work.catch(() => undefined);
    return work;
  }

  dispose(): void {
    this.#disposed = true;
  }

  async #process(event: RecoveryEvent<TState>): Promise<void> {
    if (this.#disposed) return;
    const result = transition(this.#state, event);
    this.#setState(result.state);

    for (const command of result.commands) {
      if (this.#disposed) return;
      const nextEvent = await this.#execute(command);
      if (nextEvent !== null && !this.#disposed) {
        await this.#process(nextEvent);
      }
    }
  }

  async #execute(
    command: RecoveryCommand,
  ): Promise<RecoveryEvent<TState> | null> {
    switch (command.type) {
      case "AUTHENTICATE":
        try {
          return {
            type: "AUTHENTICATED",
            result: await this.#options.port.authenticate(),
          };
        } catch (error) {
          return {
            type: "AUTHENTICATION_FAILED",
            failure: this.#failure("authenticate", error),
          };
        }
      case "PLAY":
        try {
          const result = await this.#options.port.play(command.request);
          return {
            type: "PLAY_SUCCEEDED",
            balance: result.balance,
            round: result.round,
          };
        } catch (error) {
          const failure = this.#failure("play", error);
          return failure.kind === "rejected"
            ? { type: "PLAY_REJECTED", failure }
            : { type: "PLAY_AMBIGUOUS" };
        }
      case "CHECKPOINT":
        try {
          await this.#options.port.checkpoint(command.event);
        } catch (error) {
          const failure = this.#failure("checkpoint", error);
          this.#observe(
            "checkpoint-failure",
            this.#options.onCheckpointFailure,
            failure,
          );
        }
        return null;
      case "END_ROUND":
        try {
          const result = await this.#options.port.endRound();
          return { type: "END_ROUND_SUCCEEDED", balance: result.balance };
        } catch (error) {
          const failure = this.#failure("end-round", error);
          return failure.kind === "rejected"
            ? { type: "END_ROUND_REJECTED", failure }
            : { type: "END_ROUND_AMBIGUOUS" };
        }
    }
  }

  #failure(operation: RgsFailure["operation"], error: unknown): RgsFailure {
    if (error instanceof RgsPortError) return error.failure;
    return (
      this.#options.classifyUnknownFailure?.(operation, error) ??
      ambiguousRgsFailure(operation)
    );
  }

  #setState(state: RecoveryState<TState>): void {
    if (this.#disposed) return;
    this.#state = state;
    this.#observe("state-change", this.#options.onStateChange, state);
  }

  #observe<T>(
    observer: "state-change" | "checkpoint-failure",
    callback: ((value: T) => void) | undefined,
    value: T,
  ): void {
    if (callback === undefined) return;
    try {
      callback(value);
    } catch (error) {
      try {
        this.#options.onObserverError?.(error, observer);
      } catch {
        // Observability callbacks cannot alter recovery control flow.
      }
    }
  }
}
