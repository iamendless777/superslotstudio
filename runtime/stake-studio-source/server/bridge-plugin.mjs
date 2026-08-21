import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createMathPublisher } from './math-publisher.mjs';
import { resolveMathSdkRoot, resolveStudioHome } from './studio-paths.mjs';
import { compileFrontendProject } from './frontend-compiler.mjs';
import { createVisualAssetFactory } from './visual-asset-factory.mjs';
import { analyzeVisualAsset } from './visual-quality.mjs';
import { normalizeStudioProfile } from '../src/engines/factory/StudioProfile.js';
import {
  claimAgentJob,
  completeAgentJob,
  createAgentJob,
  failAgentJob,
  ensureProductionWorkflow,
  getFlagshipWorkflowSummary,
  heartbeatAgentJob,
  listAgentJobs,
  recoverStaleAgentJobLeases,
  setProductionTrack,
  updateAgentJob,
} from '../src/engines/factory/FlagshipWorkflow.js';
import {
  createVisualExcellenceJobPlan,
  getVisualExcellenceSummary,
  recordHumanVisualSignoff,
  recordVisualDirectorReview,
  recordVisualExcellenceDelivery,
  upsertVisualSequenceBrief,
} from '../src/engines/factory/VisualExcellenceDepartment.js';
import {
  appendCommandResult,
  compactCommandResultLedger,
  consumeCommandResult,
} from './command-ledger.mjs';
import { persistProjectDocument, readProjectDocument } from './project-storage.mjs';

const MAX_BODY_BYTES = 80 * 1024 * 1024;
const SPEECH_MAX_CHARACTERS = 800;
const SPEECH_VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);

function safeId(value) {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) throw new Error('A project id is required.');
  return id;
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, value);
  renameSync(temp, path);
}

function safeCaptureSegment(value, label) {
  const segment = String(value || '').trim();
  if (!segment || segment.length > 120 || !/^[a-zA-Z0-9._-]+$/.test(segment)
    || segment === '.' || segment === '..' || segment.includes('..')) {
    throw new Error(`${label} must contain only safe letters, numbers, dots, underscores, or hyphens.`);
  }
  return segment;
}

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function pngCrc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function parsePng(image) {
  const signature = '89504e470d0a1a0a';
  if (!Buffer.isBuffer(image) || image.length < 24 || image.subarray(0, 8).toString('hex') !== signature
    || image.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error('QA capture is not a valid PNG with an IHDR header.');
  let offset = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  let ended = false;
  const compressed = [];
  while (offset + 12 <= image.length) {
    const length = image.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > image.length) throw new Error('QA capture PNG contains a truncated chunk.');
    const typeBuffer = image.subarray(offset + 4, offset + 8);
    const type = typeBuffer.toString('ascii');
    const data = image.subarray(offset + 8, offset + 8 + length);
    const declaredCrc = image.readUInt32BE(offset + 8 + length);
    if (pngCrc32(Buffer.concat([typeBuffer, data])) !== declaredCrc) throw new Error(`QA capture PNG ${type} chunk CRC is invalid.`);
    if (type === 'IHDR') {
      if (header || length !== 13) throw new Error('QA capture PNG IHDR structure is invalid.');
      header = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9],
        compression: data[10], filter: data[11], interlace: data[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') transparency = Buffer.from(data);
    else if (type === 'IDAT') compressed.push(Buffer.from(data));
    else if (type === 'IEND') { ended = true; offset = end; break; }
    offset = end;
  }
  if (!header || !ended || compressed.length === 0 || offset !== image.length) throw new Error('QA capture PNG is missing a complete image stream.');
  const { width, height, bitDepth, colorType, compression, filter, interlace } = header;
  if (!(width > 0 && height > 0 && width <= 16384 && height <= 16384)) throw new Error('QA capture PNG dimensions are invalid.');
  if (width * height > 20_000_000) throw new Error('QA capture PNG exceeds the decoded-pixel safety limit.');
  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];
  if (bitDepth !== 8 || !channels || compression !== 0 || filter !== 0 || interlace !== 0) {
    throw new Error('QA capture PNG must be a non-interlaced 8-bit browser-compatible image.');
  }
  if (colorType === 3 && (!palette || palette.length === 0 || palette.length % 3 !== 0)) {
    throw new Error('QA capture indexed PNG is missing a valid palette.');
  }
  const stride = width * channels;
  const expectedInflatedBytes = (stride + 1) * height;
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedInflatedBytes });
  } catch {
    throw new Error('QA capture PNG image stream cannot be decoded within its declared dimensions.');
  }
  if (inflated.length !== expectedInflatedBytes) throw new Error('QA capture PNG decoded byte length is invalid.');
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const sourceOffset = y * (stride + 1);
    const targetOffset = y * stride;
    const filterType = inflated[sourceOffset];
    if (filterType > 4) throw new Error(`QA capture PNG uses unsupported scanline filter ${filterType}.`);
    for (let x = 0; x < stride; x++) {
      const raw = inflated[sourceOffset + 1 + x];
      const left = x >= channels ? pixels[targetOffset + x - channels] : 0;
      const up = y > 0 ? pixels[targetOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[targetOffset - stride + x - channels] : 0;
      let reconstructed = raw;
      if (filterType === 1) reconstructed += left;
      else if (filterType === 2) reconstructed += up;
      else if (filterType === 3) reconstructed += Math.floor((left + up) / 2);
      else if (filterType === 4) reconstructed += paeth(left, up, upperLeft);
      pixels[targetOffset + x] = reconstructed & 0xff;
    }
  }
  return { width, height, colorType, channels, pixels, palette, transparency };
}

function pngPixel(decoded, x, y) {
  const offset = (y * decoded.width + x) * decoded.channels;
  const source = decoded.pixels;
  if (decoded.colorType === 0) {
    const gray = source[offset];
    const transparent = decoded.transparency?.length >= 2 && decoded.transparency.readUInt16BE(0) === gray;
    return [gray, gray, gray, transparent ? 0 : 255];
  }
  if (decoded.colorType === 2) {
    const red = source[offset]; const green = source[offset + 1]; const blue = source[offset + 2];
    const transparent = decoded.transparency?.length >= 6
      && decoded.transparency.readUInt16BE(0) === red
      && decoded.transparency.readUInt16BE(2) === green
      && decoded.transparency.readUInt16BE(4) === blue;
    return [red, green, blue, transparent ? 0 : 255];
  }
  if (decoded.colorType === 3) {
    const index = source[offset];
    const paletteOffset = index * 3;
    if (paletteOffset + 2 >= decoded.palette.length) throw new Error('QA capture indexed PNG references a missing palette color.');
    return [decoded.palette[paletteOffset], decoded.palette[paletteOffset + 1], decoded.palette[paletteOffset + 2], decoded.transparency?.[index] ?? 255];
  }
  if (decoded.colorType === 4) return [source[offset], source[offset], source[offset], source[offset + 1]];
  return [source[offset], source[offset + 1], source[offset + 2], source[offset + 3]];
}

function pixelLuminance([red, green, blue, alpha]) {
  const opacity = alpha / 255;
  return ((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255) * opacity;
}

export function analyzePngVisualMetrics(image) {
  const decoded = parsePng(image);
  const gridWidth = Math.min(64, decoded.width);
  const gridHeight = Math.min(64, decoded.height);
  const samples = [];
  const colorCounts = new Map();
  const luminanceBins = new Uint32Array(64);
  let alphaSamples = 0;
  let lumaTotal = 0;
  let lumaSquaredTotal = 0;
  let lumaMin = 1;
  let lumaMax = 0;
  for (let gridY = 0; gridY < gridHeight; gridY++) {
    const y = Math.min(decoded.height - 1, Math.floor((gridY + 0.5) * decoded.height / gridHeight));
    const row = [];
    for (let gridX = 0; gridX < gridWidth; gridX++) {
      const x = Math.min(decoded.width - 1, Math.floor((gridX + 0.5) * decoded.width / gridWidth));
      const pixel = pngPixel(decoded, x, y);
      const luma = pixelLuminance(pixel);
      row.push(luma);
      if (pixel[3] > 8) alphaSamples++;
      lumaTotal += luma;
      lumaSquaredTotal += luma * luma;
      lumaMin = Math.min(lumaMin, luma);
      lumaMax = Math.max(lumaMax, luma);
      luminanceBins[Math.min(63, Math.floor(luma * 64))]++;
      const bucket = `${pixel[0] >> 4}:${pixel[1] >> 4}:${pixel[2] >> 4}:${pixel[3] >> 6}`;
      colorCounts.set(bucket, (colorCounts.get(bucket) || 0) + 1);
    }
    samples.push(row);
  }
  const sampleCount = gridWidth * gridHeight;
  const lumaMean = lumaTotal / sampleCount;
  const luminanceStdDev = Math.sqrt(Math.max(0, lumaSquaredTotal / sampleCount - lumaMean * lumaMean));
  let entropyBits = 0;
  for (const count of luminanceBins) if (count) {
    const probability = count / sampleCount;
    entropyBits -= probability * Math.log2(probability);
  }
  let dominantColorCount = 0;
  for (const count of colorCounts.values()) dominantColorCount = Math.max(dominantColorCount, count);
  let edges = 0;
  let comparisons = 0;
  for (let y = 0; y < gridHeight; y++) for (let x = 0; x < gridWidth; x++) {
    if (x > 0) { comparisons++; if (Math.abs(samples[y][x] - samples[y][x - 1]) >= 0.08) edges++; }
    if (y > 0) { comparisons++; if (Math.abs(samples[y][x] - samples[y - 1][x]) >= 0.08) edges++; }
  }
  let perceptualBits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const sampleY = Math.min(decoded.height - 1, Math.floor((y + 0.5) * decoded.height / 8));
    const leftX = Math.min(decoded.width - 1, Math.floor((x + 0.5) * decoded.width / 9));
    const rightX = Math.min(decoded.width - 1, Math.floor((x + 1.5) * decoded.width / 9));
    perceptualBits += pixelLuminance(pngPixel(decoded, leftX, sampleY)) > pixelLuminance(pngPixel(decoded, rightX, sampleY)) ? '1' : '0';
  }
  let perceptualHash = '';
  for (let offset = 0; offset < perceptualBits.length; offset += 4) {
    perceptualHash += Number.parseInt(perceptualBits.slice(offset, offset + 4), 2).toString(16);
  }
  const detailLumaBytes = Buffer.from(samples.flat().map(value => Math.max(0, Math.min(255, Math.round(value * 255)))));
  const rounded = value => Number(value.toFixed(6));
  return {
    width: decoded.width,
    height: decoded.height,
    visualMetrics: {
      format: 'stake-studio-png-visual-metrics-v1',
      authority: 'server-decoded-png',
      sampleCount,
      alphaCoverage: rounded(alphaSamples / sampleCount),
      luminanceRange: rounded(lumaMax - lumaMin),
      luminanceStdDev: rounded(luminanceStdDev),
      entropyBits: rounded(entropyBits),
      colorBucketCount: colorCounts.size,
      nonUniformPixelRatio: rounded(1 - dominantColorCount / sampleCount),
      edgeDensity: rounded(comparisons ? edges / comparisons : 0),
      perceptualHash,
      detailGridWidth: gridWidth,
      detailGridHeight: gridHeight,
      detailLumaGridHex: detailLumaBytes.toString('hex'),
      detailHash: createHash('sha256').update(detailLumaBytes).digest('hex'),
    },
  };
}

