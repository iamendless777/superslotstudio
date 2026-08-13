export const SPINE_BINARY_MIME = 'application/octet-stream';
export const MAX_SPINE_BINARY_BYTES = 40 * 1024 * 1024;

const base64Body = value => {
  const match = String(value || '').match(/^data:application\/octet-stream;base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error('Binary Spine data must be an embedded application/octet-stream base64 data URL.');
  return match[1].replace(/\s/g, '');
};

export function spineSkeletonFormat(asset = {}) {
  const hasJson = Boolean(asset.rawJSON);
  const hasBinary = Boolean(asset.rawBinary);
  if (hasJson && hasBinary) throw new Error('Spine assets cannot contain both JSON and binary skeleton payloads.');
  if (asset.skeletonFormat && !['json', 'binary'].includes(asset.skeletonFormat)) throw new Error(`Unknown Spine skeleton format “${asset.skeletonFormat}”.`);
  if (asset.skeletonFormat === 'json' && hasBinary) throw new Error('A JSON Spine asset cannot contain a binary skeleton payload.');
  if (asset.skeletonFormat === 'binary' && hasJson) throw new Error('A binary Spine asset cannot contain a JSON skeleton payload.');
  if (hasBinary || asset.skeletonFormat === 'binary') return 'binary';
  if (hasJson || asset.skeletonFormat === 'json') return 'json';
  return null;
}

export function binaryDataUrlToBytes(value) {
  const body = base64Body(value);
  const estimated = Math.floor(body.length * 3 / 4) - (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0);
  if (estimated > MAX_SPINE_BINARY_BYTES) throw new Error(`Binary Spine skeleton exceeds the ${MAX_SPINE_BINARY_BYTES / 1024 / 1024}MB embedded limit.`);
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(body);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }
  return new Uint8Array(Buffer.from(body, 'base64'));
}

export function bytesToBinaryDataUrl(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  if (!bytes.length) throw new Error('Binary Spine skeleton is empty.');
  if (bytes.length > MAX_SPINE_BINARY_BYTES) throw new Error(`Binary Spine skeleton exceeds the ${MAX_SPINE_BINARY_BYTES / 1024 / 1024}MB embedded limit.`);
  if (typeof Buffer !== 'undefined') return `data:${SPINE_BINARY_MIME};base64,${Buffer.from(bytes).toString('base64')}`;
  const chunkSize = 24_576;
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    let binary = '';
    for (const byte of chunk) binary += String.fromCharCode(byte);
    encoded += globalThis.btoa(binary);
  }
  return `data:${SPINE_BINARY_MIME};base64,${encoded}`;
}

export function validateSpineSkeletonPayload(asset = {}) {
  const issues = [];
  let format = null;
  try { format = spineSkeletonFormat(asset); } catch (error) { issues.push(error.message); }
  if (!format) issues.push('Spine skeleton payload is missing.');
  if (format === 'json' && (!asset.rawJSON?.skeleton || !Array.isArray(asset.rawJSON?.bones))) issues.push('Spine JSON payload is not a valid skeleton export.');
  if (format === 'binary') {
    try { binaryDataUrlToBytes(asset.rawBinary); } catch (error) { issues.push(error.message); }
    if (!String(asset.skeletonFileName || '').toLowerCase().endsWith('.skel')) issues.push('Binary Spine assets must retain their .skel filename.');
  }
  return issues;
}

export function spineMetadataFromSkeletonData(data, { name, fileName, format } = {}) {
  const attachments = [];
  for (const skin of data.skins || []) {
    for (const [slotIndex, slotAttachments] of (skin.attachments || []).entries()) {
      for (const attachmentName of Object.keys(slotAttachments || {})) {
        attachments.push({ skin: skin.name || 'default', slot: data.slots?.[slotIndex]?.name || String(slotIndex), name: attachmentName });
      }
    }
  }
  return {
    name: String(name || fileName || 'spine').replace(/\.(json|skel)$/i, ''),
    skeletonFormat: format,
    skeletonFileName: fileName || `skeleton.${format === 'binary' ? 'skel' : 'json'}`,
    version: data.version || null,
    width: Number(data.width) || null,
    height: Number(data.height) || null,
    bones: (data.bones || []).map(bone => bone.name),
    slots: (data.slots || []).map(slot => slot.name),
    skins: (data.skins || []).map(skin => skin.name || 'default'),
    attachments,
    animations: (data.animations || []).map(animation => ({
      name: animation.name,
      duration: Number(animation.duration) || null,
      trackCount: animation.timelines?.length || 0,
    })),
  };
}
