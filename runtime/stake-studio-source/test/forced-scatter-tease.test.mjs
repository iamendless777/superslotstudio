import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGameProject } from '../src/engines/schema.js';
import { MathEngine } from '../src/engines/math/MathEngine.js';
import {
  anticipationFromBoard,
  compileSpinBook,
} from '../src/engines/math/StakeRoundBook.js';
import { waitingReelsFromBoard } from '../src/engines/presentation/PresentationDirector.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../public/motion-fixtures');

function teaseProject() {
  const project = createGameProject({ name: 'Tease Board' });
  project.math.gameType = 'ways';
  project.math.grid = { reels: 6, rows: [4, 4, 4, 4, 4, 4] };
  project.math.specialSymbols = { wild: ['W'], scatter: ['S'] };
  project.math.featureArchitecture = {
    tiers: {
      3: { id: 'veil_ascent', name: 'Veil Ascent' },
      4: { id: 'lucid_blessing', name: 'Lucid Blessing' },
      5: { id: 'dreamfall', name: 'Dreamfall' },
      6: { id: 'oneiric_nexus', name: 'Oneiric Nexus' },
    },
  };
  project.math.wincapRtp = 0;
  project.math.maxWinHitRate = 0;
  project.math.betModes = [{
    name: 'base', cost: 1, rtp: 0.96, maxWin: 5000,
    profile: { entry: 'base', triggerFreeSpins: false },
  }];
  project.math.bonusMechanics = [];
  return project;
}

function scatterReels(board, scatter = 'S') {
  return board.map((column, reel) => (
    (column || []).some((symbol) => symbol === scatter) ? reel : null
  )).filter((reel) => reel != null);
}

test('Play Motion scatter-tease fixtures seed 2/3/5 doors on the first reels', () => {
  const two = JSON.parse(readFileSync(join(fixtures, 'scatter-tease.json'), 'utf8'));
  const three = JSON.parse(readFileSync(join(fixtures, 'scatter-tease-3.json'), 'utf8'));
  const five = JSON.parse(readFileSync(join(fixtures, 'scatter-tease-5.json'), 'utf8'));
  assert.equal(two.seedScatterCount, 2);
  assert.equal(three.seedScatterCount, 3);
  assert.equal(five.seedScatterCount, 5);
});

test('live forceScatterCount=2 compiles the same waiting-reel book as Play Motion', () => {
  const project = teaseProject();
  const engine = new MathEngine(project);
  const round = engine.resolveRound(() => 0.5, 'base', { forceScatterCount: 2, includeAllocatedMax: false });
  const board = round.spins[0].sourceBoard || round.spins[0].board;
  assert.deepEqual(scatterReels(board), [0, 1]);
  assert.deepEqual(
    waitingReelsFromBoard(board, { isScatter: (symbol) => symbol === 'S' }),
    [false, false, true, true, true, true],
  );
  const reveal = (round.spins[0].state || []).find((event) => event.type === 'reveal');
  assert.deepEqual(reveal.anticipation, [false, false, true, true, true, true]);
  assert.deepEqual(
    anticipationFromBoard(board, { scatterSymbols: ['S'], thresholds: [3, 4, 5, 6] }),
    [false, false, true, true, true, true],
  );
});

test('live forceScatterCount=3 keeps leftover reels waiting for 4+', () => {
  const project = teaseProject();
  const engine = new MathEngine(project);
  const spin = engine.resolveSpin(() => 0.5, 'basegame', { forceScatterCount: 3 });
  assert.deepEqual(scatterReels(spin.sourceBoard), [0, 1, 2]);
  assert.deepEqual(
    waitingReelsFromBoard(spin.sourceBoard, { isScatter: (symbol) => symbol === 'S' }),
    [false, false, true, true, true, true],
  );
  const reveal = compileSpinBook(spin, engine.spinBookOptions()).find((event) => event.type === 'reveal');
  assert.deepEqual(reveal.anticipation, [false, false, true, true, true, true]);
});

test('live forceScatterCount=5 holds the last reel for scatter 6', () => {
  const project = teaseProject();
  const engine = new MathEngine(project);
  const spin = engine.resolveSpin(() => 0.5, 'basegame', { forceScatterCount: 5 });
  assert.deepEqual(scatterReels(spin.sourceBoard), [0, 1, 2, 3, 4]);
  assert.equal(scatterReels(spin.sourceBoard).includes(5), false);
  const waiting = waitingReelsFromBoard(spin.sourceBoard, { isScatter: (symbol) => symbol === 'S' });
  assert.equal(waiting[5], true);
  assert.deepEqual(waiting, [false, false, true, true, true, true]);
});
