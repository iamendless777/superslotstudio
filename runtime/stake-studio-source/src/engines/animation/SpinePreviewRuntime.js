import { Application, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  Physics,
  Spine,
  SpineTexture,
  TextureAtlas,
} from '@esotericsoftware/spine-pixi-v8';
import { AnimationEngine } from './AnimationEngine.js';
import { spineSkeletonFormat } from './SpineAssetCodec.js';
import { readSpineSkeletonData } from './SpineBinaryRuntime.js';
import { getActiveRigCorrections, normalizeRigCorrection } from './RigCorrectionEngine.js';
import {
  getActiveAnchors,
  getActiveDrawOrderRules,
  getActiveSecondaryMotion,
} from './PoseMechanicsEngine.js';

const loadImage = source => new Promise((resolve, reject) => {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The Spine atlas image could not be decoded.'));
  image.src = source;
});

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

export class SpinePreviewRuntime {
  constructor(project, { onStatus, onEvent, assetName = null, placementOverride = null } = {}) {
    this.project = project;
    this.engine = new AnimationEngine(project);
    this.onStatus = onStatus;
    this.onEvent = onEvent;
    this.assetName = assetName;
    this.placementOverride = placementOverride;
    this.status = 'idle';
    this.pendingState = 'idle';
    this.destroyed = false;
    this.generation = 0;
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.onStatus?.({ status, detail, asset: this.asset?.name || null });
  }

  activeAsset() {
    const configuredName = this.project.animation?.runtime?.activeSpineAsset;
    const mapped = Object.keys(this.project.animation?.stateAnimations || {})
      .map(state => this.engine.mappingFor(state)?.asset)
      .find(Boolean);
    const name = this.assetName || mapped || configuredName;
    return (this.project.animation?.spineAssets || []).find(asset => asset.name === name) || null;
  }

  async mount(element, { width, height } = {}) {
    this.destroy();
    this.destroyed = false;
    const generation = ++this.generation;
    await new Promise(resolve => setTimeout(resolve, 96));
    if (this.destroyed || generation !== this.generation) return false;
    this.element = element;
    this.asset = this.activeAsset();

    if (!element || !this.asset) {
      this.setStatus('disabled', 'No mapped Spine skeleton');
      return false;
    }
    if (!spineSkeletonFormat(this.asset) || !this.asset.atlasText || !this.asset.atlasImage) {
      this.setStatus('error', 'Mapped Spine skeleton is incomplete');
      return false;
    }

    this.setStatus('loading', `Loading ${this.asset.name}`);
    try {
      const stageWidth = Math.max(1, Math.round(Number(width) || element.clientWidth || 1280));
      const stageHeight = Math.max(1, Math.round(Number(height) || element.clientHeight || 800));
      const app = new Application();
      await app.init({
        width: stageWidth,
        height: stageHeight,
        autoStart: false,
        backgroundAlpha: 0,
        antialias: true,
        // The runtime canvas covers the full 1280x800 stage while the authored
        // character occupies only ~355x650 pixels. Rendering this transparent
        // layer at Retina 2x quadruples fill cost without adding pose detail,
        // because the source artwork itself is 602x1024. Native stage density
        // keeps the character crisp and restores the desktop frame budget.
        autoDensity: true,
        resolution: 1,
        preference: 'webgl',
      });
      if (this.destroyed || generation !== this.generation) {
        retirePixiApplication(app);
        return false;
      }

      this.app = app;
      app.canvas.className = 'preview-spine-canvas';
      app.canvas.setAttribute('aria-hidden', 'true');
      element.replaceChildren(app.canvas);

      this.atlas = new TextureAtlas(this.asset.atlasText);
      const images = await Promise.all(this.atlas.pages.map((page, index) => {
        const source = this.asset.atlasImages?.[page.name] || (index === 0 ? this.asset.atlasImage : null);
        if (!source) throw new Error(`Missing embedded Spine atlas page image “${page.name}”.`);
        return loadImage(source);
      }));
      if (this.destroyed || generation !== this.generation) return false;
      this.textures = new Map();
      this.atlas.pages.forEach((page, index) => {
        const texture = Texture.from(images[index]);
        this.textures.set(page.name, texture);
        page.setTexture(SpineTexture.from(texture.source));
      });
      this.texture = this.textures.values().next().value || null;

      const skeletonData = readSpineSkeletonData(this.asset, this.atlas);
      this.spine = new Spine({ skeletonData, autoUpdate: true });
      const skinName = this.asset.activeSkin || this.project.animation?.runtime?.activeSkin;
      if (skinName && skeletonData.findSkin?.(skinName)) {
        this.spine.skeleton.setSkin(skinName);
        this.spine.skeleton.setupPoseSlots();
      }
      this.spine.state.data.defaultMix = Number(this.project.animation?.runtime?.defaultMix) || 0.18;
      this.eventHistory = [];
      this.stateListener = {
        event: (entry, event) => {
          const record = {
            animation: entry?.animation?.name || null,
            name: event?.data?.name || null,
            int: event?.intValue ?? null,
            float: event?.floatValue ?? null,
            string: event?.stringValue || '',
            volume: event?.volume ?? null,
            balance: event?.balance ?? null,
            time: Number(event?.time ?? entry?.trackTime) || 0,
            at: performance.now(),
          };
          this.eventHistory = [record, ...this.eventHistory].slice(0, 30);
          this.onEvent?.(record);
        },
      };
      this.spine.state.addListener(this.stateListener);
      app.stage.addChild(this.spine);
      this.fitToStage(stageWidth, stageHeight);
      this.baseSpinePosition = { x: this.spine.position.x, y: this.spine.position.y };
      this.secondaryStates = new Map();
      this.anchorState = null;
      this.drawOrderBaseline = null;
      this.lastPoseMechanics = { drawOrderRules: [], anchors: [], secondaryMotion: [], sockets: [] };
      await this.prepareRigCorrections();
      if (this.destroyed || generation !== this.generation) {
        this.teardownRenderer();
        return false;
      }
      this.poseTick = ticker => {
        this.applyPoseMechanics(Math.min(0.05, Math.max(0.001, Number(ticker?.deltaMS || 16.667) / 1000)));
        this.applyRigCorrections();
      };
      app.ticker.add(this.poseTick);
      app.start();

      this.setStatus('ready', `${this.asset.name} · ${skeletonData.animations.length} animations`);
      this.transition(this.pendingState || 'idle');
      return true;
    } catch (error) {
      if (!this.destroyed) this.setStatus('error', error.message || 'Spine runtime failed');
      this.teardownRenderer();
      return false;
    }
  }

