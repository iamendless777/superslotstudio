import {
  artBibleFingerprint,
  getVisualCohesionStatus,
  normalizeVisualFactoryState,
} from '../assets/VisualAssetFactory.js';
import { getAssetIntegritySummary } from './AssetIntegrityQA.js';

export const VISUAL_COHESION_QA_FORMAT = 'stake-studio-visual-cohesion-qa-v1';

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function getVisualSourceFingerprint(source) {
  const value = String(source || '');
  return value ? `${value.length}:${hashText(value)}` : '';
}

function cabinetLayer(project, role) {
  const layers = project.theme?.cabinet?.layers || [];
  return layers.find(layer => layer.assetPackRole === role)
    || layers.find(layer => String(layer.name || layer.type || '').toLowerCase().includes(role))
    || null;
}

function visualItem(id, name, slot, src, target = null) {
  return { id, name, slot, target, src: String(src || '') };
}

export function buildVisualCohesionInventory(project) {
  const background = cabinetLayer(project, 'background');
  const foreground = cabinetLayer(project, 'foreground');
  const submission = project.theme?.submission || {};
  const inventory = [
    visualItem('cabinet:background', 'Cabinet background', 'background', background?.src || submission.background),
    visualItem('cabinet:foreground', 'Cabinet foreground', 'foreground', foreground?.src || submission.foreground),
    visualItem('submission:providerLogo', 'Provider logo', 'providerLogo', submission.providerLogo),
  ];
  for (const symbol of project.theme?.symbols || []) {
    inventory.push(visualItem(`symbol:${symbol.name}`, `Symbol ${symbol.name}`, 'symbol', symbol.src, symbol.name));
  }
  for (const [pose, src] of Object.entries(project.theme?.character?.poses || {})) {
    if (src) inventory.push(visualItem(`character:${pose}`, `Character ${pose}`, 'characterPose', src, pose));
  }
  return inventory;
}

export function getVisualCohesionQAFingerprint(project) {
  const factory = normalizeVisualFactoryState(project);
  const integrity = getAssetIntegritySummary(project);
  const payload = {
    artBible: artBibleFingerprint(factory.artBible),
    lockedBible: factory.artBible.lockedFingerprint || null,
    palette: project.theme?.colorPalette || [],
    inventory: buildVisualCohesionInventory(project).map(item => ({
      id: item.id, slot: item.slot, source: getVisualSourceFingerprint(item.src),
    })),
    cabinet: (project.theme?.cabinet?.layers || []).map(layer => ({
      id: layer.id || layer.name || layer.type, role: layer.assetPackRole || null,
      source: getVisualSourceFingerprint(layer.src), visible: layer.visible !== false,
    })),
    submission: Object.fromEntries(['background', 'foreground', 'providerLogo'].map(key => [key, getVisualSourceFingerprint(project.theme?.submission?.[key])])),
    references: (factory.references || []).map(reference => ({
      id: reference.id, approved: reference.approved, bibleFingerprint: reference.bibleFingerprint,
      source: reference.imageFingerprint || getVisualSourceFingerprint(reference.src),
    })).sort((left, right) => String(left.id).localeCompare(String(right.id))),
    assignments: Object.values(factory.assignments || {}).map(record => ({
      key: record.assignmentKey, format: record.format, coherenceFingerprint: record.coherenceFingerprint,
      analysisFormat: record.analysis?.format, analysisPassed: record.analysis?.passed, analysisScore: record.analysis?.score,
    })).sort((left, right) => String(left.key).localeCompare(String(right.key))),
    integrity: {
      current: integrity.fingerprint, stored: integrity.storedFingerprint,
      complete: integrity.complete,
    },
  };
  return hashText(JSON.stringify(payload));
}

function normalizeSample(sample = {}) {
  return {
    id: String(sample.id || ''),
    sourceFingerprint: String(sample.sourceFingerprint || ''),
    analysis: sample.analysis && typeof sample.analysis === 'object' ? sample.analysis : null,
  };
}

