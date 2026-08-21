import { API_AMOUNT_MULTIPLIER, StakeRuntime } from './stake-runtime.js';

const app = document.querySelector('#app');
const params = new URL(location.href).searchParams;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const waitForVisualLayout = () => new Promise(resolve => {
  const frame = globalThis.requestAnimationFrame;
  if (!frame) return globalThis.setTimeout(resolve, 0);
  frame(() => frame(resolve));
});
const ENHANCEMENT_TIMEOUT_MS = 4_000;
const REQUIRED_PRESENTATION_TIMEOUT_MS = 8_000;
async function waitForEnhancement(promise, label, timeoutMs = ENHANCEMENT_TIMEOUT_MS) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = globalThis.setTimeout(
          () => reject(new Error(`${label} did not become ready within ${timeoutMs}ms.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== null) globalThis.clearTimeout(timer);
  }
}
const settleOptionalEnhancement = (promise, label) => waitForEnhancement(promise, label)
  .catch(error => {
    console.warn(`${label} is unavailable; continuing the round without it.`, error);
    return false;
  });
const scheduleOptionalEnhancement = (promise, label) => {
  void Promise.resolve(promise).catch(error => {
    console.warn(`${label} is unavailable; continuing without it.`, error);
  });
};
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
let featureState = {
  active: false,
  mode: '',
  current: 0,
  total: 0,
  totalWin: 0,
  achievement: '',
  chainHit: 0,
  awardedSpins: 0,
  freeSpinsRemaining: 0,
  reelRows: [4, 4, 4, 4, 4, 4],
  lastExpandedReel: null,
  veilBar: { family: '', current: 0, threshold: 4 },
};
let dreamfallWorldActive = false;
let nexusWorldActive = false;
let modalSequence = 0;
let visualPlanSequence = 0;
let settledSymbolMotionSuspensionDepth = 0;
let settledSymbolMotionGeneration = 0;
let reelMotionStartedAt = 0;
let oneiricTargetSelection = null;

const ui = {};
const modeByName = name => config.betModes.find(mode => mode.name === name) || config.betModes[0] || { name: 'base', cost: 1 };
const modeLabel = mode => mode?.label || String(mode?.name || 'base').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
const mayDisplayRtp = () => Boolean(runtime?.launch.replay || runtime?.launch.studioPreview || runtime?.jurisdiction?.displayRTP);
const modeMathText = mode => [
  mayDisplayRtp() ? `${(Number(mode.rtp || config.rtp) * 100).toFixed(2)}% RTP` : '',
  `${Number(mode.maxWin || config.maxWin).toLocaleString()}× max`,
].filter(Boolean).join(' · ');
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
  if (config?.audio?.soundscapeEnabled === false) {
    audioMusic?.pause();
    audioMusic = null;
    audioMusicKey = '';
    return;
  }
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
  button.dataset.control = key;
  button.setAttribute('aria-label', label);
  const image = node('img'); image.src = config.controls?.[key] || ''; image.alt = ''; image.draggable = false;
  button.append(image, node('span', '', label), node('i', 'control-hit-area'));
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

function createPortableVisualPlan(kind, { intensity = 'normal', instant = false } = {}) {
  const manifest = config?.visualChoreography;
  const sequence = manifest?.sequences?.[kind];
  const resolvedIntensity = manifest?.intensityProfiles?.[intensity] || manifest?.intensityProfiles?.normal || { timingScale: 1 };
  const motionPolicy = instant ? 'none' : prefersReducedMotion() ? 'reduced' : turbo ? 'fast' : 'normal';
  const motion = manifest?.motionProfiles?.[motionPolicy] || { duration: instant ? 0 : 1, stagger: instant ? 0 : 1, motionEnabled: !instant };
  let cursor = 0;
  const phases = (sequence?.phases || []).map(id => {
    const durationMs = Math.max(0, Math.round(Number(sequence?.durations?.[id] || 0) * Number(resolvedIntensity.timingScale || 1) * Number(motion.duration || 0)));
    const phase = { id, startMs: cursor, durationMs, endMs: cursor + durationMs };
    cursor += durationMs;
    return phase;
  });
  return {
    format: 'stake-studio-visual-choreography-plan-v1',
    id: `${kind}:portable-${++visualPlanSequence}`,
    kind,
    intensity,
    motionPolicy,
    motionEnabled: motion.motionEnabled !== false,
    staggerMs: Math.max(0, Math.round(Number(sequence?.staggerMs || 0) * Number(motion.stagger || 0))),
    phases,
    totalDurationMs: cursor,
    acknowledgement: { required: true, completionPhase: phases.at(-1)?.id || null },
  };
}

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
  ui.featureProgress.classList.toggle('is-dreamfall', dreamfallWorldActive || /^dreamfall$/i.test(featureState.mode));
  ui.featureMode.textContent = featureState.mode || 'Dream Feature';
  ui.featureCount.textContent = /^dreamfall$/i.test(featureState.mode)
    ? `CHAIN ${Number(featureState.chainHit || 0)} / 5 · SPINS ${Number(featureState.freeSpinsRemaining || featureState.total || 0)}`
    : (featureState.total > 0 ? `FREE SPIN ${featureState.current} / ${featureState.total}` : '');
  ui.featureTotal.textContent = `WIN ${Number(featureState.totalWin || 0).toFixed(2)}×`;
  ui.featureAchievement.textContent = featureState.achievement || '';
  ui.featureAward.textContent = Number(featureState.awardedSpins || 0) > 0 ? `+${Number(featureState.awardedSpins)} AWARDED` : '';
  const reelRows = Array.isArray(featureState.reelRows) && featureState.reelRows.length === 6
    ? featureState.reelRows
    : [4, 4, 4, 4, 4, 4];
  ui.featureReelMeter?.querySelectorAll('[data-feature-reel]').forEach((meter, reel) => {
    const rows = Math.max(4, Math.min(8, Number(reelRows[reel]) || 4));
    meter.dataset.rows = String(rows);
    meter.style.setProperty('--feature-reel-growth', `${rows / 8 * 100}%`);
    meter.classList.toggle('is-awakening', Number(featureState.lastExpandedReel) === reel);
    const value = meter.querySelector('b');
    if (value) value.textContent = String(rows);
  });
  if (ui.featureReelMeter) ui.featureReelMeter.setAttribute('aria-label', `Reel heights ${reelRows.join(', ')}`);
  syncFeatureChrome();
}

function payingFamilies() {
  return (config.symbols || []).filter((symbol) => {
    const special = symbol.special || [];
    return symbol.tier !== 'special' && !special.some((flag) => /wild|scatter|bomb|split|purge|star|mystery/i.test(flag));
  });
}

function syncFeatureChrome() {
  if (!ui.featureChrome) return;
  const mode = ui.mode?.value;
  const showVeil = mode === 'veil_ascent';
  const showLucid = mode === 'lucid_blessing';
  const showGrid = mode === 'trickster_dream' || positionGridMode === 'trickster_dream' || positionGridMode === 'oneiric_nexus';
  const show = (showVeil || showLucid || showGrid) && !dreamfallWorldActive;
  ui.featureChrome.hidden = !show;
  if (!show) return;
  const title = showVeil ? 'VEIL ASCENT' : showLucid ? 'LUCID BLESSING' : positionGridMode === 'oneiric_nexus' ? 'ONEIRIC NEXUS' : 'TRICKSTER DREAM';
  ui.featureChrome.dataset.mode = showVeil ? 'veil_ascent' : showLucid ? 'lucid_blessing' : (positionGridMode || 'trickster_dream');
  ui.featureChromeTitle.textContent = title;
  const bar = featureState.veilBar || { family: '', current: 0, threshold: 4 };
  const fill = Math.max(0, Math.min(1, Number(bar.current) / (Number(bar.threshold) || 4)));
  const charged = [...positionMultipliers.values()].filter((value) => Number(value) > 1).length;
  if (showVeil) {
    ui.featureChromeBody.innerHTML = `<div class="feature-chrome-veil"><small>SYMBOL BAR${bar.family ? ` · ${bar.family}` : ''}</small><div class="feature-chrome-bar"><i style="width:${(fill * 100).toFixed(1)}%"></i></div><b>${Number(bar.current) || 0} / ${Number(bar.threshold) || 4}</b></div>`;
  } else if (showLucid) {
    ui.featureChromeBody.innerHTML = `<div class="feature-chrome-lucid"><small>FAMILY MULTIPLIERS</small><div>${payingFamilies().map((symbol) => {
      const multiplier = symbolMultipliers.get(symbol.id) || symbolMultipliers.get(symbol.name) || 1;
      return `<i class="${multiplier > 1 ? 'is-charged' : ''}"><img src="${symbol.src || ''}" alt=""><b>${multiplier}×</b></i>`;
    }).join('')}</div></div>`;
  } else {
    ui.featureChromeBody.innerHTML = `<div class="feature-chrome-grid"><small>POSITION GRID</small><b>${charged} CHARGED · CELLS DOUBLE AFTER A WIN</b></div>`;
  }
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
    || /dreamfall/i.test(tierId)
    || mechanicId === 'winningCascadeReelExpansion'
  ));
  const nexusProfile = config.renderProfiles?.morpheusNexus;
  nexusWorldActive = Boolean(nexusProfile && (
    tierId === 'oneiric_nexus'
    || /oneiric_nexus/i.test(String(tier?.id || tier?.name || ''))
    || directMode?.name === 'oneiric_nexus'
  ));
  if (nexusWorldActive) dreamfallWorldActive = false;
  featureState = {
    active: true,
    mode: tier?.name || modeLabel(directMode) || 'Dream Feature',
    current: 0,
    total: Number(event?.totalFs || tier?.spins || directMode?.profile?.freeSpins || 10),
    totalWin: currentWin,
    achievement: tier?.mechanic === 'progressiveSymbolUpgrade' ? `VEIL METER 0 / ${Number(tier.meterThreshold || 4)}` : '',
    chainHit: 0,
    awardedSpins: 0,
    freeSpinsRemaining: Number(event?.totalFs || tier?.spins || directMode?.profile?.freeSpins || 10),
    reelRows: [4, 4, 4, 4, 4, 4],
    lastExpandedReel: null,
    veilBar: { family: '', current: 0, threshold: Number(tier?.meterThreshold) || 4 },
  };
  syncFeatureProgress();
  setMusic('bonusMusic');
  if ((dreamfallWorldActive || nexusWorldActive) && Array.isArray(currentBoard) && currentBoard.length) {
    renderBoard(currentBoard);
  }
}

function updateFeatureProgress(event) {
  if (!featureState.active) return;
  featureState.current = Number(event?.amount ?? featureState.current);
  featureState.total = Number(event?.total ?? featureState.total);
  featureState.freeSpinsRemaining = Math.max(0, Number(event?.remaining ?? featureState.total - featureState.current));
  featureState.totalWin = currentWin;
  syncFeatureProgress();
}

function setFeatureAchievement(message) {
  if (!featureState.active) return;
  featureState.achievement = String(message || '');
  syncFeatureProgress();
}

function showWinDisplay(amount, { durationMs = 1500, kicker = 'Total Win' } = {}) {
  if (!ui.message || !ui.messageValue || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return;
  const tier = resolveWinTier(amount);
  if (tier !== 'winBig' && tier !== 'winMega') return;
  ui.message.dataset.tier = tier;
  ui.messageKicker.textContent = kicker;
  ui.messageValue.textContent = `${Number(amount).toFixed(Number(amount) >= 10 ? 0 : 2)}×`;
  ui.message.classList.remove('is-visible');
  // Restart the entrance when a tumble updates the running total while keeping
  // the same owned result layer. The forced read is bounded to one element.
  void ui.message.offsetWidth;
  ui.message.classList.add('is-visible');
  clearTimeout(showWinDisplay.timer);
  showWinDisplay.timer = setTimeout(
    () => ui.message?.classList.remove('is-visible'),
    Math.max(500, Number(durationMs) || 1500),
  );
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
  if (cue.channel === 'ui' && cue.action === 'winDisplay') {
    if (event?.type === 'winInfo') return;
    const amount = eventAmount(event);
    const tier = resolveWinTier(amount);
    const scale = prefersReducedMotion() ? 0.12 : turbo ? 0.42 : 1;
    const duration = Number(config.presentationDirector?.winEscalation?.tierDurations?.[tier]) || 1500;
    showWinDisplay(amount, { durationMs: duration * scale });
  }
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
  const currentMaximumRows = Math.max(...board.map(reel => Array.isArray(reel) ? reel.length : 0), 1);
  const visualRowCapacity = dreamfallWorldActive
    ? maximumRows
    : currentMaximumRows;
  const maxRows = dreamfallWorldActive
    ? visualRowCapacity
    : currentMaximumRows;
  ui.board.classList.toggle('is-dreamfall-world', dreamfallWorldActive);
  ui.shell?.classList.toggle('is-dreamfall-world', dreamfallWorldActive);
  ui.board.classList.toggle('is-nexus-world', nexusWorldActive);
  ui.shell?.classList.toggle('is-nexus-world', nexusWorldActive);
  if (ui.dreamfallCabinet) ui.dreamfallCabinet.hidden = !dreamfallWorldActive;
  if (ui.nexusCabinet) ui.nexusCabinet.hidden = !nexusWorldActive;
  ui.board.dataset.renderProfile = dreamfallWorldActive ? String(dreamfallProfile?.format || '') : 'base';
  const geometry = dreamfallWorldActive ? dreamfallProfile?.world : config.reelArea;
  const cabinetWidth = Math.max(1, Number(config.cabinetSize?.width) || 1280);
  const cabinetHeight = Math.max(1, Number(config.cabinetSize?.height) || 800);
  ui.board.style.left = `${Number(geometry?.x || 0) / cabinetWidth * 100}%`;
  ui.board.style.top = `${Number(geometry?.y || 0) / cabinetHeight * 100}%`;
  ui.board.style.width = `${Number(geometry?.width || cabinetWidth) / cabinetWidth * 100}%`;
  ui.board.style.height = `${Number(geometry?.height || cabinetHeight) / cabinetHeight * 100}%`;
  ui.board.style.setProperty('--rows', String(maxRows));
  for (const reelData of board) {
    const reel = node('div', 'reel');
    const symbols = Array.isArray(reelData) ? reelData : [];
    reel.style.gridTemplateRows = `repeat(${Math.max(1, symbols.length)}, minmax(0,1fr))`;
    if (dreamfallWorldActive) {
      reel.style.setProperty('--reel-rows', String(symbols.length));
      reel.style.height = `${Math.max(1, symbols.length) / visualRowCapacity * 100}%`;
    }
    for (const raw of symbols) reel.append(createSymbol(raw));
    ui.board.append(reel);
  }
  if (dreamfallWorldActive) {
    const dormantGrid = node('div', 'dreamfall-dormant-grid');
    dormantGrid.style.setProperty('--dormant-rows', String(visualRowCapacity));
    for (let reel = 0; reel < board.length; reel++) {
      const tileRows = Array.isArray(board[reel]) ? board[reel].length : 0;
      const grownRows = Math.max(tileRows, Number(featureState.reelRows?.[reel]) || 4);
      const dormantRows = Math.max(0, visualRowCapacity - grownRows);
      for (let row = 0; row < dormantRows; row++) {
        const well = node('i', 'dreamfall-dormant-well');
        const depth = dormantRows - row;
        well.dataset.dormantState = depth === 1 ? 'next' : 'locked';
        well.dataset.dormantDepth = String(depth);
        well.style.gridColumn = String(reel + 1);
        well.style.gridRow = String(row + 1);
        const maskSource = symbolDefinition('DREAM_MASK')?.src;
        if (maskSource) {
          const glyph = node('img', 'dreamfall-dormant-glyph');
          glyph.src = maskSource;
          glyph.alt = '';
          glyph.draggable = false;
          well.append(glyph);
        }
        dormantGrid.append(well);
      }
    }
    ui.board.append(dormantGrid);
    const shafts = node('div', 'dreamfall-living-shafts');
    for (let reel = 0; reel < board.length; reel++) {
      const tileRows = Array.isArray(board[reel]) ? board[reel].length : 4;
      const grownRows = Math.max(tileRows, Number(featureState.reelRows?.[reel]) || 4);
      const shaft = node('div', 'living-shaft');
      shaft.dataset.reel = String(reel);
      shaft.dataset.rows = String(grownRows);
      shaft.style.left = `${reel / board.length * 100}%`;
      shaft.style.width = `${100 / board.length}%`;
      shaft.style.height = `${Math.max(1, grownRows) / visualRowCapacity * 100}%`;
      shaft.append(node('i', 'shaft-rail shaft-rail-left'), node('i', 'shaft-rail shaft-rail-right'));
      const cap = node('div', 'reel-cap');
      cap.dataset.reel = String(reel);
      cap.append(node('i', 'shaft-cap-stone'), node('i', 'shaft-cap-glow'));
      shaft.append(cap);
      shafts.append(shaft);
    }
    ui.board.append(shafts);
  }
  syncMechanicMarkers();
  applyOneiricTargetSelection();
  scheduleSettledSymbolMotionSync();
}

function clearReelSpinTracks() {
  ui.board?.querySelectorAll('.reel-spin-track').forEach(track => track.remove());
  ui.board?.querySelectorAll('.reel').forEach(reel => reel.classList.remove('has-stopped', 'is-stopping'));
}

function suspendSettledSymbolMotion() {
  settledSymbolMotionSuspensionDepth += 1;
  settledSymbolMotionGeneration += 1;
  ui.board?.classList.add('is-symbol-motion-suspended');
  effectsController?.cancelTransientEffects?.();
  effectsController?.clearSymbols?.();
}

function resumeSettledSymbolMotion() {
  settledSymbolMotionSuspensionDepth = Math.max(0, settledSymbolMotionSuspensionDepth - 1);
  if (settledSymbolMotionSuspensionDepth > 0) return;
  ui.board?.classList.remove('is-symbol-motion-suspended');
  scheduleSettledSymbolMotionSync();
}

function settledSymbolMotionAllowed() {
  return settledSymbolMotionSuspensionDepth === 0
    && !ui.board?.classList.contains('is-symbol-motion-suspended')
    && !ui.board?.classList.contains('is-spinning')
    && !ui.board?.classList.contains('is-settling')
    && !ui.board?.classList.contains('is-tumbling');
}

function scheduleSettledSymbolMotionSync() {
  if (!settledSymbolMotionAllowed()) return;
  const generation = ++settledSymbolMotionGeneration;
  const run = effectsReady.then(controller => {
    if (generation !== settledSymbolMotionGeneration || !settledSymbolMotionAllowed()) return false;
    return controller?.syncSymbols?.();
  });
  scheduleOptionalEnhancement(run, 'Visual effect symbol sync');
}

function reelSpinSymbolSequence(reelData, reelIndex) {
  const visibleRows = Math.max(1, Array.isArray(reelData) && reelData.length
    ? reelData.length
    : (config.previewBoard?.[reelIndex] || []).length);
  const ordinarySymbols = (config.symbols || [])
    .filter(symbol => !Array.isArray(symbol.special) || symbol.special.length === 0)
    .map(symbol => symbol.name)
    .filter(Boolean);
  const fallbackSymbols = (config.previewBoard || []).flat().map(raw => (
    typeof raw === 'string' ? raw : raw?.name
  )).filter(Boolean);
  const pool = ordinarySymbols.length ? ordinarySymbols : fallbackSymbols;
  if (!pool.length) return Array.isArray(reelData) ? [...reelData, ...reelData, ...reelData] : [];

  const sequence = [];
  const stride = reelIndex % 2 === 0 ? 3 : 7;
  for (let index = 0; index < visibleRows * 3; index++) {
    const cycle = Math.floor(index / visibleRows);
    const poolIndex = (reelIndex * 2 + cycle * (reelIndex + 3) + index * stride) % pool.length;
    sequence.push(pool[poolIndex]);
  }
  return sequence;
}

function reelMotionTiming() {
  const timing = config.presentationDirector?.reelChoreography || {};
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    baseDurationMs: Math.max(200, finite(timing.baseDurationMs, 520)),
    stopGapMs: Math.max(90, finite(timing.perReelDelayMs, 120) + finite(timing.perReelDurationMs, 70)),
    anticipationHoldMs: Math.max(0, finite(timing.anticipationHoldMs, 1200)),
    impactMs: Math.max(80, finite(timing.impactMs, 260)),
    spinCycleMs: Math.max(180, finite(timing.blurIntervalMs, 48) * Math.max(1, finite(timing.blurTicks, 6))),
  };
}

function hasRevealAnticipation(value) {
  // Stake Math SDK reveal events carry one numeric anticipation value per reel.
  // The official Web SDK uses `anticipation.some(Boolean)`; array truthiness
  // would incorrectly hold the final reel on every ordinary spin.
  if (Array.isArray(value)) return value.some(Boolean);
  return value === true || (Number.isFinite(Number(value)) && Number(value) > 0);
}

function waitingReelsFromReveal(anticipation, reelCount) {
  const reels = Math.max(0, Number(reelCount) || 0);
  if (!reels) return [];
  if (Array.isArray(anticipation) && anticipation.some((value) => value === true || Number(value) > 0)) {
    return Array.from({ length: reels }, (_, reel) => {
      const value = anticipation[reel];
      return value === true || Number(value) > 0;
    });
  }
  const on = anticipation === true || (Number.isFinite(Number(anticipation)) && Number(anticipation) > 0);
  return Array.from({ length: reels }, (_, reel) => on && reel === reels - 1);
}

function createReelSpinTrack(reelData, reelIndex) {
  const visibleRows = Math.max(1, Array.isArray(reelData) && reelData.length
    ? reelData.length
    : (config.previewBoard?.[reelIndex] || []).length);
  const symbols = reelSpinSymbolSequence(reelData, reelIndex);
  const timing = reelMotionTiming();
  const track = node('div', 'reel-spin-track');
  track.style.setProperty('--spin-rows', String(Math.max(1, visibleRows * 3)));
  track.style.setProperty('--spin-duration', `${(turbo ? Math.max(140, timing.spinCycleMs * .52) : timing.spinCycleMs) / 1000}s`);
  track.style.setProperty('--spin-phase', `${-reelIndex * (turbo ? .019 : .037)}s`);
  for (const raw of symbols) track.append(createSymbol(raw));
  return track;
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
  effectsController?.clearSymbols?.();
  clearReelSpinTracks();
  // Enter the clipped spin state before mounting any transient reel artwork.
  // Appending the tracks first exposed one rendered frame containing both the
  // settled board and off-window symbols behind the cabinet.
  ui.board.classList.remove('is-settling');
  ui.board.classList.add('is-spinning');
  reelMotionStartedAt = performance.now();
  const reels = [...(ui.board?.querySelectorAll(':scope > .reel') || [])];
  for (const [reelIndex, reel] of reels.entries()) {
    reel.append(createReelSpinTrack(currentBoard[reelIndex], reelIndex));
  }
}

async function settleReelMotion(board, instant = false, anticipation = false) {
  await preloadBoardAssets(board);
  const tracks = [...(ui.board?.querySelectorAll('.reel-spin-track') || [])];
  tracks.forEach(track => track.remove());
  renderBoard(board);
  const reels = [...(ui.board?.querySelectorAll(':scope > .reel') || [])];
  tracks.forEach((track, reelIndex) => reels[reelIndex]?.append(track));
  if (instant || prefersReducedMotion() || tracks.length === 0) {
    clearReelSpinTracks();
    ui.board.classList.remove('is-spinning', 'is-settling');
    return;
  }
  const timing = reelMotionTiming();
  const elapsedMs = Math.max(0, performance.now() - reelMotionStartedAt);
  const motionScale = turbo ? .42 : 1;
  const firstStopDelay = Math.max(0, timing.baseDurationMs * motionScale - elapsedMs);
  const stopGap = Math.max(34, timing.stopGapMs * motionScale);
  const stopDuration = turbo ? 82 : Math.max(120, Math.min(220, timing.impactMs * .58));
  const waiting = waitingReelsFromReveal(anticipation, tracks.length);
  const holds = [];
  let accrued = 0;
  for (let reelIndex = 0; reelIndex < tracks.length; reelIndex++) {
    if (waiting[reelIndex]) accrued += timing.anticipationHoldMs * motionScale;
    holds[reelIndex] = accrued;
  }
  await Promise.all(tracks.map(async (track, reelIndex) => {
    const anticipationHold = holds[reelIndex];
    const landingAt = firstStopDelay + reelIndex * stopGap + anticipationHold;
    await wait(Math.max(0, landingAt - stopDuration));
    const reel = track.parentElement;
    if (!reel) return;
    reel.classList.add('is-stopping');
    const landed = [...reel.children].filter(element => element.classList.contains('symbol'));
    const movingStrip = track.animate([
      { opacity: .9, filter: 'blur(1.15px) saturate(.84) brightness(.78)' },
      { opacity: 1, filter: 'blur(.2px) saturate(.96) brightness(.94)' },
    ], {
      duration: stopDuration,
      easing: 'cubic-bezier(.2,.76,.24,1)',
      fill: 'forwards',
    }).finished.catch(() => {});
    await movingStrip;
    reel.classList.add('has-stopped');
    track.remove();
    const landedTiles = Promise.all(landed.map((element, row) => element.animate([
      { opacity: 0, transform: 'translateY(-14%) scaleY(1.025)', filter: 'brightness(.84) blur(.45px)' },
      { offset: .68, opacity: 1, transform: 'translateY(3%) scaleY(.985)', filter: 'brightness(1.14) blur(0)' },
      { opacity: 1, transform: 'translateY(0) scaleY(1)', filter: 'none' },
    ], {
      duration: stopDuration + (turbo ? 30 : 90),
      delay: row * (turbo ? 3 : 7),
      easing: 'cubic-bezier(.16,.88,.24,1)',
    }).finished.catch(() => {})));
    await landedTiles;
    reel.classList.remove('is-stopping');
  }));
  clearReelSpinTracks();
  ui.board.classList.remove('is-spinning');
  ui.board.classList.add('is-settling');
  await wait(turbo ? 70 : 180);
  ui.board.classList.remove('is-settling');
  scheduleSettledSymbolMotionSync();
}

function clearWinHighlights({ preservePlanStatus = false } = {}) {
  for (const timer of winHighlightTimers) clearTimeout(timer);
  winHighlightTimers = [];
  ui.board?.querySelector('.compiled-win-connections')?.remove();
  ui.board?.classList.remove('is-resolving-win', 'is-win-recovering');
  if (ui.board && !preservePlanStatus) {
    delete ui.board.dataset.visualPlan;
    delete ui.board.dataset.visualPhase;
    delete ui.board.dataset.visualPlanStatus;
  }
  ui.board?.querySelectorAll('.symbol').forEach(element => element.classList.remove(
    'is-win-target', 'is-connection-source', 'is-reacting', 'is-winning', 'is-resolved',
  ));
}

async function recoverWinPresentation({ instant = false } = {}) {
  if (!ui.board?.classList.contains('is-resolving-win')) return false;
  ui.board.classList.add('is-win-recovering');
  if (!instant) await wait(turbo ? 90 : 240);
  clearWinHighlights();
  scheduleSettledSymbolMotionSync();
  return true;
}

function renderWinConnections(groups, plan) {
  const board = ui.board;
  if (!board || !groups.length) return null;
  board.querySelector('.compiled-win-connections')?.remove();
  const boardRect = board.getBoundingClientRect();
  if (!boardRect.width || !boardRect.height) return null;
  const connectionEffect = config.presentationEffects?.winConnections || {};
  if (connectionEffect.type === 'particleTap') return null;
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.classList.add('compiled-win-connections');
  svg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const propagation = plan.phases.find(item => item.id === 'propagation') || { startMs: 0, durationMs: 260 };
  const reaction = plan.phases.find(item => item.id === 'reaction') || { startMs: 0 };
  const hop = plan.staggerMs || 55;
  let routeCount = 0;
  groups.forEach((positions, groupIndex) => {
    const points = positions.map(target => {
      const cell = board.children[target.reel]?.children[target.row];
      const rect = cell?.getBoundingClientRect?.();
      return rect ? {
        x: rect.left - boardRect.left + rect.width / 2,
        y: rect.top - boardRect.top + rect.height / 2,
      } : null;
    }).filter(Boolean);
    points.forEach((point, pointIndex) => {
      const marker = document.createElementNS(namespace, 'circle');
      marker.classList.add('compiled-win-connection-node', `compiled-win-connection-${groupIndex % 3}`);
      marker.setAttribute('cx', point.x.toFixed(2));
      marker.setAttribute('cy', point.y.toFixed(2));
      marker.setAttribute('r', pointIndex === 0 ? '7' : '5');
      marker.style.setProperty('--connection-delay', `${reaction.startMs + pointIndex * hop}ms`);
      svg.append(marker);
    });
    for (let index = 1; index < points.length; index++) {
      const source = points[index - 1];
      const target = points[index];
      const span = Math.hypot(target.x - source.x, target.y - source.y);
      const bend = Math.min(18, span * .12) * (groupIndex % 2 ? 1 : -1);
      const midpointX = (source.x + target.x) / 2;
      const midpointY = (source.y + target.y) / 2 + bend;
      const route = document.createElementNS(namespace, 'path');
      route.classList.add('compiled-win-connection-route', `compiled-win-connection-${groupIndex % 3}`);
      route.setAttribute('d', `M ${source.x.toFixed(2)} ${source.y.toFixed(2)} Q ${midpointX.toFixed(2)} ${midpointY.toFixed(2)} ${target.x.toFixed(2)} ${target.y.toFixed(2)}`);
      route.setAttribute('pathLength', '1');
      route.style.setProperty('--connection-delay', `${propagation.startMs + routeCount * hop}ms`);
      route.style.setProperty('--connection-duration', `${Math.max(120, propagation.durationMs)}ms`);
      const glow = route.cloneNode();
      glow.classList.add('compiled-win-connection-glow');
      svg.append(glow, route);
      routeCount += 1;
    }
  });
  svg.dataset.routeCount = String(routeCount);
  board.append(svg);
  return svg;
}

function eventCellPosition(raw) {
  if (Array.isArray(raw)) return { reel: Number(raw[0]), row: Number(raw[1]) };
  return { reel: Number(raw?.reel), row: Number(raw?.row) };
}

function clearOneiricTargetSelection() {
  oneiricTargetSelection = null;
  ui.board?.classList.remove('is-oneiric-targeting');
  ui.board?.querySelectorAll('.symbol').forEach(element => element.classList.remove(
    'is-oneiric-source', 'is-oneiric-target',
  ));
}

function applyOneiricTargetSelection() {
  if (!oneiricTargetSelection || !ui.board) return;
  ui.board.classList.add('is-oneiric-targeting');
  for (const raw of oneiricTargetSelection.sources) {
    const { reel, row } = eventCellPosition(raw);
    ui.board.children[reel]?.children[row]?.classList.add('is-oneiric-source');
  }
  for (const raw of oneiricTargetSelection.targets) {
    const { reel, row } = eventCellPosition(raw);
    ui.board.children[reel]?.children[row]?.classList.add('is-oneiric-target');
  }
}

function oneiricTargetPositions(targetFamily) {
  const expected = canonicalSymbolName(targetFamily);
  const positions = [];
  for (let reel = 0; reel < currentBoard.length; reel++) {
    for (let row = 0; row < (currentBoard[reel] || []).length; row++) {
      const symbol = currentBoard[reel][row];
      const name = typeof symbol === 'string' ? symbol : symbol?.name;
      if (canonicalSymbolName(name) === expected) positions.push({ reel, row });
    }
  }
  return positions;
}

async function playOneiricTargetSelection(event, instant = false) {
  const sources = (event.sources || event.affectedPositions || []).map(eventCellPosition);
  const targets = oneiricTargetPositions(event.targetFamily || event.target);
  oneiricTargetSelection = { sources, targets };
  applyOneiricTargetSelection();
  if (instant || targets.length === 0) return;
  await settleOptionalEnhancement(
    effectsReady.then(controller => controller?.playTileConnections?.({
      ...event,
      sources,
      positions: targets,
    }, { instant, turbo })),
    'Oneiric Star target-selection playback',
  );
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
  clearOneiricTargetSelection();
  positionMultipliers = new Map();
  positionGridMode = '';
  symbolMultipliers = new Map();
  syncMechanicMarkers();
}

async function highlightWins(wins = [], { stagger = false } = {}) {
  clearWinHighlights();
  const position = raw => Array.isArray(raw) ? { reel: Number(raw[0]), row: Number(raw[1]) } : raw;
  if (!stagger) {
    ui.board?.classList.toggle('is-resolving-win', wins.some(win => (win.positions || []).length));
    for (const win of wins) for (const raw of win.positions || []) {
      const target = position(raw);
      ui.board.children[target.reel]?.children[target.row]?.classList.add('is-win-target', 'is-winning', 'is-resolved');
    }
    return Boolean(wins.some(win => (win.positions || []).length));
  }
  const plan = createPortableVisualPlan('tileConnection', { intensity: wins.length > 2 ? 'major' : 'normal' });
  const phase = id => plan.phases.find(item => item.id === id) || { startMs: 0, durationMs: 0, endMs: 0 };
  const launch = phase('propagation').startMs;
  const hop = plan.staggerMs || 55;
  if (ui.board) {
    ui.board.dataset.visualPlan = plan.id;
    ui.board.dataset.visualPhase = 'interaction';
    ui.board.classList.add('is-resolving-win');
  }
  const groups = [];
  for (const win of wins) {
    const seen = new Set();
    const positions = (win.positions || []).map(position).filter(target => {
      const key = `${target.reel}:${target.row}`;
      if (!Number.isFinite(target.reel) || !Number.isFinite(target.row) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!positions.length) continue;
    groups.push(positions);
    for (const target of positions) ui.board.children[target.reel]?.children[target.row]?.classList.add('is-win-target');
    const source = positions[0];
    ui.board.children[source.reel]?.children[source.row]?.classList.add('is-connection-source');
  }
  renderWinConnections(groups, plan);
  const schedulePhase = (id, callback) => {
    const timer = setTimeout(() => {
      if (ui.board) ui.board.dataset.visualPhase = id;
      callback?.();
    }, phase(id).startMs);
    winHighlightTimers.push(timer);
  };
  schedulePhase('reaction', () => groups.flat().forEach(target => {
    ui.board.children[target.reel]?.children[target.row]?.classList.add('is-reacting');
  }));
  schedulePhase('propagation');
  groups.forEach((positions, groupIndex) => {
    positions.forEach((target, index) => {
      const timer = setTimeout(() => {
        ui.board.children[target.reel]?.children[target.row]?.classList.add('is-winning');
      }, launch + groupIndex * Math.round(hop * .5) + index * hop);
      winHighlightTimers.push(timer);
    });
  });
  schedulePhase('resolution', () => {
    groups.flat().forEach(target => {
      ui.board.children[target.reel]?.children[target.row]?.classList.remove('is-connection-source', 'is-reacting');
      ui.board.children[target.reel]?.children[target.row]?.classList.add('is-winning', 'is-resolved');
    });
  });
  const completeTimer = setTimeout(() => {
    if (ui.board) ui.board.dataset.visualPlanStatus = `completed:${plan.acknowledgement.completionPhase}`;
  }, phase('resolution').endMs);
  winHighlightTimers.push(completeTimer);
  await wait(plan.totalDurationMs);
  if (ui.board?.dataset.visualPlan === plan.id) {
    ui.board.dataset.visualPlanStatus = `completed:${plan.acknowledgement.completionPhase}`;
  }
  return true;
}

const eventPosition = raw => Array.isArray(raw)
  ? { reel: Number(raw[0]), row: Number(raw[1]) }
  : { reel: Number(raw?.reel), row: Number(raw?.row) };

async function playTumbleBoard(event, instant = false) {
  clearWinHighlights();
  suspendSettledSymbolMotion();
  let symbolMotionResumed = false;
  const plan = createPortableVisualPlan('tumble', {
    intensity: (event.explodingSymbols || []).length >= 8 ? 'major' : 'normal', instant,
  });
  if (ui.board) {
    ui.board.dataset.visualPlan = plan.id;
    ui.board.dataset.visualPhase = 'recognition';
    ui.board.classList.add('is-tumbling');
  }
  try {
  const phaseData = id => plan.phases.find(item => item.id === id) || { durationMs: 0, startMs: 0, endMs: 0 };
  const phase = id => phaseData(id).durationMs;
  const setPhase = id => { if (ui.board) ui.board.dataset.visualPhase = id; };
  const travelEnabled = !instant && plan.motionEnabled;
  const removed = new Set((event.explodingSymbols || []).map(raw => {
    const position = eventPosition(raw);
    return `${position.reel},${position.row}`;
  }));
  const exploding = [];
  for (let reel = 0; reel < currentBoard.length; reel++) {
    for (let row = 0; row < (currentBoard[reel] || []).length; row++) {
      if (removed.has(`${reel},${row}`)) exploding.push(ui.board.children[reel]?.children[row]);
    }
  }
  exploding.filter(Boolean).forEach(element => element.classList.add('is-tumble-recognized'));
  if (!instant && exploding.length) await wait(phase('recognition'));
  setPhase('reaction');
  exploding.filter(Boolean).forEach(element => {
    element.classList.remove('is-tumble-recognized');
    element.classList.add('is-tumble-reacting');
  });
  if (!instant && exploding.length) await wait(phase('reaction'));
  setPhase('clear');
  exploding.filter(Boolean).forEach(element => element.classList.add('is-tumble-clearing'));
  if (travelEnabled && exploding.length) {
    await Promise.all(exploding.filter(Boolean).map((element, index) => (element.querySelector('img') || element).animate([
      { opacity: 1, transform: 'translateY(0) scale(1) rotate(0)', filter: 'brightness(1) saturate(1)' },
      { offset: .38, opacity: 1, transform: 'translateY(-1%) scale(1.08) rotate(0)', filter: 'brightness(1.75) saturate(1.18)' },
      { opacity: 0, transform: `translateY(-8%) scale(.58) rotate(${index % 2 ? 4 : -4}deg)`, filter: 'blur(5px) brightness(1.25)' },
    ], { duration: Math.max(1, phase('clear')), delay: 0, easing: 'cubic-bezier(.4,0,.68,1)', fill: 'forwards' }).finished));
  } else if (!instant && exploding.length) {
    await wait(phase('clear'));
  }
  setPhase('space');
  if (!instant) await wait(phase('space'));

  setPhase('enter');
  const motions = [];
  const landingElements = [];
  const landingReels = [];
  const nextBoard = [];
  for (let reel = 0; reel < currentBoard.length; reel++) {
    const reelElement = ui.board.children[reel];
    const incomingRaw = event.newSymbols?.[reel] || [];
    const oldSymbols = [...(reelElement?.children || [])];
    const survivors = oldSymbols.filter((_, row) => !removed.has(`${reel},${row}`));
    const survivingRaw = (currentBoard[reel] || []).filter((_, row) => !removed.has(`${reel},${row}`));
    const before = new Map(survivors.map(element => [element, element.getBoundingClientRect()]));
    const incomingElements = incomingRaw.map(createSymbol);
    // Keep incoming artwork hidden from the instant it enters the DOM until its
    // authored gravity motion owns visibility. The tile wells remain fixed, but
    // a replacement symbol can never flash behind the cabinet or appear before
    // the fall begins—even if a future game authors a non-zero entry stagger.
    if (travelEnabled) incomingElements.forEach(element => element.classList.add('is-tumble-incoming'));
    reelElement?.replaceChildren(...incomingElements, ...survivors);
    nextBoard.push([...incomingRaw, ...survivingRaw]);

    if (!travelEnabled) continue;
    const enterDuration = phase('enter');
    const fallDuration = phase('fall');
    const settleDuration = phase('settle');
    const travelDuration = Math.max(1, enterDuration + fallDuration + settleDuration);
    const enterOffset = Math.min(.98, Math.max(0, enterDuration / travelDuration));
    const landingOffset = Math.min(.99, Math.max(enterOffset, (enterDuration + fallDuration) / travelDuration));
    let reelHasTravel = false;
    for (const element of survivors) {
      const previous = before.get(element);
      const settled = element.getBoundingClientRect();
      const travel = previous.top - settled.top;
      if (Math.abs(travel) < .5) continue;
      reelHasTravel = true;
      const artwork = element.querySelector('img') || element;
      motions.push(artwork.animate([
        { offset: 0, transform: `translateY(${travel}px) scale(1)`, filter: 'blur(.6px) brightness(.86)', easing: 'linear' },
        { offset: enterOffset, transform: `translateY(${travel}px) scale(1)`, filter: 'blur(.6px) brightness(.86)', easing: 'cubic-bezier(.34,.01,.72,.42)' },
        { offset: landingOffset, transform: 'translateY(5px) scaleX(1.012) scaleY(.972)', filter: 'blur(0) brightness(1.22)', easing: 'cubic-bezier(.16,.9,.24,1)' },
        { offset: 1, transform: 'translateY(0) scale(1)', filter: 'none' },
      ], { duration: travelDuration, easing: 'linear' }).finished.catch(() => {}));
    }
    for (const [index, element] of incomingElements.entries()) {
      const height = element.getBoundingClientRect().height || ui.board.getBoundingClientRect().height / Math.max(1, incomingElements.length);
      const entryTravel = -height * (incomingElements.length - index);
      reelHasTravel = true;
      const artwork = element.querySelector('img') || element;
      const incomingMotion = artwork.animate([
        { offset: 0, opacity: 0, transform: `translateY(${entryTravel}px) scale(.92)`, filter: 'blur(3px) brightness(.72)', easing: 'cubic-bezier(.2,.7,.25,1)' },
        { offset: enterOffset, opacity: .38, transform: `translateY(${entryTravel}px) scale(.94)`, filter: 'blur(2px) brightness(.82)', easing: 'cubic-bezier(.34,.01,.72,.42)' },
        { offset: landingOffset, opacity: 1, transform: 'translateY(5px) scaleX(1.015) scaleY(.97)', filter: 'blur(0) brightness(1.24)', easing: 'cubic-bezier(.16,.9,.24,1)' },
        { offset: 1, opacity: 1, transform: 'translateY(0) scale(1)', filter: 'none' },
      ], { duration: travelDuration, delay: 0, easing: 'linear', fill: 'backwards' });
      element.classList.remove('is-tumble-incoming');
      motions.push(incomingMotion.finished.catch(() => {}));
    }
    if (reelHasTravel) {
      const landedSymbols = [...(reelElement?.children || [])].filter(element => element.classList.contains('symbol'));
      if (landedSymbols.length) landingElements.push(landedSymbols.at(-1));
      if (reelElement) landingReels.push(reelElement);
    }
  }
  const phaseTimers = [];
  if (travelEnabled) {
    phaseTimers.push(setTimeout(() => setPhase('fall'), phase('enter')));
    phaseTimers.push(setTimeout(() => {
      setPhase('settle');
      landingElements.forEach(element => element.classList.add('is-tumble-landing'));
      landingReels.forEach(element => element.classList.add('is-tumble-impact'));
    }, phase('enter') + phase('fall')));
  } else if (!instant) {
    await wait(phase('enter'));
    setPhase('fall');
    await wait(phase('fall'));
    setPhase('settle');
    await wait(phase('settle'));
  } else {
    setPhase('fall');
    setPhase('settle');
  }
  await Promise.all(motions);
  phaseTimers.forEach(timer => clearTimeout(timer));
  landingElements.forEach(element => element.classList.remove('is-tumble-landing'));
  landingReels.forEach(element => element.classList.remove('is-tumble-impact'));
  setPhase('evaluate');
  currentBoard = nextBoard;
  syncMechanicMarkers();
  if (!instant) await wait(phase('evaluate'));
  if (ui.board) ui.board.dataset.visualPlanStatus = `completed:${plan.acknowledgement.completionPhase}`;
  ui.board?.classList.remove('is-tumbling');
  resumeSettledSymbolMotion();
  symbolMotionResumed = true;
  showStatus('Cascade');
  } finally {
    ui.board?.classList.remove('is-tumbling');
    if (!symbolMotionResumed) resumeSettledSymbolMotion();
  }
}

async function playBoardTransform(event, instant = false) {
  const targetBoard = event.board || currentBoard;
  // A completed win may retain its acknowledgement, but its glow must leave
  // before a new transform takes visual ownership of the same board.
  clearWinHighlights({ preservePlanStatus: true });
  suspendSettledSymbolMotion();
  const changes = [...new Map((event.changes || []).map(change => [
    `${Number(change.reel)}:${Number(change.row)}`,
    change,
  ])).values()];
  await Promise.all(changes.map(async (change, index) => {
    const current = ui.board.children[change.reel]?.children[change.row];
    if (!current) return;
    if (!instant && index) await wait(index * (turbo ? 7 : 16));
    if (!instant) {
      current.classList.add('is-transforming-out');
      await current.animate([
        { opacity: 1, transform: 'scale(1) rotate(0deg)', filter: 'brightness(1) saturate(1)' },
        { offset: .42, opacity: 1, transform: 'scale(1.055) rotate(0deg)', filter: 'brightness(1.65) saturate(1.18)' },
        { opacity: 0, transform: 'scale(.72) rotate(-2deg)', filter: 'brightness(1.35) saturate(.82) blur(5px)' },
      ], { duration: turbo ? 105 : 190, easing: 'cubic-bezier(.4,0,.68,1)', fill: 'forwards' }).finished;
    }
    const replacement = createSymbol(targetBoard[change.reel]?.[change.row] ?? change.to);
    current.replaceWith(replacement);
    if (!instant) {
      replacement.classList.add('is-transforming-in');
      await replacement.animate([
        { opacity: 0, transform: 'scale(.68) rotate(2deg)', filter: 'brightness(2.15) saturate(1.35) blur(5px)' },
        { offset: .58, opacity: 1, transform: 'scale(1.065) rotate(-.5deg)', filter: 'brightness(1.48) saturate(1.18) blur(0)' },
        { opacity: 1, transform: 'scale(1) rotate(0)', filter: 'none' },
      ], { duration: turbo ? 135 : 250, easing: 'cubic-bezier(.16,.9,.24,1.18)' }).finished;
      replacement.classList.remove('is-transforming-in');
    }
  }));
  currentBoard = targetBoard;
  syncMechanicMarkers();
  resumeSettledSymbolMotion();
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
  // Reveal presentation belongs to the completed reel landing, not to the
  // arrival of the reveal packet. Starting it here lets its recovery recipe
  // run underneath the physical stop sequence and leaves no owned beat between
  // the last impact and win evaluation.
  const directorAfterReelsSettle = !governedPresentation && event?.type === 'reveal';
  let directorMotion = governedPresentation || directorAfterReelsSettle
    ? Promise.resolve(false)
    : playPresentationEvent(event, instant);
  const governedEffectMotion = governedPresentation && event?.type === 'winInfo'
    ? settleOptionalEnhancement(
      effectsReady.then(controller => controller?.playTileConnections?.(event, { instant, turbo })),
      'Governed tile connection playback',
    )
    : Promise.resolve(false);
  const channelMotions = [
    trackChannel('effects', governedPresentation ? governedEffectMotion : settleOptionalEnhancement(
      effectsReady.then(controller => controller?.play(event, { instant, turbo })),
      'Visual effect playback',
    )),
    trackChannel('spine', governedPresentation ? Promise.resolve(false) : settleOptionalEnhancement(
      spineReady.then(controller => controller?.play(event, { instant })),
      'Spine playback',
    )),
  ];
  switch (event?.type) {
    case 'reveal':
      if (event.morpheusAuthoritative && event.mode === 'dreamfall') {
        dreamfallWorldActive = true;
        const authoritativeFeature = event.featureState || {};
        const initialRows = Array.isArray(authoritativeFeature.reelRows) && authoritativeFeature.reelRows.length === 6
          ? authoritativeFeature.reelRows.map(Number)
          : (event.board || currentBoard).map(reel => Math.max(4, Number(reel?.length) || 4));
        featureState = {
          active: true,
          mode: 'Dreamfall',
          current: 0,
          total: Number(authoritativeFeature.freeSpinsRemaining) || 10,
          totalWin: currentWin,
          achievement: '',
          chainHit: Number(authoritativeFeature.chainHit || 0),
          awardedSpins: Number(authoritativeFeature.awardedFreeSpins || 0),
          freeSpinsRemaining: Number(authoritativeFeature.freeSpinsRemaining) || 10,
          reelRows: initialRows,
          lastExpandedReel: authoritativeFeature.lastExpandedReel !== null
            && authoritativeFeature.lastExpandedReel !== undefined
            && Number.isInteger(Number(authoritativeFeature.lastExpandedReel))
            ? Number(authoritativeFeature.lastExpandedReel)
            : null,
          veilBar: { family: '', current: 0, threshold: 4 },
        };
        syncFeatureProgress();
      }
      const anticipated = hasRevealAnticipation(event.anticipation);
      await settleReelMotion(event.board, instant, event.anticipation);
      if (directorAfterReelsSettle) directorMotion = playPresentationEvent(event, instant);
      showStatus(anticipated ? 'Anticipation' : 'Revealed');
      break;
    case 'winInfo':
      await highlightWins(event.wins, { stagger: !instant && authoredMotionEnabled() });
      if (event.morpheusAuthoritative) {
        currentWin = Number(event.cumulativeWin ?? event.totalWin ?? event.amount ?? 0) / 100;
        ui.winValue.textContent = `${currentWin.toFixed(2)}×`;
        if (featureState.active) { featureState.totalWin = currentWin; syncFeatureProgress(); }
      } else {
        // winInfo owns the visible payoff beat. Do not leave the HUD at the
        // previous cascade total while its center-stage result already shows
        // the new step; the following set/update event remains authoritative.
        const cumulative = Number(event.cumulativeWin);
        const visibleRunningWin = Number.isFinite(cumulative)
          ? cumulative / 100
          : currentWin + Number(event.totalWin ?? event.amount ?? 0) / 100;
        ui.winValue.textContent = `${visibleRunningWin.toFixed(2)}×`;
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
      nexusWorldActive = false;
      ui.board.classList.remove('is-dreamfall-world', 'is-nexus-world');
      ui.shell?.classList.remove('is-dreamfall-world', 'is-nexus-world');
      if (ui.dreamfallCabinet) ui.dreamfallCabinet.hidden = true;
      if (ui.nexusCabinet) ui.nexusCabinet.hidden = true;
      ui.board.dataset.renderProfile = 'base';
      if (currentWin > 0) flash(`${currentWin.toFixed(2)}×`);
      await recoverWinPresentation({ instant });
      break;
    case 'tumbleBoard': await playTumbleBoard(event, instant); break;
    case 'boardTransform': await playBoardTransform(event, instant); break;
    case 'updateGlobalMult': ui.multiplier.textContent = `${event.globalMult || 1}×`; showStatus(`Multiplier ${event.globalMult || 1}×`); break;
    case 'freeSpinTrigger': clearMechanicState(); beginFeature(event); showStatus(`${featureState.mode} · ${featureState.total} Free Spins`, 2600); break;
    case 'freeSpinRetrigger':
      featureState.total = Number(event.totalFs || featureState.total);
      featureState.freeSpinsRemaining = Number(event.totalFs || featureState.freeSpinsRemaining);
      syncFeatureProgress();
      showStatus(`Dream Extended · ${featureState.total} Free Spins`, 2600);
      playStinger('bonusTrigger');
      break;
    case 'updateFreeSpin': updateFeatureProgress(event); break;
    case 'freeSpinEnd':
      featureState.totalWin = Number(event.amount ?? currentWin * 100) / 100;
      featureState.current = Math.max(featureState.current, featureState.total);
      featureState.freeSpinsRemaining = 0;
      syncFeatureProgress();
      break;
    case 'wincap': currentWin = Number(event.amount || 0) / 100; ui.winValue.textContent = `${currentWin.toFixed(2)}×`; flash('Maximum Win'); break;
    case 'enterBonus':
      if (!featureState.active) beginFeature(event);
      showStatus(`${event.tierName || featureState.mode || 'Gates of Sleep'} · ${event.totalFs || featureState.total || 0} Free Spins`, 2600);
      break;
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
      await playOneiricTargetSelection(event, instant);
      showStatus(`Oneiric Star · Targets ${event.targetFamily || event.target || 'Symbol'}`);
      break;
    case 'specialPositionsResolved':
      if (event.morpheusAuthoritative) {
        await settleOptionalEnhancement(
          effectsReady.then(controller => controller?.playTileConnections?.(event, { instant, turbo })),
          'Governed special-position relationship playback',
        );
      }
      clearOneiricTargetSelection();
      if (event.morpheusAuthoritative) await playBoardTransform(event, instant);
      showStatus(`${event.special || 'Special'} · ${(event.positions || []).length} Positions Resolved`);
      break;
    case 'meterProgress':
      setFeatureAchievement(`VEIL METER ${event.current || 0} / ${event.threshold || 4}`);
      showStatus(`Veil Ascent · ${featureState.achievement}`);
      break;
    case 'symbolUpgrade':
      if (event.morpheusAuthoritative && event.boardAfter) {
        await playBoardTransform({
          board: event.boardAfter,
          changes: (event.positions || []).map(raw => {
            const position = eventPosition(raw);
            return { reel: position.reel, row: position.row };
          }),
        }, instant);
      }
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
      syncFeatureChrome();
      break;
    case 'modeGridStart':
      positionGridMode = event.mode || 'oneiric_nexus';
      if (positionGridMode === 'oneiric_nexus') {
        nexusWorldActive = true;
        dreamfallWorldActive = false;
        renderBoard(currentBoard);
      }
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
      featureState.veilBar = {
        family: event.symbolFamily || '',
        current: Number(event.current) || 0,
        threshold: Math.max(1, Number(event.threshold) || 4),
      };
      setFeatureAchievement(`${event.symbolFamily || 'SYMBOL'} ${event.previous || 0} → ${event.current || 0} / ${event.threshold || 1}`);
      showStatus(`Veil Ascent · ${featureState.achievement}`);
      syncFeatureChrome();
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
      {
        const activatingDreamfallWorld = Boolean(config.renderProfiles?.morpheusDreamfall && !dreamfallWorldActive);
        if (activatingDreamfallWorld) suspendSettledSymbolMotion();
        if (activatingDreamfallWorld) {
          dreamfallWorldActive = true;
          if (!featureState.reelRows?.length) featureState.reelRows = [4, 4, 4, 4, 4, 4];
          renderBoard(currentBoard);
        }
        const reel = Number(event.reel);
        const maxRows = Number(config.renderProfiles?.morpheusDreamfall?.maximumRows) || 8;
        const previousRows = Math.max(4, Number(event.previousRows) || Number(featureState.reelRows?.[reel]) || 4);
        const rows = Math.min(maxRows, Math.max(previousRows, Number(event.rows) || previousRows + 1));
        if (!Array.isArray(featureState.reelRows)) featureState.reelRows = [4, 4, 4, 4, 4, 4];
        featureState.reelRows[reel] = rows;
        const shaft = ui.board?.querySelector(`.living-shaft[data-reel="${reel}"]`);
        if (shaft && !instant) {
          shaft.classList.add('is-growing', 'look-shaft-grow');
          shaft.dataset.rows = String(rows);
          shaft.style.transition = 'height .42s cubic-bezier(.16,.84,.22,1)';
          shaft.style.height = `${rows / maxRows * 100}%`;
          await new Promise((resolve) => window.setTimeout(resolve, 420));
          shaft.classList.remove('is-growing', 'look-shaft-grow');
        }
        if (event.morpheusAuthoritative && event.board) {
          await settleReelMotion(event.board, instant, event.anticipation);
        }
        featureState.lastExpandedReel = reel;
        syncFeatureProgress();
        if (activatingDreamfallWorld) {
          await waitForVisualLayout();
          resumeSettledSymbolMotion();
        }
        setFeatureAchievement(`REEL ${reel + 1} · ${rows} ROWS`);
        showStatus(`Dreamfall · ${featureState.achievement}`);
      }
      break;
    case 'tumbleChainProgress':
      featureState.chainHit = Number(event.chainHit || event.current || 0);
      setFeatureAchievement(`CHAIN HIT ${event.chainHit || event.current || 0}`);
      showStatus(`Dreamfall · ${featureState.achievement}`);
      break;
    case 'awardTumbleFreeSpins':
      if (featureState.active) {
        featureState.total = Number(event.totalFs || featureState.total + Number(event.amount || 1));
        featureState.freeSpinsRemaining = Number(event.totalFs || featureState.freeSpinsRemaining + Number(event.amount || 1));
        featureState.awardedSpins += Number(event.amount || 1);
        featureState.chainHit = Number(event.chainHit || featureState.chainHit || 0);
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
  channelMotions.push(trackChannel('director', directorMotion));
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
    const controller = await waitForEnhancement(
      spineReady,
      'Required Morpheus Spine runtime',
      REQUIRED_PRESENTATION_TIMEOUT_MS,
    );
    const transitioned = controller?.transition?.(state);
    if (!transitioned && !prefersReducedMotion()) throw new Error(`Morpheus character state ${state} could not be presented.`);
  }
  const primaryMotion = plan.semantic.visual?.assetIds?.[0] || null;
  if (primaryMotion) {
    if (!effectsController) initializeVisualEffects();
    const controller = await waitForEnhancement(
      effectsReady,
      'Required Morpheus visual effect runtime',
      REQUIRED_PRESENTATION_TIMEOUT_MS,
    );
    const played = await controller?.playAuthoredMotion?.(primaryMotion, {
      durationMs: plan.durationMs,
      reducedMotion: plan.motionMode === 'reduced' || prefersReducedMotion(),
      motionMode: plan.motionMode,
      event: packet.presentationEvent,
    });
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
  ui.playLabel.textContent = autoSpinsRemaining > 0 ? 'STOP' : busy ? 'PLAYING' : runtime.launch.replay ? 'REPLAY' : 'SPIN';
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
  syncFeatureChrome();
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
    card.append(heading, node('span', 'mode-cost', formatAmount(total, runtime.balance?.currency || runtime.launch.currency)), node('small', '', socialText(mode.description || `${mode.cost}× play amount`)), node('small', 'mode-math', modeMathText(mode)));
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
  shell.style.setProperty('--board-ratio', String(
    (Number(config.cabinetSize?.width) || 1280) / (Number(config.cabinetSize?.height) || 800),
  ));
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
    image.style.cssText = `left:${Number(asset.x || 0) / cabinetWidth * 100}%;top:${Number(asset.y || 0) / cabinetHeight * 100}%;width:${Number(asset.width || 1) / cabinetWidth * 100}%;height:${Number(asset.height || 1) / cabinetHeight * 100}%;opacity:${Number(asset.opacity ?? 1)};z-index:${Number(asset.zIndex ?? 2)};mix-blend-mode:${asset.blendMode || 'normal'}`;
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
    const asset = dreamfallCabinet.asset || {};
    ui.dreamfallCabinet.style.cssText = `left:${Number(asset.x || 0) / cabinetWidth * 100}%;top:${Number(asset.y || 0) / cabinetHeight * 100}%;width:${Number(asset.width || cabinetWidth) / cabinetWidth * 100}%;height:${Number(asset.height || cabinetHeight) / cabinetHeight * 100}%;opacity:${Number(asset.opacity ?? 1)};z-index:${Number(asset.zIndex ?? 38)};mix-blend-mode:${asset.blendMode || 'normal'}`;
    authoredWorldLayers.push(ui.dreamfallCabinet);
  }
  const nexusCabinet = config.renderProfiles?.morpheusNexus?.cabinet;
  if (nexusCabinet?.asset?.src) {
    ui.nexusCabinet = node('img', 'authored-world-layer authored-world-nexus-cabinet');
    ui.nexusCabinet.src = nexusCabinet.asset.src;
    ui.nexusCabinet.alt = '';
    ui.nexusCabinet.draggable = false;
    ui.nexusCabinet.hidden = true;
    ui.nexusCabinet.dataset.cabinetProfile = nexusCabinet.format;
    const nexusAsset = nexusCabinet.asset || {};
    ui.nexusCabinet.style.cssText = `left:${Number(nexusAsset.x || 0) / cabinetWidth * 100}%;top:${Number(nexusAsset.y || 0) / cabinetHeight * 100}%;width:${Number(nexusAsset.width || cabinetWidth) / cabinetWidth * 100}%;height:${Number(nexusAsset.height || cabinetHeight) / cabinetHeight * 100}%;opacity:${Number(nexusAsset.opacity ?? 1)};z-index:${Number(nexusAsset.zIndex ?? 38)};mix-blend-mode:${nexusAsset.blendMode || 'normal'}`;
    authoredWorldLayers.push(ui.nexusCabinet);
  }
  const livingGlow = node('div', 'living-cabinet-glow');
  livingGlow.setAttribute('aria-hidden', 'true');
  livingGlow.append(node('i', 'living-colosseum-glow'), node('i', 'living-well-pulse'), node('i', 'living-nexus-glow'), node('i', 'living-nexus-grid-glow'));
  authoredWorldLayers.push(livingGlow);
  const fallbackEffects = [];
  if (config.presentationEffects?.motionGraphics?.htmlVisibleEffects !== false) {
    const atmosphere = node('div', 'dream-atmosphere');
    if (config.animation?.motion?.environment?.enabled !== false && config.animation?.motion?.environment) {
      atmosphere.append(
        node('i', 'dream-moon'),
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
  if (config.controls?.modeCard) {
    ui.message.dataset.authoredArt = 'true';
    ui.message.style.setProperty('--stage-message-art', `url("${config.controls.modeCard}")`);
  }
  const stageMessageCopy = node('div', 'stage-message-copy');
  ui.messageKicker = node('span', 'stage-message-kicker', 'Total Win');
  ui.messageValue = node('strong', 'stage-message-value', '0.00×');
  stageMessageCopy.append(ui.messageKicker, ui.messageValue);
  ui.message.append(stageMessageCopy);
  ui.featureProgress = node('section', 'feature-progress'); ui.featureProgress.setAttribute('aria-live', 'polite');
  if (config.controls?.modeCard) ui.featureProgress.style.setProperty('--feature-panel-art', `url("${config.controls.modeCard}")`);
  if (config.presentationAssets?.modePortal) { const art = node('img', 'presentation-art'); art.src = config.presentationAssets.modePortal; art.alt = ''; ui.featureProgress.append(art); }
  const progressCopy = node('div', 'feature-progress-copy');
  ui.featureMode = node('strong', '', 'Dream Feature'); ui.featureCount = node('span'); ui.featureTotal = node('b'); ui.featureAchievement = node('small');
  ui.featureAward = node('em', 'feature-award');
  ui.featureReelMeter = node('div', 'feature-reel-meter');
  for (let reel = 0; reel < 6; reel++) {
    const meter = node('i');
    meter.dataset.featureReel = String(reel);
    meter.dataset.rows = '4';
    meter.style.setProperty('--feature-reel-growth', '50%');
    meter.append(node('span'), node('b', '', '4'));
    ui.featureReelMeter.append(meter);
  }
  progressCopy.append(ui.featureMode, ui.featureCount, ui.featureTotal, ui.featureAchievement, ui.featureAward, ui.featureReelMeter); ui.featureProgress.append(progressCopy);
  ui.featureChrome = node('aside', 'feature-chrome');
  ui.featureChrome.hidden = true;
  ui.featureChrome.setAttribute('aria-live', 'polite');
  const chromeHeader = node('header');
  chromeHeader.append(node('small', '', 'FEATURE'), ui.featureChromeTitle = node('strong', '', 'FEATURE'));
  ui.featureChromeBody = node('div', 'feature-chrome-body');
  ui.featureChrome.append(chromeHeader, ui.featureChromeBody);
  ui.featureIntro = node('section', 'feature-intro');
  if (config.presentationAssets?.modePortal) { const art = node('img', 'presentation-art'); art.src = config.presentationAssets.modePortal; art.alt = ''; ui.featureIntro.append(art); }
  const introCopy = node('div', 'feature-intro-copy'); ui.featureIntroTitle = node('strong'); ui.featureIntroMeta = node('span'); introCopy.append(ui.featureIntroTitle, ui.featureIntroMeta); ui.featureIntro.append(introCopy);
  ui.featureFinale = node('section', 'feature-finale'); ui.featureFinale.setAttribute('aria-live', 'assertive');
  if (config.presentationAssets?.verdictPlate) { const art = node('img', 'presentation-art'); art.src = config.presentationAssets.verdictPlate; art.alt = ''; ui.featureFinale.append(art); }
  const finaleCopy = node('div', 'feature-finale-copy'); ui.featureFinaleKicker = node('span'); ui.featureFinaleTitle = node('strong'); ui.featureFinaleMeta = node('small'); finaleCopy.append(ui.featureFinaleKicker, ui.featureFinaleTitle, ui.featureFinaleMeta); ui.featureFinale.append(finaleCopy);
  overlay.append(ui.message, ui.featureProgress, ui.featureChrome, ui.featureIntro, ui.featureFinale); stage.append(ui.board, overlay); stageWrap.append(stage);
  stage.replaceChildren(...fallbackEffects, ...authoredWorldLayers, ui.board, ui.spineHost, ui.effectsHost, overlay);
  ui.status = node('div', 'status-strip');

  const hud = node('footer', 'hud player-dashboard');
  const authoredHud = config.playerInterface?.hud;
  const fullCanvasCabinet = config.compositionMode === 'full-canvas-cabinet-v1'
    || (!config.compositionMode && authoredHud?.authored);
  if (fullCanvasCabinet) {
    hud.dataset.authoredComposition = 'true';
    hud.hidden = authoredHud.visible === false;
    hud.style.cssText = `left:${Number(authoredHud.x || 0) / cabinetWidth * 100}%;top:${Number(authoredHud.y || 0) / cabinetHeight * 100}%;width:${Number(authoredHud.width || cabinetWidth) / cabinetWidth * 100}%;height:${Number(authoredHud.height || cabinetHeight * .22) / cabinetHeight * 100}%;z-index:${Number(authoredHud.zIndex ?? 60)}`;
    shell.dataset.compositionMode = 'full-canvas-cabinet-v1';
    shell.dataset.authoredHud = 'true';
  }
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
  ui.play = node('button', 'primary-button'); ui.play.type = 'button'; ui.playLabel = node('span', 'control-label', 'SPIN'); ui.play.append(ui.playLabel, node('i', 'control-hit-area'));
  center.append(wager, ui.play);
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
  hud.append(ui.bet, ui.mode, left, center, right);
  const replayBanner = runtime.launch.replay ? node('div', 'replay-banner', socialText('Verified Bet Replay')) : null;
  if (fullCanvasCabinet) {
    // One authored cabinet plane owns every visual and control. This keeps the
    // HUD, title, reels, character, and foreground on the same coordinates at
    // every viewport instead of mixing stage and page-relative placement.
    stage.append(top, hud, ui.status, ui.multiplier);
    if (replayBanner) stage.append(replayBanner);
    shell.append(stageWrap);
  } else {
    shell.append(top, stageWrap, hud, ui.status, ui.multiplier);
    if (replayBanner) shell.append(replayBanner);
  }
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
  const modes = node('section'); modes.append(node('h3', '', 'Selectable Play Modes')); const modeList = node('ul'); for (const mode of config.betModes) modeList.append(node('li', '', socialText(`${mode.label}: ${mode.cost}× play amount · ${modeMathText(mode)}${mode.description ? ` · ${mode.description}` : ''}`))); modes.append(modeList);
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
  void settleOptionalEnhancement(
    spineReady.then(controller => controller?.play({ type: 'spinStart' })),
    'Spine spin-start playback',
  );
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
