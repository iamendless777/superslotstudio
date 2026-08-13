#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const [inputPath, outputPath, rawConfig] = process.argv.slice(2);
if (!inputPath || !outputPath || !rawConfig) {
  throw new Error('Usage: reposition-motion-atlas-patches.mjs <input.png> <output.png> <config-json>');
}

const config = JSON.parse(rawConfig);
const columns = Math.max(1, Number(config.columns) || 4);
const rows = Math.max(1, Number(config.rows) || 4);
const atlasSize = Math.max(1, Number(config.atlasSize) || 1024);
const frameWidth = atlasSize / columns;
const frameHeight = atlasSize / rows;
const sourceCenters = config.sourceCenters || [];
const targetCenters = config.targetCenters || [];
if (!sourceCenters.length || sourceCenters.length !== targetCenters.length) {
  throw new Error('sourceCenters and targetCenters must contain the same non-zero number of normalized [x,y] pairs.');
}

const normalizedSize = (value, fallback) => {
  const pair = Array.isArray(value) ? value : [value, value];
  return [
    Math.max(1, Math.round((Number(pair[0]) || fallback) * frameWidth)),
    Math.max(1, Math.round((Number(pair[1]) || fallback) * frameHeight)),
  ];
};
const sourceSizes = sourceCenters.map((_, patch) => normalizedSize(config.sourceSizes?.[patch] ?? config.sourceSize, 0.34));
const targetSizes = targetCenters.map((_, patch) => normalizedSize(config.targetSizes?.[patch] ?? config.targetSize, 0.1));
const frameCount = columns * rows;
const frameOffsets = sourceCenters.map((_, patch) => Math.trunc(Number(config.frameOffsets?.[patch]) || 0));
const filters = [];
const atlasLabels = Array.from({ length: frameCount }, (_, index) => `atlas${index}`);
const inputMatte = config.preserveAlpha
  ? '[0:v]format=rgba'
  : `[0:v]colorkey=${config.key || '0x000000'}:${Number(config.similarity) || 0.055}:${Number(config.blend) || 0.08},format=rgba`;
filters.push(`${inputMatte},split=${frameCount}${atlasLabels.map(label => `[${label}]`).join('')}`);
filters.push(`color=c=black@0.0:s=${atlasSize}x${atlasSize},format=rgba[base]`);

const patchLabels = [];
for (let sourceFrame = 0; sourceFrame < frameCount; sourceFrame += 1) {
  const sourceColumn = sourceFrame % columns;
  const sourceRow = Math.floor(sourceFrame / columns);
  const sourcePatchInputs = sourceCenters.map((_, patch) => `source${sourceFrame}patch${patch}in`);
  filters.push(`[atlas${sourceFrame}]crop=${frameWidth}:${frameHeight}:${sourceColumn * frameWidth}:${sourceRow * frameHeight},split=${sourceCenters.length}${sourcePatchInputs.map(label => `[${label}]`).join('')}`);
}

for (let frame = 0; frame < frameCount; frame += 1) {
  for (let patch = 0; patch < sourceCenters.length; patch += 1) {
    const sourceFrame = (frame + frameOffsets[patch] + frameCount) % frameCount;
    const [sourceX, sourceY] = sourceCenters[patch];
    const [sourceWidth, sourceHeight] = sourceSizes[patch];
    const [targetWidth, targetHeight] = targetSizes[patch];
    const patchLabel = `patch${frame}_${patch}`;
    const cropX = Math.round(sourceX * frameWidth - sourceWidth / 2);
    const cropY = Math.round(sourceY * frameHeight - sourceHeight / 2);
    filters.push(`[source${sourceFrame}patch${patch}in]crop=${sourceWidth}:${sourceHeight}:${cropX}:${cropY},scale=${targetWidth}:${targetHeight}:flags=lanczos[${patchLabel}]`);
    patchLabels.push({ frame, patch, label: patchLabel });
  }
}

let previous = 'base';
patchLabels.forEach(({ frame, patch, label }, index) => {
  const frameColumn = frame % columns;
  const frameRow = Math.floor(frame / columns);
  const [targetX, targetY] = targetCenters[patch];
  const [targetWidth, targetHeight] = targetSizes[patch];
  const x = Math.round(frameColumn * frameWidth + targetX * frameWidth - targetWidth / 2);
  const y = Math.round(frameRow * frameHeight + targetY * frameHeight - targetHeight / 2);
  const next = index === patchLabels.length - 1 ? 'out' : `overlay${index}`;
  filters.push(`[${previous}][${label}]overlay=${x}:${y}:format=auto[${next}]`);
  previous = next;
});

const result = spawnSync('ffmpeg', [
  '-y',
  '-i', inputPath,
  '-filter_complex', filters.join(';'),
  '-map', '[out]',
  '-frames:v', '1',
  outputPath,
], { stdio: 'inherit' });

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`ffmpeg exited with status ${result.status}.`);

console.log(JSON.stringify({
  inputPath,
  outputPath,
  frameCount,
  patchesPerFrame: sourceCenters.length,
  sourceSizes,
  targetSizes,
  frameOffsets,
}, null, 2));
