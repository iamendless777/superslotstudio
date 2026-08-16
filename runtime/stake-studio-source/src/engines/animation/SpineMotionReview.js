import {
  analyzeRenderedPixels,
  compareRenderedThumbnails,
  normalizeRenderedMetrics,
} from '../quality/RenderedPixelQA.js';

export const SPINE_MOTION_FORMAT = 'stake-studio-spine-motion-qa-v2';
export const SPINE_MOTION_SAMPLE_COUNT = 13;
const SETUP_SKIN = '__setup__';
const LOOPING_STATES = new Set(['idle', 'idleAlt', 'spinning', 'anticipation', 'bonusIdle']);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const ratio = (value, baseline) => baseline > 0 ? value / baseline : value > 0 ? Infinity : 1;
const timeKey = value => finite(value).toFixed(6);

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

export function getSpineAssetFingerprint(asset = {}) {
  const images = Object.entries(asset.atlasImages || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, source]) => [name, String(source || '').length, String(source || '').slice(-48)]);
  if (!images.length && asset.atlasImage) {
    const source = String(asset.atlasImage);
    images.push([asset.atlasImageName || asset.atlasPage || 'atlas-image', source.length, source.slice(-48)]);
  }
  return hashText(JSON.stringify({
    name: asset.name || '',
    version: asset.version || '',
    skeleton: asset.rawJSON || null,
    atlas: asset.atlasText || '',
    images,
  }));
}

export function getSpineMotionFingerprint(project, assetName) {
  const asset = (project.animation?.spineAssets || []).find(item => item.name === assetName);
  if (!asset) return null;
  const rig = project.production?.rig || {};
  const forAsset = items => (items || []).filter(item => item.asset === assetName);
  return hashText(JSON.stringify(compact({
    asset: getSpineAssetFingerprint(asset),
    mappings: project.animation?.stateAnimations || {},
    corrections: forAsset(rig.corrections),
    drawOrderRules: forAsset(rig.drawOrderRules),
    anchors: forAsset(rig.anchors),
    secondaryMotion: forAsset(rig.secondaryMotion),
  })));
}

function mappingDescriptor(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw.asset && raw.animation ? raw : null;
  const separator = String(raw).indexOf(':');
  return separator > 0 ? { asset: String(raw).slice(0, separator), animation: String(raw).slice(separator + 1) } : null;
}

function loopingAnimations(project, assetName) {
  const animations = new Set();
  for (const [state, raw] of Object.entries(project?.animation?.stateAnimations || {})) {
    const mapping = mappingDescriptor(raw);
    if (!mapping || mapping.asset !== assetName) continue;
    const loops = typeof mapping.loop === 'boolean' ? mapping.loop : LOOPING_STATES.has(state);
    if (loops) animations.add(mapping.animation);
  }
  return animations;
}

export function getSpineMotionCases(asset = {}, project = null) {
  const skins = asset.skins?.length ? asset.skins : [null];
  const loops = loopingAnimations(project, asset.name);
  return skins.flatMap(skin => (asset.animations || []).map(animation => ({
    id: `${skin || SETUP_SKIN}::${animation.name}`,
    skin: skin || null,
    animation: animation.name,
    duration: Number(animation.duration) || null,
    loopExpected: loops.has(animation.name),
  })));
}

export function getSpineMotionSampleTimes(duration) {
  const seconds = finite(duration);
  if (seconds <= 0) return [];
  return Array.from({ length: SPINE_MOTION_SAMPLE_COUNT }, (_, index) => (
    Number((seconds * index / (SPINE_MOTION_SAMPLE_COUNT - 1)).toFixed(6))
  ));
}

export const analyzeSpineMotionPixels = analyzeRenderedPixels;

function normalizeEvent(event = {}) {
  return { name: String(event.name || ''), time: Math.max(0, finite(event.time)) };
}

function normalizeCaseSample(sample = {}) {
  return {
    id: String(sample.id || `${sample.skin || SETUP_SKIN}::${sample.animation || ''}`),
    skin: sample.skin || null,
    animation: String(sample.animation || ''),
    samples: (sample.samples || []).map(frame => ({
      time: Math.max(0, finite(frame.time)),
      metrics: normalizeRenderedMetrics(frame.metrics),
      error: String(frame.error || ''),
    })),
    events: (sample.events || []).map(normalizeEvent).filter(event => event.name),
    error: String(sample.error || ''),
  };
}

