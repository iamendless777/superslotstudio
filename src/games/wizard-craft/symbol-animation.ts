export type WizardCraftSymbolAnimationTrigger =
  | "reelStop"
  | "winInfo"
  | "dragonClaim"
  | "wizardClaim";

export type WizardCraftSymbolEffect =
  | "land"
  | "win"
  | "anticipate"
  | "dragonClaim"
  | "wizardClaim"
  | "balancedClaim";

export interface WizardCraftSymbolEffectFrame {
  readonly baseScale: number;
  readonly baseOffsetY: number;
  readonly eyesAlpha: number;
  readonly innerGlowAlpha: number;
  readonly auraAlpha: number;
  readonly auraScale: number;
  readonly auraRotation: number;
  readonly particlesAlpha: number;
  readonly particlesRotation: number;
}

export interface WizardCraftStandardSymbolFrame {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotation: number;
  readonly alpha: number;
}

export interface WizardCraftReelSpinFrame {
  readonly travelPhase: number;
  readonly travelScale: number;
  readonly symbolAlpha: number;
  readonly plateAlpha: number;
}

export type WizardCraftSymbolAnimationLayer =
  | "base"
  | "eyes"
  | "innerGlow"
  | "aura"
  | "particles";

export interface WizardCraftSymbolAnimationBeat {
  readonly atMs: number;
  readonly durationMs: number;
  readonly layers: readonly WizardCraftSymbolAnimationLayer[];
  readonly action:
    | "land"
    | "pulse"
    | "eyeFlare"
    | "fireSweep"
    | "hatLift"
    | "magicOrbit"
    | "settle";
}

export interface WizardCraftSymbolAnimationRecipe {
  readonly symbol: "DRAGON" | "WIZARD";
  readonly trigger: WizardCraftSymbolAnimationTrigger;
  readonly totalDurationMs: number;
  readonly beats: readonly WizardCraftSymbolAnimationBeat[];
}

const recipe = (
  symbol: WizardCraftSymbolAnimationRecipe["symbol"],
  trigger: WizardCraftSymbolAnimationTrigger,
  beats: readonly WizardCraftSymbolAnimationBeat[],
): WizardCraftSymbolAnimationRecipe => Object.freeze({
  symbol,
  trigger,
  totalDurationMs: Math.max(...beats.map((beat) => beat.atMs + beat.durationMs)),
  beats: Object.freeze(beats.map((beat) => Object.freeze({
    ...beat,
    layers: Object.freeze([...beat.layers]),
  }))),
});

export const WIZARD_CRAFT_SYMBOL_ANIMATIONS = Object.freeze({
  dragonLand: recipe("DRAGON", "reelStop", [
    { atMs: 0, durationMs: 180, layers: ["base"], action: "land" },
    { atMs: 110, durationMs: 170, layers: ["eyes", "innerGlow"], action: "eyeFlare" },
    { atMs: 240, durationMs: 140, layers: ["base"], action: "settle" },
  ]),
  dragonWin: recipe("DRAGON", "winInfo", [
    { atMs: 0, durationMs: 140, layers: ["eyes", "innerGlow"], action: "eyeFlare" },
    { atMs: 90, durationMs: 360, layers: ["aura", "particles"], action: "fireSweep" },
    { atMs: 380, durationMs: 240, layers: ["base", "aura"], action: "pulse" },
    { atMs: 560, durationMs: 160, layers: ["base"], action: "settle" },
  ]),
  dragonClaim: recipe("DRAGON", "dragonClaim", [
    { atMs: 0, durationMs: 160, layers: ["eyes", "innerGlow"], action: "eyeFlare" },
    { atMs: 100, durationMs: 440, layers: ["aura", "particles"], action: "fireSweep" },
    { atMs: 480, durationMs: 220, layers: ["base", "aura"], action: "pulse" },
    { atMs: 640, durationMs: 160, layers: ["base"], action: "settle" },
  ]),
  wizardLand: recipe("WIZARD", "reelStop", [
    { atMs: 0, durationMs: 180, layers: ["base"], action: "land" },
    { atMs: 110, durationMs: 170, layers: ["eyes", "innerGlow"], action: "eyeFlare" },
    { atMs: 240, durationMs: 140, layers: ["base"], action: "settle" },
  ]),
  wizardWin: recipe("WIZARD", "winInfo", [
    { atMs: 0, durationMs: 160, layers: ["eyes", "innerGlow"], action: "eyeFlare" },
    { atMs: 80, durationMs: 220, layers: ["base"], action: "hatLift" },
    { atMs: 150, durationMs: 390, layers: ["aura", "particles"], action: "magicOrbit" },
    { atMs: 480, durationMs: 180, layers: ["base", "aura"], action: "pulse" },
    { atMs: 600, durationMs: 160, layers: ["base"], action: "settle" },
  ]),
  wizardClaim: recipe("WIZARD", "wizardClaim", [
    { atMs: 0, durationMs: 180, layers: ["eyes", "innerGlow"], action: "eyeFlare" },
    { atMs: 100, durationMs: 240, layers: ["base"], action: "hatLift" },
    { atMs: 160, durationMs: 460, layers: ["aura", "particles"], action: "magicOrbit" },
    { atMs: 560, durationMs: 200, layers: ["base", "aura"], action: "pulse" },
    { atMs: 700, durationMs: 160, layers: ["base"], action: "settle" },
  ]),
} as const);

