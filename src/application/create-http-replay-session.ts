import {
  HttpReplayPort,
  type HttpReplayPortOptions,
} from "../adapters/http/http-replay-port.js";
import {
  parseReplayLaunchConfiguration,
  type ParseReplayLaunchOptions,
} from "../replay/replay.js";
import { ReplaySession } from "./replay-session.js";

export interface HttpReplaySessionOptions<TState>
  extends ParseReplayLaunchOptions,
    Pick<
      HttpReplayPortOptions<TState>,
      "parseState" | "fetch" | "timeoutMs" | "validateResult"
    > {}

/** Builds a lazy, read-only public replay session with no wallet/session port. */
export function createHttpReplaySession<TState>(
  launchUrl: string | URL,
  options: HttpReplaySessionOptions<TState>,
): ReplaySession<TState> {
  const launch = parseReplayLaunchConfiguration(launchUrl, {
    ...(options.allowInsecureHttp === undefined
      ? {}
      : { allowInsecureHttp: options.allowInsecureHttp }),
    ...(options.allowedRgsOrigins === undefined
      ? {}
      : { allowedRgsOrigins: options.allowedRgsOrigins }),
  });
  return new ReplaySession(
    new HttpReplayPort({
      launch,
      parseState: options.parseState,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
      ...(options.validateResult === undefined
        ? {}
        : { validateResult: options.validateResult }),
    }),
  );
}