const RENDERED_CELL_RECOGNITION_FORMAT = 'stake-studio-rendered-cell-recognition-v1';
const RENDERED_CELL_RECOGNITION_REQUEST_FORMAT = 'stake-studio-rendered-cell-recognition-request-v1';
const renderedSymbolReferenceCache = new Map();

function roundedMetric(value) {
  return Number(Number(value || 0).toFixed(6));
}

function safeSymbolName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 80 || !/^[A-Za-z0-9_:-]+$/.test(name)) {
    throw new Error('Rendered-cell recognition symbol names must be safe identifiers.');
  }
  return name;
}

function loadProjectSymbolPng(projectRoot, symbol) {
  const source = String(symbol?.src || '').trim();
  let image;
  if (/^data:image\/png;base64,/i.test(source)) {
    image = Buffer.from(source.replace(/^data:image\/png;base64,/i, ''), 'base64');
  } else {
    if (!source || /^(?:data:|https?:|blob:)/i.test(source)) {
      throw new Error(`Symbol ${safeSymbolName(symbol?.name || symbol?.id)} needs a project-local PNG recognition reference.`);
    }
    const clean = source.replace(/^\/+/, '');
    const path = resolve(projectRoot, clean);
    const root = resolve(projectRoot);
    if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error('Symbol recognition reference escapes the project root.');
    if (!existsSync(path)) throw new Error(`Symbol recognition reference ${clean} does not exist.`);
    image = readFileSync(path);
  }
  const sha256 = createHash('sha256').update(image).digest('hex');
  return { sha256, decoded: parsePng(image) };
}

function getProjectSymbolReferences(projectRoot, project) {
  const symbols = Array.isArray(project?.theme?.symbols) ? project.theme.symbols : [];
  if (symbols.length < 2 || symbols.length > 256) {
    throw new Error('Rendered-cell recognition requires 2–256 project symbol references.');
  }
  const sourceSignature = createHash('sha256');
  for (const symbol of symbols) {
    sourceSignature.update(safeSymbolName(symbol?.name || symbol?.id));
    sourceSignature.update('\0');
    sourceSignature.update(String(symbol?.src || ''));
    sourceSignature.update('\0');
  }
  const cacheKey = `${projectRoot}:${sourceSignature.digest('hex')}`;
  if (renderedSymbolReferenceCache.has(cacheKey)) return renderedSymbolReferenceCache.get(cacheKey);
  const references = symbols.map(symbol => {
    const name = safeSymbolName(symbol?.name || symbol?.id);
    const loaded = loadProjectSymbolPng(projectRoot, symbol);
    return { name, sha256: loaded.sha256, decoded: loaded.decoded };
  });
  const names = new Set(references.map(reference => reference.name));
  if (names.size !== references.length) throw new Error('Rendered-cell recognition symbol names must be unique.');
  const result = {
    references,
    referenceSetHash: createHash('sha256').update(references
      .map(reference => `${reference.name}:${reference.sha256}`).sort().join('|')).digest('hex'),
  };
  renderedSymbolReferenceCache.set(cacheKey, result);
  if (renderedSymbolReferenceCache.size > 12) {
    const oldest = renderedSymbolReferenceCache.keys().next().value;
    renderedSymbolReferenceCache.delete(oldest);
  }
  return result;
}

function sampleNearest(decoded, x, y) {
  const px = Math.max(0, Math.min(decoded.width - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(decoded.height - 1, Math.floor(y)));
  return pngPixel(decoded, px, py);
}

function sampleBilinear(decoded, x, y) {
  const centeredX = Math.max(0, Math.min(decoded.width - 1, x - 0.5));
  const centeredY = Math.max(0, Math.min(decoded.height - 1, y - 0.5));
  const left = Math.floor(centeredX);
  const top = Math.floor(centeredY);
  const right = Math.min(decoded.width - 1, left + 1);
  const bottom = Math.min(decoded.height - 1, top + 1);
  const tx = centeredX - left;
  const ty = centeredY - top;
  const topLeft = pngPixel(decoded, left, top);
  const topRight = pngPixel(decoded, right, top);
  const bottomLeft = pngPixel(decoded, left, bottom);
  const bottomRight = pngPixel(decoded, right, bottom);
  return topLeft.map((value, channel) => (
    value * (1 - tx) * (1 - ty)
    + topRight[channel] * tx * (1 - ty)
    + bottomLeft[channel] * (1 - tx) * ty
    + bottomRight[channel] * tx * ty
  ));
}

function sampleActualCell(decoded, rect, gridSize) {
  const samples = [];
  for (let y = 0; y < gridSize; y++) for (let x = 0; x < gridSize; x++) {
    samples.push(sampleNearest(decoded,
      rect.left + (x + 0.5) * rect.width / gridSize,
      rect.top + (y + 0.5) * rect.height / gridSize));
  }
  return samples;
}

function averageBorder(samples, gridSize) {
  const total = [0, 0, 0];
  let count = 0;
  for (let y = 0; y < gridSize; y++) for (let x = 0; x < gridSize; x++) {
    if (x > 1 && y > 1 && x < gridSize - 2 && y < gridSize - 2) continue;
    const pixel = samples[y * gridSize + x];
    for (let channel = 0; channel < 3; channel++) total[channel] += pixel[channel];
    count++;
  }
  return total.map(value => value / Math.max(1, count));
}

function sampleBilinearGrid(pixels, width, height, x, y) {
  const centeredX = Math.max(0, Math.min(width - 1, x - 0.5));
  const centeredY = Math.max(0, Math.min(height - 1, y - 0.5));
  const left = Math.floor(centeredX);
  const top = Math.floor(centeredY);
  const right = Math.min(width - 1, left + 1);
  const bottom = Math.min(height - 1, top + 1);
  const tx = centeredX - left;
  const ty = centeredY - top;
  const at = (px, py) => pixels[py * width + px];
  const topLeft = at(left, top);
  const topRight = at(right, top);
  const bottomLeft = at(left, bottom);
  const bottomRight = at(right, bottom);
  return topLeft.map((value, channel) => (
    value * (1 - tx) * (1 - ty)
    + topRight[channel] * tx * (1 - ty)
    + bottomLeft[channel] * (1 - tx) * ty
    + bottomRight[channel] * tx * ty
  ));
}

function renderReferenceSamples(decoded, gridSize, targetAspect, background, layoutWidth = gridSize, layoutHeight = gridSize) {
  const sourceAspect = decoded.width / decoded.height;
  const containWidth = sourceAspect >= targetAspect ? 1 : sourceAspect / targetAspect;
  const containHeight = sourceAspect >= targetAspect ? targetAspect / sourceAspect : 1;
  const offsetX = (1 - containWidth) / 2;
  const offsetY = (1 - containHeight) / 2;
  const renderWidth = Math.max(gridSize, Math.min(128, Math.round(layoutWidth)));
  const renderHeight = Math.max(gridSize, Math.min(128, Math.round(layoutHeight)));
  const authored = [];
  for (let y = 0; y < renderHeight; y++) for (let x = 0; x < renderWidth; x++) {
    const nx = (x + 0.5) / renderWidth;
    const ny = (y + 0.5) / renderHeight;
    let source = [0, 0, 0, 0];
    if (nx >= offsetX && nx <= offsetX + containWidth && ny >= offsetY && ny <= offsetY + containHeight) {
      source = sampleBilinear(decoded,
        (nx - offsetX) / containWidth * decoded.width,
        (ny - offsetY) / containHeight * decoded.height);
    }
    authored.push(source);
  }
  const samples = [];
  const alphas = [];
  for (let y = 0; y < gridSize; y++) for (let x = 0; x < gridSize; x++) {
    // Match the browser's two-stage renderer: authored PNG -> unscaled CSS
    // image box -> transformed viewport pixels. This is materially different
    // from one direct 512px -> 23px resize at the Dreamfall mini scale.
    const source = sampleBilinearGrid(authored, renderWidth, renderHeight,
      (x + 0.5) * renderWidth / gridSize,
      (y + 0.5) * renderHeight / gridSize);
    const alpha = source[3] / 255;
    samples.push([
      source[0] * alpha + background[0] * (1 - alpha),
      source[1] * alpha + background[1] * (1 - alpha),
      source[2] * alpha + background[2] * (1 - alpha),
      255,
    ]);
    alphas.push(alpha);
  }
  return { samples, alphas, sourceAspect };
}

function correlation(left, right) {
  const count = Math.min(left.length, right.length);
  if (!count) return 0;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / count;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < count; index++) {
    const a = left[index] - leftMean;
    const b = right[index] - rightMean;
    numerator += a * b;
    leftVariance += a * a;
    rightVariance += b * b;
  }
  if (leftVariance < 1e-8 || rightVariance < 1e-8) return 0;
  return Math.max(-1, Math.min(1, numerator / Math.sqrt(leftVariance * rightVariance)));
}

function luminanceVector(samples) {
  return samples.map(pixel => pixelLuminance(pixel));
}

function channelCorrelationScore(actualSamples, referenceSamples) {
  let total = 0;
  for (let channel = 0; channel < 3; channel++) {
    total += (correlation(
      actualSamples.map(pixel => pixel[channel] / 255),
      referenceSamples.map(pixel => pixel[channel] / 255),
    ) + 1) / 2;
  }
  return total / 3;
}

function edgeVector(luma, gridSize) {
  const edges = [];
  for (let y = 0; y < gridSize; y++) for (let x = 0; x < gridSize; x++) {
    const index = y * gridSize + x;
    const right = x + 1 < gridSize ? luma[index + 1] : luma[index];
    const down = y + 1 < gridSize ? luma[index + gridSize] : luma[index];
    edges.push(Math.hypot(right - luma[index], down - luma[index]));
  }
  return edges;
}

function foregroundBounds(weights, gridSize, threshold = 0.16) {
  let left = gridSize;
  let top = gridSize;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < gridSize; y++) for (let x = 0; x < gridSize; x++) {
    if (Number(weights[y * gridSize + x]) < threshold) continue;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return right >= left && bottom >= top ? { left, top, right, bottom } : null;
}

function normalizeForegroundSamples(samples, weights, gridSize, outputSize = 20) {
  const bounds = foregroundBounds(weights, gridSize);
  if (!bounds) return [];
  const normalized = [];
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  for (let y = 0; y < outputSize; y++) for (let x = 0; x < outputSize; x++) {
    normalized.push(sampleBilinearGrid(samples, gridSize, gridSize,
      bounds.left + (x + 0.5) * width / outputSize,
      bounds.top + (y + 0.5) * height / outputSize));
  }
  return normalized;
}

