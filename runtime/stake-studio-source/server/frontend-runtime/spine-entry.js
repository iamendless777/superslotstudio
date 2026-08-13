import 'pixi.js/unsafe-eval';
import { Application, Texture } from 'pixi.js';
import {
  AtlasAttachmentLoader,
  Physics,
  SkeletonBinary,
  SkeletonJson,
  Spine,
  SpineTexture,
  TextureAtlas,
} from '@esotericsoftware/spine-pixi-v8';

const loadImage = source => new Promise((resolve, reject) => {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not decode Spine atlas page ${source}.`));
  image.src = source;
});

const absolute = path => new URL(path, document.baseURI).href;

function winState(event) {
  const amount = Math.max(0, Number(event?.amount ?? event?.win) || 0) / 100;
  if (amount >= 200) return 'winMega';
  if (amount >= 50) return 'winBig';
  if (amount >= 10) return 'winMedium';
  return 'winSmall';
}

export function resolveSpineEventState(event = {}) {
  if (event.type === 'spinStart') return 'spinStart';
  if (event.type === 'reveal') return event.anticipation?.length ? 'anticipation' : 'spinStop';
  if (event.type === 'winInfo') return winState(event);
  if (event.type === 'wincap' || event.type === 'maxWinReached') return 'wincap';
  if (event.type === 'anticipation') return 'anticipation';
  if (event.type === 'freeSpinTrigger' || event.type === 'enterBonus') return 'bonusEntry';
  if (event.type === 'updateFreeSpin') return 'bonusIdle';
  if (event.type === 'freeSpinEnd') return 'bonusExit';
  if (event.type === 'finalWin') return Number(event.amount) > 0 ? 'featureResult' : 'lose';
  return null;
}

export async function mountSpineRuntime({ host, manifestUrl = 'animation/runtime.json' }) {
  if (!host) throw new Error('Spine runtime host is missing.');
  const manifest = await fetch(absolute(manifestUrl), { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('Animation runtime manifest is unavailable.');
    return response.json();
  });
  const asset = manifest.assets?.[0];
  if (!asset?.files?.skeleton || !asset.files.atlas) return { transition() { return false; }, play() {}, destroy() {}, diagnostics: { status: 'disabled' } };

  const atlasText = await fetch(absolute(asset.files.atlas)).then(response => {
    if (!response.ok) throw new Error('Spine atlas is unavailable.');
    return response.text();
  });
  const atlas = new TextureAtlas(atlasText);
  const images = await Promise.all(atlas.pages.map(page => {
    const source = asset.files.images?.[page.name] || asset.files.image;
    if (!source) throw new Error(`Spine atlas page “${page.name}” is not packaged.`);
    return loadImage(absolute(source));
  }));
  const textures = new Map();
  atlas.pages.forEach((page, index) => {
    const texture = Texture.from(images[index]);
    textures.set(page.name, texture);
    page.setTexture(SpineTexture.from(texture.source));
  });

  const loader = new AtlasAttachmentLoader(atlas);
  const binary = asset.skeletonFormat === 'binary' || asset.files.skeleton.endsWith('.skel');
  const parser = binary ? new SkeletonBinary(loader) : new SkeletonJson(loader);
  parser.scale = Number(asset.runtimeScale) || 1;
  const skeletonResponse = await fetch(absolute(asset.files.skeleton));
  if (!skeletonResponse.ok) throw new Error('Spine skeleton is unavailable.');
  const skeletonData = parser.readSkeletonData(binary
    ? new Uint8Array(await skeletonResponse.arrayBuffer())
    : await skeletonResponse.json());

  const size = () => ({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });
  const initial = size();
  const app = new Application();
  await app.init({
    ...initial,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
    preference: 'webgl',
  });
  app.canvas.setAttribute('aria-hidden', 'true');
  host.replaceChildren(app.canvas);
  const spine = new Spine({ skeletonData, autoUpdate: true });
  const skinName = asset.activeSkin;
  if (skinName && skeletonData.findSkin?.(skinName)) {
    spine.skeleton.setSkin(skinName);
    spine.skeleton.setupPoseSlots();
  }
  spine.state.data.defaultMix = Number(manifest.runtime?.defaultMix) || 0.18;
  app.stage.addChild(spine);

  const fit = () => {
    const surface = size();
    app.renderer.resize(surface.width, surface.height);
    spine.skeleton.setupPose();
    spine.skeleton.updateWorldTransform(Physics.pose);
    let bounds;
    try { bounds = spine.getLocalBounds(); } catch { bounds = null; }
    const placement = asset.placement || {};
    const box = {
      x: Number(placement.x) || 0,
      y: Number(placement.y) || 0,
      width: Number(placement.width) || surface.width,
      height: Number(placement.height) || surface.height,
    };
    const sourceWidth = Math.max(1, Number(bounds?.width) || Number(asset.width) || box.width);
    const sourceHeight = Math.max(1, Number(bounds?.height) || Number(asset.height) || box.height);
    const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight) * (Number(placement.scale) || 1);
    spine.scale.set(scale);
    spine.position.set(
      box.x + box.width * (Number(placement.anchorX) || 0.5) - ((Number(bounds?.x) || 0) + sourceWidth / 2) * scale,
      box.y + box.height * (Number(placement.anchorY) || 0.5) - ((Number(bounds?.y) || 0) + sourceHeight / 2) * scale,
    );
  };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(host);

  const transition = state => {
    const descriptor = manifest.states?.[state];
    if (!descriptor?.animation || !skeletonData.findAnimation(descriptor.animation)) return false;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches && state !== 'idle') return false;
    spine.state.data.defaultMix = Number(descriptor.mix) || Number(manifest.runtime?.defaultMix) || 0.18;
    const entry = spine.state.setAnimation(0, descriptor.animation, Boolean(descriptor.loop));
    if (!descriptor.loop && state !== 'idle') {
      const idle = manifest.states?.idle;
      if (idle?.animation && skeletonData.findAnimation(idle.animation)) spine.state.addAnimation(0, idle.animation, true, 0);
    }
    // Do not leak Spine's TrackEntry through Promise chains. Some runtime
    // builds expose promise-like completion behavior on engine objects, which
    // can turn a looping/fallback state into an unbounded orchestration barrier.
    return Boolean(entry);
  };
  transition('idle');

  return {
    transition,
    play(event, { instant = false } = {}) {
      if (instant) return false;
      const state = resolveSpineEventState(event);
      return state ? transition(state) : false;
    },
    destroy() {
      observer.disconnect();
      app.destroy(true, { children: true });
      for (const texture of textures.values()) {
        try { texture.destroy(true); } catch { /* best effort */ }
      }
    },
    diagnostics: {
      status: 'ready',
      asset: asset.name,
      skeletonFormat: binary ? 'binary' : 'json',
      animations: skeletonData.animations.length,
    },
  };
}
