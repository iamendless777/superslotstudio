import type {
  AuthenticateResult,
  EndRoundResult,
  EventResult,
  PlayRequest,
  PlayResult,
  RgsPort,
} from "../domain/rgs.js";

export type FakeOperation =
  | "authenticate"
  | "play"
  | "checkpoint"
  | "end-round";

export class FakeRgsPort<TState = unknown> implements RgsPort<TState> {
  readonly calls: Array<{
    readonly operation: FakeOperation;
    readonly input?: unknown;
  }> = [];

  constructor(
    private readonly handlers: {
      authenticate: () => Promise<AuthenticateResult<TState>>;
      play: (request: PlayRequest) => Promise<PlayResult<TState>>;
      checkpoint: (event: string) => Promise<EventResult>;
      endRound: () => Promise<EndRoundResult>;
    },
  ) {}

  authenticate(): Promise<AuthenticateResult<TState>> {
    this.calls.push({ operation: "authenticate" });
    return this.handlers.authenticate();
  }

  play(request: PlayRequest): Promise<PlayResult<TState>> {
    this.calls.push({ operation: "play", input: request });
    return this.handlers.play(request);
  }

  checkpoint(event: string): Promise<EventResult> {
    this.calls.push({ operation: "checkpoint", input: event });
    return this.handlers.checkpoint(event);
  }

  endRound(): Promise<EndRoundResult> {
    this.calls.push({ operation: "end-round" });
    return this.handlers.endRound();
  }
}
