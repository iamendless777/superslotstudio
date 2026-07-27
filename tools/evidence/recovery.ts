import { ambiguousRgsFailure, RgsPortError } from "../../src/domain/error.js";
import { rgsAmount } from "../../src/domain/money.js";
import type {
  AuthenticateResult,
  Balance,
  BetConfig,
  JurisdictionFlags,
  Round,
} from "../../src/domain/rgs.js";
import { RecoveryOrchestrator } from "../../src/orchestration/orchestrator.js";
import { FakeRgsPort, type FakeOperation } from "../../src/testing/fake-rgs.js";

type GameState = readonly string[];

export interface RecoveryEvidenceScenario {
  readonly id:
    | "play-not-committed"
    | "play-committed-response-lost"
    | "checkpoint-committed-response-lost"
    | "end-round-committed-response-lost";
  readonly injectedFailure: string;
  readonly calls: readonly FakeOperation[];
  readonly stateTransitions: readonly string[];
  readonly finalClientState: string;
  readonly authoritative: {
    readonly balanceAmount: number;
    readonly roundActive: boolean;
    readonly checkpoint: string | null;
  };
  readonly assertions: {
    readonly noBlindMutationRetry: boolean;
    readonly authoritativeBalanceAdopted: boolean;
    readonly authoritativeRoundAdopted: boolean;
  };
}

export interface RecoveryEvidenceReport {
  readonly schemaVersion: 1;
  readonly kind: "local-recovery-failure-injection";
  readonly environment: "deterministic-local-simulation";
  readonly notice: string;
  readonly scenarios: readonly RecoveryEvidenceScenario[];
}

