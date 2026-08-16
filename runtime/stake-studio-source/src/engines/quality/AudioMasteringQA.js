import {
  DUCKING_EVENTS,
  audioAssetBus,
  auditAudioDirector,
  flattenAudioAssets,
  normalizeAudioDirector,
} from '../audio/AudioDirector.js';

export const AUDIO_MASTERING_FORMAT = 'stake-studio-audio-mastering-qa-v1';

const IMPORTANT_PRESENTATION_AUDIO = Object.freeze({
  spinStart: { action: 'stinger', targets: ['spinStart'] },
  anticipation: { action: 'stinger', targets: ['anticipation'] },
  winInfo: { action: 'stinger', targets: ['$winTier', 'winSmall', 'winMedium', 'winBig', 'winMega'] },
  tumbleBoard: { action: 'stinger', targets: ['cascadeDrop'] },
  freeSpinTrigger: { action: 'stinger', targets: ['bonusTrigger'] },
  enterBonus: { action: 'music', targets: ['bonusMusic'] },
  freeSpinEnd: { action: 'stinger', targets: ['bonusEnd'] },
  wincap: { action: 'stinger', targets: ['wincap'] },
});

const ROLE_RMS_BANDS = Object.freeze({
  music: [-38, -7],
  ambience: [-48, -9],
  sfx: [-38, -7],
  voice: [-34, -8],
});

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sourceSignature(source) {
  const value = String(source || '');
  return value ? [value.length, value.slice(0, 32), value.slice(-48)] : null;
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return typeof value === 'string' && /^(data:|blob:|https?:)/.test(value) ? sourceSignature(value) : value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, compact(value[key])]));
}

export function getAudioMasteringFingerprint(project) {
  return hashText(JSON.stringify(compact({
    layers: project.audio?.layers,
    stingers: project.audio?.stingers,
    director: normalizeAudioDirector(project.audio?.director),
    presentation: project.presentationDirector?.recipes,
  })));
}

export function buildAudioMasteringInventory(project) {
  return flattenAudioAssets(project).map(({ key, type, event, index, asset }) => {
    const bus = audioAssetBus(type, asset);
    return {
      id: type === 'stinger' ? `stinger:${event}:${index ?? 0}` : `layer:${key}`,
      name: type === 'stinger' ? `${event}${index === undefined ? '' : ` variation ${index + 1}`}` : key,
      type,
      event: event || null,
      bus,
      src: asset.src,
      source: asset.source || 'imported',
      volume: Number(asset.volume ?? (type === 'stinger' ? 1 : 0.5)),
    };
  });
}

const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const dbfs = value => value > 0 ? 20 * Math.log10(value) : -120;

function normalizeSample(sample = {}) {
  return {
    id: String(sample.id || ''),
    loaded: Boolean(sample.loaded),
    sourceFingerprint: String(sample.sourceFingerprint || ''),
    mime: String(sample.mime || ''),
    portable: sample.portable !== false,
    duration: Math.max(0, finite(sample.duration)),
    sampleRate: Math.max(0, finite(sample.sampleRate)),
    channels: Math.max(0, Math.round(finite(sample.channels))),
    sampleCount: Math.max(0, Math.round(finite(sample.sampleCount))),
    peak: Math.max(0, finite(sample.peak)),
    rms: Math.max(0, finite(sample.rms)),
    dcOffset: finite(sample.dcOffset),
    clippedSamples: Math.max(0, Math.round(finite(sample.clippedSamples))),
    leadingSilenceMs: Math.max(0, finite(sample.leadingSilenceMs)),
    trailingSilenceMs: Math.max(0, finite(sample.trailingSilenceMs)),
    error: String(sample.error || ''),
  };
}

function evaluateCueSynchronization(project) {
  const issues = [];
  let checked = 0;
  for (const recipe of project.presentationDirector?.recipes || []) {
    const contract = IMPORTANT_PRESENTATION_AUDIO[recipe.event];
    if (!recipe.enabled || !contract) continue;
    checked++;
    const cues = (recipe.cues || []).filter(cue => cue.enabled !== false);
    const audioCue = cues.find(cue => cue.channel === 'audio' && cue.action === contract.action && contract.targets.includes(cue.target));
    if (!audioCue) {
      issues.push(`${recipe.name || recipe.event} has no mapped impact stinger in its presentation recipe.`);
      continue;
    }
    const visualCues = cues.filter(cue => cue.channel !== 'audio');
    if (!visualCues.length) {
      issues.push(`${recipe.name || recipe.event} has audio but no visual impact cue to synchronize against.`);
      continue;
    }
    const closestGap = Math.min(...visualCues.map(cue => Math.abs(finite(cue.at) - finite(audioCue.at))));
    if (closestGap > 120) issues.push(`${recipe.name || recipe.event} audio lands ${Math.round(closestGap)}ms from its nearest visual impact; maximum is 120ms.`);
  }
  if (!checked) issues.push('No enabled critical Presentation Director recipes were available for synchronization QA.');
  return { passed: checked > 0 && issues.length === 0, checked, issues };
}

function evaluateDucking(project, inventory) {
  const director = normalizeAudioDirector(project.audio?.director);
  const issues = [];
  if (!director.ducking.enabled) issues.push('Smart ducking is disabled.');
  if (director.ducking.amount < 0.25) issues.push('Ducking depth is below the 25% intelligibility floor.');
  if (director.ducking.attackMs > 120) issues.push(`Ducking attack is ${director.ducking.attackMs}ms; important impacts require 120ms or faster.`);
  if (director.ducking.releaseMs < 150 || director.ducking.releaseMs > 1200) issues.push(`Ducking release is ${director.ducking.releaseMs}ms; production range is 150–1200ms.`);
  const missingEvents = DUCKING_EVENTS.filter(event => !director.ducking.events.includes(event));
  if (missingEvents.length) issues.push(`Ducking does not cover ${missingEvents.join(', ')}.`);
  if (inventory.some(asset => asset.bus === 'voice') && !director.ducking.voice) issues.push('Voice-triggered ducking is disabled while voice assets are assigned.');
  return { passed: issues.length === 0, issues };
}

