import { SeededRNG } from '../../math/SeededRNG.js';

export const DREAMFALL_MATH_SPIKE_FORMAT = 'stake-studio-dreamfall-math-spike-v1';
export const DREAMFALL_REPLAY_FORMAT = 'stake-studio-dreamfall-replay-proof-v1';

const BOOK_AMOUNT_MULTIPLIER = 100;

const clone = value => JSON.parse(JSON.stringify(value));
const symbolName = symbol => typeof symbol === 'string' ? symbol : symbol?.name;
const serializeBoard = board => board.map(reel => reel.map(symbol => ({ name: symbolName(symbol) })));
const deserializeBoard = board => board.map(reel => reel.map(symbolName));
const serializePosition = ([reel, row]) => ({ reel, row });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeRows(rows, reels, minimumRows, maximumRows) {
  const values = Array.isArray(rows) ? rows.map(Number) : Array(reels).fill(Number(rows));
  assert(values.length === reels, `Expected ${reels} reel heights, received ${values.length}.`);
  for (const rowsOnReel of values) {
    assert(Number.isSafeInteger(rowsOnReel), 'Reel heights must be integers.');
    assert(rowsOnReel >= minimumRows && rowsOnReel <= maximumRows,
      `Reel height ${rowsOnReel} is outside ${minimumRows}-${maximumRows}.`);
  }
  return values;
}

function allowedRefillPool(refillPool, scatterSymbol) {
  const pool = [...new Set((refillPool || []).map(symbolName).filter(Boolean))]
    .filter(name => name !== scatterSymbol);
  assert(pool.length > 0, 'Dreamfall refill requires at least one non-scatter symbol.');
  return pool;
}

function pushEvent(events, event) {
  events.push({ index: events.length, ...event });
}

function assertBoardRows(board, rows, minimumRows, maximumRows, context) {
  assert(board.length === rows.length, `${context}: reel count changed.`);
  for (let reel = 0; reel < board.length; reel++) {
    assert(board[reel].length === rows[reel],
      `${context}: reel ${reel} has ${board[reel].length} symbols but state declares ${rows[reel]}.`);
    assert(rows[reel] >= minimumRows && rows[reel] <= maximumRows,
      `${context}: reel ${reel} escaped ${minimumRows}-${maximumRows}.`);
  }
}

/**
 * Apply Stake's reel-major tumbleBoard contract: remove exploding cells, then
 * prepend the event's incoming symbols. This mirrors math-sdk tumble.py.
 */
export function applyDreamfallTumble(board, event) {
  const removed = new Set((event.explodingSymbols || [])
    .map(position => `${Number(position.reel)},${Number(position.row)}`));
  return board.map((reel, reelIndex) => {
    const survivors = reel.filter((_, row) => !removed.has(`${reelIndex},${row}`));
    const incoming = (event.newSymbols?.[reelIndex] || []).map(symbolName);
    return [...incoming, ...survivors];
  });
}

