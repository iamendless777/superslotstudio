import { API_AMOUNT_MULTIPLIER, StakeRuntime } from './stake-runtime.js';

const app = document.querySelector('#app');
const params = new URL(location.href).searchParams;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

let config;
let runtime;
let busy = false;
let turbo = false;
let soundEnabled = true;
let autoSpinsRemaining = 0;
let autoSpinTimer = null;
let pendingAutoSpins = 25;
let betLevels = [];
let replayData = null;
let sessionStartedAt = Date.now();
let currentBoard = [];
let currentWin = 0;
let effectsController = null;
let effectsReady = Promise.resolve(null);
let spineController = null;
let spineReady = Promise.resolve(null);
let morpheusAuthoritativeReady = null;
let morpheusAuthoritativeQaReady = null;
let winHighlightTimers = [];
let positionMultipliers = new Map();
let positionGridMode = '';
let symbolMultipliers = new Map();
let audioMusic = null;
let audioMusicKey = '';
let audioVariation = 0;
let featureState = { active: false, mode: '', current: 0, total: 0, totalWin: 0, achievement: '' };
let dreamfallWorldActive = false;
let modalSequence = 0;

const ui = {};
const modeByName = name => config.betModes.find(mode => mode.name === name) || config.betModes[0] || { name: 'base', cost: 1 };
const modeLabel = mode => mode?.label || String(mode?.name || 'base').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const eventAmount = event => Number(event?.amount ?? event?.totalWin ?? 0) / 100;
const presentationRecipe = type => config?.presentationDirector?.recipes?.find(recipe => recipe.enabled !== false && recipe.event === type) || null;
const resolveWinTier = amount => {
  const thresholds = config?.presentationDirector?.winEscalation?.thresholds || {};
  let tier = 'winSmall';
  for (const candidate of ['winSmall', 'winMedium', 'winBig', 'winMega']) {
    if (Number(amount) >= Number(thresholds[candidate] || 0)) tier = candidate;
  }
  return tier;
};

function audioAsset(key) {
  const assets = config?.audio?.stingers?.[key] || [];
  if (!assets.length) return null;
  const selected = assets[audioVariation % assets.length];
  audioVariation += 1;
  return selected;
}

function createAudioElement(asset) {
  if (!asset?.src) return null;
  const element = new Audio(asset.src);
  element.preload = 'auto';
  element.loop = Boolean(asset.loop);
  element.volume = Math.max(0, Math.min(1, Number(asset.volume ?? 1) || 0));
  element.muted = !soundEnabled;
  return element;
}

function playStinger(key) {
  if (!config?.audio?.enabled || !soundEnabled) return;
  const element = createAudioElement(audioAsset(key));
  if (!element) return;
  element.play().catch(() => {});
  element.addEventListener('ended', () => element.remove(), { once: true });
}

function setMusic(key) {
  if (!config?.audio?.enabled || audioMusicKey === key) {
    if (audioMusic) audioMusic.muted = !soundEnabled;
    return;
  }
  audioMusic?.pause();
  audioMusic = createAudioElement(config.audio.layers?.[key]);
  audioMusicKey = audioMusic ? key : '';
  if (audioMusic && soundEnabled) audioMusic.play().catch(() => {});
}

function setSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
  if (audioMusic) {
    audioMusic.muted = !soundEnabled;
    if (soundEnabled) audioMusic.play().catch(() => {});
  }
  for (const element of document.querySelectorAll('audio')) element.muted = !soundEnabled;
}
const controlButton = (key, label, className = '') => {
  const button = node('button', `authored-control ${className}`.trim());
  button.type = 'button';
  button.setAttribute('aria-label', label);
  const image = node('img'); image.src = config.controls?.[key] || ''; image.alt = ''; image.draggable = false;
  button.append(image, node('span', '', label));
  return button;
};
const socialMode = () => Boolean(runtime?.jurisdiction?.socialCasino || runtime?.launch.social);
const preserveCase = (match, replacement) => match === match.toUpperCase()
  ? replacement.toUpperCase()
  : /^[A-Z]/.test(match) ? `${replacement[0].toUpperCase()}${replacement.slice(1)}` : replacement;
const socialText = normal => {
  if (!socialMode()) return String(normal ?? '');
  let copy = String(normal ?? '');
  const replacements = [
    [/\bbuy bonus\b/gi, 'get bonus'], [/\bbet amount\b/gi, 'play amount'], [/\bcost of\b/gi, 'can be played for'],
    [/\bbought\b/gi, 'instantly triggered'], [/\brebet\b/gi, 'respin'], [/\bwager(?:ed|ing|s)?\b/gi, 'play'],
    [/\bgambl(?:e|ed|ing)\b/gi, 'play'], [/\bdeposit(?:ed|ing|s)?\b/gi, 'get coins'], [/\bwithdraw(?:al|als|n|ing|s)?\b/gi, 'redeem'],
    [/\b(?:cash|money)\b/gi, 'coins'], [/\bcurrenc(?:y|ies)\b/gi, 'token'], [/\bcredits?\b/gi, 'balance'],
    [/\bbuy(?:ing|s)?\b/gi, 'get'], [/\bbets?\b/gi, 'play'], [/\bstake\b(?!\s+engine)/gi, 'play amount'],
  ];
  for (const [pattern, replacement] of replacements) copy = copy.replace(pattern, match => preserveCase(match, replacement));
  return copy;
};
const authoredMotionEnabled = () => Boolean(
  config?.presentationEffects?.motionGraphics?.enabled !== false
  && ((config?.visualEffects?.motionAssets || []).length || (config?.visualEffects?.bindings || []).some(binding => binding.enabled !== false)),
);

function formatAmount(apiAmount, currency = 'USD') {
  const value = Number(apiAmount || 0) / API_AMOUNT_MULTIPLIER;
  const decimals = ['ISK', 'UGX', 'XOF'].includes(currency) ? 0 : ['KWD', 'JOD', 'TND', 'OMR', 'BHD'].includes(currency) ? 3 : 2;
  try { return new Intl.NumberFormat(runtime?.launch.lang || 'en', { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value); }
  catch { return `${value.toFixed(decimals)} ${currency}`; }
}

function showStatus(message, duration = 1800) {
  ui.status.textContent = message;
  ui.status.classList.add('is-visible');
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => ui.status.classList.remove('is-visible'), duration);
}

function tierForTrigger(event) {
  const scatterCount = (event?.positions || []).length;
  return config?.featureArchitecture?.tiers?.[scatterCount]
    || config?.featureArchitecture?.tiers?.[String(scatterCount)]
    || null;
}

function syncFeatureProgress() {
  if (!ui.featureProgress) return;
  ui.featureProgress.classList.toggle('is-visible', featureState.active);
  ui.featureMode.textContent = featureState.mode || 'Dream Feature';
  ui.featureCount.textContent = featureState.total > 0 ? `FREE SPIN ${featureState.current} / ${featureState.total}` : '';
  ui.featureTotal.textContent = `FEATURE TOTAL ${Number(featureState.totalWin || 0).toFixed(2)}×`;
  ui.featureAchievement.textContent = featureState.achievement || '';
}

