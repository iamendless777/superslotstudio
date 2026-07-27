import { rgsAmount } from "../src/domain/money.js";
import type {
  AuthenticateResult,
  Balance,
  BetConfig,
  JurisdictionFlags,
  Round,
} from "../src/domain/rgs.js";

export const balance: Balance = {
  amount: rgsAmount(10_000_000),
  currency: "USD",
};
export const debitedBalance: Balance = {
  amount: rgsAmount(9_000_000),
  currency: "USD",
};
export const paidBalance: Balance = {
  amount: rgsAmount(11_000_000),
  currency: "USD",
};

export const config: BetConfig = {
  minBet: rgsAmount(100_000),
  maxBet: rgsAmount(100_000_000),
  stepBet: rgsAmount(100_000),
  defaultBetLevel: rgsAmount(1_000_000),
  betLevels: [rgsAmount(100_000), rgsAmount(1_000_000)],
};

export const jurisdiction: JurisdictionFlags = {
  socialCasino: false,
  disabledFullscreen: false,
  disabledTurbo: false,
  disabledSuperTurbo: false,
  disabledAutoplay: false,
  disabledSlamstop: false,
  disabledSpacebar: false,
  disabledBuyFeature: false,
  displayNetPosition: false,
  displayRTP: true,
  displaySessionTimer: false,
  minimumRoundDuration: 0,
};

export const activeRound: Round<readonly string[]> = {
  id: 42,
  amount: rgsAmount(1_000_000),
  payout: rgsAmount(2_000_000),
  payoutMultiplier: 2,
  active: true,
  mode: "BASE",
  event: "1",
  state: ["reveal", "win"],
};

export const completedRound: Round<readonly string[]> = {
  ...activeRound,
  active: false,
};

export function authenticated(
  round: Round<readonly string[]> | null = null,
  currentBalance = balance,
): AuthenticateResult<readonly string[]> {
  return { balance: currentBalance, config, jurisdiction, round };
}
