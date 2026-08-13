#!/usr/bin/env node

import fs from 'node:fs';

const [projectPath, symbolName, masterPath, runtimePath, analysisPath, outputPath] = process.argv.slice(2);
if (!projectPath || !symbolName || !masterPath || !runtimePath || !analysisPath || !outputPath) {
  throw new Error('Usage: assign-generated-symbol.mjs <project.json> <symbol> <master.png> <runtime.png> <analysis.json> <output.json>');
}

const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
if (analysis.format !== 'stake-studio-visual-analysis-v1' || analysis.passed !== true) {
  throw new Error('The candidate must pass StakeStudio visual QA before assignment.');
}

const masterBytes = fs.readFileSync(masterPath);
const runtimeBytes = fs.readFileSync(runtimePath);
const pngDimensions = bytes => {
  if (bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error('Expected a PNG asset.');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
const master = pngDimensions(masterBytes);
const runtime = pngDimensions(runtimeBytes);
const runtimeDataUrl = `data:image/png;base64,${runtimeBytes.toString('base64')}`;

const symbol = project.theme?.symbols?.find(item => item.name === symbolName || item.id === symbolName);
if (!symbol) throw new Error(`No symbol target "${symbolName}" exists.`);
symbol.src = runtimeDataUrl;

project.atlas ||= { assets: [], packed: null, padding: 2, maxSize: 2048 };
project.atlas.assets ||= [];
const atlasAsset = { name: symbol.name, src: runtimeDataUrl, width: runtime.width, height: runtime.height };
const atlasIndex = project.atlas.assets.findIndex(asset => asset.name === symbol.name);
if (atlasIndex >= 0) project.atlas.assets[atlasIndex] = atlasAsset;
else project.atlas.assets.push(atlasAsset);
project.atlas.packed = null;

project.visualFactory ||= {};
project.visualFactory.history ||= [];
project.visualFactory.assignments ||= {};
const assignedAt = new Date().toISOString();
const record = {
  format: 'stake-studio-generated-visual-v1',
  slot: 'symbol',
  target: symbol.name,
  filename: masterPath.split('/').at(-1),
  width: master.width,
  height: master.height,
  analysis,
  provider: 'codex-imagegen-built-in',
  model: 'built-in-imagegen',
  qualityProfile: 'production-candidate',
  matteRemoved: true,
  assignmentKey: `symbol:${symbol.name}`,
  assignedAt,
};
project.visualFactory.history = [record, ...project.visualFactory.history].slice(0, 50);
project.visualFactory.assignments[record.assignmentKey] = record;
project.visualFactory.latest = { ...record, dataUrl: runtimeDataUrl };

project.production ||= {};
project.production.qa ||= {};
project.production.qa.visualCohesionAudit = null;
project.production.qa.assetIntegrityVerified = false;
project.production.qa.assetIntegrityAudit = null;
project.production.qa.performanceAudit = null;

fs.writeFileSync(outputPath, `${JSON.stringify(project, null, 2)}\n`);
console.log(JSON.stringify({ symbol: symbol.name, master, runtime, outputBytes: fs.statSync(outputPath).size }));
