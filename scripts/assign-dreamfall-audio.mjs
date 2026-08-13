#!/usr/bin/env node

import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const studioSource = resolve(process.env.STAKE_STUDIO_SOURCE || resolve(repositoryRoot, 'runtime/stake-studio-source'));
const studioModule = relativePath => import(pathToFileURL(resolve(studioSource, relativePath)).href);
const { generateCoreSfxPack } = await studioModule('src/engines/audio/AudioFactory.js');
const { createProfessionalAudioDirector } = await studioModule('src/engines/audio/AudioDirector.js');
const { generateSoundscapePack } = await studioModule('src/engines/audio/SoundscapeFactory.js');

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  throw new Error('Usage: assign-dreamfall-audio.mjs <project.json> <output.json>');
}

const project = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const soundscape = generateSoundscapePack({
  profile: 'cosmicRitual',
  bpm: 72,
  bars: 4,
  seed: 31817,
  energy: 0.56,
});
const stingers = generateCoreSfxPack({ intensity: 0.68 });

project.audio = {
  ...(project.audio || {}),
  layers: soundscape,
  stingers,
  director: createProfessionalAudioDirector(),
  factory: {
    version: 1,
    generatedAssets: 24,
    lastSource: 'procedural-dreamfall-pack',
    profile: 'cosmicRitual',
    generatedAt: new Date().toISOString(),
  },
};

project.production ||= {};
project.production.audio = {
  source: 'stake-studio-local-factory',
  profile: 'cosmicRitual',
  replaceable: true,
  loudnessNormalized: false,
  synchronizationReviewed: false,
  duckingConfigured: true,
  updatedAt: new Date().toISOString(),
};
project.production.qa ||= {};
project.production.qa.audioMasteringAudit = null;
project.production.qa.certificationAudit = null;

fs.writeFileSync(outputPath, `${JSON.stringify(project, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  profile: 'cosmicRitual',
  bpm: 72,
  layers: Object.keys(soundscape),
  stingerEvents: Object.keys(stingers),
  generatedAssets: 24,
}, null, 2));
