/**
 * Pure geometry feasibility proof for Morpheus's expanding Dreamfall board.
 *
 * This module intentionally has no DOM, Pixi application, Preview, or compiled
 * frontend dependency. It proves the coordinate/mask contract before either
 * production renderer is allowed to adopt it.
 *
 * Official implementation assumptions:
 * - web-sdk/apps/ways/src/components/BoardMask.svelte uses an axis-aligned Pixi
 *   Rectangle as the board mask.
 * - web-sdk/apps/ways/src/components/BoardContainer.svelte places the board in
 *   one explicit coordinate container.
 * - web-sdk/apps/price/src/components/ExpandingWilds.svelte awaits the mechanic
 *   animation promise before its event handler resolves.
 */

export const WORLD_BOARD_RENDERER_SPIKE_FORMAT = 'stake-studio-world-board-renderer-spike-v1';

export const MORPHEUS_WORLD_BOARD_CONTRACT = Object.freeze({
  reels: 6,
  worldRows: 8,
  minimumReelRows: 4,
  maximumReelRows: 8,
  initialReelRows: Object.freeze([4, 4, 4, 4, 4, 4]),
  alignment: 'bottom',
  maskShape: 'axis-aligned-rectangle',
  cellResizeDuringGrowth: false,
  lifecycle: 'await-mask-cap-animation-before-next-tumble',
  officialPatterns: Object.freeze([
    'reference/web-sdk/apps/ways/src/components/BoardMask.svelte',
    'reference/web-sdk/apps/ways/src/components/BoardContainer.svelte',
    'reference/web-sdk/apps/price/src/components/ExpandingWilds.svelte',
  ]),
});

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sameNumber = (left, right, epsilon = 1e-9) => Math.abs(left - right) <= epsilon;

function assertPositive(value, label) {
  if (!(value > 0)) throw new RangeError(`${label} must be greater than zero.`);
}
function normalizeReelHeights(value) {
  const source = value == null ? MORPHEUS_WORLD_BOARD_CONTRACT.initialReelRows : value;
  if (!Array.isArray(source) || source.length !== MORPHEUS_WORLD_BOARD_CONTRACT.reels) {
    throw new RangeError(`reelHeights must contain exactly ${MORPHEUS_WORLD_BOARD_CONTRACT.reels} values.`);
  }
  return source.map((raw, reel) => {
    const rows = Number(raw);
    if (!Number.isInteger(rows)
      || rows < MORPHEUS_WORLD_BOARD_CONTRACT.minimumReelRows
      || rows > MORPHEUS_WORLD_BOARD_CONTRACT.maximumReelRows) {
      throw new RangeError(`Reel ${reel} height must be an integer from 4 through 8.`);
    }
    return rows;
  });
}

