import type { RgsAmount } from "./money.js";

export interface Balance {
  readonly amount: RgsAmount;
  readonly currency: string;
}

export interface BetConfig {
  readonly minBet: RgsAmount;
  readonly maxBet: RgsAmount;
  readonly stepBet: RgsAmount;
  readonly defaultBetLevel: RgsAmount;
  readonly betLevels: readonly RgsAmount[];
}

export interface JurisdictionFlags {
  readonly socialCasino: boolean;
  readonly disabledFullscreen: boolean;
  readonly disabledTurbo: boolean;
  readonly disabledSuperTurbo: boolean;
  readonly disabledAutoplay: boolean;
  readonly disabledSlamstop: boolean;
  readonly disabledSpacebar: boolean;
  readonly disabledBuyFeature: boolean;
  readonly displayNetPosition: boolean;
  readonly displayRTP: boolean;
  readonly displaySessionTimer: boolean;
  readonly minimumRoundDuration: number;
}

export interface Round<TState = unknown> {
  readonly id: number;
  readonly amount: RgsAmount;
  readonly payout: RgsAmount;
  readonly payoutMultiplier: number;
  readonly active: boolean;
  readonly mode: string;
  readonly event: string | null;
  readonly state: TState;
}

export interface AuthenticateResult<TState = unknown> {
  readonly balance: Balance;
  readonly config: BetConfig;
  readonly jurisdiction: JurisdictionFlags;
  readonly round: Round<TState> | null;
}

export interface PlayRequest {
  readonly amount: RgsAmount;
  readonly mode: string;
}

export interface PlayResult<TState = unknown> {
  readonly balance: Balance;
  readonly round: Round<TState>;
}

export interface EndRoundResult {
  readonly balance: Balance;
}

export interface EventResult {
  readonly event: string;
}

/** Narrow local port. No upstream package types cross this boundary. */
export interface RgsPort<TState = unknown> {
  authenticate(): Promise<AuthenticateResult<TState>>;
  play(request: PlayRequest): Promise<PlayResult<TState>>;
  checkpoint(event: string): Promise<EventResult>;
  endRound(): Promise<EndRoundResult>;
}

export function isValidPlayRequest(
  config: BetConfig,
  request: PlayRequest,
): boolean {
  return (
    request.mode.length > 0 &&
    request.amount >= config.minBet &&
    request.amount <= config.maxBet &&
    request.amount % config.stepBet === 0
  );
}