function result(id, name, passed, evidence, remedy) {
  return { id, name, passed: Boolean(passed), evidence, remedy };
}

function duplicateNames(items) {
  const groups = new Map();
  for (const item of items.filter(item => item.src)) {
    const key = getVisualSourceFingerprint(item.src);
    groups.set(key, [...(groups.get(key) || []), item.name]);
  }
  return [...groups.values()].filter(names => names.length > 1);
}

export function evaluateVisualCohesionQA(project, samples = []) {
  const factory = normalizeVisualFactoryState(project);
  const status = getVisualCohesionStatus(project);
  const integrity = getAssetIntegritySummary(project);
  const inventory = buildVisualCohesionInventory(project);
  const normalizedSamples = samples.map(normalizeSample);
  const palette = [...new Set((project.theme?.colorPalette || []).map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];
  const biblePalette = String(factory.artBible.palette || '').toLowerCase();
  const paletteLinked = palette.length >= 4 && palette.every(color => biblePalette.includes(color));
  const missing = inventory.filter(item => !item.src);
  const staleSamples = inventory.filter(item => {
    if (!item.src) return false;
    const sample = normalizedSamples.find(candidate => candidate.id === item.id);
    return !sample || sample.sourceFingerprint !== getVisualSourceFingerprint(item.src);
  });
  const failedAnalyses = inventory.filter(item => item.src).flatMap(item => {
    const sample = normalizedSamples.find(candidate => candidate.id === item.id);
    if (!sample || sample.sourceFingerprint !== getVisualSourceFingerprint(item.src)) return [];
    const analysis = sample.analysis;
    const failed = (analysis?.checks || []).filter(check => !check.passed);
    return analysis?.format === 'stake-studio-visual-analysis-v1' && analysis.passed === true && failed.length === 0
      ? [] : [{ item, analysis, failed }];
  });
  const symbols = inventory.filter(item => item.slot === 'symbol');
  const populatedSymbols = symbols.filter(item => item.src);
  const duplicateSymbols = duplicateNames(symbols);
  const character = inventory.filter(item => item.slot === 'characterPose');
  const duplicatePoses = duplicateNames(character);
  const background = cabinetLayer(project, 'background');
  const foreground = cabinetLayer(project, 'foreground');
  const submission = project.theme?.submission || {};
  const cabinetRolesReady = Boolean(background?.src && foreground?.src && background.src !== foreground.src);
  const submissionLinked = Boolean(
    submission.background && submission.foreground
    && background?.src === submission.background && foreground?.src === submission.foreground
  );
  const checks = [
    result('art-bible-lineage', 'Locked art direction lineage', status.ready && status.driftedAssignments.length === 0,
      status.bibleDrift ? 'The Art Direction Bible changed after its lock.' : `${status.currentFingerprint} · ${status.driftedAssignments.length} drifted assignments`,
      'Lock the current Art Direction Bible and replace assignments generated from an older lineage.'),
    result('palette-contract', 'Theme palette matches the locked Bible', paletteLinked,
      `${palette.length} unique theme colors · ${paletteLinked ? 'all represented in the Bible' : 'palette drift detected'}`,
      'Define at least four unique theme colors, forge the Bible from them, and lock that exact version.'),
    result('asset-integrity', 'Every source passes decoded-file integrity', integrity.complete,
      integrity.complete ? `${integrity.passedAssets}/${integrity.totalAssets} production assignments clean` : integrity.stale ? 'Integrity evidence is stale.' : 'Integrity audit is missing or has failures.',
      'Run Production File QA and repair every decode, alpha, crop, resolution, portability, atlas, or memory failure.'),
    result('role-coverage', 'Every visual production role is populated', missing.length === 0,
      missing.length ? missing.map(item => item.name).join(', ') : `${inventory.length}/${inventory.length} visual roles populated`,
      'Assign final art to every symbol, cabinet layer, provider logo, and configured character pose.'),
    result('local-visual-analysis', 'Every asset passes all role-specific visual checks', staleSamples.length === 0 && failedAnalyses.length === 0,
      staleSamples.length ? `${staleSamples.length} assets have missing or stale analysis` : failedAnalyses.length ? failedAnalyses.map(entry => `${entry.item.name}: ${(entry.failed || []).map(check => check.name).join(', ') || 'invalid report'}`).join(' · ') : `${inventory.length - missing.length}/${inventory.length} populated assets passed without warnings`,
      'Run Visual Pack QA, then replace or correct every asset with a failed palette, readability, framing, alpha, reference, or composition check.'),
    result('symbol-identity', 'Every reel symbol has a distinct visual source', symbols.length > 0 && populatedSymbols.length === symbols.length && duplicateSymbols.length === 0,
      duplicateSymbols.length ? duplicateSymbols.map(names => names.join(' / ')).join(' · ') : `${populatedSymbols.length}/${symbols.length} distinct populated symbol sources`,
      'Replace duplicated symbol artwork so every value tier, Wild, and Scatter remains instantly distinguishable.'),
    result('cabinet-separation', 'Background and foreground are separate cabinet roles', cabinetRolesReady,
      cabinetRolesReady ? 'Background and foreground are present and distinct.' : 'Missing, unclassified, or duplicated cabinet layers.',
      'Assign one background and one distinct foreground layer with explicit production roles.'),
    result('submission-lineage', 'Submission art is tied to the live cabinet', submissionLinked,
      submissionLinked ? 'Background and foreground match the live cabinet.' : 'Submission art and cabinet art do not share the same current sources.',
      'Reassign the current cabinet background and foreground to submission.'),
    result('character-identity', 'Configured character poses use distinct art', duplicatePoses.length === 0,
      duplicatePoses.length ? duplicatePoses.map(names => names.join(' / ')).join(' · ') : `${character.length} configured poses use distinct sources`,
      'Replace duplicated pose images so each performance state has authored acting while preserving the character design.'),
  ];
  return {
    passed: checks.every(check => check.passed), checks,
    issues: checks.filter(check => !check.passed).map(check => `${check.name}: ${check.evidence}`),
    samples: normalizedSamples, totalAssets: inventory.length,
    passedAssets: inventory.length - new Set([...missing, ...staleSamples, ...failedAnalyses.map(entry => entry.item)].map(item => item.id)).size,
  };
}

export function recordVisualCohesionQA(project, samples) {
  project.production ||= {};
  project.production.qa ||= {};
  const evaluation = evaluateVisualCohesionQA(project, samples);
  project.production.qa.visualCohesionAudit = {
    format: VISUAL_COHESION_QA_FORMAT,
    fingerprint: getVisualCohesionQAFingerprint(project),
    runAt: new Date().toISOString(),
    passed: evaluation.passed,
    checks: evaluation.checks,
    issues: evaluation.issues,
    samples: evaluation.samples,
    totalAssets: evaluation.totalAssets,
    passedAssets: evaluation.passedAssets,
  };
  return getVisualCohesionQASummary(project);
}

export function getVisualCohesionQASummary(project) {
  const fingerprint = getVisualCohesionQAFingerprint(project);
  const report = project.production?.qa?.visualCohesionAudit || null;
  const fresh = report?.format === VISUAL_COHESION_QA_FORMAT && report.fingerprint === fingerprint;
  const evaluation = fresh ? evaluateVisualCohesionQA(project, report.samples) : null;
  return {
    fingerprint, storedFingerprint: report?.fingerprint || null,
    fresh, stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && evaluation?.passed),
    issues: evaluation?.issues || [], checks: evaluation?.checks || [],
    totalAssets: evaluation?.totalAssets || buildVisualCohesionInventory(project).length,
    passedAssets: evaluation?.passedAssets || 0,
    runAt: fresh ? report.runAt || null : null,
  };
}
