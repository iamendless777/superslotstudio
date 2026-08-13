import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type ApplicationOptions,
} from "pixi.js";

import type { WizardCraftCanvasUiMultiplier } from "./canvas-ui-layer.js";
import type { WizardCraftAssetId } from "./assets.js";
import type {
  WizardCraftCanvasMultiplierView,
  WizardCraftCanvasTextView,
  WizardCraftCanvasUiTextViews,
} from "./canvas-ui-sprite-view.js";
import type { WizardCraftCabinetLighting } from "./cabinet-sprite-view.js";
import type {
  WizardCraftBrowserPixiContainer,
  WizardCraftBrowserPixiSprite,
  WizardCraftBrowserViewComponents,
} from "./browser-production.js";
import {
  wizardCraftPixiTextureAdapter,
  type WizardCraftDecodedImage,
  type WizardCraftPixiTextureAdapter,
} from "./browser-textures.js";
import type {
  WizardCraftPixiAssetScene,
  WizardCraftPixiDisplayAdapter,
} from "./pixi-assets.js";
import {
  WIZARD_CRAFT_REEL_DESIGN_RECT,
  type WizardCraftReelLayoutCell,
  type WizardCraftReelOverlay,
} from "./reel-layer.js";
import type {
  WizardCraftOverlayPhase,
  WizardCraftSymbolCellView,
  WizardCraftVsReelOverlayView,
} from "./reel-sprite-view.js";
import {
  wizardCraftReelSpinFrame,
  wizardCraftSymbolEffectDuration,
  wizardCraftSymbolEffectFrame,
  wizardCraftStandardSymbolFrame,
  type WizardCraftSymbolEffect,
} from "./symbol-animation.js";

const COLORS = Object.freeze({
  void: 0x070a11,
  charcoal: 0x223044,
  steel: 0x8fa9be,
  gold: 0xf0b742,
  dragon: 0xac2524,
  wizard: 0x3dbfef,
  balanced: 0x8161f2,
  dragonBadge: 0x7f1d1d,
  wizardBadge: 0x176e9c,
  balancedBadge: 0x5033a8,
} as const);

export const WIZARD_CRAFT_PIXI_COLORS = COLORS;

/** Slow, integer-only ambient travel that preserves the native pixel grid. */
export function wizardCraftAmbientFogOffset(elapsedMilliseconds: number): number {
  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) {
    throw new RangeError("WIZARD CRAFT fog time must be finite and non-negative");
  }
  const offset = Math.round(
    Math.sin(elapsedMilliseconds / 6_000 * Math.PI * 2) * 2,
  );
  return Object.is(offset, -0) ? 0 : offset;
}

export function wizardCraftIdleSparkFrame(elapsedMilliseconds: number): number {
  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) {
    throw new RangeError("WIZARD CRAFT sparkle time must be finite and non-negative");
  }
  return Math.floor(elapsedMilliseconds / 140) % 6;
}

export function wizardCraftIdleEmberFrame(elapsedMilliseconds: number): number {
  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) {
    throw new RangeError("WIZARD CRAFT ember time must be finite and non-negative");
  }
  return Math.floor(elapsedMilliseconds / 180) % 6;
}

const scheduleAnimationFrame = (callback: FrameRequestCallback): number =>
  typeof globalThis.requestAnimationFrame === "function"
    ? globalThis.requestAnimationFrame(callback)
    : globalThis.setTimeout(
      () => callback(performance.now()),
      16,
    ) as unknown as number;

const stopAnimationFrame = (frame: number): void => {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(frame);
  } else {
    globalThis.clearTimeout(frame);
  }
};

export type WizardCraftPixiJsContainer = Container &
  WizardCraftBrowserPixiContainer;
export type WizardCraftPixiJsSprite = Sprite &
  WizardCraftBrowserPixiSprite<Texture>;
export type WizardCraftPixiProductionScene = WizardCraftPixiAssetScene<
  Texture,
  WizardCraftPixiJsContainer,
  WizardCraftPixiJsSprite
>;

export const WIZARD_CRAFT_PIXI_TEXTURE_ADAPTER:
  WizardCraftPixiTextureAdapter<Texture> = wizardCraftPixiTextureAdapter({
    from(source: WizardCraftDecodedImage): Texture {
      const texture = Texture.from(source as ImageBitmap);
      texture.source.scaleMode = "nearest";
      return texture;
    },
  });

export const WIZARD_CRAFT_PIXI_DISPLAY_ADAPTER:
  WizardCraftPixiDisplayAdapter<
    Texture,
    WizardCraftPixiJsContainer,
    WizardCraftPixiJsSprite
  > = Object.freeze({
    createContainer(label: string): WizardCraftPixiJsContainer {
      const container = new Container({ label });
      return container as WizardCraftPixiJsContainer;
    },
    createSprite(texture: Texture, label: string): WizardCraftPixiJsSprite {
      const sprite = new Sprite({ texture, label });
      return sprite as WizardCraftPixiJsSprite;
    },
    addChild(
      parent: WizardCraftPixiJsContainer,
      child: WizardCraftPixiJsContainer | WizardCraftPixiJsSprite,
    ): void {
      parent.addChild(child);
    },
    destroySprite(sprite: WizardCraftPixiJsSprite): void {
      sprite.destroy({ texture: false, textureSource: false });
    },
    destroyContainer(container: WizardCraftPixiJsContainer): void {
      container.destroy({ children: false });
    },
  });

