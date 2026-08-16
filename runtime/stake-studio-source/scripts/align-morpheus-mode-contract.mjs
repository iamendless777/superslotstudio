import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const [projectPath] = process.argv.slice(2);
if (!projectPath) throw new Error('Usage: node scripts/align-morpheus-mode-contract.mjs <project.json>');

const project = JSON.parse(await readFile(projectPath, 'utf8'));
if (project.name !== 'MORPHEUS: DREAMFALL' || project.build?.stakeEngine?.gameId !== 'morpheus_dreamfall') {
  throw new Error('Refusing to update a project other than MORPHEUS: DREAMFALL.');
}

const rules = {
  dream_enhancer: '3× SCATTER-BOARD SELECTION',
  trickster_dream: '4× SPECIAL-SYMBOL BOARD SELECTION',
  veil_ascent: '10 FREE SPINS · WINS FILL THE SYMBOL-UPGRADE METER',
  lucid_blessing: '10 FREE SPINS · WINNING SYMBOL MULTIPLIERS PERSIST',
  nightmare_descent: '10 FREE SPINS · WINNING POSITIONS CHARGE MULTIPLIERS',
};

for (const mode of project.math?.betModes || []) {
  if (!rules[mode.name]) continue;
  mode.presentation ||= {};
  mode.presentation.rule = rules[mode.name];
}

const temporary = join(dirname(projectPath), `.project.${process.pid}.mode-contract.tmp`);
await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`);
await rename(temporary, projectPath);
console.log(`Aligned ${Object.keys(rules).length} Morpheus mode presentation contracts.`);