function rectangle(x, y, width, height) {
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function sameRectangle(left, right) {
  return ['x', 'y', 'width', 'height', 'right', 'bottom']
    .every(key => sameNumber(left[key], right[key]));
}

/**
 * Calculate all six reel shafts inside a permanently reserved 6x8 world.
 * Board row zero is the top active row. worldRow is the stable physical row in
 * the reserved world, so a new top symbol can enter while lower cells retain
 * their physical coordinates.
 */
export function createWorldBoardGeometry(options = {}) {
  const width = finite(options.width, 600);
  const height = finite(options.height, 800);
  const x = finite(options.x, 0);
  const y = finite(options.y, 0);
  const gap = Math.max(0, finite(options.gap, 4));
  const reelHeights = normalizeReelHeights(options.reelHeights);
  assertPositive(width, 'width');
  assertPositive(height, 'height');
  if (gap * (MORPHEUS_WORLD_BOARD_CONTRACT.reels - 1) >= width) {
    throw new RangeError('Reel gaps consume the entire world width.');
  }

  const cellWidth = (width - gap * (MORPHEUS_WORLD_BOARD_CONTRACT.reels - 1))
    / MORPHEUS_WORLD_BOARD_CONTRACT.reels;
  const cellHeight = height / MORPHEUS_WORLD_BOARD_CONTRACT.worldRows;
  const world = rectangle(x, y, width, height);
  const bottom = world.bottom;
  const railWidth = Math.min(4, Math.max(1, cellWidth * 0.035));
  const capHeight = Math.min(14, Math.max(2, cellHeight * 0.16));

  const reels = reelHeights.map((rows, reel) => {
    const reelX = x + reel * (cellWidth + gap);
    const activeHeight = rows * cellHeight;
    const maskY = bottom - activeHeight;
    const shaft = rectangle(reelX, y, cellWidth, height);
    const mask = {
      ...rectangle(reelX, maskY, cellWidth, activeHeight),
      shape: MORPHEUS_WORLD_BOARD_CONTRACT.maskShape,
      axisAligned: true,
    };
    const cap = {
      ...rectangle(reelX, maskY - capHeight / 2, cellWidth, capHeight),
      anchorY: maskY,
      movesWithMaskTop: true,
    };
    const rails = {
      left: rectangle(reelX - railWidth, maskY, railWidth, activeHeight),
      right: rectangle(reelX + cellWidth, maskY, railWidth, activeHeight),
    };
    const cells = Array.from({ length: MORPHEUS_WORLD_BOARD_CONTRACT.worldRows }, (_, worldRow) => {
      const firstActiveWorldRow = MORPHEUS_WORLD_BOARD_CONTRACT.worldRows - rows;
      const active = worldRow >= firstActiveWorldRow;
      return {
        reel,
        worldRow,
        boardRow: active ? worldRow - firstActiveWorldRow : null,
        active,
        ...rectangle(reelX, y + worldRow * cellHeight, cellWidth, cellHeight),
      };
    });
    return {
      reel,
      rows,
      bottom,
      shaft,
      mask,
      cap,
      rails,
      cells,
      exposedShaftRows: MORPHEUS_WORLD_BOARD_CONTRACT.worldRows - rows,
    };
  });

  return {
    format: WORLD_BOARD_RENDERER_SPIKE_FORMAT,
    contract: MORPHEUS_WORLD_BOARD_CONTRACT,
    world,
    gap,
    cell: { width: cellWidth, height: cellHeight },
    reelHeights,
    reels,
    cells: reels.flatMap(reel => reel.cells),
  };
}

export function createWorldBoardTransition(previous, { reel, rows } = {}) {
  if (!previous || previous.format !== WORLD_BOARD_RENDERER_SPIKE_FORMAT) {
    throw new TypeError('A WorldBoardRenderer spike frame is required.');
  }
  if (!Number.isInteger(reel) || reel < 0 || reel >= MORPHEUS_WORLD_BOARD_CONTRACT.reels) {
    throw new RangeError('reel must identify one of the six reserved shafts.');
  }
  const nextHeights = [...previous.reelHeights];
  if (!Number.isInteger(rows) || rows <= nextHeights[reel]
    || rows > MORPHEUS_WORLD_BOARD_CONTRACT.maximumReelRows) {
    throw new RangeError('rows must grow the selected reel and may not exceed eight.');
  }
  nextHeights[reel] = rows;
  const next = createWorldBoardGeometry({
    x: previous.world.x,
    y: previous.world.y,
    width: previous.world.width,
    height: previous.world.height,
    gap: previous.gap,
    reelHeights: nextHeights,
  });
  const unchangedReels = previous.reels.filter(item => item.reel !== reel);
  const changedBefore = previous.reels[reel];
  const changedAfter = next.reels[reel];
  const evidence = {
    fixedWorld: sameRectangle(previous.world, next.world),
    constantCellSize: sameNumber(previous.cell.width, next.cell.width)
      && sameNumber(previous.cell.height, next.cell.height),
    bottomAligned: next.reels.every(item => sameNumber(item.mask.bottom, next.world.bottom)),
    selectedReelOnly: unchangedReels.every(item => (
      sameRectangle(item.mask, next.reels[item.reel].mask)
      && sameRectangle(item.cap, next.reels[item.reel].cap)
      && sameRectangle(item.rails.left, next.reels[item.reel].rails.left)
      && sameRectangle(item.rails.right, next.reels[item.reel].rails.right)
    )),
    maskGrewUpward: sameNumber(changedBefore.mask.bottom, changedAfter.mask.bottom)
      && changedAfter.mask.y < changedBefore.mask.y
      && changedAfter.mask.height > changedBefore.mask.height,
    capMovedWithMask: sameNumber(changedAfter.cap.anchorY, changedAfter.mask.y)
      && changedAfter.cap.anchorY < changedBefore.cap.anchorY,
    rectangularMasks: next.reels.every(item => item.mask.axisAligned && item.mask.shape === 'axis-aligned-rectangle'),
    emptyShaftPreserved: changedAfter.exposedShaftRows
      === MORPHEUS_WORLD_BOARD_CONTRACT.worldRows - rows,
  };
  return {
    from: previous,
    to: next,
    event: {
      type: 'expandReelHeight',
      reel,
      previousRows: changedBefore.rows,
      rows,
      maximumRows: MORPHEUS_WORLD_BOARD_CONTRACT.maximumReelRows,
    },
    lifecycle: {
      blocking: true,
      acknowledgement: 'mask-cap-animation-finished',
      nextEventAllowedAfterAcknowledgement: true,
    },
    evidence,
    passed: Object.values(evidence).every(Boolean),
  };
}

/** Prove the required 4 -> 5 -> 8 growth path on one reel. */
export function runWorldBoardRendererSpike(options = {}) {
  const growthReel = Number.isInteger(options.growthReel) ? options.growthReel : 2;
  const initial = createWorldBoardGeometry({
    width: finite(options.width, 600),
    height: finite(options.height, 800),
    x: finite(options.x, 0),
    y: finite(options.y, 0),
    gap: Math.max(0, finite(options.gap, 4)),
    reelHeights: MORPHEUS_WORLD_BOARD_CONTRACT.initialReelRows,
  });
  const toFive = createWorldBoardTransition(initial, { reel: growthReel, rows: 5 });
  const toEight = createWorldBoardTransition(toFive.to, { reel: growthReel, rows: 8 });
  const transitions = [toFive, toEight];
  return {
    format: WORLD_BOARD_RENDERER_SPIKE_FORMAT,
    status: transitions.every(item => item.passed) ? 'proven' : 'failed',
    contract: MORPHEUS_WORLD_BOARD_CONTRACT,
    growthReel,
    frames: [initial, toFive.to, toEight.to],
    transitions,
    evidence: {
      coordinateCells: initial.cells.length,
      rowSequence: [initial, toFive.to, toEight.to].map(frame => frame.reelHeights[growthReel]),
      fixedWorld: transitions.every(item => item.evidence.fixedWorld),
      constantCellSize: transitions.every(item => item.evidence.constantCellSize),
      bottomAligned: transitions.every(item => item.evidence.bottomAligned),
      independentMasks: transitions.every(item => item.evidence.selectedReelOnly),
      shaftCapLifecycle: transitions.every(item => item.evidence.emptyShaftPreserved
        && item.evidence.capMovedWithMask && item.lifecycle.blocking),
    },
  };
}
