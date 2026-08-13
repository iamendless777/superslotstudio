import type {
  WizardCraftEvent,
  WizardCraftSide,
} from "./events.js";
import type { WizardCraftRgsEvent } from "./official.js";

export type WizardCraftPlaybackProfile =
  | "review"
  | "normal"
  | "fast"
  | "reducedMotion";

export type WizardCraftCueChannel =
  | "reels"
  | "dragon"
  | "wizard"
  | "clash"
  | "cabinet"
  | "ui";

export const WIZARD_CRAFT_AUDIO_CUE_IDS = Object.freeze([
  "reels.stop", "reels.anticipation",
  "duel.tier1", "duel.tier2", "duel.tier3",
  "duel.enter", "duel.retrigger", "duel.end",
  "ui.spin-counter",
  "dragon.inhale", "dragon.fire.launch",
  "wizard.charge", "wizard.bolt.launch",
  "clash.impact", "clash.balanced",
  "reel.temporary.claim", "reel.sticky.claim", "reel.sticky.upgrade",
  "attack.block", "reel.temporary.clear",
  "win.ways",
  "symbol.ember", "symbol.potion", "symbol.dragon-egg",
  "symbol.dragon-wild", "symbol.scroll", "symbol.grimoire",
  "symbol.staff", "symbol.wizard-wild", "symbol.crystal",
  "win.level", "win.total", "win.final", "win.max",
] as const);

export type WizardCraftAudioCueId =
  (typeof WIZARD_CRAFT_AUDIO_CUE_IDS)[number];

export interface WizardCraftPresentationBeat {
  readonly id: string;
  readonly channel: WizardCraftCueChannel;
  readonly startMs: number;
  readonly durationMs: number;
  readonly audio?: WizardCraftAudioCueId;
  readonly motion: "none" | "subtle" | "full";
}

export interface WizardCraftCuePlan {
  readonly eventIndex: number;
  readonly eventType: string;
  readonly durationMs: number;
  readonly beats: readonly WizardCraftPresentationBeat[];
}

export const WIZARD_CRAFT_PRESENTED_EVENT_TYPES = Object.freeze([
  "reveal",
  "winInfo",
  "setWin",
  "setTotalWin",
  "freeSpinTrigger",
  "freeSpinRetrigger",
  "enterBonus",
  "startDuel",
  "updateFreeSpin",
  "prepareAttack",
  "expandVsReel",
  "upgradeStickyReel",
  "blockAttack",
  "clearSpinReels",
  "freeSpinEnd",
  "wincap",
  "finalWin",
] as const);

function rawPayload(event: WizardCraftRgsEvent): Record<string, unknown> {
  const { index: _index, type: _type, ...payload } = event;
  return payload;
}

export function planWizardCraftRgsCue(
  event: WizardCraftRgsEvent,
  profile: WizardCraftPlaybackProfile = "normal",
): WizardCraftCuePlan {
  if ([
    "reveal", "freeSpinTrigger", "startDuel", "prepareAttack",
    "expandVsReel", "upgradeStickyReel", "blockAttack", "clearSpinReels",
    "winInfo", "setTotalWin", "wincap", "finalWin",
  ].includes(event.type)) {
    return planWizardCraftCue({
      schemaVersion: 1,
      index: event.index,
      type: event.type,
      payload: rawPayload(event),
    } as WizardCraftEvent, profile);
  }

  if (event.type === "freeSpinRetrigger") {
    const beats = [
      beat("duel.retrigger", "cabinet", 0, 820, profile, "duel.retrigger"),
      beat("ui.retrigger", "ui", 100, 720, profile),
    ];
    return {
      eventIndex: event.index,
      eventType: event.type,
      durationMs: Math.max(...beats.map((item) =>
        item.startMs + item.durationMs
      )),
      beats,
    };
  }

  if (event.type === "freeSpinEnd") {
    const beats = [
      beat("duel.end", "cabinet", 0, 900, profile, "duel.end"),
      beat("ui.feature-end", "ui", 120, 780, profile),
    ];
    return {
      eventIndex: event.index,
      eventType: event.type,
      durationMs: Math.max(...beats.map((item) =>
        item.startMs + item.durationMs
      )),
      beats,
    };
  }

  const definitions: Readonly<Record<
    string,
    {
      readonly id: string;
      readonly channel: WizardCraftCueChannel;
      readonly duration: number;
      readonly audio: WizardCraftAudioCueId;
    }
  >> = {
    enterBonus: {
      id: "duel.enter",
      channel: "cabinet",
      duration: 620,
      audio: "duel.enter",
    },
    updateFreeSpin: {
      id: "ui.spin-counter",
      channel: "ui",
      duration: 180,
      audio: "ui.spin-counter",
    },
    setWin: {
      id: "win.level",
      channel: "ui",
      duration: 420,
      audio: "win.level",
    },
  };
  const definition = definitions[event.type];
  if (definition === undefined) {
    throw new TypeError(`No WIZARD CRAFT cue for ${event.type}`);
  }
  const beats = [beat(
    definition.id,
    definition.channel,
    0,
    definition.duration,
    profile,
    definition.audio,
  )];
  return {
    eventIndex: event.index,
    eventType: event.type,
    durationMs: beats[0]!.durationMs,
    beats,
  };
}

