const STANDARD_5X3_PAYLINES = [
  [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1],
  [0, 1, 1, 1, 2], [2, 1, 1, 1, 0], [0, 1, 0, 1, 2],
  [2, 1, 2, 1, 0], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1],
  [0, 2, 1, 0, 2], [2, 0, 1, 2, 0], [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2], [1, 0, 0, 0, 1],
];

export const EXECUTABLE_WIN_TYPES = Object.freeze({
  lines: 'lines',
  ways: 'ways',
  ways5x4: 'ways',
  ways5x5: 'ways',
  waysLarge: 'ways',
  cluster: 'cluster',
  scatter: 'scatter',
});

export function getExecutableWinType(gameType) {
  return EXECUTABLE_WIN_TYPES[gameType] || null;
}

function remapTemplate(template, reels, rows) {
  return Array.from({ length: reels }, (_, reel) => {
    const source = reels <= 1 ? 0 : Math.round((reel * (template.length - 1)) / (reels - 1));
    const maxRow = Math.max(0, Number(rows[reel] ?? rows[0] ?? 1) - 1);
    return Math.round((template[source] / 2) * maxRow);
  });
}

/**
 * Deterministic paylines used when a Lines project has not authored its own.
 * The first twenty are Stake math-sdk's conventional 5x3 set, remapped to the
 * configured grid. Additional lines are stable row combinations.
 */
export function generateDefaultPaylines(grid, requested = 20) {
  const reels = Math.max(1, Number(grid?.reels) || 5);
  const rows = Array.from({ length: reels }, (_, reel) => Math.max(1, Number(grid?.rows?.[reel] ?? grid?.rows?.[0]) || 3));
  const target = Math.max(1, Number(requested) || 20);
  const patterns = [];
  const seen = new Set();
  const add = pattern => {
    const key = pattern.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      patterns.push(pattern);
    }
  };

  for (const template of STANDARD_5X3_PAYLINES) add(remapTemplate(template, reels, rows));
  for (let code = 0; patterns.length < target && code < 100000; code++) {
    let value = code;
    const pattern = rows.map(rowCount => {
      const row = value % rowCount;
      value = Math.floor(value / rowCount);
      return row;
    });
    add(pattern);
  }

  return Object.fromEntries(patterns.slice(0, target).map((pattern, index) => [index + 1, pattern]));
}

export function resolvePaylines(math) {
  const configured = Object.entries(math?.paylines || {}).filter(([, line]) => (
    Array.isArray(line)
    && line.length === math.grid.reels
    && line.every((row, reel) => Number.isInteger(Number(row)) && Number(row) >= 0 && Number(row) < math.grid.rows[reel])
  ));
  if (configured.length) return Object.fromEntries(configured.map(([id, line]) => [id, line.map(Number)]));
  return generateDefaultPaylines(math?.grid, 20);
}
