import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  buildLiveBoardArtBrief,
  slimBoardArtBrief,
} from '../src/engines/assets/BoardArtBrief.js';

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
