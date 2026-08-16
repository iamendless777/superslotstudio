import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';

export const PROJECT_SIDECAR_FORMAT = 'stake-studio-project-sidecar-v1';
export const PROJECT_SIDECAR_ROOT = '.stake-studio/project-sidecars';
export const DEFAULT_EVIDENCE_SIDECAR_BYTES = 256 * 1024;
export const DEFAULT_DATA_URL_SIDECAR_BYTES = 1024;

const EVIDENCE_PATH_PATTERN = /(^|[^a-z])(qa|evidence|audit|capture|review|measurement|diagnostic)([^a-z]|$)/i;
const MIME_EXTENSIONS = new Map([
  ['image/png', '.png'], ['image/jpeg', '.jpg'], ['image/webp', '.webp'],
  ['image/gif', '.gif'], ['image/avif', '.avif'], ['image/svg+xml', '.svg'],
  ['audio/mpeg', '.mp3'], ['audio/wav', '.wav'], ['audio/ogg', '.ogg'],
  ['audio/webm', '.webm'], ['application/octet-stream', '.bin'],
]);

const sha256 = value => createHash('sha256').update(value).digest('hex');

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, value, { flag: 'wx' });
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function writeContentAddressed(path, value) {
  if (existsSync(path)) return false;
  atomicWrite(path, value);
  return true;
}

function parseDataUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('data:')) return null;
  const comma = value.indexOf(',');
  if (comma < 6) return null;
  const header = value.slice(5, comma);
  const parts = header.split(';');
  const mediaType = String(parts.shift() || 'text/plain').toLowerCase();
  if (!parts.some(part => part.toLowerCase() === 'base64')) return null;
  const encoded = value.slice(comma + 1);
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, 'base64');
  return bytes.length ? { bytes, dataUrlHeader: header, mediaType } : null;
}

function extensionFor(mediaType) {
  const known = MIME_EXTENSIONS.get(mediaType);
  if (known) return known;
  const subtype = String(mediaType || '').split('/')[1]?.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  return subtype ? `.${subtype.slice(0, 12)}` : '.bin';
}

function isSidecarReference(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && value.$stakeStudioSidecar?.format === PROJECT_SIDECAR_FORMAT);
}

function sidecarReference({ kind, path, digest, bytes, ...metadata }) {
  return { $stakeStudioSidecar: { format: PROJECT_SIDECAR_FORMAT, kind, path, sha256: digest, bytes, ...metadata } };
}

const projectRootFor = projectPath => dirname(resolve(projectPath));

function resolveSidecar(projectRoot, relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/');
  if (!normalized.startsWith(`${PROJECT_SIDECAR_ROOT}/`) || normalized.includes('../')) {
    throw new Error(`Invalid StakeStudio project sidecar path "${relativePath}".`);
  }
  const root = resolve(projectRoot);
  const path = resolve(root, normalized);
  if (!path.startsWith(`${root}${sep}`)) throw new Error(`StakeStudio project sidecar escapes project root: "${relativePath}".`);
  return path;
}

function jsonEqual(left, right) {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasEvidenceContext(path) {
  return path.some(segment => EVIDENCE_PATH_PATTERN.test(String(segment).replace(/([a-z])([A-Z])/g, '$1-$2')));
}

function hydrateValue(value, projectRoot, stats) {
  if (isSidecarReference(value)) {
    const reference = value.$stakeStudioSidecar;
    const path = resolveSidecar(projectRoot, reference.path);
    if (!existsSync(path)) throw new Error(`Missing StakeStudio project sidecar "${reference.path}".`);
    const contents = readFileSync(path);
    if (sha256(contents) !== reference.sha256) throw new Error(`StakeStudio project sidecar hash mismatch for "${reference.path}".`);
    stats.references += 1;
    stats.hydratedBytes += contents.length;
    if (reference.kind === 'data-url') return `data:${reference.dataUrlHeader},${contents.toString('base64')}`;
    if (reference.kind === 'json') return hydrateValue(JSON.parse(contents.toString('utf8')), projectRoot, stats);
    throw new Error(`Unsupported StakeStudio project sidecar kind "${reference.kind}".`);
  }
  if (Array.isArray(value)) return value.map(item => hydrateValue(item, projectRoot, stats));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, hydrateValue(item, projectRoot, stats)]));
  }
  return value;
}

