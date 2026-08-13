import { getAtlasPageNames, getAtlasRegionNames } from '../animation/AnimationEngine.js';
import { applyAnimationQualityPreset, applySuggestedMappings } from '../animation/AnimationProfiles.js';

export const ASSET_PACK_VERSION = 1;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac']);

const AUDIO_ALIASES = {
  baseMusic: ['base-music', 'music-base', 'main-music', 'music', 'bgm'],
  bonusMusic: ['bonus-music', 'music-bonus', 'feature-music'],
  ambience: ['ambience', 'ambient', 'atmosphere', 'room-tone'],
  spinStart: ['spin-start', 'start-spin'],
  reelStop: ['reel-stop', 'stop-reel'],
  winSmall: ['win-small', 'small-win'],
  winMedium: ['win-medium', 'medium-win'],
  winBig: ['win-big', 'big-win'],
  winMega: ['win-mega', 'mega-win'],
  wincap: ['wincap', 'win-cap', 'max-win'],
  scatterLand: ['scatter-land', 'land-scatter'],
  bonusTrigger: ['bonus-trigger', 'feature-trigger'],
  bonusEnd: ['bonus-end', 'feature-end'],
  anticipation: ['anticipation', 'suspense', 'near-miss'],
  cascadeDrop: ['cascade-drop', 'tumble', 'avalanche'],
  multiplierUp: ['multiplier-up', 'mult-up'],
};

const POSE_ALIASES = {
  idle: ['idle'], spinStart: ['spin-start'], spinning: ['spinning', 'spin-loop'], spinStop: ['spin-stop'],
  winSmall: ['win-small', 'small-win'], winMedium: ['win-medium', 'medium-win'],
  winBig: ['win-big', 'big-win'], winMega: ['win-mega', 'mega-win'], wincap: ['wincap', 'max-win'],
  anticipation: ['anticipation'], bonusEntry: ['bonus-entry'], bonusIdle: ['bonus-idle'], bonusExit: ['bonus-exit'],
  freeSpinBanner: ['free-spin-banner'], featureResult: ['feature-result'], lose: ['lose'], idleAlt: ['idle-alt'],
};