function scoreRenderedReference(actualSamples, reference, gridSize, background, targetAspect, layoutWidth, layoutHeight) {
  const rendered = renderReferenceSamples(reference.decoded, gridSize, targetAspect, background, layoutWidth, layoutHeight);
  const actualLuma = luminanceVector(actualSamples);
  const referenceLuma = luminanceVector(rendered.samples);
  const lumaCorrelation = (correlation(actualLuma, referenceLuma) + 1) / 2;
  const edgeCorrelation = (correlation(edgeVector(actualLuma, gridSize), edgeVector(referenceLuma, gridSize)) + 1) / 2;
  const channelCorrelation = channelCorrelationScore(actualSamples, rendered.samples);
  let colorDistance = 0;
  let foregroundDistance = 0;
  let silhouetteIntersection = 0;
  let silhouetteUnion = 0;
  let foregroundColorDistance = 0;
  let foregroundColorWeight = 0;
  let authoredColorDistance = 0;
  let authoredColorWeight = 0;
  const actualForegroundWeights = [];
  const foregroundActualLuma = [];
  const foregroundReferenceLuma = [];
  const authoredActualLuma = [];
  const authoredReferenceLuma = [];
  for (let index = 0; index < actualSamples.length; index++) {
    const actual = actualSamples[index];
    const expected = rendered.samples[index];
    const pixelColorDistance = (Math.abs(actual[0] - expected[0]) + Math.abs(actual[1] - expected[1]) + Math.abs(actual[2] - expected[2])) / (3 * 255);
    colorDistance += pixelColorDistance;
    const actualForeground = Math.min(1, Math.hypot(
      actual[0] - background[0], actual[1] - background[1], actual[2] - background[2],
    ) / 180);
    actualForegroundWeights.push(actualForeground);
    const expectedForeground = rendered.alphas[index];
    // A reel cell is mostly transparent background. Whole-cell correlation
    // alone can therefore rank two unrelated, narrow silhouettes as a close
    // match because their shared empty pixels dominate the score. Weight the
    // union of the observed and authored foreground so the visible emblem,
    // veil seam, eyes, and star points remain authoritative at small sizes.
    const foregroundWeight = Math.max(actualForeground, expectedForeground);
    foregroundColorDistance += pixelColorDistance * foregroundWeight;
    foregroundColorWeight += foregroundWeight;
    authoredColorDistance += pixelColorDistance * expectedForeground;
    authoredColorWeight += expectedForeground;
    if (foregroundWeight >= 0.08) {
      foregroundActualLuma.push(actualLuma[index]);
      foregroundReferenceLuma.push(referenceLuma[index]);
    }
    if (expectedForeground >= 0.08) {
      authoredActualLuma.push(actualLuma[index]);
      authoredReferenceLuma.push(referenceLuma[index]);
    }
    foregroundDistance += Math.abs(actualForeground - expectedForeground);
    silhouetteIntersection += Math.min(actualForeground, expectedForeground);
    silhouetteUnion += Math.max(actualForeground, expectedForeground);
  }
  const colorScore = 1 - colorDistance / actualSamples.length;
  const foregroundColorScore = foregroundColorWeight > 0
    ? 1 - foregroundColorDistance / foregroundColorWeight
    : 0;
  const foregroundLumaCorrelation = foregroundActualLuma.length >= 8
    ? (correlation(foregroundActualLuma, foregroundReferenceLuma) + 1) / 2
    : 0;
  const authoredColorScore = authoredColorWeight > 0
    ? 1 - authoredColorDistance / authoredColorWeight
    : 0;
  const authoredLumaCorrelation = authoredActualLuma.length >= 8
    ? (correlation(authoredActualLuma, authoredReferenceLuma) + 1) / 2
    : 0;
  const normalizedActual = normalizeForegroundSamples(actualSamples, actualForegroundWeights, gridSize);
  const normalizedReference = normalizeForegroundSamples(rendered.samples, rendered.alphas, gridSize);
  let normalizedColorScore = 0;
  let normalizedLumaCorrelation = 0;
  let normalizedEdgeCorrelation = 0;
  if (normalizedActual.length && normalizedReference.length) {
    let normalizedDistance = 0;
    for (let index = 0; index < normalizedActual.length; index++) {
      normalizedDistance += (Math.abs(normalizedActual[index][0] - normalizedReference[index][0])
        + Math.abs(normalizedActual[index][1] - normalizedReference[index][1])
        + Math.abs(normalizedActual[index][2] - normalizedReference[index][2])) / (3 * 255);
    }
    normalizedColorScore = 1 - normalizedDistance / normalizedActual.length;
    const actualNormalizedLuma = luminanceVector(normalizedActual);
    const referenceNormalizedLuma = luminanceVector(normalizedReference);
    normalizedLumaCorrelation = (correlation(actualNormalizedLuma, referenceNormalizedLuma) + 1) / 2;
    normalizedEdgeCorrelation = (correlation(
      edgeVector(actualNormalizedLuma, 20), edgeVector(referenceNormalizedLuma, 20),
    ) + 1) / 2;
  }
  const foregroundScore = 1 - foregroundDistance / actualSamples.length;
  const silhouetteScore = silhouetteUnion > 0 ? silhouetteIntersection / silhouetteUnion : 0;
  const score = 0.07 * colorScore + 0.08 * channelCorrelation + 0.07 * lumaCorrelation
    + 0.07 * edgeCorrelation + 0.07 * foregroundScore + 0.06 * silhouetteScore
    + 0.1 * foregroundColorScore + 0.05 * foregroundLumaCorrelation
    + 0.12 * authoredColorScore + 0.05 * authoredLumaCorrelation
    + 0.12 * normalizedColorScore + 0.08 * normalizedLumaCorrelation + 0.06 * normalizedEdgeCorrelation;
  return {
    score: roundedMetric(score),
    colorScore: roundedMetric(colorScore),
    foregroundColorScore: roundedMetric(foregroundColorScore),
    foregroundLumaCorrelation: roundedMetric(foregroundLumaCorrelation),
    authoredColorScore: roundedMetric(authoredColorScore),
    authoredLumaCorrelation: roundedMetric(authoredLumaCorrelation),
    normalizedColorScore: roundedMetric(normalizedColorScore),
    normalizedLumaCorrelation: roundedMetric(normalizedLumaCorrelation),
    normalizedEdgeCorrelation: roundedMetric(normalizedEdgeCorrelation),
    channelCorrelation: roundedMetric(channelCorrelation),
    lumaCorrelation: roundedMetric(lumaCorrelation),
    edgeCorrelation: roundedMetric(edgeCorrelation),
    foregroundScore: roundedMetric(foregroundScore),
    silhouetteScore: roundedMetric(silhouetteScore),
  };
}

export function applyRepeatedFamilyIdentityConsensus(rawCells = [], { minimumScore = 0.52 } = {}) {
  const identityGroups = [];
  const cells = rawCells.map(cell => ({ ...cell }));
  const families = new Map();
  for (const cell of cells) {
    if (!families.has(cell.expectedSymbol)) families.set(cell.expectedSymbol, []);
    families.get(cell.expectedSymbol).push(cell);
  }
  for (const [symbol, familyCells] of families) {
    const margins = familyCells.map(cell => Number(cell.topOneMargin) || 0);
    const signedExpectedMargins = familyCells.map(cell => (
      cell.topSymbol === symbol ? Number(cell.topOneMargin) || 0 : -(Number(cell.bestScore) - Number(cell.expectedScore))
    ));
    const meanMargin = margins.reduce((sum, value) => sum + value, 0) / familyCells.length;
    const signedMeanExpectedMargin = signedExpectedMargins.reduce((sum, value) => sum + value, 0) / familyCells.length;
    const strongMarginCount = margins.filter(value => value >= 0.007).length;
    const expectedTopCount = familyCells.filter(cell => cell.topSymbol === symbol).length;
    const preferredForegroundCount = familyCells.filter(cell => (
      Number(cell.expectedForegroundColorScore) >= 0.825
    )).length;
    const preferredAuthoredCount = familyCells.filter(cell => (
      Number(cell.expectedAuthoredColorScore) >= 0.85
    )).length;
    const uniqueSampleCount = new Set(familyCells.map(cell => cell.sampleHash)).size;
    const unanimousConsensusPassed = familyCells.length >= 3
      && familyCells.every(cell => cell.topSymbol === symbol
        && cell.bestScore >= minimumScore
        && cell.aspectPreserved === true)
      && meanMargin >= 0.0055
      && strongMarginCount >= 2
      && uniqueSampleCount === familyCells.length;
    const compactMajorityConsensusPassed = familyCells.length >= 6
      && expectedTopCount >= Math.ceil(familyCells.length * 0.85)
      && familyCells.every(cell => Number(cell.expectedRank) <= 3
        && Number(cell.expectedScore) >= 0.68
        && Number(cell.expectedForegroundColorScore) >= 0.82
        && Number(cell.expectedAuthoredColorScore) >= 0.84
        && Number(cell.bestScore) - Number(cell.expectedScore) <= 0.012
        && cell.aspectPreserved === true)
      && preferredForegroundCount >= Math.ceil(familyCells.length * 0.85)
      && preferredAuthoredCount >= Math.ceil(familyCells.length * 0.85)
      && signedMeanExpectedMargin >= 0.006
      && strongMarginCount >= 3
      && uniqueSampleCount === familyCells.length;
    const compactAuthoredLineagePassed = familyCells.length >= 2
      && expectedTopCount >= 1
      && familyCells.some(cell => cell.topSymbol === symbol
        && Number(cell.expectedScore) >= 0.67
        && Number(cell.topOneMargin) >= 0.004)
      && familyCells.every(cell => Number(cell.expectedRank) <= 3
        && Number(cell.expectedScore) >= 0.64
        && Number(cell.expectedForegroundColorScore) >= 0.86
        && Number(cell.expectedAuthoredColorScore) >= 0.86
        && Number(cell.bestScore) - Number(cell.expectedScore) <= 0.02
        && (cell.topSymbol === symbol || Number(cell.expectedAuthoredForegroundAdvantage) >= 0.015)
        && cell.aspectPreserved === true)
      && uniqueSampleCount === familyCells.length;
    const consensusPassed = unanimousConsensusPassed || compactMajorityConsensusPassed || compactAuthoredLineagePassed;
    const group = {
      symbol,
      cellCount: familyCells.length,
      meanMargin: roundedMetric(meanMargin),
      signedMeanExpectedMargin: roundedMetric(signedMeanExpectedMargin),
      strongMarginCount,
      expectedTopCount,
      preferredForegroundCount,
      preferredAuthoredCount,
      uniqueSampleCount,
      basis: unanimousConsensusPassed
        ? 'unanimous'
        : compactMajorityConsensusPassed
          ? 'compact-majority'
          : compactAuthoredLineagePassed
            ? 'compact-authored-lineage'
            : 'none',
      passed: consensusPassed,
    };
    identityGroups.push(group);
    if (consensusPassed) for (const cell of familyCells) {
      if (cell.passed) continue;
      cell.passed = true;
      cell.identityBasis = unanimousConsensusPassed
        ? 'repeated-family-consensus'
        : compactMajorityConsensusPassed
          ? 'compact-repeated-family-consensus'
          : 'compact-authored-family-lineage';
      cell.identityGroup = group;
    }
  }
  return { cells, identityGroups };
}

