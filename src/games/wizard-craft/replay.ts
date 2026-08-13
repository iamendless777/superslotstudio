import {
  createHttpReplaySession,
  type HttpReplaySessionOptions,
} from "../../application/create-http-replay-session.js";
import { ReplaySession } from "../../application/replay-session.js";
import {
  InvalidReplayConfigurationError,
  parseReplayLaunchConfiguration,
  type ReplayResult,
} from "../../replay/replay.js";
import {
  presentWizardCraftEvents,
  type WizardCraftEventPresenter,
} from "./controller.js";
import {
  WIZARD_CRAFT_MODES,
  type WizardCraftMode,
} from "./events.js";
import {
  parseWizardCraftRgsState,
  type WizardCraftRgsEvent,
} from "./official.js";

export const WIZARD_CRAFT_GAME_ID = "wizard_craft";

const MODE_COSTS: Readonly<Record<WizardCraftMode, number>> = {
  baseBattle: 1,
  runeSpark: 3,
  siegeSigns: 10,
  openGrimoire: 100,
};
const modeSet = new Set<string>(WIZARD_CRAFT_MODES);

function replayStateParser(mode: WizardCraftMode) {
  return (value: unknown): readonly WizardCraftRgsEvent[] => {
    const state = parseWizardCraftRgsState(value);
    const revealModes = new Set(
      state.filter((event) => event.type === "reveal").map((event) => event.mode),
    );
    if (revealModes.size !== 1 || !revealModes.has(mode)) {
      throw new TypeError("replay mode must match every reveal mode");
    }
    return state;
  };
}

export function createWizardCraftHttpReplaySession(
  launchUrl: string | URL,
  options: Omit<
    HttpReplaySessionOptions<readonly WizardCraftRgsEvent[]>,
    "parseState" | "validateResult"
  > = {},
): ReplaySession<readonly WizardCraftRgsEvent[]> {
  const launch = parseReplayLaunchConfiguration(launchUrl, options);
  if (launch.game !== WIZARD_CRAFT_GAME_ID) {
    throw new InvalidReplayConfigurationError("game", WIZARD_CRAFT_GAME_ID);
  }
  if (!modeSet.has(launch.mode)) {
    throw new InvalidReplayConfigurationError("mode", "WIZARD CRAFT paid mode");
  }
  const mode = launch.mode as WizardCraftMode;
  return createHttpReplaySession(launchUrl, {
    ...options,
    parseState: replayStateParser(mode),
    validateResult: (result) => {
      if (result.costMultiplier !== MODE_COSTS[mode]) {
        throw new TypeError(`replay cost must equal ${MODE_COSTS[mode]}×`);
      }
    },
  });
}

export class WizardCraftReplayController {
  readonly #session: ReplaySession<readonly WizardCraftRgsEvent[]>;
  #running = false;

  constructor(session: ReplaySession<readonly WizardCraftRgsEvent[]>) {
    this.#session = session;
  }

  async present(presenter: WizardCraftEventPresenter): Promise<
    ReplayResult<readonly WizardCraftRgsEvent[]>
  > {
    if (this.#running) throw new Error("WIZARD CRAFT replay is already running");
    const replay = this.#session.play();
    this.#running = true;
    try {
      await presentWizardCraftEvents(replay.state, 0, presenter);
      this.#session.complete();
      return replay;
    } finally {
      this.#running = false;
    }
  }
}
