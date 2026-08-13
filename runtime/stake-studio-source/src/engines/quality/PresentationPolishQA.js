import {
  WIN_TIER_ORDER,
  getPresentationRecipeDuration,
  getReelStopSchedule,
  normalizePresentationDirector,
  normalizeWinEscalation,
} from '../presentation/PresentationDirector.js';

export const PRESENTATION_POLISH_FORMAT = 'stake-studio-presentation-polish-qa-v1';

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') {
    const text = String(value ?? '');
    return /^(data:|blob:|https?:)/.test(text) ? [text.length, text.slice(0, 24), text.slice(-32)] : value;
  }
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, compact(value[key])]));
}

export function getPresentationPolishFingerprint(project) {
  return hashText(JSON.stringify(compact({
    director: normalizePresentationDirector(project.presentationDirector || {}),
    reels: project.math?.grid?.reels,
    animationStates: Object.fromEntries(WIN_TIER_ORDER.concat('wincap').map(state => [state, project.animation?.states?.[state]])),
    stateAnimations: Object.fromEntries(WIN_TIER_ORDER.concat('wincap').map(state => [state, project.animation?.stateAnimations?.[state]])),
  })));
}

function cue(recipe, channel, action, target) {
  return recipe?.cues?.find(item => item.enabled !== false && item.channel === channel && item.action === action && (!target || item.target === target));
}

function evaluateReels(project, director) {
  const issues = [];
  const regular = getReelStopSchedule(project, false);
  const anticipation = getReelStopSchedule(project, true);
  const gaps = regular.stops.slice(1).map((stop, index) => stop.stopAtMs - regular.stops[index].stopAtMs);
  if (regular.stops.length < 3) issues.push('Reel choreography requires at least three staged stops.');
  if (regular.stops[0]?.stopAtMs < 450 || regular.stops[0]?.stopAtMs > 900) issues.push(`First reel stops at ${regular.stops[0]?.stopAtMs || 0}ms; production range is 450–900ms.`);
  if (gaps.some(gap => gap < 180 || gap > 480)) issues.push(`Reel stop gaps are ${gaps.join(', ')}ms; each must stay within 180–480ms.`);
  if (regular.totalMs < 1000 || regular.totalMs > 2800) issues.push(`Regular reel settle is ${regular.totalMs}ms; production range is 1000–2800ms.`);
  const penultimate = anticipation.stops.at(-2);
  const final = anticipation.stops.at(-1);
  const anticipationLead = final.stopAtMs - anticipation.anticipationCueMs;
  if (anticipation.timing.anticipationHoldMs < 450 || anticipation.timing.anticipationHoldMs > 1500) issues.push(`Final-reel anticipation hold is ${anticipation.timing.anticipationHoldMs}ms; production range is 450–1500ms.`);
  if (anticipation.anticipationCueMs < penultimate.stopAtMs) issues.push('Anticipation begins before the penultimate reel has visibly landed.');
  if (anticipationLead < 550 || anticipationLead > 1600) issues.push(`Anticipation has ${anticipationLead}ms to build before the final stop; production range is 550–1600ms.`);
  if (anticipation.timing.impactMs < 180 || anticipation.timing.impactMs > 500) issues.push(`Reel impact persists ${anticipation.timing.impactMs}ms; production range is 180–500ms.`);

  const reveal = director.recipes.find(recipe => recipe.enabled && recipe.event === 'reveal');
  if (!cue(reveal, 'animation', 'state', 'spinStop')) issues.push('Board reveal does not trigger the spin-stop animation.');
  if (!cue(reveal, 'world', 'pulse')) issues.push('Board reveal has no world landing pulse.');
  if (!cue(reveal, 'camera', 'pulse')) issues.push('Board reveal has no camera landing pulse.');
  const revealImpactTimes = (reveal?.cues || []).filter(item => item.enabled !== false && ['animation', 'world', 'camera'].includes(item.channel)).map(item => item.at);
  if (revealImpactTimes.length && Math.max(...revealImpactTimes) - Math.min(...revealImpactTimes) > 120) issues.push('Board reveal impacts are spread by more than 120ms and will feel disconnected.');

  const rise = director.recipes.find(recipe => recipe.enabled && recipe.event === 'anticipation');
  if (!cue(rise, 'animation', 'state', 'anticipation')) issues.push('Anticipation has no animation-state cue.');
  if (!cue(rise, 'audio', 'stinger', 'anticipation')) issues.push('Anticipation has no synchronized audio rise.');
  if (!cue(rise, 'world', 'pulse', 'anticipation')) issues.push('Anticipation has no world-state response.');
  if (Number(rise?.duration) < anticipation.timing.anticipationHoldMs) issues.push(`Anticipation recipe lasts ${Number(rise?.duration) || 0}ms but the final-reel hold lasts ${anticipation.timing.anticipationHoldMs}ms.`);
  return { passed: issues.length === 0, issues, regular, anticipation, stopGapsMs: gaps };
}

