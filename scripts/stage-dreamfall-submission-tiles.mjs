import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const projectPath = process.argv[2];
const outputDirectory = process.argv[3];
if (!projectPath || !outputDirectory) throw new Error('Usage: node stage-dreamfall-submission-tiles.mjs <project.json> <output-directory>');
if (!existsSync(projectPath)) throw new Error(`Project not found: ${projectPath}`);

const project = JSON.parse(readFileSync(projectPath, 'utf8'));
if (project.build?.stakeEngine?.gameId !== 'morpheus_dreamfall' || project.name !== 'MORPHEUS: DREAMFALL') {
  throw new Error(`Refusing to stage tiles for unexpected project: ${project.name || project.id || 'unknown'}`);
}

function decodePng(source, label) {
  const prefix = 'data:image/png;base64,';
  if (!String(source || '').startsWith(prefix)) throw new Error(`${label} is not an embedded PNG asset.`);
  const bytes = Buffer.from(source.slice(prefix.length), 'base64');
  if (bytes.length < 24 || bytes.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error(`${label} has an invalid PNG signature.`);
  return bytes;
}

const background = decodePng(project.theme?.submission?.background, 'Submission background');
const foreground = decodePng(project.theme?.submission?.foreground, 'Submission foreground');
const combinedBytes = background.length + foreground.length;
if (combinedBytes > 3 * 1024 * 1024) throw new Error(`Submission tiles exceed 3 MB: ${combinedBytes} bytes.`);

mkdirSync(outputDirectory, { recursive: true });
const files = [
  { name: 'Morpheus-Dreamfall-BG.png', bytes: background, role: 'background' },
  { name: 'Morpheus-Dreamfall-FG.png', bytes: foreground, role: 'foreground' },
];
for (const file of files) {
  const path = join(outputDirectory, file.name);
  if (existsSync(path)) throw new Error(`Refusing to overwrite existing submission tile: ${path}`);
  writeFileSync(path, file.bytes);
}

const manifest = {
  format: 'morpheus-dreamfall-submission-tiles-v1',
  gameId: 'morpheus_dreamfall',
  gameName: project.name,
  generatedAt: new Date().toISOString(),
  combinedBytes,
  combinedLimitBytes: 3 * 1024 * 1024,
  files: files.map(file => ({
    name: file.name,
    role: file.role,
    bytes: file.bytes.length,
    sha256: createHash('sha256').update(file.bytes).digest('hex'),
  })),
  providerLogo: {
    ready: false,
    reason: 'Provider identity and transparent provider logo are not configured.',
  },
};
writeFileSync(join(outputDirectory, 'tile-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outputDirectory, ...manifest }, null, 2));
