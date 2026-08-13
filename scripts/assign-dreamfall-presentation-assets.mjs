#!/usr/bin/env node

import fs from 'node:fs';

const [projectPath, modePath, verdictPath, outputPath] = process.argv.slice(2);
if (!projectPath || !modePath || !verdictPath || !outputPath) {
  throw new Error('Usage: assign-dreamfall-presentation-assets.mjs <project.json> <mode.webp> <verdict.webp> <output.json>');
}

const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
const asDataUrl = (path, mime = 'image/webp') => `data:${mime};base64,${fs.readFileSync(path).toString('base64')}`;

const assets = {
  modePortal: { path: modePath, name: 'presentation-mode-portal', width: 1280, height: 800, src: asDataUrl(modePath) },
  verdictPlate: { path: verdictPath, name: 'presentation-verdict-plate', width: 1280, height: 800, src: asDataUrl(verdictPath) },
};

project.theme ||= {};
project.theme.presentationAssets = {
  ...(project.theme.presentationAssets || {}),
  ...Object.fromEntries(Object.entries(assets).map(([key, asset]) => [key, asset.src])),
};
delete project.theme.presentationAssets.connectionOrb;
project.theme.presentationEffects = {
  ...(project.theme.presentationEffects || {}),
  winConnections: {
    type: 'particleTap',
    color: '#62e7ff',
    coreColor: '#ffffff',
    rimColor: '#d6a84b',
    origin: { x: 182, y: 166 },
    launchDuration: 0.42,
    launchHold: 0.08,
    duration: 1,
    persistentMarker: false,
  },
  livingEnergy: {
    enabled: true,
    color: '#55d6f2',
    particleCount: 12,
    points: [
      { x: 182, y: 166, radius: 72, driftY: 150 },
    ],
  },
  announcementEnergy: {
    mode: {
      color: '#55d6f2',
      coreColor: '#ffffff',
      count: 20,
      points: [
        { x: 640, y: 245, radius: 92 },
        { x: 465, y: 430, radius: 46, driftY: -150 },
        { x: 815, y: 430, radius: 46, driftY: -150 },
        { x: 640, y: 690, radius: 72, driftY: -105 },
      ],
    },
    verdict: {
      color: '#55d6f2',
      coreColor: '#ffffff',
      count: 22,
      points: [
        { x: 615, y: 134, radius: 18 },
        { x: 665, y: 134, radius: 18 },
        { x: 352, y: 546, radius: 38, driftY: -130 },
        { x: 928, y: 546, radius: 38, driftY: -130 },
        { x: 640, y: 714, radius: 64, driftY: -90 },
      ],
    },
  },
};

const modePresentation = {
  dream_enhancer: ['DREAM ENHANCER', '3× SCATTER CHANCE'],
  trickster_dream: ['TRICKSTER DREAM', 'ENHANCED SPECIAL SYMBOLS'],
  veil_ascent: ['VEIL ASCENT', '10 FREE SPINS · RETRIGGERS ENABLED'],
  lucid_blessing: ['LUCID BLESSING', '10 FREE SPINS · LUCID POWER AWAKENS'],
  nightmare_descent: ['NIGHTMARE DESCENT', '10 FREE SPINS · PREMIUM DREAM SETUP'],
};
for (const mode of project.math?.betModes || []) {
  const copy = modePresentation[mode.name];
  if (!copy) continue;
  mode.presentation = { kicker: 'FEATURE START', title: copy[0], rule: copy[1] };
}

for (const binding of project.animation?.visualEffects?.bindings || []) {
  if (binding.event === 'winInfo') binding.enabled = false;
}

project.atlas ||= { assets: [], packed: null, padding: 2, maxSize: 2048 };
project.atlas.assets ||= [];
project.atlas.assets = project.atlas.assets.filter(item => item.name !== 'presentation-connection-orb');
for (const asset of Object.values(assets)) {
  const record = { name: asset.name, src: asset.src, width: asset.width, height: asset.height };
  const index = project.atlas.assets.findIndex(item => item.name === asset.name);
  if (index >= 0) project.atlas.assets[index] = record;
  else project.atlas.assets.push(record);
}
project.atlas.packed = null;

project.visualFactory ||= {};
project.visualFactory.history ||= [];
project.visualFactory.assignments ||= {};
delete project.visualFactory.assignments['presentationAsset:connectionOrb'];
project.visualFactory.history = project.visualFactory.history.filter(item => item.assignmentKey !== 'presentationAsset:connectionOrb');
const assignedAt = new Date().toISOString();
for (const [target, asset] of Object.entries(assets)) {
  const assignmentKey = `presentationAsset:${target}`;
  const record = {
    format: 'stake-studio-generated-visual-v1',
    slot: 'presentationAsset',
    target,
    filename: asset.path.split('/').at(-1),
    width: asset.width,
    height: asset.height,
    provider: 'codex-imagegen-built-in',
    model: 'built-in-imagegen',
    qualityProfile: 'production-candidate',
    assignmentKey,
    assignedAt,
  };
  project.visualFactory.assignments[assignmentKey] = record;
  project.visualFactory.history.unshift(record);
}
project.visualFactory.history = project.visualFactory.history.slice(0, 50);

project.production ||= {};
project.production.qa ||= {};
project.production.qa.assetIntegrityVerified = false;
project.production.qa.assetIntegrityAudit = null;
project.production.qa.performanceAudit = null;
project.production.qa.replayMatrix = null;
project.production.qa.viewportLayoutAudit = null;
project.production.qa.presentationPolishAudit = null;
project.production.qa.certificationAudit = null;

fs.writeFileSync(outputPath, `${JSON.stringify(project, null, 2)}\n`);
console.log(JSON.stringify({
  assigned: Object.fromEntries(Object.entries(assets).map(([key, asset]) => [key, `${asset.width}x${asset.height}`])),
  outputBytes: fs.statSync(outputPath).size,
}, null, 2));
