export const STAKE_PRESENTATION_EVENTS = [
  'reveal', 'winInfo', 'setWin', 'tumbleBoard', 'freeSpinTrigger',
  'enterBonus', 'freeSpinEnd', 'wincap',
];

export const PRESENTATION_CHANNELS = {
  animation: ['state'],
  audio: ['stinger', 'music'],
  reels: ['highlight', 'impact'],
  world: ['state', 'pulse'],
  camera: ['pulse', 'shake'],
  ui: ['modePortal', 'winDisplay', 'featureResult', 'wincap'],
};

export const WIN_TIER_ORDER = Object.freeze(['winSmall', 'winMedium', 'winBig', 'winMega']);

export function createProfessionalReelChoreography() {
  return {
    baseDurationMs: 520, perReelDelayMs: 120, perReelDurationMs: 70,
    anticipationHoldMs: 720, anticipationCueLagMs: 50, impactMs: 260,
    blurIntervalMs: 48, blurTicks: 6, blurStopTickStart: 2,
  };
}

export function normalizeReelChoreography(raw = {}) {
  const base = createProfessionalReelChoreography();
  const clamp = (key, min, max) => {
    const candidate = Number(raw[key] ?? base[key]);
    return Math.max(min, Math.min(max, Number.isFinite(candidate) ? candidate : base[key]));
  };
  return {
    baseDurationMs: clamp('baseDurationMs', 200, 2000),
    perReelDelayMs: clamp('perReelDelayMs', 0, 1000),
    perReelDurationMs: clamp('perReelDurationMs', 0, 1000),
    anticipationHoldMs: clamp('anticipationHoldMs', 0, 3000),
    anticipationCueLagMs: clamp('anticipationCueLagMs', 0, 500),
    impactMs: clamp('impactMs', 80, 1200),
    blurIntervalMs: clamp('blurIntervalMs', 16, 250),
    blurTicks: Math.round(clamp('blurTicks', 1, 60)),
    blurStopTickStart: Math.round(clamp('blurStopTickStart', 1, 30)),
  };
}

export function getReelStopSchedule(project, anticipation = false) {
  const timing = normalizeReelChoreography(project.presentationDirector?.reelChoreography);
  const reels = Math.max(1, Number(project.math?.grid?.reels) || 5);
  const stops = Array.from({ length: reels }, (_, reel) => {
    const delayMs = reel * timing.perReelDelayMs;
    const holdMs = anticipation && reel === reels - 1 ? timing.anticipationHoldMs : 0;
    const durationMs = timing.baseDurationMs + reel * timing.perReelDurationMs + holdMs;
    return { reel, delayMs, durationMs, stopAtMs: delayMs + durationMs };
  });
  const penultimate = stops[Math.max(0, stops.length - 2)];
  return {
    timing, stops,
    totalMs: Math.max(...stops.map(stop => stop.stopAtMs)),
    anticipationCueMs: anticipation ? penultimate.stopAtMs + timing.anticipationCueLagMs : null,
  };
}

export function createProfessionalWinEscalation() {
  return {
    thresholds: { winSmall: 0, winMedium: 10, winBig: 50, winMega: 100 },
    tierDurations: { winSmall: 1500, winMedium: 2500, winBig: 4000, winMega: 5000 },
  };
}

export function normalizeWinEscalation(raw = {}) {
  const base = createProfessionalWinEscalation();
  const thresholds = {};
  const tierDurations = {};
  for (const tier of WIN_TIER_ORDER) {
    thresholds[tier] = Math.max(0, Number(raw.thresholds?.[tier] ?? base.thresholds[tier]) || 0);
    tierDurations[tier] = Math.max(200, Number(raw.tierDurations?.[tier] ?? base.tierDurations[tier]) || base.tierDurations[tier]);
  }
  return { thresholds, tierDurations };
}

export function resolvePresentationWinTier(project, amount) {
  const escalation = normalizeWinEscalation(project.presentationDirector?.winEscalation);
  const win = Math.max(0, Number(amount) || 0);
  let selected = WIN_TIER_ORDER[0];
  for (const tier of WIN_TIER_ORDER) if (win >= escalation.thresholds[tier]) selected = tier;
  return selected;
}

const cue = (at, channel, action, target, extra = {}) => ({
  id: `${channel}-${action}-${at}`,
  at, channel, action, target, enabled: true, ...extra,
});