function persistValue(value, previous, context, path = []) {
  if (typeof value === 'string') {
    const parsed = parseDataUrl(value);
    if (!parsed || parsed.bytes.length < context.dataUrlThreshold) return value;
    if (previous === value) {
      context.stats.preservedEmbeddedValues += 1;
      context.stats.preservedEmbeddedBytes += Buffer.byteLength(value);
      return value;
    }
    const digest = sha256(parsed.bytes);
    const relativePath = `${PROJECT_SIDECAR_ROOT}/blobs/${digest}${extensionFor(parsed.mediaType)}`;
    const written = writeContentAddressed(resolveSidecar(context.projectRoot, relativePath), parsed.bytes);
    context.stats.dataUrlReferences += 1;
    context.stats.externalizedBytes += Buffer.byteLength(value);
    context.stats.sidecarBytesWritten += written ? parsed.bytes.length : 0;
    return sidecarReference({
      kind: 'data-url', path: relativePath, digest, bytes: parsed.bytes.length,
      mediaType: parsed.mediaType, dataUrlHeader: parsed.dataUrlHeader,
    });
  }
  if (!value || typeof value !== 'object') return value;
  if (isSidecarReference(value)) return value;

  const previousContainer = previous && typeof previous === 'object' ? previous : undefined;
  const transformed = Array.isArray(value)
    ? value.map((item, index) => persistValue(item, previousContainer?.[index], context, [...path, String(index)]))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, persistValue(item, previousContainer?.[key], context, [...path, key]),
    ]));

  if (!hasEvidenceContext(path)) return transformed;
  const encoded = Buffer.from(JSON.stringify(transformed));
  if (encoded.length < context.evidenceThreshold) return transformed;
  if (!isSidecarReference(previous) && jsonEqual(value, previous)) {
    context.stats.preservedEmbeddedValues += 1;
    context.stats.preservedEmbeddedBytes += encoded.length;
    return transformed;
  }
  const digest = sha256(encoded);
  const relativePath = `${PROJECT_SIDECAR_ROOT}/evidence/${digest}.json`;
  const written = writeContentAddressed(resolveSidecar(context.projectRoot, relativePath), encoded);
  context.stats.evidenceReferences += 1;
  context.stats.externalizedBytes += encoded.length;
  context.stats.sidecarBytesWritten += written ? encoded.length : 0;
  return sidecarReference({ kind: 'json', path: relativePath, digest, bytes: encoded.length });
}

export function readProjectDocument(path, fallback = null) {
  if (!existsSync(path)) {
    if (fallback !== null) return { project: fallback, raw: fallback, stats: { references: 0, hydratedBytes: 0 } };
    throw new Error(`No StakeStudio project document at "${path}".`);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (fallback !== null) return { project: fallback, raw: fallback, stats: { references: 0, hydratedBytes: 0 } };
    throw error;
  }
  const stats = { references: 0, hydratedBytes: 0 };
  return { project: hydrateValue(raw, projectRootFor(path), stats), raw, stats };
}

export function persistProjectDocument(path, project, options = {}) {
  const previousRaw = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
  const stats = {
    dataUrlReferences: 0, evidenceReferences: 0, externalizedBytes: 0, sidecarBytesWritten: 0,
    preservedEmbeddedValues: 0, preservedEmbeddedBytes: 0,
  };
  const storedProject = persistValue(project, previousRaw, {
    projectRoot: projectRootFor(path),
    dataUrlThreshold: options.dataUrlThreshold ?? DEFAULT_DATA_URL_SIDECAR_BYTES,
    evidenceThreshold: options.evidenceThreshold ?? DEFAULT_EVIDENCE_SIDECAR_BYTES,
    stats,
  });
  const serialized = `${JSON.stringify(storedProject, null, 2)}\n`;
  atomicWrite(path, serialized);
  return { project: storedProject, bytes: Buffer.byteLength(serialized), stats };
}

export const isProjectSidecarReference = isSidecarReference;