/** Replay and validate the isolated Dreamfall protocol without using production mechanics. */
export function replayDreamfallSpike(events, options = {}) {
  const reels = Math.max(1, Number(options.reels) || 6);
  const minimumRows = Math.max(1, Number(options.minimumRows) || 4);
  const maximumRows = Math.max(minimumRows, Number(options.maximumRows) || 8);
  const scatterSymbol = symbolName(options.scatterSymbol) || 'GATE_OF_SLEEP';
  let board = [];
  let rows = normalizeRows(options.initialRows || minimumRows, reels, minimumRows, maximumRows);
  let awardedFreeSpins = 0;
  let lastChainHit = 0;
  const rowHistory = [clone(rows)];
  const violations = [];

  const check = (condition, message) => {
    if (!condition) violations.push(message);
  };

  for (let position = 0; position < events.length; position++) {
    const event = events[position];
    check(Number(event.index) === position, `Event ${position} has non-sequential index ${event.index}.`);

    if (event.type === 'reveal') {
      board = deserializeBoard(event.board || []);
      check(board.flat().every(name => name !== scatterSymbol), 'Dreamfall reveal contains a scatter.');
    } else if (event.type === 'tumbleChainProgress') {
      check(Number(event.chainHit) === lastChainHit + 1,
        `Tumble chain advanced from ${lastChainHit} to ${event.chainHit}.`);
      lastChainHit = Number(event.chainHit);
    } else if (event.type === 'awardTumbleFreeSpins') {
      check(Number(event.chainHit) >= 5, `Free spin awarded before the fifth tumble hit (${event.chainHit}).`);
      check(Number(event.amount) === 1, `Tumble award must be exactly +1, received ${event.amount}.`);
      awardedFreeSpins += Number(event.amount) || 0;
      check(Number(event.totalAwarded) === awardedFreeSpins,
        `Award total ${event.totalAwarded} does not equal replay total ${awardedFreeSpins}.`);
    } else if (event.type === 'expandReelHeight') {
      const reel = Number(event.reel);
      check(Number.isSafeInteger(reel) && reel >= 0 && reel < rows.length, `Invalid expansion reel ${event.reel}.`);
      if (Number.isSafeInteger(reel) && reel >= 0 && reel < rows.length) {
        check(Number(event.previousRows) === rows[reel],
          `Reel ${reel} expansion expected previousRows ${rows[reel]}, received ${event.previousRows}.`);
        check(Number(event.rows) === rows[reel] + 1,
          `Reel ${reel} must grow by one row, received ${rows[reel]}→${event.rows}.`);
        check(Number(event.maximumRows) === maximumRows,
          `Expansion maximum ${event.maximumRows} does not equal ${maximumRows}.`);
        check(Number(event.rows) <= maximumRows, `Reel ${reel} expanded past ${maximumRows}.`);
        const incoming = symbolName(event.newSymbol);
        check(Boolean(incoming), `Reel ${reel} expansion omitted its authoritative new symbol.`);
        check(incoming !== scatterSymbol, `Reel ${reel} expansion inserted forbidden scatter ${scatterSymbol}.`);
        if (incoming) board[reel].unshift(incoming);
        rows[reel] = Number(event.rows);
        rowHistory.push(clone(rows));
      }
    } else if (event.type === 'tumbleBoard') {
      const incoming = (event.newSymbols || []).flat().map(symbolName);
      check(incoming.every(name => name !== scatterSymbol), 'Dreamfall tumble refill contains a scatter.');
      board = applyDreamfallTumble(board, event);
    }

    if (board.length) {
      try {
        assertBoardRows(board, rows, minimumRows, maximumRows, `After ${event.type}`);
      } catch (error) {
        violations.push(error.message);
      }
    }
  }

  return {
    format: DREAMFALL_REPLAY_FORMAT,
    passed: violations.length === 0,
    violations,
    finalBoard: serializeBoard(board),
    reelRows: rows,
    rowHistory,
    tumbleHits: lastChainHit,
    awardedFreeSpins,
    eventDigest: hashText(JSON.stringify(events)),
  };
}

/**
 * Generate a deterministic, official-book-shaped feasibility proof. It models
 * only the risky Dreamfall invariants and intentionally does not mutate or call
 * production mechanic code.
 */
