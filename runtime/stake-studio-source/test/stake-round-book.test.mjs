import test from 'node:test';
import assert from 'node:assert/strict';

import {
  anticipationFromBoard,
  applyTumbleEvent,
  compileSpinBook,
  deserializeBoard,
} from '../src/engines/math/StakeRoundBook.js';

test('Stake book preserves exact tumble removals, incoming symbols, and final no-win settle', () => {
  const initial = [
    ['A', 'B', 'C'],
    ['A', 'D', 'E'],
    ['A', 'F', 'G'],
  ];
  const settled = [
    ['N1', 'B', 'C'],
    ['N2', 'D', 'E'],
    ['N3', 'F', 'G'],
  ];
  const wins = [{ symbol: 'A', kind: 'ways', payout: 1.2, positions: [[0, 0], [1, 0], [2, 0]] }];
  const spin = {
    board: initial,
    finalBoard: settled,
    totalWin: 1.2,
    steps: [{
      board: initial,
      wins,
      stepWin: 1.2,
      tumble: {
        explodingSymbols: [[0, 0], [1, 0], [2, 0]],
        newSymbols: [['N1'], ['N2'], ['N3']],
      },
    }],
  };

  const state = compileSpinBook(spin, { gameType: 'basegame', wincap: 50_000 });
  assert.deepEqual(state.map(event => event.index), state.map((_, index) => index));
  assert.deepEqual(state.map(event => event.type), [
    'reveal', 'winInfo', 'updateTumbleWin', 'setTotalWin', 'tumbleBoard', 'setWin', 'finalWin',
  ]);
  assert.deepEqual(state[1].wins[0].positions, [
    { reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 },
  ]);
  assert.deepEqual(applyTumbleEvent(initial, state[4]), settled);
  assert.equal(state.at(-1).amount, 120);
});

test('Stake book emits a targeted transform event when a mechanic changes tumble survivors', () => {
  const initial = [['A', 'B'], ['A', 'C']];
  const transformed = [['N1', 'W'], ['N2', 'C']];
  const spin = {
    board: initial,
    finalBoard: transformed,
    totalWin: 0.5,
    steps: [{
      board: initial,
      wins: [{ symbol: 'A', payout: 0.5, positions: [[0, 0], [1, 0]] }],
      stepWin: 0.5,
      tumble: { explodingSymbols: [[0, 0], [1, 0]], newSymbols: [['N1'], ['N2']] },
    }],
  };

  const state = compileSpinBook(spin);
  const transform = state.find(event => event.type === 'boardTransform');
  assert.deepEqual(transform.changes, [{ reel: 0, row: 1, from: 'B', to: 'W' }]);
  assert.deepEqual(deserializeBoard(transform.board), transformed);
});

test('Stake book preserves authored special-symbol and persistent feature events in causal order', () => {
  const sourceBoard = [['BOMB', 'A'], ['A', 'B']];
  const preparedBoard = [['W', 'W'], ['W', 'W']];
  const settledBoard = [['N1', 'W'], ['N2', 'W']];
  const wins = [{ symbol: 'W', kind: 2, payout: 2, positions: [[0, 0], [1, 0]] }];
  const spin = {
    sourceBoard,
    board: preparedBoard,
    finalBoard: settledBoard,
    totalWin: 2,
    steps: [{
      board: preparedBoard,
      wins,
      stepWin: 2,
      modifierEvents: [{
        type: 'wildBomb', source: 'BOMB', size: 2,
        sources: [[0, 0]], positions: [[0, 0], [0, 1], [1, 0], [1, 1]],
        board: preparedBoard,
      }],
      featureEvents: [{
        type: 'positionMultiplierGridUpdate',
        updates: [{ reel: 0, row: 0, previous: 1, multiplier: 2 }],
      }],
      tumble: {
        explodingSymbols: [[0, 0], [1, 0]],
        newSymbols: [['N1'], ['N2']],
      },
    }],
  };

  const state = compileSpinBook(spin, { gameType: 'freegame', wincap: 50_000 });
  assert.deepEqual(state.map(event => event.type), [
    'reveal',
    'wildBomb',
    'boardTransform',
    'winInfo',
    'updateTumbleWin',
    'setTotalWin',
    'positionMultiplierGridUpdate',
    'tumbleBoard',
    'setWin',
    'finalWin',
  ]);
  assert.deepEqual(deserializeBoard(state[0].board), sourceBoard);
  assert.deepEqual(state[1].sources, [{ reel: 0, row: 0 }]);
  assert.deepEqual(state[1].positions[3], { reel: 1, row: 1 });
  assert.deepEqual(deserializeBoard(state[2].board), preparedBoard);
  assert.equal(state[6].updates[0].multiplier, 2);
  assert.deepEqual(state.map(event => event.index), state.map((_, index) => index));
});