const clone = value => JSON.parse(JSON.stringify(value));
const extension = name => String(name || '').toLowerCase().split('.').pop();
const stem = name => String(name || '').replace(/\.[^.]+$/, '');
export const normalizeAssetName = value => String(value || '').trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function fingerprint(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `asset-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function sourceFingerprint(asset) {
  return fingerprint(`${asset.name}:${asset.size || 0}:${asset.src || asset.text || ''}`);
}

function assetKind(asset) {
  const ext = extension(asset.name);
  if (IMAGE_EXTENSIONS.has(ext) || asset.type?.startsWith('image/')) return 'image';
  if (AUDIO_EXTENSIONS.has(ext) || asset.type?.startsWith('audio/')) return 'audio';
  if (ext === 'json') return 'json';
  if (ext === 'atlas' || ext === 'txt') return 'atlas';
  return 'unknown';
}

function exactAlias(normalized, aliases) {
  return aliases.some(alias => normalized === alias || normalized === `audio-${alias}` || normalized === `sfx-${alias}`);
}

function numberedAlias(normalized, aliases) {
  for (const alias of aliases) {
    const match = normalized.match(new RegExp(`^(?:audio-|sfx-)?${alias}-(\\d+)$`));
    if (match) return Math.max(0, Number(match[1]) - 1);
  }
  return null;
}

function parseAtlasRegions(text) {
  return getAtlasRegionNames(text);
}

function animationDuration(animation) {
  let maximum = 0;
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Number(value.time) > maximum) maximum = Number(value.time);
    for (const child of Object.values(value)) visit(child);
  };
  visit(animation);
  return maximum || null;
}

export function parseSpineAsset(data, name, atlasText, atlasImage, atlasImageName, atlasImages = null) {
  const skeleton = data.skeleton || {};
  const skins = Array.isArray(data.skins) ? data.skins.map(item => item.name || 'default') : Object.keys(data.skins || {});
  const animations = Object.entries(data.animations || {}).map(([animationName, animation]) => ({
    name: animationName,
    duration: animationDuration(animation),
    trackCount: Object.keys(animation || {}).length,
  }));
  const attachments = [];
  const visitAttachments = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === 'object' && ('type' in child || 'path' in child)) attachments.push(key);
      else visitAttachments(child);
    }
  };
  visitAttachments(data.skins);
  const atlasPages = getAtlasPageNames(atlasText);
  return {
    name,
    version: skeleton.spine || skeleton.version || null,
    width: skeleton.width || null,
    height: skeleton.height || null,
    bones: (data.bones || []).map(bone => bone.name),
    slots: (data.slots || []).map(slot => slot.name),
    skins,
    attachments: [...new Set(attachments)],
    animations,
    atlasImage,
    atlasImageName,
    atlasImages: atlasImages || (atlasImageName && atlasImage ? { [atlasImageName]: atlasImage } : {}),
    atlasText,
    atlasPage: atlasPages[0] || atlasImageName,
    atlasPages,
    regions: parseAtlasRegions(atlasText),
    placement: { scale: 1 },
    rawJSON: data,
  };
}

function addAssignment(assignments, conflicts, assignment) {
  const key = `${assignment.kind}:${assignment.target}:${assignment.index ?? ''}`;
  const existing = assignments.find(item => `${item.kind}:${item.target}:${item.index ?? ''}` === key);
  if (existing) {
    conflicts.push({ key, files: [existing.asset.name, assignment.asset.name] });
    return;
  }
  assignments.push(assignment);
}

export function planAssetPack(project, incomingAssets = []) {
  const assets = incomingAssets.map(asset => ({ ...asset, kind: assetKind(asset), normalized: normalizeAssetName(stem(asset.name)) }));
  const assignments = [];
  const conflicts = [];
  const used = new Set();

  for (const jsonAsset of assets.filter(asset => asset.kind === 'json')) {
    let data;
    try { data = jsonAsset.data || JSON.parse(jsonAsset.text || ''); } catch { continue; }
    if (!data?.skeleton || !Array.isArray(data.bones)) continue;
    const base = jsonAsset.normalized.replace(/-(skeleton|rig)$/, '');
    const atlas = assets.find(asset => asset.kind === 'atlas' && (asset.normalized === base || asset.normalized.startsWith(base) || base.startsWith(asset.normalized)));
    if (!atlas) continue;
    const pages = getAtlasPageNames(atlas.text || '');
    const images = pages.map(page => assets.find(asset => asset.kind === 'image' && asset.name === page));
    if (!pages.length || images.some(image => !image)) continue;
    addAssignment(assignments, conflicts, { kind: 'spine', target: base || jsonAsset.normalized, asset: jsonAsset, atlas, image: images[0], images, data });
    used.add(jsonAsset.name); used.add(atlas.name); images.forEach(image => used.add(image.name));
  }

  const symbols = project.theme?.symbols || [];
  for (const asset of assets) {
    if (used.has(asset.name)) continue;
    if (asset.kind === 'audio') {
      let matched = false;
      for (const [target, aliases] of Object.entries(AUDIO_ALIASES)) {
        const index = numberedAlias(asset.normalized, aliases);
        if (index !== null && ['reelStop', 'scatterLand'].includes(target)) {
          addAssignment(assignments, conflicts, { kind: 'audioStinger', target, index, asset });
          matched = true; break;
        }
        if (exactAlias(asset.normalized, aliases)) {
          addAssignment(assignments, conflicts, { kind: ['baseMusic', 'bonusMusic', 'ambience'].includes(target) ? 'audioLayer' : 'audioStinger', target, asset });
          matched = true; break;
        }
      }
      if (matched) used.add(asset.name);
      continue;
    }
    if (asset.kind !== 'image') continue;

    const symbolName = asset.normalized.replace(/^(symbol|sym|icon)-/, '');
    const symbol = symbols.find(item => [item.id, item.name].some(name => normalizeAssetName(name) === symbolName));
    if (symbol) {
      addAssignment(assignments, conflicts, { kind: 'symbol', target: symbol.name, asset });
      used.add(asset.name); continue;
    }

    if (/^(provider-)?logo$/.test(asset.normalized) || asset.normalized.endsWith('-provider-logo')) {
      addAssignment(assignments, conflicts, { kind: 'submission', target: 'providerLogo', asset });
      used.add(asset.name); continue;
    }

    let pose = null;
    const poseName = asset.normalized.replace(/^(character|hero|host)-?/, '');
    for (const [state, aliases] of Object.entries(POSE_ALIASES)) {
      if (aliases.includes(poseName)) { pose = state; break; }
    }
    if (!pose && /^(character|hero|host)$/.test(asset.normalized)) pose = 'idle';
    if (pose) {
      addAssignment(assignments, conflicts, { kind: 'characterPose', target: pose, asset });
      used.add(asset.name); continue;
    }

    const role = /(^|-)background$/.test(asset.normalized) || /(^|-)bg$/.test(asset.normalized) || asset.normalized === 'environment' ? 'background'
      : /(^|-)foreground$/.test(asset.normalized) || /(^|-)fg$/.test(asset.normalized) ? 'foreground'
        : asset.normalized === 'frame' || asset.normalized.endsWith('-frame') ? 'frame'
          : ['overlay', 'vignette'].includes(asset.normalized) ? 'overlay' : null;
    if (role) {
      addAssignment(assignments, conflicts, { kind: 'cabinet', target: role, asset });
      used.add(asset.name);
    }
  }

  const unmatched = assets.filter(asset => !used.has(asset.name));
  return {
    version: ASSET_PACK_VERSION,
    assets,
    assignments,
    conflicts,
    unmatched,
    fingerprint: fingerprint(assets.map(asset => ({ name: asset.name, size: asset.size || 0, source: sourceFingerprint(asset) }))),
  };
}

function layerFor(role, asset, cabinet) {
  const z = { background: 0, foreground: 20, frame: 30, overlay: 40 }[role] ?? 10;
  return {
    id: globalThis.crypto?.randomUUID?.() || `asset-${Date.now()}-${role}`,
    name: role[0].toUpperCase() + role.slice(1), type: role === 'frame' ? 'frame' : 'image', src: asset.src,
    x: 0, y: 0, width: cabinet.width, height: cabinet.height, opacity: 1, zIndex: z,
    visible: true, locked: role === 'background', effects: [], blendMode: 'normal', assetPackRole: role,
  };
}

function recordFor(assignment) {
  return {
    kind: assignment.kind, target: assignment.target, index: assignment.index ?? null,
    file: assignment.asset.name, contentFingerprint: sourceFingerprint(assignment.asset),
  };
}

export function compileAssetPack(project, plan) {
  if (!plan || plan.version !== ASSET_PACK_VERSION) throw new Error('Asset pack plan is missing or incompatible.');
  if (plan.conflicts.length) throw new Error(`Resolve ${plan.conflicts.length} duplicate target conflict${plan.conflicts.length === 1 ? '' : 's'} before compiling.`);
  project.theme ||= {};
  project.theme.cabinet ||= { layers: [], width: 1280, height: 800 };
  project.theme.cabinet.layers ||= [];
  project.theme.symbols ||= [];
  project.theme.character ||= { poses: {}, placement: { x: 30, y: 60, width: 360, height: 620 } };
  project.theme.character.poses ||= {};
  project.theme.submission ||= {};
  project.audio ||= { layers: {}, stingers: {} };
  project.audio.layers ||= {};
  project.audio.stingers ||= {};
  project.animation ||= { spineAssets: [], stateAnimations: {}, runtime: {} };
  project.animation.spineAssets ||= [];
  project.animation.stateAnimations ||= {};
  project.animation.runtime ||= {};
  project.atlas ||= { assets: [], packed: null, padding: 2, maxSize: 2048 };
  project.atlas.assets ||= [];

  const compiled = [];
  for (const assignment of plan.assignments) {
    const { asset, kind, target } = assignment;
    if (kind === 'symbol') {
      const symbol = project.theme.symbols.find(item => item.name === target);
      if (symbol) symbol.src = asset.src;
    } else if (kind === 'cabinet') {
      const next = layerFor(target, asset, project.theme.cabinet);
      const index = project.theme.cabinet.layers.findIndex(layer => layer.assetPackRole === target);
      if (index >= 0) next.id = project.theme.cabinet.layers[index].id;
      if (index >= 0) project.theme.cabinet.layers[index] = next;
      else project.theme.cabinet.layers.push(next);
      if (target === 'background') project.theme.submission.background = asset.src;
      if (target === 'foreground') project.theme.submission.foreground = asset.src;
    } else if (kind === 'submission') {
      project.theme.submission[target] = asset.src;
    } else if (kind === 'characterPose') {
      project.theme.character.poses[target] = asset.src;
    } else if (kind === 'audioLayer') {
      project.audio.layers[target] = { src: asset.src, loop: true, volume: target === 'ambience' ? 0.45 : 0.7 };
    } else if (kind === 'audioStinger') {
      if (assignment.index !== undefined) {
        if (!Array.isArray(project.audio.stingers[target])) project.audio.stingers[target] = [];
        project.audio.stingers[target][assignment.index] = { src: asset.src, volume: 1 };
      } else project.audio.stingers[target] = { src: asset.src, volume: 1 };
    } else if (kind === 'spine') {
      const atlasImages = Object.fromEntries((assignment.images || [assignment.image]).map(image => [image.name, image.src]));
      const spine = parseSpineAsset(assignment.data, target, assignment.atlas.text, assignment.image.src, assignment.image.name, atlasImages);
      const index = project.animation.spineAssets.findIndex(item => item.name === spine.name);
      if (index >= 0) project.animation.spineAssets[index] = { ...spine, placement: project.animation.spineAssets[index].placement || spine.placement };
      else project.animation.spineAssets.push(spine);
      project.animation.runtime.activeSpineAsset = spine.name;
      applyAnimationQualityPreset(project, project.animation.runtime.profile || 'balanced');
      applySuggestedMappings(project, spine, { overwrite: false });
    }
    compiled.push(recordFor(assignment));
  }

  const atlasAssets = [];
  for (const symbol of project.theme.symbols) if (symbol.src) atlasAssets.push({ name: symbol.name, src: symbol.src });
  for (const [pose, src] of Object.entries(project.theme.character.poses)) if (src) atlasAssets.push({ name: `character-${pose}`, src });
  for (const item of atlasAssets) {
    const source = plan.assets.find(asset => asset.src === item.src);
    const value = { ...item, width: source?.width || 0, height: source?.height || 0 };
    const index = project.atlas.assets.findIndex(asset => asset.name === item.name);
    if (index >= 0) project.atlas.assets[index] = value;
    else project.atlas.assets.push(value);
  }
  project.atlas.packed = null;

  project.production ||= {};
  project.production.audio ||= {};
  project.production.qa ||= {};
  project.production.qa.visualCohesionAudit = null;
  project.production.qa.assetIntegrityVerified = false;
  project.production.audio.loudnessNormalized = false;
  project.production.audio.synchronizationReviewed = false;

  project.assetPack = {
    format: 'stake-studio-asset-pack-v1', version: ASSET_PACK_VERSION,
    sourceFingerprint: plan.fingerprint, appliedAt: new Date().toISOString(),
    sourceFiles: plan.assets.map(asset => ({ name: asset.name, type: asset.kind, size: asset.size || 0 })),
    bindings: compiled,
    unmatched: plan.unmatched.map(asset => asset.name),
  };
  return {
    compiled: compiled.length,
    bindings: compiled,
    unmatched: project.assetPack.unmatched,
    invalidated: ['packed texture atlas', 'visual cohesion audit', 'asset integrity approval', 'audio loudness and sync approvals'],
  };
}

function currentBindingSource(project, binding) {
  if (binding.kind === 'symbol') return project.theme?.symbols?.find(item => item.name === binding.target)?.src;
  if (binding.kind === 'cabinet') return project.theme?.cabinet?.layers?.find(item => item.assetPackRole === binding.target)?.src;
  if (binding.kind === 'submission') return project.theme?.submission?.[binding.target];
  if (binding.kind === 'characterPose') return project.theme?.character?.poses?.[binding.target];
  if (binding.kind === 'audioLayer') return project.audio?.layers?.[binding.target]?.src;
  if (binding.kind === 'audioStinger') {
    const value = project.audio?.stingers?.[binding.target];
    return binding.index !== null ? value?.[binding.index]?.src : value?.src;
  }
  if (binding.kind === 'spine') {
    const asset = project.animation?.spineAssets?.find(item => item.name === binding.target);
    return asset ? `${JSON.stringify(asset.rawJSON)}${asset.atlasText || ''}${asset.atlasImage || ''}` : null;
  }
  return null;
}

export function validateAppliedAssetPack(project) {
  if (!project.assetPack) return { applied: false, valid: true, issues: [], drift: [] };
  const issues = [];
  const drift = [];
  if (project.assetPack.format !== 'stake-studio-asset-pack-v1' || project.assetPack.version !== ASSET_PACK_VERSION) {
    issues.push('Applied asset pack provenance uses an unsupported format.');
  }
  for (const binding of project.assetPack.bindings || []) {
    const source = currentBindingSource(project, binding);
    if (!source) issues.push(`${binding.file} is no longer connected to ${binding.kind}:${binding.target}.`);
    else if (binding.kind !== 'spine' && fingerprint(`${binding.file}:${project.assetPack.sourceFiles.find(file => file.name === binding.file)?.size || 0}:${source}`) !== binding.contentFingerprint) {
      drift.push(`${binding.kind}:${binding.target} was replaced after import`);
    }
  }
  return { applied: true, valid: issues.length === 0, issues, drift };
}

export function getAssetPackCoverage(project) {
  const symbols = project.theme?.symbols || [];
  const audioKeys = ['spinStart', 'reelStop', 'winSmall', 'bonusTrigger'];
  const hasAudio = key => {
    const value = project.audio?.stingers?.[key];
    return Array.isArray(value) ? value.some(item => item?.src) : Boolean(value?.src);
  };
  return {
    symbols: { ready: symbols.filter(symbol => symbol.src).length, total: symbols.length },
    cabinet: { ready: (project.theme?.cabinet?.layers || []).filter(layer => layer.src).length, target: 2 },
    characterPoses: Object.values(project.theme?.character?.poses || {}).filter(Boolean).length,
    audio: { ready: audioKeys.filter(hasAudio).length, total: audioKeys.length },
    spine: project.animation?.spineAssets?.length || 0,
    submission: ['background', 'foreground', 'providerLogo'].filter(key => project.theme?.submission?.[key]).length,
  };
}

export function createAssetPackManifest(project) {
  const validation = validateAppliedAssetPack(project);
  return {
    format: 'stake-studio-asset-pack-manifest-v1',
    applied: project.assetPack || null,
    coverage: getAssetPackCoverage(project),
    valid: validation.valid,
    drift: validation.drift,
  };
}

export const ASSET_PACK_NAMING_GUIDE = `StakeStudio Asset Pack naming\n\nSymbols: H1.png, H2.png, M1.png, L1.png, W.png, S.png (or symbol_H1.png)\nCabinet: background.png, foreground.png, frame.png, overlay.png\nCharacter poses: character_idle.png, character_win_big.png, character_bonus_entry.png, character_wincap.png\nAudio: base_music.ogg, bonus_music.ogg, ambience.ogg, spin_start.wav, reel_stop_1.wav, win_small.wav, bonus_trigger.wav\nSpine: one matching skeleton.json + skeleton.atlas + atlas page image named exactly as declared inside the atlas\nSubmission: background/foreground also fill the Stake tile pair; provider_logo.png fills the provider tile asset.\n\nDuplicates targeting the same slot stop compilation. Unmatched files remain listed for intentional manual assignment.`;
