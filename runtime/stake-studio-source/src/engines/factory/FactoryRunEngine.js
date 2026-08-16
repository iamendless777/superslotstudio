import { generateCoreSfxPack } from '../audio/AudioFactory.js';
import { generateSoundscapePack } from '../audio/SoundscapeFactory.js';
import { ensurePresentationDirector } from '../presentation/PresentationDirector.js';
import {
  createAssetProductionRun,
  getAssetProductionSummary,
} from '../assets/AssetProductionConductor.js';
import { createVisualWorkOrder, getVisualWorkOrderStatus } from '../assets/VisualWorkOrder.js';
import {
  getCodexVisualBatchSummary,
  getNextCodexVisualTask,
  startCodexVisualBatch,
} from '../assets/CodexVisualBatch.js';
import {
  BLUEPRINT_FACTORY_STAGE_ORDER,
  getFactoryStageOrder,
  getFlagshipWorkflowGate,
  getProductionTrack,
} from './FlagshipWorkflow.js';

export const FACTORY_PROFILES = Object.freeze({
  prototype: Object.freeze({
    id: 'prototype',
    label: 'Prototype',
    mathProfile: 'smoke',
    generatedSoundscape: false,
    description: 'Fast playable proof · generated core SFX · up to 1,000 official books per mode',
  }),
  review: Object.freeze({
    id: 'review',
    label: 'Review',
    mathProfile: 'draft',
    generatedSoundscape: true,
    description: 'Daily studio build · complete generated soundscape · up to 25,000 official books per mode',
  }),
  release: Object.freeze({
    id: 'release',
    label: 'Release',
    mathProfile: 'production',
    generatedSoundscape: true,
    description: 'Configured production counts · Rust optimizer · official analysis and full-stream verification',
  }),
});

export const FACTORY_STAGE_ORDER = BLUEPRINT_FACTORY_STAGE_ORDER;
export const FACTORY_REPAIR_LIMITS = Object.freeze({ prototype: 1, review: 2, release: 2 });

const now = () => new Date().toISOString();
const hasSource = value => Boolean(value && typeof value === 'object' && value.src);

export function getFactoryProfile(id) {
  return FACTORY_PROFILES[id] || FACTORY_PROFILES.prototype;
}

export function inferSoundscapeProfile(project = {}) {
  const words = `${project.name || ''} ${project.theme?.style || ''} ${project.theme?.lore || ''}`.toLowerCase();
  if (/neon|cyber|electric|synth|future/.test(words)) return 'neonPulse';
  if (/bright|arcade|candy|party|comic/.test(words)) return 'brightArcade';
  if (/cosmic|space|astral|alien|star/.test(words)) return 'cosmicRitual';
  if (/gold|gilded|luxury|mystery|heist/.test(words)) return 'gildedMystery';
  if (/death|devil|doom|viking|war|ritual|hell|horror/.test(words)) return 'mythicDoom';
  return 'darkCinematic';
}