export function createProfessionalPresentationDirector() {
  return {
    format: 'stake-studio-presentation-director-v1',
    version: 1,
    reducedMotion: 'respect',
    reelChoreography: createProfessionalReelChoreography(),
    winEscalation: createProfessionalWinEscalation(),
    recipes: [
      {
        id: 'spin-start-default', event: 'spinStart', name: 'Spin launch', enabled: true,
        interrupt: 'replace', duration: 260, settleState: 'spinning',
        cues: [cue(0, 'animation', 'state', 'spinStart'), cue(0, 'audio', 'stinger', 'spinStart'), cue(20, 'world', 'state', 'spin')],
      },
      {
        id: 'anticipation-default', event: 'anticipation', name: 'Scatter anticipation', enabled: true,
        interrupt: 'replace', duration: 900, settleState: 'spinning',
        cues: [cue(0, 'animation', 'state', 'anticipation'), cue(0, 'audio', 'stinger', 'anticipation'), cue(80, 'world', 'pulse', 'anticipation')],
      },
      {
        id: 'round-lose-default', event: 'roundLose', name: 'No-win recovery', enabled: true,
        interrupt: 'replace', duration: 760, settleState: 'idle',
        cues: [cue(0, 'animation', 'state', 'lose'), cue(80, 'world', 'state', 'idle')],
      },
      {
        id: 'reveal-default', event: 'reveal', name: 'Board reveal', enabled: true,
        interrupt: 'replace', duration: 420, settleState: null,
        cues: [cue(0, 'animation', 'state', 'spinStop'), cue(0, 'world', 'pulse', 'reveal'), cue(40, 'camera', 'pulse', 'reels')],
      },
      {
        id: 'win-info-default', event: 'winInfo', name: 'Win resolution', enabled: true,
        interrupt: 'replace', duration: 1500, settleState: 'idle',
        tierDurations: { winSmall: 1500, winMedium: 2500, winBig: 4000, winMega: 5000 },
        cues: [cue(0, 'reels', 'highlight', '$wins'), cue(0, 'animation', 'state', '$winTier'), cue(20, 'audio', 'stinger', '$winTier'), cue(80, 'ui', 'winDisplay', '$runningAmount'), cue(120, 'world', 'pulse', 'win')],
      },
      {
        id: 'set-win-default', event: 'setWin', name: 'Win meter update', enabled: true,
        interrupt: 'queue', duration: 280, settleState: null,
        cues: [cue(0, 'ui', 'winDisplay', '$amount')],
      },
      {
        id: 'tumble-default', event: 'tumbleBoard', name: 'Cascade transition', enabled: true,
        interrupt: 'queue', duration: 420, settleState: null,
        cues: [cue(0, 'audio', 'stinger', 'cascadeDrop'), cue(30, 'world', 'pulse', 'cascade'), cue(70, 'camera', 'pulse', 'reels')],
      },
      {
        id: 'free-spin-trigger-default', event: 'freeSpinTrigger', name: 'Feature trigger', enabled: true,
        interrupt: 'replace', duration: 1500, settleState: 'bonusIdle',
        cues: [cue(0, 'animation', 'state', 'bonusEntry'), cue(0, 'audio', 'stinger', 'bonusTrigger'), cue(80, 'world', 'state', 'feature'), cue(180, 'ui', 'modePortal', '$mode')],
      },
      {
        id: 'enter-bonus-default', event: 'enterBonus', name: 'Enter feature', enabled: true,
        interrupt: 'replace', duration: 800, settleState: 'bonusIdle',
        cues: [cue(0, 'audio', 'music', 'bonusMusic'), cue(0, 'animation', 'state', 'bonusIdle'), cue(0, 'world', 'state', 'feature')],
      },
      {
        id: 'free-spin-end-default', event: 'freeSpinEnd', name: 'Feature finale', enabled: true,
        interrupt: 'replace', duration: 2200, settleState: 'idle',
        cues: [cue(0, 'animation', 'state', 'featureResult'), cue(0, 'audio', 'stinger', 'bonusEnd'), cue(80, 'world', 'state', 'verdict'), cue(140, 'ui', 'featureResult', '$amount')],
      },
      {
        id: 'wincap-default', event: 'wincap', name: 'Maximum win', enabled: true,
        interrupt: 'replace', duration: 6000, settleState: 'idle',
        cues: [cue(0, 'animation', 'state', 'wincap'), cue(0, 'audio', 'stinger', 'wincap'), cue(60, 'world', 'state', 'verdict'), cue(80, 'camera', 'shake', 'heavy'), cue(120, 'ui', 'wincap', '$amount')],
      },
    ],
  };
}

