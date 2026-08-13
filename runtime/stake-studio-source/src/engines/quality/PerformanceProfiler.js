const PROFILE_FORMAT = 'stake-studio-performance-profile-v1';
export const PERFORMANCE_VIEWPORTS = ['desktop', 'mobile', 'mini'];

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

function mapSources(value) {
  if (Array.isArray(value)) return value.map(mapSources);
  if (!value || typeof value !== 'object') return typeof value === 'string' && /^(data:|blob:|https?:)/.test(value) ? sourceSignature(value) : value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['performanceAudit', 'visualQaReport'].includes(key))
    .map(([key, child]) => [key, mapSources(child)]));
}

export function getPerformanceFingerprint(project) {
  return hashText(JSON.stringify(mapSources({
    grid: project.math?.grid,
    cabinet: project.theme?.cabinet,
    character: project.theme?.character,
    symbols: project.theme?.symbols,
    submission: project.theme?.submission,
    animation: project.animation,
    audio: project.audio,
    presentationDirector: project.presentationDirector,
  })));
}

export function estimateEmbeddedAssetBytes(project) {
  const sources = new Set();
  const seen = new WeakSet();
  const visit = value => {
    if (typeof value === 'string') {
      if (value.startsWith('data:')) sources.add(value);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) value.forEach(visit);
    else Object.entries(value).forEach(([key, child]) => { if (key !== 'performanceAudit') visit(child); });
  };
  visit(project);
  let bytes = 0;
  for (const source of sources) {
    const comma = source.indexOf(',');
    if (comma < 0) continue;
    const header = source.slice(0, comma);
    const payload = source.slice(comma + 1);
    if (header.includes(';base64')) {
      const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
      bytes += Math.max(0, Math.floor(payload.length * 0.75) - padding);
    } else {
      try { bytes += new TextEncoder().encode(decodeURIComponent(payload)).length; }
      catch { bytes += new TextEncoder().encode(payload).length; }
    }
  }
  return bytes;
}

function normalizeSample(sample = {}) {
  const averageMs = Math.max(0, Number(sample.averageMs) || 0);
  return {
    viewport: PERFORMANCE_VIEWPORTS.includes(sample.viewport) ? sample.viewport : 'desktop',
    frames: Math.max(0, Number(sample.frames) || 0),
    averageMs,
    rawAverageMs: Math.max(0, Number(sample.rawAverageMs) || averageMs),
    p95Ms: Math.max(0, Number(sample.p95Ms) || 0),
    maxMs: Math.max(0, Number(sample.maxMs) || 0),
    longFrames: Math.max(0, Number(sample.longFrames) || 0),
    fps: Math.max(0, Number(sample.fps) || 0),
    textureMemoryBytes: Math.max(0, Number(sample.textureMemoryBytes) || 0),
    renderSurfaces: Math.max(0, Number(sample.renderSurfaces) || 0),
    domNodes: Math.max(0, Number(sample.domNodes) || 0),
    viewportWidth: Math.max(0, Number(sample.viewportWidth) || 0),
    viewportHeight: Math.max(0, Number(sample.viewportHeight) || 0),
  };
}

export function evaluatePerformanceSamples(project, samples = []) {
  const targetFps = Math.max(30, Number(project.production?.budgets?.targetFps) || 60);
  const frameBudget = 1000 / targetFps;
  const textureBudget = Math.max(1, Number(project.production?.budgets?.maxTextureMemoryMb) || 96) * 1024 * 1024;
  const normalized = samples.map(normalizeSample);
  const issues = [];
  for (const viewport of PERFORMANCE_VIEWPORTS) {
    const sample = normalized.find(item => item.viewport === viewport);
    if (!sample || sample.frames < 24) {
      issues.push(`${viewport} has no representative frame sample.`);
      continue;
    }
    if (sample.averageMs > frameBudget * 1.25) issues.push(`${viewport} average frame time ${sample.averageMs.toFixed(1)}ms exceeds the ${frameBudget.toFixed(1)}ms target.`);
    if (sample.p95Ms > frameBudget * 2) issues.push(`${viewport} p95 frame time ${sample.p95Ms.toFixed(1)}ms shows unstable pacing.`);
    if (sample.longFrames / sample.frames > 0.1) issues.push(`${viewport} dropped ${sample.longFrames}/${sample.frames} frames beyond twice the budget.`);
    if (sample.textureMemoryBytes > textureBudget) issues.push(`${viewport} estimated texture memory ${(sample.textureMemoryBytes / 1024 / 1024).toFixed(1)}MB exceeds the ${project.production?.budgets?.maxTextureMemoryMb || 96}MB budget.`);
  }
  return {
    passed: issues.length === 0,
    issues,
    samples: normalized,
    targetFps,
    frameBudget,
    textureBudget,
  };
}

export function recordPerformanceProfile(project, samples, extra = {}) {
  project.production ||= {};
  project.production.qa ||= {};
  const evaluation = evaluatePerformanceSamples(project, samples);
  const report = {
    format: PROFILE_FORMAT,
    fingerprint: getPerformanceFingerprint(project),
    runAt: new Date().toISOString(),
    passed: evaluation.passed,
    issues: evaluation.issues,
    samples: evaluation.samples,
    embeddedAssetBytes: Math.max(0, Number(extra.embeddedAssetBytes) || estimateEmbeddedAssetBytes(project)),
    userAgent: String(extra.userAgent || ''),
    devicePixelRatio: Math.max(1, Number(extra.devicePixelRatio) || 1),
  };
  project.production.qa.performanceAudit = report;
  return getPerformanceProfileSummary(project);
}

export function getPerformanceProfileSummary(project) {
  const fingerprint = getPerformanceFingerprint(project);
  const report = project.production?.qa?.performanceAudit || null;
  const fresh = report?.format === PROFILE_FORMAT && report.fingerprint === fingerprint;
  const evaluation = fresh ? evaluatePerformanceSamples(project, report.samples) : { passed: false, issues: [], samples: [] };
  const slowest = evaluation.samples.reduce((current, sample) => !current || sample.p95Ms > current.p95Ms ? sample : current, null);
  const peakTextureBytes = evaluation.samples.reduce((maximum, sample) => Math.max(maximum, sample.textureMemoryBytes), 0);
  return {
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && evaluation.passed),
    issues: evaluation.issues,
    samples: evaluation.samples,
    runAt: fresh ? report.runAt : null,
    embeddedAssetBytes: fresh ? report.embeddedAssetBytes || 0 : estimateEmbeddedAssetBytes(project),
    slowest,
    peakTextureBytes,
    targetFps: evaluation.targetFps || Number(project.production?.budgets?.targetFps) || 60,
  };
}
