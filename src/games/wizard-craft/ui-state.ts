import type { RgsErrorCode, RgsFailure } from "../../domain/error.js";
import type { RgsAmount } from "../../domain/money.js";
import type { RecoveryState } from "../../recovery/machine.js";
import type { WizardCraftRgsEvent } from "./official.js";
import {
  getWizardCraftRuntimePolicy,
  type WizardCraftRuntimePolicy,
} from "./policy.js";

export type WizardCraftUiPhase =
  | "loading"
  | "ready"
  | "playing"
  | "recovering"
  | "settling"
  | "blocked";

export interface WizardCraftUiState {
  readonly phase: WizardCraftUiPhase;
  readonly headline: string;
  readonly message: string;
  readonly canPlay: boolean;
  readonly canChangeAmount: boolean;
  readonly canChangeMode: boolean;
  readonly canOpenInformation: boolean;
  readonly requiresReload: boolean;
  readonly resumedRound: boolean;
  readonly balance: {
    readonly amount: RgsAmount;
    readonly unit: string;
  } | null;
  readonly policy: WizardCraftRuntimePolicy | null;
  readonly failureCode: RgsErrorCode | null;
}

const failureCopy: Readonly<Record<
  RgsErrorCode,
  { readonly headline: string; readonly message: string }
>> = {
  ERR_VAL: {
    headline: "Selection unavailable",
    message: "Choose an amount and mode allowed by the game server.",
  },
  ERR_IPB: {
    headline: "Insufficient balance",
    message: "Choose a smaller play amount or update your balance before trying again.",
  },
  ERR_IS: {
    headline: "Session ended",
    message: "Reload the game to start a valid session.",
  },
  ERR_ATE: {
    headline: "Session unavailable",
    message: "The game could not verify this session. Reload before continuing.",
  },
  ERR_GLE: {
    headline: "Play limit reached",
    message: "A platform limit prevents another play.",
  },
  ERR_LOC: {
    headline: "Game unavailable",
    message: "WIZARD CRAFT is not available in this location.",
  },
  ERR_GEN: {
    headline: "Service unavailable",
    message: "The game server could not complete the request. Reload before continuing.",
  },
  ERR_MAINTENANCE: {
    headline: "Maintenance",
    message: "WIZARD CRAFT is temporarily unavailable while service work is completed.",
  },
  UNKNOWN: {
    headline: "Result verification required",
    message: "The connection was interrupted. Reload to recover the authoritative result.",
  },
};

function blockedFailure(
  failure: RgsFailure,
): Pick<
  WizardCraftUiState,
  "headline" | "message" | "failureCode"
> {
  if (failure.kind === "invalid-response") {
    return {
      headline: "Result could not be verified",
      message: "Presentation is stopped. Reload to recover a valid server result.",
      failureCode: failure.code,
    };
  }
  const copy = failureCopy[failure.code];
  return { ...copy, failureCode: failure.code };
}

function sessionParts(
  state: RecoveryState<readonly WizardCraftRgsEvent[]>,
): {
  readonly balance: WizardCraftUiState["balance"];
  readonly policy: WizardCraftRuntimePolicy | null;
} {
  if (!("session" in state)) return { balance: null, policy: null };
  const policy = getWizardCraftRuntimePolicy(state.session.jurisdiction);
  return {
    balance: {
      amount: state.session.balance.amount,
      unit: state.session.balance.currency,
    },
    policy,
  };
}

export function getWizardCraftUiState(
  state: RecoveryState<readonly WizardCraftRgsEvent[]>,
): WizardCraftUiState {
  const parts = sessionParts(state);
  const base = {
    canOpenInformation: true,
    balance: parts.balance,
    policy: parts.policy,
    failureCode: null,
  } as const;

  if (state.value === "uninitialized") {
    return {
      ...base,
      phase: "loading",
      headline: "Preparing WIZARD CRAFT",
      message: "Waiting to connect to the game server.",
      canPlay: false,
      canChangeAmount: false,
      canChangeMode: false,
      requiresReload: false,
      resumedRound: false,
    };
  }
  if (state.value === "reconciling") {
    const messages = {
      boot: "Connecting and checking for an unfinished result.",
      play: "Checking whether the interrupted play was accepted.",
      "end-round": "Confirming the completed result with the game server.",
    };
    return {
      ...base,
      phase: "recovering",
      headline: "Recovering safely",
      message: messages[state.reason],
      canPlay: false,
      canChangeAmount: false,
      canChangeMode: false,
      requiresReload: false,
      resumedRound: false,
    };
  }
  if (state.value === "failed-closed") {
    return {
      ...base,
      ...blockedFailure(state.failure),
      phase: "blocked",
      canPlay: false,
      canChangeAmount: false,
      canChangeMode: false,
      requiresReload: true,
      resumedRound: false,
    };
  }
  if (state.value === "idle") {
    const warning = state.lastFailure === undefined
      ? null
      : blockedFailure(state.lastFailure);
    return {
      ...base,
      ...(warning ?? {
        headline: "Choose your battle",
        message: "Select a play amount and mode when ready.",
        failureCode: null,
      }),
      phase: "ready",
      canPlay: true,
      canChangeAmount: true,
      canChangeMode: true,
      requiresReload: false,
      resumedRound: false,
    };
  }
  if (state.value === "starting") {
    return {
      ...base,
      phase: "playing",
      headline: "Calling the clash",
      message: "Waiting for the authoritative battle result.",
      canPlay: false,
      canChangeAmount: false,
      canChangeMode: false,
      requiresReload: false,
      resumedRound: false,
    };
  }
  if (state.value === "active") {
    return {
      ...base,
      phase: "playing",
      headline: state.resumed ? "Resuming the battle" : "Battle in progress",
      message: state.resumed
        ? "Continuing the validated result from its saved event."
        : "Presenting the validated server result.",
      canPlay: false,
      canChangeAmount: false,
      canChangeMode: false,
      requiresReload: false,
      resumedRound: state.resumed,
    };
  }
  return {
    ...base,
    phase: "settling",
    headline: "Confirming the result",
    message: "The presentation is complete and settlement is being confirmed.",
    canPlay: false,
    canChangeAmount: false,
    canChangeMode: false,
    requiresReload: false,
    resumedRound: false,
  };
}