const PROFILE_SCALE: Readonly<Record<WizardCraftPlaybackProfile, number>> = {
  review: 1.35,
  normal: 1,
  fast: 0.48,
  reducedMotion: 0.85,
};

const MINIMUM_DURATION: Readonly<Record<WizardCraftPlaybackProfile, number>> = {
  review: 240,
  normal: 180,
  fast: 90,
  reducedMotion: 150,
};

function opposing(side: WizardCraftSide): WizardCraftSide {
  return side === "dragon" ? "wizard" : "dragon";
}

function scaled(
  value: number,
  profile: WizardCraftPlaybackProfile,
): number {
  return Math.max(
    MINIMUM_DURATION[profile],
    Math.round(value * PROFILE_SCALE[profile]),
  );
}

function beat(
  id: string,
  channel: WizardCraftCueChannel,
  startMs: number,
  durationMs: number,
  profile: WizardCraftPlaybackProfile,
  audio?: WizardCraftAudioCueId,
): WizardCraftPresentationBeat {
  const scale = PROFILE_SCALE[profile];
  return {
    id,
    channel,
    startMs: Math.round(startMs * scale),
    durationMs: scaled(durationMs, profile),
    ...(audio === undefined ? {} : { audio }),
    motion: profile === "reducedMotion" ? "none" : profile === "fast" ? "subtle" : "full",
  };
}

function attackBeats(
  event: Extract<WizardCraftEvent, { readonly type: "expandVsReel" }>,
  profile: WizardCraftPlaybackProfile,
): readonly WizardCraftPresentationBeat[] {
  const { advantage, persistence } = event.payload;
  const primary = advantage === "balanced" ? "dragon" : advantage;
  const secondary = opposing(primary);
  const primaryAudio = primary === "dragon" ? "dragon.inhale" : "wizard.charge";
  const launchAudio = primary === "dragon" ? "dragon.fire.launch" : "wizard.bolt.launch";
  const claimAudio = persistence === "sticky"
    ? "reel.sticky.claim"
    : "reel.temporary.claim";

  return [
    beat(`${primary}.windup`, primary, 0, 340, profile, primaryAudio),
    beat(`${secondary}.brace`, secondary, 80, 300, profile),
    ...(advantage === "balanced"
      ? [beat(`${secondary}.counter`, secondary, 110, 330, profile,
        secondary === "dragon" ? "dragon.inhale" : "wizard.charge")]
      : []),
    beat(`${primary}.launch`, primary, 300, 260, profile, launchAudio),
    ...(advantage === "balanced"
      ? [
        beat("effects.dragon-fire-flight", "clash", 300, 400, profile),
        beat("effects.wizard-magic-flight", "clash", 300, 400, profile),
      ]
      : [beat(
        primary === "dragon"
          ? "effects.dragon-fire-flight"
          : "effects.wizard-magic-flight",
        "clash",
        300,
        400,
        profile,
      )]),
    beat("clash.multicolor-impact", "clash", 500, 360, profile,
      advantage === "balanced" ? "clash.balanced" : "clash.impact"),
    beat(`reel.${persistence}.claim`, "reels", 720, 430, profile, claimAudio),
    ...(advantage === "balanced"
      ? [
        beat("dragon.recoil", "dragon", 720, 430, profile),
        beat("wizard.recoil", "wizard", 720, 430, profile),
      ]
      : [
        beat(`${primary}.claim`, primary, 720, 430, profile),
        beat(`${secondary}.recoil`, secondary, 720, 430, profile),
      ]),
  ];
}