export function createFactoryRunReport(profileId = 'prototype', options = {}) {
  const profile = getFactoryProfile(profileId);
  const track = options.track === 'flagship' ? 'flagship' : 'blueprint';
  const stageOrder = getFactoryStageOrder(track);
  return {
    version: 2,
    id: `factory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    profile: profile.id,
    track,
    stageOrder,
    mathProfile: profile.mathProfile,
    status: 'running',
    startedAt: now(),
    updatedAt: now(),
    completedAt: null,
    resumeStage: stageOrder[0],
    awaiting: null,
    generated: { sfx: 0, soundscapeLayers: 0 },
    blockers: [],
    stages: Object.fromEntries(stageOrder.map(id => [id, {
      status: 'pending',
      message: id === 'package' ? 'Release package remains gated until every professional check passes.' : 'Waiting',
    }])),
  };
}

export function setFactoryStage(report, stage, status, message, extra = {}) {
  const stageOrder = report.stageOrder || FACTORY_STAGE_ORDER;
  if (!stageOrder.includes(stage)) throw new Error(`Unknown Factory Run stage "${stage}".`);
  report.stages[stage] = { status, message, ...extra };
  report.updatedAt = now();
  return report;
}

export function getFactoryWorkflowGate(project, stage) {
  if (getProductionTrack(project) !== 'flagship') return getCreativeFactoryGate(project);
  const flagship = getFlagshipWorkflowGate(project, stage);
  if (stage !== 'vision') return flagship;
  const creative = getCreativeFactoryGate(project);
  const missing = [
    ...flagship.missing,
    ...creative.missing.map(item => item.label),
  ];
  return {
    ...flagship,
    complete: missing.length === 0,
    missing,
    message: missing.length
      ? `Vision Charter requires ${missing.length} decision${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`
      : 'Vision, ambition, signature experience, world direction and provider identity are approved.',
  };
}

export function beginFactoryRepairAttempt(report, blockerCount = 0) {
  report.repairAutomation ||= {
    status: 'active',
    maxAttempts: FACTORY_REPAIR_LIMITS[report.profile] || 1,
    attempts: [],
    startedAt: now(),
    completedAt: null,
  };
  const automation = report.repairAutomation;
  if (automation.status === 'certified' || automation.status === 'needs-input' || automation.attempts.length >= automation.maxAttempts) return null;
  const attempt = {
    number: automation.attempts.length + 1,
    beforeBlockers: Math.max(0, Number(blockerCount) || 0),
    afterBlockers: null,
    safeChanges: 0,
    status: 'running',
    startedAt: now(),
    completedAt: null,
  };
  automation.attempts.push(attempt);
  report.updatedAt = attempt.startedAt;
  return attempt;
}

export function finishFactoryRepairAttempt(report, repairReport, certification) {
  const automation = report.repairAutomation;
  const attempt = automation?.attempts?.at(-1);
  if (!attempt) return null;
  const applied = repairReport?.applied || [];
  attempt.safeChanges = applied.filter(item => item.id !== 'frontend-compile').length;
  attempt.afterBlockers = Math.max(0, Number(certification?.blockers) || 0);
  attempt.certificationFingerprint = certification?.fingerprint || null;
  attempt.repairStatus = repairReport?.status || null;
  attempt.completedAt = now();
  attempt.status = certification?.complete ? 'certified' : 'completed';
  if (certification?.complete) automation.status = 'certified';
  else if (attempt.safeChanges === 0 || attempt.afterBlockers >= attempt.beforeBlockers) automation.status = 'needs-input';
  else if (automation.attempts.length >= automation.maxAttempts) automation.status = 'exhausted';
  else automation.status = 'active';
  if (automation.status !== 'active') automation.completedAt = attempt.completedAt;
  report.updatedAt = attempt.completedAt;
  return attempt;
}

export function getCreativeFactoryGate(project = {}) {
  const creative = project.production?.creative || {};
  const missing = [];
  if (!String(creative.coreHook || '').trim()) missing.push({ id: 'core-hook', label: 'Player hook', panel: 'quality' });
  if (!String(creative.signatureMoment || '').trim()) missing.push({ id: 'signature-moment', label: 'Signature moment', panel: 'quality' });
  if ((creative.differentiators || []).filter(value => String(value || '').trim()).length < 2) missing.push({ id: 'differentiators', label: 'Two concrete differentiators', panel: 'quality' });
  if (!String(project.theme?.style || '').trim()) missing.push({ id: 'theme-style', label: 'Theme rendering style', panel: 'config' });
  if (!String(project.theme?.lore || '').trim()) missing.push({ id: 'theme-lore', label: 'World lore', panel: 'config' });
  if (!String(project.build?.stakeEngine?.providerName || '').trim()) missing.push({ id: 'provider-name', label: 'Provider name', panel: 'config' });
  return {
    complete: missing.length === 0,
    missing,
    message: missing.length ? `${missing.length} greenlight decision${missing.length === 1 ? '' : 's'} required: ${missing.map(item => item.label).join(', ')}.` : 'Creative contract, world direction and provider identity are approved.',
  };
}

export function prepareFactoryVisualCheckpoint(project, profileId = 'prototype') {
  const profile = getFactoryProfile(profileId);
  let visual = getAssetProductionSummary(project);
  if (!visual.exists) {
    createAssetProductionRun(project, {
      quality: profile.id === 'prototype' ? 'concept' : profile.id === 'release' ? 'final' : 'review',
      maxAttempts: profile.id === 'prototype' ? 1 : profile.id === 'release' ? 3 : 2,
    });
    visual = getAssetProductionSummary(project);
  }
  if (visual.complete) {
    return { visual, workOrder: getVisualWorkOrderStatus(project), batch: getCodexVisualBatchSummary(project), task: null };
  }

  let workOrder = getVisualWorkOrderStatus(project);
  if (!workOrder.current && !(visual.blockers || []).length) {
    createVisualWorkOrder(project);
    workOrder = getVisualWorkOrderStatus(project);
  }

  let batch = getCodexVisualBatchSummary(project);
  let task = null;
  if (workOrder.current) {
    startCodexVisualBatch(project);
    batch = getCodexVisualBatchSummary(project);
    task = getNextCodexVisualTask(project);
  }
  return { visual, workOrder, batch, task };
}

export function pauseFactoryRun(report, stage, message, options = {}) {
  setFactoryStage(report, stage, 'awaiting', message, { action: options.action || null, panel: options.panel || null });
  report.status = 'awaiting-input';
  report.resumeStage = stage;
  report.awaiting = {
    stage,
    message,
    action: options.action || null,
    panel: options.panel || null,
    blockers: (options.blockers || []).map(value => typeof value === 'string' ? value : value.label || value.message).filter(Boolean),
  };
  report.blockers = [...report.awaiting.blockers];
  report.updatedAt = now();
  return report;
}

export function resumeFactoryRun(report) {
  if (!report || !['awaiting-input', 'cancelled', 'completed-with-blockers'].includes(report.status)) return report;
  report.status = 'running';
  report.awaiting = null;
  report.completedAt = null;
  report.updatedAt = now();
  return report;
}

export function finishFactoryRun(report, { releaseReady = false, blockers = [], failed = null } = {}) {
  report.blockers = blockers.map(value => typeof value === 'string' ? value : value.message).filter(Boolean);
  report.status = failed ? 'failed' : releaseReady ? 'release-ready' : 'completed-with-blockers';
  report.error = failed || null;
  report.awaiting = null;
  report.completedAt = now();
  report.updatedAt = report.completedAt;
  return report;
}

export function prepareFactoryProject(project, profileId = 'prototype', dependencies = {}) {
  const profile = getFactoryProfile(profileId);
  const makeSfx = dependencies.generateCoreSfxPack || generateCoreSfxPack;
  const makeSoundscape = dependencies.generateSoundscapePack || generateSoundscapePack;
  ensurePresentationDirector(project);
  project.audio ||= {};
  project.audio.factory ||= { version: 1, generatedAssets: 0, lastSource: null };
  project.audio.stingers ||= {};
  project.audio.layers ||= {};

  const generated = { sfx: 0, soundscapeLayers: 0, soundscapeProfile: null };
  const core = makeSfx({ intensity: 0.78 });
  for (const [key, asset] of Object.entries(core)) {
    if (Array.isArray(asset)) {
      const existing = Array.isArray(project.audio.stingers[key]) ? project.audio.stingers[key] : [];
      const merged = asset.map((value, index) => hasSource(existing[index]) ? existing[index] : value);
      generated.sfx += merged.filter((value, index) => !hasSource(existing[index]) && hasSource(value)).length;
      project.audio.stingers[key] = merged;
    } else if (!hasSource(project.audio.stingers[key])) {
      project.audio.stingers[key] = asset;
      generated.sfx += 1;
    }
  }

  if (profile.generatedSoundscape) {
    const missingLayers = ['baseMusic', 'bonusMusic', 'ambience'].filter(key => !hasSource(project.audio.layers[key]));
    if (missingLayers.length) {
      generated.soundscapeProfile = inferSoundscapeProfile(project);
      const pack = makeSoundscape({ profile: generated.soundscapeProfile, bars: 4, seed: 1103 });
      for (const key of missingLayers) {
        project.audio.layers[key] = pack[key];
        generated.soundscapeLayers += 1;
      }
    }
  }

  const generatedCount = generated.sfx + generated.soundscapeLayers;
  project.audio.factory.generatedAssets = Number(project.audio.factory.generatedAssets || 0) + generatedCount;
  if (generatedCount) project.audio.factory.lastSource = profile.generatedSoundscape ? 'factory-run-generated-pack' : 'factory-run-core-sfx';
  return generated;
}
