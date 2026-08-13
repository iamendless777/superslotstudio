import {
  RgsPortError,
  rejectedRgsFailure,
  type RgsErrorCode,
  type RgsFailure,
} from "../../domain/error.js";
import type {
  AuthenticateResult,
  EndRoundResult,
  EventResult,
  PlayRequest,
  PlayResult,
  Round,
  RgsPort,
} from "../../domain/rgs.js";
import {
  InvalidRgsResponseError,
  parseAuthenticateResult,
  parseEndRoundResult,
  parseEventResult,
  parsePlayResult,
} from "../../validation/rgs.js";
import type { LaunchConfiguration } from "./launch.js";

type Operation = RgsFailure["operation"];

const KNOWN_ERROR_CODES = new Set<RgsErrorCode>([
  "ERR_VAL",
  "ERR_IPB",
  "ERR_IS",
  "ERR_ATE",
  "ERR_GLE",
  "ERR_LOC",
  "ERR_GEN",
  "ERR_MAINTENANCE",
]);

export class HttpRgsTransportError extends Error {
  readonly operation: Operation;
  override readonly cause: unknown;

  constructor(operation: Operation, cause: unknown) {
    super(`RGS ${operation} transport outcome is unknown`);
    this.name = "HttpRgsTransportError";
    this.operation = operation;
    this.cause = cause;
  }
}

export interface HttpRgsPortOptions<TState = unknown> {
  readonly launch: LaunchConfiguration;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly parseState?: (value: unknown) => TState;
  readonly validateRound?: (round: Round<TState>) => void;
}

/** Dependency-free adapter for the documented RGS wallet/event endpoints. */
export class HttpRgsPort<TState = unknown> implements RgsPort<TState> {
  readonly #launch: LaunchConfiguration;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #parseState: ((value: unknown) => TState) | undefined;
  readonly #validateRound: ((round: Round<TState>) => void) | undefined;

  constructor(options: HttpRgsPortOptions<TState>) {
    if (
      !Number.isSafeInteger(options.timeoutMs ?? 10_000) ||
      (options.timeoutMs ?? 10_000) <= 0
    ) {
      throw new RangeError("timeoutMs must be a positive safe integer");
    }
    this.#launch = options.launch;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#parseState = options.parseState as
      | ((value: unknown) => TState)
      | undefined;
    this.#validateRound = options.validateRound as
      | ((round: Round<TState>) => void)
      | undefined;
  }

  async authenticate(): Promise<AuthenticateResult<TState>> {
    const body = await this.#post("authenticate", "/wallet/authenticate", {
      sessionID: this.#launch.sessionID,
      language: this.#launch.language,
    });
    return this.#parse("authenticate", () => {
      const result = parseAuthenticateResult<TState>(body, this.#parseState);
      if (result.round !== null) this.#validate(result.round, "response.round");
      return result;
    });
  }

  async play(request: PlayRequest): Promise<PlayResult<TState>> {
    const body = await this.#post("play", "/wallet/play", {
      sessionID: this.#launch.sessionID,
      amount: request.amount,
      mode: request.mode,
    });
    return this.#parse("play", () => {
      const result = parsePlayResult<TState>(body, this.#parseState);
      this.#validate(result.round, "response.round");
      return result;
    });
  }

  async checkpoint(event: string): Promise<EventResult> {
    const body = await this.#post("checkpoint", "/bet/event", {
      sessionID: this.#launch.sessionID,
      event,
    });
    return this.#parse("checkpoint", () => parseEventResult(body));
  }

  async endRound(): Promise<EndRoundResult> {
    const body = await this.#post("end-round", "/wallet/end-round", {
      sessionID: this.#launch.sessionID,
    });
    return this.#parse("end-round", () => parseEndRoundResult(body));
  }

  async balance(): Promise<EndRoundResult> {
    const body = await this.#post("balance", "/wallet/balance", {
      sessionID: this.#launch.sessionID,
    });
    return this.#parse("balance", () => parseEndRoundResult(body));
  }

  async #post(
    operation: Operation,
    path: string,
    body: object,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(
        new URL(path, this.#launch.rgsBaseUrl),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const responseBody = await this.#rejectionBody(response);
        const details = this.#errorDetails(responseBody);
        if (details !== null) {
          throw new RgsPortError(
            rejectedRgsFailure(operation, details.code, details.message),
          );
        }
        throw new HttpRgsTransportError(
          operation,
          new Error(
            `RGS returned HTTP ${response.status} without a documented error`,
          ),
        );
      }
      const responseBody = await this.#json(operation, response);
      return responseBody;
    } catch (error) {
      if (
        error instanceof RgsPortError ||
        error instanceof HttpRgsTransportError
      )
        throw error;
      throw new HttpRgsTransportError(operation, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async #json(operation: Operation, response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new HttpRgsTransportError(operation, error);
    }
  }

  async #rejectionBody(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  #parse<T>(operation: Operation, parser: () => T): T {
    try {
      return parser();
    } catch (error) {
      if (error instanceof InvalidRgsResponseError) {
        throw new RgsPortError({
          kind: "invalid-response",
          operation,
          code: "UNKNOWN",
          message: error.message,
        });
      }
      throw error;
    }
  }

  #validate(round: Round<TState>, path: string): void {
    try {
      this.#validateRound?.(round);
    } catch (error) {
      throw new InvalidRgsResponseError(
        path,
        error instanceof Error
          ? `valid game round (${error.message})`
          : "valid game round",
      );
    }
  }

  #errorDetails(body: unknown): { code: RgsErrorCode; message: string } | null {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }
    const input = body as Record<string, unknown>;
    const rawCode = typeof input.error === "string" ? input.error : undefined;
    if (!KNOWN_ERROR_CODES.has(rawCode as RgsErrorCode)) return null;
    const code = rawCode as RgsErrorCode;
    const message =
      typeof input.message === "string"
        ? input.message
        : `RGS request rejected with ${code}`;
    return { code, message };
  }
}
