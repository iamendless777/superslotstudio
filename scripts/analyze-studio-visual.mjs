#!/usr/bin/env node

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const studioSource = resolve(process.env.STAKE_STUDIO_SOURCE || resolve(repositoryRoot, 'runtime/stake-studio-source'));
const studioUrl = (process.env.STAKE_STUDIO_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

const [projectPath, imagePath, slot = 'symbol', outputPath] = process.argv.slice(2);
if (!projectPath || !imagePath || !outputPath) {
  throw new Error('Usage: analyze-studio-visual.mjs <project.json> <image.png> <slot> <analysis.json>');
}

const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
const image = `data:image/png;base64,${fs.readFileSync(imagePath).toString('base64')}`;
const analysisInput = {
  image,
  slot,
  palette: project.visualFactory?.artBible?.palette || (project.theme?.colorPalette || []).join(', '),
  references: [],
};
const response = await fetch(`${studioUrl}/__stake_studio/visual/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(analysisInput),
});
let payload = await response.json();
if (!response.ok) {
  const scriptPath = resolve(studioSource, 'server/analyze-visual-asset.py');
  const projectPython = resolve(repositoryRoot, 'reference/math-sdk/env/bin/python');
  const python = fs.existsSync(projectPython) ? projectPython : 'python3';
  payload = {
    analysis: JSON.parse(execFileSync(python, [scriptPath], {
      input: JSON.stringify(analysisInput),
      encoding: 'utf8',
      maxBuffer: 40 * 1024 * 1024,
    })),
  };
}
fs.writeFileSync(outputPath, `${JSON.stringify(payload.analysis, null, 2)}\n`);
console.log(JSON.stringify({ passed: payload.analysis.passed, score: payload.analysis.score, blockers: payload.analysis.blockers, warnings: payload.analysis.warnings }, null, 2));
