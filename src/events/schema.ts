export const CURRENT_GAME_EVENT_SCHEMA_VERSION = 1 as const;

export type PayloadValidator<T> = (value: unknown, path: string) => T;
export type PayloadValidators = Readonly<
  Record<string, PayloadValidator<unknown>>
>;

type ValidatorOutput<TValidator> =
  TValidator extends PayloadValidator<infer T> ? T : never;

export type GameEventFor<
  TValidators extends PayloadValidators,
  TType extends keyof TValidators = keyof TValidators,
> = TType extends keyof TValidators
  ? {
      readonly schemaVersion: typeof CURRENT_GAME_EVENT_SCHEMA_VERSION;
      readonly index: number;
      readonly type: TType;
      readonly payload: ValidatorOutput<TValidators[TType]>;
    }
  : never;

export class InvalidGameEventError extends TypeError {
  readonly path: string;

  constructor(path: string, expectation: string) {
    super(`Invalid game event at ${path}: expected ${expectation}`);
    this.name = "InvalidGameEventError";
    this.path = path;
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidGameEventError(path, "object");
  }
  return value as Record<string, unknown>;
}

export function createGameEventParser<TValidators extends PayloadValidators>(
  validators: TValidators,
): (value: unknown, path?: string) => GameEventFor<TValidators> {
  return (value: unknown, path = "event") => {
    const input = record(value, path);
    if (input.schemaVersion !== CURRENT_GAME_EVENT_SCHEMA_VERSION) {
      throw new InvalidGameEventError(
        `${path}.schemaVersion`,
        `supported version ${CURRENT_GAME_EVENT_SCHEMA_VERSION}`,
      );
    }
    if (!Number.isSafeInteger(input.index) || (input.index as number) < 0) {
      throw new InvalidGameEventError(
        `${path}.index`,
        "non-negative safe integer",
      );
    }
    if (typeof input.type !== "string" || !(input.type in validators)) {
      throw new InvalidGameEventError(`${path}.type`, "registered event type");
    }

    const type = input.type as keyof TValidators;
    const validator = validators[type];
    if (validator === undefined) {
      throw new InvalidGameEventError(`${path}.type`, "registered event type");
    }
    return {
      schemaVersion: CURRENT_GAME_EVENT_SCHEMA_VERSION,
      index: input.index as number,
      type,
      payload: validator(input.payload, `${path}.payload`),
    } as GameEventFor<TValidators>;
  };
}

export interface ResumePlan<TEvent> {
  readonly completed: readonly TEvent[];
  readonly remaining: readonly TEvent[];
  readonly nextIndex: number;
}

/**
 * Plans presentation resumption using a normalized next-event index. Adapters own
 * translation from any upstream checkpoint convention into this local convention.
 */
export function planEventResume<TEvent extends { readonly index: number }>(
  events: readonly TEvent[],
  checkpoint: string | null,
): ResumePlan<TEvent> {
  const ordered = [...events].sort((left, right) => left.index - right.index);
  const indexes = new Set<number>();
  for (const [position, event] of ordered.entries()) {
    if (indexes.has(event.index)) {
      throw new InvalidGameEventError(
        "events",
        `unique indexes; duplicate ${event.index}`,
      );
    }
    if (event.index !== position) {
      throw new InvalidGameEventError(
        "events",
        `contiguous indexes starting at 0`,
      );
    }
    indexes.add(event.index);
  }

  if (checkpoint !== null && !/^(0|[1-9]\d*)$/.test(checkpoint)) {
    throw new InvalidGameEventError(
      "checkpoint",
      "canonical non-negative integer string or null",
    );
  }
  const nextIndex = checkpoint === null ? 0 : Number(checkpoint);
  if (!Number.isSafeInteger(nextIndex) || nextIndex < 0) {
    throw new InvalidGameEventError(
      "checkpoint",
      "non-negative safe integer string or null",
    );
  }
  if (nextIndex > ordered.length) {
    throw new InvalidGameEventError(
      "checkpoint",
      `next index no greater than ${ordered.length}`,
    );
  }
  return {
    completed: ordered.filter((event) => event.index < nextIndex),
    remaining: ordered.filter((event) => event.index >= nextIndex),
    nextIndex,
  };
}