export function evaluateAudioMastering(project, samples = []) {
  const inventory = buildAudioMasteringInventory(project);
  const normalized = samples.map(normalizeSample);
  const director = normalizeAudioDirector(project.audio?.director);
  const directorAudit = auditAudioDirector(project);
  const issues = [];
  const loudnessIssues = [];
  const targetPeak = director.mastering.targetPeakDbfs;

  if (!inventory.length) issues.push('No assigned audio assets are available to audit.');
  for (const asset of inventory) {
    const sample = normalized.find(candidate => candidate.id === asset.id);
    if (!sample?.loaded) {
      loudnessIssues.push(`${asset.name} could not be decoded${sample?.error ? `: ${sample.error}` : '.'}`);
      continue;
    }
    const peakDb = dbfs(sample.peak * Math.max(0, asset.volume));
    const rmsDb = dbfs(sample.rms * Math.max(0, asset.volume));
    const [minimumRms, maximumRms] = ROLE_RMS_BANDS[asset.bus] || ROLE_RMS_BANDS.sfx;
    if (!sample.portable) loudnessIssues.push(`${asset.name} uses a non-portable blob or external source.`);
    if (sample.sampleRate < 22050) loudnessIssues.push(`${asset.name} is ${sample.sampleRate || 0}Hz; production audio requires at least 22050Hz.`);
    if (sample.channels < 1 || sample.channels > 2) loudnessIssues.push(`${asset.name} has ${sample.channels || 0} channels; production playback requires mono or stereo.`);
    if (sample.duration < 0.06) loudnessIssues.push(`${asset.name} is only ${Math.round(sample.duration * 1000)}ms and risks disappearing in playback.`);
    if (sample.clippedSamples > 0 || sample.peak >= 0.999) loudnessIssues.push(`${asset.name} contains ${sample.clippedSamples || 1} clipped sample${sample.clippedSamples === 1 ? '' : 's'}.`);
    else if (peakDb > targetPeak + 0.75) loudnessIssues.push(`${asset.name} peaks at ${peakDb.toFixed(1)} dBFS; target ceiling is ${(targetPeak + 0.75).toFixed(1)} dBFS.`);
    if (rmsDb < minimumRms || rmsDb > maximumRms) loudnessIssues.push(`${asset.name} measures ${rmsDb.toFixed(1)} dBFS RMS; ${asset.bus} target is ${minimumRms} to ${maximumRms} dBFS.`);
    if (Math.abs(sample.dcOffset) > 0.03) loudnessIssues.push(`${asset.name} has excessive DC offset (${sample.dcOffset.toFixed(3)}).`);
    if (asset.type === 'stinger' && sample.leadingSilenceMs > 100) loudnessIssues.push(`${asset.name} begins with ${Math.round(sample.leadingSilenceMs)}ms of silence and will feel late.`);
  }

  if (!directorAudit.ready) issues.push(...directorAudit.warnings);
  issues.push(...loudnessIssues);
  const synchronization = evaluateCueSynchronization(project);
  const ducking = evaluateDucking(project, inventory);
  issues.push(...synchronization.issues, ...ducking.issues);
  const decodedAssets = inventory.filter(asset => normalized.find(sample => sample.id === asset.id)?.loaded).length;
  return {
    passed: inventory.length > 0 && issues.length === 0,
    issues: [...new Set(issues)],
    samples: normalized,
    totalAssets: inventory.length,
    decodedAssets,
    loudness: { passed: inventory.length > 0 && decodedAssets === inventory.length && loudnessIssues.length === 0, issues: loudnessIssues },
    synchronization,
    ducking,
    director: directorAudit,
  };
}

export function recordAudioMasteringQA(project, samples) {
  project.production ||= {};
  project.production.audio ||= {};
  const evaluation = evaluateAudioMastering(project, samples);
  project.production.audio.masteringAudit = {
    format: AUDIO_MASTERING_FORMAT,
    fingerprint: getAudioMasteringFingerprint(project),
    runAt: new Date().toISOString(),
    passed: evaluation.passed,
    issues: evaluation.issues,
    samples: evaluation.samples,
    totalAssets: evaluation.totalAssets,
    decodedAssets: evaluation.decodedAssets,
  };
  return getAudioMasteringSummary(project);
}

export function getAudioMasteringSummary(project) {
  const fingerprint = getAudioMasteringFingerprint(project);
  const report = project.production?.audio?.masteringAudit || null;
  const fresh = report?.format === AUDIO_MASTERING_FORMAT && report.fingerprint === fingerprint;
  const evaluation = fresh ? evaluateAudioMastering(project, report.samples) : null;
  return {
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && evaluation?.passed),
    issues: evaluation?.issues || [],
    samples: evaluation?.samples || [],
    totalAssets: evaluation?.totalAssets || buildAudioMasteringInventory(project).length,
    decodedAssets: evaluation?.decodedAssets || 0,
    loudness: evaluation?.loudness || { passed: false, issues: [] },
    synchronization: evaluation?.synchronization || { passed: false, checked: 0, issues: [] },
    ducking: evaluation?.ducking || { passed: false, issues: [] },
    runAt: fresh ? report.runAt || null : null,
  };
}
