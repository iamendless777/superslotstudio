#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [inputPath, originalAssetDir, optimizedAssetDir, outputPath] = process.argv.slice(2);
if (!inputPath || !originalAssetDir || !optimizedAssetDir || !outputPath) {
  console.error('Usage: optimize-slot-runtime-art.mjs <project.json> <original-assets> <optimized-assets> <output.json>');
  process.exit(2);
}

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const project = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const originalFiles = fs.readdirSync(originalAssetDir).filter(name => /\.png$/i.test(name));
const originalByHash = new Map(originalFiles.map(name => {
  const bytes = fs.readFileSync(path.join(originalAssetDir, name));
  return [sha256(bytes), name];
}));

const replacements = new Map();
const runtimeSources = [
  ...(project.theme?.symbols || []).map(symbol => ({ label: symbol.name, source: symbol.src })),
  ...(project.theme?.cabinet?.layers || []).map(layer => ({ label: layer.name || layer.type, source: layer.src })),
];
for (const asset of runtimeSources) {
  const source = String(asset.source || '');
  const comma = source.indexOf(',');
  if (!source.startsWith('data:image/') || comma < 0) continue;
  const originalBytes = Buffer.from(source.slice(comma + 1), 'base64');
  const assetName = originalByHash.get(sha256(originalBytes));
  if (!assetName) throw new Error(`Could not match embedded art for ${asset.label}.`);
  const optimizedPath = path.join(optimizedAssetDir, assetName);
  if (!fs.existsSync(optimizedPath)) throw new Error(`Missing optimized asset ${assetName}.`);
  const optimizedBytes = fs.readFileSync(optimizedPath);
  replacements.set(source, `data:image/png;base64,${optimizedBytes.toString('base64')}`);
}

let replacementCount = 0;
function replaceSources(value) {
  if (typeof value === 'string') {
    const replacement = replacements.get(value);
    if (replacement) replacementCount += 1;
    return replacement || value;
  }
  if (Array.isArray(value)) return value.map(replaceSources);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceSources(child)]));
}

const optimizedProject = replaceSources(project);
optimizedProject.production ||= {};
optimizedProject.production.budgets = {
  targetFps: 60,
  maxInitialBundleMb: 8,
  maxTextureMemoryMb: 96,
  ...(optimizedProject.production.budgets || {}),
};
optimizedProject.production.qa ||= {};
optimizedProject.production.qa.performanceAudit = null;
optimizedProject.production.qa.assetIntegrityAudit = null;

fs.writeFileSync(outputPath, `${JSON.stringify(optimizedProject, null, 2)}\n`);
console.log(JSON.stringify({ assets: replacements.size, replacements: replacementCount, outputBytes: fs.statSync(outputPath).size }));