const SYMBOL_AUDIO = Object.freeze({
  ember: { cue: "symbol.ember", channel: "dragon" },
  potion: { cue: "symbol.potion", channel: "dragon" },
  crown: { cue: "symbol.dragon-egg", channel: "dragon" },
  dragonSigil: { cue: "symbol.dragon-wild", channel: "dragon" },
  scroll: { cue: "symbol.scroll", channel: "wizard" },
  grimoire: { cue: "symbol.grimoire", channel: "wizard" },
  staff: { cue: "symbol.staff", channel: "wizard" },
  wizardSigil: { cue: "symbol.wizard-wild", channel: "wizard" },
  crystal: { cue: "symbol.crystal", channel: "clash" },
} as const satisfies Readonly<Record<
  Exclude<
    Extract<WizardCraftEvent, { readonly type: "winInfo" }>["payload"]["wins"][number]["symbol"],
    "clashRune"
  >,
  { readonly cue: WizardCraftAudioCueId; readonly channel: WizardCraftCueChannel }
>>);

const OFFICIAL_SYMBOL_AUDIO_ALIASES = Object.freeze({
  EMBER: "ember",
  POTION: "potion",
  CROWN: "crown",
  DRAGON: "dragonSigil",
  SCROLL: "scroll",
  GRIMOIRE: "grimoire",
  STAFF: "staff",
  WIZARD: "wizardSigil",
  CRYSTAL: "crystal",
} as const);

function symbolAudioDefinition(symbol: string) {
  const normalized = symbol in OFFICIAL_SYMBOL_AUDIO_ALIASES
    ? OFFICIAL_SYMBOL_AUDIO_ALIASES[
      symbol as keyof typeof OFFICIAL_SYMBOL_AUDIO_ALIASES
    ]
    : symbol;
  return SYMBOL_AUDIO[normalized as keyof typeof SYMBOL_AUDIO];
}

function symbolWinAudioBeats(
  event: Extract<WizardCraftEvent, { readonly type: "winInfo" }>,
  profile: WizardCraftPlaybackProfile,
): readonly WizardCraftPresentationBeat[] {
  const selected = new Map<
    WizardCraftCueChannel,
    {
      readonly definition:
        (typeof SYMBOL_AUDIO)[keyof typeof SYMBOL_AUDIO];
      readonly win: number;
    }
  >();
  for (const win of event.payload.wins) {
    if (win.symbol === "clashRune") continue;
    const definition = symbolAudioDefinition(win.symbol);
    if (definition === undefined) continue;
    const current = selected.get(definition.channel);
    if (current === undefined || win.win > current.win) {
      selected.set(definition.channel, { definition, win: win.win });
    }
  }
  return Object.freeze([...selected.entries()].map(([channel, selection]) => {
    const { definition } = selection;
    return beat(
      `${definition.cue}.accent`,
      channel,
      70,
      260,
      profile,
      definition.cue,
    );
  }));
}