  fitToStage(stageWidth, stageHeight) {
    if (!this.spine) return;
    this.spine.skeleton.setupPose();
    this.spine.skeleton.updateWorldTransform(Physics.pose);
    const characterPlacement = this.project.theme?.character?.placement || {};
    const placement = this.placementOverride || { ...characterPlacement, ...(this.asset.placement || {}) };
    const box = {
      x: Number(placement.x ?? 0),
      y: Number(placement.y ?? 0),
      width: Number(placement.width ?? stageWidth),
      height: Number(placement.height ?? stageHeight),
    };
    let bounds;
    try { bounds = this.spine.getLocalBounds(); } catch { bounds = null; }
    const sourceWidth = Math.max(1, Number(bounds?.width) || Number(this.asset.width) || box.width);
    const sourceHeight = Math.max(1, Number(bounds?.height) || Number(this.asset.height) || box.height);
    const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight) * (Number(placement.scale) || 1);
    const centerX = Number(bounds?.x || 0) + sourceWidth / 2;
    const centerY = Number(bounds?.y || 0) + sourceHeight / 2;
    this.spine.scale.set(scale);
    this.spine.position.set(
      box.x + box.width * (Number(placement.anchorX) || 0.5) - centerX * scale,
      box.y + box.height * (Number(placement.anchorY) || 0.5) - centerY * scale,
    );
  }

  transition(state) {
    this.pendingState = state;
    this.currentRigState = state;
    if (!this.spine || this.status !== 'ready') return false;
    const descriptor = this.engine.describeState(state);
    if (!descriptor.animation || descriptor.asset !== this.asset.name) return false;
    if (!this.spine.skeleton.data.findAnimation(descriptor.animation)) return false;
    this.spine.state.data.defaultMix = descriptor.mix;
    this.spine.state.timeScale = 1;
    const entry = this.spine.state.setAnimation(0, descriptor.animation, descriptor.loop);
    if (!descriptor.loop && state !== 'idle') {
      const idle = this.engine.describeState('idle');
      if (idle.animation && idle.asset === this.asset.name && idle.animation !== descriptor.animation) {
        const queued = this.spine.state.addAnimation(0, idle.animation, true, 0);
        queued.mixDuration = idle.mix;
        queued.listener = {
          start: () => { this.currentRigState = 'idle'; },
        };
      }
    }
    return entry;
  }

  setSkin(skinName = null) {
    if (!this.spine) return false;
    if (skinName && !this.spine.skeleton.data.findSkin?.(skinName)) return false;
    this.spine.skeleton.setSkin(skinName || null);
    this.spine.skeleton.setupPoseSlots();
    this.spine.state.apply(this.spine.skeleton);
    this.spine.skeleton.updateWorldTransform(Physics.pose);
    return true;
  }

  playAnimation(animationName, { loop = true } = {}) {
    if (!this.spine || this.status !== 'ready') return false;
    if (!this.spine.skeleton.data.findAnimation(animationName)) return false;
    this.spine.state.clearTracks();
    this.spine.state.timeScale = 1;
    this.eventHistory = [];
    this.currentRigState = `motion-review:${animationName}`;
    this.pendingState = this.currentRigState;
    return this.spine.state.setAnimation(0, animationName, Boolean(loop));
  }

  beginMotionAudit({ animation, skin = null } = {}) {
    if (!this.spine || this.status !== 'ready') throw new Error('The Spine runtime is not ready for motion QA.');
    if (!this.spine.skeleton.data.findAnimation(animation)) throw new Error(`Animation “${animation}” is missing from the runtime skeleton.`);
    if (!this.setSkin(skin)) throw new Error(`Skin “${skin}” is missing from the runtime skeleton.`);
    this.spine.autoUpdate = false;
    this.spine.state.clearTracks();
    this.spine.state.timeScale = 1;
    this.spine.skeleton.setupPose();
    this.eventHistory = [];
    this.currentRigState = `motion-qa:${animation}`;
    this.pendingState = this.currentRigState;
    this.motionAuditEntry = this.spine.state.setAnimation(0, animation, false);
    this.motionAuditTime = 0;
    this.spine.state.apply(this.spine.skeleton);
    this.spine.skeleton.updateWorldTransform(Physics.pose);
    return true;
  }

  sampleMotionAuditFrame(time = 0) {
    if (!this.motionAuditEntry || !this.spine) throw new Error('No motion QA case is active.');
    const targetTime = Math.max(0, Number(time) || 0);
    if (targetTime < this.motionAuditTime) throw new Error('Motion QA frame times must advance monotonically.');
    this.spine.state.update(targetTime - this.motionAuditTime);
    this.motionAuditTime = targetTime;
    this.spine.skeleton.setupPose();
    // Spine's Pixi renderer caches transformed attachment vertices. Applying
    // AnimationState directly updates the skeleton, but it does not invalidate
    // that render cache, which made every automated QA capture look identical.
    // A zero-time Spine update applies the current track without advancing it
    // and performs the runtime's normal slot/render invalidation path.
    this.spine.update(0);
    this.applyPoseMechanics(1 / 60);
    this.applyRigCorrections();
    this.spine._stateChanged = true;
    this.spine.onViewUpdate?.();
    return this.capturePixels();
  }

  endMotionAudit() {
    if (!this.spine) return false;
    this.motionAuditEntry = null;
    this.motionAuditTime = 0;
    this.spine.autoUpdate = true;
    this.spine.state.timeScale = 1;
    return this.transition('idle');
  }

  getEventHistory() {
    return [...(this.eventHistory || [])];
  }

  async prepareRigCorrections() {
    this.correctionOverlays = new Map();
    this.defaultAttachments = new Map();
    this.activeAttachmentBySlot = new Map();
    const corrections = (this.project.production?.rig?.corrections || [])
      .map(normalizeRigCorrection)
      .filter(correction => correction.enabled && correction.asset === this.asset.name);
    for (const correction of corrections) {
      if (correction.type === 'attachment') {
        const slot = this.spine.skeleton.findSlot(correction.slot);
        if (slot && !this.defaultAttachments.has(correction.slot)) {
          this.defaultAttachments.set(correction.slot, slot.pose?.getAttachment?.()?.name || slot.data?.attachmentName || null);
        }
        continue;
      }
      if (!String(correction.image || '').startsWith('data:image/')) continue;
      try {
        const image = await loadImage(correction.image);
        if (this.destroyed) return;
        const texture = Texture.from(image);
        const sprite = new Sprite(texture);
        sprite.anchor.set(correction.anchorX, correction.anchorY);
        sprite.visible = false;
        sprite.alpha = Math.max(0, Math.min(1, correction.opacity));
        sprite.label = `rig-correction:${correction.id}`;
        this.app.stage.addChild(sprite);
        this.correctionOverlays.set(correction.id, { correction, sprite, texture });
      } catch {
        // Validation reports broken correction artwork. Keep the main rig playable.
      }
    }
  }

  boneAngles() {
    const angles = {};
    const rig = this.project.production?.rig || {};
    const names = new Set([
      ...(rig.corrections || []),
      ...(rig.drawOrderRules || []),
    ].filter(item => item.asset === this.asset?.name).map(item => item.bone));
    for (const name of names) {
      const bone = this.spine?.skeleton?.findBone(name);
      if (bone) angles[name] = bone.pose.rotation;
    }
    return angles;
  }

  boneStagePosition(bone) {
    if (!bone || !this.spine) return null;
    return {
      x: this.spine.position.x + bone.appliedPose.worldX * this.spine.scale.x,
      y: this.spine.position.y + bone.appliedPose.worldY * this.spine.scale.y,
    };
  }

  applyDrawOrderRules(rules) {
    const drawOrder = this.spine?.skeleton?.drawOrder;
    if (!drawOrder) return;
    if (!rules.length) {
      if (this.drawOrderBaseline) drawOrder.splice(0, drawOrder.length, ...this.drawOrderBaseline);
      this.drawOrderBaseline = null;
      return;
    }
    if (!this.drawOrderBaseline) this.drawOrderBaseline = [...drawOrder];
    drawOrder.splice(0, drawOrder.length, ...this.drawOrderBaseline);
    for (const rule of rules) {
      const from = drawOrder.findIndex(slot => slot.data?.name === rule.slot);
      if (from < 0) continue;
      const [slot] = drawOrder.splice(from, 1);
      const relativeIndex = drawOrder.findIndex(candidate => candidate.data?.name === rule.relativeTo);
      if (relativeIndex < 0) {
        drawOrder.splice(Math.min(from, drawOrder.length), 0, slot);
        continue;
      }
      drawOrder.splice(relativeIndex + (rule.position === 'after' ? 1 : 0), 0, slot);
    }
  }

  applySecondaryMotion(systems, deltaSeconds) {
    const activeIds = new Set(systems.map(system => system.id));
    for (const id of this.secondaryStates.keys()) if (!activeIds.has(id)) this.secondaryStates.delete(id);
    for (const system of systems) {
      const bone = this.spine.skeleton.findBone(system.bone);
      if (!bone) continue;
      const target = bone.pose.rotation;
      let state = this.secondaryStates.get(system.id);
      if (!state) {
        state = { angle: target, velocity: 0 };
        this.secondaryStates.set(system.id, state);
      }
      const displacement = target - state.angle;
      state.velocity += displacement * Math.max(0.1, system.stiffness) * deltaSeconds;
      state.velocity *= Math.exp(-Math.max(0, system.damping) * deltaSeconds);
      state.angle += state.velocity * deltaSeconds;
      const maxAngle = Math.max(0, Math.min(180, system.maxAngle));
      const lag = Math.max(-maxAngle, Math.min(maxAngle, state.angle - target));
      state.angle = target + lag;
      bone.pose.rotation = state.angle;
    }
  }

  applyAnchor(anchor) {
    if (!anchor) {
      if (this.anchorState && this.baseSpinePosition) this.spine.position.set(this.baseSpinePosition.x, this.baseSpinePosition.y);
      this.anchorState = null;
      return;
    }
    const bone = this.spine.skeleton.findBone(anchor.bone);
    if (!bone) return;
    const current = this.boneStagePosition(bone);
    if (!current) return;
    if (!this.anchorState || this.anchorState.id !== anchor.id) {
      this.anchorState = {
        id: anchor.id,
        targetX: anchor.targetX ?? current.x,
        targetY: anchor.targetY ?? current.y,
      };
    }
    const strength = Math.max(0, Math.min(1, anchor.strength));
    const dx = (this.anchorState.targetX - current.x) * strength;
    const dy = (this.anchorState.targetY - current.y) * strength;
    this.spine.position.set(this.spine.position.x + dx, this.spine.position.y + dy);
  }

  applyPoseMechanics(deltaSeconds = 1 / 60, overrideAngles = null) {
    if (!this.spine || !this.asset) return this.lastPoseMechanics;
    const context = {
      asset: this.asset.name,
      state: this.currentRigState || this.pendingState || 'idle',
      boneAngles: { ...this.boneAngles(), ...(overrideAngles || {}) },
    };
    const drawOrderRules = getActiveDrawOrderRules(this.project, context);
    const anchors = getActiveAnchors(this.project, context);
    const secondaryMotion = getActiveSecondaryMotion(this.project, context);
    this.applyDrawOrderRules(drawOrderRules);
    this.applySecondaryMotion(secondaryMotion, deltaSeconds);
    this.spine.skeleton.updateWorldTransform(Physics.pose);
    const plant = anchors.find(anchor => anchor.mode === 'plant') || null;
    this.applyAnchor(plant);
    const sockets = anchors.filter(anchor => anchor.mode === 'socket').map(anchor => ({
      ...anchor,
      position: this.boneStagePosition(this.spine.skeleton.findBone(anchor.bone)),
    }));
    this.lastPoseMechanics = { drawOrderRules, anchors, secondaryMotion, sockets };
    return this.lastPoseMechanics;
  }

  poseMechanicsStatus() {
    return this.lastPoseMechanics || { drawOrderRules: [], anchors: [], secondaryMotion: [], sockets: [] };
  }

  applyRigCorrections(overrideAngles = null) {
    if (!this.spine || !this.asset) return [];
    const boneAngles = { ...this.boneAngles(), ...(overrideAngles || {}) };
    const active = getActiveRigCorrections(this.project, {
      asset: this.asset.name,
      state: this.currentRigState || this.pendingState || 'idle',
      boneAngles,
    });
    const activeIds = new Set(active.map(correction => correction.id));
    const attachmentBySlot = new Map(active.filter(correction => correction.type === 'attachment').map(correction => [correction.slot, correction]));

    for (const [slotName, defaultAttachment] of this.defaultAttachments) {
      const correction = attachmentBySlot.get(slotName);
      const target = correction?.attachment || defaultAttachment;
      if (this.activeAttachmentBySlot.get(slotName) === target) continue;
      try {
        this.spine.skeleton.setAttachment(slotName, target || null);
        this.activeAttachmentBySlot.set(slotName, target);
      } catch {
        // Invalid attachment references are surfaced by validation.
      }
    }

    for (const [id, overlay] of this.correctionOverlays || []) {
      const { correction, sprite } = overlay;
      const bone = this.spine.skeleton.findBone(correction.bone);
      const visible = activeIds.has(id) && Boolean(bone);
      sprite.visible = visible;
      if (!visible) continue;
      const pose = bone.appliedPose;
      const localX = pose.worldX + correction.offsetX * pose.a + correction.offsetY * pose.b;
      const localY = pose.worldY + correction.offsetX * pose.c + correction.offsetY * pose.d;
      sprite.position.set(
        this.spine.position.x + localX * this.spine.scale.x,
        this.spine.position.y + localY * this.spine.scale.y,
      );
      sprite.rotation = Math.atan2(pose.c, pose.a) + correction.rotation * Math.PI / 180;
      const scale = correction.scale * Math.abs(this.spine.scale.x);
      sprite.scale.set(scale);
      sprite.alpha = Math.max(0, Math.min(1, correction.opacity));
    }
    return active;
  }

  setStressPose({ bone: boneName, angle = 0, state = 'idle' } = {}) {
    if (!this.spine) return [];
    this.currentRigState = state;
    this.pendingState = state;
    this.spine.state.clearTracks();
    this.spine.state.timeScale = 0;
    this.spine.skeleton.setupPose();
    const bone = this.spine.skeleton.findBone(boneName);
    if (!bone) return [];
    bone.pose.rotation = Number(angle) || 0;
    this.spine.skeleton.updateWorldTransform(Physics.pose);
    this.applyPoseMechanics(1 / 60, { [boneName]: bone.pose.rotation });
    return this.applyRigCorrections({ [boneName]: bone.pose.rotation });
  }

  capturePixels() {
    if (this.status !== 'ready' || !this.app?.renderer || !this.app?.stage) {
      throw new Error('The Spine runtime is not ready for pixel capture.');
    }
    this.app.render();
    const screen = this.app.screen;
    const result = this.app.renderer.extract.pixels({
      target: this.app.stage,
      frame: new Rectangle(0, 0, screen.width, screen.height),
      resolution: 1,
    });
    return { pixels: result.pixels, width: result.width, height: result.height };
  }

  clearStressPose() {
    if (!this.spine) return false;
    this.spine.state.timeScale = 1;
    return this.transition(this.pendingState || 'idle');
  }

  teardownRenderer() {
    const app = this.app;
    try { this.element?.replaceChildren(); } catch { /* already detached */ }
    retirePixiApplication(app, this.poseTick);
    this.app = null;
    this.spine = null;
    this.atlas = null;
    this.texture = null;
    this.textures = null;
    this.poseTick = null;
    this.correctionOverlays = null;
    this.defaultAttachments = null;
    this.activeAttachmentBySlot = null;
    this.secondaryStates = null;
    this.anchorState = null;
    this.drawOrderBaseline = null;
    this.lastPoseMechanics = null;
    this.eventHistory = null;
    this.stateListener = null;
    this.motionAuditEntry = null;
    this.motionAuditTime = null;
  }

  destroy() {
    this.destroyed = true;
    this.generation++;
    this.teardownRenderer();
  }
}
