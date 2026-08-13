import { STANDARD_ANIMATION_STATES } from './AnimationEngine.js';
import { isAngleInRange } from './RigCorrectionEngine.js';

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeDrawOrderRule(rule = {}) {
  return {
    id: String(rule.id || ''),
    name: String(rule.name || 'Untitled layer rule'),
    enabled: rule.enabled !== false,
    asset: String(rule.asset || ''),
    bone: String(rule.bone || ''),
    state: rule.state && rule.state !== 'any' ? String(rule.state) : null,
    minAngle: finite(rule.minAngle, 45),
    maxAngle: finite(rule.maxAngle, 135),
    slot: String(rule.slot || ''),
    relativeTo: String(rule.relativeTo || ''),
    position: rule.position === 'before' ? 'before' : 'after',
    priority: finite(rule.priority, 0),
  };
}

export function normalizeAnchor(anchor = {}) {
  const targetX = anchor.targetX === '' || anchor.targetX == null ? null : finite(anchor.targetX, null);
  const targetY = anchor.targetY === '' || anchor.targetY == null ? null : finite(anchor.targetY, null);
  return {
    id: String(anchor.id || ''),
    name: String(anchor.name || 'Untitled anchor'),
    enabled: anchor.enabled !== false,
    asset: String(anchor.asset || ''),
    bone: String(anchor.bone || ''),
    state: anchor.state && anchor.state !== 'any' ? String(anchor.state) : null,
    mode: anchor.mode === 'socket' ? 'socket' : 'plant',
    targetX,
    targetY,
    strength: finite(anchor.strength, 1),
    priority: finite(anchor.priority, 0),
  };
}

export function normalizeSecondaryMotion(system = {}) {
  return {
    id: String(system.id || ''),
    name: String(system.name || 'Untitled secondary motion'),
    enabled: system.enabled !== false,
    asset: String(system.asset || ''),
    bone: String(system.bone || ''),
    state: system.state && system.state !== 'any' ? String(system.state) : null,
    stiffness: finite(system.stiffness, 90),
    damping: finite(system.damping, 14),
    maxAngle: finite(system.maxAngle, 25),
    priority: finite(system.priority, 0),
  };
}

function contextMatches(item, { asset, state } = {}) {
  return item.enabled && item.asset === asset && (!item.state || item.state === state);
}

export function getActiveDrawOrderRules(project, context = {}) {
  const rules = (project.production?.rig?.drawOrderRules || [])
    .map(normalizeDrawOrderRule)
    .filter(rule => contextMatches(rule, context)
      && Object.hasOwn(context.boneAngles || {}, rule.bone)
      && isAngleInRange(context.boneAngles[rule.bone], rule.minAngle, rule.maxAngle))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  const claimedSlots = new Set();
  return rules.filter(rule => !claimedSlots.has(rule.slot) && claimedSlots.add(rule.slot));
}

export function getActiveAnchors(project, context = {}) {
  return (project.production?.rig?.anchors || [])
    .map(normalizeAnchor)
    .filter(anchor => contextMatches(anchor, context))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
}

export function getActiveSecondaryMotion(project, context = {}) {
  const systems = (project.production?.rig?.secondaryMotion || [])
    .map(normalizeSecondaryMotion)
    .filter(system => contextMatches(system, context))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  const claimedBones = new Set();
  return systems.filter(system => !claimedBones.has(system.bone) && claimedBones.add(system.bone));
}

function validateBase(item, prefix, assets, seenIds, category) {
  const issues = [];
  if (!item.id) issues.push({ severity: 'error', category, message: `${prefix} has no stable ID.` });
  else if (seenIds.has(item.id)) issues.push({ severity: 'error', category, message: `Pose mechanic ID "${item.id}" is duplicated.` });
  seenIds.add(item.id);
  const asset = assets.get(item.asset);
  if (!asset) issues.push({ severity: 'error', category, message: `${prefix} references missing Spine asset "${item.asset}".` });
  else if (!(asset.bones || []).includes(item.bone)) issues.push({ severity: 'error', category, message: `${prefix} references missing bone "${item.bone}".` });
  if (item.state && !STANDARD_ANIMATION_STATES.includes(item.state)) {
    issues.push({ severity: 'error', category, message: `${prefix} references unknown game state "${item.state}".` });
  }
  return { asset, issues };
}

