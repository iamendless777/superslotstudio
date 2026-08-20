#!/usr/bin/env node
/**
 * Seed a 6×4 ways project named Morpheus when the studio home has none.
 * Does not overwrite an existing games/morpheus project (real art stays).
 * Empty symbol.src slots get the board pack so Preview is not letter-tiles.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { persistProjectDocument } from '../server/project-storage.mjs';
import { resolveStudioHome } from '../server/studio-paths.mjs';
import { createGameProject } from '../src/engines/schema.js';
import { ensurePresentationDirector } from '../src/engines/presentation/PresentationDirector.js';
import { applyBoardSymbolPack, applyMorpheusWorldPack, ensureMorpheusSpecials } from '../src/engines/assets/BoardSymbolPack.js';

const root = dirname(fileURLToPath(import.meta.url));
const studioHome = resolveStudioHome(null, { cwd: resolve(root, '..') });
const projectPath = join(studioHome, 'games', 'morpheus', 'project.json');
const scatterName = 'Gate of Sleep';

function fillPack(project, { overwrite = false } = {}) {
  const specials = ensureMorpheusSpecials(project, { overwrite });
  const symbols = applyBoardSymbolPack(project, { overwrite });
  const world = applyMorpheusWorldPack(project, { overwrite });
  if (specials.added) console.log(`[seed] added ${specials.added} specials`);
  if (symbols.filled) console.log(`[seed] applied board pack to ${symbols.filled} empty slots`);
  if (world.filled) console.log(`[seed] applied world pack (${world.filled})`);
  return { filled: specials.added + specials.filled + symbols.filled + world.filled };
}

if (existsSync(projectPath)) {
  const project = JSON.parse(readFileSync(projectPath, 'utf8'));
  if (fillPack(project).filled) persistProjectDocument(projectPath, project);
  console.log(`[seed] keep existing ${projectPath}`);
  process.exit(0);
}

const project = createGameProject({
  id: 'morpheus',
  name: 'Morpheus',
  theme: {
    style: 'cinematic',
    lore: 'Waylanders Forge clone with new art. Scatter count is the feature.',
    symbols: [
      { id: 'H1', name: 'H1', tier: 'high', src: '', payouts: { 3: 1.00, 4: 4.00, 5: 20.00, 6: 40.00 }, special: [] },
      { id: 'H2', name: 'H2', tier: 'high', src: '', payouts: { 3: 0.80, 4: 3.00, 5: 15.00, 6: 30.00 }, special: [] },
      { id: 'M1', name: 'M1', tier: 'medium', src: '', payouts: { 3: 0.30, 4: 1.20, 5: 7.00, 6: 14.00 }, special: [] },
      { id: 'M2', name: 'M2', tier: 'medium', src: '', payouts: { 3: 0.25, 4: 1.00, 5: 5.00, 6: 10.00 }, special: [] },
      { id: 'L1', name: 'L1', tier: 'low', src: '', payouts: { 3: 0.12, 4: 0.40, 5: 2.00, 6: 4.00 }, special: [] },
      { id: 'L2', name: 'L2', tier: 'low', src: '', payouts: { 3: 0.10, 4: 0.30, 5: 1.20, 6: 2.40 }, special: [] },
      { id: 'L3', name: 'L3', tier: 'low', src: '', payouts: { 3: 0.04, 4: 0.20, 5: 0.80, 6: 1.60 }, special: [] },
      { id: 'W', name: 'W', tier: 'special', src: '', payouts: {}, special: ['wild'] },
      { id: 'S', name: scatterName, tier: 'special', src: '', payouts: {}, special: ['scatter'] },
    ],
  },
  math: {
    gameType: 'ways',
    grid: { reels: 6, rows: [4, 4, 4, 4, 4, 4] },
    rtp: 0.96,
    wincap: 100000,
    wincapRtp: 0,
    maxWinHitRate: 0,
    volatility: 'high',
    specialSymbols: { wild: ['W'], scatter: [scatterName] },
    bonusMechanics: ['cascades'],
    mechanicConfig: { cascades: { maxCascades: 8 } },
    freespinTriggers: { basegame: { 3: 8, 4: 10, 5: 12, 6: 15 }, freegame: { 3: 2, 4: 3, 5: 4 } },
    featureArchitecture: {
      tiers: {
        3: { id: 'veil_ascent', name: 'Veil Ascent' },
        4: { id: 'lucid_blessing', name: 'Lucid Blessing' },
        5: { id: 'dreamfall', name: 'Dreamfall' },
        6: { id: 'oneiric_nexus', name: 'Oneiric Nexus' },
      },
    },
    betModes: [{
      name: 'base', cost: 1, rtp: 0.96, maxWin: 100000,
      autoCloseDisabled: false, isFeature: true, isBuyBonus: false, distributions: [],
      profile: { entry: 'base', reelSet: 'BR', triggerFreeSpins: true },
    }],
  },
});
ensurePresentationDirector(project);
project.build ||= {};
project.build.stakeEngine = { ...(project.build.stakeEngine || {}), gameId: 'morpheus' };
fillPack(project, { overwrite: true });

mkdirSync(dirname(projectPath), { recursive: true });
persistProjectDocument(projectPath, project);
console.log(`[seed] wrote ${projectPath}`);
