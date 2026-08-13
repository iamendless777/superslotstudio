export type WizardCraftAssetLayer =
  | "environment"
  | "cabinet"
  | "dragonRear"
  | "reels"
  | "dragon"
  | "wizard"
  | "effects"
  | "ui";

export interface WizardCraftAssetSlot {
  readonly id: string;
  readonly layer: WizardCraftAssetLayer;
  readonly requiredForVerticalSlice: boolean;
  readonly reducedMotionReplacement?: string;
}

export const WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS = Object.freeze({
  1: Object.freeze([
    "effects.tier.1.frame.00", "effects.tier.1.frame.01",
    "effects.tier.1.frame.02", "effects.tier.1.frame.03",
    "effects.tier.1.frame.04", "effects.tier.1.frame.05",
    "effects.tier.1.frame.06", "effects.tier.1.frame.07",
  ]),
  2: Object.freeze([
    "effects.tier.2.frame.00", "effects.tier.2.frame.01",
    "effects.tier.2.frame.02", "effects.tier.2.frame.03",
    "effects.tier.2.frame.04", "effects.tier.2.frame.05",
    "effects.tier.2.frame.06", "effects.tier.2.frame.07",
  ]),
  3: Object.freeze([
    "effects.tier.3.frame.00", "effects.tier.3.frame.01",
    "effects.tier.3.frame.02", "effects.tier.3.frame.03",
    "effects.tier.3.frame.04", "effects.tier.3.frame.05",
    "effects.tier.3.frame.06", "effects.tier.3.frame.07",
  ]),
} as const);

const TIER_REVEAL_ASSET_SLOTS = Object.values(
  WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS,
).flat().map((id) => ({
  id,
  layer: "effects" as const,
  requiredForVerticalSlice: true,
}));