function expectedAnimationEvents(asset, animationName) {
  return (asset.rawJSON?.animations?.[animationName]?.events || []).map(normalizeEvent).filter(event => event.name);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function evaluateMotionCase(asset, motionCase, rawSample) {
  const sample = normalizeCaseSample(rawSample || { id: motionCase.id });
  const issues = [];
  const add = (id, message, time = null) => issues.push({ id, message, time });
  const expectedTimes = getSpineMotionSampleTimes(motionCase.duration);
  const frames = new Map(sample.samples.map(frame => [timeKey(frame.time), frame]));
  if (!rawSample) add('missing-case', 'No rendered motion evidence was recorded.');
  if (!expectedTimes.length) add('invalid-duration', 'The animation has no measurable duration.');
  const missingTimes = expectedTimes.filter(time => !frames.has(timeKey(time)));
  if (missingTimes.length) add('missing-frames', `${missingTimes.length} required frame sample${missingTimes.length === 1 ? ' is' : 's are'} missing.`);
  if (sample.error) add('runtime-error', sample.error);

  const measured = expectedTimes.map(time => frames.get(timeKey(time))).filter(Boolean);
  const visible = measured.filter(frame => !frame.error && frame.metrics.visiblePixels >= 8);
  const medianAlpha = median(visible.map(frame => frame.metrics.alphaMass));
  const medianBounds = median(visible.map(frame => frame.metrics.boundsAreaFraction));
  const medianComponents = median(visible.map(frame => frame.metrics.components));
  for (const frame of measured) {
    if (frame.error) {
      add('frame-error', frame.error, frame.time);
      continue;
    }
    const metrics = frame.metrics;
    if (metrics.visiblePixels < 8) add('invisible-frame', 'The character nearly disappeared.', frame.time);
    const alphaRatio = ratio(metrics.alphaMass, medianAlpha);
    const boundsRatio = ratio(metrics.boundsAreaFraction, medianBounds);
    if (alphaRatio < 0.35) add('silhouette-collapse', `Visible alpha collapsed to ${Math.round(alphaRatio * 100)}% of the animation median.`, frame.time);
    if (alphaRatio > 2.8) add('silhouette-pop', `Visible alpha jumped to ${Math.round(alphaRatio * 100)}% of the animation median.`, frame.time);
    if (boundsRatio < 0.3 || boundsRatio > 3) add('bounds-pop', `Silhouette bounds changed to ${boundsRatio.toFixed(2)}× the animation median.`, frame.time);
    if (metrics.edgeTouchFraction > 0.12) add('stage-clipping', `${Math.round(metrics.edgeTouchFraction * 100)}% of stage-edge samples are occupied.`, frame.time);
    if (metrics.components > medianComponents + 5 && metrics.largestComponentShare < 0.72) {
      add('fragmentation', `${metrics.components} disconnected pixel islands appeared.`, frame.time);
    }
  }

  let maximumFrameDelta = 0;
  let maximumCenterJump = 0;
  for (let index = 1; index < measured.length; index++) {
    const previous = measured[index - 1];
    const current = measured[index];
    maximumFrameDelta = Math.max(maximumFrameDelta, compareRenderedThumbnails(previous.metrics.thumbnail, current.metrics.thumbnail));
    const jump = Math.hypot(
      current.metrics.centroidX - previous.metrics.centroidX,
      current.metrics.centroidY - previous.metrics.centroidY,
    );
    maximumCenterJump = Math.max(maximumCenterJump, jump);
    if (jump > 0.22) add('position-pop', `Character center jumped ${Math.round(jump * 100)}% of the stage between samples.`, current.time);
  }
  if (expectedTimes.length > 1 && maximumFrameDelta < 0.0015) {
    add('no-visible-motion', 'The animation produced no meaningful rendered movement.');
  }

  let loopDelta = null;
  if (motionCase.loopExpected && measured.length === expectedTimes.length) {
    const first = measured[0].metrics;
    const last = measured[measured.length - 1].metrics;
    loopDelta = compareRenderedThumbnails(first.thumbnail, last.thumbnail);
    const centerGap = Math.hypot(last.centroidX - first.centroidX, last.centroidY - first.centroidY);
    const massGap = ratio(last.alphaMass, first.alphaMass);
    if (loopDelta > 0.12 || centerGap > 0.06 || massGap < 0.75 || massGap > 1.33) {
      add('loop-seam', `Loop endpoints do not match (pixel delta ${(loopDelta * 100).toFixed(1)}%, center gap ${Math.round(centerGap * 100)}%).`);
    }
  }

  const expectedEvents = expectedAnimationEvents(asset, motionCase.animation);
  const eventTolerance = Math.max(0.05, finite(motionCase.duration) / Math.max(1, SPINE_MOTION_SAMPLE_COUNT - 1));
  const unmatchedEvents = [...sample.events];
  for (const expected of expectedEvents) {
    const matchIndex = unmatchedEvents.findIndex(event => event.name === expected.name && Math.abs(event.time - expected.time) <= eventTolerance);
    if (matchIndex < 0) add('missing-event', `Event “${expected.name}” did not fire near ${expected.time.toFixed(3)}s.`);
    else unmatchedEvents.splice(matchIndex, 1);
  }
  for (const event of sample.events) {
    if (event.time > finite(motionCase.duration) + eventTolerance) add('late-event', `Event “${event.name}” fired after the animation ended.`);
  }

  return {
    ...sample,
    status: issues.length ? 'repair' : 'pass',
    issues,
    framesMeasured: measured.length,
    expectedFrames: expectedTimes.length,
    maximumFrameDelta,
    maximumCenterJump,
    loopDelta,
    expectedEvents: expectedEvents.length,
    eventsObserved: sample.events.length,
  };
}

function evaluateCases(project, asset, samples = []) {
  const plan = getSpineMotionCases(asset, project);
  const byId = new Map(samples.map(sample => [normalizeCaseSample(sample).id, sample]));
  const cases = plan.map(motionCase => evaluateMotionCase(asset, motionCase, byId.get(motionCase.id)));
  return {
    cases,
    total: cases.length,
    passed: cases.filter(item => item.status === 'pass').length,
    repairs: cases.filter(item => item.status === 'repair').length,
    framesMeasured: cases.reduce((sum, item) => sum + item.framesMeasured, 0),
    eventsObserved: cases.reduce((sum, item) => sum + item.eventsObserved, 0),
    issues: cases.flatMap(item => item.issues.map(issue => `${item.skin || 'setup'} / ${item.animation}: ${issue.time === null ? '' : `${issue.time.toFixed(3)}s — `}${issue.message}`)),
  };
}

export function recordSpineMotionQA(project, assetName, samples = [], { runtimeStatus = 'ready' } = {}) {
  const asset = (project.animation?.spineAssets || []).find(item => item.name === assetName);
  if (!asset) throw new Error(`Unknown Spine asset “${assetName}”.`);
  const evaluation = evaluateCases(project, asset, samples);
  if (runtimeStatus !== 'ready') evaluation.issues.unshift(`Spine runtime finished in ${runtimeStatus} state.`);
  project.production ||= {};
  project.production.rig ||= {};
  project.production.rig.motionReviews ||= {};
  project.production.rig.motionReviews[assetName] = {
    format: SPINE_MOTION_FORMAT,
    asset: asset.name,
    fingerprint: getSpineMotionFingerprint(project, assetName),
    runAt: new Date().toISOString(),
    runtimeStatus,
    passed: runtimeStatus === 'ready' && evaluation.repairs === 0 && evaluation.total > 0,
    cases: evaluation.cases.map(item => ({
      id: item.id,
      skin: item.skin,
      animation: item.animation,
      samples: item.samples,
      events: item.events,
      error: item.error,
    })),
  };
  return getSpineMotionReviewSummary(project, assetName);
}

export function clearSpineMotionReview(project, assetName) {
  if (project.production?.rig?.motionReviews) delete project.production.rig.motionReviews[assetName];
  return getSpineMotionReviewSummary(project, assetName);
}

export function getSpineMotionReviewSummary(project, assetName) {
  const asset = (project.animation?.spineAssets || []).find(item => item.name === assetName);
  if (!asset) return {
    asset: assetName, fingerprint: null, fresh: false, stale: false, complete: false,
    total: 0, reviewed: 0, passed: 0, repairs: 0, framesMeasured: 0, eventsObserved: 0,
    issues: [], cases: [], nextCase: null, runAt: null,
  };
  const fingerprint = getSpineMotionFingerprint(project, assetName);
  const stored = project.production?.rig?.motionReviews?.[assetName] || null;
  const fresh = stored?.format === SPINE_MOTION_FORMAT && stored.fingerprint === fingerprint;
  const evaluation = fresh ? evaluateCases(project, asset, stored.cases || []) : null;
  const cases = evaluation?.cases || getSpineMotionCases(asset, project).map(item => ({ ...item, status: 'pending', issues: [] }));
  const complete = Boolean(fresh && stored.runtimeStatus === 'ready' && stored.passed && evaluation?.repairs === 0 && evaluation.total > 0);
  return {
    asset: asset.name,
    fingerprint,
    storedFingerprint: stored?.fingerprint || null,
    fresh,
    stale: Boolean(stored) && !fresh,
    complete,
    total: evaluation?.total || cases.length,
    reviewed: fresh ? cases.length : 0,
    passed: evaluation?.passed || 0,
    repairs: evaluation?.repairs || 0,
    framesMeasured: evaluation?.framesMeasured || 0,
    eventsObserved: evaluation?.eventsObserved || 0,
    issues: fresh ? [
      ...(stored.runtimeStatus === 'ready' ? [] : [`Spine runtime finished in ${stored.runtimeStatus} state.`]),
      ...(evaluation?.issues || []),
    ] : [],
    cases,
    nextCase: cases.find(item => item.status !== 'pass') || cases[0] || null,
    runAt: fresh ? stored.runAt || null : null,
  };
}

export function getProjectSpineMotionReview(project) {
  const summaries = (project.animation?.spineAssets || []).map(asset => getSpineMotionReviewSummary(project, asset.name));
  return {
    summaries,
    total: summaries.reduce((sum, item) => sum + item.total, 0),
    passed: summaries.reduce((sum, item) => sum + item.passed, 0),
    repairs: summaries.reduce((sum, item) => sum + item.repairs, 0),
    framesMeasured: summaries.reduce((sum, item) => sum + item.framesMeasured, 0),
    eventsObserved: summaries.reduce((sum, item) => sum + item.eventsObserved, 0),
    issues: summaries.flatMap(item => item.issues),
    fresh: summaries.length === 0 || summaries.every(item => item.fresh),
    complete: summaries.length === 0 || summaries.every(item => item.complete),
    stale: summaries.some(item => item.stale),
  };
}
