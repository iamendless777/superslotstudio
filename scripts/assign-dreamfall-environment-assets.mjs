#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const [projectPath, assetRoot, outputPath = projectPath] = process.argv.slice(2);
if (!projectPath || !assetRoot) {
  throw new Error('Usage: assign-dreamfall-environment-assets.mjs <project.json> <asset-dir> [output.json]');
}

const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
const dataUrl = file => `data:image/png;base64,${fs.readFileSync(path.join(assetRoot, file)).toString('base64')}`;

project.theme ||= {};
project.theme.environmentAssets = {
  ...(project.theme.environmentAssets || {}),
  floraLeft: {
    src: dataUrl('dreamfall-foreground-flora-left-runtime-v1.png'),
    x: 0,
    y: 445,
    width: 420,
    height: 385,
  },
  floraRight: {
    src: dataUrl('dreamfall-foreground-flora-runtime-v1.png'),
    x: 842,
    y: 408,
    width: 438,
    height: 400,
  },
  crownSigil: {
    src: dataUrl('dreamfall-crown-sigil-runtime-v1.png'),
    x: 550,
    y: -8,
    width: 180,
    height: 112,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(project, null, 2)}\n`);

console.log(JSON.stringify({
  outputPath,
  assets: Object.keys(project.theme.environmentAssets),
}, null, 2));