export function normalizePresentationCue(raw = {}) {
  const channel = Object.hasOwn(PRESENTATION_CHANNELS, raw.channel) ? raw.channel : 'animation';
  const actions = PRESENTATION_CHANNELS[channel];
  return {
    id: String(raw.id || ''),
    at: Math.max(0, Number(raw.at) || 0),
    channel,
    action: actions.includes(raw.action) ? raw.action : actions[0],
    target: raw.target == null ? '' : String(raw.target),
    enabled: raw.enabled !== false,
  };
}

export function normalizePresentationRecipe(raw = {}) {
  return {
    id: String(raw.id || ''),
    event: String(raw.event || ''),
    name: String(raw.name || raw.event || 'Untitled recipe'),
    enabled: raw.enabled !== false,
    interrupt: ['replace', 'queue', 'ignore'].includes(raw.interrupt) ? raw.interrupt : 'replace',
    duration: Math.max(0, Number(raw.duration) || 0),
    settleState: raw.settleState ? String(raw.settleState) : null,
    tierDurations: raw.tierDurations && typeof raw.tierDurations === 'object'
      ? Object.fromEntries(WIN_TIER_ORDER.map(tier => [tier, Math.max(200, Number(raw.tierDurations[tier]) || 200)]))
      : null,
    cues: (raw.cues || []).map(normalizePresentationCue).sort((a, b) => a.at - b.at),
  };
}

export function normalizePresentationDirector(raw = {}) {
  const fallback = createProfessionalPresentationDirector();
  return {
    format: fallback.format,
    version: 1,
    reducedMotion: raw.reducedMotion === 'ignore' ? 'ignore' : 'respect',
    reelChoreography: normalizeReelChoreography(raw.reelChoreography),
    winEscalation: normalizeWinEscalation(raw.winEscalation),
    recipes: (raw.recipes || []).map(normalizePresentationRecipe),
  };
}

export function ensurePresentationDirector(project) {
  project.presentationDirector = project.presentationDirector?.recipes?.length
    ? normalizePresentationDirector(project.presentationDirector)
    : createProfessionalPresentationDirector();
  return project.presentationDirector;
}

export function validatePresentationDirector(project) {
  const director = normalizePresentationDirector(project.presentationDirector || {});
  const issues = [];
  const recipeIds = new Set();
  const cueIds = new Set();
  for (const recipe of director.recipes) {
    const prefix = recipe.name || recipe.event || 'Presentation recipe';
    if (!recipe.id) issues.push({ severity: 'error', category: 'presentation-director', message: `${prefix} has no stable ID.` });
    else if (recipeIds.has(recipe.id)) issues.push({ severity: 'error', category: 'presentation-director', message: `Presentation recipe ID "${recipe.id}" is duplicated.` });
    recipeIds.add(recipe.id);
    if (!recipe.event) issues.push({ severity: 'error', category: 'presentation-director', message: `${prefix} has no event type.` });
    if (!recipe.cues.length) issues.push({ severity: 'error', category: 'presentation-director', message: `${prefix} has no presentation cues.` });
    if (recipe.cues.some(item => item.at > recipe.duration)) issues.push({ severity: 'error', category: 'presentation-director', message: `${prefix} contains a cue after its ${recipe.duration}ms duration.` });
    for (const item of recipe.cues) {
      const compoundId = `${recipe.id}:${item.id}`;
      if (!item.id) issues.push({ severity: 'error', category: 'presentation-director', message: `${prefix} contains a cue without a stable ID.` });
      else if (cueIds.has(compoundId)) issues.push({ severity: 'error', category: 'presentation-director', message: `${prefix} duplicates cue ID "${item.id}".` });
      cueIds.add(compoundId);
      if (!item.target) issues.push({ severity: 'error', category: 'presentation-director', message: `${prefix} has an empty ${item.channel}/${item.action} target.` });
    }
  }
  return issues;
}