function beginFeature(event) {
  const tier = tierForTrigger(event);
  const directMode = modeByName(ui.mode?.value);
  const dreamfallProfile = config.renderProfiles?.morpheusDreamfall;
  const activation = dreamfallProfile?.activation || {};
  const tierId = String(tier?.id || tier?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const mechanicId = String(tier?.mechanic || directMode?.profile?.featureTier || '');
  dreamfallWorldActive = Boolean(dreamfallProfile && (
    (activation.modeIds || []).includes(directMode?.name)
    || (activation.modeIds || []).includes(tierId)
    || (activation.mechanicIds || []).includes(mechanicId)
  ));
  featureState = {
    active: true,
    mode: tier?.name || modeLabel(directMode) || 'Dream Feature',
    current: 0,
    total: Number(event?.totalFs || tier?.spins || directMode?.profile?.freeSpins || 10),
    totalWin: currentWin,
    achievement: tier?.mechanic === 'progressiveSymbolUpgrade' ? `VEIL METER 0 / ${Number(tier.meterThreshold || 4)}` : '',
  };
  syncFeatureProgress();
  setMusic('bonusMusic');
}

function updateFeatureProgress(event) {
  if (!featureState.active) return;
  featureState.current = Number(event?.amount ?? featureState.current);
  featureState.total = Number(event?.total ?? featureState.total);
  featureState.totalWin = currentWin;
  syncFeatureProgress();
}

function setFeatureAchievement(message) {
  if (!featureState.active) return;
  featureState.achievement = String(message || '');
  syncFeatureProgress();
}

function showFeatureIntro() {
  if (!ui.featureIntro || !featureState.active) return;
  ui.featureIntroTitle.textContent = featureState.mode;
  ui.featureIntroMeta.textContent = `${featureState.total} FREE SPINS`;
  ui.featureIntro.classList.add('is-visible');
  clearTimeout(showFeatureIntro.timer);
  showFeatureIntro.timer = setTimeout(() => ui.featureIntro.classList.remove('is-visible'), turbo ? 650 : 1350);
}

function showFeatureFinale({ wincap = false, amount = null } = {}) {
  if (!ui.featureFinale) return;
  ui.featureFinaleKicker.textContent = wincap ? 'MAXIMUM DREAM' : (featureState.mode || 'DREAM COMPLETE');
  ui.featureFinaleTitle.textContent = wincap ? `${Number(amount ?? config.wincap ?? currentWin).toLocaleString()}×` : `${Number(featureState.totalWin || currentWin).toFixed(2)}×`;
  ui.featureFinaleMeta.textContent = wincap
    ? 'THE DREAM REACHED ITS LIMIT'
    : `${featureState.current || featureState.total} FREE SPINS${featureState.achievement ? ` · ${featureState.achievement}` : ''}`;
  ui.featureFinale.classList.add('is-visible');
}

function hideFeatureFinale() {
  ui.featureFinale?.classList.remove('is-visible');
}

async function executePresentationCue(cue, event) {
  let target = cue.target;
  if (target === '$winTier') target = resolveWinTier(eventAmount(event));
  if (cue.channel === 'audio' && cue.action === 'stinger') playStinger(target);
  if (cue.channel === 'audio' && cue.action === 'music') setMusic(target);
  if (cue.channel === 'ui' && cue.action === 'modePortal') showFeatureIntro();
  if (cue.channel === 'ui' && cue.action === 'featureResult') showFeatureFinale();
  if (cue.channel === 'ui' && cue.action === 'wincap') showFeatureFinale({ wincap: true });
}

async function playPresentationEvent(event, instant = false) {
  if (instant) return false;
  const recipe = presentationRecipe(event?.type);
  if (!recipe) return false;
  const scale = prefersReducedMotion() ? 0.12 : turbo ? 0.42 : 1;
  let elapsed = 0;
  for (const cue of (recipe.cues || []).filter(item => item.enabled !== false)) {
    const cueAt = Math.max(0, Number(cue.at) || 0) * scale;
    if (cueAt > elapsed) await wait(cueAt - elapsed);
    await executePresentationCue(cue, event);
    elapsed = cueAt;
  }
  let duration = Math.max(0, Number(recipe.duration) || 0);
  if (event.type === 'winInfo') {
    const tier = resolveWinTier(eventAmount(event));
    duration = Math.max(duration, Number(recipe.tierDurations?.[tier] || config.presentationDirector?.winEscalation?.tierDurations?.[tier]) || 0);
  }
  const resolved = duration * scale;
  if (resolved > elapsed) await wait(resolved - elapsed);
  return true;
}

const rawSymbolName = raw => typeof raw === 'string' ? raw : raw?.name || '?';
const canonicalSymbolName = name => String(name || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const symbolDefinition = name => config.symbols.find(symbol => (
  symbol.name === name || canonicalSymbolName(symbol.name) === canonicalSymbolName(name)
));

function createSymbol(raw) {
  const name = rawSymbolName(raw);
  const definition = symbolDefinition(name);
  const symbol = node('div', 'symbol');
  symbol.dataset.symbol = name;
  if (definition?.motionAssetId) symbol.dataset.motionRenderer = 'pixi-frame-atlas';
  else if (definition?.motionProfile) symbol.dataset.motion = definition.motionProfile;
  if (definition?.src) {
    const image = node('img'); image.src = definition.src; image.alt = name; image.draggable = false; symbol.append(image);
  } else symbol.textContent = name;
  return symbol;
}

function renderBoard(board) {
  if (!Array.isArray(board) || !board.length) return;
  clearWinHighlights();
  currentBoard = board;
  ui.board.replaceChildren();
  ui.board.style.setProperty('--reels', String(board.length));
  const dreamfallProfile = config.renderProfiles?.morpheusDreamfall;
  const maximumRows = Number(dreamfallProfile?.maximumRows) || 8;
  const maxRows = dreamfallWorldActive
    ? maximumRows
    : Math.max(...board.map(reel => Array.isArray(reel) ? reel.length : 0), 1);
  ui.board.classList.toggle('is-dreamfall-world', dreamfallWorldActive);
  ui.shell?.classList.toggle('is-dreamfall-world', dreamfallWorldActive);
  if (ui.dreamfallCabinet) ui.dreamfallCabinet.hidden = !dreamfallWorldActive;
  ui.board.dataset.renderProfile = dreamfallWorldActive ? String(dreamfallProfile?.format || '') : 'base';
  ui.board.style.setProperty('--rows', String(maxRows));
  for (const reelData of board) {
    const reel = node('div', 'reel');
    const symbols = Array.isArray(reelData) ? reelData : [];
    reel.style.gridTemplateRows = `repeat(${Math.max(1, symbols.length)}, minmax(0,1fr))`;
    if (dreamfallWorldActive) {
      reel.style.setProperty('--reel-rows', String(symbols.length));
      reel.style.height = `${Math.max(1, symbols.length) / maximumRows * 100}%`;
    }
    for (const raw of symbols) reel.append(createSymbol(raw));
    ui.board.append(reel);
  }
  syncMechanicMarkers();
  globalThis.requestAnimationFrame?.(() => effectsController?.syncSymbols?.());
}

async function preloadBoardAssets(board) {
  const sources = new Set();
  for (const reel of board || []) for (const raw of reel || []) {
    const name = typeof raw === 'string' ? raw : raw?.name;
    const source = symbolDefinition(name)?.src;
    if (source) sources.add(source);
  }
  await Promise.all([...sources].map(source => new Promise(resolve => {
    const image = new Image();
    image.onload = image.onerror = resolve;
    image.src = source;
    if (image.complete) resolve();
  })));
}

function beginReelMotion() {
  ui.board.classList.remove('is-settling');
  ui.board.classList.add('is-spinning');
}

async function settleReelMotion(board, instant = false) {
  await preloadBoardAssets(board);
  renderBoard(board);
  ui.board.classList.remove('is-spinning');
  if (instant) return;
  ui.board.classList.add('is-settling');
  await wait(turbo ? 90 : 360);
  ui.board.classList.remove('is-settling');
}

function clearWinHighlights() {
  for (const timer of winHighlightTimers) clearTimeout(timer);
  winHighlightTimers = [];
  ui.board.querySelectorAll('.symbol').forEach(element => element.classList.remove('is-winning'));
}

function syncMechanicMarkers() {
  ui.board?.querySelectorAll('.mechanic-multiplier, .position-grid-plate').forEach(marker => marker.remove());
  ui.board?.classList.toggle('has-position-grid', Boolean(positionGridMode));
  if (ui.board) ui.board.dataset.positionGridMode = positionGridMode;
  for (const [key, multiplier] of positionMultipliers) {
    const [reel, row] = key.split(':').map(Number);
    const symbol = ui.board?.children?.[reel]?.children?.[row];
    if (!symbol) continue;
    if (positionGridMode) {
      const plate = node('span', `position-grid-plate${Number(multiplier) > 1 ? ' is-charged' : ''}`);
      plate.dataset.multiplier = String(multiplier);
      plate.setAttribute('aria-label', `${positionGridMode === 'trickster_dream' ? 'Trickster Dream' : 'Oneiric Nexus'} position ${reel + 1},${row + 1}: ${multiplier}x`);
      plate.append(node('b', '', `${multiplier}×`));
      symbol.append(plate);
    } else if (Number(multiplier) > 1) symbol.append(node('b', 'mechanic-multiplier is-position', `${multiplier}×`));
  }
  for (const [name, multiplier] of symbolMultipliers) {
    if (Number(multiplier) <= 1) continue;
    for (const reel of [...(ui.board?.children || [])]) for (const symbol of [...reel.children]) {
      if (canonicalSymbolName(symbol.dataset.symbol) !== canonicalSymbolName(name)) continue;
      symbol.append(node('b', 'mechanic-multiplier is-symbol', `${multiplier}×`));
    }
  }
}

function clearMechanicState() {
  positionMultipliers = new Map();
  positionGridMode = '';
  symbolMultipliers = new Map();
  syncMechanicMarkers();
}

function highlightWins(wins = [], { stagger = false } = {}) {
  clearWinHighlights();
  const position = raw => Array.isArray(raw) ? { reel: Number(raw[0]), row: Number(raw[1]) } : raw;
  if (!stagger) {
    for (const win of wins) for (const raw of win.positions || []) {
      const target = position(raw);
      ui.board.children[target.reel]?.children[target.row]?.classList.add('is-winning');
    }
    return;
  }
  const connections = config.presentationEffects?.winConnections || {};
  const launch = Math.max(180, (Number(connections.launchDuration) || 0.42) * 1000);
  const hop = 150;
  let cursor = 0;
  for (const win of wins) {
    const seen = new Set();
    const positions = (win.positions || []).map(position).filter(target => {
      const key = `${target.reel}:${target.row}`;
      if (!Number.isFinite(target.reel) || !Number.isFinite(target.row) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!positions.length) continue;
    cursor += launch;
    positions.forEach((target, index) => {
      const timer = setTimeout(() => {
        ui.board.children[target.reel]?.children[target.row]?.classList.add('is-winning');
      }, cursor + index * hop);
      winHighlightTimers.push(timer);
    });
    cursor += Math.max(0, positions.length - 1) * hop;
  }
}

const eventPosition = raw => Array.isArray(raw)
  ? { reel: Number(raw[0]), row: Number(raw[1]) }
  : { reel: Number(raw?.reel), row: Number(raw?.row) };

async function playTumbleBoard(event, instant = false) {
  const removed = new Set((event.explodingSymbols || []).map(raw => {
    const position = eventPosition(raw);
    return `${position.reel},${position.row}`;
  }));
  await effectsReady.then(controller => controller?.clearSymbols?.());

  const exploding = [];
  for (let reel = 0; reel < currentBoard.length; reel++) {
    for (let row = 0; row < (currentBoard[reel] || []).length; row++) {
      if (removed.has(`${reel},${row}`)) exploding.push(ui.board.children[reel]?.children[row]);
    }
  }
  if (!instant && exploding.length) {
    await Promise.all(exploding.filter(Boolean).map((element, index) => element.animate([
      { opacity: 1, transform: 'scale(1) rotate(0)' },
      { opacity: 0, transform: `scale(.16) rotate(${index % 2 ? 7 : -7}deg)` },
    ], { duration: turbo ? 100 : 280, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished));
  }

  const motions = [];
  const nextBoard = [];
  for (let reel = 0; reel < currentBoard.length; reel++) {
    const reelElement = ui.board.children[reel];
    const incomingRaw = event.newSymbols?.[reel] || [];
    const oldSymbols = [...(reelElement?.children || [])];
    const survivors = oldSymbols.filter((_, row) => !removed.has(`${reel},${row}`));
    const survivingRaw = (currentBoard[reel] || []).filter((_, row) => !removed.has(`${reel},${row}`));
    const before = new Map(survivors.map(element => [element, element.getBoundingClientRect()]));
    const incomingElements = incomingRaw.map(createSymbol);
    reelElement?.replaceChildren(...incomingElements, ...survivors);
    nextBoard.push([...incomingRaw, ...survivingRaw]);

    if (instant) continue;
    for (const element of survivors) {
      const previous = before.get(element);
      const settled = element.getBoundingClientRect();
      motions.push(element.animate([
        { transform: `translateY(${previous.top - settled.top}px)` },
        { transform: 'translateY(0)' },
      ], { duration: turbo ? 120 : 460, easing: 'cubic-bezier(.16,1,.3,1)' }).finished);
    }
    for (const [index, element] of incomingElements.entries()) {
      const height = element.getBoundingClientRect().height || ui.board.getBoundingClientRect().height / Math.max(1, incomingElements.length);
      motions.push(element.animate([
        { opacity: 0, transform: `translateY(${-height * (incomingElements.length - index)}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: turbo ? 120 : 460, easing: 'cubic-bezier(.16,1,.3,1)' }).finished);
    }
  }
  await Promise.all(motions);
  currentBoard = nextBoard;
  syncMechanicMarkers();
  await effectsReady.then(controller => controller?.syncSymbols?.());
  showStatus('Cascade');
}

async function playBoardTransform(event, instant = false) {
  const targetBoard = event.board || currentBoard;
  await effectsReady.then(controller => controller?.clearSymbols?.());
  for (const change of event.changes || []) {
    const current = ui.board.children[change.reel]?.children[change.row];
    if (!current) continue;
    if (!instant) await current.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(1.14)' },
    ], { duration: turbo ? 80 : 150, easing: 'ease-out', fill: 'forwards' }).finished;
    const replacement = createSymbol(targetBoard[change.reel]?.[change.row] ?? change.to);
    current.replaceWith(replacement);
    if (!instant) await replacement.animate([
      { opacity: 0, transform: 'scale(.82)' },
      { opacity: 1, transform: 'scale(1)' },
    ], { duration: turbo ? 100 : 190, easing: 'cubic-bezier(.2,.9,.3,1.25)' }).finished;
  }
  currentBoard = targetBoard;
  syncMechanicMarkers();
  await effectsReady.then(controller => controller?.syncSymbols?.());
}

async function applyEvent(event, { instant = false } = {}) {
  window.StakeStudioGameHooks?.handleEvent?.(event, { instant, config });
  const channelProgress = event?.morpheusAuthoritative ? {
    eventIndex: Number(event.morpheusSource?.index ?? event.index),
    eventType: event.type,
    effects: 'pending',
    spine: 'pending',
    director: 'pending',
  } : null;
  const trackChannel = (name, promise) => Promise.resolve(promise).then(result => {
    if (channelProgress) {
      channelProgress[name] = 'settled';
      document.documentElement.dataset.morpheusChannelProgress = JSON.stringify(channelProgress);
    }
    return result;
  });
  if (channelProgress) document.documentElement.dataset.morpheusChannelProgress = JSON.stringify(channelProgress);
  // Typed Morpheus envelopes have exactly one presentation owner: the governed
  // plan executed after this DOM projection. Running legacy VFX/Spine/director
  // channels here would duplicate cues and can weaken the acknowledgement
  // barrier by introducing an unrelated asynchronous engine object.
  const governedPresentation = Boolean(event?.morpheusAuthoritative);
  const directorMotion = governedPresentation ? Promise.resolve(false) : playPresentationEvent(event, instant);
  const channelMotions = [
    trackChannel('effects', governedPresentation ? Promise.resolve(false) : effectsReady.then(controller => controller?.play(event, { instant, turbo })).catch(error => console.warn('Visual effect playback failed', error))),
    trackChannel('spine', governedPresentation ? Promise.resolve(false) : spineReady.then(controller => controller?.play(event, { instant })).catch(error => console.warn('Spine playback failed', error))),
    trackChannel('director', directorMotion),
  ];
  switch (event?.type) {
    case 'reveal':
      if (event.morpheusAuthoritative && event.mode === 'dreamfall') {
        dreamfallWorldActive = true;
        featureState = {
          active: true,
          mode: 'Dreamfall',
          current: 0,
          total: Number(event.featureState?.freeSpinsRemaining) || 10,
          totalWin: currentWin,
          achievement: '',
        };
        syncFeatureProgress();
      }
      await settleReelMotion(event.board, instant);
      showStatus(event.anticipation ? 'Anticipation' : 'Revealed');
      break;
    case 'winInfo':
      highlightWins(event.wins, { stagger: !instant && authoredMotionEnabled() });
      if (event.morpheusAuthoritative) {
        currentWin = Number(event.cumulativeWin ?? event.totalWin ?? event.amount ?? 0) / 100;
        ui.winValue.textContent = `${currentWin.toFixed(2)}×`;
        if (featureState.active) { featureState.totalWin = currentWin; syncFeatureProgress(); }
      }
      break;
    case 'setWin': case 'setTumbleWin': case 'setTotalWin': case 'updateTumbleWin':
      currentWin = Number(event.amount ?? event.totalWin ?? currentWin) / 100;
      ui.winValue.textContent = `${currentWin.toFixed(2)}×`;
      if (featureState.active) { featureState.totalWin = currentWin; syncFeatureProgress(); }
      break;
    case 'finalWin':
      currentWin = Number(event.amount ?? event.totalWin ?? currentWin) / 100;
      ui.winValue.textContent = `${currentWin.toFixed(2)}×`;
      if (featureState.active) {
        featureState.totalWin = currentWin;
        featureState.active = false;
        syncFeatureProgress();
        hideFeatureFinale();
        clearMechanicState();
        setMusic('baseMusic');
      }
      dreamfallWorldActive = false;
      ui.board.classList.remove('is-dreamfall-world');
      ui.board.dataset.renderProfile = 'base';
      if (currentWin > 0) flash(`${currentWin.toFixed(2)}×`);
      break;
    case 'tumbleBoard': await playTumbleBoard(event, instant); break;
    case 'boardTransform': await playBoardTransform(event, instant); break;
    case 'updateGlobalMult': ui.multiplier.textContent = `${event.globalMult || 1}×`; showStatus(`Multiplier ${event.globalMult || 1}×`); break;
    case 'freeSpinTrigger': clearMechanicState(); beginFeature(event); showStatus(`${featureState.mode} · ${featureState.total} Free Spins`, 2600); break;
    case 'freeSpinRetrigger':
      featureState.total = Number(event.totalFs || featureState.total);
      syncFeatureProgress();
      showStatus(`Dream Extended · ${featureState.total} Free Spins`, 2600);
      playStinger('bonusTrigger');
      break;
    case 'updateFreeSpin': updateFeatureProgress(event); break;
    case 'freeSpinEnd':
      featureState.totalWin = Number(event.amount ?? currentWin * 100) / 100;
      featureState.current = Math.max(featureState.current, featureState.total);
      syncFeatureProgress();
      break;
    case 'wincap': currentWin = Number(event.amount || 0) / 100; ui.winValue.textContent = `${currentWin.toFixed(2)}×`; flash('Maximum Win'); break;
    case 'enterBonus': showStatus(`${event.tierName || featureState.mode || 'Gates of Sleep'} · ${event.totalFs || featureState.total || 0} Free Spins`, 2600); break;
    case 'dreamTierStart':
      if (event.tierName) featureState.mode = event.tierName;
      syncFeatureProgress();
      showFeatureIntro();
      break;
    case 'expandingWild': showStatus('Veil Wild · Descent Expands'); break;
    case 'mysteryTransform':
      if (event.morpheusAuthoritative) await playBoardTransform(event, instant);
      showStatus(`Mystery Veil · Reveals ${event.revealedAs || event.target || 'Symbol'}`);
      break;
    case 'wildBomb': showStatus(`${Number(event.size) >= 3 ? 'Golden Rift' : 'Dream Rift'} · ${event.size || 2}×${event.size || 2} Wild Field`); break;
    case 'symbolPurge': showStatus(`Dawn Purge · ${(event.positions || []).length} Symbols Reforged`); break;
    case 'wildStar': showStatus(`Oneiric Star · ${event.target || 'Symbol'} Becomes Wild`); break;
    case 'specialTargetSelected':
      showStatus(`Oneiric Star · Targets ${event.targetFamily || event.target || 'Symbol'}`);
      break;
    case 'specialPositionsResolved':
      if (event.morpheusAuthoritative) await playBoardTransform(event, instant);
      showStatus(`${event.special || 'Special'} · ${(event.positions || []).length} Positions Resolved`);
      break;
    case 'meterProgress':
      setFeatureAchievement(`VEIL METER ${event.current || 0} / ${event.threshold || 4}`);
      showStatus(`Veil Ascent · ${featureState.achievement}`);
      break;
    case 'symbolUpgrade':
      setFeatureAchievement(`UPGRADE ${event.upgradeCount || event.level || 1} / ${event.maximumUpgrades || 4} · VEIL ${event.meterCurrent || 0} / ${event.meterThreshold || 4}`);
      showStatus(`Veil Ascent · ${featureState.achievement}`);
      break;
    case 'symbolUpgradeApply': showStatus('Veil Ascent · Upgraded Symbols Land'); break;
    case 'symbolMultiplierUpdate':
    case 'symbolMultiplierUpgrade':
      symbolMultipliers.set(event.symbolFamily || event.symbol, Number(event.current || event.multiplier) || 1);
      syncMechanicMarkers();
      setFeatureAchievement(`${event.symbolFamily || event.symbol || 'Symbol'} ${event.current || event.multiplier || 1}×`);
      showStatus(`Lucid Blessing · ${event.symbolFamily || event.symbol || 'Symbol'} ${event.current || event.multiplier || 1}×`);
      break;
    case 'modeGridStart':
      positionGridMode = event.mode || 'oneiric_nexus';
      for (const cell of event.cells || []) {
        const position = Array.isArray(cell.position) ? cell.position : [cell.position?.reel, cell.position?.row];
        positionMultipliers.set(`${Number(position[0])}:${Number(position[1])}`, Number(cell.value) || 1);
      }
      syncMechanicMarkers();
      setFeatureAchievement(`${(event.cells || []).length} POSITION GRID`);
      showStatus(`${positionGridMode === 'trickster_dream' ? 'Trickster Dream' : 'Oneiric Nexus'} · ${(event.cells || []).length} Position Grid Awakens`);
      break;
    case 'positionMultiplierGridUpdate':
      {
        const updates = event.updates || (event.position ? [{
          reel: event.position.reel,
          row: event.position.row,
          multiplier: event.current,
        }] : []);
        for (const update of updates) positionMultipliers.set(`${Number(update.reel)}:${Number(update.row)}`, Number(update.multiplier) || 1);
        syncMechanicMarkers();
        setFeatureAchievement(`${updates.length} POSITION${updates.length === 1 ? '' : 'S'} CHARGED`);
        showStatus(`${positionGridMode === 'trickster_dream' ? 'Trickster Dream' : 'Oneiric Nexus'} · ${updates.length} Position${updates.length === 1 ? '' : 's'} Double`);
      }
      break;
    case 'guaranteedSpecialReveal':
      highlightWins([{ positions: event.targetPositions || event.positions || [] }]);
      setFeatureAchievement(`RELIQUARY ${event.revealOrder || 1} / 3 · ${event.special || 'SPECIAL'}`);
      showStatus(`Nightmare Descent · ${featureState.achievement}`);
      break;
    case 'symbolBarProgress':
      highlightWins([{ positions: event.hits || event.positions || [] }]);
      setFeatureAchievement(`${event.symbolFamily || 'SYMBOL'} ${event.previous || 0} → ${event.current || 0} / ${event.threshold || 1}`);
      showStatus(`Veil Ascent · ${featureState.achievement}`);
      break;
    case 'rainingWilds':
      highlightWins([{ positions: (event.wilds || []).map(wild => wild.position) }]);
      setFeatureAchievement(`${(event.wilds || []).length} PREDETERMINED WILDS`);
      showStatus(`Raining Wilds · ${featureState.achievement}`);
      break;
    case 'stackedReels':
      {
        const positions = (event.reels || []).flatMap(reel => Array.from(
          { length: currentBoard[Number(reel)]?.length || 0 },
          (_, row) => ({ reel: Number(reel), row }),
        ));
        highlightWins([{ positions }]);
        setFeatureAchievement(`REELS ${(event.reels || []).map(reel => Number(reel) + 1).join(', ')} · ${event.symbol || 'SYMBOL'}`);
        showStatus(`Stacked Reels · ${featureState.achievement}`);
      }
      break;
    case 'guaranteedScatters':
      highlightWins([{ positions: event.positions || [] }]);
      setFeatureAchievement(`${event.count || 0} GATES · ${event.tier || 'FEATURE'}`);
      showStatus(`Gates of Sleep · ${featureState.achievement}`);
      break;
    case 'expandReelHeight':
      if (config.renderProfiles?.morpheusDreamfall && !dreamfallWorldActive) {
        dreamfallWorldActive = true;
        renderBoard(currentBoard);
      }
      if (event.morpheusAuthoritative && event.board) await settleReelMotion(event.board, instant);
      setFeatureAchievement(`REEL ${Number(event.reel) + 1} · ${event.rows || 4} ROWS`);
      showStatus(`Dreamfall · ${featureState.achievement}`);
      break;
    case 'tumbleChainProgress':
      setFeatureAchievement(`CHAIN HIT ${event.chainHit || event.current || 0}`);
      showStatus(`Dreamfall · ${featureState.achievement}`);
      break;
    case 'awardTumbleFreeSpins':
      if (featureState.active) {
        featureState.total = Number(event.totalFs || featureState.total + Number(event.amount || 1));
        featureState.achievement = `+${Number(event.amount || 1)} FREE SPIN · ${event.chainHit || 0}TH HIT`;
        syncFeatureProgress();
      }
      showStatus(`Dreamfall · ${featureState.achievement || '+1 Free Spin'}`);
      break;
    case 'maxWinReached':
      currentWin = Number(event.amount || 0) / 100;
      ui.winValue.textContent = `${currentWin.toFixed(2)}×`;
      if (featureState.active) { featureState.totalWin = currentWin; syncFeatureProgress(); }
      showFeatureFinale({ wincap: true, amount: Number(event.multiplier || currentWin) });
      showStatus('MAX MORPHEUS · 100,000×', 3200);
      break;
    case 'roundTerminated':
      featureState.active = false;
      syncFeatureProgress();
      showStatus('Dream Complete · Round Terminated', 2600);
      break;
    case 'lucidWildMultiplier': showStatus(`Lucid Wild · ${event.multiplier || 1}× Power`); break;
    case 'echoSplit': showStatus(`Echo Split · ${event.multiplier || 1}× Resonance`); break;
    case 'lucidMultiplier': ui.multiplier.textContent = `${event.effectiveMultiplier || event.multiplier || 1}×`; showStatus(`Lucid Power ${event.effectiveMultiplier || event.multiplier || 1}×`); break;
    case 'expandDreamfall': showStatus(`Dreamfall Expands · ${event.rows || 4} Rows`); break;
    case 'nexusCharge': showStatus(`Oneiric Nexus · ${(event.positions || []).length} Charged`); break;
    case 'maxDream': showStatus(`Max Dream · ${event.multiplier || 2}×`, 2600); break;
    case 'modeBoardSelection':
      showStatus(`${event.kind === 'scatter' ? 'Dream Enhancer' : event.kind === 'special' ? 'Trickster Dream' : 'Dream Selection'} · Chosen from ${event.candidateCount || 1} Dreams`, 1800);
      break;
  }
  await Promise.all(channelMotions);
  if (!instant && !presentationRecipe(event?.type)) await wait(turbo ? 90 : event?.type === 'reveal' ? 500 : 260);
}

function flash(message) {
  if (authoredMotionEnabled()) {
    showStatus(message, turbo ? 900 : 1800);
    return;
  }
  ui.message.textContent = message;
  ui.message.classList.add('is-visible');
  setTimeout(() => ui.message.classList.remove('is-visible'), turbo ? 500 : 1200);
}

async function present({ events, snapshotEvents, recordEvent }) {
  const combined = [...snapshotEvents, ...events];
  if (combined.length && combined.every(event => (
    event?.contractFingerprint === config.authoritativeRuntime?.contractFingerprint
    && Number(event?.schemaVersion) === Number(config.authoritativeRuntime?.eventSchemaVersion)
  ))) {
    return presentMorpheusAuthoritative({ events, snapshotEvents, recordEvent });
  }
  let latestCheckpoint = null;
  let checkpointWorker = null;
  const startCheckpointWorker = () => {
    if (checkpointWorker || latestCheckpoint === null) return;
    checkpointWorker = (async () => {
      while (latestCheckpoint !== null) {
        const index = latestCheckpoint;
        latestCheckpoint = null;
        await recordEvent(index).catch(error => console.warn('Progress tracking failed', error));
      }
    })().finally(() => {
      checkpointWorker = null;
      startCheckpointWorker();
    });
  };
  const queueCheckpoint = index => {
    latestCheckpoint = index;
    startCheckpointWorker();
  };
  const flushCheckpoints = async () => {
    while (checkpointWorker || latestCheckpoint !== null) {
      startCheckpointWorker();
      if (checkpointWorker) await checkpointWorker;
    }
  };
  for (const event of snapshotEvents) await applyEvent(event, { instant: true });
  for (const event of events) {
    await applyEvent(event);
    queueCheckpoint(event.index);
  }
  await flushCheckpoints();
}

function loadMorpheusAuthoritativeRuntime() {
  if (!config.authoritativeRuntime?.enabled) throw new Error('Morpheus authoritative runtime is not enabled.');
  morpheusAuthoritativeReady ||= import(`./${config.authoritativeRuntime.runtimeFile}`).then(module => {
    if (module.MORPHEUS_CONTRACT_FINGERPRINT !== config.authoritativeRuntime.contractFingerprint) {
      throw new Error('Morpheus portable runtime contract fingerprint drifted.');
    }
    return module;
  });
  return morpheusAuthoritativeReady;
}

async function presentMorpheusAuthoritative({ events, snapshotEvents, recordEvent }) {
  const portable = await loadMorpheusAuthoritativeRuntime();
  const combined = [...snapshotEvents, ...events];
  const motionMode = prefersReducedMotion() ? 'reduced' : turbo ? 'fast' : 'normal';
  const session = portable.createMorpheusPortableSession({
    events: combined,
    motionMode,
    catalog: config.authoritativeRuntime.presentationCatalog,
  });
  const publishProgress = (event, stage, extra = {}) => {
    window.StakeStudioGameHooks ||= {};
    const progress = {
      routeId: session.routeId,
      eventIndex: Number(event?.index),
      eventType: event?.type,
      stage,
      at: new Date().toISOString(),
      ...extra,
    };
    window.StakeStudioGameHooks.morpheusAuthoritativeProgress = progress;
    document.documentElement.dataset.morpheusAuthoritativeProgress = JSON.stringify(progress);
  };
  for (let index = 0; index < combined.length; index++) {
    publishProgress(combined[index], 'dispatching');
    const packet = session.dispatch(combined[index]);
    const snapshot = index < snapshotEvents.length;
    publishProgress(combined[index], 'rendering-dom', { acknowledgementId: packet.command.acknowledgementId });
    await applyEvent(packet.presentationEvent, { instant: snapshot });
    publishProgress(combined[index], 'rendering-governed-plan', { semanticHash: packet.presentationPlan.semanticHash });
    await playMorpheusPortablePlan(packet, { instant: snapshot });
    publishProgress(combined[index], 'acknowledging');
    session.acknowledge({
      id: packet.command.acknowledgementId,
      evidence: `compiled-rendered:${packet.command.eventIndex}:${packet.command.eventType}`,
    });
    publishProgress(combined[index], 'acknowledged');
    if (!snapshot) await recordEvent(combined[index].index);
  }
  const report = session.snapshot();
  window.StakeStudioGameHooks ||= {};
  window.StakeStudioGameHooks.morpheusAuthoritative = report;
  window.StakeStudioGameHooks.morpheusAuthoritativeProgress = {
    routeId: report.routeId,
    eventIndex: combined.length - 1,
    eventType: combined.at(-1)?.type,
    stage: 'completed',
    at: new Date().toISOString(),
  };
  document.documentElement.dataset.morpheusAuthoritativeReport = JSON.stringify(report);
  window.StakeStudioGameHooks.handleMorpheusAuthoritativeComplete?.(report);
  return report;
}

async function loadMorpheusAuthoritativeQaRoute() {
  const routeId = params.get('morpheusProof');
  if (!routeId) return null;
  if (!runtime.launch.studioPreview || !config.authoritativeRuntime?.qaFile) {
    throw new Error('Morpheus governed proof routes are available only in Studio Preview.');
  }
  morpheusAuthoritativeQaReady ||= fetch(`./${config.authoritativeRuntime.qaFile}`, { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('Morpheus authoritative QA book is unavailable.');
    return response.json();
  });
  const book = await morpheusAuthoritativeQaReady;
  if (book.contractFingerprint !== config.authoritativeRuntime.contractFingerprint) {
    throw new Error('Morpheus authoritative QA book fingerprint drifted.');
  }
  const route = book.routes?.[routeId];
  if (!route?.events?.length) throw new Error(`Unknown Morpheus governed proof route ${routeId}.`);
  return route;
}

async function playMorpheusPortablePlan(packet, { instant = false } = {}) {
  const plan = packet?.presentationPlan;
  if (!plan || plan.contractFingerprint !== config.authoritativeRuntime?.contractFingerprint) {
    throw new Error('Morpheus portable presentation plan is missing or drifted.');
  }
  if (!plan.previewReady) {
    throw new Error(`Morpheus portable presentation assets are incomplete: ${JSON.stringify(plan.missing)}`);
  }
  if (instant) return { instant: true, semanticHash: plan.semanticHash };
  const audio = plan.semantic.audio || {};
  for (const cueId of audio.cueIds || []) {
    playStinger(cueId === '$winTier' ? resolveWinTier(eventAmount(packet.presentationEvent)) : cueId);
  }
  for (const state of plan.semantic.characterStates || []) {
    if (!spineController) initializeSpineRuntime();
    const transitioned = await spineReady.then(controller => controller?.transition?.(state));
    if (!transitioned && !prefersReducedMotion()) throw new Error(`Morpheus character state ${state} could not be presented.`);
  }
  const primaryMotion = plan.semantic.visual?.assetIds?.[0] || null;
  if (primaryMotion) {
    if (!effectsController) initializeVisualEffects();
    const played = await effectsReady.then(controller => controller?.playAuthoredMotion?.(primaryMotion, {
      durationMs: plan.durationMs,
      reducedMotion: plan.motionMode === 'reduced' || prefersReducedMotion(),
    }));
    if (played !== true) throw new Error(`Morpheus authored motion ${primaryMotion} could not be presented.`);
  }
  return {
    semanticHash: plan.semanticHash,
    primaryMotion,
    audioCueIds: [...(audio.cueIds || [])],
    characterStates: [...(plan.semantic.characterStates || [])],
  };
}

function setBusy(value) {
  busy = value;
  ui.play.disabled = value && autoSpinsRemaining <= 0;
  ui.bet.disabled = value;
  ui.mode.disabled = value;
  updateDashboard();
}

function applyJurisdiction(flags = {}) {
  document.documentElement.dataset.socialCasino = String(Boolean(flags.socialCasino));
  document.documentElement.dataset.autoplay = flags.disabledAutoplay ? 'disabled' : 'confirmation-required';
  document.documentElement.dataset.slamstop = flags.disabledSlamstop ? 'disabled' : 'available';
  document.documentElement.dataset.superTurbo = flags.disabledSuperTurbo ? 'disabled' : 'available';
  ui.fullscreen.hidden = Boolean(flags.disabledFullscreen);
  ui.turboControl.hidden = Boolean(flags.disabledTurbo);
  ui.autoControl.hidden = Boolean(flags.disabledAutoplay);
  ui.bonusControl.hidden = Boolean(flags.disabledBuyFeature);
  if (flags.disabledBuyFeature) for (const option of [...ui.mode.options]) if (modeByName(option.value).isBuyBonus) option.remove();
  ui.rtp.hidden = !flags.displayRTP;
  ui.netPosition.hidden = !flags.displayNetPosition;
  ui.sessionTimer.hidden = !flags.displaySessionTimer;
  if (![...ui.mode.options].some(option => option.value === ui.mode.value)) ui.mode.value = ui.mode.options[0]?.value || 'base';
  updateDashboard();
}

function updateBalance(balance) {
  if (!ui.balanceValue || !balance) return;
  ui.balanceValue.textContent = formatAmount(balance.amount, balance.currency);
}

function populateControls(authConfig = {}) {
  const levels = authConfig.betLevels?.length ? authConfig.betLevels : [10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];
  betLevels = levels.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  ui.bet.replaceChildren(...levels.map(value => { const option = node('option', '', formatAmount(value, runtime.balance?.currency || runtime.launch.currency)); option.value = value; return option; }));
  ui.bet.value = String(levels.includes(authConfig.defaultBetLevel) ? authConfig.defaultBetLevel : levels[0]);
  ui.mode.replaceChildren(...config.betModes.map(mode => { const option = node('option', '', `${mode.label} · ${mode.cost}×`); option.value = mode.name; return option; }));
  if (runtime.launch.mode && config.betModes.some(mode => mode.name === runtime.launch.mode)) ui.mode.value = runtime.launch.mode;
  updateDashboard();
}

function updateDashboard() {
  if (!ui.play || !ui.bet || !ui.mode) return;
  const mode = modeByName(ui.mode.value);
  const baseAmount = Number(ui.bet.value || betLevels[0] || 0);
  const totalAmount = baseAmount * Math.max(1, Number(mode.cost) || 1);
  ui.modeChip.textContent = modeLabel(mode);
  ui.betBaseValue.textContent = formatAmount(baseAmount, runtime.balance?.currency || runtime.launch.currency);
  ui.betTotalValue.textContent = `${socialText('Total')} ${formatAmount(totalAmount, runtime.balance?.currency || runtime.launch.currency)}`;
  ui.play.textContent = autoSpinsRemaining > 0 ? 'STOP' : busy ? 'PLAYING' : runtime.launch.replay ? 'REPLAY' : 'SPIN';
  ui.play.disabled = busy && autoSpinsRemaining <= 0;
  ui.autoCount.textContent = autoSpinsRemaining > 0 ? String(autoSpinsRemaining) : 'AUTO';
  ui.autoControl.classList.toggle('is-active', autoSpinsRemaining > 0);
  ui.turboControl.classList.toggle('is-active', turbo);
  ui.autoControl.setAttribute('aria-pressed', String(autoSpinsRemaining > 0));
  ui.autoControl.setAttribute('aria-label', autoSpinsRemaining > 0 ? `Stop autoplay · ${autoSpinsRemaining} remaining` : 'Autoplay');
  ui.turboControl.setAttribute('aria-pressed', String(turbo));
  ui.turboControl.setAttribute('aria-label', turbo ? 'Fast play on' : 'Fast play off');
  ui.decreaseBet.disabled = busy || betLevels.indexOf(baseAmount) <= 0;
  ui.increaseBet.disabled = busy || betLevels.indexOf(baseAmount) >= betLevels.length - 1;
}

function stepBet(direction) {
  if (busy) return;
  const current = Number(ui.bet.value);
  const index = Math.max(0, betLevels.indexOf(current));
  const next = betLevels[Math.max(0, Math.min(betLevels.length - 1, index + direction))];
  if (next !== undefined) ui.bet.value = String(next);
  updateDashboard();
}

function selectMode(name) {
  const option = [...ui.mode.options].find(item => item.value === name);
  if (!option || busy) return;
  ui.mode.value = option.value;
  updateDashboard();
}

function closeModal(backdrop, { restoreFocus = true } = {}) {
  if (!backdrop?.isConnected) return;
  const returnFocus = backdrop.returnFocus;
  backdrop.remove();
  if (restoreFocus && returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
}

function modalShell(title, className = '') {
  closeModal(document.querySelector('.modal-backdrop'), { restoreFocus: false });
  const returnFocus = document.activeElement;
  const backdrop = node('div', 'modal-backdrop');
  const modal = node('article', `modal ${className}`.trim());
  const header = node('header');
  const heading = node('h2', '', title); heading.id = `game-modal-title-${++modalSequence}`;
  const close = node('button', 'icon-button', '×'); close.type = 'button'; close.setAttribute('aria-label', `Close ${title}`);
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', heading.id);
  backdrop.returnFocus = returnFocus;
  header.append(heading, close); modal.append(header); backdrop.append(modal); app.append(backdrop);
  close.addEventListener('click', () => closeModal(backdrop));
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop); });
  backdrop.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeModal(backdrop); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  queueMicrotask(() => close.focus());
  return { backdrop, modal, close };
}

function showGameMenu() {
  const { backdrop, modal } = modalShell('Menu', 'player-menu');
  const entries = node('div', 'menu-entries');
  const info = controlButton('info', 'Game Info', 'menu-entry');
  const sound = controlButton('sound', soundEnabled ? 'Sound On' : 'Sound Off', 'menu-entry');
  const fast = controlButton('turbo', turbo ? 'Fast Play On' : 'Fast Play Off', 'menu-entry');
  sound.setAttribute('aria-pressed', String(soundEnabled));
  fast.setAttribute('aria-pressed', String(turbo));
  entries.append(info, sound, fast); modal.append(entries);
  info.addEventListener('click', () => { closeModal(backdrop); showInfo(); });
  sound.addEventListener('click', () => {
    setSoundEnabled(!soundEnabled);
    sound.setAttribute('aria-label', soundEnabled ? 'Sound On' : 'Sound Off');
    sound.setAttribute('aria-pressed', String(soundEnabled));
    sound.querySelector('span').textContent = soundEnabled ? 'Sound On' : 'Sound Off';
    showStatus(soundEnabled ? 'Sound on' : 'Sound off');
  });
  fast.addEventListener('click', () => {
    turbo = !turbo;
    fast.setAttribute('aria-label', turbo ? 'Fast Play On' : 'Fast Play Off');
    fast.setAttribute('aria-pressed', String(turbo));
    fast.querySelector('span').textContent = turbo ? 'Fast Play On' : 'Fast Play Off';
    updateDashboard(); showStatus(turbo ? 'Fast play on' : 'Fast play off');
  });
}

function showModeMenu() {
  if (busy || runtime.launch.replay) return;
  const { backdrop, modal } = modalShell(socialText('Game Modes'), 'mode-menu');
  const intro = node('p', 'modal-intro', socialText('Choose a game type. The full cost is shown before you confirm.'));
  const cards = node('div', 'mode-card-grid');
  let chosen = ui.mode.value;
  const available = new Set([...ui.mode.options].map(option => option.value));
  for (const mode of config.betModes.filter(item => available.has(item.name))) {
    const card = node('button', `mode-card${mode.name === chosen ? ' is-selected' : ''}`); card.type = 'button'; card.dataset.mode = mode.name;
    card.setAttribute('aria-pressed', String(mode.name === chosen));
    const heading = node('strong', '', modeLabel(mode));
    const total = Number(ui.bet.value || 0) * Math.max(1, Number(mode.cost) || 1);
    card.append(heading, node('span', 'mode-cost', formatAmount(total, runtime.balance?.currency || runtime.launch.currency)), node('small', '', socialText(mode.description || `${mode.cost}× play amount`)), node('small', 'mode-math', `${(Number(mode.rtp || config.rtp) * 100).toFixed(2)}% RTP · ${Number(mode.maxWin || config.maxWin).toLocaleString()}× max`));
    if (config.controls?.modeCard) card.style.setProperty('--mode-card-art', `url(${JSON.stringify(config.controls.modeCard).slice(1, -1)})`);
    card.addEventListener('click', () => { chosen = mode.name; for (const item of cards.children) { item.classList.toggle('is-selected', item === card); item.setAttribute('aria-pressed', String(item === card)); } });
    cards.append(card);
  }
  const confirm = node('button', 'primary-button modal-confirm', 'CONFIRM MODE'); confirm.type = 'button';
  confirm.addEventListener('click', () => { selectMode(chosen); closeModal(backdrop); showStatus(`${modeLabel(modeByName(chosen))} selected`); });
  modal.append(intro, cards, confirm);
}

function stopAutoSpins(message = 'Autoplay stopped') {
  clearTimeout(autoSpinTimer); autoSpinTimer = null; autoSpinsRemaining = 0; updateDashboard();
  if (message) showStatus(message);
}

function queueAutoSpin() {
  clearTimeout(autoSpinTimer);
  if (autoSpinsRemaining <= 0 || runtime.jurisdiction?.disabledAutoplay) return updateDashboard();
  autoSpinTimer = setTimeout(() => play({ automatic: true }), turbo ? 160 : 520);
  updateDashboard();
}

function showAutoMenu() {
  if (busy || runtime.launch.replay || runtime.jurisdiction?.disabledAutoplay) return;
  const { backdrop, modal } = modalShell('Autoplay', 'auto-menu');
  modal.append(node('p', 'modal-intro', 'Choose a limited number of sequential rounds. You can stop after any round.'));
  const choices = node('div', 'auto-choices');
  for (const count of [10, 25, 50]) {
    const choice = node('button', `secondary-button${count === pendingAutoSpins ? ' is-selected' : ''}`, String(count)); choice.type = 'button';
    choice.setAttribute('aria-pressed', String(count === pendingAutoSpins));
    choice.addEventListener('click', () => { pendingAutoSpins = count; for (const item of choices.children) { item.classList.toggle('is-selected', item === choice); item.setAttribute('aria-pressed', String(item === choice)); } });
    choices.append(choice);
  }
  const confirm = node('button', 'primary-button modal-confirm', 'START AUTOPLAY'); confirm.type = 'button';
  confirm.addEventListener('click', () => { closeModal(backdrop); autoSpinsRemaining = pendingAutoSpins; updateDashboard(); play({ automatic: true }); });
  modal.append(choices, confirm);
}

function buildShell() {
  app.replaceChildren();
  document.documentElement.dataset.layout = runtime.launch.studioPreview && runtime.launch.studioViewport === 'mini' ? 'mini' : runtime.launch.device;
  const shell = node('div', 'game-shell'); ui.shell = shell;
  const palette = config.palette || [];
  shell.style.setProperty('--theme-dark', palette[0] || '#080d15');
  shell.style.setProperty('--theme-mid', palette[1] || '#20354c');
  shell.style.setProperty('--accent', palette[2] || '#31e6c2');
  shell.style.setProperty('--accent-2', palette[3] || '#6ea8ff');
  shell.style.setProperty('--dream-glow', palette[6] || palette[3] || '#55d6c2');
  shell.style.setProperty('--dream-hot', palette[5] || '#d6a84b');
  shell.style.setProperty('--dream-pale', palette[4] || '#e9e4ff');
  shell.style.setProperty('--board-ratio', String(config.grid.reels / Math.max(...config.grid.rows)));
  if (config.background) shell.style.setProperty('--theme-background', `url(${JSON.stringify(config.background).slice(1, -1)})`);

  const top = node('header', 'topbar');
  const brand = node('div', 'brand'); brand.append(node('strong', '', config.name), node('span', '', config.providerName || 'Independent Studio'));
  const actions = node('div', 'top-actions');
  ui.rtp = node('span', 'optional', `${(config.rtp * 100).toFixed(2)}% RTP`); ui.rtp.hidden = true;
  ui.fullscreen = node('button', 'icon-button optional', '⛶'); ui.fullscreen.type = 'button'; ui.fullscreen.title = 'Fullscreen'; ui.fullscreen.setAttribute('aria-label', 'Fullscreen');
  actions.append(ui.rtp, ui.fullscreen); top.append(brand, actions);

  const stageWrap = node('section', 'stage-wrap');
  const stage = node('div', 'stage'); ui.board = node('div', 'board');
  const authoredWorldLayers = [];
  const cabinetWidth = Math.max(1, Number(config.cabinetSize?.width) || 1280);
  const cabinetHeight = Math.max(1, Number(config.cabinetSize?.height) || 800);
  for (const layer of config.cabinetLayers || []) {
    if (!layer?.src) continue;
    const image = node('img', `authored-world-layer authored-world-${layer.role || 'cabinet'}`);
    image.src = layer.src; image.alt = ''; image.draggable = false;
    image.dataset.assetId = String(layer.id || '');
    image.style.cssText = `left:${Number(layer.x || 0) / cabinetWidth * 100}%;top:${Number(layer.y || 0) / cabinetHeight * 100}%;width:${Number(layer.width || cabinetWidth) / cabinetWidth * 100}%;height:${Number(layer.height || cabinetHeight) / cabinetHeight * 100}%;opacity:${Number(layer.opacity ?? 1)};z-index:${Number(layer.zIndex || 0)};mix-blend-mode:${layer.blendMode || 'normal'}`;
    authoredWorldLayers.push(image);
  }
  for (const asset of Object.values(config.environmentAssets || {})) {
    if (!asset?.src) continue;
    const image = node('img', 'authored-world-layer authored-world-environment');
    image.src = asset.src; image.alt = ''; image.draggable = false;
    image.dataset.assetId = String(asset.id || '');
    image.style.cssText = `left:${Number(asset.x || 0) / cabinetWidth * 100}%;top:${Number(asset.y || 0) / cabinetHeight * 100}%;width:${Number(asset.width || 1) / cabinetWidth * 100}%;height:${Number(asset.height || 1) / cabinetHeight * 100}%`;
    authoredWorldLayers.push(image);
  }
  const dreamfallCabinet = config.renderProfiles?.morpheusDreamfall?.cabinet;
  if (dreamfallCabinet?.asset?.src) {
    ui.dreamfallCabinet = node('img', 'authored-world-layer authored-world-dreamfall-cabinet');
    ui.dreamfallCabinet.src = dreamfallCabinet.asset.src;
    ui.dreamfallCabinet.alt = '';
    ui.dreamfallCabinet.draggable = false;
    ui.dreamfallCabinet.hidden = true;
    ui.dreamfallCabinet.dataset.cabinetProfile = dreamfallCabinet.format;
    ui.dreamfallCabinet.style.cssText = 'inset:0;width:100%;height:100%;z-index:59';
    authoredWorldLayers.push(ui.dreamfallCabinet);
  }
  const fallbackEffects = [];
  if (config.presentationEffects?.motionGraphics?.htmlVisibleEffects !== false) {
    const atmosphere = node('div', 'dream-atmosphere');
    if (config.animation?.motion?.environment?.enabled !== false && config.animation?.motion?.environment) {
      atmosphere.append(
        node('i', 'dream-moon'), node('i', 'dream-portal dream-portal-left'), node('i', 'dream-portal dream-portal-right'),
        node('i', 'dream-fog dream-fog-back'), node('i', 'dream-fog dream-fog-front'),
      );
    }
    const ambient = node('div', 'ambient-motes');
    const particle = (config.animation?.motion?.particles || []).find(item => item.type === 'emberField');
    if (particle) {
      const count = Math.max(8, Math.min(40, Number(particle.count) || 24));
      ambient.style.setProperty('--mote-color', particle.color || 'var(--dream-glow)');
      ambient.style.setProperty('--mote-secondary', particle.secondaryColor || 'var(--dream-pale)');
      for (let index = 0; index < count; index++) {
        const mote = node('i');
        mote.style.cssText = `--x:${(index * 37 + 11) % 100}%;--drift:${((index * 23) % 80) - 40}px;--delay:${-((index * .47) % 8).toFixed(2)}s;--size:${2 + (index * 7) % 6}px;--duration:${((5.5 + (index * 13) % 55 / 10) / Math.max(.35, Number(particle.speed) || 1)).toFixed(2)}s`;
        ambient.append(mote);
      }
    }
    fallbackEffects.push(atmosphere, ambient);
  }
  ui.spineHost = node('div', 'spine-runtime-host');
  ui.effectsHost = node('div', 'visual-effects-host');
  const overlay = node('div', 'stage-overlay');
  ui.message = node('div', 'stage-message');
  ui.featureProgress = node('section', 'feature-progress'); ui.featureProgress.setAttribute('aria-live', 'polite');
  if (config.presentationAssets?.modePortal) { const art = node('img', 'presentation-art'); art.src = config.presentationAssets.modePortal; art.alt = ''; ui.featureProgress.append(art); }
  const progressCopy = node('div', 'feature-progress-copy');
  ui.featureMode = node('strong', '', 'Dream Feature'); ui.featureCount = node('span'); ui.featureTotal = node('b'); ui.featureAchievement = node('small');
  progressCopy.append(ui.featureMode, ui.featureCount, ui.featureTotal, ui.featureAchievement); ui.featureProgress.append(progressCopy);
  ui.featureIntro = node('section', 'feature-intro');
  if (config.presentationAssets?.modePortal) { const art = node('img', 'presentation-art'); art.src = config.presentationAssets.modePortal; art.alt = ''; ui.featureIntro.append(art); }
  const introCopy = node('div', 'feature-intro-copy'); ui.featureIntroTitle = node('strong'); ui.featureIntroMeta = node('span'); introCopy.append(ui.featureIntroTitle, ui.featureIntroMeta); ui.featureIntro.append(introCopy);
  ui.featureFinale = node('section', 'feature-finale'); ui.featureFinale.setAttribute('aria-live', 'assertive');
  if (config.presentationAssets?.verdictPlate) { const art = node('img', 'presentation-art'); art.src = config.presentationAssets.verdictPlate; art.alt = ''; ui.featureFinale.append(art); }
  const finaleCopy = node('div', 'feature-finale-copy'); ui.featureFinaleKicker = node('span'); ui.featureFinaleTitle = node('strong'); ui.featureFinaleMeta = node('small'); finaleCopy.append(ui.featureFinaleKicker, ui.featureFinaleTitle, ui.featureFinaleMeta); ui.featureFinale.append(finaleCopy);
  overlay.append(ui.message, ui.featureProgress, ui.featureIntro, ui.featureFinale); stage.append(ui.board, overlay); stageWrap.append(stage);
  stage.replaceChildren(...fallbackEffects, ...authoredWorldLayers, ui.board, ui.spineHost, ui.effectsHost, overlay);
  ui.status = node('div', 'status-strip');

  const hud = node('footer', 'hud player-dashboard');
  ui.bet = node('select', 'sr-only'); ui.bet.setAttribute('aria-label', socialText('Bet amount'));
  ui.mode = node('select', 'sr-only'); ui.mode.setAttribute('aria-label', 'Game mode');
  const left = node('div', 'dashboard-cluster dashboard-left');
  ui.menuControl = controlButton('menu', 'Menu');
  ui.bonusControl = controlButton('bonus', socialText('Bonus and game modes'));
  const balance = node('div', 'balance'); balance.append(node('span', '', runtime.launch.replay || runtime.launch.studioPreview ? 'Mode' : 'Balance')); ui.balanceValue = node('strong', '', runtime.launch.replay ? 'Replay' : runtime.launch.studioPreview ? 'Studio Preview' : '—'); balance.append(ui.balanceValue);
  left.append(ui.menuControl, ui.bonusControl, balance);

  const center = node('div', 'dashboard-cluster dashboard-center');
  ui.modeChip = node('button', 'mode-chip', 'Base Game'); ui.modeChip.type = 'button'; ui.modeChip.setAttribute('aria-label', 'Select game mode');
  const wager = node('div', 'wager-stepper');
  ui.decreaseBet = controlButton('decrease', 'Decrease play amount', 'bet-step');
  const wagerReadout = node('div', 'wager-readout'); wagerReadout.append(node('span', '', socialText('Play amount'))); ui.betBaseValue = node('strong', '', '—'); ui.betTotalValue = node('small', '', '—'); wagerReadout.append(ui.betBaseValue, ui.betTotalValue);
  ui.increaseBet = controlButton('increase', 'Increase play amount', 'bet-step');
  wager.append(ui.decreaseBet, wagerReadout, ui.increaseBet);
  ui.play = node('button', 'primary-button', 'SPIN'); ui.play.type = 'button';
  center.append(ui.modeChip, wager, ui.play);
  if (config.controls?.spinButtonAsset) {
    shell.style.setProperty('--spin-button-art', `url(${JSON.stringify(config.controls.spinButtonAsset).slice(1, -1)})`);
    ui.play.dataset.authoredArt = 'true';
  }
  const right = node('div', 'dashboard-cluster dashboard-right');
  const win = node('div', 'stat right-stat'); win.append(node('span', '', 'Win')); ui.winValue = node('strong', '', '0.00×'); win.append(ui.winValue);
  ui.netPosition = node('small', '', 'Net position'); ui.netPosition.hidden = true; win.append(ui.netPosition);
  ui.sessionTimer = node('small', '', '00:00'); ui.sessionTimer.hidden = true; win.append(ui.sessionTimer);
  ui.autoControl = controlButton('autoplay', 'Autoplay'); ui.autoCount = ui.autoControl.querySelector('span');
  ui.turboControl = controlButton('turbo', 'Fast play');
  right.append(win, ui.autoControl, ui.turboControl);
  ui.multiplier = node('span', 'sr-only', '1×');
  hud.append(ui.bet, ui.mode, left, center, right); shell.append(top, stageWrap, hud, ui.status, ui.multiplier);
  if (runtime.launch.replay) shell.append(node('div', 'replay-banner', socialText('Verified Bet Replay')));
  app.append(shell);
  populateControls(runtime.config || {});
  renderBoard(config.previewBoard);
  scheduleEnhancementWarmup();

  ui.fullscreen.addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  ui.menuControl.addEventListener('click', showGameMenu);
  ui.bonusControl.addEventListener('click', showModeMenu);
  ui.modeChip.addEventListener('click', showModeMenu);
  ui.decreaseBet.addEventListener('click', () => stepBet(-1));
  ui.increaseBet.addEventListener('click', () => stepBet(1));
  ui.autoControl.addEventListener('click', () => autoSpinsRemaining > 0 ? stopAutoSpins() : showAutoMenu());
  ui.turboControl.addEventListener('click', () => { turbo = !turbo; updateDashboard(); showStatus(turbo ? 'Fast play on' : 'Fast play off'); });
  ui.play.addEventListener('click', play);
  document.addEventListener('keydown', event => {
    const interactive = event.target instanceof Element && Boolean(event.target.closest('button, input, select, textarea, a, [contenteditable="true"], [role="button"], [role="dialog"]'));
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.code === 'Space' && !event.repeat && !modified && !interactive && !runtime.jurisdiction?.disabledSpacebar && !busy && !isModalOpen()) {
      event.preventDefault(); ui.play.click();
    }
  });
  setInterval(() => { if (!ui.sessionTimer.hidden) { const elapsed = Math.floor((Date.now() - sessionStartedAt) / 1000); ui.sessionTimer.textContent = `${String(Math.floor(elapsed / 60)).padStart(2,'0')}:${String(elapsed % 60).padStart(2,'0')}`; } }, 1000);
}

let enhancementWarmupStarted = false;
function scheduleEnhancementWarmup() {
  if (enhancementWarmupStarted) return;
  enhancementWarmupStarted = true;
  const start = () => {
    initializeSpineRuntime();
    initializeVisualEffects();
  };
  globalThis.requestAnimationFrame?.(() => globalThis.setTimeout(start, 0)) || globalThis.setTimeout(start, 0);
}

function initializeSpineRuntime() {
  if (!config.animation?.enabled) return;
  spineReady = import('./spine-runtime.js')
    .then(module => module.mountSpineRuntime({ host: ui.spineHost, manifestUrl: config.animation.manifest }))
    .then(controller => (spineController = controller));
}

function initializeVisualEffects() {
  const enabled = (config.visualEffects?.bindings || []).some(binding => binding.enabled !== false)
    || (config.visualEffects?.motionAssets || []).length > 0
    || config.presentationEffects?.motionGraphics?.enabled;
  if (!enabled) return;
  effectsReady = import('./visual-effects-runtime.js')
    .then(module => module.mountVisualEffects({ host: ui.effectsHost, board: ui.board, config, getTurbo: () => turbo }))
    .then(controller => (effectsController = controller));
}

function isModalOpen() { return Boolean(document.querySelector('.modal-backdrop')); }
function showInfo() {
  const information = config.playerInformation || {};
  const { modal } = modalShell('Game Information', 'info-modal');
  const selectedMode = modeByName(ui.mode?.value);
  const payMultiplier = Number(selectedMode.settlementMultiplier) || 1;
  const formatPay = value => Number((Number(value) * payMultiplier).toFixed(6)).toString();
  const rules = node('section'); rules.append(node('h3', '', information.winSystem?.label || 'Rules'), node('p', '', socialText(information.winSystem?.description || config.rules.summary)), node('p', '', socialText(config.rules.summary)));
  const modes = node('section'); modes.append(node('h3', '', 'Selectable Play Modes')); const modeList = node('ul'); for (const mode of config.betModes) modeList.append(node('li', '', socialText(`${mode.label}: ${mode.cost}× play amount · ${(mode.rtp * 100).toFixed(2)}% RTP · ${mode.maxWin.toLocaleString()}× maximum win${mode.description ? ` · ${mode.description}` : ''}`))); modes.append(modeList);
  const governed = (information.governedModes || []).filter(mode => !mode.selectable);
  if (governed.length) {
    modes.append(node('h3', '', 'Feature and Governed Modes'));
    const governedList = node('ul');
    for (const mode of governed) {
      const access = mode.releaseGated ? 'price pending approval' : mode.entryPolicy === 'natural' ? 'natural entry only' : mode.entryPolicy;
      governedList.append(node('li', '', socialText(`${mode.label}: ${access}. ${mode.description || ''}`)));
    }
    modes.append(governedList);
  }
  const paytable = node('section'); paytable.append(node('h3', '', `${modeLabel(selectedMode)} Symbol Payouts`)); const table = node('table'); const head = node('tr'); head.append(node('th', '', 'Symbol'), node('th', '', 'Payout per way')); table.append(head); for (const symbol of config.symbols) { const row = node('tr'); row.append(node('td', '', symbol.name), node('td', '', Object.entries(symbol.payouts || {}).map(([count, payout]) => `${count}: ${formatPay(payout)}×`).join(' · ') || (symbol.special.join(', ') || '—'))); table.append(row); } paytable.append(table, node('p', 'modal-note', `Values include the ${modeLabel(selectedMode)} settlement scale. Ways, contributing multipliers, and cascades combine first; the resulting spin win settles in 0.1× increments.`));
  const mechanics = node('section'); mechanics.append(node('h3', '', 'Features')); const featureList = node('ul'); for (const item of config.rules.special || []) featureList.append(node('li', '', socialText(item))); for (const item of config.rules.mechanics) featureList.append(node('li', '', socialText(item))); for (const item of config.rules.triggers) featureList.append(node('li', '', socialText(item))); mechanics.append(featureList);
  const guide = node('section'); guide.append(node('h3', '', 'Controls'), node('p', '', socialText(config.rules.controls || 'Bet starts a round. Select the bet amount and mode before starting.')));
  const disclaimer = node('section'); disclaimer.append(node('h3', '', 'Important'), node('p', '', socialText(config.rules.disclaimer)));
  modal.append(rules, modes, paytable, mechanics, guide, disclaimer);
}

async function play({ automatic = false } = {}) {
  if (!automatic && autoSpinsRemaining > 0) return stopAutoSpins();
  if (busy) return;
  if (automatic) {
    if (autoSpinsRemaining <= 0) return;
    autoSpinsRemaining -= 1;
  }
  setBusy(true); currentWin = 0; ui.winValue.textContent = '0.00×'; highlightWins([]); clearMechanicState();
  hideFeatureFinale();
  if (!featureState.active) setMusic('baseMusic');
  beginReelMotion();
  void playPresentationEvent({ type: 'spinStart' });
  void spineReady.then(controller => controller?.play({ type: 'spinStart' }));
  try {
    if (runtime.launch.replay) await runtime.playReplay(replayData, present);
    else if (runtime.launch.studioPreview) {
      const governedRoute = await loadMorpheusAuthoritativeQaRoute();
      await present({ events: governedRoute?.events || config.previewEvents, snapshotEvents: [], recordEvent: async () => {} });
    }
    else {
      const mode = modeByName(ui.mode.value);
      await runtime.play({ amount: Number(ui.bet.value), mode: mode.name, modeConfig: mode, present });
    }
  } catch (error) { ui.board.classList.remove('is-spinning', 'is-settling'); stopAutoSpins('Autoplay stopped'); showError(error, false); }
  finally { setBusy(false); if (autoSpinsRemaining > 0) queueAutoSpin(); }
}

function showError(error, fatal = true) {
  const message = error?.code === 'ERR_IPB' ? 'Insufficient balance for this play.' : error?.code === 'ERR_IS' ? 'Your session has expired. Reload from the casino.' : error?.message || 'The game could not continue.';
  if (!fatal) { showStatus(message, 5000); return; }
  app.replaceChildren(); const screen = node('section', 'error-screen'); screen.append(node('h1', '', 'Unable to start'), node('p', '', message)); const retry = node('button', 'secondary-button', 'Retry'); retry.addEventListener('click', () => location.reload()); screen.append(retry); app.append(screen);
}

async function boot() {
  try {
    config = await fetch('./game-config.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('Game configuration is unavailable.'); return response.json(); });
    document.title = config.name;
    runtime = new StakeRuntime({ href: location.href, onBalance: updateBalance });
    if (runtime.launch.replay) replayData = await runtime.loadReplay();
    else if (!runtime.launch.studioPreview) {
      const authenticated = await runtime.authenticate();
      buildShell(); applyJurisdiction(runtime.jurisdiction); updateBalance(runtime.balance);
      if (authenticated.round?.active) {
        setBusy(true); showStatus('Resuming unfinished round', 4000);
        await runtime.resume(authenticated.round, { modeConfig: modeByName(authenticated.round.mode), present });
        setBusy(false);
      }
      setInterval(() => { if (!busy && !runtime.roundActive) runtime.refreshBalance().catch(() => {}); }, 60_000);
      return;
    }
    buildShell(); applyJurisdiction(runtime.jurisdiction || { socialCasino: runtime.launch.social });
    if (runtime.launch.replay) {
      ui.balanceValue.textContent = formatAmount(runtime.launch.amount, runtime.launch.currency);
      ui.bonusControl.hidden = true; ui.autoControl.hidden = true; ui.decreaseBet.hidden = true; ui.increaseBet.hidden = true; ui.modeChip.hidden = true;
    }
  } catch (error) { showError(error); }
}

boot();
window.addEventListener('pagehide', () => effectsController?.destroy(), { once: true });
window.addEventListener('pagehide', () => spineController?.destroy(), { once: true });