export const WIZARD_CRAFT_ASSET_SLOTS = [
  { id: "environment.sky", layer: "environment", requiredForVerticalSlice: true },
  { id: "environment.castle", layer: "environment", requiredForVerticalSlice: true },
  { id: "environment.base", layer: "environment", requiredForVerticalSlice: true },
  {
    id: "environment.fog.low",
    layer: "environment",
    requiredForVerticalSlice: true,
    reducedMotionReplacement: "environment.fog.low.static",
  },
  {
    id: "environment.fog.low.static",
    layer: "environment",
    requiredForVerticalSlice: true,
  },
  { id: "cabinet.title", layer: "cabinet", requiredForVerticalSlice: true },
  { id: "cabinet.lintel", layer: "cabinet", requiredForVerticalSlice: true },
  { id: "cabinet.pillar.dragon", layer: "cabinet", requiredForVerticalSlice: true },
  // The rear tail passes behind the solid rune tower, then re-emerges below
  // the foreground Wizard staircase, matching the approved depth path.
  { id: "dragon.rear.tail", layer: "dragonRear", requiredForVerticalSlice: true },
  { id: "cabinet.pillar.wizard", layer: "cabinet", requiredForVerticalSlice: true },
  { id: "cabinet.staircase.wizard", layer: "cabinet", requiredForVerticalSlice: true },
  {
    id: "cabinet.pillar.dragon.runes",
    layer: "cabinet",
    requiredForVerticalSlice: true,
  },
  {
    id: "cabinet.pillar.wizard.runes",
    layer: "cabinet",
    requiredForVerticalSlice: true,
  },
  { id: "cabinet.sill", layer: "cabinet", requiredForVerticalSlice: true },
  { id: "cabinet.crest.base", layer: "cabinet", requiredForVerticalSlice: true },
  { id: "cabinet.crest.clash", layer: "cabinet", requiredForVerticalSlice: true },
  { id: "reels.backing", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.mask.1", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.mask.2", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.mask.3", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.mask.4", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.mask.5", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.vs.expand", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.vs.frame.dragon", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.vs.frame.wizard", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.vs.frame.balanced", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.vs.temporary", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.vs.sticky", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.vs.upgrade", layer: "reels", requiredForVerticalSlice: true },
  { id: "reels.vs.release", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.ember.idle", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.scroll.idle", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.potion.idle", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.crystal.idle", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.grimoire.idle", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.staff.idle", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.dragon-egg.idle", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.duel-coin.idle", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.dragon-wild.idle", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.wizard-wild.idle", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.dragon-wild.eyes", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.dragon-wild.inner-glow", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.dragon-wild.aura", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.dragon-wild.particles", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.wizard-wild.eyes", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.wizard-wild.inner-glow", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.wizard-wild.aura", layer: "reels", requiredForVerticalSlice: true },
  { id: "symbol.wizard-wild.particles", layer: "reels", requiredForVerticalSlice: true },
  { id: "dragon.front.head", layer: "dragon", requiredForVerticalSlice: true },
  { id: "dragon.front.jaw", layer: "dragon", requiredForVerticalSlice: true },
  { id: "dragon.front.jaw.attack", layer: "dragon", requiredForVerticalSlice: true },
  { id: "dragon.front.eye", layer: "dragon", requiredForVerticalSlice: true },
  { id: "dragon.front.eye.anticipation", layer: "dragon", requiredForVerticalSlice: true },
  { id: "dragon.front.eye.attack", layer: "dragon", requiredForVerticalSlice: true },
  { id: "dragon.front.coil", layer: "dragon", requiredForVerticalSlice: true },
  {
    id: "dragon.idle",
    layer: "dragon",
    requiredForVerticalSlice: true,
    reducedMotionReplacement: "dragon.idle.static",
  },
  { id: "dragon.idle.static", layer: "dragon", requiredForVerticalSlice: true },
  { id: "dragon.inhale", layer: "dragon", requiredForVerticalSlice: true },
  { id: "dragon.attack.quick", layer: "dragon", requiredForVerticalSlice: true },
  { id: "dragon.claim", layer: "dragon", requiredForVerticalSlice: true },
  { id: "dragon.block", layer: "dragon", requiredForVerticalSlice: true },
  {
    id: "wizard.idle",
    layer: "wizard",
    requiredForVerticalSlice: true,
    reducedMotionReplacement: "wizard.idle.static",
  },
  { id: "wizard.idle.static", layer: "wizard", requiredForVerticalSlice: true },
  { id: "wizard.charge", layer: "wizard", requiredForVerticalSlice: true },
  { id: "wizard.cast.quick", layer: "wizard", requiredForVerticalSlice: true },
  { id: "wizard.claim", layer: "wizard", requiredForVerticalSlice: true },
  { id: "wizard.block", layer: "wizard", requiredForVerticalSlice: true },
  { id: "wizard.body", layer: "wizard", requiredForVerticalSlice: true },
  { id: "wizard.hat.idle", layer: "wizard", requiredForVerticalSlice: true },
  { id: "wizard.hat.charge", layer: "wizard", requiredForVerticalSlice: true },
  { id: "wizard.hat.cast", layer: "wizard", requiredForVerticalSlice: true },
  { id: "wizard.hat.block", layer: "wizard", requiredForVerticalSlice: true },
  { id: "wizard.eyes", layer: "wizard", requiredForVerticalSlice: true },
  { id: "effects.fire.core", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.fire.edge", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.fire.embers", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.fire.smoke", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.magic.bolt", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.magic.trail", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.magic.runes", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.block.ward", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.block.firewall", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.clash.core", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.clash.ring", layer: "effects", requiredForVerticalSlice: true },
  { id: "effects.clash.multiplier", layer: "effects", requiredForVerticalSlice: true },
  ...TIER_REVEAL_ASSET_SLOTS,
] as const satisfies readonly WizardCraftAssetSlot[];

export type WizardCraftAssetId =
  (typeof WIZARD_CRAFT_ASSET_SLOTS)[number]["id"];

export function getMissingWizardCraftVerticalSliceAssets(
  loaded: ReadonlySet<string>,
): readonly WizardCraftAssetId[] {
  return Object.freeze(
    WIZARD_CRAFT_ASSET_SLOTS
      .filter((slot) => slot.requiredForVerticalSlice && !loaded.has(slot.id))
      .map((slot) => slot.id),
  );
}

export function assertWizardCraftVerticalSliceAssets(
  loaded: ReadonlySet<string>,
): void {
  const missing = getMissingWizardCraftVerticalSliceAssets(loaded);
  if (missing.length > 0) {
    throw new Error(
      `Missing WIZARD CRAFT production assets: ${missing.join(", ")}`,
    );
  }
}

export const WIZARD_CRAFT_EVENT_ASSETS = {
  reveal: [
    "reels.backing",
    "symbol.ember.idle",
    "symbol.scroll.idle",
    "symbol.potion.idle",
    "symbol.crystal.idle",
    "symbol.grimoire.idle",
    "symbol.staff.idle",
    "symbol.dragon-egg.idle",
    "symbol.duel-coin.idle",
    "symbol.dragon-wild.idle",
    "symbol.wizard-wild.idle",
    "symbol.dragon-wild.eyes",
    "symbol.dragon-wild.inner-glow",
    "symbol.dragon-wild.aura",
    "symbol.dragon-wild.particles",
    "symbol.wizard-wild.eyes",
    "symbol.wizard-wild.inner-glow",
    "symbol.wizard-wild.aura",
    "symbol.wizard-wild.particles",
  ],
  freeSpinTrigger: [
    "cabinet.crest.base",
    ...WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS[1],
    ...WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS[2],
    ...WIZARD_CRAFT_TIER_REVEAL_FRAME_IDS[3],
  ],
  startDuel: [
    "cabinet.crest.base",
    "reels.backing",
  ],
  prepareAttack: ["dragon.inhale", "wizard.charge"],
  expandVsReel: [
    "dragon.attack.quick",
    "wizard.cast.quick",
    "effects.fire.core",
    "effects.magic.bolt",
    "reels.vs.expand",
    "reels.vs.frame.dragon",
    "reels.vs.frame.wizard",
    "reels.vs.frame.balanced",
    "reels.vs.temporary",
    "reels.vs.sticky",
  ],
  blockAttack: [
    "dragon.block",
    "wizard.block",
    "effects.block.ward",
    "effects.block.firewall",
  ],
  upgradeStickyReel: [
    "cabinet.crest.clash",
    "effects.clash.core",
    "effects.clash.ring",
    "effects.clash.multiplier",
    "reels.vs.upgrade",
  ],
  clearSpinReels: ["reels.vs.temporary", "reels.vs.release"],
  winInfo: [],
  setTotalWin: [],
  wincap: ["cabinet.crest.clash"],
  finalWin: [],
} as const satisfies Readonly<Record<string, readonly WizardCraftAssetId[]>>;
