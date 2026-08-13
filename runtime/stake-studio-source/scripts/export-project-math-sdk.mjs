import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { MathSDKExporter } from '../src/engines/build/MathSDKExporter.js';

const [projectPath, outputRoot] = process.argv.slice(2);
if (!projectPath || !outputRoot) {
  throw new Error('Usage: node scripts/export-project-math-sdk.mjs <project.json> <output-root>');
}

const project = JSON.parse(await readFile(resolve(projectPath), 'utf8'));
const root = resolve(outputRoot);
const files = new MathSDKExporter(project).generateFiles();

for (const [relativePath, contents] of Object.entries(files)) {
  const target = resolve(root, relativePath);
  if (!target.startsWith(`${root}${sep}`)) throw new Error(`Unsafe generated path: ${relativePath}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

console.log(`Exported ${Object.keys(files).length} files for ${project.build?.stakeEngine?.gameId || project.name}.`);