export function getPresentationCoverage(project) {
  const director = normalizePresentationDirector(project.presentationDirector || {});
  const enabled = director.recipes.filter(recipe => recipe.enabled && recipe.cues.some(item => item.enabled));
  const covered = STAKE_PRESENTATION_EVENTS.filter(event => enabled.some(recipe => recipe.event === event));
  return {
    required: STAKE_PRESENTATION_EVENTS,
    covered,
    missing: STAKE_PRESENTATION_EVENTS.filter(event => !covered.includes(event)),
    percent: Math.round(covered.length / STAKE_PRESENTATION_EVENTS.length * 100),
    recipes: director.recipes,
  };
}

export function createPresentationDirectorManifest(project) {
  return normalizePresentationDirector(project.presentationDirector || {});
}

export function getPresentationRecipeDuration(project, recipe, payload = {}) {
  if (recipe.event === 'winInfo') {
    const tier = resolvePresentationWinTier(project, payload.amount);
    const escalation = normalizeWinEscalation(project.presentationDirector?.winEscalation);
    const configured = Math.max(recipe.duration, escalation.tierDurations[tier], Number(project.animation?.states?.[tier]?.duration) || 0);
    const amount = Math.max(0, Number(payload.amount) || 0);
    // Preserve configured theatrical timing for real wins while keeping tiny
    // acknowledgements responsive enough for normal Stake play cadence.
    if (tier === 'winSmall' && amount > 0 && amount < 1) return Math.min(configured, 900);
    if (tier === 'winSmall' && amount > 0 && amount < 3) return Math.min(configured, 1200);
    return configured;
  }
  if (recipe.event === 'wincap') return Math.max(recipe.duration, Number(project.animation?.states?.wincap?.duration) || 0);
  return recipe.duration;
}

const defaultWait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export class PresentationDirectorRuntime {
  constructor(project, { execute, wait = defaultWait } = {}) {
    this.project = project;
    this.execute = execute || (() => {});
    this.wait = wait;
    this.generation = 0;
    this.active = null;
    this.queue = Promise.resolve();
    this.currentPromise = null;
  }

  recipeFor(event) {
    return normalizePresentationDirector(this.project.presentationDirector || {}).recipes
      .find(recipe => recipe.enabled && recipe.event === event) || null;
  }

  dispatch(event, payload = {}) {
    const recipe = this.recipeFor(event);
    if (!recipe) return Promise.resolve({ event, status: 'unmapped', cues: [] });
    if (recipe.interrupt === 'ignore' && this.active) return Promise.resolve({ event, status: 'ignored', cues: [] });
    if (recipe.interrupt === 'queue') {
      const predecessor = this.currentPromise || this.queue;
      const queued = predecessor.catch(() => {}).then(() => this.play(recipe, payload));
      this.queue = queued;
      this.currentPromise = queued;
      queued.finally(() => { if (this.currentPromise === queued) this.currentPromise = null; });
      return queued;
    }
    this.cancel('replaced');
    const running = this.play(recipe, payload);
    this.currentPromise = running;
    running.finally(() => { if (this.currentPromise === running) this.currentPromise = null; });
    return running;
  }

  async play(recipe, payload) {
    const generation = ++this.generation;
    this.active = { generation, recipe, payload };
    let elapsed = 0;
    const executed = [];
    for (const item of recipe.cues.filter(value => value.enabled)) {
      const delay = Math.max(0, item.at - elapsed);
      if (delay) await this.wait(delay);
      if (generation !== this.generation) return { event: recipe.event, status: 'cancelled', cues: executed };
      await this.execute(item, payload, recipe);
      executed.push(item.id);
      elapsed = item.at;
    }
    const resolvedDuration = getPresentationRecipeDuration(this.project, recipe, payload);
    const tail = Math.max(0, resolvedDuration - elapsed);
    if (tail) await this.wait(tail);
    if (generation !== this.generation) return { event: recipe.event, status: 'cancelled', cues: executed };
    if (recipe.settleState) await this.execute({ id: 'settle', channel: 'animation', action: 'state', target: recipe.settleState, enabled: true, at: resolvedDuration }, payload, recipe);
    if (this.active?.generation === generation) this.active = null;
    return { event: recipe.event, status: 'completed', cues: executed };
  }

  cancel(reason = 'cancelled') {
    this.generation++;
    const active = this.active;
    this.active = null;
    return { reason, event: active?.recipe?.event || null };
  }
}