export function symbolAnimationFor(
  symbol: string,
  trigger: WizardCraftSymbolAnimationTrigger,
): WizardCraftSymbolAnimationRecipe | null {
  const recipes = Object.values(WIZARD_CRAFT_SYMBOL_ANIMATIONS);
  return recipes.find((candidate) =>
    candidate.symbol === symbol && candidate.trigger === trigger
  ) ?? null;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOutBack = (value: number): number => {
  const progress = clamp01(value);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (progress - 1) ** 3 + c1 * (progress - 1) ** 2;
};
const pulse = (progress: number): number => {
  const bounded = clamp01(progress);
  return bounded === 0 || bounded === 1
    ? 0
    : Math.sin(bounded * Math.PI);
};

export function wizardCraftReelSpinFrame(
  strength: 0 | 1 | 2 | 3,
  phase: number,
): WizardCraftReelSpinFrame {
  if (!Number.isInteger(strength) || strength < 0 || strength > 3) {
    throw new RangeError("WIZARD CRAFT spin strength must be from 0 to 3");
  }
  if (!Number.isFinite(phase) || phase < 0 || phase > 1) {
    throw new RangeError("WIZARD CRAFT spin phase must be from 0 to 1");
  }
  const weight = strength / 3;
  // Anticipated reels keep more of the symbol visible and travel slightly
  // farther. The plate breathes only a few percent, avoiding a false win
  // flash while still making strengths 1–3 perceptibly different.
  return Object.freeze({
    travelPhase: strength === 0
      ? phase
      : (1 - Math.cos(Math.PI * phase)) / 2,
    travelScale: 1.35 + weight * 0.15,
    symbolAlpha: Math.max(
      0.12 + weight * 0.10,
      Math.sin(Math.PI * phase),
    ),
    plateAlpha: 1 - Math.sin(Math.PI * phase) * (0.02 + weight * 0.06),
  });
}

export function wizardCraftSymbolEffectDuration(
  effect: WizardCraftSymbolEffect,
): number {
  if (effect === "land") return 180;
  if (effect === "win") return 300;
  if (effect === "anticipate") return 240;
  return 240;
}

const STANDARD_SYMBOLS = new Set([
  "EMBER", "SCROLL", "POTION", "CRYSTAL",
  "GRIMOIRE", "STAFF", "CROWN", "RUNE",
]);

export function wizardCraftStandardSymbolFrame(
  symbol: string,
  effect: WizardCraftSymbolEffect,
  elapsedMs: number,
): WizardCraftStandardSymbolFrame {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError("WIZARD CRAFT symbol animation time must be non-negative");
  }
  const neutral = Object.freeze({
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    alpha: 1,
  });
  if (
    !STANDARD_SYMBOLS.has(symbol) ||
    effect.endsWith("Claim") ||
    (effect === "anticipate" && symbol !== "RUNE")
  ) return neutral;
  const progress = clamp01(elapsedMs / wizardCraftSymbolEffectDuration(effect));
  const energy = pulse(progress);
  if (effect === "land") {
    const scale = 0.94 + easeOutBack(progress) * 0.06;
    return Object.freeze({ ...neutral, scaleX: scale, scaleY: scale });
  }
  switch (symbol) {
    case "EMBER":
      return Object.freeze({
        ...neutral,
        scaleX: 1 + energy * 0.035,
        scaleY: 1 + energy * 0.09,
        offsetY: -energy * 1.5,
        alpha: 0.88 + energy * 0.12,
      });
    case "SCROLL":
      return Object.freeze({
        ...neutral,
        scaleX: 1 + energy * 0.08,
        scaleY: 1 - energy * 0.025,
        rotation: Math.sin(progress * Math.PI * 2) * 0.025,
      });
    case "POTION":
      return Object.freeze({
        ...neutral,
        offsetY: -energy * 2,
        rotation: Math.sin(progress * Math.PI * 2) * 0.035,
        scaleX: 1 + energy * 0.035,
        scaleY: 1 + energy * 0.035,
      });
    case "CRYSTAL":
      return Object.freeze({
        ...neutral,
        scaleX: 1 + energy * 0.07,
        scaleY: 1 + energy * 0.07,
        rotation: Math.sin(progress * Math.PI) * 0.025,
        alpha: 0.9 + energy * 0.1,
      });
    case "GRIMOIRE":
      return Object.freeze({
        ...neutral,
        scaleX: 1 + energy * 0.055,
        scaleY: 1 - energy * 0.035,
        offsetY: energy * 1.25,
      });
    case "STAFF":
      return Object.freeze({
        ...neutral,
        offsetY: -energy * 1.5,
        rotation: Math.sin(progress * Math.PI * 2) * 0.045,
        scaleX: 1 + energy * 0.04,
        scaleY: 1 + energy * 0.04,
      });
    case "CROWN":
      return Object.freeze({
        ...neutral,
        scaleX: 1 + energy * 0.06,
        scaleY: 1 + energy * 0.025,
        offsetY: -energy,
      });
    case "RUNE": {
      const anticipation = effect === "anticipate";
      return Object.freeze({
        ...neutral,
        scaleX: 1 + energy * (anticipation ? 0.11 : 0.07),
        scaleY: 1 + energy * (anticipation ? 0.11 : 0.07),
        rotation: Math.sin(progress * Math.PI * (anticipation ? 3 : 1)) *
          (anticipation ? 0.05 : 0.02),
        alpha: 0.86 + energy * 0.14,
      });
    }
    default:
      return neutral;
  }
}