const openingBalance: Balance = {
  amount: rgsAmount(10_000_000),
  currency: "USD",
};
const debitedBalance: Balance = {
  amount: rgsAmount(9_000_000),
  currency: "USD",
};
const settledBalance: Balance = {
  amount: rgsAmount(11_000_000),
  currency: "USD",
};
const config: BetConfig = {
  minBet: rgsAmount(100_000),
  maxBet: rgsAmount(100_000_000),
  stepBet: rgsAmount(100_000),
  defaultBetLevel: rgsAmount(1_000_000),
  betLevels: [rgsAmount(100_000), rgsAmount(1_000_000)],
};
const jurisdiction: JurisdictionFlags = {
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

function round(event = "1"): Round<GameState> {
  return {
    id: 42,
    amount: rgsAmount(1_000_000),
    payout: rgsAmount(2_000_000),
    payoutMultiplier: 2,
    active: true,
    mode: "BASE",
    event,
    state: ["reveal", "win"],
  };
}

function interrupted(operation: "play" | "checkpoint" | "end-round"): never {
  throw new RgsPortError(
    ambiguousRgsFailure(operation, "Injected response-path interruption"),
  );
}

function authentication(
  balance: Balance,
  activeRound: Round<GameState> | null,
): AuthenticateResult<GameState> {
  return { balance, config, jurisdiction, round: activeRound };
}

function scenarioResult(
  id: RecoveryEvidenceScenario["id"],
  injectedFailure: string,
  fake: FakeRgsPort<GameState>,
  states: readonly string[],
  finalState: string,
  balance: Balance,
  activeRound: Round<GameState> | null,
  expectedMutationCalls: number,
  adoptedBalance: boolean,
  adoptedRound: boolean,
): RecoveryEvidenceScenario {
  const mutation =
    id.startsWith("play")
      ? "play"
      : id.startsWith("checkpoint")
        ? "checkpoint"
        : "end-round";
  return {
    id,
    injectedFailure,
    calls: fake.calls.map(({ operation }) => operation),
    stateTransitions: states,
    finalClientState: finalState,
    authoritative: {
      balanceAmount: balance.amount,
      roundActive: activeRound?.active === true,
      checkpoint: activeRound?.event ?? null,
    },
    assertions: {
      noBlindMutationRetry:
        fake.calls.filter(({ operation }) => operation === mutation).length ===
        expectedMutationCalls,
      authoritativeBalanceAdopted: adoptedBalance,
      authoritativeRoundAdopted: adoptedRound,
    },
  };
}

async function playScenario(
  committed: boolean,
): Promise<RecoveryEvidenceScenario> {
  let balance = openingBalance;
  let activeRound: Round<GameState> | null = null;
  const states: string[] = [];
  const fake = new FakeRgsPort<GameState>({
    authenticate: async () => authentication(balance, activeRound),
    play: async () => {
      if (committed) {
        balance = debitedBalance;
        activeRound = round();
      }
      return interrupted("play");
    },
    checkpoint: async (event) => ({ event }),
    endRound: async () => ({ balance: settledBalance }),
  });
  const orchestrator = new RecoveryOrchestrator({
    port: fake,
    onStateChange: (state) => states.push(state.value),
  });
  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({
    type: "PLACE_BET",
    request: { amount: rgsAmount(1_000_000), mode: "BASE" },
  });
  const clientBalance =
    orchestrator.state.value === "idle" || orchestrator.state.value === "active"
      ? orchestrator.state.session.balance.amount
      : -1;
  const adoptedRound = committed
    ? orchestrator.state.value === "active" && orchestrator.state.resumed
    : orchestrator.state.value === "idle";
  return scenarioResult(
    committed ? "play-committed-response-lost" : "play-not-committed",
    committed ? "after authoritative commit" : "before authoritative commit",
    fake,
    states,
    orchestrator.state.value,
    balance,
    activeRound,
    1,
    clientBalance === balance.amount,
    adoptedRound,
  );
}

async function checkpointScenario(): Promise<RecoveryEvidenceScenario> {
  let balance = debitedBalance;
  let activeRound: Round<GameState> | null = round("1");
  const states: string[] = [];
  const fake = new FakeRgsPort<GameState>({
    authenticate: async () => authentication(balance, activeRound),
    play: async () => ({ balance, round: activeRound ?? round() }),
    checkpoint: async (event) => {
      activeRound = round(event);
      return interrupted("checkpoint");
    },
    endRound: async () => ({ balance: settledBalance }),
  });
  const firstClient = new RecoveryOrchestrator({ port: fake });
  await firstClient.dispatch({ type: "BOOT" });
  await firstClient.dispatch({ type: "CHECKPOINT", event: "2" });
  firstClient.dispose();

  const freshClient = new RecoveryOrchestrator({
    port: fake,
    onStateChange: (state) => states.push(state.value),
  });
  await freshClient.dispatch({ type: "BOOT" });
  const adoptedRound =
    freshClient.state.value === "active" &&
    freshClient.state.round.event === activeRound?.event;
  return scenarioResult(
    "checkpoint-committed-response-lost",
    "after authoritative checkpoint commit",
    fake,
    states,
    freshClient.state.value,
    balance,
    activeRound,
    1,
    freshClient.state.value === "active" &&
      freshClient.state.session.balance.amount === balance.amount,
    adoptedRound,
  );
}

async function endRoundScenario(): Promise<RecoveryEvidenceScenario> {
  let balance = debitedBalance;
  let activeRound: Round<GameState> | null = round();
  const states: string[] = [];
  const fake = new FakeRgsPort<GameState>({
    authenticate: async () => authentication(balance, activeRound),
    play: async () => ({ balance, round: activeRound ?? round() }),
    checkpoint: async (event) => ({ event }),
    endRound: async () => {
      balance = settledBalance;
      activeRound = null;
      return interrupted("end-round");
    },
  });
  const orchestrator = new RecoveryOrchestrator({
    port: fake,
    onStateChange: (state) => states.push(state.value),
  });
  await orchestrator.dispatch({ type: "BOOT" });
  await orchestrator.dispatch({ type: "PRESENTATION_COMPLETED" });
  return scenarioResult(
    "end-round-committed-response-lost",
    "after authoritative end-round commit",
    fake,
    states,
    orchestrator.state.value,
    balance,
    activeRound,
    1,
    orchestrator.state.value === "idle" &&
      orchestrator.state.session.balance.amount === balance.amount,
    orchestrator.state.value === "idle",
  );
}

export async function generateRecoveryEvidence(): Promise<RecoveryEvidenceReport> {
  return {
    schemaVersion: 1,
    kind: "local-recovery-failure-injection",
    environment: "deterministic-local-simulation",
    notice:
      "Local evidence only; this does not represent Stake Engine staging or approval.",
    scenarios: [
      await playScenario(false),
      await playScenario(true),
      await checkpointScenario(),
      await endRoundScenario(),
    ],
  };
}
