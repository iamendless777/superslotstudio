import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGameProject } from '../src/engines/schema.js';
import {
  buildLiveBoardArtBrief,
  slimBoardArtBrief,
} from '../src/engines/assets/BoardArtBrief.js';
import {
  MORPHEUS_BOARD_PACK,
  MORPHEUS_WORLD_PACK,
  applyBoardSymbolPack,
  applyMorpheusWorldPack,
  ensureMorpheusSpecials,
} from '../src/engines/assets/BoardSymbolPack.js';

test('ways board brief is the loaded project, not cluster-hex gems', () => {
  const project = createGameProject({ id: 'morpheus', name: 'Morpheus' });
  project.math.gameType = 'ways';
  project.math.grid = { reels: 6, rows: [4, 4, 4, 4, 4, 4] };
  project.theme.symbols = [
    { id: 'H1', name: 'H1', src: '', special: [] },
    { id: 'L1', name: 'L1', src: 'art/l1.png', special: [] },
    { id: 'W', name: 'W', src: '', special: ['wild'] },
    { id: 'S', name: 'Gate of Sleep', src: '', special: ['scatter'] },
  ];
  const brief = buildLiveBoardArtBrief(project);
  assert.equal(brief.gameId, 'morpheus');
  assert.equal(brief.winType, 'ways');
  assert.equal(brief.grid, '6x4');
  assert.equal(brief.recipe, 'board');
  assert.match(brief.motion, /Adjacent-ways/);
  assert.match(brief.note, /cluster-hex/);
  assert.deepEqual(brief.slots.map((slot) => slot.label), ['H1', 'L1', 'W', 'Gate of Sleep']);
  assert.equal(brief.slots[0].role, 'high');
  assert.equal(brief.slots[2].role, 'wild');
  assert.equal(brief.slots[3].role, 'scatter');
  assert.equal(brief.slots.find((slot) => slot.label === 'L1').status, 'assigned');
  assert.equal(brief.missingCount, 3);
  assert.equal(brief.slots.some((slot) => /ruby|sapphire|cluster-hex/i.test(slot.label)), false);
  const slim = slimBoardArtBrief(brief);
  assert.equal(slim.slots[0].hasArt, false);
  assert.equal(slim.slots[1].hasArt, true);
});

test('Morpheus board pack refuses to stamp starter tiles onto an authored game', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const packDir = join(here, '../public/symbol-pack/morpheus');
  assert.equal(existsSync(packDir), false);
  const project = createGameProject({ id: 'morpheus', name: 'Morpheus' });
  project.theme.symbols = [
    { id: 'H1', name: 'H1', src: '', special: [] },
    { id: 'S', name: 'Gate of Sleep', src: '', special: ['scatter'] },
    { id: 'W', name: 'W', src: 'keep-me.png', special: ['wild'] },
  ];
  const first = applyBoardSymbolPack(project);
  assert.equal(first.filled, 0);
  assert.equal(first.refused, true);
  assert.equal(project.theme.symbols[2].src, 'keep-me.png');
});

test('Morpheus world pack refuses to inject a starter cabinet over authored art', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const packDir = join(here, '../public/symbol-pack/morpheus');
  assert.equal(existsSync(join(packDir, 'background.jpg')), false);
  assert.equal(existsSync(join(packDir, 'cabinet-frame.png')), false);
  assert.equal(existsSync(join(packDir, 'character.png')), false);
  const project = createGameProject({ id: 'morpheus', name: 'Morpheus' });
  const first = applyMorpheusWorldPack(project);
  assert.equal(first.filled, 0);
  assert.equal(first.refused, true);
});

test('Morpheus specials fill Forge-mapped tiles without clobbering pays', () => {
  const project = createGameProject({ id: 'morpheus', name: 'Morpheus' });
  project.theme.symbols = [
    { id: 'H1', name: 'H1', src: 'keep-h1.png', special: [] },
  ];
  const first = ensureMorpheusSpecials(project);
  assert.equal(first.added, 9);
  assert.equal(project.theme.symbols[0].src, 'keep-h1.png');
  assert.equal(project.theme.symbols.find((symbol) => symbol.id === 'VEIL_WILD').src, '');
  const second = ensureMorpheusSpecials(project);
  assert.equal(second.added, 0);
});

test('Forge specials land on Morpheus strips and Golden Rift is 3×3', () => {
  const project = createGameProject({ id: 'morpheus', name: 'Morpheus' });
  project.theme.symbols = [{ id: 'H1', name: 'H1', src: '', special: [] }];
  project.math.reelStrips = {
    BR: [
      ['H1', 'H1', 'H1', 'H1'],
      ['H1', 'H1', 'H1', 'H1'],
      ['H1', 'H1', 'H1', 'H1'],
      ['H1', 'H1', 'H1', 'H1'],
      ['H1', 'H1', 'H1', 'H1'],
      ['H1', 'H1', 'H1', 'H1'],
    ],
  };
  const first = ensureMorpheusSpecials(project);
  assert.equal(first.stripFilled > 0, true);
  assert.equal(project.math.reelStrips.BR[0].includes('VEIL_WILD'), true);
  assert.equal(project.math.reelStrips.BR[3].includes('GOLDEN_RIFT'), true);
  assert.equal(project.math.reelStrips.BR.some((reel) => reel.includes('MAX_MORPHEUS')), false);
  assert.equal(project.theme.symbols.find((symbol) => symbol.id === 'GOLDEN_RIFT').special.includes('goldWildBomb'), true);
  assert.equal(project.math.bonusMechanics.includes('expandingWilds'), true);
  assert.equal(project.math.reelStrips.FR.length, 6);
  const second = ensureMorpheusSpecials(project);
  assert.equal(second.stripFilled, 0);
});

