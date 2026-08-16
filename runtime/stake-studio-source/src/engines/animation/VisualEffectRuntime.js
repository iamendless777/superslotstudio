import { Application, Assets, BlurFilter, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { compileVisualEffectRecipe, VISUAL_EFFECT_VIEWPORTS } from './VisualEffectRecipes.js';

const DESIGN_WIDTH = 640;
const DESIGN_HEIGHT = 360;
const clamp01 = value => Math.min(1, Math.max(0, value));
const easeOut = value => 1 - ((1 - clamp01(value)) ** 3);
const pulse = value => Math.sin(clamp01(value) * Math.PI);
const nodeProgress = (time, node) => clamp01((time - node.start) / Math.max(node.duration, 0.001));
const visibleAt = (time, node) => time >= node.start && time <= node.start + node.duration;

// Pixi v8's WebGL batch pool is shared by every Application in the page. The
// Preview runs independent Spine and VFX applications, so destroying either
// renderer while the other is alive can invalidate pooled batches still used by
// the survivor. Stop and detach retired applications; the browser releases the
// complete page-owned pool when the Studio tab closes.
function retirePixiApplication(app, tick = null) {
  if (!app) return;
  const ticker = app.ticker;
  try { ticker?.remove?.(tick); } catch { /* already detached */ }
  try { ticker?.stop?.(); } catch { /* already stopped */ }
  try { app.ticker = null; } catch { /* already detached */ }
  try { app.canvas?.remove?.(); } catch { /* already detached */ }
  const retired = globalThis.__stakeStudioRetiredPixiApps ||= [];
  retired.push({ app, ticker });
}

function applyBlend(displayObject, blendMode = 'normal') {
  displayObject.blendMode = blendMode;
  return displayObject;
}

function makeCircle(radius, color, alpha = 1) {
  return new Graphics().circle(0, 0, radius).fill({ color, alpha });
}

export class VisualEffectRuntime {
  constructor({ onFrame = null } = {}) {
    this.onFrame = onFrame;
    this.viewport = 'desktop';
    this.motion = 'full';
    this.generation = 0;
    this.destroyed = false;
    this.elapsed = 0;
    this.playing = false;
    this.scene = null;
    this.current = null;
    this.energyTap = null;
    this.ambientEnergy = null;
    this.ambientElapsed = 0;
    this.presentationEnergy = null;
    this.presentationElapsed = 0;
    this.motionAssets = new Map();
    this.motionTextures = new Map();
    this.motionLoads = new Map();
    this.motionLoadErrors = new Map();
    this.timelineFlipbooks = [];
    this.ambientFlipbooks = [];
    this.symbolFlipbooks = [];
    this.energyTapFlipbooks = [];
    this.presentationFlipbooks = [];
    this.motionElapsed = 0;
    this.lastMilestone = null;
    this._tick = ticker => this.tick(ticker.deltaMS / 1000);
  }

  async mount(element, {
    viewport = 'desktop', width = null, height = null, sceneMode = 'showcase', motionAssets = [], eagerMotionAssets = true,
  } = {}) {
    this.destroy();
    this.destroyed = false;
    const generation = ++this.generation;
    // Preview viewport changes destroy one Pixi renderer and mount the next in
    // immediate succession. Let the prior runtime's deferred GPU release finish
    // before initializing another WebGL context in the same DOM slot.
    await new Promise(resolve => setTimeout(resolve, 96));
    if (this.destroyed || generation !== this.generation) return false;
    this.element = element;
    this.viewport = Object.hasOwn(VISUAL_EFFECT_VIEWPORTS, viewport) ? viewport : 'desktop';
    this.sceneMode = sceneMode === 'overlay' ? 'overlay' : 'showcase';
    const spec = VISUAL_EFFECT_VIEWPORTS[this.viewport];
    const stageWidth = Math.max(1, Math.round(Number(width) || spec.width));
    const stageHeight = Math.max(1, Math.round(Number(height) || spec.height));
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;
    // Overlay effects are glow-heavy and deliberately soft. Render them at the
    // 640px design resolution and let CSS composite the canvas over the full
    // cabinet; this removes 75% of the per-frame pixels on a 1280px stage.
    const overlayScale = this.sceneMode === 'overlay' ? Math.min(1, DESIGN_WIDTH / stageWidth) : 1;
    const surfaceWidth = Math.max(1, Math.round(stageWidth * overlayScale));
    const surfaceHeight = Math.max(1, Math.round(stageHeight * overlayScale));
    const resolution = this.sceneMode === 'overlay'
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);
    const app = new Application();
    await app.init({
      width: surfaceWidth,
      height: surfaceHeight,
      autoStart: false,
      background: '#050713',
      backgroundAlpha: this.sceneMode === 'overlay' ? 0 : 1,
      antialias: this.sceneMode !== 'overlay',
      autoDensity: true,
      resolution,
      preference: 'webgl',
      preserveDrawingBuffer: this.sceneMode === 'overlay',
      powerPreference: 'high-performance',
    });
    if (this.destroyed || generation !== this.generation) {
      retirePixiApplication(app);
      return false;
    }
    this.app = app;
    app.canvas.className = 'visual-lab-canvas';
    app.canvas.style.setProperty('width', '100%', 'important');
    app.canvas.style.setProperty('height', '100%', 'important');
    app.canvas.setAttribute('aria-label', 'Real-time Pixi WebGL visual effect preview');
    element.replaceChildren(app.canvas);
    this.buildScene();
    this.resizeSurface(surfaceWidth, surfaceHeight);
    await this.configureMotionAssets(motionAssets, { preload: eagerMotionAssets });
    if (this.destroyed || generation !== this.generation) return false;
    app.ticker.add(this._tick);
    // The overlay is transparent while idle. Rendering it continuously wastes
    // a full-canvas WebGL frame on every browser tick and competes with reel,
    // symbol, and CSS animation work. Wake the renderer only for live effects.
    app.stop();
    // A transparent overlay does not need a blank bootstrap render. Skipping it
    // also avoids entering Pixi while the prior panel renderer is completing its
    // deferred GPU release during rapid Preview remounts.
    if (this.sceneMode !== 'overlay') app.render();
    return true;
  }

  buildScene() {
    const app = this.app;
    const blurQuality = this.sceneMode === 'overlay' ? 1 : 3;
    const scene = {
      root: new Container(),
      backdrop: new Container(),
      world: new Container(),
      underlay: new Container(),
      motionUnderlay: new Container(),
      effects: new Container(),
      motionEffects: new Container(),
      overlay: new Container(),
      motionOverlay: new Container(),
      post: new Container(),
    };
    scene.root.addChild(
      scene.backdrop,
      scene.world,
      scene.underlay,
      scene.motionUnderlay,
      scene.effects,
      scene.motionEffects,
      scene.overlay,
      scene.motionOverlay,
      scene.post,
    );
    app.stage.addChild(scene.root);
    this.scene = scene;
    if (this.sceneMode === 'showcase') {
      const background = new Graphics()
        .roundRect(18, 22, 604, 316, 22)
        .fill({ color: '#090d20', alpha: 1 })
        .stroke({ color: '#273364', width: 2, alpha: 0.8 });
      scene.backdrop.addChild(background);

      const floor = new Graphics();
      for (let index = 0; index < 11; index++) {
        const x = 42 + index * 56;
        floor.moveTo(x, 52).lineTo(x, 310).stroke({ color: '#31426f', width: 1, alpha: index % 2 ? 0.08 : 0.16 });
      }
      for (let index = 0; index < 6; index++) {
        const y = 66 + index * 46;
        floor.moveTo(42, y).lineTo(598, y).stroke({ color: '#31426f', width: 1, alpha: 0.11 });
      }
      scene.backdrop.addChild(floor);

      const reelBed = new Graphics()
        .roundRect(228, 92, 322, 176, 18)
        .fill({ color: '#0d1430', alpha: 0.92 })
        .stroke({ color: '#6a75b8', width: 2, alpha: 0.48 });
      scene.world.addChild(reelBed);
      for (let column = 0; column < 5; column++) {
        const cell = new Graphics()
          .roundRect(242 + column * 59, 111, 48, 138, 10)
          .fill({ color: column === 4 ? '#251747' : '#121b3b', alpha: 0.96 })
          .stroke({ color: column === 4 ? '#ad6cff' : '#384b83', width: 1.5, alpha: 0.65 });
        scene.world.addChild(cell);
      }
    }

    scene.casterCore = applyBlend(makeCircle(24, '#78f7ff', 0.95), 'add');
    scene.casterCore.position.set(132, 180);
    scene.casterGlow = applyBlend(makeCircle(54, '#5be6ff', 0.22), 'add');
    scene.casterGlow.position.set(132, 180);
    if (this.sceneMode !== 'overlay') scene.casterGlow.filters = [new BlurFilter({ strength: 15, quality: blurQuality })];
    scene.world.addChild(scene.casterGlow, scene.casterCore);

    scene.targetCore = applyBlend(makeCircle(20, '#ad6cff', 0.85), 'add');
    scene.targetCore.position.set(512, 180);
    scene.targetGlow = applyBlend(makeCircle(46, '#8d4dff', 0.24), 'add');
    scene.targetGlow.position.set(512, 180);
    if (this.sceneMode !== 'overlay') scene.targetGlow.filters = [new BlurFilter({ strength: 12, quality: blurQuality })];
    scene.world.addChild(scene.targetGlow, scene.targetCore);
    if (this.sceneMode === 'overlay') {
      scene.casterCore.visible = false;
      scene.targetCore.visible = false;
    }

    scene.orbitA = applyBlend(new Graphics().circle(0, 0, 46).stroke({ color: '#78f7ff', width: 2, alpha: 0.72 }), 'add');
    scene.orbitB = applyBlend(new Graphics().ellipse(0, 0, 64, 24).stroke({ color: '#ad6cff', width: 2, alpha: 0.65 }), 'add');
    scene.orbitA.position.set(132, 180);
    scene.orbitB.position.set(132, 180);
    scene.underlay.addChild(scene.orbitA, scene.orbitB);

    scene.launchFlare = applyBlend(new Graphics(), 'add');
    scene.trail = applyBlend(new Graphics(), 'add');
    scene.projectileGlow = applyBlend(makeCircle(18, '#78f7ff', 0.36), 'add');
    if (this.sceneMode !== 'overlay') scene.projectileGlow.filters = [new BlurFilter({ strength: 11, quality: blurQuality })];
    scene.projectileCore = applyBlend(makeCircle(7, '#ffffff', 0.98), 'add');
    scene.effects.addChild(scene.launchFlare, scene.trail, scene.projectileGlow, scene.projectileCore);

    scene.shockwave = applyBlend(new Graphics(), 'add');
    scene.impactGlow = applyBlend(makeCircle(70, '#ad6cff', 0.26), 'add');
    scene.impactGlow.position.set(512, 180);
    if (this.sceneMode !== 'overlay') scene.impactGlow.filters = [new BlurFilter({ strength: 18, quality: blurQuality })];
    scene.overlay.addChild(scene.impactGlow, scene.shockwave);

    scene.particles = new Container();
    scene.overlay.addChild(scene.particles);
    scene.ambientEnergy = new Container();
    scene.symbolMotion = new Container();
    scene.presentationEnergy = new Container();
    scene.presentationAura = applyBlend(new Graphics(), 'add');
    scene.presentationEnergy.addChild(scene.presentationAura);
    scene.energyTap = applyBlend(new Graphics(), 'add');
    scene.effects.addChildAt(scene.ambientEnergy, 0);
    scene.effects.addChild(scene.symbolMotion);
    scene.overlay.addChild(scene.energyTap, scene.presentationEnergy);
    scene.grade = new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: '#b965ff', alpha: 1 });
    scene.grade.blendMode = 'screen';
    scene.post.addChild(scene.grade);
    this.resetVisuals();
  }

  resize(viewport = this.viewport) {
    if (!this.app || this.sceneMode === 'overlay' || !Object.hasOwn(VISUAL_EFFECT_VIEWPORTS, viewport)) return;
    this.viewport = viewport;
    const spec = VISUAL_EFFECT_VIEWPORTS[viewport];
    this.resizeSurface(spec.width, spec.height);
  }

  resizeSurface(width, height) {
    if (!this.app || !this.scene) return;
    this.app.renderer.resize(width, height);
    const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    this.scene.root.scale.set(scale);
    this.scene.root.position.set((width - DESIGN_WIDTH * scale) / 2, (height - DESIGN_HEIGHT * scale) / 2);
  }

  stageRectToDesign(rect = {}) {
    if (!this.app || !this.scene) return null;
    const surfaceWidth = this.app.screen?.width || this.stageWidth || DESIGN_WIDTH;
    const surfaceHeight = this.app.screen?.height || this.stageHeight || DESIGN_HEIGHT;
    const rootScaleX = this.scene.root.scale.x || 1;
    const rootScaleY = this.scene.root.scale.y || 1;
    const x = ((Number(rect.x) || 0) * surfaceWidth / this.stageWidth - this.scene.root.position.x) / rootScaleX;
    const y = ((Number(rect.y) || 0) * surfaceHeight / this.stageHeight - this.scene.root.position.y) / rootScaleY;
    return {
      x,
      y,
      width: Math.max(1, (Number(rect.width) || 1) * surfaceWidth / this.stageWidth / rootScaleX),
      height: Math.max(1, (Number(rect.height) || 1) * surfaceHeight / this.stageHeight / rootScaleY),
    };
  }

  async configureMotionAssets(assets = [], { preload = true } = {}) {
    this.motionAssets.clear();
    this.motionLoads.clear();
    this.motionLoadErrors.clear();
    for (const asset of Array.isArray(assets) ? assets : []) {
      if (!String(asset?.id || '').trim() || !String(asset?.src || '').trim()) continue;
      this.motionAssets.set(asset.id, {
        columns: 4,
        rows: 4,
        frames: 16,
        fps: 24,
        loop: false,
        blendMode: 'add',
        ...asset,
      });
    }
    if (preload) await this.preloadMotionAssets();
  }

  async loadMotionAsset(asset) {
    if (!asset || this.motionTextures.has(asset.id)) return this.motionTextures.get(asset?.id) || null;
    if (this.motionLoads.has(asset.id)) return this.motionLoads.get(asset.id);
    const generation = this.generation;
    const loading = (async () => {
      try {
        const atlasTexture = await Assets.load(asset.src);
        if (this.destroyed || generation !== this.generation) return null;
        const columns = Math.max(1, Math.floor(Number(asset.columns) || 1));
        const rows = Math.max(1, Math.floor(Number(asset.rows) || 1));
        const frameCount = Math.max(1, Math.min(columns * rows, Math.floor(Number(asset.frames) || columns * rows)));
        const frameWidth = Math.floor(atlasTexture.width / columns);
        const frameHeight = Math.floor(atlasTexture.height / rows);
        const textures = Array.from({ length: frameCount }, (_, index) => new Texture({
          source: atlasTexture.source,
          frame: new Rectangle((index % columns) * frameWidth, Math.floor(index / columns) * frameHeight, frameWidth, frameHeight),
        }));
        const loaded = { asset, atlasTexture, textures, frameWidth, frameHeight };
        this.motionTextures.set(asset.id, loaded);
        this.motionLoadErrors.delete(asset.id);
        return loaded;
      } catch (error) {
        this.motionLoadErrors.set(asset.id, error?.message || String(error));
        return null;
      } finally {
        this.motionLoads.delete(asset.id);
      }
    })();
    this.motionLoads.set(asset.id, loading);
    return loading;
  }

  async preloadMotionAssets(assetIds = null) {
    const ids = assetIds == null
      ? [...this.motionAssets.keys()]
      : [...new Set((Array.isArray(assetIds) ? assetIds : [assetIds]).filter(Boolean))];
    return Promise.all(ids.map(id => this.loadMotionAsset(this.motionAssets.get(id))));
  }

  motionContainer(layer = 'effects') {
    if (layer === 'underlay') return this.scene?.motionUnderlay;
    if (layer === 'symbol') return this.scene?.symbolMotion;
    if (layer === 'overlay' || layer === 'post') return this.scene?.motionOverlay;
    return this.scene?.motionEffects;
  }

  createFlipbook(assetId, options = {}) {
    const loaded = this.motionTextures.get(assetId);
    const container = this.motionContainer(options.layer);
    if (!loaded || !container) return null;
    const sprite = applyBlend(new Sprite(loaded.textures[0]), options.blendMode || loaded.asset.blendMode || 'add');
    const anchorX = Number.isFinite(Number(options.anchorX)) ? Number(options.anchorX) : 0.5;
    const anchorY = Number.isFinite(Number(options.anchorY)) ? Number(options.anchorY) : 0.5;
    sprite.anchor.set(anchorX, anchorY);
    sprite.position.set(Number(options.x) || 0, Number(options.y) || 0);
    const width = Math.max(1, Number(options.width || options.size || loaded.asset.width) || loaded.frameWidth);
    const height = Math.max(1, Number(options.height || options.size || loaded.asset.height) || width * loaded.frameHeight / loaded.frameWidth);
    sprite.width = width;
    sprite.height = height;
    sprite.rotation = Number(options.rotation) || 0;
    sprite.alpha = Number.isFinite(Number(options.alpha)) ? Number(options.alpha) : 1;
    sprite.visible = false;
    container.addChild(sprite);
    const blendSprite = options.interpolate ? applyBlend(new Sprite(loaded.textures[1] || loaded.textures[0]), options.blendMode || loaded.asset.blendMode || 'add') : null;
    if (blendSprite) {
      blendSprite.anchor.set(anchorX, anchorY);
      blendSprite.position.copyFrom(sprite.position);
      blendSprite.width = width;
      blendSprite.height = height;
      blendSprite.rotation = sprite.rotation;
      blendSprite.alpha = 0;
      blendSprite.visible = false;
      container.addChild(blendSprite);
    }
    const clip = options.clip && typeof options.clip === 'object' ? options.clip : null;
    let mask = null;
    if (clip) {
      const clipWidth = Math.max(1, Number(clip.width) || width);
      const clipHeight = Math.max(1, Number(clip.height) || height);
      const radius = Math.max(0, Math.min(clipWidth / 2, clipHeight / 2, Number(clip.radius) || clipWidth / 2));
      mask = new Graphics()
        .roundRect(-clipWidth / 2, -clipHeight / 2, clipWidth, clipHeight, radius)
        .fill({ color: 0xffffff, alpha: 1 });
      mask.position.set(Number(clip.x) || sprite.position.x, Number(clip.y) || sprite.position.y);
      container.addChild(mask);
      sprite.mask = mask;
      if (blendSprite) blendSprite.mask = mask;
    }
    return {
      assetId,
      sprite,
      blendSprite,
      mask,
      textures: loaded.textures,
      // Ambient plates deliberately run below one source frame per second.
      // Interpolation keeps those long transitions fluid instead of making a
      // tranquil fog loop race through its authored sheet.
      fps: Math.max(0.1, Number(options.fps || loaded.asset.fps) || 24),
      loop: options.loop ?? loaded.asset.loop ?? false,
      start: Math.max(0, Number(options.start) || 0),
      duration: Math.max(0.001, Number(options.duration) || loaded.textures.length / Math.max(0.1, Number(options.fps || loaded.asset.fps) || 24)),
      alpha: sprite.alpha,
      phase: Math.max(0, Number(options.phase) || 0),
      fadeIn: Math.max(0, Number(options.fadeIn) || 0),
      fadeOut: Math.max(0, Number(options.fadeOut) || 0),
      semanticFrame: Math.max(0, Math.min(loaded.textures.length - 1, Math.floor(Number(options.semanticFrame) || loaded.textures.length * 0.55))),
      follow: options.follow || null,
      interpolate: Boolean(options.interpolate),
      ambientMotion: options.motion && typeof options.motion === 'object' ? options.motion : null,
      baseTransform: {
        x: sprite.position.x,
        y: sprite.position.y,
        rotation: sprite.rotation,
        scaleX: sprite.scale.x,
        scaleY: sprite.scale.y,
      },
      meta: options.meta || null,
    };
  }

  destroyFlipbooks(books = [], { defer = false } = {}) {
    const retired = [];
    for (const book of books) {
      const sprite = book?.sprite;
      if (!sprite) continue;
      sprite.visible = false;
      sprite.removeFromParent();
      retired.push(sprite);
      if (book.blendSprite) {
        book.blendSprite.visible = false;
        book.blendSprite.removeFromParent();
        retired.push(book.blendSprite);
      }
      if (book.mask) {
        book.mask.removeFromParent();
        retired.push(book.mask);
      }
    }
    books.length = 0;
    const release = () => retired.forEach(sprite => {
      if (!sprite.destroyed) sprite.destroy();
    });
    // Pixi can retain a removed sprite in the current render instruction batch
    // until the next frame. Nulling its geometry immediately creates a rare
    // cleanup crash when a preview is replayed just after viewport profiling.
    if (defer && retired.length) setTimeout(release, 50);
    else release();
  }

  setFlipbookFrame(book, index) {
    if (!book?.sprite || !book.textures.length) return;
    const safeIndex = Math.max(0, Math.min(book.textures.length - 1, Math.floor(index) || 0));
    if (book.sprite.texture !== book.textures[safeIndex]) book.sprite.texture = book.textures[safeIndex];
  }

  applyAmbientFlipbookMotion(book, time) {
    const motion = book?.ambientMotion;
    const base = book?.baseTransform;
    if (!motion || !base) return;
    const duration = Math.max(2, Number(motion.duration) || 10);
    const phase = Number(motion.phase) || 0;
    const angle = time * Math.PI * 2 / duration + phase;
    const sway = Math.sin(angle);
    const secondary = Math.sin(angle * 0.57 + 1.31);
    const x = base.x + sway * (Number(motion.swayX) || 0) + secondary * (Number(motion.driftX) || 0);
    const y = base.y + secondary * (Number(motion.swayY) || 0);
    const rotation = base.rotation + sway * (Number(motion.rotation) || 0) * Math.PI / 180;
    const scaleX = base.scaleX * (1 + secondary * (Number(motion.scaleX) || 0));
    const scaleY = base.scaleY * (1 + sway * (Number(motion.scaleY) || 0));
    for (const sprite of [book.sprite, book.blendSprite]) {
      if (!sprite) continue;
      sprite.position.set(x, y);
      sprite.rotation = rotation;
      sprite.scale.set(scaleX, scaleY);
    }
  }

  renderFlipbook(book, time, { forceSemantic = false } = {}) {
    if (!book?.sprite) return;
    const local = time - book.start + book.phase;
    const within = local >= 0 && (book.loop || local <= book.duration);
    book.sprite.visible = within;
    if (book.blendSprite) book.blendSprite.visible = within && !forceSemantic;
    if (!within) return;
    const frameProgress = book.loop
      ? Math.max(0, local * book.fps)
      : Math.max(0, local) / book.duration * book.textures.length;
    const frame = forceSemantic ? book.semanticFrame
      : book.loop ? Math.floor(frameProgress) % book.textures.length
        : Math.min(book.textures.length - 1, Math.floor(frameProgress));
    this.setFlipbookFrame(book, frame);
    this.applyAmbientFlipbookMotion(book, time);
    const fadeIn = book.fadeIn > 0 ? clamp01(local / book.fadeIn) : 1;
    const fadeOut = !book.loop && book.fadeOut > 0 ? clamp01((book.duration - local) / book.fadeOut) : 1;
    const opacity = book.alpha * Math.min(fadeIn, fadeOut);
    if (book.interpolate && book.blendSprite && !forceSemantic) {
      const nextFrame = book.loop ? (frame + 1) % book.textures.length : Math.min(book.textures.length - 1, frame + 1);
      if (book.blendSprite.texture !== book.textures[nextFrame]) book.blendSprite.texture = book.textures[nextFrame];
      const mix = frameProgress - Math.floor(frameProgress);
      book.sprite.alpha = opacity * (1 - mix);
      book.blendSprite.alpha = opacity * mix;
    } else {
      book.sprite.alpha = opacity;
      if (book.blendSprite) book.blendSprite.alpha = 0;
    }
  }

  prepareTimelineFlipbooks(compiled) {
    this.destroyFlipbooks(this.timelineFlipbooks);
    for (const node of compiled?.nodes || []) {
      if (!node.motionAssetId) continue;
      const anchor = node.anchor === 'origin' ? compiled.origin
        : node.anchor === 'center' ? { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 }
          : compiled.target;
      const book = this.createFlipbook(node.motionAssetId, {
        layer: node.layer,
        blendMode: node.blendMode,
        x: Number(node.x) || anchor.x,
        y: Number(node.y) || anchor.y,
        width: node.width,
        height: node.height,
        size: node.size || 150,
        rotation: node.rotation,
        alpha: node.alpha ?? Math.min(1, Number(node.strength) || 1),
        fps: node.fps,
        loop: node.loop,
        start: node.start,
        duration: node.duration,
        fadeIn: node.fadeIn ?? 0.08,
        fadeOut: node.fadeOut ?? 0.18,
        semanticFrame: node.semanticFrame,
        follow: node.follow,
      });
      if (book) this.timelineFlipbooks.push(book);
    }
  }

  enableAmbientFlipbooks(instances = [], { reducedMotion = false } = {}) {
    this.destroyFlipbooks(this.ambientFlipbooks);
    this.motionElapsed = 0;
    for (const options of Array.isArray(instances) ? instances : []) {
      const book = this.createFlipbook(options.assetId, {
        ...options,
        loop: true,
        start: 0,
        fps: reducedMotion ? Math.min(6, Number(options.fps) || 8) : options.fps,
      });
      if (book) this.ambientFlipbooks.push(book);
    }
    if (this.ambientFlipbooks.length) this.app?.start();
    return this.ambientFlipbooks.length;
  }

  enableSymbolFlipbooks(instances = [], { reducedMotion = false } = {}) {
    this.destroyFlipbooks(this.symbolFlipbooks, { defer: true });
    for (const options of Array.isArray(instances) ? instances : []) {
      const book = this.createFlipbook(options.assetId, {
        ...options,
        layer: 'symbol',
        loop: true,
        start: 0,
        interpolate: options.interpolate !== false,
        fps: reducedMotion ? Math.min(5, Number(options.fps) || 8) : options.fps,
      });
      if (book) this.symbolFlipbooks.push(book);
    }
    if (this.symbolFlipbooks.length) this.app?.start();
    else this.app?.render();
    return this.symbolFlipbooks.length;
  }

  clearSymbolFlipbooks() {
    this.destroyFlipbooks(this.symbolFlipbooks, { defer: true });
    if (!this.hasPersistentMotion()) this.app?.stop();
    this.app?.render();
  }

  hasPersistentMotion() {
    return Boolean(this.ambientEnergy || this.ambientFlipbooks.length || this.symbolFlipbooks.length);
  }

  renderMotionGraphics(deltaSeconds) {
    this.motionElapsed += Math.min(deltaSeconds, 0.05);
    for (const book of this.ambientFlipbooks) this.renderFlipbook(book, this.motionElapsed);
    for (const book of this.symbolFlipbooks) this.renderFlipbook(book, this.motionElapsed);
    for (const book of this.timelineFlipbooks) this.renderFlipbook(book, this.elapsed, { forceSemantic: this.motion === 'none' });
  }

  resetVisuals() {
    if (!this.scene) return;
    const scene = this.scene;
    scene.world.position.set(0, 0);
    scene.world.rotation = 0;
    scene.projectileCore.visible = false;
    scene.projectileGlow.visible = false;
    scene.launchFlare.clear();
    scene.trail.clear();
    scene.shockwave.clear();
    scene.particles.removeChildren().forEach(child => child.destroy());
    scene.impactGlow.alpha = 0;
    scene.grade.alpha = 0;
    scene.casterGlow.alpha = this.sceneMode === 'overlay' ? 0 : 0.22;
    scene.targetGlow.alpha = this.sceneMode === 'overlay' ? 0 : 0.24;
    scene.orbitA.visible = this.sceneMode !== 'overlay';
    scene.orbitB.visible = this.sceneMode !== 'overlay';
    scene.orbitA.rotation = 0;
    scene.orbitB.rotation = 0;
  }

  toDesignPoint(point = {}) {
    return {
      x: (Number(point.x) || 0) * DESIGN_WIDTH / Math.max(1, this.stageWidth || DESIGN_WIDTH),
      y: (Number(point.y) || 0) * DESIGN_HEIGHT / Math.max(1, this.stageHeight || DESIGN_HEIGHT),
    };
  }

  enableAmbientEnergy({ points = [], color = '#55d6f2', count = 18, reducedMotion = false } = {}) {
    if (!this.scene || !Array.isArray(points) || points.length === 0) return;
    const anchors = points.map(point => ({
      ...this.toDesignPoint(point),
      radius: Math.max(6, Number(point.radius) || 34) * DESIGN_WIDTH / Math.max(1, this.stageWidth || DESIGN_WIDTH),
      driftY: Math.max(0, Number(point.driftY) || 0) * DESIGN_HEIGHT / Math.max(1, this.stageHeight || DESIGN_HEIGHT),
    }));
    const particles = [];
    this.scene.ambientEnergy.removeChildren().forEach(child => child.destroy());
    const total = Math.max(6, Math.min(32, Math.round(Number(count) || 18)));
    for (let index = 0; index < total; index++) {
      const anchor = anchors[index % anchors.length];
      const phase = (index * 2.399963229728653) % (Math.PI * 2);
      const radius = 0.7 + (index % 4) * 0.42;
      const graphic = applyBlend(makeCircle(radius, color, 0.8), 'add');
      graphic.__energy = {
        anchor,
        phase,
        orbit: anchor.radius * (0.32 + ((index * 17) % 41) / 100),
        speed: (reducedMotion ? 0.18 : 0.42) + (index % 5) * 0.055,
        lift: anchor.radius * (0.18 + (index % 3) * 0.08),
      };
      particles.push(graphic);
      this.scene.ambientEnergy.addChild(graphic);
    }
    this.ambientEnergy = { particles, reducedMotion };
    this.app?.start();
  }

  renderAmbientEnergy(deltaSeconds) {
    if (!this.ambientEnergy) return;
    this.ambientElapsed += Math.min(deltaSeconds, 0.05);
    for (const [index, graphic] of this.ambientEnergy.particles.entries()) {
      const particle = graphic.__energy;
      const time = this.ambientElapsed * particle.speed + particle.phase;
      const driftProgress = particle.anchor.driftY
        ? (this.ambientElapsed * particle.speed * 0.34 + index / this.ambientEnergy.particles.length) % 1
        : 0;
      graphic.position.set(
        particle.anchor.x + Math.cos(time) * particle.orbit,
        particle.anchor.y
          + (particle.anchor.driftY ? driftProgress * particle.anchor.driftY - particle.anchor.driftY * 0.08 : 0)
          + Math.sin(time * 1.37) * particle.lift * (particle.anchor.driftY ? 0.28 : 1)
          - Math.sin(time * 0.53) * particle.lift * 0.45,
      );
      const driftFade = particle.anchor.driftY ? Math.sin(driftProgress * Math.PI) : 1;
      graphic.alpha = ((this.ambientEnergy.reducedMotion ? 0.16 : 0.18) + (Math.sin(time * 2.1 + index) + 1) * 0.12) * driftFade;
      graphic.scale.set(0.72 + (Math.sin(time * 1.8) + 1) * 0.22);
    }
  }

  enablePresentationEnergy({ points = [], color = '#55d6f2', coreColor = '#ffffff', count = 18, reducedMotion = false, motionAssetId = null, motionDuration = 1, motionFps = null, motionPlacement = null } = {}) {
    if (!this.scene || (!motionAssetId && (!Array.isArray(points) || points.length === 0))) return false;
    this.destroyFlipbooks(this.presentationFlipbooks, { defer: true });
    const authored = motionAssetId ? this.createFlipbook(motionAssetId, {
      layer: 'overlay', blendMode: 'screen', x: Number(motionPlacement?.x) || DESIGN_WIDTH / 2, y: Number(motionPlacement?.y) || DESIGN_HEIGHT * 0.52,
      width: Number(motionPlacement?.width) || 430, height: Number(motionPlacement?.height) || 330, loop: false,
      fps: reducedMotion ? 6 : motionFps,
      duration: Math.max(0.5, Number(motionDuration) || 1),
      fadeIn: 0.08, fadeOut: 0.14, alpha: reducedMotion ? Math.min(.6, Number(motionPlacement?.alpha) || .6) : Number(motionPlacement?.alpha) || 0.9,
      semanticFrame: 9,
    }) : null;
    if (authored) this.presentationFlipbooks.push(authored);
    const anchors = points.map(point => ({
      ...this.toDesignPoint(point),
      radius: Math.max(5, Number(point.radius) || 28) * DESIGN_WIDTH / Math.max(1, this.stageWidth || DESIGN_WIDTH),
      driftY: (Number(point.driftY) || 0) * DESIGN_HEIGHT / Math.max(1, this.stageHeight || DESIGN_HEIGHT),
    }));
    const container = this.scene.presentationEnergy;
    while (container.children.length > 1) container.removeChildAt(1).destroy();
    const particles = [];
    const total = authored ? 0 : Math.max(8, Math.min(32, Math.round(Number(count) || 18)));
    for (let index = 0; index < total; index++) {
      const anchor = anchors[index % anchors.length];
      const particle = applyBlend(makeCircle(0.65 + (index % 3) * 0.28, index % 5 === 0 ? coreColor : color, 0.72), 'add');
      particle.__presentationEnergy = {
        anchor,
        phase: (index * 2.399963229728653) % (Math.PI * 2),
        orbit: anchor.radius * (0.28 + ((index * 13) % 47) / 100),
        speed: (reducedMotion ? 0.16 : 0.48) + (index % 5) * 0.06,
      };
      particles.push(particle);
      container.addChild(particle);
    }
    this.presentationEnergy = { anchors, particles, color, coreColor, reducedMotion, authored: Boolean(authored) };
    this.presentationElapsed = 0;
    this.scene.ambientEnergy.visible = false;
    this.app?.start();
    return true;
  }

  disablePresentationEnergy() {
    if (!this.scene) return;
    this.presentationEnergy = null;
    this.scene.presentationAura.clear();
    while (this.scene.presentationEnergy.children.length > 1) this.scene.presentationEnergy.removeChildAt(1).destroy();
    this.destroyFlipbooks(this.presentationFlipbooks, { defer: true });
    this.scene.ambientEnergy.visible = true;
  }

  renderPresentationEnergy(deltaSeconds) {
    const effect = this.presentationEnergy;
    const aura = this.scene?.presentationAura;
    if (!effect || !aura) return;
    this.presentationElapsed += Math.min(deltaSeconds, 0.05);
    const elapsed = this.presentationElapsed;
    for (const book of this.presentationFlipbooks) this.renderFlipbook(book, elapsed, { forceSemantic: effect.reducedMotion });
    aura.clear();
    if (effect.authored) return;
    effect.anchors.forEach((anchor, index) => {
      const breathe = effect.reducedMotion ? 0.5 : (Math.sin(elapsed * 2.15 + index * 1.7) + 1) * 0.5;
      aura.circle(anchor.x, anchor.y, 3 + anchor.radius * (0.13 + breathe * 0.08))
        .fill({ color: effect.color, alpha: 0.025 + breathe * 0.035 });
      aura.circle(anchor.x, anchor.y, 1.1 + breathe * 0.8)
        .fill({ color: effect.coreColor, alpha: 0.18 + breathe * 0.18 });
    });
    effect.particles.forEach((graphic, index) => {
      const particle = graphic.__presentationEnergy;
      const time = elapsed * particle.speed + particle.phase;
      const progress = particle.anchor.driftY
        ? (elapsed * particle.speed * 0.27 + index / effect.particles.length) % 1
        : 0;
      graphic.position.set(
        particle.anchor.x + Math.cos(time) * particle.orbit,
        particle.anchor.y + Math.sin(time * 1.23) * particle.orbit * 0.34 + particle.anchor.driftY * progress,
      );
      const driftFade = particle.anchor.driftY ? Math.sin(progress * Math.PI) : 1;
      graphic.alpha = (0.16 + (Math.sin(time * 2.4) + 1) * 0.17) * driftFade;
      graphic.scale.set(0.72 + (Math.sin(time * 1.6) + 1) * 0.24);
    });
  }

  playEnergyTaps(points = [], {
    color = '#62e7ff', coreColor = '#ffffff', rimColor = '#d6a84b', origin = null,
    groups = null, launchDuration = 0.3, launchHold = 0.04, hopDuration = 0.11,
    messengerSize = 32, impactSize = 30, impactAlpha = 0.58,
    routeWidth = 7.5, routeAlpha = 1, messengerRadius = 13, impactRadius = 25,
    reducedMotion = false, messengerAssetId = null, impactAssetId = null,
  } = {}) {
    if (!this.scene || !Array.isArray(points) || points.length === 0) return null;
    const sourceGroups = Array.isArray(groups) && groups.some(group => Array.isArray(group) && group.length)
      ? groups.filter(group => Array.isArray(group) && group.length)
      : [points];
    const designGroups = sourceGroups.map(group => group.map(point => this.toDesignPoint(point)));
    const designPoints = designGroups.flat();
    const designOrigin = origin ? this.toDesignPoint(origin) : null;
    const safeHopDuration = reducedMotion ? 0.08 : Math.max(0.08, Math.min(0.16, Number(hopDuration) || 0.11));
    const launchTime = Math.max(0.18, Number(launchDuration) || 0.3);
    const safeLaunchHold = designOrigin ? Math.max(0, Math.min(Number(launchHold) || 0.08, launchTime * 0.6)) : 0;
    const routes = [];
    const legs = [];
    const launches = [];
    const contactTimes = [];
    designGroups.forEach(group => {
      if (!group.length) return;
      const routeLegs = [];
      const routeContacts = [];
      let cursor = 0;
      if (designOrigin) {
        const distance = Math.hypot(group[0].x - designOrigin.x, group[0].y - designOrigin.y);
        const launch = {
          from: designOrigin,
          to: group[0],
          start: cursor,
          duration: launchTime,
          hold: safeLaunchHold,
          curveY: -Math.min(52, Math.max(22, distance * 0.19)),
        };
        routeLegs.push(launch);
        legs.push(launch);
        launches.push(launch);
        cursor += launchTime;
        routeContacts.push(cursor);
        contactTimes.push(cursor);
      } else {
        routeContacts.push(cursor);
        contactTimes.push(cursor);
      }
      for (let index = 1; index < group.length; index++) {
        const distance = Math.hypot(group[index].x - group[index - 1].x, group[index].y - group[index - 1].y);
        const leg = {
          from: group[index - 1],
          to: group[index],
          start: cursor,
          duration: safeHopDuration,
          hold: 0,
          curveY: -Math.min(11, Math.max(4, distance * 0.1)),
        };
        routeLegs.push(leg);
        legs.push(leg);
        cursor += safeHopDuration;
        routeContacts.push(cursor);
        contactTimes.push(cursor);
      }
      routes.push({ points: group, legs: routeLegs, contactTimes: routeContacts, duration: cursor, origin: designOrigin });
    });
    this.energyTap = {
      points: designPoints,
      origin: designOrigin,
      groups: designGroups,
      routes,
      legs,
      launches,
      contactTimes,
      color,
      coreColor,
      rimColor,
      routeWidth: Math.max(2.5, Math.min(10, Number(routeWidth) || 7.5)),
      routeAlpha: Math.max(0, Math.min(1, Number(routeAlpha) || 0)),
      messengerRadius: Math.max(5, Math.min(18, Number(messengerRadius) || 13)),
      impactRadius: Math.max(12, Math.min(34, Number(impactRadius) || 25)),
      reducedMotion,
      elapsed: 0,
      duration: Math.max(0.38, Math.max(0, ...routes.map(route => route.duration)) + 0.22),
    };
    this.destroyFlipbooks(this.energyTapFlipbooks, { defer: true });
    const messengers = messengerAssetId ? routes.map(route => ({
      route,
      flipbook: this.createFlipbook(messengerAssetId, {
        layer: 'effects', blendMode: 'add', x: designOrigin?.x || route.points[0].x, y: designOrigin?.y || route.points[0].y,
        width: reducedMotion ? 26 : messengerSize, height: reducedMotion ? 26 : messengerSize, loop: true, fps: reducedMotion ? 8 : 24,
        duration: this.energyTap.duration, alpha: 0.84,
      }),
    })).filter(entry => entry.flipbook) : [];
    this.energyTapFlipbooks.push(...messengers.map(entry => entry.flipbook));
    const impacts = impactAssetId ? designPoints.map((point, index) => this.createFlipbook(impactAssetId, {
      layer: 'overlay', blendMode: 'add', x: point.x, y: point.y,
      size: reducedMotion ? 24 : impactSize, loop: false, fps: reducedMotion ? 12 : 30,
      start: contactTimes[index], duration: reducedMotion ? 0.16 : 0.22, fadeOut: 0.08, alpha: impactAlpha,
    })).filter(Boolean) : [];
    this.energyTapFlipbooks.push(...impacts);
    this.energyTap.authoredMotion = messengers.length || impacts.length ? { messengers, impacts } : null;
    this.scene.energyTap.clear();
    this.app?.start();
    return { duration: this.energyTap.duration, points: designPoints.length };
  }

  cancelEnergyTaps() {
    this.energyTap = null;
    this.scene?.energyTap?.clear();
    this.destroyFlipbooks(this.energyTapFlipbooks, { defer: true });
    if (!this.playing && !this.hasPersistentMotion()) {
      this.app?.stop();
      this.app?.render();
    }
  }

  getEnergyTapState() {
    return this.energyTap ? {
      playing: this.energyTap.elapsed < this.energyTap.duration,
      points: this.energyTap.points.length,
      groups: this.energyTap.groups.length,
      fromMoon: Boolean(this.energyTap.origin),
      auraActive: this.energyTap.contactTimes.some(contact => this.energyTap.elapsed >= contact),
      elapsed: this.energyTap.elapsed,
      duration: this.energyTap.duration,
    } : { playing: false, points: 0, elapsed: 0, duration: 0 };
  }

  seekEnergyTaps(seconds) {
    if (!this.energyTap) return false;
    this.energyTap.elapsed = Math.max(0, Math.min(this.energyTap.duration - 0.001, Number(seconds) || 0));
    this.renderEnergyTaps(0);
    if (!this.hasPersistentMotion()) this.app?.stop();
    this.app?.render();
    return true;
  }

  energyPositionAt(time, route = null) {
    const effect = this.energyTap;
    if (!effect) return { x: 0, y: 0 };
    const safeTime = Math.max(0, time);
    const legs = route?.legs || effect.legs;
    const points = route?.points || effect.points;
    const origin = route?.origin || effect.origin;
    if (!legs.length) return points[0] || origin || { x: 0, y: 0 };
    for (const leg of legs) {
      const segmentEnd = leg.start + leg.duration;
      if (safeTime <= segmentEnd) {
        if (safeTime < leg.start) return leg.from;
        if (effect.reducedMotion) return leg.to;
        const raw = clamp01((safeTime - leg.start - leg.hold) / Math.max(0.001, leg.duration - leg.hold));
        const local = leg.hold ? raw * raw * (3 - 2 * raw) : easeOut(raw);
        return {
          x: leg.from.x + (leg.to.x - leg.from.x) * local,
          y: leg.from.y + (leg.to.y - leg.from.y) * local + Math.sin(local * Math.PI) * (leg.curveY || 0),
        };
      }
    }
    return points.at(-1);
  }

  renderEnergyTaps(deltaSeconds) {
    const effect = this.energyTap;
    const graphic = this.scene?.energyTap;
    if (!effect || !graphic) return;
    effect.elapsed += Math.min(deltaSeconds, 0.05);
    graphic.clear();
    const time = effect.elapsed;
    if (effect.authoredMotion) {
      const { messengers, impacts } = effect.authoredMotion;
      for (const { route, flipbook } of messengers) {
        const current = this.energyPositionAt(time, route);
        const previous = this.energyPositionAt(Math.max(0, time - 0.012), route);
        flipbook.sprite.position.set(current.x, current.y);
        flipbook.sprite.rotation = Math.atan2(current.y - previous.y, current.x - previous.x);
        this.renderFlipbook(flipbook, time);
        flipbook.sprite.visible = time <= (route.contactTimes.at(-1) || 0) + 0.08;
      }
      for (const impact of impacts) this.renderFlipbook(impact, time);
      return;
    }
    effect.points.forEach((point, index) => {
      const age = time - effect.contactTimes[index];
      if (age < 0) return;
      const breathe = effect.reducedMotion ? 0.5 : (Math.sin(age * 3.1 + index * 1.37) + 1) * 0.5;
      const orbit = effect.reducedMotion ? 0 : age * (0.62 + (index % 3) * 0.08);
      graphic.ellipse(point.x, point.y, 23.5 + breathe * 1.8, 30.5 + breathe * 2.4)
        .stroke({ color: effect.color, width: 0.75 + breathe * 0.45, alpha: 0.14 + breathe * 0.08 });
      graphic.ellipse(point.x, point.y, 20.5 + breathe, 27 + breathe * 1.4)
        .stroke({ color: effect.rimColor, width: 0.7, alpha: 0.09 + breathe * 0.07 });
      for (let mote = 0; mote < 3; mote++) {
        const angle = orbit + mote * Math.PI * 2 / 3 + index * 0.41;
        const radiusX = 24 + breathe * 2;
        const radiusY = 31 + breathe * 2.5;
        graphic.circle(point.x + Math.cos(angle) * radiusX, point.y + Math.sin(angle) * radiusY, 0.65 + (mote === 0 ? breathe * 0.45 : 0))
          .fill({ color: mote === 0 ? effect.coreColor : effect.color, alpha: 0.25 + breathe * 0.22 });
      }
    });

    for (const route of effect.routes || []) {
      const lastContact = route.contactTimes.at(-1) || 0;
      const routeFade = clamp01(1 - Math.max(0, time - lastContact - 0.08) / 0.34);
      if (routeFade > 0) {
        for (const leg of route.legs || []) {
          const progress = clamp01((time - leg.start) / Math.max(0.001, leg.duration));
          if (progress <= 0) continue;
          const current = this.energyPositionAt(Math.min(time, leg.start + leg.duration), {
            ...route,
            legs: [leg],
            points: [leg.from, leg.to],
          });
          const controlX = (leg.from.x + leg.to.x) * 0.5;
          const controlY = (leg.from.y + leg.to.y) * 0.5 + (leg.curveY || 0) * 1.7;
          graphic.moveTo(leg.from.x, leg.from.y)
            .quadraticCurveTo(controlX, controlY, current.x, current.y)
            .stroke({ color: effect.color, width: effect.routeWidth, alpha: routeFade * 0.08 * effect.routeAlpha });
          graphic.moveTo(leg.from.x, leg.from.y)
            .quadraticCurveTo(controlX, controlY, current.x, current.y)
            .stroke({ color: effect.rimColor, width: effect.routeWidth * 0.293, alpha: routeFade * 0.34 * effect.routeAlpha });
          graphic.moveTo(leg.from.x, leg.from.y)
            .quadraticCurveTo(controlX, controlY, current.x, current.y)
            .stroke({ color: effect.coreColor, width: Math.max(0.65, effect.routeWidth * 0.107), alpha: routeFade * 0.72 * effect.routeAlpha });
        }
      }
      if (time <= lastContact + 0.16) {
        for (let trailIndex = 7; trailIndex >= 0; trailIndex--) {
          const point = this.energyPositionAt(Math.max(0, time - trailIndex * 0.018), route);
          const strength = 1 - trailIndex / 8;
          graphic.circle(point.x, point.y, 1.1 + strength * 3.2).fill({ color: effect.color, alpha: 0.035 + strength * 0.17 });
        }
        const current = this.energyPositionAt(time, route);
        graphic.circle(current.x, current.y, effect.messengerRadius).fill({ color: effect.color, alpha: 0.08 });
        graphic.circle(current.x, current.y, effect.messengerRadius * 0.46).fill({ color: effect.color, alpha: 0.26 });
        graphic.circle(current.x, current.y, Math.max(1.4, effect.messengerRadius * 0.17)).fill({ color: effect.coreColor, alpha: 0.96 });
      }
    }

    const activeLaunch = effect.launches.find(launch => time >= launch.start && time < launch.start + launch.duration);
    if (effect.origin && activeLaunch) {
      const gather = pulse((time - activeLaunch.start) / activeLaunch.duration);
      graphic.circle(effect.origin.x, effect.origin.y, 4 + gather * 5).fill({ color: effect.color, alpha: gather * 0.18 });
      for (let dust = 0; dust < 5; dust++) {
        const angle = dust * Math.PI * 0.4 + time * 3.2;
        const distance = 5 + gather * (4 + dust * 1.2);
        graphic.circle(effect.origin.x + Math.cos(angle) * distance, effect.origin.y + Math.sin(angle) * distance, 0.75)
          .fill({ color: dust === 0 ? effect.coreColor : effect.color, alpha: gather * 0.48 });
      }
    }

    effect.points.forEach((point, index) => {
      const contact = (time - effect.contactTimes[index]) / 0.24;
      if (contact < 0 || contact > 1) return;
      const spread = easeOut(contact);
      graphic.circle(point.x, point.y, 5 + spread * effect.impactRadius).stroke({ color: effect.color, width: Math.max(0.7, 2.2 - contact * 1.5), alpha: (1 - contact) * 0.48 });
      for (let spark = 0; spark < 8; spark++) {
        const angle = spark * Math.PI / 4 + index * 0.47;
        const distance = 4 + spread * (13 + (spark % 3) * 4);
        graphic.circle(point.x + Math.cos(angle) * distance, point.y + Math.sin(angle) * distance, 0.8 + (spark % 2) * 0.55)
          .fill({ color: spark % 3 === 0 ? effect.coreColor : effect.color, alpha: (1 - contact) * 0.72 });
      }
    });

  }

  play(recipe, input = {}) {
    if (this.playing) this.cancel();
    const compiled = compileVisualEffectRecipe(recipe, { ...input, viewport: input.viewport || this.viewport });
    this.current = compiled;
    this.motion = compiled.motion;
    this.authoredShot = compiled.nodes.some(node => node.motionAssetId);
    this.elapsed = 0;
    this.playing = true;
    this.lastMilestone = null;
    this.resetVisuals();
    this.prepareTimelineFlipbooks(compiled);
    this.createParticles(compiled.nodes.find(node => node.type === 'emitter'));
    this.app?.start();
    this.onFrame?.({ phase: 'launch', progress: 0, compiled });
    return {
      diagnostics: compiled.diagnostics,
      cancel: () => this.cancel(),
      destroy: () => this.cancel(),
      finished: new Promise(resolve => { this.finishPlayback = resolve; }),
    };
  }

  createParticles(emitter) {
    if (!emitter || !this.scene || emitter.motionAssetId || this.authoredShot) return;
    for (const particle of emitter.particles || []) {
      const graphic = applyBlend(makeCircle(particle.size, particle.color, 0.95), 'add');
      graphic.visible = false;
      graphic.__particle = particle;
      this.scene.particles.addChild(graphic);
    }
  }

  seek(seconds) {
    if (!this.current) return;
    this.elapsed = Math.min(this.current.duration, Math.max(0, Number(seconds) || 0));
    this.renderFrame(this.elapsed);
    this.app?.render();
  }

  tick(deltaSeconds) {
    if (this.destroyed) return;
    this.renderAmbientEnergy(deltaSeconds);
    this.renderPresentationEnergy(deltaSeconds);
    this.renderEnergyTaps(deltaSeconds);
    this.renderMotionGraphics(deltaSeconds);
    if (!this.playing || !this.current) return;
    this.elapsed = Math.min(this.current.duration, this.elapsed + Math.min(deltaSeconds, 0.05) * this.current.timeScale);
    this.renderFrame(this.elapsed);
    for (const book of this.timelineFlipbooks) this.renderFlipbook(book, this.elapsed, { forceSemantic: this.motion === 'none' });
    const contactAt = this.motion === 'none' ? 0.08 : 1.04;
    if (this.elapsed >= contactAt && this.lastMilestone !== 'contact') {
      this.lastMilestone = 'contact';
      this.onFrame?.({ phase: 'contact', progress: this.elapsed / this.current.duration, compiled: this.current });
    }
    if (this.elapsed >= this.current.duration) {
      this.playing = false;
      this.lastMilestone = 'settled';
      this.onFrame?.({ phase: 'settled', progress: 1, compiled: this.current });
      this.finishPlayback?.(this.current.diagnostics);
      this.finishPlayback = null;
      if (this.sceneMode === 'overlay') {
        this.resetVisuals();
        for (const book of this.timelineFlipbooks) book.sprite.visible = false;
      }
      if (!this.hasPersistentMotion()) this.app?.stop();
      this.app?.render();
    }
  }

  renderFrame(time) {
    const compiled = this.current;
    const scene = this.scene;
    if (!compiled || !scene) return;
    const byType = type => compiled.nodes.find(node => node.type === type);
    const origin = compiled.origin;
    const target = compiled.target;
    const glow = byType('glow');
    const orbit = byType('orbit');
    const flare = byType('flare');
    const projectile = byType('projectile');
    const trail = byType('trail');
    const emitter = byType('emitter');
    const shockwave = byType('shockwave');
    const camera = byType('camera');
    const grade = byType('color-grade');

    scene.casterCore.position.set(origin.x, origin.y);
    scene.casterGlow.position.set(origin.x, origin.y);
    scene.targetCore.position.set(target.x, target.y);
    scene.targetGlow.position.set(target.x, target.y);
    scene.orbitA.position.set(origin.x, origin.y);
    scene.orbitB.position.set(origin.x, origin.y);
    scene.impactGlow.position.set(target.x, target.y);

    if (glow && !this.authoredShot) {
      const value = visibleAt(time, glow) ? 0.2 + Math.sin(time * 3.8) * 0.07 : 0.16;
      scene.casterGlow.alpha = value * glow.strength;
      scene.targetGlow.alpha = value * 0.85;
    }
    if (orbit && !this.authoredShot) {
      scene.orbitA.visible = true;
      scene.orbitB.visible = true;
      scene.orbitA.rotation = time * orbit.speed;
      scene.orbitB.rotation = -time * orbit.speed * 0.72;
      scene.orbitA.alpha = 0.5 + Math.sin(time * 4) * 0.22;
      scene.orbitB.alpha = 0.46 + Math.cos(time * 3.2) * 0.18;
    }
    scene.launchFlare.clear();
    if (flare && !flare.motionAssetId && visibleAt(time, flare)) {
      const amount = pulse(nodeProgress(time, flare)) * flare.strength;
      scene.launchFlare
        .rect(origin.x - 60, origin.y - 2, 120, 4).fill({ color: '#78f7ff', alpha: amount * 0.7 })
        .rect(origin.x - 3, origin.y - 54, 5, 108).fill({ color: '#ffffff', alpha: amount * 0.58 })
        .circle(origin.x, origin.y, 17 + amount * 18).stroke({ color: '#ffffff', width: 2.2, alpha: amount });
    }

    let projectileX = origin.x;
    let projectileY = origin.y;
    let projectileVisible = false;
    if (projectile && visibleAt(time, projectile) && projectile.travelScale > 0) {
      const progress = easeOut(nodeProgress(time, projectile));
      const travel = progress * projectile.travelScale;
      projectileX = origin.x + (target.x - origin.x) * travel;
      projectileY = origin.y + (target.y - origin.y) * travel - Math.sin(progress * Math.PI) * 58 * projectile.travelScale;
      projectileVisible = true;
    }
    scene.projectileCore.visible = projectileVisible && !projectile?.motionAssetId;
    scene.projectileGlow.visible = projectileVisible && !projectile?.motionAssetId;
    scene.projectileCore.position.set(projectileX, projectileY);
    scene.projectileGlow.position.set(projectileX, projectileY);
    scene.projectileGlow.scale.set(0.8 + Math.sin(time * 21) * 0.18);

    scene.trail.clear();
    if (trail && projectileVisible && !projectile?.motionAssetId && !trail.motionAssetId) {
      const progress = nodeProgress(time, trail);
      const controlX = (origin.x + target.x) / 2;
      const controlY = (origin.y + target.y) / 2 - 68;
      scene.trail.moveTo(origin.x, origin.y).quadraticCurveTo(controlX, controlY, projectileX, projectileY)
        .stroke({ color: '#7eeeff', width: 7, alpha: 0.18 + (1 - progress) * 0.42 });
      scene.trail.moveTo(origin.x, origin.y).quadraticCurveTo(controlX, controlY, projectileX, projectileY)
        .stroke({ color: '#ffffff', width: 1.5, alpha: 0.75 });
    }

    for (const book of this.timelineFlipbooks) {
      if (book.follow !== 'projectile') continue;
      book.sprite.position.set(projectileX, projectileY);
      book.sprite.rotation = Math.atan2(target.y - origin.y, target.x - origin.x);
      book.sprite.visible = book.sprite.visible && projectileVisible;
    }

    const impactTime = this.motion === 'none' ? 0.04 : 1.04;
    const impactProgress = clamp01((time - impactTime) / 0.9);
    scene.impactGlow.alpha = !this.authoredShot && time >= impactTime ? (1 - impactProgress) * 0.72 : 0;
    scene.shockwave.clear();
    if (shockwave && !shockwave.motionAssetId && (visibleAt(time, shockwave) || shockwave.staticSemanticFrame)) {
      const progress = this.motion === 'none' ? 0.48 : nodeProgress(time, shockwave);
      const radius = 22 + easeOut(progress) * 118;
      scene.shockwave.circle(target.x, target.y, radius).stroke({ color: '#ffffff', width: 4 - progress * 2.8, alpha: (1 - progress) * 0.9 });
      scene.shockwave.circle(target.x, target.y, radius * 0.72).stroke({ color: '#ad6cff', width: 6, alpha: (1 - progress) * 0.46 });
    }

    for (const graphic of scene.particles.children) {
      const particle = graphic.__particle;
      const local = (time - (emitter?.start || 0) - particle.delay) / particle.life;
      graphic.visible = local >= 0 && local <= 1 && this.motion !== 'none';
      if (!graphic.visible) continue;
      const distance = particle.speed * easeOut(local);
      graphic.position.set(target.x + Math.cos(particle.angle) * distance, target.y + Math.sin(particle.angle) * distance);
      graphic.alpha = 1 - local;
      graphic.scale.set(1 - local * 0.42);
    }

    if (camera && visibleAt(time, camera) && camera.strength > 0) {
      const progress = nodeProgress(time, camera);
      const magnitude = (1 - progress) * 7 * camera.strength;
      scene.world.position.set(Math.sin(time * 93) * magnitude, Math.cos(time * 77) * magnitude * 0.62);
      scene.world.rotation = Math.sin(time * 55) * 0.006 * (1 - progress) * camera.strength;
    } else {
      scene.world.position.set(0, 0);
      scene.world.rotation = 0;
    }
    scene.grade.alpha = !this.authoredShot && grade && visibleAt(time, grade) ? pulse(nodeProgress(time, grade)) * 0.16 * grade.strength : 0;
  }

  cancel({ render = true } = {}) {
    this.playing = false;
    if (!this.hasPersistentMotion()) this.app?.stop();
    this.finishPlayback?.(this.current?.diagnostics || null);
    this.finishPlayback = null;
    this.resetVisuals();
    for (const book of this.timelineFlipbooks) book.sprite.visible = false;
    // A normal playback cancel needs one final clean frame. Panel teardown does
    // not: its Pixi render tree may already contain released renderables.
    if (render && !this.destroyed) this.app?.render();
  }

  destroy() {
    this.destroyed = true;
    this.generation++;
    // Do not clear or destroy renderables here. Preview profiling can dispose a
    // runtime from inside the same browser frame Pixi is still batching. Leave
    // the intact tree to app.destroy() after that frame has fully unwound.
    this.playing = false;
    this.finishPlayback?.(this.current?.diagnostics || null);
    this.finishPlayback = null;
    const app = this.app;
    this.app = null;
    if (app) {
      retirePixiApplication(app, this._tick);
    }
    this.scene = null;
    this.element = null;
    this.energyTap = null;
    this.ambientEnergy = null;
    this.presentationEnergy = null;
    // The retired application owns every sprite until the page is released.
    this.timelineFlipbooks.length = 0;
    this.ambientFlipbooks.length = 0;
    this.symbolFlipbooks.length = 0;
    this.energyTapFlipbooks.length = 0;
    this.presentationFlipbooks.length = 0;
    this.motionAssets.clear();
    this.motionTextures.clear();
    this.motionLoads.clear();
    this.motionLoadErrors.clear();
  }
}
