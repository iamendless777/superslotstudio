import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectPath = process.argv[2] || (process.env.STAKE_STUDIO_HOME
  ? resolve(process.env.STAKE_STUDIO_HOME, 'games/morpheus_dreamfall/project.json')
  : null);
if (!projectPath) {
  throw new Error('Usage: sync-dreamfall-submission-art.mjs <project.json> (or set STAKE_STUDIO_HOME)');
}
const project = JSON.parse(readFileSync(projectPath, 'utf8'));
const layers = project.theme?.cabinet?.layers || [];
const background = layers.find(layer => layer.assetPackRole === 'background' && layer.src);
const foreground = layers.find(layer => layer.assetPackRole === 'foreground' && layer.src);
if (!background?.src || !foreground?.src) throw new Error('Live cabinet background and foreground sources are required.');
if (background.src === foreground.src) throw new Error('Cabinet background and foreground must remain distinct.');

project.theme ||= {};
project.theme.submission ||= {};
project.theme.submission.background = background.src;
project.theme.submission.foreground = foreground.src;

const temporary = `${projectPath}.${process.pid}.tmp`;
writeFileSync(temporary, JSON.stringify(project, null, 2));
renameSync(temporary, projectPath);
console.log(JSON.stringify({
  projectId: 'morpheus_dreamfall',
  background: background.id || background.name,
  foreground: foreground.id || foreground.name,
  providerLogoPreserved: Boolean(project.theme.submission.providerLogo),
}));