export function validatePoseMechanics(project) {
  const issues = [];
  const assets = new Map((project.animation?.spineAssets || []).map(asset => [asset.name, asset]));
  const seenIds = new Set();

  for (const raw of project.production?.rig?.drawOrderRules || []) {
    const rule = normalizeDrawOrderRule(raw);
    const prefix = rule.name || rule.id || 'Layer rule';
    const result = validateBase(rule, prefix, assets, seenIds, 'draw-order');
    issues.push(...result.issues);
    if (result.asset) {
      if (!(result.asset.slots || []).includes(rule.slot)) issues.push({ severity: 'error', category: 'draw-order', message: `${prefix} references missing slot "${rule.slot}".` });
      if (!(result.asset.slots || []).includes(rule.relativeTo)) issues.push({ severity: 'error', category: 'draw-order', message: `${prefix} references missing relative slot "${rule.relativeTo}".` });
      if (rule.slot && rule.slot === rule.relativeTo) issues.push({ severity: 'error', category: 'draw-order', message: `${prefix} cannot move a slot relative to itself.` });
    }
    if (rule.minAngle < -180 || rule.minAngle > 180 || rule.maxAngle < -180 || rule.maxAngle > 180) {
      issues.push({ severity: 'error', category: 'draw-order', message: `${prefix} uses angles outside -180° to 180°.` });
    }
  }

  for (const raw of project.production?.rig?.anchors || []) {
    const anchor = normalizeAnchor(raw);
    const prefix = anchor.name || anchor.id || 'Anchor';
    const result = validateBase(anchor, prefix, assets, seenIds, 'anchor');
    issues.push(...result.issues);
    if (anchor.mode === 'plant' && ((anchor.targetX == null) !== (anchor.targetY == null))) {
      issues.push({ severity: 'error', category: 'anchor', message: `${prefix} needs both target coordinates or neither (capture current position).` });
    }
    if (!(anchor.strength > 0 && anchor.strength <= 1)) issues.push({ severity: 'error', category: 'anchor', message: `${prefix} strength must be greater than 0 and no more than 1.` });
  }

  for (const raw of project.production?.rig?.secondaryMotion || []) {
    const system = normalizeSecondaryMotion(raw);
    const prefix = system.name || system.id || 'Secondary motion';
    const result = validateBase(system, prefix, assets, seenIds, 'secondary-motion');
    issues.push(...result.issues);
    if (!(system.stiffness > 0)) issues.push({ severity: 'error', category: 'secondary-motion', message: `${prefix} stiffness must be positive.` });
    if (system.damping < 0) issues.push({ severity: 'error', category: 'secondary-motion', message: `${prefix} damping cannot be negative.` });
    if (!(system.maxAngle > 0 && system.maxAngle <= 180)) issues.push({ severity: 'error', category: 'secondary-motion', message: `${prefix} maximum lag must be between 0° and 180°.` });
  }
  return issues;
}

export function getPoseMechanicsSummary(project, assetName = null) {
  const rig = project.production?.rig || {};
  const filter = values => values.filter(value => !assetName || value.asset === assetName);
  const drawOrderRules = filter((rig.drawOrderRules || []).map(normalizeDrawOrderRule));
  const anchors = filter((rig.anchors || []).map(normalizeAnchor));
  const secondaryMotion = filter((rig.secondaryMotion || []).map(normalizeSecondaryMotion));
  const issues = validatePoseMechanics(project);
  return {
    drawOrderRules,
    anchors,
    secondaryMotion,
    total: drawOrderRules.length + anchors.length + secondaryMotion.length,
    enabled: [...drawOrderRules, ...anchors, ...secondaryMotion].filter(item => item.enabled).length,
    issues,
    valid: issues.length === 0,
  };
}

export function createPoseMechanicsManifest(project) {
  const rig = project.production?.rig || {};
  return {
    format: 'stake-studio-pose-mechanics-v1',
    drawOrderRules: (rig.drawOrderRules || []).map(normalizeDrawOrderRule),
    anchors: (rig.anchors || []).map(normalizeAnchor),
    secondaryMotion: (rig.secondaryMotion || []).map(normalizeSecondaryMotion),
  };
}
