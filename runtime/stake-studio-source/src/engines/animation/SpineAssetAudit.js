const RENDERED_ATTACHMENT_TYPES = new Set(['region', 'mesh', 'linkedmesh']);

function skinAttachments(rawJSON = {}) {
  const output = [];
  const collect = (skin, slots = {}) => {
    for (const [slot, attachments] of Object.entries(slots || {})) {
      for (const [name, data] of Object.entries(attachments || {})) {
        output.push({ skin, slot, name, data: data || {} });
      }
    }
  };
  if (Array.isArray(rawJSON.skins)) {
    for (const skin of rawJSON.skins) collect(skin.name || 'default', skin.attachments || {});
  } else {
    for (const [name, slots] of Object.entries(rawJSON.skins || {})) collect(name, slots);
  }
  return output;
}

function timelineMetrics(animations = {}) {
  let timelines = 0;
  let keys = 0;
  let deformTimelines = 0;
  let eventKeys = 0;
  let maxDuration = 0;
  const visit = (value, path = []) => {
    if (Array.isArray(value)) {
      if (value.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
        timelines++;
        keys += value.length;
        if (path.includes('deform')) deformTimelines++;
        if (path.at(-1) === 'events') eventKeys += value.length;
        for (const key of value) maxDuration = Math.max(maxDuration, Number(key.time) || 0);
      } else {
        for (const item of value) visit(item, path);
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
  };
  visit(animations);
  return { timelines, keys, deformTimelines, eventKeys, maxDuration };
}

function weightedMeshMetrics(data = {}) {
  const uvs = Array.isArray(data.uvs) ? data.uvs : [];
  const vertices = Array.isArray(data.vertices) ? data.vertices : [];
  const vertexCount = Math.floor(uvs.length / 2);
  if (!vertexCount || vertices.length === uvs.length) return { vertexCount, weighted: false, maxInfluences: 0, influenceCount: 0 };
  let cursor = 0;
  let maxInfluences = 0;
  let influenceCount = 0;
  for (let vertex = 0; vertex < vertexCount && cursor < vertices.length; vertex++) {
    const count = Math.max(0, Number(vertices[cursor++]) || 0);
    maxInfluences = Math.max(maxInfluences, count);
    influenceCount += count;
    cursor += count * 4;
  }
  return { vertexCount, weighted: true, maxInfluences, influenceCount };
}

function polygonShape(data = {}) {
  const count = Number(data.vertexCount) || Math.floor((data.vertices?.length || 0) / 2);
  const vertices = Array.isArray(data.vertices) ? data.vertices : [];
  if (vertices.length !== count * 2 || count < 3) return { vertices: count, convex: null };
  let direction = 0;
  let convex = true;
  for (let index = 0; index < count; index++) {
    const a = { x: vertices[index * 2], y: vertices[index * 2 + 1] };
    const bIndex = (index + 1) % count;
    const cIndex = (index + 2) % count;
    const b = { x: vertices[bIndex * 2], y: vertices[bIndex * 2 + 1] };
    const c = { x: vertices[cIndex * 2], y: vertices[cIndex * 2 + 1] };
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (!cross) continue;
    const sign = Math.sign(cross);
    if (direction && sign !== direction) convex = false;
    direction ||= sign;
  }
  return { vertices: count, convex };
}

function issue(id, severity, message, remedy) {
  return { id, severity, category: 'animation', message, remedy };
}

export function auditSpineAsset(asset = {}) {
  const raw = asset.rawJSON || {};
  const attachments = skinAttachments(raw);
  const atlasRegions = new Set(asset.regions || []);
  const meshes = [];
  const clips = [];
  let sequences = 0;
  let linkedMeshes = 0;
  const missingRegions = [];

  for (const attachment of attachments) {
    const type = attachment.data.type || 'region';
    const path = attachment.data.path || attachment.name;
    if (type === 'mesh' || type === 'linkedmesh') {
      const metrics = weightedMeshMetrics(attachment.data);
      meshes.push({ ...attachment, ...metrics });
      if (type === 'linkedmesh' || attachment.data.parent) linkedMeshes++;
    }
    if (type === 'clipping') clips.push({ ...attachment, ...polygonShape(attachment.data) });
    if (attachment.data.sequence) sequences++;
    if (atlasRegions.size && RENDERED_ATTACHMENT_TYPES.has(type)) {
      const found = attachment.data.sequence
        ? [...atlasRegions].some(region => region === path || region.startsWith(`${path}`))
        : atlasRegions.has(path);
      if (!found) missingRegions.push(`${attachment.slot}/${path}`);
    }
  }

  const animation = timelineMetrics(raw.animations || {});
  const constraints = {
    ik: raw.ik?.length || 0,
    transform: raw.transform?.length || 0,
    path: raw.path?.length || 0,
    physics: raw.physics?.length || 0,
  };
  const meshVertices = meshes.reduce((sum, mesh) => sum + mesh.vertexCount, 0);
  const maxInfluences = meshes.reduce((maximum, mesh) => Math.max(maximum, mesh.maxInfluences), 0);
  const clippingVertices = clips.reduce((sum, clip) => sum + clip.vertices, 0);
  const issues = [];
  if (asset.skeletonFormat === 'binary' || asset.rawBinary) issues.push(issue(
    'binary-deep-audit-pending', 'error',
    'Binary .skel playback metadata was parsed, but deep mesh, clipping, constraint, and event-key certification is not implemented yet.',
    'Keep the matching JSON export for certification, or wait for the binary deep-audit adapter before release approval.',
  ));
  if (missingRegions.length) issues.push(issue(
    'missing-atlas-regions', 'error',
    `${missingRegions.length} rendered attachment${missingRegions.length === 1 ? '' : 's'} cannot be found in the atlas: ${missingRegions.slice(0, 4).join(', ')}${missingRegions.length > 4 ? '…' : ''}`,
    'Repack and export the skeleton JSON and atlas together so attachment paths match atlas region names.',
  ));
  if (maxInfluences > 4) issues.push(issue(
    'dense-weights', 'warning', `A mesh uses ${maxInfluences} bone influences on one vertex.`,
    'Use Spine Weights → Prune to keep only influences that make a visible difference.',
  ));
  if (meshVertices > 1800) issues.push(issue(
    'dense-meshes', 'warning', `${meshVertices} mesh vertices will be transformed at runtime.`,
    'Remove vertices that do not materially change the silhouette or deformation.',
  ));
  if (clips.some(clip => clip.convex === false) || clippingVertices > 12) issues.push(issue(
    'expensive-clipping', 'warning', `${clips.length} clipping attachment${clips.length === 1 ? '' : 's'} use ${clippingVertices} vertices${clips.some(clip => clip.convex === false) ? ', including a concave polygon' : ''}.`,
    'Prefer a convex three-vertex clip, the shortest possible draw-order span, or an opaque masking layer.',
  ));
  if (animation.deformTimelines > 12) issues.push(issue(
    'deform-heavy', 'warning', `${animation.deformTimelines} deform timelines reduce reuse and add per-frame work.`,
    'Prefer bone-weighted mesh deformation for recurring movement and reserve deform keys for art-directed exceptions.',
  ));
  return {
    format: 'stake-studio-spine-audit-v1',
    valid: !issues.some(item => item.severity === 'error'),
    issues,
    metrics: {
      bones: raw.bones?.length || 0,
      slots: raw.slots?.length || 0,
      skins: Array.isArray(raw.skins) ? raw.skins.length : Object.keys(raw.skins || {}).length,
      attachments: attachments.length,
      meshes: meshes.length,
      weightedMeshes: meshes.filter(mesh => mesh.weighted).length,
      meshVertices,
      maxInfluences,
      clippingAttachments: clips.length,
      clippingVertices,
      linkedMeshes,
      sequences,
      timelines: animation.timelines,
      keys: animation.keys,
      deformTimelines: animation.deformTimelines,
      eventKeys: animation.eventKeys,
      duration: animation.maxDuration,
      constraints,
      missingRegions,
    },
    features: [
      meshes.length ? `${meshes.length} mesh${meshes.length === 1 ? '' : 'es'}` : null,
      meshes.some(mesh => mesh.weighted) ? `${meshes.filter(mesh => mesh.weighted).length} weighted` : null,
      linkedMeshes ? `${linkedMeshes} linked` : null,
      constraints.ik ? `${constraints.ik} IK` : null,
      constraints.transform ? `${constraints.transform} transform constraint${constraints.transform === 1 ? '' : 's'}` : null,
      constraints.path ? `${constraints.path} path constraint${constraints.path === 1 ? '' : 's'}` : null,
      constraints.physics ? `${constraints.physics} physics constraint${constraints.physics === 1 ? '' : 's'}` : null,
      clips.length ? `${clips.length} clip${clips.length === 1 ? '' : 's'}` : null,
      sequences ? `${sequences} sequence${sequences === 1 ? '' : 's'}` : null,
      animation.eventKeys ? `${animation.eventKeys} event key${animation.eventKeys === 1 ? '' : 's'}` : null,
    ].filter(Boolean),
  };
}