export function wizardCraftSymbolEffectFrame(
  symbol: "DRAGON" | "WIZARD",
  effect: WizardCraftSymbolEffect,
  elapsedMs: number,
): WizardCraftSymbolEffectFrame {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError("WIZARD CRAFT symbol animation time must be non-negative");
  }
  const progress = clamp01(
    elapsedMs / wizardCraftSymbolEffectDuration(effect),
  );
  const energy = pulse(progress);
  const landing = effect === "land";
  const claim = effect.endsWith("Claim");
  const characterMatches = effect === "balancedClaim" ||
    effect === "win" ||
    effect === "land" ||
    (effect === "dragonClaim" && symbol === "DRAGON") ||
    (effect === "wizardClaim" && symbol === "WIZARD");
  if (!characterMatches) {
    return Object.freeze({
      baseScale: 1,
      baseOffsetY: 0,
      eyesAlpha: 0,
      innerGlowAlpha: 0,
      auraAlpha: 0,
      auraScale: 1,
      auraRotation: 0,
      particlesAlpha: 0,
      particlesRotation: 0,
    });
  }
  const direction = symbol === "DRAGON" ? 1 : -1;
  return Object.freeze({
    baseScale: landing
      ? 0.9 + easeOutBack(progress) * 0.1
      : 1 + energy * (claim ? 0.075 : 0.05),
    baseOffsetY: symbol === "WIZARD" && !landing ? -energy * 2 : 0,
    eyesAlpha: Math.min(1, progress * 5) * (landing ? 1 : 0.85 + energy * 0.15),
    innerGlowAlpha: Math.min(1, progress * 4) * (0.55 + energy * 0.45),
    auraAlpha: landing ? 0 : energy * (claim ? 1 : 0.82),
    auraScale: 0.92 + progress * 0.16 + energy * 0.05,
    auraRotation: direction * progress * (claim ? 0.18 : 0.1),
    particlesAlpha: landing ? 0 : Math.min(1, progress * 5) * (1 - progress),
    particlesRotation: direction * progress * (claim ? 0.42 : 0.25),
  });
}
