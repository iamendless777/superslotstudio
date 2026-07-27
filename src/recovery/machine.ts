import type { RgsFailure } from "../domain/error.js";
import type {
  AuthenticateResult,
  Balance,
  BetConfig,
  JurisdictionFlags,
  PlayRequest,
  Round,
} from "../domain/rgs.js";
import { isValidPlayRequest } from "../domain/rgs.js";

export interface SessionSnapshot {
  readonly balance: Balance;
  readonly config: BetConfig;
  readonly jurisdiction: JurisdictionFlags;
}

export type RecoveryState<TState = unknown> =
  | { readonly value: "uninitialized" }
  | {
      readonly value: "idle";
      readonly session: SessionSnapshot;
      readonly lastFailure?: RgsFailure;
    }
  | {
      readonly value: "starting";
      readonly session: SessionSnapshot;
      readonly request: PlayRequest;
    }
  | {
      readonly value: "active";
      readonly session: SessionSnapshot;
      readonly round: Round<TState>;
      readonly resumed: boolean;
    }
  | {
      readonly value: "ending";
      readonly session: SessionSnapshot;
      readonly round: Round<TState>;
    }
  | {
      readonly value: "reconciling";
      readonly reason: "boot" | "play" | "end-round";
    }
  | { readonly value: "failed-closed"; readonly failure: RgsFailure };

export type RecoveryEvent<TState = unknown> =
  | { readonly type: "BOOT" }
  | {
      readonly type: "AUTHENTICATED";
      readonly result: AuthenticateResult<TState>;
    }
  | { readonly type: "AUTHENTICATION_FAILED"; readonly failure: RgsFailure }
  | { readonly type: "PLACE_BET"; readonly request: PlayRequest }
  | {
      readonly type: "PLAY_SUCCEEDED";
      readonly balance: Balance;
      readonly round: Round<TState>;
    }
  | { readonly type: "PLAY_REJECTED"; readonly failure: RgsFailure }
  | { readonly type: "PLAY_AMBIGUOUS" }
  | { readonly type: "PRESENTATION_COMPLETED" }
  | { readonly type: "CHECKPOINT"; readonly event: string }
  | { readonly type: "END_ROUND_SUCCEEDED"; readonly balance: Balance }
  | { readonly type: "END_ROUND_REJECTED"; readonly failure: RgsFailure }
  | { readonly type: "END_ROUND_AMBIGUOUS" }
  | { readonly type: "INVALID_RESPONSE"; readonly failure: RgsFailure };

export type RecoveryCommand =
  | { readonly type: "AUTHENTICATE" }
  | { readonly type: "PLAY"; readonly request: PlayRequest }
  | { readonly type: "CHECKPOINT"; readonly event: string }
  | { readonly type: "END_ROUND" };

export interface Transition<TState = unknown> {
  readonly state: RecoveryState<TState>;
  readonly commands: readonly RecoveryCommand[];
}

function snapshot<TState>(result: AuthenticateResult<TState>): SessionSnapshot {
  return {
    balance: result.balance,
    config: result.config,
    jurisdiction: result.jurisdiction,
  };
}

function isTerminalPlayRejection(failure: RgsFailure): boolean {
  return ["ERR_IS", "ERR_ATE", "ERR_GLE", "ERR_LOC"].includes(failure.code);
}

function reconcile<TState>(
  reason: "boot" | "play" | "end-round",
): Transition<TState> {
  return {
    state: { value: "reconciling", reason },
    commands: [{ type: "AUTHENTICATE" }],
  };
}

export function transition<TState>(
  state: RecoveryState<TState>,
  event: RecoveryEvent<TState>,
): Transition<TState> {
  if (event.type === "INVALID_RESPONSE") {
    return {
      state: { value: "failed-closed", failure: event.failure },
      commands: [],
    };
  }

  if (event.type === "BOOT" && state.value === "uninitialized") {
    return reconcile<TState>("boot");
  }

  if (event.type === "AUTHENTICATION_FAILED" && state.value === "reconciling") {
    return {
      state: { value: "failed-closed", failure: event.failure },
      commands: [],
    };
  }

  if (event.type === "AUTHENTICATED" && state.value === "reconciling") {
    const session = snapshot(event.result);
    if (event.result.round?.active === true) {
      return {
        state: {
          value: "active",
          session,
          round: event.result.round,
          resumed: true,
        },
        commands: [],
      };
    }
    return { state: { value: "idle", session }, commands: [] };
  }

  if (event.type === "PLACE_BET" && state.value === "idle") {
    if (!isValidPlayRequest(state.session.config, event.request)) {
      return {
        state: {
          value: "idle",
          session: state.session,
          lastFailure: {
            kind: "rejected",
            operation: "play",
            code: "ERR_VAL",
            message:
              "Bet must satisfy the authenticated min, max, and step constraints",
          },
        },
        commands: [],
      };
    }
    return {
      state: {
        value: "starting",
        session: state.session,
        request: event.request,
      },
      commands: [{ type: "PLAY", request: event.request }],
    };
  }

  if (event.type === "PLAY_SUCCEEDED" && state.value === "starting") {
    return {
      state: {
        value: "active",
        session: { ...state.session, balance: event.balance },
        round: event.round,
        resumed: false,
      },
      commands: [],
    };
  }

  if (event.type === "PLAY_REJECTED" && state.value === "starting") {
    if (isTerminalPlayRejection(event.failure)) {
      return {
        state: { value: "failed-closed", failure: event.failure },
        commands: [],
      };
    }
    return {
      state: {
        value: "idle",
        session: state.session,
        lastFailure: event.failure,
      },
      commands: [],
    };
  }

  if (event.type === "PLAY_AMBIGUOUS" && state.value === "starting") {
    return reconcile<TState>("play");
  }

  if (event.type === "CHECKPOINT" && state.value === "active") {
    return { state, commands: [{ type: "CHECKPOINT", event: event.event }] };
  }

  if (event.type === "PRESENTATION_COMPLETED" && state.value === "active") {
    if (!state.round.active) {
      return { state: { value: "idle", session: state.session }, commands: [] };
    }
    return {
      state: { value: "ending", session: state.session, round: state.round },
      commands: [{ type: "END_ROUND" }],
    };
  }

  if (event.type === "END_ROUND_SUCCEEDED" && state.value === "ending") {
    return {
      state: {
        value: "idle",
        session: { ...state.session, balance: event.balance },
      },
      commands: [],
    };
  }

  if (event.type === "END_ROUND_REJECTED" && state.value === "ending") {
    return {
      state: { value: "failed-closed", failure: event.failure },
      commands: [],
    };
  }

  if (event.type === "END_ROUND_AMBIGUOUS" && state.value === "ending") {
    return reconcile<TState>("end-round");
  }

  return { state, commands: [] };
}

export const initialRecoveryState: RecoveryState = { value: "uninitialized" };

export function createInitialRecoveryState<
  TState = unknown,
>(): RecoveryState<TState> {
  return { value: "uninitialized" };
}
