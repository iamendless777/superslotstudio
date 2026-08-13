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
  readonly balancePollMs?: number | false;
}

/** UI-free boundary that accepts player intent, never internal result events. */
export class GameSession<TState = unknown> {
  readonly #orchestrator: RecoveryOrchestrator<TState>;
  readonly #listeners = new Set<GameSessionListener<TState>>();
  readonly #onObserverError: ((error: unknown) => void) | undefined;
  #disposed = false;
  readonly #supportsBalanceRefresh: boolean;
  readonly #balancePollMs: number | false;
  #balanceTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: GameSessionOptions<TState>) {
    if (
      options.balancePollMs !== undefined &&
      options.balancePollMs !== false &&
      (!Number.isSafeInteger(options.balancePollMs) || options.balancePollMs <= 0)
    ) {
      throw new RangeError("balancePollMs must be a positive safe integer or false");
    }
    this.#onObserverError = options.onObserverError;
    this.#supportsBalanceRefresh = options.port.balance !== undefined;
    this.#balancePollMs = options.balancePollMs ?? 60_000;
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

  async start(): Promise<void> {
    await this.#orchestrator.dispatch({ type: "BOOT" });
    this.#startBalancePolling();
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

  refreshBalance(): Promise<void> {
    return this.#orchestrator.dispatch({ type: "REFRESH_BALANCE" });
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
    if (this.#balanceTimer !== null) clearInterval(this.#balanceTimer);
    this.#balanceTimer = null;
    this.#listeners.clear();
    this.#orchestrator.dispose();
  }

  #startBalancePolling(): void {
    if (
      this.#balanceTimer !== null ||
      !this.#supportsBalanceRefresh ||
      this.#balancePollMs === false
    ) return;
    this.#balanceTimer = setInterval(() => {
      if (this.state.value === "idle") void this.refreshBalance().catch(() => undefined);
    }, this.#balancePollMs);
    const timer = this.#balanceTimer as unknown as { unref?: () => void };
    timer.unref?.();
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