export function runDreamfallMathSpike(options = {}) {
  const seed = Number.isSafeInteger(Number(options.seed)) ? Number(options.seed) : 0xD43AF411;
  const reels = Math.max(1, Math.floor(Number(options.reels) || 6));
  const minimumRows = Math.max(1, Math.floor(Number(options.minimumRows) || 4));
  const maximumRows = Math.max(minimumRows, Math.floor(Number(options.maximumRows) || 8));
  const initialRows = normalizeRows(options.initialRows || minimumRows, reels, minimumRows, maximumRows);
  const tumbleHits = Math.max(0, Math.floor(Number(options.tumbleHits) || 0));
  const scatterSymbol = symbolName(options.scatterSymbol) || 'GATE_OF_SLEEP';
  const pool = allowedRefillPool(options.refillPool || ['MORPHEUS', 'NYX', 'OWL', 'POPPY'], scatterSymbol);
  const rng = new SeededRNG(seed);
  const rows = clone(initialRows);
  let board = rows.map((count, reel) => Array.from({ length: count }, (_, row) => `DREAM_${reel}_${row}`));
  const events = [];
  let runningWin = 0;
  let totalAwarded = 0;

  pushEvent(events, {
    type: 'reveal',
    board: serializeBoard(board),
    paddingPositions: [],
    gameType: 'freegame',
    anticipation: Array(reels).fill(0),
  });

  for (let chainHit = 1; chainHit <= tumbleHits; chainHit++) {
    const contributing = Array.from({ length: Math.min(3, reels) }, (_, reel) => [reel, board[reel].length - 1]);
    runningWin += 0.1;
    pushEvent(events, {
      type: 'winInfo',
      totalWin: Math.round(0.1 * BOOK_AMOUNT_MULTIPLIER),
      wins: [{
        symbol: 'DREAM_PROOF',
        kind: contributing.length,
        win: Math.round(0.1 * BOOK_AMOUNT_MULTIPLIER),
        positions: contributing.map(serializePosition),
        meta: { ways: 1, multiplier: 1, winWithoutMult: 10, globalMult: 1 },
      }],
    });
    pushEvent(events, { type: 'updateTumbleWin', amount: Math.round(runningWin * BOOK_AMOUNT_MULTIPLIER) });
    pushEvent(events, { type: 'tumbleChainProgress', chainHit, threshold: 5 });

    if (chainHit >= 5) {
      totalAwarded += 1;
      pushEvent(events, {
        type: 'awardTumbleFreeSpins',
        chainHit,
        amount: 1,
        totalAwarded,
      });
    }

    const eligible = rows.map((count, reel) => ({ count, reel })).filter(item => item.count < maximumRows);
    if (eligible.length) {
      const selected = eligible[rng.randInt(0, eligible.length - 1)];
      const previousRows = rows[selected.reel];
      const newSymbol = rng.pick(pool);
      board[selected.reel].unshift(newSymbol);
      rows[selected.reel] += 1;
      pushEvent(events, {
        type: 'expandReelHeight',
        reel: selected.reel,
        previousRows,
        rows: rows[selected.reel],
        maximumRows,
        newSymbol: { name: newSymbol },
      });
    }

    const explodingSymbols = contributing.map(serializePosition);
    const newSymbols = Array.from({ length: reels }, () => []);
    for (const [reel] of contributing) newSymbols[reel].push({ name: rng.pick(pool) });
    const tumbleEvent = { type: 'tumbleBoard', newSymbols, explodingSymbols };
    board = applyDreamfallTumble(board, tumbleEvent);
    pushEvent(events, tumbleEvent);
  }

  if (runningWin > 0) pushEvent(events, {
    type: 'setWin',
    amount: Math.round(runningWin * BOOK_AMOUNT_MULTIPLIER),
    winLevel: 1,
  });
  pushEvent(events, { type: 'finalWin', amount: Math.round(runningWin * BOOK_AMOUNT_MULTIPLIER) });

  const book = {
    id: seed,
    payoutMultiplier: Math.round(runningWin * BOOK_AMOUNT_MULTIPLIER),
    events,
    criteria: 'freegame',
    baseGameWins: 0,
    freeGameWins: Number(runningWin.toFixed(10)),
  };
  const replay = replayDreamfallSpike(events, {
    reels,
    minimumRows,
    maximumRows,
    initialRows,
    scatterSymbol,
  });
  const secondReplay = replayDreamfallSpike(clone(events), {
    reels,
    minimumRows,
    maximumRows,
    initialRows,
    scatterSymbol,
  });
  const generatedFinalBoard = serializeBoard(board);
  const deterministicReplayEqual = JSON.stringify(replay) === JSON.stringify(secondReplay)
    && JSON.stringify(replay.finalBoard) === JSON.stringify(generatedFinalBoard);
  const reachedMaximum = rows.every(value => value === maximumRows);
  const expectedAwards = Math.max(0, tumbleHits - 4);
  const passed = replay.passed
    && deterministicReplayEqual
    && replay.awardedFreeSpins === expectedAwards
    && rows.every(value => value >= minimumRows && value <= maximumRows);

  return {
    format: DREAMFALL_MATH_SPIKE_FORMAT,
    seed,
    passed,
    book,
    proof: {
      initialRows,
      finalRows: rows,
      maximumRows,
      reachedMaximum,
      scatterFreeRefill: replay.violations.every(message => !message.includes('scatter')),
      tumbleHits,
      expectedAwards,
      awardedFreeSpins: replay.awardedFreeSpins,
      deterministicReplayEqual,
      eventDigest: replay.eventDigest,
      violations: replay.violations,
    },
  };
}
