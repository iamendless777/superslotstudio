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
  const motionAssetsById = new Map((effects?.motionAssets || []).map(asset => [asset.id, asset]));
  let domMotionGeneration = 0;
  let transientPlaybackGeneration = 0;
  const awaitWithin = (promise, timeoutMs) => Promise.race([
    Promise.resolve(promise),
    new Promise(resolve => globalThis.setTimeout(() => resolve(null), timeoutMs)),
  ]);
  const playDomMotionAtlas = async (assetId, { durationMs = 900, reducedMotion: semanticOnly = false, placement = null } = {}) => {
    const asset = motionAssetsById.get(assetId);
    if (!asset?.src) return false;
    const generation = ++domMotionGeneration;
    host.querySelectorAll('.visual-motion-fallback').forEach(element => element.remove());
    const plate = document.createElement('div');
    plate.className = `visual-motion-fallback${semanticOnly ? ' is-reduced' : ''}`;
    plate.dataset.motionAssetId = assetId;
    if (placement) {
      plate.classList.add('is-tile-local');
      plate.dataset.motionAnchor = `${placement.reel},${placement.row}`;
      plate.style.left = `${placement.dom.x}px`;
      plate.style.top = `${placement.dom.y}px`;
      plate.style.width = `${placement.dom.width}px`;
      plate.style.height = `${placement.dom.height}px`;
      plate.style.setProperty('--motion-alpha', String(placement.alpha));
    }
    const columns = Math.max(1, Math.floor(Number(asset.columns) || 1));
    const rows = Math.max(1, Math.floor(Number(asset.rows) || 1));
    const frames = Math.max(1, Math.min(columns * rows, Math.floor(Number(asset.frames) || columns * rows)));
    const safeDuration = Math.max(240, Number(durationMs) || 900);
    plate.style.backgroundImage = `url(${JSON.stringify(asset.src)})`;
    plate.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
    plate.style.animationDuration = `${safeDuration}ms`;
    const showFrame = index => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      plate.style.backgroundPosition = `${columns === 1 ? 0 : column / (columns - 1) * 100}% ${rows === 1 ? 0 : row / (rows - 1) * 100}%`;
    };
    host.append(plate);
    if (semanticOnly) showFrame(Math.min(frames - 1, Math.floor(frames * .55)));
    await new Promise(resolve => {
      const startedAt = Date.now();
      const tick = () => {
        if (generation !== domMotionGeneration || !plate.isConnected) return resolve();
        const elapsed = Date.now() - startedAt;
        if (!semanticOnly) showFrame(Math.min(frames - 1, Math.floor(elapsed / safeDuration * frames)));
        if (elapsed >= safeDuration) return resolve();
        globalThis.requestAnimationFrame?.(tick) || globalThis.setTimeout(tick, 16);
      };
      tick();
    });
    plate.remove();
    return generation === domMotionGeneration;
  };
  const cancelTransientEffects = () => {
    transientPlaybackGeneration += 1;
    domMotionGeneration += 1;
    host.querySelectorAll('.visual-motion-fallback').forEach(element => element.remove());
    runtime.cancel?.();
    runtime.cancelEnergyTaps?.();
    runtime.disablePresentationEnergy?.();
  };
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
  // Ambient plates are decorative warmup, not a readiness gate for governed
  // event effects. A slow image decoder must never keep the controller promise
  // pending until an authoritative route times out. Load ambient motion in the
  // background and activate it only when its textures are available.
  if (motionGraphics.enabled !== false) void runtime.preloadMotionAssets(ambientAssetIds)
    .then(() => runtime.enableAmbientFlipbooks(motionGraphics.ambient || [], { reducedMotion: reducedMotion() }))
    .catch(error => console.warn('Ambient motion warmup failed', error));
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
          dom: { left, top, width, height },
          meta: { symbol: definition.name, reel, row, renderer: 'pixi-webgl-frame-atlas' },
        });
      }
    }
    return instances;
  };
  let symbolSyncGeneration = 0;
  const symbolSyncAllowed = () => !board?.classList.contains('is-spinning')
    && !board?.classList.contains('is-settling')
    && !board?.classList.contains('is-tumbling')
    && !board?.classList.contains('is-symbol-motion-suspended');
  let domSymbolAnimationFrame = 0;
  let domSymbolFlipbooks = [];
  const clearDomSymbolFlipbooks = () => {
    domSymbolFlipbooks = [];
    if (domSymbolAnimationFrame) globalThis.cancelAnimationFrame?.(domSymbolAnimationFrame);
    domSymbolAnimationFrame = 0;
    host.querySelectorAll('.symbol-motion-fallback').forEach(element => element.remove());
  };
  const enableDomSymbolFlipbooks = (instances, { reduced = false } = {}) => {
    clearDomSymbolFlipbooks();
    for (const instance of instances) {
      const asset = motionAssetsById.get(instance.assetId);
      if (!asset?.src || !instance.dom) continue;
      const columns = Math.max(1, Math.floor(Number(asset.columns) || 1));
      const rows = Math.max(1, Math.floor(Number(asset.rows) || 1));
      const frames = Math.max(1, Math.min(columns * rows, Math.floor(Number(asset.frames) || columns * rows)));
      const plate = document.createElement('span');
      plate.className = 'symbol-motion-fallback';
      plate.dataset.motionAssetId = instance.assetId;
      plate.dataset.symbol = instance.meta?.symbol || '';
      plate.style.left = `${instance.dom.left}px`;
      plate.style.top = `${instance.dom.top}px`;
      plate.style.width = `${instance.dom.width}px`;
      plate.style.height = `${instance.dom.height}px`;
      plate.style.opacity = String(instance.alpha);
      plate.style.mixBlendMode = instance.blendMode === 'add' ? 'screen' : instance.blendMode;
      plate.style.backgroundImage = `url(${JSON.stringify(asset.src)})`;
      plate.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
      host.append(plate);
      domSymbolFlipbooks.push({
        plate,
        columns,
        rows,
        frames,
        fps: reduced ? 0 : Math.max(1, Number(instance.fps) || Number(asset.fps) || 8),
        phase: Number(instance.phase) || 0,
      });
    }
    const showFrame = (book, index) => {
      const column = index % book.columns;
      const row = Math.floor(index / book.columns);
      book.plate.style.backgroundPosition = `${book.columns === 1 ? 0 : column / (book.columns - 1) * 100}% ${book.rows === 1 ? 0 : row / (book.rows - 1) * 100}%`;
      book.plate.dataset.motionFrame = String(index);
    };
    if (reduced) {
      for (const book of domSymbolFlipbooks) showFrame(book, Math.min(book.frames - 1, Math.floor(book.frames * .55)));
      return domSymbolFlipbooks.length;
    }
    const startedAt = globalThis.performance?.now?.() || Date.now();
    const tick = timestamp => {
      if (!domSymbolFlipbooks.length) return;
      const elapsed = Math.max(0, (Number(timestamp) || Date.now()) - startedAt) / 1_000;
      for (const book of domSymbolFlipbooks) showFrame(book, Math.floor((elapsed + book.phase) * book.fps) % book.frames);
      domSymbolAnimationFrame = globalThis.requestAnimationFrame?.(tick) || 0;
    };
    domSymbolAnimationFrame = globalThis.requestAnimationFrame?.(tick) || 0;
    return domSymbolFlipbooks.length;
  };
  const syncSymbols = async () => {
    const generation = ++symbolSyncGeneration;
    // A geometry-changing render can start a new asynchronous atlas sync while
    // the previous flipbooks still carry coordinates from the old board. Retire
    // them immediately; an invisible loading frame is preferable to an effect
    // floating over the wrong tile until texture resolution completes.
    clearDomSymbolFlipbooks();
    runtime.clearSymbolFlipbooks?.();
    if (!symbolSyncAllowed()) {
      host.dataset.symbolMotionStatus = 'suspended';
      host.dataset.symbolMotionCount = '0';
      return 0;
    }
    const instances = symbolInstances();
    host.dataset.symbolMotionStatus = 'loading';
    host.dataset.symbolMotionCount = '0';
    const assetIds = [...new Set(instances.map(instance => instance.assetId))];
    // Resolve atlases independently. One slow decoder must not suppress every
    // other animated symbol on the landed board.
    const loadedIds = new Set((await Promise.all(assetIds.map(async assetId => {
      const loaded = await awaitWithin(runtime.preloadMotionAssets([assetId]), 1_200);
      return Array.isArray(loaded) && loaded.some(Boolean) ? assetId : null;
    }))).filter(Boolean));
    if (generation !== symbolSyncGeneration || !symbolSyncAllowed()) return 0;
    const readyInstances = instances.filter(instance => loadedIds.has(instance.assetId));
    const fallbackInstances = instances.filter(instance => !loadedIds.has(instance.assetId));
    const reduced = reducedMotion();
    const enabled = runtime.enableSymbolFlipbooks(readyInstances, { reducedMotion: reduced });
    const fallbackEnabled = enableDomSymbolFlipbooks(fallbackInstances, { reduced });
    host.dataset.symbolMotionStatus = fallbackEnabled
      ? enabled ? 'partial-fallback' : 'fallback'
      : readyInstances.length === instances.length ? 'ready' : 'timeout';
    host.dataset.symbolMotionCount = String(enabled + fallbackEnabled);
    host.dataset.symbolMotionAssets = [...new Set([...loadedIds, ...fallbackInstances.map(instance => instance.assetId)])].join(',');
    host.dataset.symbolMotionRenderer = fallbackEnabled ? enabled ? 'pixi+dom-atlas' : 'dom-atlas' : 'pixi';
    return enabled + fallbackEnabled;
  };
  const clearSymbols = () => {
    symbolSyncGeneration++;
    host.dataset.symbolMotionStatus = 'cleared';
    host.dataset.symbolMotionCount = '0';
    clearDomSymbolFlipbooks();
    runtime.clearSymbolFlipbooks?.();
    runtime.cancelEnergyTaps?.();
  };
  const scheduleSymbolSync = () => {
    const run = () => {
      if (!symbolSyncAllowed()) return;
      void syncSymbols().catch(error => console.warn('Symbol motion warmup failed', error));
    };
    return globalThis.requestAnimationFrame?.(run) || run();
  };

  const energyTapOptions = event => {
    const effect = presentation.winConnections || {};
    const hostRect = host.getBoundingClientRect();
    const tileAnchorY = Math.max(0, Math.min(1, Number(effect.tileAnchorY) || 0.5));
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
        if (rect) group.push({
          x: rect.left - hostRect.left + rect.width / 2,
          y: rect.top - hostRect.top + rect.height * (event?.type === 'winInfo' ? tileAnchorY : 0.5),
        });
      }
      if (group.length) groups.push(group);
    }
    const cabinet = config.cabinetSize || { width: 1280, height: 800 };
    const sourcePosition = positionPair(event?.sources?.[0]);
    const sourceSymbol = Number.isFinite(sourcePosition.reel) && Number.isFinite(sourcePosition.row)
      ? board?.children?.[sourcePosition.reel]?.children?.[sourcePosition.row]
      : null;
    const sourceRect = sourceSymbol?.getBoundingClientRect?.();
    // Win relationships belong to the tiles themselves: begin at the first
    // winning tile and travel through the rest of that win group. A configured
    // cabinet origin is reserved for mechanic launches that genuinely enter
    // the board from an external source.
    const origin = event?.type === 'winInfo' ? null : sourceRect ? {
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
        routeWidth: effect.routeWidth,
        routeAlpha: effect.routeAlpha,
        messengerRadius: effect.messengerRadius,
        impactRadius: effect.impactRadius,
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

  const authoredMotionPlacement = (assetId, event) => {
    const raw = event?.sources?.[0] || event?.positions?.[0] || event?.changes?.[0] || event?.affectedPositions?.[0] || event?.updates?.[0];
    const position = positionPair(raw);
    if (!Number.isFinite(position.reel) || !Number.isFinite(position.row)) return null;
    const element = board?.children?.[position.reel]?.children?.[position.row];
    const rect = element?.getBoundingClientRect?.();
    if (!rect) return null;
    const candidateNames = new Set([
      event?.originalSymbol,
      event?.revealedAs,
      event?.special,
      event?.changes?.[0]?.from,
      event?.changes?.[0]?.to,
      element?.dataset?.symbol,
    ].filter(Boolean).map(String));
    const owner = (config.symbols || []).find(symbol => symbol.motionAssetId === assetId && candidateNames.has(String(symbol.name)))
      || (config.symbols || []).find(symbol => symbol.motionAssetId === assetId);
    if (!owner) return null;
    const overlay = owner.motionOverlay || {};
    const hostRect = host.getBoundingClientRect();
    const left = rect.left - hostRect.left + rect.width * (Number(overlay.left) || 0) / 100;
    const top = rect.top - hostRect.top + rect.height * (Number(overlay.top) || 0) / 100;
    const width = rect.width * Math.max(1, Number(overlay.width) || 100) / 100;
    const height = rect.height * Math.max(1, Number(overlay.height) || 100) / 100;
    const design = runtime.stageRectToDesign({ x: left + width / 2, y: top + height / 2, width, height });
    if (!design) return null;
    return {
      reel: position.reel,
      row: position.row,
      alpha: Math.max(0, Math.min(1, Number(overlay.alpha) || 1)),
      dom: { x: left + width / 2, y: top + height / 2, width, height },
      design,
    };
  };

  return {
    async play(event, { instant = false } = {}) {
      if (event?.type === 'reveal') scheduleSymbolSync();
      if (instant) return null;
      const generation = ++transientPlaybackGeneration;
      const binding = bindings.find(item => item.event === event?.type);
      const recipe = effects.recipes?.find(item => item.id === binding?.recipeId);
      const tap = event?.type === 'winInfo' || MECHANIC_EVENTS.has(event?.type) ? energyTapOptions(event) : null;
      const loaded = await awaitWithin(runtime.preloadMotionAssets([
        tap?.options?.messengerAssetId,
        tap?.options?.impactAssetId,
        ...(recipe?.nodes || []).map(node => node.motionAssetId),
      ]), getTurbo() ? 220 : 1_200);
      if (generation !== transientPlaybackGeneration || loaded === null) return false;
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
    async playAuthoredMotion(assetId, { durationMs = null, reducedMotion = false, motionMode = 'normal', event = null } = {}) {
      if (!assetId) return false;
      const fast = motionMode === 'fast' || getTurbo();
      const hasAuthoredDuration = durationMs !== null && durationMs !== undefined && Number.isFinite(Number(durationMs));
      const effectiveDuration = hasAuthoredDuration
        ? Math.max(0, Number(durationMs))
        : reducedMotion ? 240 : fast ? 360 : 900;
      const placement = authoredMotionPlacement(assetId, event);
      // Pixi's image loader can remain pending after a lost GPU context. Give
      // it a short opportunity, then render the same authored frame atlas with
      // the DOM fallback so an authoritative route always reaches its barrier.
      // Fast Play cannot spend longer warming an enhancement than presenting
      // it, so it falls back promptly to the already-packaged DOM atlas.
      const loaded = await awaitWithin(runtime.preloadMotionAssets([assetId]), fast ? 220 : 1_200);
      const played = Array.isArray(loaded) && loaded.some(Boolean) && runtime.enablePresentationEnergy({
        motionAssetId: assetId,
        motionDuration: Math.max(0.24, effectiveDuration / 1000),
        reducedMotion,
        motionPlacement: placement?.design || null,
      });
      if (played) {
        await new Promise(resolve => setTimeout(resolve, Math.max(80, effectiveDuration)));
        runtime.disablePresentationEnergy();
        return true;
      }
      return playDomMotionAtlas(assetId, { durationMs: effectiveDuration, reducedMotion, placement });
    },
    async playTileConnections(event, { instant = false } = {}) {
      if (instant) return false;
      const tap = energyTapOptions(event);
      if (!tap?.points.length) return false;
      // The procedural route is the guaranteed renderer. Authored messenger
      // atlases remain an enhancement and cannot suppress the relationship
      // trace when a texture is still warming.
      const playback = runtime.playEnergyTaps(tap.points, {
        ...tap.options,
        messengerAssetId: null,
        impactAssetId: null,
      });
      if (!playback) return false;
      try {
        await new Promise(resolve => setTimeout(resolve, Math.max(1, playback.duration * 1000)));
        return playback;
      } finally {
        runtime.cancelEnergyTaps?.();
      }
    },
    syncSymbols,
    clearSymbols,
    cancelTransientEffects,
    destroy() {
      transientPlaybackGeneration += 1;
      domMotionGeneration++;
      host.querySelectorAll('.visual-motion-fallback').forEach(element => element.remove());
      clearDomSymbolFlipbooks();
      observer.disconnect();
      runtime.destroy();
    },
    diagnostics: { status: 'ready', bindingCount: bindings.length },
  };
}
