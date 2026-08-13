import 'pixi.js/unsafe-eval';
import { VisualEffectRuntime } from '../../src/engines/animation/VisualEffectRuntime.js';
import {
  createVisualEffectSeed,
  resolveVisualEffectIntensity,
  resolveVisualEffectLayout,
} from '../../src/engines/animation/VisualEffectRecipes.js';

const positionPair = value => Array.isArray(value)
  ? { reel: Number(value[0]), row: Number(value[1]) }
  : { reel: Number(value?.reel), row: Number(value?.row) };

const MECHANIC_EVENTS = new Set([
  'modeGridStart',
  'expandingWild', 'mysteryTransform', 'wildBomb', 'symbolPurge', 'wildStar',
  'specialTargetSelected', 'specialPositionsResolved',
  'symbolUpgrade', 'symbolUpgradeApply', 'symbolMultiplierUpdate', 'symbolMultiplierUpgrade',
  'positionMultiplierGridUpdate', 'expandReelHeight', 'lucidWildMultiplier',
  'echoSplit', 'maxDream',
  'modeBoardSelection',
]);

export async function mountVisualEffects({ host, board, config, getTurbo = () => false }) {
  const effects = config?.visualEffects;
  const bindings = (effects?.bindings || []).filter(binding => binding.enabled !== false);
  const hasAuthoredMotion = (effects?.motionAssets || []).length > 0
    || config?.presentationEffects?.motionGraphics?.enabled
    || config?.presentationEffects?.livingEnergy?.enabled;
  if (!host || (bindings.length === 0 && !hasAuthoredMotion)) return { play() {}, syncSymbols() {}, clearSymbols() {}, destroy() {}, diagnostics: { status: 'disabled' } };
  const runtime = new VisualEffectRuntime();
  const size = () => ({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });
  const mounted = await runtime.mount(host, {
    ...size(),
    sceneMode: 'overlay',
    motionAssets: effects.motionAssets || [],
    eagerMotionAssets: false,
  });
  if (!mounted) throw new Error('Visual effect renderer could not be mounted.');
  const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const presentation = config?.presentationEffects || {};
  const motionGraphics = presentation.motionGraphics || {};
  const ambientAssetIds = (motionGraphics.ambient || []).map(item => item.assetId).filter(Boolean);
  await runtime.preloadMotionAssets(ambientAssetIds);
  if (motionGraphics.enabled !== false) {
    runtime.enableAmbientFlipbooks(motionGraphics.ambient || [], { reducedMotion: reducedMotion() });
  }
  const livingEnergy = presentation.livingEnergy || {};
  if (livingEnergy.enabled && Array.isArray(livingEnergy.points) && livingEnergy.points.length) {
    runtime.enableAmbientEnergy({
      points: livingEnergy.points,
      color: livingEnergy.color,
      count: livingEnergy.particleCount,
      reducedMotion: reducedMotion(),
    });
  }

  const symbolInstances = () => {
    const hostRect = host.getBoundingClientRect();
    const assets = new Map((effects.motionAssets || []).map(asset => [asset.id, asset]));
    const definitions = new Map((config.symbols || []).map(symbol => [symbol.name, symbol]));
    const instances = [];
    for (const [reel, reelElement] of [...(board?.children || [])].entries()) {
      for (const [row, symbolElement] of [...reelElement.children].entries()) {
        const definition = definitions.get(symbolElement.dataset.symbol);
        const asset = assets.get(definition?.motionAssetId);
        if (!definition?.motionAssetId || !asset?.src) continue;
        const rect = symbolElement.getBoundingClientRect();
        const overlay = definition.motionOverlay || {};
        const left = rect.left - hostRect.left + rect.width * (Number(overlay.left) || 0) / 100;
        const top = rect.top - hostRect.top + rect.height * (Number(overlay.top) || 0) / 100;
        const width = rect.width * Math.max(1, Number(overlay.width) || 100) / 100;
        const height = rect.height * Math.max(1, Number(overlay.height) || 100) / 100;
        const design = runtime.stageRectToDesign({ x: left + width / 2, y: top + height / 2, width, height });
        if (!design) continue;
        instances.push({
          assetId: definition.motionAssetId,
          x: design.x,
          y: design.y,
          width: design.width,
          height: design.height,
          fps: Number(overlay.fps || asset.fps) || 8,
          alpha: Math.max(0, Math.min(1, Number(overlay.alpha) || 1)),
          blendMode: overlay.blendMode || asset.blendMode || 'screen',
          interpolate: overlay.interpolate !== false,
          phase: ((reel * 5 + row * 3) % 16) / Math.max(1, Number(overlay.fps || asset.fps) || 8),
          meta: { symbol: definition.name, reel, row, renderer: 'pixi-webgl-frame-atlas' },
        });
      }
    }
    return instances;
  };
  let symbolSyncGeneration = 0;
  const syncSymbols = async () => {
    const generation = ++symbolSyncGeneration;
    const instances = symbolInstances();
    await runtime.preloadMotionAssets(instances.map(instance => instance.assetId));
    if (generation !== symbolSyncGeneration) return 0;
    return runtime.enableSymbolFlipbooks(instances, { reducedMotion: reducedMotion() });
  };
  const clearSymbols = () => {
    symbolSyncGeneration++;
    runtime.clearSymbolFlipbooks?.();
  };
  const scheduleSymbolSync = () => {
    const run = () => void syncSymbols().catch(error => console.warn('Symbol motion warmup failed', error));
    return globalThis.requestAnimationFrame?.(run) || run();
  };

  const energyTapOptions = event => {
    const effect = presentation.winConnections || {};
    const hostRect = host.getBoundingClientRect();
    const groups = [];
    const eventGroups = event?.type === 'winInfo'
      ? (event.wins || []).map(win => win.positions || [])
      : [[...(event?.positions || []), ...(event?.updates || []).map(update => ({ reel: update.reel, row: update.row }))]];
    for (const rawGroup of eventGroups) {
      const seen = new Set();
      const group = [];
      for (const raw of rawGroup) {
        const position = positionPair(raw);
        const key = `${position.reel}:${position.row}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const symbol = board?.children?.[position.reel]?.children?.[position.row];
        const rect = symbol?.getBoundingClientRect?.();
        if (rect) group.push({ x: rect.left - hostRect.left + rect.width / 2, y: rect.top - hostRect.top + rect.height / 2 });
      }
      if (group.length) groups.push(group);
    }
    const cabinet = config.cabinetSize || { width: 1280, height: 800 };
    const sourcePosition = positionPair(event?.sources?.[0]);
    const sourceSymbol = Number.isFinite(sourcePosition.reel) && Number.isFinite(sourcePosition.row)
      ? board?.children?.[sourcePosition.reel]?.children?.[sourcePosition.row]
      : null;
    const sourceRect = sourceSymbol?.getBoundingClientRect?.();
    const origin = event?.type !== 'winInfo' && sourceRect ? {
      x: sourceRect.left - hostRect.left + sourceRect.width / 2,
      y: sourceRect.top - hostRect.top + sourceRect.height / 2,
    } : effect.origin ? {
      x: Number(effect.origin.x) * host.clientWidth / Math.max(1, Number(cabinet.width) || 1280),
      y: Number(effect.origin.y) * host.clientHeight / Math.max(1, Number(cabinet.height) || 800),
    } : null;
    const warm = ['symbolPurge', 'wildBomb'].includes(event?.type);
    return {
      groups,
      points: groups.flat(),
      options: {
        color: warm ? '#f1c66c' : effect.color,
        coreColor: effect.coreColor,
        rimColor: warm ? '#f1c66c' : effect.rimColor,
        origin,
        groups,
        launchDuration: effect.launchDuration,
        launchHold: effect.launchHold,
        messengerAssetId: effect.messengerAssetId,
        impactAssetId: effect.impactAssetId,
        reducedMotion: reducedMotion(),
      },
    };
  };

  const observer = new ResizeObserver(() => {
    const next = size();
    runtime.resizeSurface(next.width, next.height);
    scheduleSymbolSync();
  });
  observer.observe(host);
  scheduleSymbolSync();
  const warmRemainingMotion = () => void runtime.preloadMotionAssets().catch(error => console.warn('Motion atlas warmup failed', error));
  if (globalThis.requestIdleCallback) globalThis.requestIdleCallback(warmRemainingMotion, { timeout: 2500 });
  else globalThis.setTimeout(warmRemainingMotion, 750);

  const anchors = event => {
    const surface = size();
    const layout = resolveVisualEffectLayout(surface.width, surface.height);
    const hostRect = host.getBoundingClientRect();
    const last = event?.wins?.[0]?.positions?.at(-1);
    const position = positionPair(last);
    const symbol = Number.isFinite(position.reel) && Number.isFinite(position.row)
      ? board?.children?.[position.reel]?.children?.[position.row]
      : null;
    const rect = symbol?.getBoundingClientRect?.();
    return {
      origin: { x: 72, y: 180 },
      target: rect
        ? layout.toDesign({ x: rect.left - hostRect.left + rect.width / 2, y: rect.top - hostRect.top + rect.height / 2 })
        : { x: 500, y: 180 },
    };
  };

  return {
    async play(event, { instant = false } = {}) {
      if (event?.type === 'reveal') scheduleSymbolSync();
      if (instant) return null;
      const binding = bindings.find(item => item.event === event?.type);
      const recipe = effects.recipes?.find(item => item.id === binding?.recipeId);
      const tap = event?.type === 'winInfo' || MECHANIC_EVENTS.has(event?.type) ? energyTapOptions(event) : null;
      await runtime.preloadMotionAssets([
        tap?.options?.messengerAssetId,
        tap?.options?.impactAssetId,
        ...(recipe?.nodes || []).map(node => node.motionAssetId),
      ]);
      let energyTaps = null;
      if (tap?.points.length) energyTaps = runtime.playEnergyTaps(tap.points, tap.options);
      if (!binding || !recipe) return energyTaps;
      const reduced = reducedMotion();
      const motion = reduced ? 'none' : getTurbo() ? 'subtle' : 'full';
      return runtime.play(recipe, {
        ...anchors(event),
        motion,
        intensity: resolveVisualEffectIntensity(binding, event),
        timeScale: binding.timeScale,
        seed: createVisualEffectSeed(event.type, event),
      });
    },
    async playAuthoredMotion(assetId, { durationMs = 900, reducedMotion = false } = {}) {
      if (!assetId) return false;
      await runtime.preloadMotionAssets([assetId]);
      const played = runtime.enablePresentationEnergy({
        motionAssetId: assetId,
        motionDuration: Math.max(0.25, Number(durationMs) / 1000 || 0.9),
        reducedMotion,
      });
      if (!played) return false;
      await new Promise(resolve => setTimeout(resolve, Math.max(80, Number(durationMs) || 900)));
      runtime.disablePresentationEnergy();
      return true;
    },
    syncSymbols,
    clearSymbols,
    destroy() {
      observer.disconnect();
      runtime.destroy();
    },
    diagnostics: { status: 'ready', bindingCount: bindings.length },
  };
}