function symbolName(symbol: unknown): string {
  if (
    typeof symbol === "object" &&
    symbol !== null &&
    "name" in symbol &&
    typeof symbol.name === "string"
  ) {
    return symbol.name;
  }
  return typeof symbol === "string" ? symbol : "";
}

class PixiSymbolCell implements WizardCraftSymbolCellView {
  readonly container = new Container();
  readonly #plate = new Graphics();
  readonly #symbols: ReadonlyMap<string, Sprite>;
  readonly #wildEffects: ReadonlyMap<
    "DRAGON" | "WIZARD",
    readonly Sprite[]
  >;
  readonly #label = new Text({
    text: "",
    style: {
      fill: COLORS.steel,
      fontFamily: "monospace",
      fontSize: 13,
      fontWeight: "700",
      align: "center",
    },
  });
  #geometry: WizardCraftReelLayoutCell | null = null;
  #symbolName = "";
  #highlighted = false;
  #spinning = false;
  #spinStrength: 0 | 1 | 2 | 3 = 0;
  #effectEpoch = 0;
  #effectFrame: number | null = null;
  #spinEpoch = 0;
  #spinFrame: number | null = null;

  constructor(scene: WizardCraftPixiProductionScene) {
    this.#symbols = new Map([
      ["EMBER", new Sprite({ texture: scene.sprite("symbol.ember.idle").texture })],
      ["SCROLL", new Sprite({ texture: scene.sprite("symbol.scroll.idle").texture })],
      ["POTION", new Sprite({ texture: scene.sprite("symbol.potion.idle").texture })],
      ["CRYSTAL", new Sprite({ texture: scene.sprite("symbol.crystal.idle").texture })],
      ["GRIMOIRE", new Sprite({ texture: scene.sprite("symbol.grimoire.idle").texture })],
      ["STAFF", new Sprite({ texture: scene.sprite("symbol.staff.idle").texture })],
      // Compatibility mappings: retain math/replay names while the visible
      // library presents a Dragon Egg and the Dragon-vs-Wizard scatter coin.
      ["CROWN", new Sprite({ texture: scene.sprite("symbol.dragon-egg.idle").texture })],
      ["RUNE", new Sprite({ texture: scene.sprite("symbol.duel-coin.idle").texture })],
      ["DRAGON", new Sprite({ texture: scene.sprite("symbol.dragon-wild.idle").texture })],
      ["WIZARD", new Sprite({ texture: scene.sprite("symbol.wizard-wild.idle").texture })],
    ]);
    this.#wildEffects = new Map([
      ["DRAGON", [
        "eyes", "inner-glow", "aura", "particles",
      ].map((layer) => new Sprite({
        texture: scene.sprite(`symbol.dragon-wild.${layer}` as WizardCraftAssetId).texture,
      }))],
      ["WIZARD", [
        "eyes", "inner-glow", "aura", "particles",
      ].map((layer) => new Sprite({
        texture: scene.sprite(`symbol.wizard-wild.${layer}` as WizardCraftAssetId).texture,
      }))],
    ]);
    this.#label.anchor.set(0.5);
    this.container.addChild(
      this.#plate,
      ...this.#symbols.values(),
      ...[...this.#wildEffects.values()].flat(),
      this.#label,
    );
    for (const sprite of this.#symbols.values()) sprite.visible = false;
    for (const sprite of this.#symbols.values()) sprite.anchor.set(0.5);
    for (const sprites of this.#wildEffects.values()) {
      for (const sprite of sprites) {
        sprite.visible = false;
        sprite.anchor.set(0.5);
      }
    }
  }

  setGeometry(cell: WizardCraftReelLayoutCell): void {
    this.#geometry = cell;
    this.container.position.set(cell.x, cell.y);
    this.#label.position.set(cell.width / 2, cell.height / 2);
    for (const sprite of this.#symbols.values()) {
      sprite.position.set(cell.width / 2, cell.height / 2);
      sprite.width = cell.width;
      sprite.height = cell.height;
    }
    for (const sprites of this.#wildEffects.values()) {
      for (const sprite of sprites) {
        sprite.position.set(cell.width / 2, cell.height / 2);
        sprite.width = cell.width;
        sprite.height = cell.height;
      }
    }
    this.#draw();
  }

  setSymbol(symbol: unknown | null): void {
    const name = symbol === null ? "" : symbolName(symbol);
    this.#symbolName = name;
    for (const [candidate, sprite] of this.#symbols) {
      sprite.visible = !this.#spinning && candidate === name;
    }
    this.#label.text = this.#symbols.has(name) ? "" : name;
  }

  setSpinning(spinning: boolean): void {
    this.#spinEpoch += 1;
    if (this.#spinFrame !== null) {
      stopAnimationFrame(this.#spinFrame);
      this.#spinFrame = null;
    }
    this.#spinning = spinning;
    for (const [candidate, sprite] of this.#symbols) {
      sprite.visible = candidate === this.#symbolName;
    }
    this.#label.text = spinning || this.#symbols.has(this.#symbolName)
      ? ""
      : this.#symbolName;
    this.#draw();
    if (spinning) this.#startSpinAnimation();
    else this.#resetSpinTransforms();
  }

  setSpinStrength(strength: 0 | 1 | 2 | 3): void {
    this.#spinStrength = strength;
    this.#draw();
  }

  setHighlighted(highlighted: boolean): void {
    this.#highlighted = highlighted;
    this.#draw();
  }

  setEffect(
    effect: WizardCraftSymbolEffect | null,
  ): void {
    this.#effectEpoch += 1;
    if (this.#effectFrame !== null) {
      stopAnimationFrame(this.#effectFrame);
      this.#effectFrame = null;
    }
    this.#resetEffectTransforms();
    for (const sprites of this.#wildEffects.values()) {
      for (const sprite of sprites) sprite.visible = false;
    }
    if (effect === null || this.#spinning) return;
    const isWild = this.#symbolName === "DRAGON" || this.#symbolName === "WIZARD";
    if (!isWild && effect.endsWith("Claim")) return;
    if (!isWild && effect !== "land" && effect !== "win" && effect !== "anticipate") {
      return;
    }
    if (!isWild) {
      this.#startEffectAnimation(effect);
      return;
    }
    if (
      (effect === "dragonClaim" && this.#symbolName !== "DRAGON") ||
      (effect === "wizardClaim" && this.#symbolName !== "WIZARD")
    ) return;
    const wildSymbol = this.#symbolName as "DRAGON" | "WIZARD";
    const sprites = this.#wildEffects.get(wildSymbol);
    if (sprites === undefined) return;
    const visibleCount = effect === "land" ? 2 : 4;
    for (let index = 0; index < visibleCount; index += 1) {
      sprites[index]!.visible = true;
    }
    this.#startEffectAnimation(effect);
  }

  #startEffectAnimation(effect: WizardCraftSymbolEffect): void {
    const epoch = this.#effectEpoch;
    const startedAt = performance.now();
    const duration = wizardCraftSymbolEffectDuration(effect);
    const animate = (now: number): void => {
      if (epoch !== this.#effectEpoch || this.#geometry === null) return;
      const elapsed = Math.min(duration, Math.max(0, now - startedAt));
      this.#applyEffectFrame(effect, elapsed);
      if (elapsed < duration) {
        this.#effectFrame = scheduleAnimationFrame(animate);
      } else {
        this.#effectFrame = null;
        this.setEffect(null);
      }
    };
    this.#applyEffectFrame(effect, 0);
    this.#effectFrame = scheduleAnimationFrame(animate);
  }

  destroy(): void {
    this.#spinEpoch += 1;
    if (this.#spinFrame !== null) stopAnimationFrame(this.#spinFrame);
    this.setEffect(null);
    this.container.destroy({ children: true });
  }

  #startSpinAnimation(): void {
    const geometry = this.#geometry;
    const sprite = this.#symbols.get(this.#symbolName);
    if (geometry === null || sprite === undefined) return;
    const epoch = this.#spinEpoch;
    const startedAt = performance.now();
    const cycle = this.#spinStrength === 0
      ? 150
      : 175 + this.#spinStrength * 25;
    const phaseOffset = (geometry.x * 0.11 + geometry.y * 0.17) % cycle;
    const animate = (now: number): void => {
      if (epoch !== this.#spinEpoch || !this.#spinning) return;
      const phase = ((now - startedAt + phaseOffset) % cycle) / cycle;
      const frame = wizardCraftReelSpinFrame(this.#spinStrength, phase);
      const travel = (frame.travelPhase - 0.5) *
        geometry.height * frame.travelScale;
      sprite.position.set(geometry.width / 2, geometry.height / 2 + travel);
      // The wrap occurs while transparent, preventing a one-frame teleport.
      sprite.alpha = frame.symbolAlpha;
      this.#plate.alpha = frame.plateAlpha;
      sprite.height = geometry.height * 1.08;
      this.#spinFrame = scheduleAnimationFrame(animate);
    };
    animate(startedAt);
  }

  #resetSpinTransforms(): void {
    const geometry = this.#geometry;
    if (geometry === null) return;
    this.#plate.alpha = 1;
    for (const sprite of this.#symbols.values()) {
      sprite.position.set(geometry.width / 2, geometry.height / 2);
      sprite.width = geometry.width;
      sprite.height = geometry.height;
      sprite.alpha = 1;
    }
  }

  #applyEffectFrame(effect: WizardCraftSymbolEffect, elapsedMs: number): void {
    const geometry = this.#geometry;
    if (geometry === null) return;
    if (this.#symbolName !== "DRAGON" && this.#symbolName !== "WIZARD") {
      const frame = wizardCraftStandardSymbolFrame(
        this.#symbolName,
        effect,
        elapsedMs,
      );
      const base = this.#symbols.get(this.#symbolName);
      if (base === undefined) return;
      base.width = geometry.width * frame.scaleX;
      base.height = geometry.height * frame.scaleY;
      base.position.set(
        geometry.width / 2 + frame.offsetX,
        geometry.height / 2 + frame.offsetY,
      );
      base.rotation = frame.rotation;
      base.alpha = frame.alpha;
      return;
    }
    const frame = wizardCraftSymbolEffectFrame(
      this.#symbolName,
      effect,
      elapsedMs,
    );
    const base = this.#symbols.get(this.#symbolName);
    if (base !== undefined) {
      base.width = geometry.width * frame.baseScale;
      base.height = geometry.height * frame.baseScale;
      base.position.set(geometry.width / 2, geometry.height / 2 + frame.baseOffsetY);
    }
    const sprites = this.#wildEffects.get(this.#symbolName);
    if (sprites === undefined) return;
    const [eyes, innerGlow, aura, particles] = sprites;
    eyes!.alpha = frame.eyesAlpha;
    innerGlow!.alpha = frame.innerGlowAlpha;
    aura!.alpha = frame.auraAlpha;
    aura!.width = geometry.width * frame.auraScale;
    aura!.height = geometry.height * frame.auraScale;
    aura!.rotation = frame.auraRotation;
    particles!.alpha = frame.particlesAlpha;
    particles!.rotation = frame.particlesRotation;
  }

  #resetEffectTransforms(): void {
    const geometry = this.#geometry;
    if (geometry === null) return;
    for (const sprite of this.#symbols.values()) {
      sprite.width = geometry.width;
      sprite.height = geometry.height;
      sprite.position.set(geometry.width / 2, geometry.height / 2);
      sprite.rotation = 0;
      sprite.alpha = 1;
    }
    for (const sprites of this.#wildEffects.values()) {
      for (const sprite of sprites) {
        sprite.width = geometry.width;
        sprite.height = geometry.height;
        sprite.position.set(geometry.width / 2, geometry.height / 2);
        sprite.rotation = 0;
        sprite.alpha = 1;
      }
    }
  }

  #draw(): void {
    const geometry = this.#geometry;
    if (geometry === null) return;
    this.#plate.clear()
      .rect(1, 1, geometry.width - 2, geometry.height - 2)
      .fill({
        color: this.#spinning ? COLORS.void : COLORS.charcoal,
        alpha: 0.94,
      })
      .stroke({
        color: this.#highlighted || (this.#spinning && this.#spinStrength > 0)
          ? COLORS.gold
          : COLORS.steel,
        width: this.#highlighted ? 3 :
          this.#spinning && this.#spinStrength > 0 ? 2 : 1,
        alpha: this.#highlighted ? 1 :
          this.#spinning && this.#spinStrength > 0
          ? 0.28 + this.#spinStrength * 0.1
          : 0.35,
      });
    if (this.#highlighted) {
      // A real, book-authored win resolves with a warm inner light in
      // addition to the outline. Anticipation never sets this state.
      this.#plate
        .rect(4, 4, geometry.width - 8, geometry.height - 8)
        .fill({ color: COLORS.gold, alpha: 0.14 })
        .stroke({ color: COLORS.gold, width: 1, alpha: 0.68 });
    }
  }
}

class PixiVsOverlay implements WizardCraftVsReelOverlayView {
  readonly container = new Container();
  readonly #plate = new Graphics();
  readonly #dragonFrame: Sprite;
  readonly #wizardFrame: Sprite;
  readonly #balancedFrame: Sprite;
  readonly #temporary: Sprite;
  readonly #claim: Sprite;
  readonly #sticky: Sprite;
  readonly #upgrade: Sprite;
  readonly #release: Sprite;
  #state: WizardCraftReelOverlay | null = null;
  #phase: WizardCraftOverlayPhase = "stable";
  #x = 0;
  #width = 0;
  #height = 0;
  #phaseEpoch = 0;
  #phaseFrame: number | null = null;

  constructor(scene: WizardCraftPixiProductionScene) {
    this.#dragonFrame = new Sprite({
      texture: scene.sprite("reels.vs.frame.dragon").texture,
    });
    this.#wizardFrame = new Sprite({
      texture: scene.sprite("reels.vs.frame.wizard").texture,
    });
    this.#balancedFrame = new Sprite({
      texture: scene.sprite("reels.vs.frame.balanced").texture,
    });
    this.#temporary = new Sprite({
      texture: scene.sprite("reels.vs.temporary").texture,
    });
    this.#claim = new Sprite({
      texture: scene.sprite("reels.vs.expand").texture,
    });
    this.#sticky = new Sprite({
      texture: scene.sprite("reels.vs.sticky").texture,
    });
    this.#upgrade = new Sprite({
      texture: scene.sprite("reels.vs.upgrade").texture,
    });
    this.#release = new Sprite({
      texture: scene.sprite("reels.vs.release").texture,
    });
    this.container.visible = false;
    this.container.addChild(
      this.#plate,
      this.#dragonFrame,
      this.#wizardFrame,
      this.#balancedFrame,
      this.#temporary,
      this.#sticky,
      this.#claim,
      this.#upgrade,
      this.#release,
    );
    this.#applyArtState();
  }

  setGeometry(
    _reel: number,
    x: number,
    width: number,
    height: number,
  ): void {
    this.#x = x;
    this.#width = width;
    this.#height = height;
    this.container.position.set(x, 0);
    for (const sprite of [
      this.#temporary,
      this.#dragonFrame,
      this.#wizardFrame,
      this.#balancedFrame,
      this.#claim,
      this.#sticky,
      this.#upgrade,
      this.#release,
    ]) {
      sprite.position.set(0, 0);
      sprite.width = width;
      sprite.height = height;
    }
    this.#draw();
  }

  setState(overlay: WizardCraftReelOverlay | null): void {
    this.#state = overlay;
    this.container.visible = overlay !== null;
    this.#draw();
    this.#applyArtState();
  }

  setPhase(phase: WizardCraftOverlayPhase, animated = false): void {
    this.#phaseEpoch += 1;
    if (this.#phaseFrame !== null) {
      stopAnimationFrame(this.#phaseFrame);
      this.#phaseFrame = null;
    }
    this.#phase = phase;
    const targetAlpha = phase === "release" ? 0.55 : 1;
    const emphasis = phase === "guarantee" ? 1.06 :
      phase === "upgrade" ? 1.04 : phase === "contribute" ? 1.035 : 1;
    const targetX =
      this.#x - this.#width * (emphasis - 1) / 2;
    const targetY = -this.#height * (emphasis - 1) / 2;
    this.#applyArtState();
    if (!animated) {
      this.container.alpha = targetAlpha;
      this.container.scale.set(emphasis);
      this.container.position.set(targetX, targetY);
      return;
    }
    const epoch = this.#phaseEpoch;
    const startedAt = performance.now();
    const startAlpha = this.container.alpha;
    const startScale = this.container.scale.x;
    const startX = this.container.position.x;
    const startY = this.container.position.y;
    const duration = phase === "release" ? 220 :
      phase === "guarantee" ? 180 : phase === "upgrade" ? 160 : 140;
    const animate = (now: number): void => {
      if (epoch !== this.#phaseEpoch) return;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      this.container.alpha = startAlpha + (targetAlpha - startAlpha) * eased;
      this.container.scale.set(startScale + (emphasis - startScale) * eased);
      this.container.position.set(
        startX + (targetX - startX) * eased,
        startY + (targetY - startY) * eased,
      );
      if (progress < 1) this.#phaseFrame = scheduleAnimationFrame(animate);
      else this.#phaseFrame = null;
    };
    this.#phaseFrame = scheduleAnimationFrame(animate);
  }

  destroy(): void {
    this.#phaseEpoch += 1;
    if (this.#phaseFrame !== null) stopAnimationFrame(this.#phaseFrame);
    this.container.destroy({ children: true });
  }

  #draw(): void {
    if (this.#state === null || this.#width <= 0 || this.#height <= 0) return;
    const color = this.#state.advantage === "dragon"
      ? COLORS.dragon
      : this.#state.advantage === "wizard"
      ? COLORS.wizard
      : COLORS.balanced;
    this.#plate.clear()
      .rect(2, 2, this.#width - 4, this.#height - 4)
      .fill({ color, alpha: this.#state.persistence === "sticky" ? 0.09 : 0.055 });
  }

  #applyArtState(): void {
    const sticky = this.#state?.persistence === "sticky";
    this.#dragonFrame.alpha = sticky ? 0.82 : 0.72;
    this.#wizardFrame.alpha = sticky ? 0.82 : 0.72;
    this.#balancedFrame.alpha = sticky ? 0.82 : 0.72;
    this.#temporary.alpha = 0.72;
    this.#sticky.alpha = 0.84;
    if (this.#phase === "contribute") {
      this.#dragonFrame.alpha = 1;
      this.#wizardFrame.alpha = 1;
      this.#balancedFrame.alpha = 1;
    }
    this.#dragonFrame.visible =
      this.#state?.advantage === "dragon" && this.#phase !== "release";
    this.#wizardFrame.visible =
      this.#state?.advantage === "wizard" && this.#phase !== "release";
    this.#balancedFrame.visible =
      this.#state?.advantage === "balanced" && this.#phase !== "release";
    this.#temporary.visible =
      this.#state !== null && !sticky &&
      (
        this.#phase === "stable" || this.#phase === "claim" ||
        this.#phase === "contribute"
      );
    this.#sticky.visible =
      this.#state !== null && sticky &&
      (
        this.#phase === "stable" ||
        this.#phase === "claim" ||
        this.#phase === "guarantee" ||
        this.#phase === "upgrade" ||
        this.#phase === "contribute"
      );
    this.#claim.visible = this.#state !== null &&
      (this.#phase === "claim" || this.#phase === "guarantee");
    this.#upgrade.visible = this.#state !== null &&
      (this.#phase === "upgrade" || this.#phase === "guarantee");
    this.#release.visible = this.#state !== null && this.#phase === "release";
  }
}

class PixiTextView implements WizardCraftCanvasTextView {
  readonly display: Text;

  constructor(text: Text) {
    this.display = text;
  }

  get text(): string {
    return this.display.text;
  }
  set text(value: string) {
    this.display.text = value;
  }
  get visible(): boolean {
    return this.display.visible;
  }
  set visible(value: boolean) {
    this.display.visible = value;
  }
  get alpha(): number {
    return this.display.alpha;
  }
  set alpha(value: number) {
    this.display.alpha = value;
  }
  get fontSize(): number {
    return Number(this.display.style.fontSize);
  }
  set fontSize(value: number) {
    this.display.style.fontSize = value;
  }
  get y(): number {
    return this.display.y;
  }
  set y(value: number) {
    this.display.y = value;
  }
  destroy(): void {
    this.display.destroy();
  }
}

class PixiMultiplierView implements WizardCraftCanvasMultiplierView {
  static readonly BADGE_WIDTH = 52;
  readonly container = new Container();
  readonly #plate = new Graphics();
  readonly #label = new Text({
    text: "",
    style: {
      fill: 0xfff7dd,
      fontFamily: "monospace",
      fontSize: 15,
      fontWeight: "900",
      stroke: { color: COLORS.void, width: 3 },
    },
  });
  readonly #baseX: number;
  readonly #baseY: number;
  #stateKey = "";
  #requestedFontPixels = 15;
  #animationEpoch = 0;
  #animationFrame: number | null = null;
  #emphasisEpoch = 0;
  #emphasisFrame: number | null = null;

  constructor(reel: number) {
    this.#baseX = WIZARD_CRAFT_REEL_DESIGN_RECT.x +
      reel * WIZARD_CRAFT_REEL_DESIGN_RECT.width / 5 + 2;
    this.#baseY = WIZARD_CRAFT_REEL_DESIGN_RECT.y + 3;
    this.container.position.set(this.#baseX, this.#baseY);
    this.container.visible = false;
    this.#label.anchor.set(0.5);
    this.#label.position.set(PixiMultiplierView.BADGE_WIDTH / 2, 12);
    this.container.addChild(this.#plate, this.#label);
  }

  setState(state: WizardCraftCanvasUiMultiplier | null): void {
    this.container.visible = state !== null;
    if (state === null) {
      this.#animationEpoch += 1;
      if (this.#animationFrame !== null) stopAnimationFrame(this.#animationFrame);
      this.#animationFrame = null;
      this.#emphasisEpoch += 1;
      if (this.#emphasisFrame !== null) stopAnimationFrame(this.#emphasisFrame);
      this.#emphasisFrame = null;
      this.#stateKey = "";
      this.container.alpha = 1;
      this.container.position.set(this.#baseX, this.#baseY);
      this.#setEmphasisScale(1);
      return;
    }
    const stateKey = `${state.advantage}:${state.persistence}:${state.multiplier}`;
    const changed = stateKey !== this.#stateKey;
    if (changed) {
      this.#animationEpoch += 1;
      if (this.#animationFrame !== null) stopAnimationFrame(this.#animationFrame);
      this.#animationFrame = null;
    }
    this.#stateKey = stateKey;
    const color = state.advantage === "dragon"
      ? COLORS.dragon
      : state.advantage === "wizard"
      ? COLORS.wizard
      : COLORS.balanced;
    const badgeFill = state.advantage === "dragon"
      ? COLORS.dragonBadge
      : state.advantage === "wizard"
      ? COLORS.wizardBadge
      : COLORS.balancedBadge;
    // Ownership is carried by the full-height authored reel frame. Repeating
    // D/W/B here wastes the scarce physical pixels available in mini-player.
    this.#label.text = `${state.multiplier}×`;
    this.#applyFittedFontSize();
    this.#plate.clear();
    if (state.persistence === "sticky") {
      const width = PixiMultiplierView.BADGE_WIDTH;
      this.#plate
        .moveTo(5, 0)
        .lineTo(width - 5, 0)
        .lineTo(width, 5)
        .lineTo(width - 2, 18)
        .lineTo(width - 7, 24)
        .lineTo(7, 24)
        .lineTo(2, 18)
        .lineTo(0, 5)
        .closePath()
        .fill({ color: COLORS.void, alpha: 0.96 })
        .stroke({ color, width: 3, alpha: 0.98 })
        .moveTo(8, 4)
        .lineTo(width - 8, 4)
        .lineTo(width - 5, 8)
        .moveTo(5, 16)
        .lineTo(8, 20)
        .lineTo(width - 8, 20)
        .stroke({ color: badgeFill, width: 2, alpha: 0.95 })
        .moveTo(width / 2 - 3, 1)
        .lineTo(width / 2, 4)
        .lineTo(width / 2 + 3, 1)
        .stroke({ color: COLORS.gold, width: 1, alpha: 0.92 });
    } else {
      const width = PixiMultiplierView.BADGE_WIDTH;
      this.#plate
        .moveTo(0, 8)
        .lineTo(0, 0)
        .lineTo(16, 0)
        .moveTo(width - 16, 0)
        .lineTo(width, 0)
        .lineTo(width, 8)
        .moveTo(width, 16)
        .lineTo(width, 24)
        .lineTo(width - 16, 24)
        .moveTo(16, 24)
        .lineTo(0, 24)
        .lineTo(0, 16)
        .stroke({ color, width: 3, alpha: 0.95 });
    }
    if (!changed) return;
    const epoch = this.#animationEpoch;
    const startedAt = performance.now();
    const duration = state.persistence === "sticky" ? 180 : 130;
    this.container.alpha = 0;
    this.container.position.set(this.#baseX, this.#baseY - 3);
    const animate = (now: number): void => {
      if (epoch !== this.#animationEpoch) return;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      this.container.alpha = eased;
      this.container.position.set(this.#baseX, this.#baseY - 3 * (1 - eased));
      if (progress < 1) this.#animationFrame = scheduleAnimationFrame(animate);
      else this.#animationFrame = null;
    };
    this.#animationFrame = scheduleAnimationFrame(animate);
  }

  setFontSize(pixels: number): void {
    this.#requestedFontPixels = pixels;
    this.#applyFittedFontSize();
  }

  setEmphasized(emphasized: boolean, animated = false): void {
    this.#emphasisEpoch += 1;
    if (this.#emphasisFrame !== null) {
      stopAnimationFrame(this.#emphasisFrame);
      this.#emphasisFrame = null;
    }
    const target = emphasized ? 1.08 : 1;
    if (!animated) {
      this.#setEmphasisScale(target);
      return;
    }
    const epoch = this.#emphasisEpoch;
    const startedAt = performance.now();
    const start = this.container.scale.x;
    const animate = (now: number): void => {
      if (epoch !== this.#emphasisEpoch) return;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / 100));
      const eased = 1 - Math.pow(1 - progress, 3);
      this.#setEmphasisScale(start + (target - start) * eased);
      if (progress < 1) this.#emphasisFrame = scheduleAnimationFrame(animate);
      else this.#emphasisFrame = null;
    };
    this.#emphasisFrame = scheduleAnimationFrame(animate);
  }

  #setEmphasisScale(scale: number): void {
    this.container.scale.set(scale);
    this.container.position.set(
      this.#baseX - PixiMultiplierView.BADGE_WIDTH * (scale - 1) / 2,
      this.#baseY - 24 * (scale - 1) / 2,
    );
  }

  #applyFittedFontSize(): void {
    const characters = Math.max(1, this.#label.text.length);
    const availableWidth = PixiMultiplierView.BADGE_WIDTH - 8;
    const fitted = Math.floor(availableWidth / (characters * 0.62));
    this.#label.style.fontSize = Math.max(
      10,
      Math.min(this.#requestedFontPixels, fitted),
    );
  }

  destroy(): void {
    this.#animationEpoch += 1;
    this.#emphasisEpoch += 1;
    if (this.#animationFrame !== null) stopAnimationFrame(this.#animationFrame);
    if (this.#emphasisFrame !== null) stopAnimationFrame(this.#emphasisFrame);
    this.container.destroy({ children: true });
  }
}

function createText(
  parent: Container,
  text: string,
  x: number,
  y: number,
  anchor = 0.5,
): PixiTextView {
  const display = new Text({
    text,
    style: {
      fill: 0xd5e0e8,
      align: "center",
      fontFamily: "monospace",
      fontSize: 16,
      fontWeight: "700",
      stroke: { color: COLORS.void, width: 3 },
    },
  });
  display.anchor.set(anchor);
  display.position.set(x, y);
  parent.addChild(display);
  return new PixiTextView(display);
}

export function createWizardCraftPixiViewComponents(
  scene: WizardCraftPixiProductionScene,
): WizardCraftBrowserViewComponents {
  scene.containers.reels.position.set(
    WIZARD_CRAFT_REEL_DESIGN_RECT.x,
    WIZARD_CRAFT_REEL_DESIGN_RECT.y,
  );
  const cells = Array.from({ length: 20 }, () => new PixiSymbolCell(scene));
  for (const cell of cells) scene.containers.reels.addChild(cell.container);
  // Keep the single full-window divider overlay above the symbol sprites.
  scene.containers.reels.addChild(scene.sprite("reels.mask.1"));

  const overlays = Array.from({ length: 5 }, () => new PixiVsOverlay(scene));
  for (const overlay of overlays) {
    scene.containers.reels.addChild(overlay.container);
  }

  const dragonLight = new Graphics()
    .rect(0, 0, 320, 360)
    .fill({ color: COLORS.dragon, alpha: 1 });
  const wizardLight = new Graphics()
    .rect(320, 0, 320, 360)
    .fill({ color: COLORS.wizard, alpha: 1 });
  const balancedLight = new Graphics()
    .rect(160, 0, 320, 360)
    .fill({ color: COLORS.balanced, alpha: 1 });
  for (const light of [dragonLight, wizardLight, balancedLight]) {
    light.alpha = 0;
    light.blendMode = "add";
    scene.containers.cabinet.addChild(light);
  }
  const lighting: WizardCraftCabinetLighting = {
    setDragon: (intensity) => {
      dragonLight.alpha = intensity * 0.22;
    },
    setWizard: (intensity) => {
      wizardLight.alpha = intensity * 0.22;
    },
    setBalanced: (intensity) => {
      balancedLight.alpha = intensity * 0.18;
    },
  };

  const ui = scene.containers.ui;
  const text: WizardCraftCanvasUiTextViews = {
    mode: createText(ui, "READY", 320, 336),
    tier: createText(ui, "", 320, 38),
    spin: createText(ui, "", 320, 70),
    spinWin: createText(ui, "0.00×", 130, 330),
    totalWin: createText(ui, "0.00×", 510, 330),
    finalWin: createText(ui, "", 320, 310),
    maximum: createText(ui, "", 320, 118),
  };
  const multipliers = Array.from(
    { length: 5 },
    (_, reel) => new PixiMultiplierView(reel),
  );
  for (const multiplier of multipliers) ui.addChild(multiplier.container);

  return {
    reelCells: cells,
    reelOverlays: overlays,
    cabinetLighting: lighting,
    uiText: text,
    uiMultipliers: multipliers,
  };
}

export interface WizardCraftPixiSurface {
  readonly application: Application;
  readonly textureAdapter: typeof WIZARD_CRAFT_PIXI_TEXTURE_ADAPTER;
  readonly displayAdapter: typeof WIZARD_CRAFT_PIXI_DISPLAY_ADAPTER;
  mount(root: WizardCraftPixiJsContainer): () => void;
  createViewComponents(
    scene: WizardCraftPixiProductionScene,
  ): WizardCraftBrowserViewComponents;
  destroy(): void;
}

export async function createWizardCraftPixiSurface(
  host: HTMLElement,
  options: Partial<ApplicationOptions> = {},
): Promise<WizardCraftPixiSurface> {
  const application = new Application();
  await application.init({
    background: COLORS.void,
    antialias: false,
    resizeTo: host,
    ...options,
  });
  application.canvas.setAttribute("aria-label", "WIZARD CRAFT game canvas");
  host.append(application.canvas);
  let destroyed = false;
  let ambientInstalled = false;
  let ambientElapsed = 0;
  const ambientDecorations: Graphics[] = [];
  return Object.freeze({
    application,
    textureAdapter: WIZARD_CRAFT_PIXI_TEXTURE_ADAPTER,
    displayAdapter: WIZARD_CRAFT_PIXI_DISPLAY_ADAPTER,
    mount(root: WizardCraftPixiJsContainer): () => void {
      application.stage.addChild(root);
      return () => {
        if (root.parent === application.stage) application.stage.removeChild(root);
      };
    },
    createViewComponents(
      scene: WizardCraftPixiProductionScene,
    ): WizardCraftBrowserViewComponents {
      const components = createWizardCraftPixiViewComponents(scene);
      if (!ambientInstalled) {
        ambientInstalled = true;
        const fog = scene.sprite("environment.fog.low");
        const sparks = new Graphics();
        const embers = new Graphics();
        ambientDecorations.push(sparks);
        ambientDecorations.push(embers);
        scene.containers.wizard.addChild(sparks);
        scene.containers.dragon.addChild(embers);
        application.ticker.add((ticker) => {
          if (destroyed) return;
          sparks.clear();
          embers.clear();
          if (!fog.visible) {
            fog.x = 0;
            return;
          }
          ambientElapsed += ticker.deltaMS;
          fog.x = wizardCraftAmbientFogOffset(ambientElapsed);
          if (
            scene.sprite("wizard.idle").visible &&
            !scene.sprite("wizard.idle.static").visible
          ) {
            const frame = wizardCraftIdleSparkFrame(ambientElapsed);
            const points = [
              [548, 103], [569, 101], [575, 116],
              [564, 129], [543, 120], [557, 94],
            ] as const;
            for (const index of [frame, (frame + 2) % points.length]) {
              const [x, y] = points[index]!;
              sparks.rect(x, y, index === frame ? 2 : 1, index === frame ? 2 : 1)
                .fill({ color: index === frame ? 0xe8faff : 0x3dbfef, alpha: 0.9 });
            }
          }
          if (
            scene.sprite("dragon.idle").visible &&
            !scene.sprite("dragon.idle.static").visible
          ) {
            const frame = wizardCraftIdleEmberFrame(ambientElapsed);
            const points = [
              [149, 168], [156, 173], [160, 181],
              [155, 188], [166, 184], [162, 175],
            ] as const;
            for (const index of [frame, (frame + 3) % points.length]) {
              const [x, y] = points[index]!;
              embers.rect(x, y, index === frame ? 2 : 1, index === frame ? 2 : 1)
                .fill({ color: index === frame ? 0xffc45a : 0xe64b25, alpha: 0.88 });
            }
          }
        });
      }
      return components;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const decoration of ambientDecorations) {
        decoration.removeFromParent();
        decoration.destroy();
      }
      ambientDecorations.length = 0;
      application.destroy(true, {
        children: false,
        texture: false,
        textureSource: false,
      });
    },
  });
}
