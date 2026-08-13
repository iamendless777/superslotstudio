import { rgsAmount } from "../domain/money.js";
import type {
  AuthenticateResult,
  Balance,
  BetConfig,
  EndRoundResult,
  EventResult,
  JurisdictionFlags,
  PlayResult,
  Round,
} from "../domain/rgs.js";

export class InvalidRgsResponseError extends TypeError {
  readonly path: string;

  constructor(path: string, expectation: string) {
    super(`Invalid RGS response at ${path}: expected ${expectation}`);
    this.name = "InvalidRgsResponseError";
    this.path = path;
  }
}

type RecordValue = Record<string, unknown>;

function record(value: unknown, path: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidRgsResponseError(path, "object");
  }
  return value as RecordValue;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidRgsResponseError(path, "non-empty string");
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new InvalidRgsResponseError(path, "boolean");
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidRgsResponseError(path, "finite number");
  }
  return value;
}

function safeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new InvalidRgsResponseError(path, "safe integer");
  }
  return value;
}

function amount(value: unknown, path: string) {
  try {
    return rgsAmount(finiteNumber(value, path));
  } catch {
    throw new InvalidRgsResponseError(
      path,
      "non-negative safe integer RGS amount",
    );
  }
}

export function parseBalance(value: unknown, path = "balance"): Balance {
  const input = record(value, path);
  return {
    amount: amount(input.amount, `${path}.amount`),
    currency: string(input.currency, `${path}.currency`),
  };
}

export function parseBetConfig(value: unknown, path = "config"): BetConfig {
  const input = record(value, path);
  if (!Array.isArray(input.betLevels)) {
    throw new InvalidRgsResponseError(`${path}.betLevels`, "array");
  }

  const parsed: BetConfig = {
    minBet: amount(input.minBet, `${path}.minBet`),
    maxBet: amount(input.maxBet, `${path}.maxBet`),
    stepBet: amount(input.stepBet, `${path}.stepBet`),
    defaultBetLevel: amount(input.defaultBetLevel, `${path}.defaultBetLevel`),
    betLevels: input.betLevels.map((level, index) =>
      amount(level, `${path}.betLevels[${index}]`),
    ),
  };

  if (
    parsed.stepBet === 0 ||
    parsed.minBet > parsed.maxBet ||
    parsed.defaultBetLevel < parsed.minBet ||
    parsed.defaultBetLevel > parsed.maxBet ||
    parsed.defaultBetLevel % parsed.stepBet !== 0 ||
    parsed.betLevels.some(
      (level) =>
        level < parsed.minBet ||
        level > parsed.maxBet ||
        level % parsed.stepBet !== 0,
    ) ||
    (
      parsed.betLevels.length > 0 &&
      !parsed.betLevels.includes(parsed.defaultBetLevel)
    )
  ) {
    throw new InvalidRgsResponseError(
      path,
      "coherent min/max/step/default/list configuration",
    );
  }
  return parsed;
}

export function parseJurisdiction(
  value: unknown,
  path = "config.jurisdiction",
): JurisdictionFlags {
  const input = record(value, path);
  return {
    socialCasino: boolean(input.socialCasino, `${path}.socialCasino`),
    disabledFullscreen: boolean(
      input.disabledFullscreen,
      `${path}.disabledFullscreen`,
    ),
    disabledTurbo: boolean(input.disabledTurbo, `${path}.disabledTurbo`),
    disabledSuperTurbo: boolean(
      input.disabledSuperTurbo,
      `${path}.disabledSuperTurbo`,
    ),
    disabledAutoplay: boolean(
      input.disabledAutoplay,
      `${path}.disabledAutoplay`,
    ),
    disabledSlamstop: boolean(
      input.disabledSlamstop,
      `${path}.disabledSlamstop`,
    ),
    disabledSpacebar: boolean(
      input.disabledSpacebar,
      `${path}.disabledSpacebar`,
    ),
    disabledBuyFeature: boolean(
      input.disabledBuyFeature,
      `${path}.disabledBuyFeature`,
    ),
    displayNetPosition: boolean(
      input.displayNetPosition,
      `${path}.displayNetPosition`,
    ),
    displayRTP: boolean(input.displayRTP, `${path}.displayRTP`),
    displaySessionTimer: boolean(
      input.displaySessionTimer,
      `${path}.displaySessionTimer`,
    ),
    minimumRoundDuration: (() => {
      const duration = finiteNumber(
        input.minimumRoundDuration,
        `${path}.minimumRoundDuration`,
      );
      if (duration < 0) {
        throw new InvalidRgsResponseError(
          `${path}.minimumRoundDuration`,
          "non-negative number",
        );
      }
      return duration;
    })(),
  };
}

export function parseRound<TState = unknown>(
  value: unknown,
  path = "round",
  parseState?: (value: unknown) => TState,
): Round<TState> {
  const input = record(value, path);
  if (!("state" in input)) {
    throw new InvalidRgsResponseError(`${path}.state`, "game-owned state");
  }
  const event = input.event;
  if (event !== null && typeof event !== "string") {
    throw new InvalidRgsResponseError(`${path}.event`, "string or null");
  }

  let state: TState;
  try {
    state = parseState === undefined
      ? input.state as TState
      : parseState(input.state);
  } catch (error) {
    throw new InvalidRgsResponseError(
      `${path}.state`,
      error instanceof Error ? `valid game state (${error.message})` : "valid game state",
    );
  }

  return {
    id: safeInteger(input.betID ?? input.roundID, `${path}.betID`),
    amount: amount(input.amount, `${path}.amount`),
    payout: amount(input.payout ?? 0, `${path}.payout`),
    payoutMultiplier: finiteNumber(
      input.payoutMultiplier ?? 0,
      `${path}.payoutMultiplier`,
    ),
    active: boolean(input.active, `${path}.active`),
    mode: string(input.mode, `${path}.mode`),
    event,
    state,
  };
}

export function parseAuthenticateResult<TState = unknown>(
  value: unknown,
  parseState?: (value: unknown) => TState,
): AuthenticateResult<TState> {
  const input = record(value, "response");
  const config = record(input.config, "response.config");
  return {
    balance: parseBalance(input.balance, "response.balance"),
    config: parseBetConfig(config, "response.config"),
    jurisdiction: parseJurisdiction(
      config.jurisdiction,
      "response.config.jurisdiction",
    ),
    round:
      input.round === null || input.round === undefined
        ? null
        : parseRound<TState>(input.round, "response.round", parseState),
  };
}

export function parsePlayResult<TState = unknown>(
  value: unknown,
  parseState?: (value: unknown) => TState,
): PlayResult<TState> {
  const input = record(value, "response");
  return {
    balance: parseBalance(input.balance, "response.balance"),
    round: parseRound<TState>(input.round, "response.round", parseState),
  };
}

export function parseEndRoundResult(value: unknown): EndRoundResult {
  const input = record(value, "response");
  return { balance: parseBalance(input.balance, "response.balance") };
}

export function parseEventResult(value: unknown): EventResult {
  const input = record(value, "response");
  return { event: string(input.event, "response.event") };
}