export function planWizardCraftCue(
  event: WizardCraftEvent,
  profile: WizardCraftPlaybackProfile = "normal",
): WizardCraftCuePlan {
  let beats: readonly WizardCraftPresentationBeat[];
  switch (event.type) {
    case "reveal": {
      const anticipating = event.payload.anticipation.some((value) => value > 0);
      beats = [
        beat(
          anticipating ? "reels.anticipate-and-stop" : "reels.stop",
          "reels",
          0,
          anticipating ? 800 : 440,
          profile,
          anticipating ? "reels.anticipation" : "reels.stop",
        ),
        ...(anticipating
          ? [
            beat(
              "cabinet.anticipation-glow",
              "cabinet",
              0,
              800,
              profile,
            ),
            // Silent character reactions heighten the tease without implying
            // an attack, claim, or guaranteed bonus outcome.
            beat("dragon.anticipation", "dragon", 120, 600, profile),
            beat("wizard.anticipation", "wizard", 120, 600, profile),
          ]
          : []),
      ];
      break;
    }
    case "freeSpinTrigger":
      beats = [
        beat(
          `duel.tier-${event.payload.tier}`,
          "cabinet",
          0,
          900,
          profile,
          `duel.tier${event.payload.tier}`,
        ),
        beat("ui.tier-entry", "ui", 120, 780, profile),
      ];
      break;
    case "startDuel":
      beats = [beat(
        "duel.handoff",
        "cabinet",
        0,
        180,
        profile,
        "duel.enter",
      )];
      break;
    case "prepareAttack": {
      const defender = opposing(event.payload.side);
      beats = [
        beat(
          `${event.payload.side}.${event.payload.intensity}-windup`,
          event.payload.side,
          0,
          event.payload.intensity === "heavy" ? 700 : 380,
          profile,
          event.payload.side === "dragon" ? "dragon.inhale" : "wizard.charge",
        ),
        beat(
          `${defender}.brace`,
          defender,
          80,
          event.payload.intensity === "heavy" ? 520 : 300,
          profile,
        ),
      ];
      break;
    }
    case "expandVsReel":
      beats = attackBeats(event, profile);
      break;
    case "upgradeStickyReel":
      beats = [
        beat("clash.multicolor-surge", "clash", 0, 380, profile, "clash.impact"),
        beat("reel.sticky-upgrade", "reels", 260, 620, profile, "reel.sticky.upgrade"),
      ];
      break;
    case "blockAttack": {
      const defender = opposing(event.payload.attacker);
      beats = [
        beat(`${event.payload.attacker}.attack-contained`, event.payload.attacker, 0, 360, profile),
        beat(
          event.payload.attacker === "dragon"
            ? "effects.dragon-fire-flight"
            : "effects.wizard-magic-flight",
          "clash",
          0,
          400,
          profile,
          event.payload.attacker === "dragon"
            ? "dragon.fire.launch"
            : "wizard.bolt.launch",
        ),
        beat(`${defender}.block`, defender, 120, 500, profile, "attack.block"),
        beat("clash.blocked-impact", "clash", 260, 360, profile),
      ];
      break;
    }
    case "clearSpinReels":
      beats = [beat("reels.temporary-release", "reels", 0, 300, profile, "reel.temporary.clear")];
      break;
    case "winInfo":
      beats = [
        beat("win.ways-highlight", "reels", 0, 620, profile, "win.ways"),
        ...(event.payload.wins.some((win) =>
          Array.isArray(win.contributingVsReels) && win.contributingVsReels.length >= 2
        )
          ? [beat("win.vs-breakdown", "ui", 80, 460, profile)]
          : []),
        ...symbolWinAudioBeats(event, profile),
      ];
      break;
    case "setTotalWin":
      beats = [beat("win.total-count", "ui", 0, 420, profile, "win.total")];
      break;
    case "wincap":
      beats = [beat("win.maximum-power", "cabinet", 0, 1_600, profile, "win.max")];
      break;
    case "finalWin":
      beats = event.payload.amount >= 10_000 &&
          event.payload.amount < 2_500_000
        ? [
          beat("win.strong-power", "cabinet", 0, 900, profile),
          beat("win.final-lock", "ui", 80, 820, profile, "win.final"),
        ]
        : [beat("win.final-lock", "ui", 0, 500, profile, "win.final")];
      break;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }

  return {
    eventIndex: event.index,
    eventType: event.type,
    durationMs: Math.max(...beats.map((item) => item.startMs + item.durationMs)),
    beats,
  };
}
