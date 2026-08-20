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

test('Morpheus board pack fills empty ways slots and leaves real art', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const packDir = join(here, '../public/symbol-pack/morpheus');
  for (const file of ['h1.png', 'h2.png', 'm1.png', 'm2.png', 'l1.png', 'l2.png', 'l3.png', 'wild.png', 'scatter.png']) {
    assert.equal(existsSync(join(packDir, file)), true, file);
  }
  const project = createGameProject({ id: 'morpheus', name: 'Morpheus' });
  project.theme.symbols = [
    { id: 'H1', name: 'H1', src: '', special: [] },
    { id: 'S', name: 'Gate of Sleep', src: '', special: ['scatter'] },
    { id: 'W', name: 'W', src: 'keep-me.png', special: ['wild'] },
  ];
  const first = applyBoardSymbolPack(project);
  assert.equal(first.filled, 2);
  assert.equal(project.theme.symbols[0].src, MORPHEUS_BOARD_PACK.H1);
  assert.equal(project.theme.symbols[1].src, MORPHEUS_BOARD_PACK['Gate of Sleep']);
  assert.equal(project.theme.symbols[2].src, 'keep-me.png');
  const second = applyBoardSymbolPack(project);
  assert.equal(second.filled, 0);
});

test('Morpheus world pack lays background, reel frame, and character', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const packDir = join(here, '../public/symbol-pack/morpheus');
  for (const file of ['background.jpg', 'cabinet-frame.png', 'character.png']) {
    assert.equal(existsSync(join(packDir, file)), true, file);
  }
  const project = createGameProject({ id: 'morpheus', name: 'Morpheus' });
  const first = applyMorpheusWorldPack(project);
  assert.ok(first.filled >= 3);
  const roles = project.theme.cabinet.layers.map((layer) => layer.assetPackRole || layer.type);
  assert.equal(roles.includes('background'), true);
  assert.equal(roles.includes('foreground'), true);
  assert.equal(roles.includes('reel-area'), true);
  assert.equal(project.theme.character.poses.idle, MORPHEUS_WORLD_PACK.character);
  const bg = project.theme.cabinet.layers.find((layer) => layer.assetPackRole === 'background');
  const frame = project.theme.cabinet.layers.find((layer) => layer.assetPackRole === 'foreground');
  assert.equal(bg.src, MORPHEUS_WORLD_PACK.background);
  assert.equal(frame.src, MORPHEUS_WORLD_PACK.foreground);
  const second = applyMorpheusWorldPack(project);
  assert.equal(second.filled, 0);
});

test('Morpheus specials fill Forge-mapped tiles without clobbering pays', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const packDir = join(here, '../public/symbol-pack/morpheus');
  for (const file of ['veil-wild.png', 'lucid-wild.png', 'dream-rift.png', 'golden-rift.png', 'echo-split.png', 'dawn-purge.png', 'oneiric-star.png', 'mystery-veil.png', 'max-morpheus.png']) {
    assert.equal(existsSync(join(packDir, file)), true, file);
  }
  const project = createGameProject({ id: 'morpheus', name: 'Morpheus' });
  project.theme.symbols = [
    { id: 'H1', name: 'H1', src: 'keep-h1.png', special: [] },
  ];
  const first = ensureMorpheusSpecials(project);
  assert.equal(first.added, 9);
  assert.equal(project.theme.symbols[0].src, 'keep-h1.png');
  assert.equal(project.theme.symbols.find((symbol) => symbol.id === 'VEIL_WILD').src, MORPHEUS_BOARD_PACK.VEIL_WILD);
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