test('post-settlement special board transform is explicit and owns the following tumble source', () => {
  const landed = [['MYSTERY', 'B'], ['A', 'C'], ['A', 'D']];
  const reacted = [['A', 'B'], ['A', 'C'], ['A', 'D']];
  const settled = [['N1', 'B'], ['N2', 'C'], ['N3', 'D']];
  const wins = [{ symbol: 'A', payout: 1, positions: [[0, 0], [1, 0], [2, 0]] }];
  const state = compileSpinBook({
    board: landed,
    finalBoard: settled,
    totalWin: 1,
    steps: [{
      board: landed,
      reactionBoard: reacted,
      wins,
      stepWin: 1,
      featureEvents: [{
        type: 'mysteryTransform', sources: [[0, 0]], positions: [[0, 0]],
        target: 'A', board: reacted,
      }],
      tumble: {
        explodingSymbols: [[0, 0], [1, 0], [2, 0]],
        newSymbols: [['N1'], ['N2'], ['N3']],
      },
    }],
  });
  assert.deepEqual(state.map(event => event.type), [
    'reveal', 'winInfo', 'updateTumbleWin', 'setTotalWin', 'mysteryTransform',
    'boardTransform', 'tumbleBoard', 'setWin', 'finalWin',
  ]);
  assert.deepEqual(deserializeBoard(state[5].board), reacted);
  assert.deepEqual(applyTumbleEvent(reacted, state[6]), settled);
});

test('position grid mode starts before the authoritative reveal', () => {
  const board = [['A'], ['A'], ['A']];
  const state = compileSpinBook({
    sourceBoard: board,
    board,
    finalBoard: board,
    totalWin: 0,
    steps: [{
      board,
      wins: [],
      stepWin: 0,
      modifierEvents: [{
        type: 'modeGridStart', mode: 'trickster_dream',
        cells: board.map((_, reel) => ({ position: [reel, 0], value: 1 })),
      }],
    }],
  });
  assert.deepEqual(state.slice(0, 2).map(event => event.type), ['modeGridStart', 'reveal']);
  assert.equal(state[0].mode, 'trickster_dream');
});

test('ordinary capped books never impersonate the governed MAX terminal route', () => {
  const state = compileSpinBook({
    board: [['A'], ['A'], ['A']], finalBoard: [['A'], ['A'], ['A']],
    steps: [{ board: [['A'], ['A'], ['A']], wins: [{ symbol: 'A', payout: 12, positions: [[0, 0], [1, 0], [2, 0]] }], stepWin: 12 }],
    totalWin: 9.9, uncappedWin: 12, wincapHit: true, maxMorpheusHit: false,
  }, { gameType: 'basegame', wincap: 10 });
  assert.equal(state.some(event => event.type === 'maxWinReached' || event.type === 'roundTerminated'), false);
  assert.deepEqual(state.slice(-2).map(event => event.type), ['setWin', 'finalWin']);
  assert.equal(state.at(-1).amount, 990);
});

test('reveal.anticipation marks every reel one scatter away from the next threshold', () => {
  const board = (scatterReels) => Array.from({ length: 6 }, (_, reel) => {
    const column = ['A', 'B', 'C', 'D'];
    if (scatterReels.includes(reel)) column[1] = 'S';
    return column;
  });

  assert.deepEqual(
    anticipationFromBoard(board([0, 1]), { scatterSymbols: ['S'] }),
    [false, false, true, true, true, true],
  );
  assert.deepEqual(
    anticipationFromBoard(board([0, 1, 2, 3, 4]), { scatterSymbols: ['S'] }),
    [false, false, true, true, true, true],
  );
  assert.deepEqual(
    anticipationFromBoard(board([0]), { scatterSymbols: ['S'] }),
    [false, false, false, false, false, false],
  );

  const state = compileSpinBook({
    board: board([0, 1]),
    sourceBoard: board([0, 1]),
    finalBoard: board([0, 1]),
    totalWin: 0,
    steps: [{ board: board([0, 1]), wins: [], stepWin: 0 }],
  }, { scatterSymbols: ['S'], thresholds: [3, 4, 5, 6] });
  const reveal = state.find((event) => event.type === 'reveal');
  assert.deepEqual(reveal.anticipation, [false, false, true, true, true, true]);
});
