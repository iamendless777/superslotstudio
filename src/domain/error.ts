export type RgsErrorCode =
  | "ERR_VAL"
  | "ERR_IPB"
  | "ERR_IS"
  | "ERR_ATE"
  | "ERR_GLE"
  | "ERR_LOC"
  | "ERR_GEN"
  | "ERR_MAINTENANCE"
  | "UNKNOWN";

export interface RgsFailure {
  readonly kind: "rejected" | "ambiguous" | "invalid-response";
  readonly operation: "authenticate" | "play" | "checkpoint" | "end-round" | "balance";
  readonly code: RgsErrorCode;
  readonly message: string;
}

export class RgsPortError extends Error {
  readonly failure: RgsFailure;

  constructor(failure: RgsFailure) {
    super(failure.message);
    this.name = "RgsPortError";
    this.failure = failure;
  }
}

export function rejectedRgsFailure(
  operation: RgsFailure["operation"],
  code: RgsErrorCode,
  message: string,
): RgsFailure {
  return { kind: "rejected", operation, code, message };
}

export function ambiguousRgsFailure(
  operation: RgsFailure["operation"],
  message = "RGS operation outcome is unknown",
): RgsFailure {
  return { kind: "ambiguous", operation, code: "UNKNOWN", message };
}
