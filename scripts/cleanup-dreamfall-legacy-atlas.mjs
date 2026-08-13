import { copyFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';

const projectPath = process.argv[2];
const backupPath = process.argv[3];
if (!projectPath || !backupPath) throw new Error('Usage: node cleanup-dreamfall-legacy-atlas.mjs <project.json> <backup.json>');
if (!existsSync(projectPath)) throw new Error(`Project not found: ${projectPath}`);
if (existsSync(backupPath)) throw new Error(`Backup already exists: ${backupPath}`);

const beforeBytes = statSync(projectPath).size;
const project = JSON.parse(readFileSync(projectPath, 'utf8'));
if (project.build?.stakeEngine?.gameId !== 'morpheus_dreamfall' || project.name !== 'MORPHEUS: DREAMFALL') {
  throw new Error(`Refusing to edit unexpected project: ${project.name || project.id || 'unknown'}`);
}
const assets = project.atlas?.assets;
if (!Array.isArray(assets) || assets.length !== 20) throw new Error(`Expected 20 legacy atlas entries, found ${assets?.length ?? 'none'}`);
if (project.atlas?.packed) throw new Error('Refusing to replace an existing packed atlas.');

copyFileSync(projectPath, backupPath);
project.atlas.assets = [];
project.atlas.packed = null;
project.updated = new Date().toISOString();

const temporaryPath = `${projectPath}.${process.pid}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(project, null, 2)}\n`);
renameSync(temporaryPath, projectPath);

console.log(JSON.stringify({
  projectId: project.build.stakeEngine.gameId,
  retiredAtlasEntries: assets.length,
  retainedSymbolAssets: project.theme?.symbols?.length || 0,
  retainedSpineAssets: project.animation?.spineAssets?.length || 0,
  retainedMotionAtlases: project.animation?.visualEffects?.motionAssets?.length || 0,
  beforeBytes,
  afterBytes: statSync(projectPath).size,
  backupPath,
}, null, 2));
