import type { RgsFailure } from "../domain/error.js";
import type { PlayRequest, RgsPort } from "../domain/rgs.js";
import {
  RecoveryOrchestrator,
  type RecoveryOrchestratorOptions,
} from "../orchestration/orchestrator.js";
import type { RecoveryState } from "../recovery/machine.js";

export type GameSessionListener<TState> = (
  state: RecoveryState<TState>,
) => void;

export interface GameSessionOptions<TState> {
  readonly port: RgsPort<TState>;
  readonly onCheckpointFailure?: (failure: RgsFailure) => void;
  readonly classifyUnknownFailure?: RecoveryOrchestratorOptions<TState>["classifyUnknownFailure"];
  readonly onObserverError?: (error: unknown) => void;
}

/** UI-free boundary that accepts player intent, never internal result events. */
export class GameSession<TState = unknown> {
  readonly #orchestrator: RecoveryOrchestrator<TState>;
  readonly #listeners = new Set<GameSessionListener<TState>>();
  readonly #onObserverError: ((error: unknown) => void) | undefined;
  #disposed = false;

  constructor(options: GameSessionOptions<TState>) {
    this.#onObserverError = options.onObserverError;
    this.#orchestrator = new RecoveryOrchestrator({
      port: options.port,
      ...(options.onCheckpointFailure === undefined
        ? {}
        : { onCheckpointFailure: options.onCheckpointFailure }),
      ...(options.classifyUnknownFailure === undefined
        ? {}
        : { classifyUnknownFailure: options.classifyUnknownFailure }),
      onObserverError: (error) => this.#reportObserverError(error),
      onStateChange: (state) => this.#notify(state),
    });
  }

  get state(): RecoveryState<TState> {
    return this.#orchestrator.state;
  }

  start(): Promise<void> {
    return this.#orchestrator.dispatch({ type: "BOOT" });
  }

  placeBet(request: PlayRequest): Promise<void> {
    return this.#orchestrator.dispatch({ type: "PLACE_BET", request });
  }

  checkpoint(event: string): Promise<void> {
    return this.#orchestrator.dispatch({ type: "CHECKPOINT", event });
  }

  completePresentation(): Promise<void> {
    return this.#orchestrator.dispatch({ type: "PRESENTATION_COMPLETED" });
  }

  subscribe(listener: GameSessionListener<TState>): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    this.#callListener(listener, this.state);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
    this.#orchestrator.dispose();
  }

  #notify(state: RecoveryState<TState>): void {
    for (const listener of [...this.#listeners]) {
      this.#callListener(listener, state);
    }
  }

  #callListener(
    listener: GameSessionListener<TState>,
    state: RecoveryState<TState>,
  ): void {
    try {
      listener(state);
    } catch (error) {
      this.#reportObserverError(error);
    }
  }

  #reportObserverError(error: unknown): void {
    try {
      this.#onObserverError?.(error);
    } catch {
      // Observer reporting cannot interfere with session control.
    }
  }
}
