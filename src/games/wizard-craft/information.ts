export interface WizardCraftPaytableRow {
  readonly symbol: string;
  readonly three: string;
  readonly four: string;
  readonly five: string;
}

export interface WizardCraftModeInformation {
  readonly id: "baseBattle" | "runeSpark" | "siegeSigns" | "openGrimoire";
  readonly name: string;
  readonly amount: string;
  readonly rtp: string | null;
  readonly maximumWin: string;
  readonly access: string;
}

export interface WizardCraftInformation {
  readonly locale: "en" | "sweeps_en";
  readonly social: boolean;
  readonly title: "WIZARD CRAFT";
  readonly introduction: readonly string[];
  readonly paytable: readonly WizardCraftPaytableRow[];
  readonly wildRules: readonly string[];
  readonly runeRules: readonly string[];
  readonly vsRules: readonly string[];
  readonly tiers: readonly {
    readonly name: string;
    readonly spins: number;
    readonly rule: string;
  }[];
  readonly modes: readonly WizardCraftModeInformation[];
  readonly controls: readonly {
    readonly name: string;
    readonly description: string;
  }[];
  readonly settlement: string;
  readonly disclaimer: string;
}

export interface WizardCraftInformationOptions {
  readonly social: boolean;
  readonly displayRtp?: boolean;
}

const paytable = Object.freeze([
  { symbol: "Crown", three: "0.10×", four: "0.50×", five: "2.00×" },
  { symbol: "Staff", three: "0.10×", four: "0.30×", five: "1.20×" },
  { symbol: "Grimoire", three: "0.10×", four: "0.20×", five: "0.80×" },
  { symbol: "Scroll", three: "0.10×", four: "0.20×", five: "0.50×" },
  { symbol: "Potion", three: "0.10×", four: "0.10×", five: "0.30×" },
  { symbol: "Crystal", three: "0.10×", four: "0.10×", five: "0.20×" },
  { symbol: "Ember", three: "0.10×", four: "0.10×", five: "0.20×" },
] as const);

const disclaimer = [
  "Malfunction voids all wins and plays.",
  "A consistent internet connection is required.",
  "In the event of a disconnection, reload the game to finish any uncompleted rounds.",
  "The expected return is calculated over many plays.",
  "The game display is not representative of any physical device and is for illustrative purposes only.",
  "Winnings are settled according to the amount received from the Remote Game Server and not from events within the web browser.",
  "TM and © 2026 Stake Engine.",
].join(" ");

function modeInformation(
  social: boolean,
  displayRtp: boolean,
): readonly WizardCraftModeInformation[] {
  const baseAmount = social ? "base play amount" : "base bet";
  const immediate = social
    ? "Immediately starts one server-selected feature tier"
    : "Feature purchase immediately starts one server-selected feature tier";
  const mode = (
    id: WizardCraftModeInformation["id"],
    name: string,
    cost: number,
    access: string,
  ): WizardCraftModeInformation => Object.freeze({
    id,
    name,
    amount: `${cost}× ${baseAmount}`,
    rtp: displayRtp ? "96.50%" : null,
    maximumWin: `25,000× ${baseAmount}`,
    access,
  });
  return Object.freeze([
    mode("baseBattle", "Base Battle", 1, "Standard rune frequency"),
    mode("runeSpark", "Rune Spark", 3, "Enhanced rune frequency; no rune is guaranteed"),
    mode("siegeSigns", "Siege Signs", 10, "One rune is guaranteed; the remaining result is server-selected"),
    mode("openGrimoire", "Open the Grimoire", 100, immediate),
  ]);
}

export function getWizardCraftInformation(
  options: WizardCraftInformationOptions,
): WizardCraftInformation {
  const social = options.social;
  const displayRtp = options.displayRtp ?? true;
  const baseAmount = social ? "base play amount" : "base bet";
  const result = social ? "play" : "round";
  return Object.freeze({
    locale: social ? "sweeps_en" : "en",
    social,
    title: "WIZARD CRAFT",
    introduction: Object.freeze([
      `WIZARD CRAFT uses five reels, four rows, and ways awards from the leftmost reel.`,
      `Three or more matching regular symbols on consecutive reels award the listed multiple of the ${baseAmount}.`,
      "Every play is independent. Dragon and Wizard animation presents the server-provided result and cannot change it.",
    ]),
    paytable,
    wildRules: Object.freeze([
      "Wizard Sigil and Dragon Sigil are wild.",
      "Wild symbols substitute for Crown, Staff, Grimoire, Scroll, Potion, Crystal, and Ember.",
      "Wild symbols do not substitute for Clash Rune.",
    ]),
    runeRules: Object.freeze([
      "Three Clash Runes award Tier I with 8 feature spins.",
      "Four Clash Runes award Tier II with 10 feature spins.",
      "Five Clash Runes award Tier III with 12 feature spins.",
      "During the feature, three, four, or five Clash Runes add 2, 3, or 4 spins respectively.",
      "Clash Rune has no separate ways award.",
    ]),
    vsRules: Object.freeze([
      "A VS multiplier reel may expand on any reel.",
      "The reel displays Dragon and Wizard candidates and applies the server-provided value.",
      "VS values can be 2×, 3×, 4×, 5×, or 10× in the base game; Tier II and Tier III can also show 15× or 25×; Tier III can also show 50×.",
      "Only VS reels used by a winning way contribute. Multiple contributing values add together before multiplying that way.",
      "Temporary VS reels clear after the spin. Sticky VS reels remain until the feature ends and never decrease when upgraded.",
      "Dragon advantage, Wizard advantage, and a balanced clash are presentation states; none changes the applied value.",
    ]),
    tiers: Object.freeze([
      Object.freeze({
        name: "Tier I · Ember Duel",
        spins: 8,
        rule: "VS multiplier reels are temporary. Sticky reels cannot appear.",
      }),
      Object.freeze({
        name: "Tier II · Arcane Siege",
        spins: 10,
        rule: "Sticky reels may appear, but none is guaranteed.",
      }),
      Object.freeze({
        name: "Tier III · Crownfire Clash",
        spins: 12,
        rule: "At least one sticky reel is guaranteed by the end of feature spin three; its reel is server-selected.",
      }),
    ]),
    modes: modeInformation(social, displayRtp),
    controls: Object.freeze([
      Object.freeze({
        name: "Play",
        description: `Starts one ${result} at the selected ${baseAmount} and mode.`,
      }),
      Object.freeze({
        name: social ? "Play amount" : "Base bet",
        description: "Selects an amount allowed by the game server.",
      }),
      Object.freeze({
        name: "Mode",
        description: "Selects Base Battle, Rune Spark, Siege Signs, or Open the Grimoire when permitted.",
      }),
      Object.freeze({
        name: social ? "Automatic play" : "Autoplay",
        description: "Requires confirmation before a sequence begins.",
      }),
      Object.freeze({
        name: "Fast play",
        description: "Shortens presentation timing without changing or hiding results.",
      }),
      Object.freeze({
        name: "Spacebar",
        description: "Starts a play when keyboard play is permitted and no dialog or input has focus.",
      }),
      Object.freeze({ name: "Sound", description: "Enables or mutes game audio." }),
      Object.freeze({
        name: "Information",
        description: "Opens rules, awards, modes, feature tiers, and controls.",
      }),
    ]),
    settlement: social
      ? "The Remote Game Server selects and settles every result. If a play is interrupted, reload to resume it before starting another play."
      : "The Remote Game Server selects and settles every result. If a round is interrupted, reload to resume it before placing another bet.",
    disclaimer,
  });
}