export function applyMotionFamilyConsensus(compositeRecognition, staticRecognition) {
  const cells = (compositeRecognition?.cells || []).map(cell => ({ ...cell }));
  const staticMap = new Map((staticRecognition?.cells || []).map(cell => [`${cell.reel}:${cell.row}`, cell]));
  const identityGroups = [...(compositeRecognition?.identityGroups || [])];
  const families = new Map();
  for (const cell of cells) {
    if (!families.has(cell.expectedSymbol)) families.set(cell.expectedSymbol, []);
    families.get(cell.expectedSymbol).push(cell);
  }
  for (const [symbol, familyCells] of families) {
    const uniqueCompositeSamples = new Set(familyCells.map(cell => cell.sampleHash)).size;
    const staticCells = familyCells.map(cell => staticMap.get(`${cell.reel}:${cell.row}`));
    const gaps = familyCells.map(cell => Number(cell.bestScore) - Number(cell.expectedScore));
    const repeatedMotionGroupPassed = familyCells.length >= 3
      && uniqueCompositeSamples === familyCells.length
      && familyCells.every(cell => Number(cell.expectedRank) <= 1
        && Number(cell.expectedScore) >= 0.65
        && Number(cell.expectedForegroundColorScore) >= 0.8
        && Number(cell.expectedAuthoredColorScore) >= 0.82
        && Number(cell.bestScore) - Number(cell.expectedScore) <= 0.012
        && cell.aspectPreserved === true)
      && staticCells.every(cell => {
        const compactStatic = cell?.identityBasis === 'compact-repeated-family-consensus'
          && cell.identityGroup?.symbol === symbol
          && cell.identityGroup?.basis === 'compact-majority'
          && cell.identityGroup?.passed === true
          && Number(cell.identityGroup?.expectedTopCount) >= Math.ceil(Number(cell.identityGroup?.cellCount) * 0.85)
          && Number(cell.identityGroup?.signedMeanExpectedMargin) >= 0.006;
        return cell?.passed === true
          && (cell.topSymbol === symbol || compactStatic)
          && cell.aspectPreserved === true
          && /^[a-f0-9]{64}$/.test(String(cell.sampleHash || ''));
      });
    const authoredMotionGroupPassed = familyCells.length >= 2
      && uniqueCompositeSamples === familyCells.length
      && familyCells.some(cell => cell.topSymbol === symbol
        && Number(cell.expectedScore) >= 0.67
        && Number(cell.topOneMargin) >= 0.004)
      && familyCells.every(cell => (Number(cell.expectedRank) <= 2
          || (Number(cell.expectedRank) <= 3 && Number(cell.expectedAuthoredForegroundAdvantage) >= 0.1))
        && Number(cell.expectedScore) >= 0.645
        && Number(cell.expectedForegroundColorScore) >= 0.86
        && Number(cell.expectedAuthoredColorScore) >= 0.86
        && Number(cell.bestScore) - Number(cell.expectedScore) <= 0.02
        && cell.aspectPreserved === true)
      && staticCells.every(cell => {
        const authoredStatic = cell?.identityBasis === 'compact-authored-family-lineage'
          && cell.identityGroup?.symbol === symbol
          && cell.identityGroup?.basis === 'compact-authored-lineage'
          && cell.identityGroup?.passed === true;
        return cell?.passed === true
          && (cell.topSymbol === symbol || authoredStatic)
          && cell.aspectPreserved === true
          && /^[a-f0-9]{64}$/.test(String(cell.sampleHash || ''));
      });
    const groupPassed = repeatedMotionGroupPassed || authoredMotionGroupPassed;
    const group = {
      symbol,
      cellCount: familyCells.length,
      uniqueCompositeSampleCount: uniqueCompositeSamples,
      maxExpectedScoreGap: roundedMetric(Math.max(...gaps)),
      staticIdentityCellCount: staticCells.filter(Boolean).length,
      basis: repeatedMotionGroupPassed
        ? 'repeated-static-lineage'
        : authoredMotionGroupPassed
          ? 'compact-authored-static-lineage'
          : 'none',
      passed: groupPassed,
    };
    identityGroups.push(group);
    if (groupPassed) for (const cell of familyCells) {
      if (cell.passed) continue;
      cell.passed = true;
      cell.identityBasis = repeatedMotionGroupPassed
        ? 'motion-family-consensus-with-static-lineage'
        : 'motion-authored-family-lineage';
      cell.identityGroup = group;
      cell.staticIdentitySampleHash = staticMap.get(`${cell.reel}:${cell.row}`)?.sampleHash || null;
    }
  }
  return {
    ...compositeRecognition,
    cells,
    identityGroups,
    passed: cells.every(cell => cell.passed),
    failedCells: cells.filter(cell => !cell.passed).map(cell => `${cell.reel}:${cell.row}`),
  };
}

export function evaluateSingleCellIdentityEvidence({
  best,
  runnerUp,
  expected,
  expectedRank,
  expectedSymbol,
  minimumScore = 0.52,
  minimumMargin = 0.012,
  aspectPreserved = false,
  policy = 'static-identity',
} = {}) {
  const topOneMargin = roundedMetric(Number(best?.score) - Number(runnerUp?.score));
  const authoredForegroundMargin = roundedMetric(
    Number(best?.authoredColorScore) - Number(runnerUp?.authoredColorScore),
  );
  const wholeCellIdentityPassed = best?.symbol === expectedSymbol
    && Number(best?.score) >= minimumScore
    && topOneMargin >= minimumMargin
    && aspectPreserved === true;
  const authoredForegroundIdentityPassed = policy === 'static-identity'
    && best?.symbol === expectedSymbol
    && Number(best?.score) >= Math.max(minimumScore, 0.65)
    && topOneMargin >= 0.001
    && Number(best?.authoredColorScore) >= 0.82
    && authoredForegroundMargin >= 0.025
    && Number(best?.foregroundColorScore) >= 0.8
    && aspectPreserved === true;
  const structuralForegroundIdentityPassed = policy === 'static-identity'
    && best?.symbol !== expectedSymbol
    && Number(expectedRank) === 1
    && Number(expected?.score) >= Math.max(minimumScore, 0.68)
    && Number(best?.score) - Number(expected?.score) <= 0.004
    && Number(expected?.authoredColorScore) >= 0.86
    && Number(expected?.foregroundColorScore) >= 0.82
    && Number(expected?.foregroundScore) - Number(best?.foregroundScore) >= 0.08
    && Number(expected?.silhouetteScore) - Number(best?.silhouetteScore) >= 0.02
    && Number(expected?.normalizedLumaCorrelation) - Number(best?.normalizedLumaCorrelation) >= 0.04
    && aspectPreserved === true;
  const motionForegroundReadabilityPassed = policy === 'composite-readability'
    && best?.symbol !== expectedSymbol
    && Number(expectedRank) === 1
    && Number(expected?.score) >= Math.max(minimumScore, 0.65)
    && Number(best?.score) - Number(expected?.score) <= 0.003
    && Number(expected?.authoredColorScore) >= 0.82
    && Number(expected?.authoredColorScore) - Number(best?.authoredColorScore) >= 0.025
    && Number(expected?.foregroundColorScore) >= 0.8
    && aspectPreserved === true;
  return {
    passed: wholeCellIdentityPassed || authoredForegroundIdentityPassed
      || structuralForegroundIdentityPassed || motionForegroundReadabilityPassed,
    topOneMargin,
    authoredForegroundMargin,
    identityBasis: wholeCellIdentityPassed
      ? 'single-cell-margin'
      : authoredForegroundIdentityPassed
        ? 'authored-foreground-evidence'
        : structuralForegroundIdentityPassed
          ? 'structural-foreground-evidence'
          : motionForegroundReadabilityPassed
            ? 'motion-foreground-readability'
            : 'unresolved',
  };
}

export function analyzeRenderedCellRecognition(image, projectRoot, project, request = {}) {
  if (request?.format !== RENDERED_CELL_RECOGNITION_REQUEST_FORMAT) {
    throw new Error(`Rendered-cell recognition request must use ${RENDERED_CELL_RECOGNITION_REQUEST_FORMAT}.`);
  }
  const decoded = parsePng(image);
  const requestedCells = Array.isArray(request.cells) ? request.cells : [];
  if (!requestedCells.length || requestedCells.length > 64) throw new Error('Rendered-cell recognition requires 1–64 cell crops.');
  const { references, referenceSetHash } = getProjectSymbolReferences(projectRoot, project);
  const referenceMap = new Map(references.map(reference => [reference.name, reference]));
  const minimumScore = Number.isFinite(Number(request.minimumScore)) ? Number(request.minimumScore) : 0.52;
  const minimumMargin = Number.isFinite(Number(request.minimumMargin)) ? Number(request.minimumMargin) : 0.012;
  const policy = request.policy === 'composite-readability'
    ? 'composite-readability'
    : 'static-identity';
  const minimumGovernedMargin = policy === 'composite-readability' ? 0.001 : 0.012;
  if (minimumScore < 0.35 || minimumScore > 0.95 || minimumMargin < minimumGovernedMargin || minimumMargin > 0.25) {
    throw new Error('Rendered-cell recognition thresholds are outside the governed safety range.');
  }
  const seen = new Set();
  const rawCells = requestedCells.map(cell => {
    const reel = Number(cell.reel);
    const row = Number(cell.row);
    const expectedSymbol = safeSymbolName(cell.expectedSymbol);
    if (!Number.isInteger(reel) || reel < 0 || reel > 63 || !Number.isInteger(row) || row < 0 || row > 63) {
      throw new Error('Rendered-cell recognition reel/row coordinates are invalid.');
    }
    const key = `${reel}:${row}`;
    if (seen.has(key)) throw new Error(`Rendered-cell recognition contains duplicate cell ${key}.`);
    seen.add(key);
    if (!referenceMap.has(expectedSymbol)) throw new Error(`Rendered-cell recognition has no reference for ${expectedSymbol}.`);
    const rect = {
      left: Number(cell.rect?.left), top: Number(cell.rect?.top),
      width: Number(cell.rect?.width), height: Number(cell.rect?.height),
    };
    if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
      || rect.width < 12 || rect.height < 12
      || rect.left < 0 || rect.top < 0
      || rect.left + rect.width > decoded.width + 0.01
      || rect.top + rect.height > decoded.height + 0.01) {
      throw new Error(`Rendered-cell recognition crop ${key} is outside the archived PNG or below 12px.`);
    }
    // Preserve small authored features (owl eyes, veil seams, star points) at
    // the actual rendered size. A fixed 20×20 analysis grid blurred those
    // distinctions in mobile cells even when the player-visible family was
    // unambiguous. Mini remains pixel-honest because the grid never exceeds
    // the crop's shortest rendered dimension.
    const gridSize = Math.max(12, Math.min(32, Math.floor(Math.min(rect.width, rect.height))));
    const actualSamples = sampleActualCell(decoded, rect, gridSize);
    const background = averageBorder(actualSamples, gridSize);
    const layoutWidth = Number(cell.layoutWidth) || rect.width;
    const layoutHeight = Number(cell.layoutHeight) || rect.height;
    if (!Number.isFinite(layoutWidth) || !Number.isFinite(layoutHeight)
      || layoutWidth < 12 || layoutHeight < 12
      || layoutWidth > 256 || layoutHeight > 256) {
      throw new Error(`Rendered-cell recognition layout size ${key} is invalid.`);
    }
    const rankings = references.map(reference => ({
      symbol: reference.name,
      referenceSha256: reference.sha256,
      ...scoreRenderedReference(actualSamples, reference, gridSize, background, rect.width / rect.height, layoutWidth, layoutHeight),
    })).sort((left, right) => right.score - left.score || left.symbol.localeCompare(right.symbol));
    const expected = rankings.find(value => value.symbol === expectedSymbol);
    const expectedRank = rankings.findIndex(value => value.symbol === expectedSymbol);
    const best = rankings[0];
    const runnerUp = rankings[1];
    const sourceAspect = referenceMap.get(expectedSymbol).decoded.width / referenceMap.get(expectedSymbol).decoded.height;
    const declaredSourceAspect = Number(cell.sourceAspect);
    const aspectPreserved = Number.isFinite(declaredSourceAspect)
      && Math.abs(declaredSourceAspect - sourceAspect) / Math.max(sourceAspect, 1e-8) <= 0.02;
    const identity = evaluateSingleCellIdentityEvidence({
      best, runnerUp, expected, expectedRank, expectedSymbol, minimumScore, minimumMargin, aspectPreserved, policy,
    });
    const sampleHash = createHash('sha256').update(Buffer.from(actualSamples.flatMap(pixel => pixel.slice(0, 4).map(value => Math.round(value))))).digest('hex');
    return {
      reel, row, expectedSymbol,
      topSymbol: best.symbol,
      runnerUpSymbol: runnerUp.symbol,
      expectedScore: expected.score,
      expectedRank,
      expectedAuthoredColorScore: expected.authoredColorScore,
      expectedForegroundColorScore: expected.foregroundColorScore,
      expectedAuthoredForegroundAdvantage: roundedMetric(expected.authoredColorScore - best.authoredColorScore),
      bestScore: best.score,
      runnerUpScore: runnerUp.score,
      topOneMargin: identity.topOneMargin,
      authoredForegroundMargin: identity.authoredForegroundMargin,
      minimumScore,
      minimumMargin,
      aspectPreserved,
      sourceAspect: roundedMetric(sourceAspect),
      declaredSourceAspect: roundedMetric(declaredSourceAspect),
      referenceSha256: referenceMap.get(expectedSymbol).sha256,
      sampleHash,
      analysisGridSize: gridSize,
      layoutWidth: roundedMetric(layoutWidth),
      layoutHeight: roundedMetric(layoutHeight),
      rect: Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, roundedMetric(value)])),
      passed: identity.passed,
      identityBasis: identity.identityBasis,
      topThree: rankings.slice(0, 3).map(value => ({
        symbol: value.symbol,
        score: value.score,
        colorScore: value.colorScore,
        channelCorrelation: value.channelCorrelation,
        lumaCorrelation: value.lumaCorrelation,
        edgeCorrelation: value.edgeCorrelation,
        foregroundScore: value.foregroundScore,
        silhouetteScore: value.silhouetteScore,
        foregroundColorScore: value.foregroundColorScore,
        foregroundLumaCorrelation: value.foregroundLumaCorrelation,
        authoredColorScore: value.authoredColorScore,
        authoredLumaCorrelation: value.authoredLumaCorrelation,
        normalizedColorScore: value.normalizedColorScore,
        normalizedLumaCorrelation: value.normalizedLumaCorrelation,
        normalizedEdgeCorrelation: value.normalizedEdgeCorrelation,
      })),
    };
  });
  const consensus = policy === 'static-identity'
    ? applyRepeatedFamilyIdentityConsensus(rawCells, { minimumScore })
    : { cells: rawCells, identityGroups: [] };
  const { cells, identityGroups } = consensus;
  const requestHash = createHash('sha256').update(JSON.stringify({
    format: request.format,
    policy,
    cells: requestedCells,
    minimumScore,
    minimumMargin,
    referenceSetHash,
  })).digest('hex');
  return {
    format: RENDERED_CELL_RECOGNITION_FORMAT,
    authority: 'server-decoded-archive-and-project-symbols',
    policy,
    referenceSetHash,
    requestHash,
    familyCount: references.length,
    cellCount: cells.length,
    minimumScore,
    minimumMargin,
    passed: cells.every(cell => cell.passed),
    failedCells: cells.filter(cell => !cell.passed).map(cell => `${cell.reel}:${cell.row}`),
    identityGroups,
    cells,
  };
}

