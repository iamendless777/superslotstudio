import {
  createHttpGameSession,
  type HttpGameSessionOptions,
} from "../../application/create-http-game-session.js";
import {
  type GameSession,
  type GameSessionListener,
} from "../../application/game-session.js";
import type { PlayRequest, Round } from "../../domain/rgs.js";
import type { RecoveryState } from "../../recovery/machine.js";
import { WIZARD_CRAFT_MODES, type WizardCraftMode } from "./events.js";
import {
  parseWizardCraftRgsState,
  type WizardCraftRgsEvent,
} from "./official.js";
import {
  getWizardCraftRuntimePolicy,
  isWizardCraftModeAvailable,
  type WizardCraftRuntimePolicy,
} from "./policy.js";

const modeSet = new Set<string>(WIZARD_CRAFT_MODES);

function validateWizardCraftRound(
  round: Round<readonly WizardCraftRgsEvent[]>,
): void {
  if (!modeSet.has(round.mode)) {
    throw new TypeError(`unsupported paid mode ${round.mode}`);
  }
  const revealModes = new Set(
    round.state
      .filter((event) => event.type === "reveal")
      .map((event) => event.mode),
  );
  if (revealModes.size !== 1 || !revealModes.has(round.mode)) {
    throw new TypeError("round mode must match every reveal mode");
  }
}

export class WizardCraftGameSession {
  readonly #session: GameSession<readonly WizardCraftRgsEvent[]>;

  constructor(session: GameSession<readonly WizardCraftRgsEvent[]>) {
    this.#session = session;
  }

  get state(): RecoveryState<readonly WizardCraftRgsEvent[]> {
    return this.#session.state;
  }

  get policy(): WizardCraftRuntimePolicy | null {
    const state = this.state;
    return "session" in state
      ? getWizardCraftRuntimePolicy(state.session.jurisdiction)
      : null;
  }

  start(): Promise<void> {
    return this.#session.start();
  }

  placeBet(request: PlayRequest & { readonly mode: WizardCraftMode }): Promise<void> {
    if (!modeSet.has(request.mode)) {
      return Promise.reject(new RangeError(`Unsupported WIZARD CRAFT mode ${request.mode}`));
    }
    const policy = this.policy;
    if (policy !== null && !isWizardCraftModeAvailable(request.mode, policy)) {
      return Promise.reject(new RangeError(`${request.mode} is disabled by jurisdiction`));
    }
    return this.#session.placeBet(request);
  }

  checkpoint(event: string): Promise<void> {
    return this.#session.checkpoint(event);
  }

  completePresentation(): Promise<void> {
    return this.#session.completePresentation();
  }

  subscribe(
    listener: GameSessionListener<readonly WizardCraftRgsEvent[]>,
  ): () => void {
    return this.#session.subscribe(listener);
  }

  dispose(): void {
    this.#session.dispose();
  }
}

export function createWizardCraftHttpGameSession(
  launchUrl: string | URL,
  options: Omit<
    HttpGameSessionOptions<readonly WizardCraftRgsEvent[]>,
    "parseState" | "validateRound"
  > = {},
): WizardCraftGameSession {
  const session = createHttpGameSession<readonly WizardCraftRgsEvent[]>(launchUrl, {
    ...options,
    parseState: parseWizardCraftRgsState,
    validateRound: validateWizardCraftRound,
  });
  return new WizardCraftGameSession(session);
}
