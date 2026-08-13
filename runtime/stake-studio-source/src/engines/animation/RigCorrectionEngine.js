import { STANDARD_ANIMATION_STATES } from './AnimationEngine.js';

export const RIG_CORRECTION_TYPES = {
  overlay: {
    label: 'Overlay patch',
    description: 'Shows an imported piece of art on top of the rig when a bone enters the angle range.',
  },
  attachment: {
    label: 'Spine attachment swap',
    description: 'Switches a Spine slot to alternate artwork already included in the skeleton export.',
  },
};

export function normalizeBoneAngle(value) {
  const numeric = Number(value) || 0;
  return ((numeric + 180) % 360 + 360) % 360 - 180;
}

export function isAngleInRange(angle, minAngle = -180, maxAngle = 180) {
  const value = normalizeBoneAngle(angle);
  const min = normalizeBoneAngle(minAngle);
  const max = normalizeBoneAngle(maxAngle);
  if (min === max) return Math.abs(value - min) < 0.0001;
  return min < max ? value >= min && value <= max : value >= min || value <= max;
}

export function normalizeRigCorrection(correction = {}) {
  const type = correction.type in RIG_CORRECTION_TYPES ? correction.type : 'overlay';
  return {
    id: String(correction.id || ''),
    name: String(correction.name || 'Untitled correction'),
    type,
    enabled: correction.enabled !== false,
    asset: String(correction.asset || ''),
    bone: String(correction.bone || ''),
    state: correction.state && correction.state !== 'any' ? String(correction.state) : null,
    minAngle: Number.isFinite(Number(correction.minAngle)) ? Number(correction.minAngle) : 45,
    maxAngle: Number.isFinite(Number(correction.maxAngle)) ? Number(correction.maxAngle) : 135,
    priority: Number.isFinite(Number(correction.priority)) ? Number(correction.priority) : 0,
    slot: String(correction.slot || ''),
    attachment: String(correction.attachment || ''),
    image: correction.image || null,
    imageName: String(correction.imageName || ''),
    offsetX: Number(correction.offsetX) || 0,
    offsetY: Number(correction.offsetY) || 0,
    scale: Number.isFinite(Number(correction.scale)) ? Number(correction.scale) : 1,
    rotation: Number(correction.rotation) || 0,
    anchorX: Number.isFinite(Number(correction.anchorX)) ? Number(correction.anchorX) : 0.5,
    anchorY: Number.isFinite(Number(correction.anchorY)) ? Number(correction.anchorY) : 0.5,
    opacity: Number.isFinite(Number(correction.opacity)) ? Number(correction.opacity) : 1,
  };
}

export function correctionMatchesContext(correction, { asset, state, boneAngles = {} } = {}) {
  const normalized = normalizeRigCorrection(correction);
  if (!normalized.enabled || !normalized.asset || normalized.asset !== asset) return false;
  if (normalized.state && normalized.state !== state) return false;
  if (!Object.hasOwn(boneAngles, normalized.bone)) return false;
  return isAngleInRange(boneAngles[normalized.bone], normalized.minAngle, normalized.maxAngle);
}

export function getActiveRigCorrections(project, context = {}) {
  const corrections = (project.production?.rig?.corrections || [])
    .map(normalizeRigCorrection)
    .filter(correction => correctionMatchesContext(correction, context))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  const claimedTargets = new Set();
  return corrections.filter(correction => {
    const target = correction.type === 'attachment' ? `attachment:${correction.slot}` : `overlay:${correction.id}`;
    if (claimedTargets.has(target)) return false;
    claimedTargets.add(target);
    return true;
  });
}

export function validateRigCorrections(project) {
  const issues = [];
  const assets = new Map((project.animation?.spineAssets || []).map(asset => [asset.name, asset]));
  const seenIds = new Set();
  for (const raw of project.production?.rig?.corrections || []) {
    const correction = normalizeRigCorrection(raw);
    const prefix = correction.name || correction.id || 'Rig correction';
    if (!correction.id) issues.push({ severity: 'error', category: 'rig-correction', message: `${prefix} has no stable ID.` });
    else if (seenIds.has(correction.id)) issues.push({ severity: 'error', category: 'rig-correction', message: `Rig correction ID "${correction.id}" is duplicated.` });
    seenIds.add(correction.id);
    const asset = assets.get(correction.asset);
    if (!asset) {
      issues.push({ severity: 'error', category: 'rig-correction', message: `${prefix} references missing Spine asset "${correction.asset}".` });
      continue;
    }
    if (!(asset.bones || []).includes(correction.bone)) {
      issues.push({ severity: 'error', category: 'rig-correction', message: `${prefix} references missing bone "${correction.bone}".` });
    }
    if (correction.state && !STANDARD_ANIMATION_STATES.includes(correction.state)) {
      issues.push({ severity: 'error', category: 'rig-correction', message: `${prefix} references unknown game state "${correction.state}".` });
    }
    if (correction.minAngle < -180 || correction.minAngle > 180 || correction.maxAngle < -180 || correction.maxAngle > 180) {
      issues.push({ severity: 'error', category: 'rig-correction', message: `${prefix} uses angles outside -180° to 180°.` });
    }
    if (correction.type === 'overlay') {
      if (!String(correction.image || '').startsWith('data:image/')) {
        issues.push({ severity: 'error', category: 'rig-correction', message: `${prefix} is missing embedded overlay artwork.` });
      }
      if (!(correction.scale > 0)) issues.push({ severity: 'error', category: 'rig-correction', message: `${prefix} must use a positive overlay scale.` });
      if (correction.anchorX < 0 || correction.anchorX > 1 || correction.anchorY < 0 || correction.anchorY > 1) {
        issues.push({ severity: 'error', category: 'rig-correction', message: `${prefix} overlay anchors must be between 0 and 1.` });
      }
    }
    if (correction.type === 'attachment') {
      if (!(asset.slots || []).includes(correction.slot)) {
        issues.push({ severity: 'error', category: 'rig-correction', message: `${prefix} references missing slot "${correction.slot}".` });
      }
      const attachmentExists = (asset.attachments || []).some(item => item.slot === correction.slot && item.name === correction.attachment);
      if (!attachmentExists) {
        issues.push({ severity: 'error', category: 'rig-correction', message: `${prefix} references missing attachment "${correction.attachment}" on slot "${correction.slot}".` });
      }
    }
  }
  return issues;
}

export function getRigCorrectionSummary(project, assetName = null) {
  const corrections = (project.production?.rig?.corrections || []).map(normalizeRigCorrection)
    .filter(correction => !assetName || correction.asset === assetName);
  const issues = validateRigCorrections(project).filter(issue => issue.category === 'rig-correction');
  return {
    total: corrections.length,
    enabled: corrections.filter(correction => correction.enabled).length,
    overlay: corrections.filter(correction => correction.type === 'overlay').length,
    attachment: corrections.filter(correction => correction.type === 'attachment').length,
    bones: [...new Set(corrections.map(correction => correction.bone).filter(Boolean))],
    issues,
    valid: issues.length === 0,
  };
}

export function createRigCorrectionManifest(project) {
  const rig = project.production?.rig || {};
  return {
    format: 'stake-studio-rig-corrections-v1',
    corrections: (rig.corrections || []).map(raw => {
      const { image, ...correction } = normalizeRigCorrection(raw);
      return correction;
    }),
    boneLimits: rig.boneLimits || [],
    drawOrderRules: rig.drawOrderRules || [],
    anchors: rig.anchors || [],
    secondaryMotion: rig.secondaryMotion || [],
  };
}