export function archiveProjectQACapture({ gamesDir, projectId, body = {} }) {
  const id = safeId(projectId);
  const projectRoot = join(gamesDir, id);
  const projectPath = join(projectRoot, 'project.json');
  if (!existsSync(projectPath)) throw new Error(`No project "${id}".`);
  const scenarioId = safeCaptureSegment(body.scenarioId, 'scenarioId');
  const runId = safeCaptureSegment(body.runId, 'runId');
  const viewport = safeCaptureSegment(body.viewport, 'viewport');
  const checkpointId = safeCaptureSegment(body.checkpointId, 'checkpointId');
  const encoded = String(body.data || '').replace(/^data:image\/png;base64,/i, '');
  if (!encoded) throw new Error('QA capture PNG data is required.');
  const image = Buffer.from(encoded, 'base64');
  const { width, height, visualMetrics } = analyzePngVisualMetrics(image);
  const project = readProjectDocument(projectPath, {}).project;
  let renderedCellRecognition = body.renderedCellRecognition
    ? analyzeRenderedCellRecognition(image, projectRoot, project, {
      ...body.renderedCellRecognition,
      policy: 'composite-readability',
      minimumMargin: 0.001,
    })
    : null;
  let staticIdentityRecognition = null;
  let staticIdentityFrame = null;
  if (body.renderedCellRecognition) {
    const recognitionEncoded = String(body.recognitionData || '').replace(/^data:image\/png;base64,/i, '');
    if (!recognitionEncoded) throw new Error('Static-identity recognition PNG data is required.');
    const recognitionImage = Buffer.from(recognitionEncoded, 'base64');
    const recognitionMetrics = analyzePngVisualMetrics(recognitionImage);
    if (recognitionMetrics.width !== width || recognitionMetrics.height !== height) {
      throw new Error('Static-identity recognition PNG dimensions must match the composite capture.');
    }
    staticIdentityRecognition = analyzeRenderedCellRecognition(recognitionImage, projectRoot, project, {
      ...body.renderedCellRecognition,
      policy: 'static-identity',
    });
    renderedCellRecognition = applyMotionFamilyConsensus(renderedCellRecognition, staticIdentityRecognition);
    const recognitionSha256 = createHash('sha256').update(recognitionImage).digest('hex');
    const recognitionFilename = `${checkpointId}-static-identity-${recognitionSha256.slice(0, 12)}.png`;
    const recognitionProjectRelativePath = `qa-captures/${scenarioId}/${runId}/${viewport}/${recognitionFilename}`;
    const recognitionPath = join(projectRoot, recognitionProjectRelativePath);
    if (existsSync(recognitionPath)) {
      const existingHash = createHash('sha256').update(readFileSync(recognitionPath)).digest('hex');
      if (existingHash !== recognitionSha256) throw new Error('Immutable static-identity path contains different bytes.');
    } else {
      atomicWrite(recognitionPath, recognitionImage);
    }
    staticIdentityFrame = {
      sha256: recognitionSha256,
      mimeType: 'image/png',
      width,
      height,
      bytes: recognitionImage.length,
      visualMetrics: recognitionMetrics.visualMetrics,
      projectRelativePath: recognitionProjectRelativePath,
      resourceUri: `stake-studio://projects/${encodeURIComponent(id)}/${recognitionProjectRelativePath.split('/').map(encodeURIComponent).join('/')}`,
    };
  }
  if ((body.width !== undefined && Number(body.width) !== width)
    || (body.height !== undefined && Number(body.height) !== height)) throw new Error('Declared QA capture dimensions do not match the PNG IHDR.');
  const sha256 = createHash('sha256').update(image).digest('hex');
  const filename = `${checkpointId}-${sha256.slice(0, 12)}.png`;
  const projectRelativePath = `qa-captures/${scenarioId}/${runId}/${viewport}/${filename}`;
  const path = join(projectRoot, projectRelativePath);
  const metadataPath = `${path}.json`;
  let reused = false;
  if (existsSync(path)) {
    const existingHash = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (existingHash !== sha256) throw new Error('Immutable QA capture path contains different bytes.');
    reused = true;
  } else {
    atomicWrite(path, image);
  }
  const capturedAt = Number.isFinite(Date.parse(body.capturedAt || '')) ? body.capturedAt : new Date().toISOString();
  const metadata = {
    format: 'stake-studio-immutable-qa-capture-v1',
    archived: true,
    projectId: id,
    scenarioId,
    runId,
    viewport,
    checkpointId,
    sha256,
    mimeType: 'image/png',
    width,
    height,
    bytes: image.length,
    visualMetrics,
    ...(renderedCellRecognition ? { renderedCellRecognition } : {}),
    ...(staticIdentityRecognition ? { staticIdentityRecognition, staticIdentityFrame } : {}),
    capturedAt,
    projectRelativePath,
    path: projectRelativePath,
    resourceUri: `stake-studio://projects/${encodeURIComponent(id)}/${projectRelativePath.split('/').map(encodeURIComponent).join('/')}`,
  };
  if (existsSync(metadataPath)) {
    const stored = readJson(metadataPath, null);
    if (!stored || stored.sha256 !== sha256 || stored.projectRelativePath !== projectRelativePath) {
      throw new Error('Immutable QA capture metadata does not match the archived PNG.');
    }
    if (renderedCellRecognition && stored.renderedCellRecognition?.requestHash !== renderedCellRecognition.requestHash) {
      throw new Error('Immutable QA capture recognition metadata does not match this request.');
    }
    if (staticIdentityRecognition
      && stored.staticIdentityRecognition?.requestHash !== staticIdentityRecognition.requestHash) {
      throw new Error('Immutable QA capture static-identity metadata does not match this request.');
    }
    return { ...stored, reused: true };
  }
  atomicWrite(metadataPath, JSON.stringify(metadata, null, 2));
  return { ...metadata, reused };
}

export function reevaluateArchivedProjectQACapture({ gamesDir, projectId, body = {} }) {
  const id = safeId(projectId);
  const projectRoot = join(gamesDir, id);
  const projectPath = join(projectRoot, 'project.json');
  if (!existsSync(projectPath)) throw new Error(`No project "${id}".`);
  const relativeMetadataPath = String(body.projectRelativePath || '').trim();
  if (!relativeMetadataPath.startsWith('qa-captures/') || !relativeMetadataPath.endsWith('.png.json')) {
    throw new Error('Offline QA re-evaluation requires a qa-captures/*.png.json projectRelativePath.');
  }
  const metadataPath = resolve(projectRoot, relativeMetadataPath);
  if (!metadataPath.startsWith(`${resolve(projectRoot)}${sep}`) || !existsSync(metadataPath)) {
    throw new Error('Offline QA re-evaluation metadata is outside the project or missing.');
  }
  const metadata = readJson(metadataPath, null);
  const compositeRelativePath = String(metadata?.projectRelativePath || '');
  const identityRelativePath = String(metadata?.staticIdentityFrame?.projectRelativePath || '');
  const compositePath = resolve(projectRoot, compositeRelativePath);
  const identityPath = resolve(projectRoot, identityRelativePath);
  if (!compositeRelativePath.startsWith('qa-captures/') || !identityRelativePath.startsWith('qa-captures/')
    || !compositePath.startsWith(`${resolve(projectRoot)}${sep}`)
    || !identityPath.startsWith(`${resolve(projectRoot)}${sep}`)
    || !existsSync(compositePath) || !existsSync(identityPath)) {
    throw new Error('Offline QA re-evaluation source frames are missing or outside the project.');
  }
  const sourceCells = metadata?.staticIdentityRecognition?.cells || metadata?.renderedCellRecognition?.cells || [];
  if (!sourceCells.length) throw new Error('Offline QA re-evaluation requires an archived recognition receipt.');
  const request = {
    format: RENDERED_CELL_RECOGNITION_REQUEST_FORMAT,
    minimumScore: Math.max(0.52, Number(metadata?.staticIdentityRecognition?.minimumScore) || 0.52),
    minimumMargin: Math.max(0.012, Number(metadata?.staticIdentityRecognition?.minimumMargin) || 0.012),
    cells: sourceCells.map(cell => ({
      reel: cell.reel,
      row: cell.row,
      expectedSymbol: cell.expectedSymbol,
      sourceAspect: cell.declaredSourceAspect || cell.sourceAspect,
      layoutWidth: cell.layoutWidth,
      layoutHeight: cell.layoutHeight,
      rect: cell.rect,
    })),
  };
  const project = readProjectDocument(projectPath, {}).project;
  const compositeImage = readFileSync(compositePath);
  const identityImage = readFileSync(identityPath);
  let renderedCellRecognition = analyzeRenderedCellRecognition(compositeImage, projectRoot, project, {
    ...request,
    policy: 'composite-readability',
    minimumMargin: 0.001,
  });
  const staticIdentityRecognition = analyzeRenderedCellRecognition(identityImage, projectRoot, project, {
    ...request,
    policy: 'static-identity',
  });
  renderedCellRecognition = applyMotionFamilyConsensus(renderedCellRecognition, staticIdentityRecognition);
  const sourceCompositeSha256 = createHash('sha256').update(compositeImage).digest('hex');
  const sourceIdentitySha256 = createHash('sha256').update(identityImage).digest('hex');
  if (sourceCompositeSha256 !== metadata.sha256 || sourceIdentitySha256 !== metadata.staticIdentityFrame.sha256) {
    throw new Error('Offline QA re-evaluation source frame hashes do not match immutable metadata.');
  }
  const evaluation = {
    format: 'stake-studio-offline-rendered-cell-reevaluation-v1',
    authority: 'server-decoded-immutable-archive',
    projectId: id,
    projectRelativePath: relativeMetadataPath,
    sourceCompositeSha256,
    sourceIdentitySha256,
    renderedCellRecognition,
    staticIdentityRecognition,
    passed: renderedCellRecognition.passed === true && staticIdentityRecognition.passed === true,
    evaluatedAt: new Date().toISOString(),
  };
  evaluation.evaluationHash = createHash('sha256').update(JSON.stringify({
    sourceCompositeSha256,
    sourceIdentitySha256,
    renderedRequestHash: renderedCellRecognition.requestHash,
    identityRequestHash: staticIdentityRecognition.requestHash,
    passed: evaluation.passed,
  })).digest('hex');
  return evaluation;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function listFiles(root, relative = '') {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'tests') continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files.sort();
}