function authoredTierSignature(project, tier) {
  const mapping = project.animation?.stateAnimations?.[tier];
  if (mapping) return `mapping:${typeof mapping === 'string' ? mapping : JSON.stringify(mapping)}`;
  const layers = project.animation?.states?.[tier]?.layers || [];
  return layers.length ? `layers:${JSON.stringify(compact(layers))}` : '';
}

function evaluateWins(project, director) {
  const issues = [];
  const escalation = normalizeWinEscalation(director.winEscalation);
  const thresholds = WIN_TIER_ORDER.map(tier => escalation.thresholds[tier]);
  const durations = WIN_TIER_ORDER.map(tier => escalation.tierDurations[tier]);
  for (let index = 1; index < thresholds.length; index++) if (thresholds[index] <= thresholds[index - 1]) issues.push('Win-tier thresholds must rise strictly from small through mega.');
  for (let index = 1; index < durations.length; index++) if (durations[index] <= durations[index - 1]) issues.push('Win-tier presentation durations must rise strictly from small through mega.');

  const winRecipe = director.recipes.find(recipe => recipe.enabled && recipe.event === 'winInfo');
  if (!cue(winRecipe, 'reels', 'highlight', '$wins')) issues.push('Win resolution does not highlight the evaluated winning symbols.');
  if (!cue(winRecipe, 'animation', 'state', '$winTier')) issues.push('Win resolution does not route into tier-specific animation.');
  if (!cue(winRecipe, 'audio', 'stinger', '$winTier')) issues.push('Win resolution does not route into tier-specific sound.');
  if (!cue(winRecipe, 'ui', 'winDisplay', '$runningAmount')) issues.push('Win resolution does not update the running amount.');
  if (!cue(winRecipe, 'world', 'pulse', 'win')) issues.push('Win resolution has no cabinet/world response.');

  const signatures = [];
  for (const tier of WIN_TIER_ORDER) {
    const signature = authoredTierSignature(project, tier);
    if (!signature) issues.push(`${tier} has no authored animation layer or Spine mapping.`);
    else signatures.push(signature);
    const animationDuration = Number(project.animation?.states?.[tier]?.duration) || 0;
    const recipeDuration = getPresentationRecipeDuration(project, winRecipe || { event: 'winInfo', duration: 0, tierDurations: escalation.tierDurations }, { amount: escalation.thresholds[tier] });
    if (animationDuration > 0 && recipeDuration < animationDuration) issues.push(`${tier} settles after ${recipeDuration}ms but its animation is configured for ${animationDuration}ms.`);
  }
  if (signatures.length === WIN_TIER_ORDER.length && new Set(signatures).size !== WIN_TIER_ORDER.length) issues.push('Two or more win tiers resolve to identical authored animation evidence.');

  const wincap = director.recipes.find(recipe => recipe.enabled && recipe.event === 'wincap');
  if (!cue(wincap, 'camera', 'shake')) issues.push('Maximum win has no camera shake escalation.');
  if (!cue(wincap, 'ui', 'wincap', '$amount')) issues.push('Maximum win has no dedicated result presentation.');
  if (getPresentationRecipeDuration(project, wincap || { event: 'wincap', duration: 0 }, {}) < Number(project.animation?.states?.wincap?.duration || 0)) issues.push('Maximum-win recipe settles before its configured animation completes.');
  return { passed: issues.length === 0, issues, thresholds, durations, authoredTiers: signatures.length };
}

export function evaluatePresentationPolish(project) {
  const director = normalizePresentationDirector(project.presentationDirector || {});
  const reels = evaluateReels(project, director);
  const wins = evaluateWins(project, director);
  const issues = [...new Set([...reels.issues, ...wins.issues])];
  return { passed: issues.length === 0, issues, reels, wins };
}

export function recordPresentationPolishQA(project) {
  project.production ||= {};
  project.production.presentation ||= {};
  const evaluation = evaluatePresentationPolish(project);
  project.production.presentation.polishAudit = {
    format: PRESENTATION_POLISH_FORMAT,
    fingerprint: getPresentationPolishFingerprint(project),
    runAt: new Date().toISOString(),
    passed: evaluation.passed,
    issues: evaluation.issues,
    reelStopGapsMs: evaluation.reels.stopGapsMs,
    regularSettleMs: evaluation.reels.regular.totalMs,
    anticipationSettleMs: evaluation.reels.anticipation.totalMs,
    winThresholds: evaluation.wins.thresholds,
    winDurations: evaluation.wins.durations,
  };
  return getPresentationPolishSummary(project);
}

export function getPresentationPolishSummary(project) {
  const fingerprint = getPresentationPolishFingerprint(project);
  const report = project.production?.presentation?.polishAudit || null;
  const fresh = report?.format === PRESENTATION_POLISH_FORMAT && report.fingerprint === fingerprint;
  const evaluation = fresh ? evaluatePresentationPolish(project) : null;
  return {
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && evaluation?.passed),
    issues: evaluation?.issues || [],
    reels: evaluation?.reels || null,
    wins: evaluation?.wins || null,
    runAt: fresh ? report.runAt || null : null,
  };
}
