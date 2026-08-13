import { forgeArtBible, lockArtBible, normalizeVisualFactoryState, validateArtBible } from '../assets/VisualAssetFactory.js';
import { prepareFactoryProject } from '../factory/FactoryRunEngine.js';
import {
  createProfessionalPresentationDirector,
  normalizePresentationDirector,
} from '../presentation/PresentationDirector.js';
import { applyProfessionalDefaults, QualityDirector } from './QualityDirector.js';

export const SAFE_REPAIR_FORMAT = 'stake-studio-safe-repair-v1';

const now = () => new Date().toISOString();
const failedIds = audit => new Set(audit.checks.filter(check => !check.passed).map(check => check.id));
const intersects = (ids, targets) => targets.some(id => ids.has(id));

function appendMissingPresentationRecipes(project) {
  const current = normalizePresentationDirector(project.presentationDirector || {});
  const defaults = createProfessionalPresentationDirector();
  const coveredEvents = new Set(current.recipes.map(recipe => recipe.event));
  const missing = defaults.recipes.filter(recipe => !coveredEvents.has(recipe.event));
  if (!missing.length) return 0;
  project.presentationDirector = normalizePresentationDirector({
    ...current,
    recipes: [...current.recipes, ...missing],
  });
  return missing.length;
}

function repairArtDirection(project) {
  const factory = normalizeVisualFactoryState(project);
  if (Object.keys(factory.assignments || {}).length) {
    return { applied: false, reason: 'Existing generated assignments require a human decision before the governing art bible can change.' };
  }
  if (!String(project.theme?.style || '').trim() && !String(project.theme?.lore || '').trim()) {
    return { applied: false, reason: 'Theme style or lore must be authored before the factory can lock a specific art direction.' };
  }
  if (factory.artBible.lockedFingerprint) {
    return { applied: false, reason: 'An existing locked art bible must be reviewed rather than silently relocked.' };
  }
  const forged = forgeArtBible(project);
  factory.artBible = Object.fromEntries(Object.entries(forged).map(([key, value]) => [
    key,
    typeof factory.artBible?.[key] === 'string' && factory.artBible[key].trim() ? factory.artBible[key] : value,
  ]));
  const validation = validateArtBible(factory.artBible);
  if (!validation.valid) return { applied: false, reason: validation.issues[0] };
  const colors = [...new Set(String(factory.artBible.palette).match(/#[0-9a-f]{6}\b/gi) || [])];
  project.theme ||= {};
  if ((project.theme.colorPalette || []).length < 4 && colors.length >= 4) project.theme.colorPalette = colors;
  const fingerprint = lockArtBible(project);
  return { applied: true, detail: `Forged and locked art direction ${fingerprint} from the authored theme.` };
}

function currentDeferred(project) {
  return new QualityDirector(project).audit().checks.filter(check => !check.passed).map(check => ({
    id: check.id,
    label: check.label,
    remedy: check.remedy,
    evidence: check.evidence,
    severity: check.severity,
    panel: check.panel,
  }));
}

export function applySafeRepairs(project, dependencies = {}) {
  const prepareProject = dependencies.prepareFactoryProject || prepareFactoryProject;
  const before = new QualityDirector(project).audit();
  const failures = failedIds(before);
  const applied = [];
  const notes = [];

  if (intersects(failures, ['release-standard', 'release-simulation', 'platform-reduced-motion'])) {
    applyProfessionalDefaults(project);
    applied.push({ id: 'professional-contract', label: 'Professional production contract', detail: 'Restored release budgets, runtime policy, atlas safety and simulation floors.' });
  }

  if (failures.has('animation-director')) {
    const added = appendMissingPresentationRecipes(project);
    if (added) applied.push({ id: 'presentation-recipes', label: 'Presentation recipe coverage', detail: `Added ${added} missing professional event recipe${added === 1 ? '' : 's'} without replacing authored recipes.` });
    else notes.push({ id: 'presentation-recipes', reason: 'Existing authored presentation recipes contain a structural problem that requires review.' });
  }

  if (intersects(failures, ['audio-bed', 'audio-events'])) {
    const generated = prepareProject(project, 'review');
    if (generated.sfx || generated.soundscapeLayers) {
      applied.push({
        id: 'generated-audio',
        label: 'Missing local audio',
        detail: `Generated ${generated.sfx} missing SFX and ${generated.soundscapeLayers} ${generated.soundscapeProfile || ''} soundscape layer${generated.soundscapeLayers === 1 ? '' : 's'}; custom audio was preserved.`,
      });
    }
  }

  if (intersects(failures, ['visual-palette', 'visual-direction-bible'])) {
    const result = repairArtDirection(project);
    if (result.applied) applied.push({ id: 'art-direction', label: 'Art direction contract', detail: result.detail });
    else notes.push({ id: 'art-direction', reason: result.reason });
  }

  const after = new QualityDirector(project).audit();
  const report = {
    format: SAFE_REPAIR_FORMAT,
    status: 'repairs-applied',
    startedAt: now(),
    completedAt: null,
    beforeScore: before.score,
    afterScore: after.score,
    applied,
    notes,
    deferred: currentDeferred(project),
    certificationFingerprint: null,
  };
  project.production ||= {};
  project.production.qa ||= {};
  project.production.qa.repairRun = report;
  return report;
}

export function addSafeRepairResult(report, result) {
  if (!report || !result?.id) return report;
  const destination = result.applied === false ? report.notes : report.applied;
  destination.push(result.applied === false
    ? { id: result.id, reason: result.reason || result.detail || 'Automatic repair was not safe.' }
    : { id: result.id, label: result.label || result.id, detail: result.detail || '' });
  return report;
}

export function finalizeSafeRepairRun(project, certification) {
  const report = project.production?.qa?.repairRun;
  if (!report?.format || report.format !== SAFE_REPAIR_FORMAT) return null;
  const audit = new QualityDirector(project).audit();
  report.status = certification?.complete ? 'certified' : 'completed-with-deferred-repairs';
  report.completedAt = now();
  report.afterScore = audit.score;
  report.deferred = (certification?.repairs || currentDeferred(project)).map(item => ({
    id: item.id,
    label: item.label,
    remedy: item.remedy,
    evidence: item.evidence,
    severity: item.severity,
    panel: item.panel,
  }));
  report.certificationFingerprint = certification?.fingerprint || null;
  return report;
}
