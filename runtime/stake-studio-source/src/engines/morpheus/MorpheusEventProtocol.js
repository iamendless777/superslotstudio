import {
  MORPHEUS_BOOK_AMOUNT_MULTIPLIER,
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_EVENT_REGISTRY,
  MORPHEUS_EVENT_SCHEMA_VERSION,
  MORPHEUS_MAX_WIN_AMOUNT,
  MORPHEUS_MAX_WIN_MULTIPLIER,
  MORPHEUS_MODE_REGISTRY,
} from './MorpheusGameContract.js';

export const MORPHEUS_PROTOCOL_FORMAT = 'morpheus-authoritative-event-protocol-v1';
export const MORPHEUS_TRACE_FORMAT = 'morpheus-dreamfall-signature-trace-v1';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function fail(message) {
  throw new Error(`Morpheus protocol: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashMorpheusProtocolValue(value) {
  return hashText(JSON.stringify(canonicalize(value)));
}

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isInteger = value => Number.isSafeInteger(Number(value));
const isPositiveInteger = value => isInteger(value) && Number(value) > 0;
const isNonNegativeInteger = value => isInteger(value) && Number(value) >= 0;
const isString = value => typeof value === 'string' && value.length > 0;
const isPositiveSettlementAmount = value => isInteger(value)
  && Number(value) >= 10
  && Number(value) % 10 === 0;

function positionKey(position) {
  return `${Number(position.reel)}:${Number(position.row)}`;
}

function comparePositions(left, right) {
  return Number(left.reel) - Number(right.reel) || Number(left.row) - Number(right.row);
}

function normalizedPositions(positions) {
  return (positions || []).map(position => ({ reel: Number(position.reel), row: Number(position.row) }));
}

function assertPositions(positions, label, { allowEmpty = false } = {}) {
  assert(Array.isArray(positions), `${label} must be an array.`);
  assert(allowEmpty || positions.length > 0, `${label} must not be empty.`);
  const keys = new Set();
  for (const position of positions) {
    assert(isRecord(position) && isNonNegativeInteger(position.reel) && isNonNegativeInteger(position.row),
      `${label} contains an invalid board position.`);
    const key = positionKey(position);
    assert(!keys.has(key), `${label} contains duplicate position ${key}.`);
    keys.add(key);
  }
}

function samePositions(left, right) {
  const a = normalizedPositions(left).sort(comparePositions);
  const b = normalizedPositions(right).sort(comparePositions);
  return JSON.stringify(a) === JSON.stringify(b);
}

function symbolName(symbol) {
  return typeof symbol === 'string' ? symbol : symbol?.name;
}

function normalizeBoard(board) {
  return (board || []).map(reel => reel.map(symbol => ({ name: symbolName(symbol) })));
}

function assertBoard(board, reelHeights, label) {
  assert(Array.isArray(board) && board.length === 6, `${label} must contain exactly six reels.`);
  assert(Array.isArray(reelHeights) && reelHeights.length === 6, `${label} reelHeights must contain six values.`);
  for (let reel = 0; reel < board.length; reel++) {
    assert(Array.isArray(board[reel]), `${label} reel ${reel} must be an array.`);
    assert(isInteger(reelHeights[reel]) && reelHeights[reel] >= 4 && reelHeights[reel] <= 8,
      `${label} reel ${reel} height must be within 4-8.`);
    assert(board[reel].length === Number(reelHeights[reel]),
      `${label} reel ${reel} contains ${board[reel].length} symbols for declared height ${reelHeights[reel]}.`);
    for (const symbol of board[reel]) assert(isString(symbolName(symbol)), `${label} contains an unnamed symbol.`);
  }
}

function assertTransition(event, keys = []) {
  assert(isRecord(event.transition), `${event.type} requires a before/after transition.`);
  assert(isRecord(event.transition.before) && isRecord(event.transition.after),
    `${event.type} transition requires before and after objects.`);
  for (const key of keys) {
    assert(Object.hasOwn(event.transition.before, key) && Object.hasOwn(event.transition.after, key),
      `${event.type} transition must carry ${key} before and after.`);
  }
}

function assertResolution(payload, type) {
  assert(isString(payload.resolutionId), `${type} requires resolutionId.`);
}

function validateReveal(event) {
  const payload = event.payload;
  assert(isString(payload.mode) && MORPHEUS_MODE_REGISTRY[payload.mode], 'reveal requires a frozen mode id.');
  assert(isString(payload.featureTier), 'reveal requires an explicit feature tier or base-mode identity.');
  assertBoard(payload.board, payload.reelHeights, 'reveal board');
  assert(isRecord(payload.featureState)
    && isNonNegativeInteger(payload.featureState.tumbleChainHit)
    && isNonNegativeInteger(payload.featureState.freeSpinsRemaining)
    && isNonNegativeInteger(payload.featureState.totalTumbleFreeSpinsAwarded),
  'reveal requires reconstructable Dreamfall feature state.');
  assertTransition(event, ['boardHash', 'reelHeights']);
  assert(event.transition.before.boardHash === hashMorpheusProtocolValue([]), 'reveal before board hash is not genesis.');
  assert(event.transition.after.boardHash === hashMorpheusProtocolValue(normalizeBoard(payload.board)),
    'reveal after board hash does not match its authoritative board.');
}

function validateWinInfo(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assert(isPositiveSettlementAmount(payload.totalWin),
    'winInfo totalWin must be at least 10 book units and divisible by the 10-unit settlement quantum.');
  assert(isPositiveSettlementAmount(payload.cumulativeWin),
    'winInfo cumulativeWin must be divisible by the 10-unit settlement quantum.');
  assert(payload.cumulativeWin <= MORPHEUS_MAX_WIN_AMOUNT, 'winInfo exceeds the exact 100,000x terminal amount.');
  assert(Array.isArray(payload.wins) && payload.wins.length > 0, 'winInfo requires at least one settled win.');
  let summedWin = 0;
  const union = new Map();
  for (const win of payload.wins) {
    assert(isRecord(win) && isString(win.symbol), 'winInfo contains an invalid settled win.');
    assert(isPositiveSettlementAmount(win.win),
      'every settled win must be at least 10 book units and divisible by the 10-unit settlement quantum.');
    assertPositions(win.positions, 'winInfo win positions');
    assert(isPositiveInteger(win.ways), 'every settled win must publish its effective ways count.');
    summedWin += Number(win.win);
    for (const position of win.positions) union.set(positionKey(position), position);
  }
  assert(summedWin === Number(payload.totalWin), 'winInfo totalWin must equal its quantized win sum.');
  assertPositions(payload.contributingPositions, 'winInfo contributingPositions');
  assert(samePositions(payload.contributingPositions, [...union.values()]),
    'winInfo contributingPositions must be the unique union of settled win positions.');
  assert(samePositions(event.affectedPositions, payload.contributingPositions),
    'winInfo affectedPositions must equal its unique contributing positions.');
  assertTransition(event, ['totalWinAmount']);
  assert(Number(event.transition.after.totalWinAmount) - Number(event.transition.before.totalWinAmount)
    === Number(payload.totalWin), 'winInfo total-win transition does not equal its quantized settlement.');
  assert(Number(event.transition.after.totalWinAmount) === Number(payload.cumulativeWin),
    'winInfo cumulativeWin does not match its authoritative after-state.');
}

function validateExpandReelHeight(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assert(isNonNegativeInteger(payload.reel) && Number(payload.reel) < 6, 'expandReelHeight reel must be 0-5.');
  assert(isInteger(payload.previousRows) && isInteger(payload.rows) && Number(payload.rows) === Number(payload.previousRows) + 1,
    'expandReelHeight must grow exactly one row.');
  assert(Number(payload.previousRows) >= 4 && Number(payload.rows) <= 8 && Number(payload.maximumRows) === 8,
    'expandReelHeight must remain within the frozen 4-8 row range.');
  assert(isString(symbolName(payload.newSymbol)), 'expandReelHeight requires its authoritative new symbol.');
  assert(symbolName(payload.newSymbol) !== 'GATE_OF_SLEEP', 'Dreamfall expansion cannot insert a scatter.');
  assert(samePositions(event.affectedPositions, [{ reel: Number(payload.reel), row: 0 }]),
    'expandReelHeight affectedPositions must identify the newly exposed top cell.');
  assertBoard(payload.boardBefore, payload.reelHeightsBefore, 'expandReelHeight boardBefore');
  assertBoard(payload.boardAfter, payload.reelHeightsAfter, 'expandReelHeight boardAfter');
  const expectedHeights = [...payload.reelHeightsBefore];
  expectedHeights[Number(payload.reel)] += 1;
  assert(JSON.stringify(expectedHeights) === JSON.stringify(payload.reelHeightsAfter),
    'expandReelHeight reel-height transition is not isolated to the selected reel.');
  const expectedBoard = normalizeBoard(payload.boardBefore);
  expectedBoard[Number(payload.reel)].unshift({ name: symbolName(payload.newSymbol) });
  assert(JSON.stringify(expectedBoard) === JSON.stringify(normalizeBoard(payload.boardAfter)),
    'expandReelHeight boardAfter is not the exact one-cell authoritative growth.');
  assertTransition(event, ['reelHeights', 'boardHash']);
  assert(JSON.stringify(event.transition.before.reelHeights) === JSON.stringify(payload.reelHeightsBefore)
    && JSON.stringify(event.transition.after.reelHeights) === JSON.stringify(payload.reelHeightsAfter),
  'expandReelHeight transition heights do not match its payload.');
  assert(event.transition.before.boardHash === hashMorpheusProtocolValue(normalizeBoard(payload.boardBefore))
    && event.transition.after.boardHash === hashMorpheusProtocolValue(normalizeBoard(payload.boardAfter)),
  'expandReelHeight transition board hashes do not match its boards.');
}

function validateTumbleProgress(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assert(isPositiveInteger(payload.chainHit) && Number(payload.threshold) === 5,
    'tumbleChainProgress requires a positive hit and frozen threshold 5.');
  assertTransition(event, ['tumbleChainHit']);
  assert(Number(event.transition.after.tumbleChainHit) === Number(event.transition.before.tumbleChainHit) + 1
    && Number(event.transition.after.tumbleChainHit) === Number(payload.chainHit),
  'tumbleChainProgress must advance the chain by exactly one.');
}

function validateTumbleAward(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assert(isInteger(payload.chainHit) && Number(payload.chainHit) >= 5, 'awardTumbleFreeSpins cannot occur before hit five.');
  assert(Number(payload.amount) === 1, 'awardTumbleFreeSpins must award exactly one spin.');
  assert(isPositiveInteger(payload.totalAwarded), 'awardTumbleFreeSpins requires its running awarded total.');
  assertTransition(event, ['freeSpinsRemaining', 'totalTumbleFreeSpinsAwarded']);
  assert(Number(event.transition.after.freeSpinsRemaining) === Number(event.transition.before.freeSpinsRemaining) + 1,
    'awardTumbleFreeSpins must increment remaining spins by one.');
  assert(Number(event.transition.after.totalTumbleFreeSpinsAwarded)
    === Number(event.transition.before.totalTumbleFreeSpinsAwarded) + 1,
  'awardTumbleFreeSpins must increment its authoritative award total by one.');
  assert(Number(event.transition.after.totalTumbleFreeSpinsAwarded) === Number(payload.totalAwarded),
    'awardTumbleFreeSpins totalAwarded does not match its after-state.');
}

export function applyMorpheusTumble(board, payload) {
  const removed = new Set(normalizedPositions(payload.explodingSymbols).map(positionKey));
  return normalizeBoard(board).map((reel, reelIndex) => {
    const survivors = reel.filter((_, row) => !removed.has(`${reelIndex}:${row}`));
    const incoming = (payload.newSymbols?.[reelIndex] || []).map(symbol => ({ name: symbolName(symbol) }));
    return [...incoming, ...survivors];
  });
}

function validateTumbleBoard(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assertBoard(payload.boardBefore, payload.reelHeights, 'tumbleBoard boardBefore');
  assertBoard(payload.boardAfter, payload.reelHeights, 'tumbleBoard boardAfter');
  assertPositions(payload.explodingSymbols, 'tumbleBoard explodingSymbols');
  assert(Array.isArray(payload.newSymbols) && payload.newSymbols.length === 6,
    'tumbleBoard newSymbols must contain six reel arrays.');
  for (const reel of payload.newSymbols) {
    assert(Array.isArray(reel), 'tumbleBoard newSymbols reels must be arrays.');
    for (const symbol of reel) {
      assert(isString(symbolName(symbol)), 'tumbleBoard refill contains an unnamed symbol.');
      assert(symbolName(symbol) !== 'GATE_OF_SLEEP', 'Dreamfall tumble refill cannot insert a scatter.');
    }
  }
  const expected = applyMorpheusTumble(payload.boardBefore, payload);
  assert(JSON.stringify(expected) === JSON.stringify(normalizeBoard(payload.boardAfter)),
    'tumbleBoard boardAfter does not equal its authoritative explode/refill operation.');
  assert(samePositions(event.affectedPositions, payload.explodingSymbols),
    'tumbleBoard affectedPositions must equal its exploding symbols.');
  assertTransition(event, ['boardHash']);
  assert(event.transition.before.boardHash === hashMorpheusProtocolValue(normalizeBoard(payload.boardBefore))
    && event.transition.after.boardHash === hashMorpheusProtocolValue(normalizeBoard(payload.boardAfter)),
  'tumbleBoard transition hashes do not match its exact boards.');
}

function validateModeGridStart(event) {
  const payload = event.payload;
  assert(['trickster_dream', 'oneiric_nexus'].includes(payload.mode), 'modeGridStart requires a grid-enabled mode.');
  assert(Array.isArray(payload.cells) && payload.cells.length > 0, 'modeGridStart requires cells.');
  const positions = payload.cells.map(cell => cell.position);
  assertPositions(positions, 'modeGridStart cells');
  assert(payload.cells.every(cell => Number(cell.value) === 1), 'modeGridStart cells must begin at 1x.');
}

function validatePositionGridUpdate(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assertPositions([payload.position], 'positionMultiplierGridUpdate position');
  assert(isPositiveInteger(payload.previous) && Number(payload.previous) <= 1024,
    'positionMultiplierGridUpdate previous value must be within the frozen 1024x cell maximum.');
  assert(Number(payload.current) === Math.min(1024, Number(payload.previous) * 2),
    'positionMultiplierGridUpdate must double its previous value up to the frozen 1024x cell maximum.');
}

function validateGuaranteedSpecial(event) {
  const payload = event.payload;
  assert(isPositiveInteger(payload.revealOrder) && Number(payload.revealOrder) <= 3,
    'guaranteedSpecialReveal order must be 1-3.');
  assert(isString(payload.special), 'guaranteedSpecialReveal requires a special symbol.');
  assertPositions(payload.targetPositions, 'guaranteedSpecialReveal targetPositions');
}

function validateSymbolBarProgress(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assert(isString(payload.symbolFamily), 'symbolBarProgress requires a paying family.');
  assertPositions(payload.hits, 'symbolBarProgress hits');
  assert(isNonNegativeInteger(payload.previous) && isPositiveInteger(payload.threshold)
    && isNonNegativeInteger(payload.current) && Number(payload.current) <= Number(payload.threshold),
  'symbolBarProgress carries invalid progress values.');
}

function validateSymbolUpgrade(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assert(isString(payload.fromFamily) && isString(payload.toFamily) && payload.fromFamily !== payload.toFamily,
    'symbolUpgrade requires distinct source and target families.');
  assertPositions(payload.positions, 'symbolUpgrade positions');
}

function validateSymbolMultiplier(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assert(isString(payload.symbolFamily) && !payload.symbolFamily.includes('WILD'),
    'symbolMultiplierUpdate cannot target a wild family.');
  assert(isPositiveInteger(payload.previous) && Number(payload.current) === Number(payload.previous) * 2,
    'symbolMultiplierUpdate must double its family multiplier.');
}

function validateRainingWilds(event) {
  const payload = event.payload;
  assert(Array.isArray(payload.wilds) && payload.wilds.length > 0, 'rainingWilds requires predetermined wilds.');
  assertPositions(payload.wilds.map(wild => wild.position), 'rainingWilds positions');
  assert(payload.wilds.every(wild => isString(wild.variant)), 'rainingWilds requires each wild variant.');
}

function validateStackedReels(event) {
  const payload = event.payload;
  assert(isString(payload.symbol), 'stackedReels requires a stack symbol.');
  assert(Array.isArray(payload.reels) && payload.reels.length > 0
    && new Set(payload.reels).size === payload.reels.length
    && payload.reels.every(reel => isNonNegativeInteger(reel) && Number(reel) < 6),
  'stackedReels requires unique reels in range 0-5.');
}

function validateGuaranteedScatters(event) {
  const payload = event.payload;
  assert(isInteger(payload.count) && Number(payload.count) >= 3 && Number(payload.count) <= 6,
    'guaranteedScatters count must be 3-6.');
  assertPositions(payload.positions, 'guaranteedScatters positions');
  assert(payload.positions.length === Number(payload.count), 'guaranteedScatters count must equal its positions.');
  assert(payload.symbol === 'GATE_OF_SLEEP', 'guaranteedScatters must use GATE_OF_SLEEP.');
}

function validateMysteryTransform(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assert(payload.originalSymbol === 'MYSTERY_VEIL' && payload.accountingIdentity === 'MYSTERY_VEIL',
    'mysteryTransform must preserve MYSTERY_VEIL accounting identity.');
  assert(isString(payload.revealedAs), 'mysteryTransform requires its revealed family.');
  assertPositions(payload.positions, 'mysteryTransform positions');
}

function validateSpecialTarget(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assert(isString(payload.special) && isString(payload.targetFamily),
    'specialTargetSelected requires a special and target family.');
}

function validateSpecialPositions(event) {
  const payload = event.payload;
  assertResolution(payload, event.type);
  assert(isString(payload.special), 'specialPositionsResolved requires a special.');
  assertPositions(payload.positions, 'specialPositionsResolved positions');
  if (payload.sourcePosition !== undefined) assertPositions([payload.sourcePosition], 'specialPositionsResolved sourcePosition');
}

function validateMaxWin(event) {
  const payload = event.payload;
  assert(Number(payload.amount) === MORPHEUS_MAX_WIN_AMOUNT
    && Number(payload.multiplier) === MORPHEUS_MAX_WIN_MULTIPLIER,
  'maxWinReached must declare exactly 100,000x / 10,000,000 book units.');
  assert(payload.terminalCause === 'MAX_MORPHEUS', 'maxWinReached terminal cause must be MAX_MORPHEUS.');
  assertTransition(event, ['terminal']);
  assert(event.transition.before.terminal === false && event.transition.after.terminal === true,
    'maxWinReached must enter terminal state exactly once.');
}

function validateRoundTerminated(event) {
  const payload = event.payload;
  assert(Number(payload.amount) === MORPHEUS_MAX_WIN_AMOUNT
    && Number(payload.multiplier) === MORPHEUS_MAX_WIN_MULTIPLIER
    && payload.terminalCause === 'MAX_MORPHEUS',
  'roundTerminated must preserve the exact MAX_MORPHEUS settlement.');
  assertTransition(event, ['terminated']);
  assert(event.transition.before.terminated === false && event.transition.after.terminated === true,
    'roundTerminated must close the round exactly once.');
}

const PAYLOAD_VALIDATORS = {
  reveal: validateReveal,
  winInfo: validateWinInfo,
  tumbleBoard: validateTumbleBoard,
  modeGridStart: validateModeGridStart,
  positionMultiplierGridUpdate: validatePositionGridUpdate,
  guaranteedSpecialReveal: validateGuaranteedSpecial,
  symbolBarProgress: validateSymbolBarProgress,
  symbolUpgrade: validateSymbolUpgrade,
  symbolMultiplierUpdate: validateSymbolMultiplier,
  expandReelHeight: validateExpandReelHeight,
  tumbleChainProgress: validateTumbleProgress,
  awardTumbleFreeSpins: validateTumbleAward,
  rainingWilds: validateRainingWilds,
  stackedReels: validateStackedReels,
  guaranteedScatters: validateGuaranteedScatters,
  mysteryTransform: validateMysteryTransform,
  specialTargetSelected: validateSpecialTarget,
  specialPositionsResolved: validateSpecialPositions,
  maxWinReached: validateMaxWin,
  roundTerminated: validateRoundTerminated,
};

/** Validate a typed event envelope and its event-specific payload. */
export function validateMorpheusEvent(event) {
  assert(isRecord(event), 'event must be an object.');
  assert(event.schemaVersion === MORPHEUS_EVENT_SCHEMA_VERSION,
    `event ${event.index ?? '?'} schema version does not match ${MORPHEUS_EVENT_SCHEMA_VERSION}.`);
  assert(event.contractFingerprint === MORPHEUS_CONTRACT_FINGERPRINT,
    `event ${event.index ?? '?'} contract fingerprint mismatch.`);
  assert(isNonNegativeInteger(event.index), 'event index must be a non-negative integer.');
  assert(isString(event.roundId), `event ${event.index} requires roundId.`);
  assert(isString(event.type) && MORPHEUS_EVENT_REGISTRY[event.type], `unknown event type ${event.type}.`);
  assert(['math', 'mechanic', 'protocol'].includes(event.source), `event ${event.index} has invalid source ${event.source}.`);
  assert(isRecord(event.cause), `event ${event.index} requires an explicit cause.`);
  assert((event.cause.eventIndex === null || isNonNegativeInteger(event.cause.eventIndex))
    && isString(event.cause.eventType), `event ${event.index} has an invalid cause.`);
  assertPositions(event.affectedPositions, `event ${event.index} affectedPositions`, { allowEmpty: true });
  assert(isRecord(event.blocking) && ['none', 'required'].includes(event.blocking.policy),
    `event ${event.index} requires a blocking policy.`);
  const descriptor = MORPHEUS_EVENT_REGISTRY[event.type];
  assert(event.phase === descriptor.phase, `event ${event.index} phase must be ${descriptor.phase}.`);
  if (descriptor.acknowledgement === 'required') {
    assert(event.blocking.policy === 'required', `${event.type} requires blocking acknowledgement.`);
    assert(isRecord(event.blocking.acknowledgement)
      && isString(event.blocking.acknowledgement.id)
      && event.blocking.acknowledgement.status === 'acknowledged',
    `${event.type} must carry a resolved presentation acknowledgement.`);
  }
  assert(isRecord(event.payload), `event ${event.index} requires a typed payload.`);
  PAYLOAD_VALIDATORS[event.type](event);
  if (descriptor.boardMutation
    && !['reveal', 'expandReelHeight', 'tumbleBoard'].includes(event.type)) {
    assertBoard(event.payload.boardBefore, event.payload.reelHeights, `${event.type} boardBefore`);
    assertBoard(event.payload.boardAfter, event.payload.reelHeights, `${event.type} boardAfter`);
    assertTransition(event, ['boardHash']);
    assert(event.transition.before.boardHash === hashMorpheusProtocolValue(normalizeBoard(event.payload.boardBefore))
      && event.transition.after.boardHash === hashMorpheusProtocolValue(normalizeBoard(event.payload.boardAfter)),
    `${event.type} must publish exact before/after board hashes.`);
  }
  return true;
}

function assertCause(events, event) {
  if (event.index === 0) {
    assert(event.cause.eventIndex === null && event.cause.eventType === 'roundStart',
      'event 0 must be caused by roundStart.');
    return;
  }
  assert(isNonNegativeInteger(event.cause.eventIndex) && Number(event.cause.eventIndex) < Number(event.index),
    `event ${event.index} cause must reference an earlier event.`);
  const cause = events[Number(event.cause.eventIndex)];
  assert(cause?.type === event.cause.eventType,
    `event ${event.index} cause type ${event.cause.eventType} does not match event ${event.cause.eventIndex}.`);
}

function initialSnapshot() {
  return {
    board: [],
    mode: null,
    featureTier: null,
    reelHeights: [4, 4, 4, 4, 4, 4],
    totalWinAmount: 0,
    tumbleChainHit: 0,
    freeSpinsRemaining: 10,
    totalTumbleFreeSpinsAwarded: 0,
    terminal: false,
    terminated: false,
    terminalCause: null,
    acknowledgements: [],
    predeterminedEvents: [],
    positionGridMode: null,
    positionMultipliers: {},
    symbolFamilyMultipliers: {},
  };
}

function applyTransitionValue(snapshot, event, key, snapshotKey = key) {
  assert(JSON.stringify(snapshot[snapshotKey]) === JSON.stringify(event.transition.before[key]),
    `${event.type} before-state ${key} does not match reconstructed state.`);
  snapshot[snapshotKey] = clone(event.transition.after[key]);
}

function assertPredeterminedReveal(snapshot, board) {
  for (const declaration of snapshot.predeterminedEvents) {
    const payload = declaration.payload;
    if (declaration.type === 'guaranteedScatters') {
      for (const position of payload.positions) {
        assert(symbolName(board[position.reel]?.[position.row]) === payload.symbol,
          `guaranteedScatters declaration does not match reveal at ${position.reel}:${position.row}.`);
      }
    } else if (declaration.type === 'guaranteedSpecialReveal') {
      for (const position of payload.targetPositions) {
        assert(symbolName(board[position.reel]?.[position.row]) === payload.special,
          `guaranteedSpecialReveal declaration does not match reveal at ${position.reel}:${position.row}.`);
      }
    } else if (declaration.type === 'rainingWilds') {
      for (const wild of payload.wilds) {
        assert(symbolName(board[wild.position.reel]?.[wild.position.row]) === wild.variant,
          `rainingWilds declaration does not match reveal at ${wild.position.reel}:${wild.position.row}.`);
      }
    } else if (declaration.type === 'stackedReels') {
      for (const reel of payload.reels) {
        assert(board[reel].every(symbol => symbolName(symbol) === payload.symbol),
          `stackedReels declaration does not match authoritative reel ${reel}.`);
      }
    }
  }
}

/**
 * Validate causal order while reconstructing the authoritative board and state.
 * The function throws on the first certification failure and otherwise returns
 * deterministic event/board/state evidence hashes.
 */
export function reconstructMorpheusTrace(events) {
  assert(Array.isArray(events) && events.length > 0, 'trace requires events.');
  const snapshot = initialSnapshot();
  let openResolution = null;
  let maxReached = false;
  const timeline = [];

  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    validateMorpheusEvent(event);
    assert(Number(event.index) === index, `event index ${event.index} is out of sequence at ${index}.`);
    assertCause(events, event);
    assert(event.roundId === events[0].roundId, `event ${index} changed roundId.`);
    assert(!snapshot.terminated, `event ${index} occurs after round termination.`);

    if (maxReached) assert(event.type === 'roundTerminated', 'only roundTerminated may follow maxWinReached.');

    if (event.type === 'reveal') {
      assert(snapshot.board.length === 0, 'authoritative reveal may occur only once per trace.');
      assertPredeterminedReveal(snapshot, event.payload.board);
      snapshot.board = normalizeBoard(event.payload.board);
      snapshot.reelHeights = [...event.payload.reelHeights];
      snapshot.mode = event.payload.mode;
      snapshot.featureTier = event.payload.featureTier;
      snapshot.tumbleChainHit = Number(event.payload.featureState.tumbleChainHit);
      snapshot.freeSpinsRemaining = Number(event.payload.featureState.freeSpinsRemaining);
      snapshot.totalTumbleFreeSpinsAwarded = Number(event.payload.featureState.totalTumbleFreeSpinsAwarded);
    } else if (event.type === 'winInfo') {
      assert(['reveal', 'tumbleBoard'].includes(events[index - 1]?.type),
        'positive settlement must immediately follow an authoritative reveal or acknowledged tumble.');
      assert(openResolution === null, 'a new settlement cannot begin before the previous tumble closes.');
      assert(Number(event.transition.before.totalWinAmount) === snapshot.totalWinAmount,
        'winInfo before total does not match reconstructed total.');
      snapshot.totalWinAmount += Number(event.payload.totalWin);
      assert(snapshot.totalWinAmount === Number(event.payload.cumulativeWin),
        'winInfo cumulative amount does not match reconstructed total.');
      assert(snapshot.totalWinAmount <= MORPHEUS_MAX_WIN_AMOUNT, 'settlement exceeded exact 100,000x cap.');
      openResolution = {
        id: event.payload.resolutionId,
        settlementIndex: index,
        contributingPositions: normalizedPositions(event.payload.contributingPositions),
        dreamfall: snapshot.mode === 'dreamfall',
        expectedGrowthCount: snapshot.mode === 'dreamfall' ? Math.min(
          event.payload.wins.length,
          snapshot.reelHeights.reduce((sum, rows) => sum + (8 - Number(rows)), 0),
        ) : 0,
        growthCount: 0,
        progressed: false,
        awarded: false,
      };
    } else if (event.type === 'expandReelHeight') {
      assert(openResolution?.id === event.payload.resolutionId, 'reel growth requires the current positive settlement.');
      assert(openResolution.dreamfall, 'reel growth is allowed only in Dreamfall.');
      assert(!openResolution.progressed, 'Dreamfall reel growth must precede progress.');
      assert(openResolution.growthCount < openResolution.expectedGrowthCount,
        'Dreamfall emitted more reel growth than settled winning connections.');
      assert(JSON.stringify(snapshot.board) === JSON.stringify(normalizeBoard(event.payload.boardBefore)),
        'expandReelHeight boardBefore does not match reconstructed board.');
      assert(JSON.stringify(snapshot.reelHeights) === JSON.stringify(event.payload.reelHeightsBefore),
        'expandReelHeight heightsBefore do not match reconstructed state.');
      snapshot.board = normalizeBoard(event.payload.boardAfter);
      snapshot.reelHeights = [...event.payload.reelHeightsAfter];
      openResolution.growthCount += 1;
    } else if (event.type === 'tumbleChainProgress') {
      assert(openResolution?.id === event.payload.resolutionId, 'tumble progress requires the current positive settlement.');
      assert(openResolution.dreamfall, 'tumble-chain progress is allowed only in Dreamfall.');
      assert(openResolution.growthCount === openResolution.expectedGrowthCount,
        'Dreamfall progress must follow one reel growth per settled winning connection while capacity remains.');
      assert(!openResolution.progressed, 'Dreamfall progress may advance once per positive settlement.');
      applyTransitionValue(snapshot, event, 'tumbleChainHit');
      openResolution.progressed = true;
    } else if (event.type === 'awardTumbleFreeSpins') {
      assert(openResolution?.id === event.payload.resolutionId && openResolution.progressed,
        'tumble free-spin award requires the current progressed settlement.');
      assert(openResolution.dreamfall, 'tumble-chain free-spin awards are allowed only in Dreamfall.');
      assert(Number(event.payload.chainHit) === snapshot.tumbleChainHit,
        'tumble free-spin award chainHit does not match reconstructed progress.');
      assert(snapshot.tumbleChainHit >= 5 && !openResolution.awarded,
        'Dreamfall awards exactly once on the fifth and every later settlement.');
      applyTransitionValue(snapshot, event, 'freeSpinsRemaining');
      applyTransitionValue(snapshot, event, 'totalTumbleFreeSpinsAwarded');
      openResolution.awarded = true;
    } else if (event.type === 'tumbleBoard') {
      assert(openResolution?.id === event.payload.resolutionId, 'tumble requires the current positive settlement.');
      if (openResolution.dreamfall) {
        assert(openResolution.growthCount === openResolution.expectedGrowthCount && openResolution.progressed,
          'Dreamfall tumble cannot begin before growth and progress are published.');
        assert((snapshot.tumbleChainHit >= 5) === openResolution.awarded,
          'Dreamfall fifth-and-later award obligation was not satisfied exactly once.');
      } else {
        assert(openResolution.growthCount === 0 && !openResolution.progressed && !openResolution.awarded,
          `${snapshot.mode} settlement cannot publish Dreamfall-only growth, progress, or awards.`);
      }
      assert(JSON.stringify(snapshot.board) === JSON.stringify(normalizeBoard(event.payload.boardBefore)),
        'tumbleBoard boardBefore does not match reconstructed board.');
      snapshot.board = normalizeBoard(event.payload.boardAfter);
      snapshot.acknowledgements.push(event.blocking.acknowledgement.id);
      openResolution = null;
    } else if (event.type === 'maxWinReached') {
      assert(snapshot.totalWinAmount === MORPHEUS_MAX_WIN_AMOUNT,
        'maxWinReached requires reconstructed total to equal exactly 100,000x.');
      assert(openResolution !== null, 'maxWinReached requires the positive settlement that reached MAX.');
      snapshot.terminal = true;
      snapshot.terminalCause = 'MAX_MORPHEUS';
      snapshot.acknowledgements.push(event.blocking.acknowledgement.id);
      maxReached = true;
      openResolution = null;
    } else if (event.type === 'roundTerminated') {
      assert(maxReached && snapshot.terminal, 'roundTerminated requires maxWinReached.');
      snapshot.terminated = true;
    } else {
      const descriptor = MORPHEUS_EVENT_REGISTRY[event.type];
      assert(openResolution !== null || descriptor.phase === 'land',
        `${event.type} reaction requires an open positive settlement.`);
      if (descriptor.phase === 'land') {
        assert(snapshot.board.length === 0, `${event.type} predetermined land data must precede authoritative reveal.`);
        snapshot.predeterminedEvents.push({ type: event.type, payload: clone(event.payload) });
        if (event.type === 'modeGridStart') {
          snapshot.positionGridMode = event.payload.mode;
          snapshot.positionMultipliers = Object.fromEntries(event.payload.cells.map(cell => [
            positionKey(cell.position), Number(cell.value),
          ]));
        }
      }
      if (descriptor.persistent && descriptor.phase !== 'land') {
        assert(openResolution !== null, `${event.type} cannot mutate persistent state without positive settlement.`);
      }
      if (event.type === 'positionMultiplierGridUpdate') {
        const key = positionKey(event.payload.position);
        assert(snapshot.positionGridMode === snapshot.mode,
          'position-grid update mode does not match the authoritative reveal.');
        assert(Number(snapshot.positionMultipliers[key]) === Number(event.payload.previous),
          'position-grid update previous value does not match reconstructed state.');
        snapshot.positionMultipliers[key] = Number(event.payload.current);
      }
      if (event.type === 'symbolMultiplierUpdate') {
        snapshot.symbolFamilyMultipliers ||= {};
        const family = event.payload.symbolFamily;
        assert(Number(snapshot.symbolFamilyMultipliers[family] || 1) === Number(event.payload.previous),
          'symbol multiplier previous value does not match reconstructed state.');
        snapshot.symbolFamilyMultipliers[family] = Number(event.payload.current);
      }
      if (descriptor.boardMutation) snapshot.board = normalizeBoard(event.payload.boardAfter);
    }

    timeline.push({
      index,
      type: event.type,
      eventHash: hashMorpheusProtocolValue(event),
      boardHash: hashMorpheusProtocolValue(snapshot.board),
      stateHash: hashMorpheusProtocolValue(snapshot),
    });
  }

  assert(snapshot.totalWinAmount !== MORPHEUS_MAX_WIN_AMOUNT || snapshot.terminated,
    'an exact 100,000x settlement must end with roundTerminated.');
  assert(openResolution === null, 'trace ended before its positive settlement reached an acknowledged tumble or terminal event.');
  return {
    format: MORPHEUS_PROTOCOL_FORMAT,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    schemaVersion: MORPHEUS_EVENT_SCHEMA_VERSION,
    passed: true,
    eventHash: hashMorpheusProtocolValue(events),
    boardHash: hashMorpheusProtocolValue(snapshot.board),
    stateHash: hashMorpheusProtocolValue(snapshot),
    finalBoard: clone(snapshot.board),
    finalState: clone(snapshot),
    timeline,
  };
}

function envelope(index, type, cause, payload, options = {}) {
  const descriptor = MORPHEUS_EVENT_REGISTRY[type];
  return {
    schemaVersion: MORPHEUS_EVENT_SCHEMA_VERSION,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    roundId: options.roundId || 'morpheus:signature:dreamfall:001',
    index,
    type,
    phase: descriptor.phase,
    source: options.source || (descriptor.vocabulary === 'stake-foundation' ? 'math' : 'mechanic'),
    cause,
    affectedPositions: clone(options.affectedPositions || []),
    blocking: clone(options.blocking || { policy: 'none' }),
    transition: clone(options.transition),
    payload: clone(payload),
  };
}

/** Build the deterministic Gate 6 Dreamfall signature trace. */
export function createDreamfallSignatureTrace() {
  const roundId = 'morpheus:signature:dreamfall:001';
  const reelHeightsBefore = [4, 4, 4, 4, 4, 4];
  const revealBoard = normalizeBoard([
    ['POPPY', 'OWL', 'LAUREL', 'MORPHEUS'],
    ['POPPY', 'OWL', 'LAUREL', 'MORPHEUS'],
    ['POPPY', 'OWL', 'LAUREL', 'MORPHEUS'],
    ['POPPY', 'OWL', 'LAUREL', 'NYX'],
    ['POPPY', 'OWL', 'LAUREL', 'NYX'],
    ['POPPY', 'OWL', 'LAUREL', 'NYX'],
  ]);
  const resolutionId = 'dreamfall:spin-4:chain-5';
  const contributors = [{ reel: 0, row: 3 }, { reel: 1, row: 3 }, { reel: 2, row: 3 }];
  const reelHeightsAfter = [4, 4, 4, 5, 4, 4];
  const expandedBoard = normalizeBoard(revealBoard);
  expandedBoard[3].unshift({ name: 'MOON_MOTH' });
  const tumblePayload = {
    resolutionId,
    reelHeights: reelHeightsAfter,
    boardBefore: expandedBoard,
    explodingSymbols: contributors,
    newSymbols: [[{ name: 'POPPY' }], [{ name: 'OWL' }], [{ name: 'LAUREL' }], [], [], []],
  };
  const tumbledBoard = applyMorpheusTumble(expandedBoard, tumblePayload);
  tumblePayload.boardAfter = tumbledBoard;
  const events = [
    envelope(0, 'reveal', { eventIndex: null, eventType: 'roundStart' }, {
      mode: 'dreamfall',
      featureTier: 'dreamfall',
      board: revealBoard,
      reelHeights: reelHeightsBefore,
      featureState: {
        tumbleChainHit: 4,
        freeSpinsRemaining: 6,
        totalTumbleFreeSpinsAwarded: 0,
      },
    }, {
      roundId,
      transition: {
        before: { boardHash: hashMorpheusProtocolValue([]), reelHeights: reelHeightsBefore },
        after: { boardHash: hashMorpheusProtocolValue(revealBoard), reelHeights: reelHeightsBefore },
      },
    }),
    envelope(1, 'winInfo', { eventIndex: 0, eventType: 'reveal' }, {
      resolutionId,
      totalWin: 250,
      cumulativeWin: 250,
      wins: [{ symbol: 'MORPHEUS', win: 250, ways: 4, positions: contributors }],
      contributingPositions: contributors,
    }, {
      roundId,
      affectedPositions: contributors,
      transition: { before: { totalWinAmount: 0 }, after: { totalWinAmount: 250 } },
    }),
    envelope(2, 'expandReelHeight', { eventIndex: 1, eventType: 'winInfo' }, {
      resolutionId,
      reel: 3,
      previousRows: 4,
      rows: 5,
      maximumRows: 8,
      newSymbol: { name: 'MOON_MOTH' },
      reelHeightsBefore,
      reelHeightsAfter,
      boardBefore: revealBoard,
      boardAfter: expandedBoard,
    }, {
      roundId,
      affectedPositions: [{ reel: 3, row: 0 }],
      transition: {
        before: { reelHeights: reelHeightsBefore, boardHash: hashMorpheusProtocolValue(revealBoard) },
        after: { reelHeights: reelHeightsAfter, boardHash: hashMorpheusProtocolValue(expandedBoard) },
      },
    }),
    envelope(3, 'tumbleChainProgress', { eventIndex: 1, eventType: 'winInfo' }, {
      resolutionId, chainHit: 5, threshold: 5,
    }, {
      roundId,
      affectedPositions: contributors,
      transition: { before: { tumbleChainHit: 4 }, after: { tumbleChainHit: 5 } },
    }),
    envelope(4, 'awardTumbleFreeSpins', { eventIndex: 3, eventType: 'tumbleChainProgress' }, {
      resolutionId, chainHit: 5, amount: 1, totalAwarded: 1,
    }, {
      roundId,
      transition: {
        before: { freeSpinsRemaining: 6, totalTumbleFreeSpinsAwarded: 0 },
        after: { freeSpinsRemaining: 7, totalTumbleFreeSpinsAwarded: 1 },
      },
    }),
    envelope(5, 'tumbleBoard', { eventIndex: 4, eventType: 'awardTumbleFreeSpins' }, tumblePayload, {
      roundId,
      affectedPositions: contributors,
      blocking: {
        policy: 'required',
        acknowledgement: { id: 'ack:morpheus:signature:dreamfall:tumble-5', status: 'acknowledged' },
      },
      transition: {
        before: { boardHash: hashMorpheusProtocolValue(expandedBoard) },
        after: { boardHash: hashMorpheusProtocolValue(tumbledBoard) },
      },
    }),
  ];
  return {
    format: MORPHEUS_TRACE_FORMAT,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    amountMultiplier: MORPHEUS_BOOK_AMOUNT_MULTIPLIER,
    events,
  };
}
