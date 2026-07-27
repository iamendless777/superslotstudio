import {
  InvalidReplayResponseError,
  parseReplayResult,
  type ReplayLaunchConfiguration,
  type ReplayPort,
  type ReplayResult,
} from "../../replay/replay.js";

export class HttpReplayError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "HttpReplayError";
    this.cause = cause;
  }
}

export interface HttpReplayPortOptions<TState> {
  readonly launch: ReplayLaunchConfiguration;
  readonly parseState: (value: unknown) => TState;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

/** Public, read-only replay transport. It never sends a player session. */
export class HttpReplayPort<TState> implements ReplayPort<TState> {
  readonly #launch: ReplayLaunchConfiguration;
  readonly #parseState: (value: unknown) => TState;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: HttpReplayPortOptions<TState>) {
    const timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("timeoutMs must be a positive safe integer");
    }
    this.#launch = options.launch;
    this.#parseState = options.parseState;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = timeoutMs;
  }

  async load(): Promise<ReplayResult<TState>> {
    const parts = [
      "bet",
      "replay",
      this.#launch.game,
      this.#launch.version,
      this.#launch.mode,
      this.#launch.event,
    ].map(encodeURIComponent);
    const url = new URL(`/${parts.join("/")}`, this.#launch.rgsBaseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new HttpReplayError(`Replay returned HTTP ${response.status}`);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        throw new HttpReplayError("Replay returned invalid JSON", error);
      }
      try {
        return parseReplayResult(body, this.#parseState);
      } catch (error) {
        if (error instanceof InvalidReplayResponseError) {
          throw new HttpReplayError(error.message, error);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof HttpReplayError) throw error;
      throw new HttpReplayError("Replay request failed", error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
