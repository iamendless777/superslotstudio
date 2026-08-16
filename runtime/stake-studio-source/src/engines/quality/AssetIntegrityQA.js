const ASSET_INTEGRITY_FORMAT = 'stake-studio-asset-integrity-qa-v1';

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

export function getAssetIntegrityFingerprint(project) {
  return hashText(JSON.stringify(compact({
    symbols: project.theme?.symbols,
    cabinet: project.theme?.cabinet,
    character: project.theme?.character,
    submission: project.theme?.submission,
    atlas: project.atlas,
    spineAssets: (project.animation?.spineAssets || []).map(asset => ({
      name: asset.name, atlasPages: asset.atlasPages, atlasImages: asset.atlasImages,
      atlasImageName: asset.atlasImageName, atlasImage: asset.atlasImage,
    })),
    textureBudget: Math.max(1, Number(project.production?.budgets?.maxTextureMemoryMb) || 96),
  })));
}

function item(id, name, role, src, options = {}) {
  return {
    id, name, role, src: src || '', requiredAlpha: Boolean(options.requiredAlpha),
    minWidth: Number(options.minWidth) || 64, minHeight: Number(options.minHeight) || 64,
  };
}

export function buildAssetIntegrityInventory(project) {
  const inventory = [];
  for (const symbol of project.theme?.symbols || []) {
    inventory.push(item(`symbol:${symbol.name}`, symbol.name, 'symbol', symbol.src, { requiredAlpha: true, minWidth: 128, minHeight: 128 }));
  }
  for (const layer of project.theme?.cabinet?.layers || []) {
    if (layer.type === 'reel-area') continue;
    inventory.push(item(`cabinet:${layer.id || layer.name}`, layer.name || layer.type || 'Cabinet layer', 'cabinet', layer.src, { requiredAlpha: layer.assetPackRole !== 'background', minWidth: 256, minHeight: 256 }));
  }
  for (const [pose, src] of Object.entries(project.theme?.character?.poses || {})) {
    inventory.push(item(`character:${pose}`, `Character ${pose}`, 'character', src, { requiredAlpha: true, minWidth: 256, minHeight: 256 }));
  }
  const submission = project.theme?.submission || {};
  inventory.push(item('submission:background', 'Stake background', 'submission-background', submission.background, { minWidth: 640, minHeight: 360 }));
  inventory.push(item('submission:foreground', 'Stake foreground', 'submission-foreground', submission.foreground, { requiredAlpha: true, minWidth: 640, minHeight: 360 }));
  inventory.push(item('submission:providerLogo', 'Provider logo', 'provider-logo', submission.providerLogo, { requiredAlpha: true, minWidth: 256, minHeight: 128 }));
  for (const asset of project.atlas?.assets || []) {
    const fullFramePresentation = String(asset.name || '').startsWith('presentation-');
    inventory.push(item(`atlas:${asset.name}`, asset.name, 'atlas-source', asset.src, { requiredAlpha: !fullFramePresentation, minWidth: 64, minHeight: 64 }));
  }
  for (const spine of project.animation?.spineAssets || []) {
    const images = spine.atlasImages && Object.keys(spine.atlasImages).length
      ? spine.atlasImages : spine.atlasImageName && spine.atlasImage ? { [spine.atlasImageName]: spine.atlasImage } : {};
    for (const [name, src] of Object.entries(images)) {
      inventory.push(item(`spine:${spine.name}:${name}`, `${spine.name} · ${name}`, 'spine-atlas-page', src, { requiredAlpha: true, minWidth: 128, minHeight: 128 }));
    }
  }
  return inventory;
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

function normalizeSample(sample = {}) {
  return {
    id: String(sample.id || ''),
    loaded: Boolean(sample.loaded),
    sourceFingerprint: String(sample.sourceFingerprint || ''),
    mime: String(sample.mime || ''),
    portable: sample.portable !== false,
    width: number(sample.width), height: number(sample.height),
    byteLength: number(sample.byteLength), decodedBytes: number(sample.decodedBytes),
    hasTransparency: Boolean(sample.hasTransparency),
    opaqueEdgeRatio: number(sample.opaqueEdgeRatio),
    croppedEdgeRatio: number(sample.croppedEdgeRatio),
    transparentColorRisk: number(sample.transparentColorRisk),
    error: String(sample.error || ''),
  };
}

function atlasIssues(project) {
  const issues = [];
  const atlas = project.atlas || {};
  const assets = atlas.assets || [];
  const packed = atlas.packed;
  if (assets.length && !packed) issues.push(`Texture atlas has ${assets.length} source asset${assets.length === 1 ? '' : 's'} but no current packed sheet.`);
  if (assets.length && Number(atlas.padding) < 2) issues.push(`Texture atlas padding is ${Number(atlas.padding) || 0}px; production requires at least 2px.`);
  if (!packed) return issues;
  if (!packed.dataUrl?.startsWith('data:image/png')) issues.push('Packed texture atlas is not a portable PNG data asset.');
  if (packed.width > (Number(atlas.maxSize) || 2048) || packed.height > (Number(atlas.maxSize) || 2048)) issues.push('Packed texture atlas exceeds its configured maximum size.');
  const frames = packed.frames || {};
  for (const asset of assets) {
    const frame = frames[asset.name]?.frame;
    if (!frame) {
      issues.push(`Packed texture atlas is missing frame "${asset.name}".`);
      continue;
    }
    const x = Number(frame.x) || 0;
    const y = Number(frame.y) || 0;
    const width = Number(frame.w) || 0;
    const height = Number(frame.h) || 0;
    if (width !== Number(asset.width) || height !== Number(asset.height)) issues.push(`Atlas frame "${asset.name}" does not match its decoded source dimensions.`);
    if (x < 0 || y < 0 || x + width > packed.width || y + height > packed.height) issues.push(`Atlas frame "${asset.name}" extends outside the packed sheet.`);
    const padding = Number(atlas.padding) || 0;
    if (x < padding || y < padding || x + width + padding > packed.width || y + height + padding > packed.height) issues.push(`Atlas frame "${asset.name}" lacks the declared ${padding}px edge padding.`);
  }
  return issues;
}

export function evaluateAssetIntegrity(project, samples = []) {
  const inventory = buildAssetIntegrityInventory(project);
  const normalized = samples.map(normalizeSample);
  const issues = [...atlasIssues(project)];
  const uniqueSources = new Map();
  for (const asset of inventory) {
    const sample = normalized.find(candidate => candidate.id === asset.id);
    if (!asset.src) {
      issues.push(`${asset.name} has no image source.`);
      continue;
    }
    if (!sample?.loaded) {
      issues.push(`${asset.name} could not be decoded${sample?.error ? `: ${sample.error}` : '.'}`);
      continue;
    }
    if (!sample.portable) issues.push(`${asset.name} uses a non-portable blob or external URL.`);
    if (sample.width < asset.minWidth || sample.height < asset.minHeight) issues.push(`${asset.name} is ${sample.width}×${sample.height}px; ${asset.role} requires at least ${asset.minWidth}×${asset.minHeight}px.`);
    if (sample.width > 4096 || sample.height > 4096) issues.push(`${asset.name} exceeds the 4096px per-axis production limit.`);
    if (sample.byteLength > 12 * 1024 * 1024) issues.push(`${asset.name} exceeds the 12MB encoded-file budget.`);
    if (sample.mime === 'image/gif') issues.push(`${asset.name} uses GIF; production art must use deterministic PNG, WebP, or JPEG.`);
    if (asset.requiredAlpha && sample.mime === 'image/jpeg') issues.push(`${asset.name} requires transparency but uses JPEG.`);
    if (asset.requiredAlpha && !sample.hasTransparency) issues.push(`${asset.name} requires transparent alpha but decoded as fully opaque.`);
    if (asset.requiredAlpha && sample.opaqueEdgeRatio > 0.9) issues.push(`${asset.name} has an opaque edge-to-edge matte instead of clean alpha.`);
    if (asset.requiredAlpha && sample.croppedEdgeRatio > 0.35) issues.push(`${asset.name} touches too much of the image boundary and risks visible cropping or atlas bleed.`);
    if (asset.requiredAlpha && sample.transparentColorRisk > 0.08) issues.push(`${asset.name} retains unsafe color in transparent edge pixels and may produce a halo.`);
    if (sample.sourceFingerprint && !uniqueSources.has(sample.sourceFingerprint)) uniqueSources.set(sample.sourceFingerprint, sample.decodedBytes);
  }
  const decodedBytes = [...uniqueSources.values()].reduce((sum, value) => sum + value, 0);
  const textureBudgetBytes = Math.max(1, Number(project.production?.budgets?.maxTextureMemoryMb) || 96) * 1024 * 1024;
  if (decodedBytes > textureBudgetBytes) issues.push(`Decoded source textures use ${(decodedBytes / 1024 / 1024).toFixed(1)}MB; the project budget is ${(textureBudgetBytes / 1024 / 1024).toFixed(0)}MB.`);
  const passedAssets = inventory.filter(asset => {
    const prefix = `${asset.name} `;
    return !issues.some(issue => issue.startsWith(prefix));
  }).length;
  return {
    passed: inventory.length > 0 && issues.length === 0,
    issues,
    samples: normalized,
    totalAssets: inventory.length,
    passedAssets,
    decodedBytes,
    textureBudgetBytes,
    atlasReady: !atlasIssues(project).length,
  };
}

export function recordAssetIntegrityQA(project, samples) {
  project.production ||= {};
  project.production.qa ||= {};
  const evaluation = evaluateAssetIntegrity(project, samples);
  const report = {
    format: ASSET_INTEGRITY_FORMAT,
    fingerprint: getAssetIntegrityFingerprint(project),
    runAt: new Date().toISOString(),
    passed: evaluation.passed,
    issues: evaluation.issues,
    samples: evaluation.samples,
    totalAssets: evaluation.totalAssets,
    passedAssets: evaluation.passedAssets,
    decodedBytes: evaluation.decodedBytes,
    atlasReady: evaluation.atlasReady,
  };
  project.production.qa.assetIntegrityAudit = report;
  return getAssetIntegritySummary(project);
}

export function getAssetIntegritySummary(project) {
  const fingerprint = getAssetIntegrityFingerprint(project);
  const report = project.production?.qa?.assetIntegrityAudit || null;
  const fresh = report?.format === ASSET_INTEGRITY_FORMAT && report.fingerprint === fingerprint;
  const evaluation = fresh ? evaluateAssetIntegrity(project, report.samples) : null;
  return {
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && evaluation?.passed),
    issues: evaluation?.issues || [],
    samples: evaluation?.samples || [],
    totalAssets: evaluation?.totalAssets || buildAssetIntegrityInventory(project).length,
    passedAssets: evaluation?.passedAssets || 0,
    decodedBytes: evaluation?.decodedBytes || 0,
    atlasReady: Boolean(evaluation?.atlasReady),
    runAt: fresh ? report.runAt || null : null,
  };
}