function fileManifest(root) {
  return listFiles(root).map(path => ({ path, bytes: statSync(join(root, path)).size }));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

export function stakeStudioBridge(options = {}) {
  const studioHome = resolveStudioHome(options.home);
  const gamesDir = join(studioHome, 'games');
  const runtimeDir = join(studioHome, '.stake-studio-runtime');
  const statePath = join(runtimeDir, 'state.json');
  const framePath = join(runtimeDir, 'frame.png');
  const frameMetaPath = join(runtimeDir, 'frame.json');
  const errorsPath = join(runtimeDir, 'errors.json');
  const commandsPath = join(runtimeDir, 'commands.json');
  const resultsPath = join(runtimeDir, 'command-results.json');
  const studioProfilePath = join(studioHome, '.stake-studio-profile.json');
  const openaiApiKey = String(options.openaiApiKey || '').trim();
  const speechRequests = [];
  const mathPublisher = createMathPublisher({ studioHome });
  const visualAssetFactory = createVisualAssetFactory({ studioHome, apiKey: openaiApiKey });
  const publishedReplayReader = join(dirname(fileURLToPath(import.meta.url)), 'read_published_reviewer_replay.py');
  const mathSdkPython = join(resolveMathSdkRoot({ studioHome }), 'env', 'bin', 'python');

  const projectPath = id => join(gamesDir, safeId(id), 'project.json');
  const projectMeta = id => {
    const path = projectPath(id);
    if (!existsSync(path)) return null;
    const stat = statSync(path);
    return { id: safeId(id), updatedAt: stat.mtimeMs, size: stat.size };
  };

  return {
    name: 'stake-studio-shared-bridge',
    configureServer(server) {
      mkdirSync(gamesDir, { recursive: true });
      mkdirSync(runtimeDir, { recursive: true });
      if (existsSync(resultsPath)) {
        atomicWrite(resultsPath, JSON.stringify(compactCommandResultLedger(readJson(resultsPath, { results: [] })), null, 2));
      }
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const isMcp = url.pathname === '/mcp' || url.pathname === '/__stake_studio/mcp';
        if (isMcp) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Session-Id, Last-Event-ID, Accept');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }
          if (req.method !== 'POST') {
            return sendJson(res, 405, { error: 'MCP expects POST JSON-RPC (initialize, tools/list, tools/call).' });
          }
          try {
            const { handleMcpMessage } = await import('../mcp/server.mjs');
            const body = await readBody(req);
            const reply = await handleMcpMessage(body) || { jsonrpc: '2.0', id: body?.id ?? null, result: {} };
            return sendJson(res, 200, reply);
          } catch (error) {
            return sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: String(error?.message || error) } });
          }
        }
        if (!url.pathname.startsWith('/__stake_studio/')) return next();

        try {
          if (req.method === 'GET' && url.pathname === '/__stake_studio/health') {
            return sendJson(res, 200, {
              ok: true,
              service: 'StakeStudio shared bridge',
              studioHome,
              gamesDir,
              runtimeDir,
              serverTime: new Date().toISOString(),
            });
          }

          if (req.method === 'GET' && url.pathname === '/__stake_studio/audio/capabilities') {
            return sendJson(res, 200, {
              procedural: true,
              recording: true,
              import: true,
              aiVoice: Boolean(openaiApiKey),
              speechMaxCharacters: SPEECH_MAX_CHARACTERS,
            });
          }

          if (req.method === 'GET' && url.pathname === '/__stake_studio/studio-profile') {
            return sendJson(res, 200, { profile: normalizeStudioProfile(readJson(studioProfilePath, {})) });
          }

          if (req.method === 'PUT' && url.pathname === '/__stake_studio/studio-profile') {
            const body = await readBody(req);
            if (!body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) {
              return sendJson(res, 400, { error: 'A studio profile object is required.' });
            }
            const profile = normalizeStudioProfile(body.profile, { stamp: true });
            atomicWrite(studioProfilePath, JSON.stringify(profile, null, 2));
            return sendJson(res, 200, { ok: true, profile });
          }

          if (req.method === 'POST' && url.pathname === '/__stake_studio/audio/speech') {
            if (!openaiApiKey) return sendJson(res, 503, { error: 'OpenAI voice generation is not configured.' });
            const now = Date.now();
            while (speechRequests.length && speechRequests[0] < now - 60_000) speechRequests.shift();
            if (speechRequests.length >= 20) return sendJson(res, 429, { error: 'Voice generation is cooling down. Try again in a minute.' });
            const body = await readBody(req);
            const input = String(body.input || '').trim();
            const voice = SPEECH_VOICES.has(body.voice) ? body.voice : 'marin';
            const instructions = String(body.instructions || '').trim().slice(0, 1200);
            const speed = Math.max(0.5, Math.min(2, Number(body.speed || 1)));
            if (!input) return sendJson(res, 400, { error: 'Voice text is required.' });
            if (input.length > SPEECH_MAX_CHARACTERS) return sendJson(res, 400, { error: `Voice text must be ${SPEECH_MAX_CHARACTERS} characters or fewer.` });
            speechRequests.push(now);
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini-tts',
                voice,
                input,
                instructions: instructions || 'Deliver this as a polished, concise character line for a premium game.',
                response_format: 'mp3',
                speed,
              }),
            });
            if (!response.ok) {
              const failure = await response.json().catch(() => ({}));
              return sendJson(res, response.status, { error: failure.error?.message || 'OpenAI voice generation failed.' });
            }
            const audio = Buffer.from(await response.arrayBuffer());
            res.statusCode = 200;
            res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
            res.setHeader('Content-Length', String(audio.length));
            res.setHeader('Cache-Control', 'no-store');
            return res.end(audio);
          }

          if (req.method === 'GET' && url.pathname === '/__stake_studio/visual/capabilities') {
            return sendJson(res, 200, {
              ...visualAssetFactory.capabilities(),
              localQualityAnalysis: true,
              visualQualityFormat: 'stake-studio-visual-analysis-v1',
            });
          }

          if (req.method === 'POST' && url.pathname === '/__stake_studio/visual/analyze') {
            const body = await readBody(req);
            try {
              return sendJson(res, 200, { analysis: analyzeVisualAsset(body) });
            } catch (error) {
              return sendJson(res, 400, { error: error.message });
            }
          }

          const visualGenerateMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/visual-factory\/generate$/);
          if (req.method === 'POST' && visualGenerateMatch) {
            const id = safeId(visualGenerateMatch[1]);
            if (!existsSync(projectPath(id))) return sendJson(res, 404, { error: `No project "${id}". Save it before generating visual assets.` });
            const body = await readBody(req);
            try {
              const result = await visualAssetFactory.generate({ projectId: id, ...body });
              return sendJson(res, 200, { result });
            } catch (error) {
              const status = Number(error.status) || (/cooling down/i.test(error.message) ? 429 : /not configured/i.test(error.message) ? 503 : 400);
              return sendJson(res, status, { error: error.message });
            }
          }

          if (req.method === 'GET' && url.pathname === '/__stake_studio/state') {
            return sendJson(res, 200, readJson(statePath, { connected: false, reason: 'StakeStudio UI has not published state yet.' }));
          }

          if (req.method === 'POST' && url.pathname === '/__stake_studio/state') {
            const body = await readBody(req);
            const receivedAt = new Date().toISOString();
            const reportedErrors = Array.isArray(body.diagnostics?.errors)
              ? body.diagnostics.errors.slice(-50)
              : null;
            const diagnostics = body.diagnostics && typeof body.diagnostics === 'object'
              ? { ...body.diagnostics }
              : null;
            if (diagnostics) delete diagnostics.errors;
            const state = {
              ...body,
              ...(diagnostics ? { diagnostics } : {}),
              connected: true,
              receivedAt,
            };
            atomicWrite(statePath, JSON.stringify(state, null, 2));
            if (reportedErrors) {
              atomicWrite(errorsPath, JSON.stringify({ errors: reportedErrors, receivedAt }, null, 2));
            }
            return sendJson(res, 200, { ok: true, receivedAt: state.receivedAt });
          }

          if (req.method === 'GET' && url.pathname === '/__stake_studio/errors') {
            return sendJson(res, 200, readJson(errorsPath, { errors: [] }));
          }

          if (req.method === 'POST' && url.pathname === '/__stake_studio/errors') {
            const body = await readBody(req);
            atomicWrite(errorsPath, JSON.stringify({ errors: body.errors || [], receivedAt: new Date().toISOString() }, null, 2));
            return sendJson(res, 200, { ok: true });
          }

          if (req.method === 'GET' && url.pathname === '/__stake_studio/frame') {
            if (!existsSync(framePath)) return sendJson(res, 404, { error: 'No shared frame yet. Open StakeStudio and wait for it to render.' });
            const frame = readFileSync(framePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Length', String(frame.length));
            res.setHeader('Cache-Control', 'no-store');
            return res.end(frame);
          }

          if (req.method === 'GET' && url.pathname === '/__stake_studio/frame-meta') {
            return sendJson(res, 200, readJson(frameMetaPath, { available: false }));
          }

          if (req.method === 'POST' && url.pathname === '/__stake_studio/frame-stale') {
            const body = await readBody(req);
            const metadata = readJson(frameMetaPath, { available: false });
            const staleAt = body.markedAt || new Date().toISOString();
            const next = {
              ...metadata,
              stale: true,
              staleReason: body.reason || 'visual-change',
              staleAt,
            };
            atomicWrite(frameMetaPath, JSON.stringify(next, null, 2));
            return sendJson(res, 200, { ok: true, ...next });
          }

          if (req.method === 'POST' && url.pathname === '/__stake_studio/frame') {
            const body = await readBody(req);
            if (!body.data) throw new Error('Frame data is required.');
            const image = Buffer.from(body.data, 'base64');
            if (image.length < 8 || image.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error('Frame is not a PNG image.');
            atomicWrite(framePath, image);
            const metadata = {
              available: true,
              mimeType: 'image/png',
              width: body.width || null,
              height: body.height || null,
              bytes: image.length,
              reason: body.reason || 'update',
              stale: false,
              staleReason: null,
              staleAt: null,
              capturedAt: body.capturedAt || new Date().toISOString(),
              receivedAt: new Date().toISOString(),
            };
            atomicWrite(frameMetaPath, JSON.stringify(metadata, null, 2));
            return sendJson(res, 200, { ok: true, ...metadata });
          }

          const qaCaptureMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/qa-captures$/);
          if (req.method === 'POST' && qaCaptureMatch) {
            const body = await readBody(req);
            const archived = archiveProjectQACapture({ gamesDir, projectId: qaCaptureMatch[1], body });
            return sendJson(res, 200, archived);
          }

          const qaReevaluateMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/qa-captures\/re-evaluate$/);
          if (req.method === 'POST' && qaReevaluateMatch) {
            const body = await readBody(req);
            const evaluation = reevaluateArchivedProjectQACapture({
              gamesDir,
              projectId: qaReevaluateMatch[1],
              body,
            });
            return sendJson(res, 200, evaluation);
          }

          if (req.method === 'GET' && url.pathname === '/__stake_studio/projects') {
            const projects = existsSync(gamesDir)
              ? readdirSync(gamesDir, { withFileTypes: true })
                  .filter(entry => entry.isDirectory() && existsSync(join(gamesDir, entry.name, 'project.json')))
                  .map(entry => {
                    const meta = projectMeta(entry.name);
                    const project = readJson(projectPath(entry.name), {});
                    return { ...meta, name: project.name || entry.name };
                  })
                  .sort((a, b) => b.updatedAt - a.updatedAt)
              : [];
            return sendJson(res, 200, { projects });
          }

          const agentJobsMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/agent-jobs(?:\/([^/]+))?(?:\/(claim|heartbeat|update|complete|fail))?$/);
          if (agentJobsMatch) {
            const id = safeId(agentJobsMatch[1]);
            const path = projectPath(id);
            const project = readProjectDocument(path, null).project;
            if (!project) return sendJson(res, 404, { error: `No project "${id}".` });
            const jobSegment = agentJobsMatch[2] ? decodeURIComponent(agentJobsMatch[2]) : null;
            const action = agentJobsMatch[3] || null;
            if (req.method === 'GET' && !jobSegment) {
              const result = listAgentJobs(project, {
                owner: url.searchParams.get('owner'),
                status: url.searchParams.get('status'),
                availableOnly: url.searchParams.get('availableOnly') === 'true',
              });
              if (result.recovered.length) persistProjectDocument(path, project);
              return sendJson(res, 200, { id, ...result, summary: getFlagshipWorkflowSummary(project) });
            }
            if (req.method === 'POST' && jobSegment === 'recover' && !action) {
              const recovery = recoverStaleAgentJobLeases(project);
              if (recovery.recovered.length) persistProjectDocument(path, project);
              return sendJson(res, 200, { id, ...recovery, summary: getFlagshipWorkflowSummary(project) });
            }
            const body = await readBody(req);
            let job;
            if (req.method === 'POST' && !jobSegment) {
              setProductionTrack(project, 'flagship');
              job = createAgentJob(project, {
                id: body.jobId, owner: body.owner, artifact: body.artifact, stage: body.stage,
                dependencies: body.dependencies, deliverables: body.deliverables, acceptance: body.acceptance,
              });
            } else if (req.method === 'POST' && jobSegment && action === 'claim') {
              job = claimAgentJob(project, { jobId: jobSegment, ...body });
            } else if (req.method === 'POST' && jobSegment && action === 'heartbeat') {
              job = heartbeatAgentJob(project, { jobId: jobSegment, ...body });
            } else if (req.method === 'POST' && jobSegment && action === 'update') {
              job = updateAgentJob(project, { jobId: jobSegment, ...body });
            } else if (req.method === 'POST' && jobSegment && action === 'complete') {
              job = completeAgentJob(project, { jobId: jobSegment, ...body });
            } else if (req.method === 'POST' && jobSegment && action === 'fail') {
              job = failAgentJob(project, { jobId: jobSegment, ...body });
            } else {
              return sendJson(res, 405, { error: 'Unsupported agent-job operation.' });
            }
            persistProjectDocument(path, project);
            return sendJson(res, 200, {
              id, job, ...(job.lease?.token ? { leaseToken: job.lease.token } : {}),
              summary: getFlagshipWorkflowSummary(project),
            });
          }

          const visualExcellenceMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/visual-excellence(?:\/(briefs|deliveries|reviews|human-signoff))?$/);
          if (visualExcellenceMatch) {
            const id = safeId(visualExcellenceMatch[1]);
            const path = projectPath(id);
            const project = readProjectDocument(path, null).project;
            if (!project) return sendJson(res, 404, { error: `No project "${id}".` });
            const operation = visualExcellenceMatch[2] || null;
            let workflow = ensureProductionWorkflow(project);
            if (req.method === 'GET' && !operation) {
              return sendJson(res, 200, {
                id, department: workflow.visualExcellence,
                summary: getVisualExcellenceSummary(workflow.visualExcellence),
              });
            }
            if (req.method !== 'POST' || !operation) {
              return sendJson(res, 405, { error: 'Unsupported Visual Excellence operation.' });
            }
            const body = await readBody(req);
            setProductionTrack(project, 'flagship');
            workflow = ensureProductionWorkflow(project, 'flagship');
            if (operation === 'briefs') {
              workflow.visualExcellence = upsertVisualSequenceBrief(workflow.visualExcellence, body.brief || body);
              const brief = workflow.visualExcellence.briefs.find(item => item.id === String((body.brief || body)?.id || '').trim());
              if (body.createJobs !== false) {
                for (const job of createVisualExcellenceJobPlan(brief)) {
                  if (!workflow.agentCoordination.workItems.some(item => item.id === job.id)) createAgentJob(project, job);
                }
              }
            } else if (operation === 'deliveries') {
              workflow.visualExcellence = recordVisualExcellenceDelivery(workflow.visualExcellence, body);
            } else if (operation === 'reviews') {
              workflow.visualExcellence = recordVisualDirectorReview(workflow.visualExcellence, body);
            } else if (operation === 'human-signoff') {
              workflow.visualExcellence = recordHumanVisualSignoff(workflow.visualExcellence, body);
            }
            workflow.updatedAt = new Date().toISOString();
            project.production.qa ||= {};
            project.production.qa.gameCertification = null;
            persistProjectDocument(path, project);
            return sendJson(res, 200, {
              id, department: workflow.visualExcellence,
              summary: getVisualExcellenceSummary(workflow.visualExcellence),
            });
          }

          const visualDeliveryMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/visual-delivery$/);
          if (req.method === 'POST' && visualDeliveryMatch) {
            const id = safeId(visualDeliveryMatch[1]);
            const project = readProjectDocument(projectPath(id), null).project;
            if (!project) return sendJson(res, 404, { error: `No project "${id}".` });
            const body = await readBody(req);
            const workOrder = project.visualFactory?.workOrder;
            if (!workOrder || workOrder.format !== 'stake-studio-visual-work-order-v1') {
              return sendJson(res, 400, { error: 'Prepare the current visual work order before submitting Codex art.' });
            }
            if (body.workOrderFingerprint !== workOrder.fingerprint) {
              return sendJson(res, 409, { error: 'The submitted image belongs to a different visual work order.' });
            }
            const filename = String(body.filename || '').trim();
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}\.png$/.test(filename)) {
              return sendJson(res, 400, { error: 'Visual delivery filename must be one safe PNG filename.' });
            }
            const declared = workOrder.items?.find(item => item.output?.filename === filename && item.action === 'generate' && workOrder.productionOrder?.includes(item.key));
            if (!declared) return sendJson(res, 400, { error: `${filename} is not an active deliverable in the current visual work order.` });
            const encoded = String(body.pngBase64 || body.dataUrl || '').replace(/^data:image\/png;base64,/i, '');
            if (!encoded || !/^[A-Za-z0-9+/=]+$/.test(encoded)) return sendJson(res, 400, { error: 'Submit a base64-encoded PNG.' });
            const data = Buffer.from(encoded, 'base64');
            if (data.length < 24 || data.length > 20 * 1024 * 1024 || data.subarray(1, 4).toString('ascii') !== 'PNG') {
              return sendJson(res, 400, { error: 'Submitted visual must be a valid PNG no larger than 20 MB.' });
            }
            const root = join(gamesDir, id, 'assets', 'visual-delivery');
            const path = join(root, filename);
            atomicWrite(path, data);
            return sendJson(res, 201, {
              format: 'stake-studio-codex-visual-submission-v1',
              projectId: id,
              key: declared.key,
              filename,
              bytes: data.length,
              path,
              workOrderFingerprint: workOrder.fingerprint,
            });
          }
          if (req.method === 'GET' && visualDeliveryMatch) {
            const id = safeId(visualDeliveryMatch[1]);
            if (!existsSync(projectPath(id))) return sendJson(res, 404, { error: `No project "${id}".` });
            const root = join(gamesDir, id, 'assets', 'visual-delivery');
            mkdirSync(root, { recursive: true });
            const candidates = readdirSync(root, { withFileTypes: true })
              .filter(entry => entry.isFile() && !entry.name.startsWith('.') && entry.name.toLowerCase().endsWith('.png'))
              .sort((left, right) => left.name.localeCompare(right.name));
            if (candidates.length > 64) return sendJson(res, 400, { error: 'Visual delivery inbox is limited to 64 PNG files per scan.' });
            const files = [];
            let totalBytes = 0;
            for (const entry of candidates) {
              const path = join(root, entry.name);
              const stat = statSync(path);
              if (stat.size > 20 * 1024 * 1024) return sendJson(res, 400, { error: `${entry.name} exceeds the 20 MB delivery limit.` });
              totalBytes += stat.size;
              if (totalBytes > 120 * 1024 * 1024) return sendJson(res, 400, { error: 'Visual delivery inbox exceeds the 120 MB scan limit.' });
              const data = readFileSync(path);
              if (data.length < 24 || data.subarray(1, 4).toString('ascii') !== 'PNG') {
                return sendJson(res, 400, { error: `${entry.name} is not a valid PNG file.` });
              }
              files.push({
                filename: entry.name,
                bytes: data.length,
                modifiedAt: new Date(stat.mtimeMs).toISOString(),
                dataUrl: `data:image/png;base64,${data.toString('base64')}`,
              });
            }
            return sendJson(res, 200, {
              format: 'stake-studio-visual-delivery-scan-v1',
              projectId: id,
              folder: root,
              files,
              totalBytes,
            });
          }

          const assetMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/assets\/(.+)$/);
          if (req.method === 'GET' && assetMatch) {
            const id = safeId(assetMatch[1]);
            const relativeAsset = decodeURIComponent(assetMatch[2]);
            const segments = relativeAsset.split('/').filter(Boolean);
            if (segments.length === 0 || segments.some(segment => segment === '..' || segment === '.')) {
              return sendJson(res, 400, { error: 'Invalid project asset path.' });
            }
            const assetPath = join(gamesDir, id, 'assets', ...segments);
            if (!existsSync(assetPath)) return sendJson(res, 404, { error: `No project asset "${relativeAsset}".` });
            const extension = segments.at(-1).split('.').at(-1).toLowerCase();
            const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };
            res.statusCode = 200;
            res.setHeader('Content-Type', mimeTypes[extension] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-cache');
            return res.end(readFileSync(assetPath));
          }

          const frontendManifestMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/frontend-manifest$/);
          if (req.method === 'GET' && frontendManifestMatch) {
            const id = safeId(frontendManifestMatch[1]);
            const root = join(gamesDir, id, 'frontend');
            const files = listFiles(root);
            if (!files.length) return sendJson(res, 404, { error: `Project "${id}" has no packaged frontend.` });
            return sendJson(res, 200, { projectId: id, entry: 'index.html', files });
          }

          const frontendCompileMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/frontend-compiler\/build$/);
          if (req.method === 'POST' && frontendCompileMatch) {
            const id = safeId(frontendCompileMatch[1]);
            const result = await compileFrontendProject({ studioHome, projectId: id });
            return sendJson(res, 200, result);
          }

          const frontendMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/frontend\/(.+)$/);
          if (req.method === 'GET' && frontendMatch) {
            const id = safeId(frontendMatch[1]);
            const relativeFile = decodeURIComponent(frontendMatch[2]);
            const segments = relativeFile.split('/').filter(Boolean);
            if (segments.length === 0 || segments.some(segment => segment === '..' || segment === '.')) {
              return sendJson(res, 400, { error: 'Invalid frontend path.' });
            }
            const filePath = join(gamesDir, id, 'frontend', ...segments);
            if (!existsSync(filePath) || !statSync(filePath).isFile()) {
              return sendJson(res, 404, { error: `No frontend file "${relativeFile}".` });
            }
            const extension = segments.at(-1).split('.').at(-1).toLowerCase();
            const mimeTypes = {
              html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
              json: 'application/json; charset=utf-8', md: 'text/markdown; charset=utf-8', png: 'image/png',
              jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
            };
            const contents = readFileSync(filePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', mimeTypes[extension] || 'application/octet-stream');
            res.setHeader('Content-Length', String(contents.length));
            res.setHeader('Cache-Control', segments[0] === 'assets'
              ? 'public, max-age=31536000, immutable'
              : 'no-cache');
            return res.end(contents);
          }

          const mathPublishManifestMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/math-publish-manifest$/);
          if (req.method === 'GET' && mathPublishManifestMatch) {
            const id = safeId(mathPublishManifestMatch[1]);
            const root = join(gamesDir, id, 'math-publish');
            const entries = fileManifest(root);
            if (!entries.length) return sendJson(res, 404, { error: `Project "${id}" has no production math artifacts.` });
            return sendJson(res, 200, {
              projectId: id,
              root: `games/${id}/library`,
              files: entries,
              totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
            });
          }

          const mathPublisherStartMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/math-publisher\/start$/);
          if (req.method === 'POST' && mathPublisherStartMatch) {
            const id = safeId(mathPublisherStartMatch[1]);
            const body = await readBody(req);
            return sendJson(res, 202, mathPublisher.start({
              projectId: id,
              files: body.files,
              profile: body.profile,
              simulations: body.simulations,
              resumeExisting: body.resumeExisting === true,
            }));
          }

          const publishedReplayMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/published-replay\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/);
          if (req.method === 'GET' && publishedReplayMatch) {
            const id = safeId(publishedReplayMatch[1]);
            const mode = safeCaptureSegment(publishedReplayMatch[2], 'Published replay mode');
            const category = safeCaptureSegment(publishedReplayMatch[3], 'Published replay category');
            const allowedCategories = new Set(['loss', 'normalWin', 'bigWin', 'wincap', 'bonusTrigger']);
            if (!allowedCategories.has(category)) return sendJson(res, 400, { error: `Unknown published replay category "${category}".` });
            const project = readProjectDocument(projectPath(id), null).project;
            const published = project.build?.mathPublish || {};
            if (!(published.profile === 'production' && published.officialVerification
              && published.fullStreamIntegrity && published.rtpAligned)) {
              return sendJson(res, 409, { error: `Project "${id}" has no verified production math replay authority.` });
            }
            const loaded = spawnSync(mathSdkPython, [
              publishedReplayReader,
              join(gamesDir, id, 'math-publish'),
              mode,
              category,
            ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
            let replay = null;
            try { replay = JSON.parse(String(loaded.stdout || '').trim()); } catch { /* handled below */ }
            if (loaded.status !== 0 || replay?.valid === false || !replay?.book) {
              return sendJson(res, 422, { error: replay?.error || loaded.stderr || 'Published reviewer replay could not be loaded.' });
            }
            return sendJson(res, 200, { projectId: id, ...replay });
          }

          const mathPublisherJobMatch = url.pathname.match(/^\/__stake_studio\/math-publisher\/jobs\/([a-zA-Z0-9_-]+)(\/cancel)?$/);
          if (mathPublisherJobMatch) {
            const jobId = mathPublisherJobMatch[1];
            if (req.method === 'GET' && !mathPublisherJobMatch[2]) {
              const job = mathPublisher.get(jobId);
              return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: `No math publisher job "${jobId}".` });
            }
            if (req.method === 'POST' && mathPublisherJobMatch[2] === '/cancel') {
              const job = mathPublisher.cancel(jobId);
              return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: `No math publisher job "${jobId}".` });
            }
          }

          const mathPublishMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/math-publish\/(.+)$/);
          if (req.method === 'GET' && mathPublishMatch) {
            const id = safeId(mathPublishMatch[1]);
            const relativeFile = decodeURIComponent(mathPublishMatch[2]);
            const segments = relativeFile.split('/').filter(Boolean);
            if (segments.length === 0 || segments.some(segment => segment === '..' || segment === '.')) {
              return sendJson(res, 400, { error: 'Invalid production math path.' });
            }
            const filePath = join(gamesDir, id, 'math-publish', ...segments);
            if (!existsSync(filePath) || !statSync(filePath).isFile()) {
              return sendJson(res, 404, { error: `No production math file "${relativeFile}".` });
            }
            const extension = segments.at(-1).split('.').at(-1).toLowerCase();
            const mimeTypes = {
              csv: 'text/csv; charset=utf-8', json: 'application/json; charset=utf-8',
              zst: 'application/zstd', zstd: 'application/zstd',
            };
            const contents = readFileSync(filePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', mimeTypes[extension] || 'application/octet-stream');
            res.setHeader('Content-Length', String(contents.length));
            res.setHeader('Cache-Control', 'no-cache');
            return res.end(contents);
          }

          const projectMatch = url.pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)(\/meta)?$/);
          if (projectMatch) {
            const id = safeId(projectMatch[1]);
            const path = projectPath(id);
            if (req.method === 'GET' && projectMatch[2] === '/meta') {
              const meta = projectMeta(id);
              return meta ? sendJson(res, 200, meta) : sendJson(res, 404, { error: `No project "${id}".` });
            }
            if (req.method === 'GET') {
              if (!existsSync(path)) return sendJson(res, 404, { error: `No project "${id}".` });
              return sendJson(res, 200, { project: readProjectDocument(path, null).project, meta: projectMeta(id) });
            }
            if (req.method === 'PUT') {
              const body = await readBody(req);
              if (!body.project || typeof body.project !== 'object') throw new Error('A project object is required.');
              const storage = persistProjectDocument(path, body.project);
              return sendJson(res, 200, { ok: true, meta: projectMeta(id), storage: storage.stats });
            }
          }

          if (req.method === 'POST' && url.pathname === '/__stake_studio/commands') {
            const body = await readBody(req);
            if (!body.command) throw new Error('A command is required.');
            const frameMetadata = readJson(frameMetaPath, { available: false });
            atomicWrite(frameMetaPath, JSON.stringify({
              ...frameMetadata,
              stale: true,
              staleReason: `command:${body.command}`,
              staleAt: new Date().toISOString(),
            }, null, 2));
            const queue = readJson(commandsPath, { sequence: 0, commands: [] });
            const sequence = Number(queue.sequence || 0) + 1;
            const command = {
              id: body.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
              sequence,
              command: body.command,
              arguments: body.arguments || {},
              createdAt: new Date().toISOString(),
            };
            const commands = [...(queue.commands || []), command].slice(-200);
            atomicWrite(commandsPath, JSON.stringify({ sequence, commands }, null, 2));
            return sendJson(res, 200, command);
          }

          if (req.method === 'GET' && url.pathname === '/__stake_studio/commands') {
            const queue = readJson(commandsPath, { sequence: 0, commands: [] });
            const requestedAfter = Number(url.searchParams.get('after') || 0);
            const after = Number.isSafeInteger(requestedAfter) && requestedAfter <= (queue.sequence || 0)
              ? requestedAfter
              : Math.max(0, (queue.sequence || 0) - 1);
            const completed = new Set(
              readJson(resultsPath, { results: [] }).results?.map(result => result.id) || [],
            );
            const claim = String(url.searchParams.get('claim') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
            const now = Date.now();
            const pending = (queue.commands || []).filter(command => command.sequence > after && !completed.has(command.id));
            let commands = pending;
            if (claim) {
              commands = pending.filter(command => {
                const expiresAt = Date.parse(command.claimExpiresAt || '') || 0;
                return !command.claimedBy || command.claimedBy === claim || expiresAt <= now;
              }).slice(0, 1);
              if (commands.length) {
                const claimedIds = new Set(commands.map(command => command.id));
                const claimExpiresAt = new Date(now + 45_000).toISOString();
                const nextCommands = (queue.commands || []).map(command => claimedIds.has(command.id)
                  ? { ...command, claimedBy: claim, claimExpiresAt }
                  : command);
                atomicWrite(commandsPath, JSON.stringify({ sequence: queue.sequence || 0, commands: nextCommands }, null, 2));
                commands = nextCommands.filter(command => claimedIds.has(command.id));
              }
            }
            return sendJson(res, 200, {
              sequence: queue.sequence || 0,
              commands,
            });
          }

          if (req.method === 'POST' && url.pathname === '/__stake_studio/command-results') {
            const body = await readBody(req);
            if (!body.id) throw new Error('A command result id is required.');
            const results = readJson(resultsPath, { results: [] });
            const result = { ...body, completedAt: new Date().toISOString() };
            atomicWrite(resultsPath, JSON.stringify(appendCommandResult(results, result), null, 2));
            return sendJson(res, 200, { ok: true });
          }

          const resultMatch = url.pathname.match(/^\/__stake_studio\/command-results\/([a-zA-Z0-9_-]+)$/);
          if (req.method === 'GET' && resultMatch) {
            const results = readJson(resultsPath, { results: [] });
            const consumed = consumeCommandResult(results, resultMatch[1]);
            if (consumed.status === 'missing') return sendJson(res, 404, { pending: true });
            if (consumed.status === 'consumed') return sendJson(res, 410, { consumed: true });
            atomicWrite(resultsPath, JSON.stringify(consumed.ledger, null, 2));
            return sendJson(res, 200, consumed.result);
          }

          return sendJson(res, 404, { error: `Unknown StakeStudio bridge endpoint: ${url.pathname}` });
        } catch (error) {
          return sendJson(res, 500, { error: String(error?.message || error) });
        }
      });
    },
  };
}
