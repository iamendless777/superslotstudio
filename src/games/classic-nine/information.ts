export const CLASSIC_NINE_GAME_VERSION = "1.0.0";

export interface ClassicNinePaytableRow {
  readonly symbol: string;
  readonly award: string;
}

export interface ClassicNineModeInformation {
  readonly name: string;
  readonly amount: string;
  readonly rtp: string | null;
  readonly maximumWin: string;
  readonly access: string;
}

export interface ClassicNineInformation {
  readonly locale: "en" | "sweeps_en";
  readonly social: boolean;
  readonly title: string;
  readonly introduction: readonly string[];
  readonly paytableHeading: string;
  readonly paytable: readonly ClassicNinePaytableRow[];
  readonly featureHeading: string;
  readonly featureRules: readonly string[];
  readonly modesHeading: string;
  readonly modes: readonly ClassicNineModeInformation[];
  readonly controlsHeading: string;
  readonly controls: readonly {
    readonly name: string;
    readonly description: string;
  }[];
  readonly settlementHeading: string;
  readonly settlement: string;
  readonly disclaimerHeading: string;
  readonly disclaimer: string;
}

export interface ClassicNineInformationOptions {
  readonly social: boolean;
  readonly displayRtp?: boolean;
}

const paytable: readonly ClassicNinePaytableRow[] = Object.freeze([
  { symbol: "Pulse", award: "0.5×" },
  { symbol: "Prism", award: "0.8×" },
  { symbol: "Orbit", award: "1.2×" },
  { symbol: "Beacon", award: "2.0×" },
  { symbol: "Nova", award: "4.0×" },
  { symbol: "Crown", award: "8.0×" },
  { symbol: "Core", award: "12.0×" },
  { symbol: "Portal", award: "Feature trigger only" },
]);

const featureRules = Object.freeze([
  "Three or more Portals in the base game award nine free scans.",
  "Three or more Portals during Deep Signal add three free scans.",
  "The center position is a Core wild on every free scan.",
  "The amplifier starts at 1× and increases after a winning free scan.",
  "The amplifier can take every whole value from 1× through 9×.",
  "The current amplifier multiplies every line award from that scan.",
  "Deep Signal ends when no free scans remain or the 10,000× cap is reached.",
]);

const disclaimer = [
  "Malfunction voids all wins and plays.",
  "A consistent internet connection is required.",
  "In the event of a disconnection, reload the game to finish any uncompleted rounds.",
  "The expected return is calculated over many plays.",
  "The game display is not representative of any physical device and is for illustrative purposes only.",
  "Winnings are settled according to the amount received from the Remote Game Server and not from events within the web browser.",
  "TM and © 2026 Stake Engine.",
].join(" ");

function modes(
  social: boolean,
  displayRtp: boolean,
): readonly ClassicNineModeInformation[] {
  const amount = social ? "base play amount" : "base bet";
  return Object.freeze([
    {
      name: "Base",
      amount: `1× ${amount}`,
      rtp: displayRtp ? "96.50%" : null,
      maximumWin: `10,000× ${amount}`,
      access: "Standard play",
    },
    {
      name: "Deep Signal",
      amount: `100× ${amount}`,
      rtp: displayRtp ? "96.50%" : null,
      maximumWin: `10,000× ${amount}`,
      access: social
        ? "Feature starts immediately"
        : "Feature purchase starts immediately",
    },
  ]);
}

export function getClassicNineInformation(
  options: ClassicNineInformationOptions,
): ClassicNineInformation {
  const displayRtp = options.displayRtp ?? true;
  const social = options.social;
  const amount = social ? "play amount" : "base bet";
  return Object.freeze({
    locale: social ? "sweeps_en" : "en",
    social,
    title: "Classic Nine: Signal Nine",
    introduction: Object.freeze([
      `Select a ${amount}, choose a mode, and press Play.`,
      "The three horizontal rows and two corner-to-corner diagonals are the five active lines.",
      "Three matching regular symbols on an active line award the paytable amount. Core substitutes for regular symbols, but not Portal.",
      "Three or more Portals anywhere in the base grid trigger Deep Signal. Portal has no separate symbol award.",
      social
        ? "All plays are independent. Feature state ends with the current play."
        : "All bets are independent. Feature state ends with the current round.",
    ]),
    paytableHeading: "Paytable",
    paytable,
    featureHeading: "Deep Signal",
    featureRules,
    modesHeading: "Modes",
    modes: modes(social, displayRtp),
    controlsHeading: "Controls",
    controls: Object.freeze([
      {
        name: "Play",
        description: social
          ? "Starts one play at the selected play amount and mode."
          : "Starts one play at the selected base bet and mode.",
      },
      {
        name: social ? "Play amount" : "Base bet",
        description: "Chooses an amount allowed by the game server.",
      },
      {
        name: "Mode",
        description: "Switches between Base and Deep Signal when permitted.",
      },
      {
        name: social ? "Automatic play" : "Autoplay",
        description: "Requires confirmation before a sequence begins.",
      },
      {
        name: "Turbo / Super Turbo",
        description: "Changes presentation speed when permitted; results do not change.",
      },
      {
        name: "Spacebar",
        description: "Starts a play when keyboard play is permitted and no dialog or input has focus.",
      },
      { name: "Sound", description: "Enables or mutes game audio." },
      {
        name: "Fullscreen",
        description: "Enters or leaves fullscreen when permitted.",
      },
      {
        name: "Information",
        description: "Opens these rules, awards, mode amounts, and controls.",
      },
    ]),
    settlementHeading: "Settlement and disconnection",
    settlement: social
      ? "The Remote Game Server selects and settles every result. If a play is interrupted, reload to resume the authoritative result before starting another play."
      : "The Remote Game Server selects and settles every result. If a round is interrupted, reload to resume the authoritative round before placing another bet.",
    disclaimerHeading: "Disclaimer",
    disclaimer,
  });
}
