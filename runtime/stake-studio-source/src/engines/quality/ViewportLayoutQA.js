const LAYOUT_FORMAT = 'stake-studio-viewport-layout-qa-v1';
export const LAYOUT_VIEWPORTS = ['desktop', 'mobile', 'mini'];

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
  return /^(data:|blob:|https?:)/.test(value) ? [value.length, value.slice(0, 28), value.slice(-40)] : value;
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return typeof value === 'string' ? sourceSignature(value) : value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, compact(value[key])]));
}

export function getViewportLayoutFingerprint(project) {
  return hashText(JSON.stringify(compact({
    grid: project.math?.grid,
    cabinet: project.theme?.cabinet,
    character: project.theme?.character,
    symbols: project.theme?.symbols,
    animation: {
      states: project.animation?.states,
      stateAnimations: project.animation?.stateAnimations,
      runtime: project.animation?.runtime,
    },
    presentationDirector: project.presentationDirector,
  })));
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

function normalizeRect(rect = {}) {
  const x = Number(rect.x) || 0;
  const y = Number(rect.y) || 0;
  const width = number(rect.width);
  const height = number(rect.height);
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function normalizeSample(sample = {}) {
  return {
    viewport: LAYOUT_VIEWPORTS.includes(sample.viewport) ? sample.viewport : 'desktop',
    viewportWidth: number(sample.viewportWidth),
    viewportHeight: number(sample.viewportHeight),
    overflowX: number(sample.overflowX),
    overflowY: number(sample.overflowY),
    stageScale: number(sample.stageScale),
    stage: normalizeRect(sample.stage),
    reels: normalizeRect(sample.reels),
    hud: normalizeRect(sample.hud),
    spin: normalizeRect(sample.spin),
    minimumSymbolWidth: number(sample.minimumSymbolWidth),
    minimumSymbolHeight: number(sample.minimumSymbolHeight),
    hudLabelFontPx: number(sample.hudLabelFontPx),
    hudValueFontPx: number(sample.hudValueFontPx),
    controlsOverlap: Boolean(sample.controlsOverlap),
  };
}

function outside(rect, width, height, tolerance = 2) {
  return rect.width <= 0 || rect.height <= 0
    || rect.x < -tolerance || rect.y < -tolerance
    || rect.right > width + tolerance || rect.bottom > height + tolerance;
}

export function evaluateViewportLayoutSamples(project, samples = []) {
  const normalized = samples.map(normalizeSample);
  const issues = [];
  for (const viewport of LAYOUT_VIEWPORTS) {
    const sample = normalized.find(item => item.viewport === viewport);
    if (!sample || sample.viewportWidth < 100 || sample.viewportHeight < 100) {
      issues.push(`${viewport} has no representative layout measurement.`);
      continue;
    }
    if (sample.overflowX > 2 || sample.overflowY > 2) issues.push(`${viewport} scrolls beyond its intended safe area (${sample.overflowX.toFixed(0)}px × ${sample.overflowY.toFixed(0)}px overflow).`);
    if (outside(sample.stage, sample.viewportWidth, sample.viewportHeight)) issues.push(`${viewport} crops the game stage.`);
    if (outside(sample.reels, sample.viewportWidth, sample.viewportHeight)) issues.push(`${viewport} crops the playable reels.`);
    if (outside(sample.hud, sample.viewportWidth, sample.viewportHeight)) issues.push(`${viewport} crops the balance, bet, spin, or win controls.`);
    if (sample.spin.width < 44 || sample.spin.height < 44) issues.push(`${viewport} spin control is ${sample.spin.width.toFixed(0)}×${sample.spin.height.toFixed(0)}px; the minimum target is 44×44px.`);
    if (sample.minimumSymbolWidth < 32 || sample.minimumSymbolHeight < 32) issues.push(`${viewport} symbol cells fall below the 32px legibility floor.`);
    if (sample.hudLabelFontPx < 7 || sample.hudValueFontPx < 11) issues.push(`${viewport} HUD typography is too small (${sample.hudLabelFontPx.toFixed(1)}px labels / ${sample.hudValueFontPx.toFixed(1)}px values).`);
    if (sample.controlsOverlap) issues.push(`${viewport} HUD controls overlap each other.`);
  }
  return { passed: issues.length === 0, issues, samples: normalized };
}

export function recordViewportLayoutQA(project, samples) {
  project.production ||= {};
  project.production.qa ||= {};
  const evaluation = evaluateViewportLayoutSamples(project, samples);
  const report = {
    format: LAYOUT_FORMAT,
    fingerprint: getViewportLayoutFingerprint(project),
    runAt: new Date().toISOString(),
    passed: evaluation.passed,
    issues: evaluation.issues,
    samples: evaluation.samples,
  };
  project.production.qa.viewportAudit = report;
  return getViewportLayoutSummary(project);
}

export function getViewportLayoutSummary(project) {
  const fingerprint = getViewportLayoutFingerprint(project);
  const report = project.production?.qa?.viewportAudit || null;
  const fresh = report?.format === LAYOUT_FORMAT && report.fingerprint === fingerprint;
  const evaluation = fresh ? evaluateViewportLayoutSamples(project, report.samples) : { passed: false, issues: [], samples: [] };
  const tightestSpin = evaluation.samples.reduce((current, sample) => !current || Math.min(sample.spin.width, sample.spin.height) < Math.min(current.spin.width, current.spin.height) ? sample : current, null);
  const smallestSymbol = evaluation.samples.reduce((current, sample) => !current || Math.min(sample.minimumSymbolWidth, sample.minimumSymbolHeight) < Math.min(current.minimumSymbolWidth, current.minimumSymbolHeight) ? sample : current, null);
  return {
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && evaluation.passed),
    issues: evaluation.issues,
    samples: evaluation.samples,
    runAt: fresh ? report.runAt || null : null,
    tightestSpin,
    smallestSymbol,
  };
}
