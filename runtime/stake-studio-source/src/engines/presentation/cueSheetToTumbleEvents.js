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

/**
 * @param {object} sheet MotionCueSheet
 * @param {string[][]|object[][]} board current preview board (reel → row, row 0 = top)
 * @param {{ fillerSymbol?: string, maxDepth?: number }} [options]
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
    const exploding = explodingForDepth(depthCues);
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
