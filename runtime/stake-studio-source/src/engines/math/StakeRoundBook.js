const BOOK_AMOUNT_MULTIPLIER = 100;

const amount = value => Math.round((Number(value) || 0) * BOOK_AMOUNT_MULTIPLIER);

export const symbolName = symbol => typeof symbol === 'string' ? symbol : symbol?.name;

export const serializeBoard = board => (board || []).map(reel =>
  (reel || []).map(symbol => typeof symbol === 'string' ? { name: symbol } : { ...symbol })
);

export const deserializeBoard = board => (board || []).map(reel =>
  (reel || []).map(symbolName)
);

const serializePosition = position => Array.isArray(position)
  ? { reel: Number(position[0]), row: Number(position[1]) }
  : { reel: Number(position?.reel), row: Number(position?.row) };

export const deserializePosition = position => Array.isArray(position)
  ? [Number(position[0]), Number(position[1])]
  : [Number(position?.reel), Number(position?.row)];

const serializeWin = win => ({
  symbol: win.symbol,
  kind: win.kind || 'ways',
  win: amount(win.payout ?? win.win),
  positions: (win.positions || []).map(serializePosition),
  meta: {
    ...(win.meta || {}),
    multiplier: Number(win.meta?.appliedMultiplier ?? win.meta?.multiplier ?? 1),
    winWithoutMult: amount((win.payout ?? win.win) /
      Math.max(1, Number(win.meta?.appliedMultiplier ?? win.meta?.multiplier ?? 1))),
    globalMult: Number(win.meta?.globalMult ?? 1),
    ...(win.ways === undefined ? {} : { ways: win.ways }),
  },
});

export const deserializeWins = wins => (wins || []).map(win => ({
  ...win,
  payout: Number(win.win || 0) / BOOK_AMOUNT_MULTIPLIER,
  positions: (win.positions || []).map(deserializePosition),
}));

const boardsEqual = (left, right) => JSON.stringify(deserializeBoard(left)) === JSON.stringify(deserializeBoard(right));

/** Apply Stake's standard tumbleBoard payload without any game-specific modifiers. */
export function applyTumbleEvent(board, event) {
  const source = deserializeBoard(board);
  const removed = new Set((event.explodingSymbols || [])
    .map(position => deserializePosition(position))
    .map(([reel, row]) => `${reel},${row}`));
  return source.map((reel, reelIndex) => {
    const survivors = reel.filter((_, row) => !removed.has(`${reelIndex},${row}`));
    const incoming = (event.newSymbols?.[reelIndex] || []).map(symbolName);
    return [...incoming, ...survivors];
  });
}

function pushEvent(events, event) {
  events.push({ index: events.length, ...event });
}

function serializeMechanicEvent(event = {}) {
  const out = { ...event };
  if (Array.isArray(event.positions)) out.positions = event.positions.map(serializePosition);
  if (Array.isArray(event.sources)) out.sources = event.sources.map(serializePosition);
  if (Array.isArray(event.board)) out.board = serializeBoard(event.board);
  if (Array.isArray(event.updates)) {
    out.updates = event.updates.map(update => ({
      ...update,
      reel: Number(update.reel),
      row: Number(update.row),
    }));
  }
  return out;
}

function boardTransformEvent(sourceBoard, targetBoard) {
  if (boardsEqual(sourceBoard, targetBoard)) return null;
  const source = deserializeBoard(sourceBoard);
  const target = deserializeBoard(targetBoard);
  const changes = [];
  for (let reel = 0; reel < target.length; reel++) {
    for (let row = 0; row < target[reel].length; row++) {
      if (source[reel]?.[row] === target[reel][row]) continue;
      changes.push({ reel, row, from: source[reel]?.[row], to: target[reel][row] });
    }
  }
  return { type: 'boardTransform', board: serializeBoard(target), changes };
}

function pushMechanicSequence(events, sourceBoard, mechanicEvents = [], finalBoard = sourceBoard) {
  let currentBoard = deserializeBoard(sourceBoard);
  for (const mechanicEvent of mechanicEvents || []) {
    pushEvent(events, serializeMechanicEvent(mechanicEvent));
    const targetBoard = mechanicEvent.board ? deserializeBoard(mechanicEvent.board) : null;
    if (!targetBoard) continue;
    const transform = boardTransformEvent(currentBoard, targetBoard);
    if (transform) pushEvent(events, transform);
    currentBoard = targetBoard;
  }
  const finalTransform = boardTransformEvent(currentBoard, finalBoard);
  if (finalTransform) pushEvent(events, finalTransform);
}

/**
 * Waiting-reel flags for reveal.anticipation (one entry per reel).
 * Mirrors PresentationDirector.waitingReelsFromBoard so studio Preview and
 * live SPIN share the same one-away-from-threshold schedule. Prefer an
 * authored spin.anticipation array when present.
 */
