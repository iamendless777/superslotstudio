/**
 * Convert a motion cue sheet into tumbleBoard payloads that playStakeTumble
 * already understands.
 *
 * Cue sheet = timing + which cells explode per cascade depth.
 * Occupancy / gravity = applyTumbleOccupancy (same rules as StakeRoundBook).
 *
 * Fall / refill cell lists are ignored — they were cosmetic in old fixtures.
 * Win pulse / board shake never become setWin / wincap.
 */

const EXPLODE_CUES = new Set(['cluster.remove', 'symbol.pop', 'symbol.fadeOut']);
const REEL_CUES = new Set(['reel.blur', 'reel.stop', 'reel.anticipation']);

export function parseMotionCells(cells) {
  if (!Array.isArray(cells)) return [];
  const out = [];
  const seen = new Set();
  for (const cell of cells) {
    let reel;
    let row;
    if (Array.isArray(cell) && cell.length >= 2) {
      reel = Number(cell[0]);
      row = Number(cell[1]);
    } else if (cell && typeof cell === 'object') {
      reel = Number(cell.reel);
      row = Number(cell.row);
    } else {
      const parts = String(cell).split(/[: ,x×]/).map(Number);
      reel = parts[0];
      row = parts[1];
    }
    if (!Number.isFinite(reel) || !Number.isFinite(row)) continue;
    const key = `${reel},${row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([reel, row]);
  }
  return out;
}

export function symbolName(symbol) {
  return typeof symbol === 'string' ? symbol : symbol?.name;
}

export function cloneBoard(board) {
  return (board || []).map((reel) => (reel || []).map(symbolName));
}

/**
 * Same occupancy rule as StakeRoundBook.applyTumbleEvent:
 * survivors compact, incoming prepended at the top of each reel.
 */
export function applyTumbleOccupancy(board, explodingSymbols, newSymbols) {
  const source = cloneBoard(board);
  const removed = new Set(
    (explodingSymbols || []).map((position) => {
      const [reel, row] = parseMotionCells([position])[0] || [];
      return `${reel},${row}`;
    }),
  );
  return source.map((reel, reelIndex) => {
    const survivors = reel.filter((_, row) => !removed.has(`${reelIndex},${row}`));
    const incoming = (newSymbols?.[reelIndex] || []).map(symbolName);
    return [...incoming, ...survivors];
  });
}

function explodingForDepth(cues) {
  // Reaction (pop) is the identity of the cluster; remove should match.
  const pop = cues.find((cue) => cue.cue === 'symbol.pop');
  const remove = cues.find((cue) => cue.cue === 'cluster.remove' || cue.cue === 'symbol.fadeOut');
  const source = pop || remove || cues.find((cue) => EXPLODE_CUES.has(cue.cue));
  return parseMotionCells(source?.cells);
}

function nextFiller(pool, index, fallback) {
  if (pool.length) return pool[index % pool.length];
  return fallback;
}

const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Largest 4-connected same-name group. Rehearsal uses this so pops look like a win. */
export function largestEqualCluster(board, minSize = 2) {
  const source = cloneBoard(board);
  const seen = new Set();
  let best = [];
  for (let reel = 0; reel < source.length; reel++) {
    for (let row = 0; row < (source[reel] || []).length; row++) {
      const start = `${reel},${row}`;
      if (seen.has(start)) continue;
      const name = source[reel][row];
      if (!name) continue;
      const stack = [[reel, row]];
      const group = [];
      seen.add(start);
      while (stack.length) {
        const [x, y] = stack.pop();
        group.push([x, y]);
        for (const [dx, dy] of ORTHO) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= source.length || ny >= (source[nx] || []).length) continue;
          const key = `${nx},${ny}`;
          if (seen.has(key) || source[nx][ny] !== name) continue;
          seen.add(key);
          stack.push([nx, ny]);
        }
      }
      if (group.length > best.length) best = group;
    }
  }
  return best.length >= minSize ? best : [];
}

export function pickSeedSymbol(board, fallback = 'L1') {
  const counts = new Map();
  for (const reel of board || []) {
    for (const cell of reel || []) {
      const name = symbolName(cell);
      if (!name || /wild|scatter|bonus|star/i.test(name)) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  let best = fallback;
  let bestCount = -1;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/** Paint a 2×2 matching cluster so rehearsal can pop a real win. */
export function seedMatchingCluster(board, size = 4) {
  const next = cloneBoard(board);
  const reels = next.length;
  const rows = next[0]?.length || 0;
  if (!reels || !rows) return { board: next, cells: [], name: null };
  const name = pickSeedSymbol(next, symbolName(next[0][0]) || 'L1');
  const startReel = Math.max(0, Math.min(reels - 2, Math.floor((reels - 2) / 2)));
  const startRow = Math.max(0, Math.min(rows - 2, Math.floor((rows - 2) / 2)));
  const cells = [];
  for (let reelOffset = 0; reelOffset < 2 && cells.length < size; reelOffset++) {
    for (let rowOffset = 0; rowOffset < 2 && cells.length < size; rowOffset++) {
      const reel = startReel + reelOffset;
      const row = startRow + rowOffset;
      if (next[reel]?.[row] === undefined) continue;
      next[reel][row] = name;
      cells.push([reel, row]);
    }
  }
  return { board: next, cells, name };
}

export function seedStickyWilds(board, wildName, count = 3) {
  const next = cloneBoard(board);
  if (!wildName || !next.length) return { board: next, cells: [] };
  const rows = next[0]?.length || 0;
  const n = Math.min(count, next.length);
  const startReel = Math.max(0, Math.floor((next.length - n) / 2));
  const row = Math.min(1, Math.max(0, rows - 1));
  const cells = [];
  for (let index = 0; index < n; index++) {
    const reel = startReel + index;
    if (!next[reel]) continue;
    next[reel][row] = wildName;
    cells.push([reel, row]);
  }
  return { board: next, cells };
}

/**
 * @param {object} sheet MotionCueSheet
 * @param {string[][]|object[][]} board current preview board (reel → row, row 0 = top)
 * @param {{ fillerSymbol?: string, maxDepth?: number, retargetFromBoard?: boolean }} [options]
 * @returns {Array<{ type: string, explodingSymbols: object[], newSymbols: object[][] }>}
 */
export function cueSheetToTumbleEvents(sheet, board, options = {}) {
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : Infinity;
  const filler = options.fillerSymbol || 'L1';
  const cues = Array.isArray(sheet?.cues) ? sheet.cues : [];
  const depths = [...new Set(cues.map((cue) => Number(cue.depth) || 0))]
    .filter((depth) => depth <= maxDepth)
    .sort((left, right) => left - right);

  let current = cloneBoard(board);
  if (!current.length) return [];

  const events = [];
  for (const depth of depths) {
    const depthCues = cues.filter((cue) => (Number(cue.depth) || 0) === depth);
    const live = options.retargetFromBoard
      ? largestEqualCluster(current, Number(options.minCluster) > 0 ? Number(options.minCluster) : 3)
      : [];
    const fallback = options.retargetFromBoard && depth > 0 ? [] : explodingForDepth(depthCues);
    const exploding = (live.length ? live : fallback)
      .filter(([reel, row]) => Number.isFinite(reel) && Number.isFinite(row)
        && reel >= 0 && reel < current.length
        && row >= 0 && row < (current[reel] || []).length);
    if (!exploding.length) continue;

    const reelCount = current.length;
    const explodedPerReel = Array.from({ length: reelCount }, () => 0);
    for (const [reel] of exploding) {
      if (reel >= 0 && reel < reelCount) explodedPerReel[reel] += 1;
    }

    const pool = [];
    const removed = new Set(exploding.map(([reel, row]) => `${reel},${row}`));
    for (let reel = 0; reel < reelCount; reel++) {
      for (let row = 0; row < (current[reel] || []).length; row++) {
        if (!removed.has(`${reel},${row}`) && current[reel][row]) {
          pool.push(current[reel][row]);
        }
      }
    }

    let fillIndex = 0;
    const newSymbols = explodedPerReel.map((count) => {
      const incoming = [];
      for (let i = 0; i < count; i++) {
        incoming.push(nextFiller(pool, fillIndex, filler));
        fillIndex += 1;
      }
      return incoming;
    });

    events.push({
      type: 'tumbleBoard',
      explodingSymbols: exploding.map(([reel, row]) => ({ reel, row })),
      newSymbols: newSymbols.map((reel) => reel.map((name) => ({ name }))),
    });
    current = applyTumbleOccupancy(current, exploding, newSymbols);
  }
  return events;
}

export function cueSheetHasTumble(sheet) {
  return (sheet?.cues || []).some((cue) => EXPLODE_CUES.has(cue.cue));
}

export function cueSheetHasReel(sheet) {
  return (sheet?.cues || []).some((cue) => REEL_CUES.has(cue.cue));
}
