import {
  HttpRgsPort,
  type HttpRgsPortOptions,
} from "../adapters/http/http-rgs-port.js";
import {
  parseLaunchConfiguration,
  type ParseLaunchOptions,
} from "../adapters/http/launch.js";
import { GameSession, type GameSessionOptions } from "./game-session.js";

export interface HttpGameSessionOptions<TState = unknown>
  extends ParseLaunchOptions,
    Pick<
      HttpRgsPortOptions<TState>,
      "fetch" | "timeoutMs" | "parseState" | "validateRound"
    >,
    Omit<GameSessionOptions<TState>, "port"> {}

/**
 * Composes secure launch parsing, the HTTP port, and the UI-free session.
 * Construction is side-effect free; the first request occurs when start is called.
 */
export function createHttpGameSession<TState = unknown>(
  launchUrl: string | URL,
  options: HttpGameSessionOptions<TState> = {},
): GameSession<TState> {
  const launch = parseLaunchConfiguration(launchUrl, {
    ...(options.protocol === undefined ? {} : { protocol: options.protocol }),
    ...(options.allowInsecureHttp === undefined
      ? {}
      : { allowInsecureHttp: options.allowInsecureHttp }),
    ...(options.allowedRgsHosts === undefined
      ? {}
      : { allowedRgsHosts: options.allowedRgsHosts }),
  });
  const port = new HttpRgsPort<TState>({
    launch,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
    ...(options.parseState === undefined
      ? {}
      : { parseState: options.parseState }),
    ...(options.validateRound === undefined
      ? {}
      : { validateRound: options.validateRound }),
  });
  return new GameSession<TState>({
    port,
    ...(options.onCheckpointFailure === undefined
      ? {}
      : { onCheckpointFailure: options.onCheckpointFailure }),
    ...(options.classifyUnknownFailure === undefined
      ? {}
      : { classifyUnknownFailure: options.classifyUnknownFailure }),
    ...(options.onObserverError === undefined
      ? {}
      : { onObserverError: options.onObserverError }),
  });
}