export function anticipationFromBoard(board, {
  scatterSymbols = [],
  thresholds = [3, 4, 5, 6],
} = {}) {
  const reels = Array.isArray(board) ? board.length : 0;
  const waiting = Array.from({ length: reels }, () => false);
  if (!reels) return waiting;
  const scatters = new Set(
    (Array.isArray(scatterSymbols) ? scatterSymbols : [])
      .map((symbol) => String(symbol || '').trim())
      .filter(Boolean),
  );
  if (!scatters.size) return waiting;
  const isScatter = (symbol) => scatters.has(symbolName(symbol));
  const counts = board.map((column) => (column || []).filter((symbol) => isScatter(symbol)).length);
  const rowsOf = (reel) => Math.max(1, (board[reel] || []).length);
  const maxTier = Math.max(0, ...thresholds.map(Number).filter((value) => Number.isFinite(value)));
  const tiers = thresholds.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  let landed = 0;
  for (let reel = 0; reel < reels; reel++) {
    const next = tiers.find((tier) => tier > landed);
    const capacity = Array.from({ length: reels - reel }, (_, index) => rowsOf(reel + index))
      .reduce((sum, rows) => sum + rows, 0);
    waiting[reel] = Boolean(
      next != null
      && landed < maxTier
      && landed >= next - 1
      && landed + capacity >= next,
    );
    landed += counts[reel];
  }
  return waiting;
}

/**
 * Compile one resolved Studio spin into Stake Engine's authoritative event-book
 * shape. Custom boardTransform events describe mechanics that intentionally
 * alter surviving symbols after a standard tumble.
 */
export function compileSpinBook(spin, {
  gameType = 'basegame',
  wincap = Infinity,
  scatterSymbols = [],
  thresholds = [3, 4, 5, 6],
} = {}) {
  const events = [];
  const steps = spin?.steps || [];
  const initialBoard = spin?.board || steps[0]?.board || [];
  const sourceBoard = spin?.sourceBoard || initialBoard;
  let runningWin = 0;
  const initialModifierEvents = steps[0]?.modifierEvents || [];
  const preRevealEvents = initialModifierEvents.filter(event => event.type === 'modeGridStart');
  for (const event of preRevealEvents) pushEvent(events, serializeMechanicEvent(event));

  const authoredAnticipation = Array.isArray(spin?.anticipation) ? spin.anticipation : null;
  const anticipation = authoredAnticipation
    && authoredAnticipation.some((value) => value === true || Number(value) > 0)
    ? Array.from({ length: sourceBoard.length || authoredAnticipation.length }, (_, reel) => {
      const value = authoredAnticipation[reel];
      return value === true || Number(value) > 0;
    })
    : anticipationFromBoard(sourceBoard, { scatterSymbols, thresholds });

  pushEvent(events, {
    type: 'reveal',
    board: serializeBoard(sourceBoard),
    paddingPositions: [],
    gameType,
    anticipation,
  });

  if (steps.length) {
    pushMechanicSequence(
      events,
      sourceBoard,
      [
        ...initialModifierEvents.filter(event => event.type !== 'modeGridStart'),
        ...(spin?.stickyReelEvents || []),
      ],
      steps[0].board || initialBoard,
    );
  }

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    const stepWin = Number(step.stepWin) || 0;
    if (stepWin > 0) {
      const wins = (step.wins || []).map(serializeWin);
      pushEvent(events, { type: 'winInfo', totalWin: amount(stepWin), wins });
      runningWin += stepWin;
      pushEvent(events, { type: 'updateTumbleWin', amount: amount(runningWin) });
      pushEvent(events, { type: 'setTotalWin', amount: amount(runningWin) });
    }

    for (const featureEvent of step.featureEvents || []) {
      pushEvent(events, serializeMechanicEvent(featureEvent));
    }
    const reactionBoard = step.reactionBoard || step.board;
    const reactionTransform = boardTransformEvent(step.board, reactionBoard);
    if (reactionTransform) pushEvent(events, reactionTransform);

    if (!step.tumble) continue;
    const tumbleEvent = {
      type: 'tumbleBoard',
      newSymbols: (step.tumble.newSymbols || []).map(reel =>
        reel.map(symbol => typeof symbol === 'string' ? { name: symbol } : { ...symbol })),
      explodingSymbols: (step.tumble.explodingSymbols || []).map(serializePosition),
    };
    pushEvent(events, tumbleEvent);

    const standardSettledBoard = applyTumbleEvent(reactionBoard, tumbleEvent);
    const targetBoard = steps[stepIndex + 1]?.board || spin.finalBoard || standardSettledBoard;
    pushMechanicSequence(
      events,
      standardSettledBoard,
      steps[stepIndex + 1]?.modifierEvents || [],
      targetBoard,
    );
  }

  const finalAmount = amount(Math.min(Number(spin?.totalWin) || runningWin, Number(wincap) || Infinity));
  if (spin?.maxMorpheusHit) {
    const maxEvent = events.find(event => event.type === 'maxWinReached');
    if (!maxEvent) pushEvent(events, {
      type: 'maxWinReached',
      amount: finalAmount,
      multiplier: Number(wincap),
      terminalCause: 'MAX_MORPHEUS',
    });
    pushEvent(events, {
      type: 'roundTerminated',
      amount: finalAmount,
      multiplier: Number(wincap),
      terminalCause: 'MAX_MORPHEUS',
    });
    return events;
  }
  if (finalAmount > 0) pushEvent(events, { type: 'setWin', amount: finalAmount, winLevel: 1 });
  pushEvent(events, { type: 'finalWin', amount: finalAmount });
  return events;
}

export { BOOK_AMOUNT_MULTIPLIER };
