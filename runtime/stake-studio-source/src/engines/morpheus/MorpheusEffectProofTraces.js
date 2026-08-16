import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_EVENT_REGISTRY,
  MORPHEUS_EVENT_SCHEMA_VERSION,
  MORPHEUS_MAX_WIN_AMOUNT,
  MORPHEUS_MAX_WIN_MULTIPLIER,
} from './MorpheusGameContract.js';
import {
  applyMorpheusTumble,
  createDreamfallSignatureTrace,
  hashMorpheusProtocolValue,
  reconstructMorpheusTrace,
} from './MorpheusEventProtocol.js';

export const MORPHEUS_EFFECT_PROOF_TRACE_FORMAT = 'morpheus-effect-orchestration-proof-trace-v1';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const normalizeBoard = board => board.map(reel => reel.map(symbol => ({
  name: typeof symbol === 'string' ? symbol : symbol.name,
})));

function envelope({ roundId, index, type, cause, payload, affectedPositions = [], blocking, transition }) {
  const descriptor = MORPHEUS_EVENT_REGISTRY[type];
  return {
    schemaVersion: MORPHEUS_EVENT_SCHEMA_VERSION,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    roundId,
    index,
    type,
    phase: descriptor.phase,
    source: descriptor.vocabulary === 'stake-foundation' ? 'math' : type === 'roundTerminated' ? 'protocol' : 'mechanic',
    cause,
    affectedPositions: clone(affectedPositions),
    blocking: clone(blocking || { policy: 'none' }),
    transition: clone(transition),
    payload: clone(payload),
  };
}

function proofResult(routeId, events) {
  const reconstruction = reconstructMorpheusTrace(events);
  return {
    format: MORPHEUS_EFFECT_PROOF_TRACE_FORMAT,
    contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    routeId,
    events,
    eventHash: reconstruction.eventHash,
    boardHash: reconstruction.boardHash,
    stateHash: reconstruction.stateHash,
    reconstruction,
  };
}

function positionsWithSymbol(board, symbol) {
  const positions = [];
  for (let reel = 0; reel < board.length; reel++) {
    for (let row = 0; row < board[reel].length; row++) {
      if (board[reel][row].name === symbol) positions.push({ reel, row });
    }
  }
  return positions;
}

function replacePositions(board, positions, symbol) {
  const next = normalizeBoard(board);
  for (const { reel, row } of positions) next[reel][row] = { name: symbol };
  return next;
}

export function createTricksterGridSettlementProofTrace() {
  const base = createDreamfallSignatureTrace();
  const roundId = 'morpheus:proof:trickster-grid:001';
  const resolutionId = 'proof:trickster-grid:resolution-1';
  const reelHeights = [4, 4, 4, 4, 4, 4];
  const board = normalizeBoard(base.events[0].payload.board);
  const contributors = clone(base.events[1].payload.contributingPositions);
  const cells = board.flatMap((reel, reelIndex) => reel.map((_, row) => ({
    position: { reel: reelIndex, row }, value: 1,
  })));
  const tumblePayload = {
    resolutionId,
    reelHeights,
    boardBefore: board,
    explodingSymbols: contributors,
    newSymbols: [[{ name: 'NYX' }], [{ name: 'OWL' }], [{ name: 'LAUREL' }], [], [], []],
  };
  tumblePayload.boardAfter = applyMorpheusTumble(board, tumblePayload);
  const events = [
    envelope({
      roundId, index: 0, type: 'modeGridStart',
      cause: { eventIndex: null, eventType: 'roundStart' },
      affectedPositions: cells.map(cell => cell.position),
      payload: { mode: 'trickster_dream', cells },
    }),
    envelope({
      roundId, index: 1, type: 'reveal',
      cause: { eventIndex: 0, eventType: 'modeGridStart' },
      transition: {
        before: { boardHash: hashMorpheusProtocolValue([]), reelHeights },
        after: { boardHash: hashMorpheusProtocolValue(board), reelHeights },
      },
      payload: {
        mode: 'trickster_dream', featureTier: 'trickster_dream', board, reelHeights,
        featureState: { tumbleChainHit: 0, freeSpinsRemaining: 0, totalTumbleFreeSpinsAwarded: 0 },
      },
    }),
    envelope({
      roundId, index: 2, type: 'winInfo',
      cause: { eventIndex: 1, eventType: 'reveal' },
      affectedPositions: contributors,
      transition: { before: { totalWinAmount: 0 }, after: { totalWinAmount: 250 } },
      payload: {
        resolutionId, totalWin: 250, cumulativeWin: 250,
        wins: [{ symbol: 'MORPHEUS', win: 250, ways: 4, positions: contributors }],
        contributingPositions: contributors,
      },
    }),
    ...contributors.map((position, offset) => envelope({
      roundId, index: 3 + offset, type: 'positionMultiplierGridUpdate',
      cause: { eventIndex: offset === 0 ? 2 : 2 + offset, eventType: offset === 0 ? 'winInfo' : 'positionMultiplierGridUpdate' },
      affectedPositions: [position],
      payload: { resolutionId, position, previous: 1, current: 2 },
    })),
    envelope({
      roundId, index: 6, type: 'tumbleBoard',
      cause: { eventIndex: 5, eventType: 'positionMultiplierGridUpdate' },
      affectedPositions: contributors,
      blocking: {
        policy: 'required',
        acknowledgement: { id: 'ack:morpheus:proof:trickster-grid:tumble', status: 'acknowledged' },
      },
      transition: {
        before: { boardHash: hashMorpheusProtocolValue(board) },
        after: { boardHash: hashMorpheusProtocolValue(tumblePayload.boardAfter) },
      },
      payload: tumblePayload,
    }),
  ];
  return proofResult('tricksterGridSettlement', events);
}

export function createLucidFamilyMultiplierProofTrace() {
  const base = createDreamfallSignatureTrace();
  const roundId = 'morpheus:proof:lucid-family:001';
  const resolutionId = 'proof:lucid-family:resolution-1';
  const reelHeights = [4, 4, 4, 4, 4, 4];
  const board = normalizeBoard(base.events[0].payload.board);
  const gates = [{ reel: 2, row: 0 }, { reel: 3, row: 0 }, { reel: 4, row: 0 }, { reel: 5, row: 0 }];
  for (const position of gates) board[position.reel][position.row] = { name: 'GATE_OF_SLEEP' };
  const contributors = [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 1 }];
  for (const position of contributors) board[position.reel][position.row] = { name: 'POPPY' };
  const tumblePayload = {
    resolutionId, reelHeights, boardBefore: board, explodingSymbols: contributors,
    newSymbols: [[{ name: 'NYX' }], [{ name: 'OWL' }], [{ name: 'LAUREL' }], [], [], []],
  };
  tumblePayload.boardAfter = applyMorpheusTumble(board, tumblePayload);
  const events = [
    envelope({
      roundId, index: 0, type: 'guaranteedScatters',
      cause: { eventIndex: null, eventType: 'roundStart' }, affectedPositions: gates,
      payload: { count: 4, positions: gates, symbol: 'GATE_OF_SLEEP', tier: 'lucid_blessing' },
    }),
    envelope({
      roundId, index: 1, type: 'reveal', cause: { eventIndex: 0, eventType: 'guaranteedScatters' },
      transition: {
        before: { boardHash: hashMorpheusProtocolValue([]), reelHeights },
        after: { boardHash: hashMorpheusProtocolValue(board), reelHeights },
      },
      payload: {
        mode: 'lucid_blessing', featureTier: 'lucid_blessing', board, reelHeights,
        featureState: { tumbleChainHit: 0, freeSpinsRemaining: 10, totalTumbleFreeSpinsAwarded: 0 },
      },
    }),
    envelope({
      roundId, index: 2, type: 'winInfo', cause: { eventIndex: 1, eventType: 'reveal' },
      affectedPositions: contributors,
      transition: { before: { totalWinAmount: 0 }, after: { totalWinAmount: 300 } },
      payload: {
        resolutionId, totalWin: 300, cumulativeWin: 300,
        wins: [{ symbol: 'POPPY', win: 300, ways: 2, positions: contributors }],
        contributingPositions: contributors,
      },
    }),
    envelope({
      roundId, index: 3, type: 'symbolMultiplierUpdate',
      cause: { eventIndex: 2, eventType: 'winInfo' }, affectedPositions: contributors,
      payload: { resolutionId, symbolFamily: 'POPPY', previous: 1, current: 2 },
    }),
    envelope({
      roundId, index: 4, type: 'tumbleBoard',
      cause: { eventIndex: 3, eventType: 'symbolMultiplierUpdate' }, affectedPositions: contributors,
      blocking: {
        policy: 'required',
        acknowledgement: { id: 'ack:morpheus:proof:lucid-family:tumble', status: 'acknowledged' },
      },
      transition: {
        before: { boardHash: hashMorpheusProtocolValue(board) },
        after: { boardHash: hashMorpheusProtocolValue(tumblePayload.boardAfter) },
      },
      payload: tumblePayload,
    }),
  ];
  return proofResult('lucidFamilyMultiplierSettlement', events);
}

export function createVeilAscentUpgradeProofTrace() {
  const base = createDreamfallSignatureTrace();
  const roundId = 'morpheus:proof:veil-ascent-upgrade:001';
  const resolutionId = 'proof:veil-ascent-upgrade:resolution-1';
  const reelHeights = [4, 4, 4, 4, 4, 4];
  const board = normalizeBoard(base.events[0].payload.board);
  const gates = [{ reel: 2, row: 0 }, { reel: 3, row: 0 }, { reel: 4, row: 0 }];
  for (const position of gates) board[position.reel][position.row] = { name: 'GATE_OF_SLEEP' };
  const contributors = [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 5, row: 0 }];
  for (const position of contributors) board[position.reel][position.row] = { name: 'POPPY' };
  const upgradedBoard = replacePositions(board, contributors, 'LAUREL');
  const tumblePayload = {
    resolutionId, reelHeights, boardBefore: upgradedBoard, explodingSymbols: contributors,
    newSymbols: [[{ name: 'NYX' }], [{ name: 'OWL' }], [], [], [], [{ name: 'POPPY' }]],
  };
  tumblePayload.boardAfter = applyMorpheusTumble(upgradedBoard, tumblePayload);
  const events = [
    envelope({
      roundId, index: 0, type: 'guaranteedScatters',
      cause: { eventIndex: null, eventType: 'roundStart' }, affectedPositions: gates,
      payload: { count: 3, positions: gates, symbol: 'GATE_OF_SLEEP', tier: 'veil_ascent' },
    }),
    envelope({
      roundId, index: 1, type: 'reveal', cause: { eventIndex: 0, eventType: 'guaranteedScatters' },
      transition: {
        before: { boardHash: hashMorpheusProtocolValue([]), reelHeights },
        after: { boardHash: hashMorpheusProtocolValue(board), reelHeights },
      },
      payload: {
        mode: 'veil_ascent', featureTier: 'veil_ascent', board, reelHeights,
        featureState: {
          tumbleChainHit: 0, freeSpinsRemaining: 10, totalTumbleFreeSpinsAwarded: 0,
          symbolFamilyBars: { POPPY: 2 },
        },
      },
    }),
    envelope({
      roundId, index: 2, type: 'winInfo', cause: { eventIndex: 1, eventType: 'reveal' },
      affectedPositions: contributors,
      transition: { before: { totalWinAmount: 0 }, after: { totalWinAmount: 240 } },
      payload: {
        resolutionId, totalWin: 240, cumulativeWin: 240,
        wins: [{ symbol: 'POPPY', win: 240, ways: 2, positions: contributors }],
        contributingPositions: contributors,
      },
    }),
    envelope({
      roundId, index: 3, type: 'symbolBarProgress',
      cause: { eventIndex: 2, eventType: 'winInfo' }, affectedPositions: contributors,
      payload: { resolutionId, symbolFamily: 'POPPY', hits: contributors, previous: 2, current: 3, threshold: 3 },
    }),
    envelope({
      roundId, index: 4, type: 'symbolUpgrade',
      cause: { eventIndex: 3, eventType: 'symbolBarProgress' }, affectedPositions: contributors,
      transition: {
        before: { boardHash: hashMorpheusProtocolValue(board) },
        after: { boardHash: hashMorpheusProtocolValue(upgradedBoard) },
      },
      payload: {
        resolutionId, fromFamily: 'POPPY', toFamily: 'LAUREL', positions: contributors,
        boardBefore: board, boardAfter: upgradedBoard, reelHeights,
      },
    }),
    envelope({
      roundId, index: 5, type: 'tumbleBoard',
      cause: { eventIndex: 4, eventType: 'symbolUpgrade' }, affectedPositions: contributors,
      blocking: {
        policy: 'required',
        acknowledgement: { id: 'ack:morpheus:proof:veil-ascent-upgrade:tumble', status: 'acknowledged' },
      },
      transition: {
        before: { boardHash: hashMorpheusProtocolValue(upgradedBoard) },
        after: { boardHash: hashMorpheusProtocolValue(tumblePayload.boardAfter) },
      },
      payload: tumblePayload,
    }),
  ];
  return proofResult('veilAscentUpgrade', events);
}

function closePredeterminedProof({ routeId, roundId, mode, featureTier, declarations, board }) {
  const reelHeights = [4, 4, 4, 4, 4, 4];
  const resolutionId = `proof:${routeId}:resolution-1`;
  const contributors = [{ reel: 0, row: 3 }, { reel: 1, row: 3 }, { reel: 2, row: 3 }];
  for (const position of contributors) board[position.reel][position.row] = { name: 'MORPHEUS' };
  const tumblePayload = {
    resolutionId, reelHeights, boardBefore: board, explodingSymbols: contributors,
    newSymbols: [[{ name: 'NYX' }], [{ name: 'OWL' }], [{ name: 'LAUREL' }], [], [], []],
  };
  tumblePayload.boardAfter = applyMorpheusTumble(board, tumblePayload);
  const revealIndex = declarations.length;
  const events = [...declarations, envelope({
    roundId, index: revealIndex, type: 'reveal',
    cause: { eventIndex: revealIndex - 1, eventType: declarations.at(-1).type },
    transition: {
      before: { boardHash: hashMorpheusProtocolValue([]), reelHeights },
      after: { boardHash: hashMorpheusProtocolValue(board), reelHeights },
    },
    payload: {
      mode, featureTier, board, reelHeights,
      featureState: { tumbleChainHit: 0, freeSpinsRemaining: 0, totalTumbleFreeSpinsAwarded: 0 },
    },
  }), envelope({
    roundId, index: revealIndex + 1, type: 'winInfo',
    cause: { eventIndex: revealIndex, eventType: 'reveal' }, affectedPositions: contributors,
    transition: { before: { totalWinAmount: 0 }, after: { totalWinAmount: 250 } },
    payload: {
      resolutionId, totalWin: 250, cumulativeWin: 250,
      wins: [{ symbol: 'MORPHEUS', win: 250, ways: 4, positions: contributors }],
      contributingPositions: contributors,
    },
  }), envelope({
    roundId, index: revealIndex + 2, type: 'tumbleBoard',
    cause: { eventIndex: revealIndex + 1, eventType: 'winInfo' }, affectedPositions: contributors,
    blocking: {
      policy: 'required',
      acknowledgement: { id: `ack:morpheus:proof:${routeId}:tumble`, status: 'acknowledged' },
    },
    transition: {
      before: { boardHash: hashMorpheusProtocolValue(board) },
      after: { boardHash: hashMorpheusProtocolValue(tumblePayload.boardAfter) },
    },
    payload: tumblePayload,
  })];
  return proofResult(routeId, events);
}

export function createPredeterminedGeneratorProofTrace() {
  const roundId = 'morpheus:proof:predetermined-generators:001';
  const board = normalizeBoard(createDreamfallSignatureTrace().events[0].payload.board);
  const wilds = [
    { position: { reel: 1, row: 0 }, variant: 'RIFT_WILD' },
    { position: { reel: 4, row: 2 }, variant: 'VEIL_WILD' },
  ];
  for (const wild of wilds) board[wild.position.reel][wild.position.row] = { name: wild.variant };
  const stackedReels = [5];
  for (const reel of stackedReels) board[reel] = board[reel].map(() => ({ name: 'OWL' }));
  const declarations = [
    envelope({
      roundId, index: 0, type: 'rainingWilds', cause: { eventIndex: null, eventType: 'roundStart' },
      affectedPositions: wilds.map(wild => wild.position), payload: { wilds },
    }),
    envelope({
      roundId, index: 1, type: 'stackedReels', cause: { eventIndex: 0, eventType: 'rainingWilds' },
      affectedPositions: stackedReels.flatMap(reel => board[reel].map((_, row) => ({ reel, row }))),
      payload: { symbol: 'OWL', reels: stackedReels },
    }),
  ];
  return closePredeterminedProof({
    routeId: 'predeterminedGeneratorDeclarations', roundId, mode: 'base', featureTier: 'base', declarations, board,
  });
}

export function createNightmareReliquaryProofTrace() {
  const roundId = 'morpheus:proof:nightmare-reliquaries:001';
  const board = normalizeBoard(createDreamfallSignatureTrace().events[0].payload.board);
  const declared = [
    { special: 'MYSTERY_VEIL', position: { reel: 2, row: 0 } },
    { special: 'ONEIRIC_STAR', position: { reel: 3, row: 0 } },
    { special: 'GOLDEN_RIFT', position: { reel: 4, row: 0 } },
  ];
  for (const item of declared) board[item.position.reel][item.position.row] = { name: item.special };
  const declarations = declared.map((item, index) => envelope({
    roundId, index, type: 'guaranteedSpecialReveal',
    cause: index === 0 ? { eventIndex: null, eventType: 'roundStart' }
      : { eventIndex: index - 1, eventType: 'guaranteedSpecialReveal' },
    affectedPositions: [item.position],
    payload: { revealOrder: index + 1, special: item.special, targetPositions: [item.position] },
  }));
  return closePredeterminedProof({
    routeId: 'nightmareReliquaryDeclarations', roundId,
    mode: 'nightmare_descent', featureTier: 'nightmare_descent', declarations, board,
  });
}

/**
 * Deterministic mixed-special proof fixture. It freezes only the causal route:
 * Mystery reveals as POPPY, Star targets that declared family, the transformed
 * board enters Dreamfall growth, and the tumble waits for its acknowledgement.
 * It does not freeze production symbol weights or random-selection policy.
 */
export function createMysteryStarDreamfallProofTrace() {
  const base = createDreamfallSignatureTrace();
  const roundId = 'morpheus:proof:mystery-star-dreamfall:001';
  const resolutionId = 'proof:mystery-star-dreamfall:chain-5';
  const reelHeightsBefore = [4, 4, 4, 4, 4, 4];
  const revealBoard = normalizeBoard(base.events[0].payload.board);
  revealBoard[4][3] = { name: 'MYSTERY_VEIL' };
  revealBoard[5][3] = { name: 'ONEIRIC_STAR' };

  const mysteryPositions = [{ reel: 4, row: 3 }];
  const mysteryBoard = replacePositions(revealBoard, mysteryPositions, 'POPPY');
  const starSource = { reel: 5, row: 3 };
  const starTargets = positionsWithSymbol(mysteryBoard, 'POPPY');
  const starBoard = replacePositions(mysteryBoard, starTargets, 'RIFT_WILD');
  const reelHeightsAfter = [4, 4, 4, 5, 4, 4];
  const expandedBoard = normalizeBoard(starBoard);
  expandedBoard[3].unshift({ name: 'MOON_MOTH' });

  const contributors = clone(base.events[1].payload.contributingPositions);
  const tumblePayload = {
    resolutionId,
    reelHeights: reelHeightsAfter,
    boardBefore: expandedBoard,
    explodingSymbols: contributors,
    newSymbols: [[{ name: 'POPPY' }], [{ name: 'OWL' }], [{ name: 'LAUREL' }], [], [], []],
  };
  tumblePayload.boardAfter = applyMorpheusTumble(expandedBoard, tumblePayload);

  const events = [
    envelope({
      roundId,
      index: 0,
      type: 'reveal',
      cause: { eventIndex: null, eventType: 'roundStart' },
      transition: {
        before: { boardHash: hashMorpheusProtocolValue([]), reelHeights: reelHeightsBefore },
        after: { boardHash: hashMorpheusProtocolValue(revealBoard), reelHeights: reelHeightsBefore },
      },
      payload: {
        mode: 'dreamfall',
        featureTier: 'dreamfall',
        board: revealBoard,
        reelHeights: reelHeightsBefore,
        featureState: { tumbleChainHit: 4, freeSpinsRemaining: 6, totalTumbleFreeSpinsAwarded: 0 },
      },
    }),
    envelope({
      roundId,
      index: 1,
      type: 'winInfo',
      cause: { eventIndex: 0, eventType: 'reveal' },
      affectedPositions: contributors,
      transition: { before: { totalWinAmount: 0 }, after: { totalWinAmount: 250 } },
      payload: {
        resolutionId,
        totalWin: 250,
        cumulativeWin: 250,
        wins: [{ symbol: 'MORPHEUS', win: 250, ways: 4, positions: contributors }],
        contributingPositions: contributors,
      },
    }),
    envelope({
      roundId,
      index: 2,
      type: 'mysteryTransform',
      cause: { eventIndex: 1, eventType: 'winInfo' },
      affectedPositions: mysteryPositions,
      transition: {
        before: { boardHash: hashMorpheusProtocolValue(revealBoard) },
        after: { boardHash: hashMorpheusProtocolValue(mysteryBoard) },
      },
      payload: {
        resolutionId,
        originalSymbol: 'MYSTERY_VEIL',
        accountingIdentity: 'MYSTERY_VEIL',
        revealedAs: 'POPPY',
        positions: mysteryPositions,
        reelHeights: reelHeightsBefore,
        boardBefore: revealBoard,
        boardAfter: mysteryBoard,
      },
    }),
    envelope({
      roundId,
      index: 3,
      type: 'specialTargetSelected',
      cause: { eventIndex: 2, eventType: 'mysteryTransform' },
      affectedPositions: [starSource],
      payload: { resolutionId, special: 'ONEIRIC_STAR', targetFamily: 'POPPY' },
    }),
    envelope({
      roundId,
      index: 4,
      type: 'specialPositionsResolved',
      cause: { eventIndex: 3, eventType: 'specialTargetSelected' },
      affectedPositions: starTargets,
      transition: {
        before: { boardHash: hashMorpheusProtocolValue(mysteryBoard) },
        after: { boardHash: hashMorpheusProtocolValue(starBoard) },
      },
      payload: {
        resolutionId,
        special: 'ONEIRIC_STAR',
        sourcePosition: starSource,
        positions: starTargets,
        reelHeights: reelHeightsBefore,
        boardBefore: mysteryBoard,
        boardAfter: starBoard,
      },
    }),
    envelope({
      roundId,
      index: 5,
      type: 'expandReelHeight',
      cause: { eventIndex: 4, eventType: 'specialPositionsResolved' },
      affectedPositions: [{ reel: 3, row: 0 }],
      transition: {
        before: { reelHeights: reelHeightsBefore, boardHash: hashMorpheusProtocolValue(starBoard) },
        after: { reelHeights: reelHeightsAfter, boardHash: hashMorpheusProtocolValue(expandedBoard) },
      },
      payload: {
        resolutionId,
        reel: 3,
        previousRows: 4,
        rows: 5,
        maximumRows: 8,
        newSymbol: { name: 'MOON_MOTH' },
        reelHeightsBefore,
        reelHeightsAfter,
        boardBefore: starBoard,
        boardAfter: expandedBoard,
      },
    }),
    envelope({
      roundId,
      index: 6,
      type: 'tumbleChainProgress',
      cause: { eventIndex: 5, eventType: 'expandReelHeight' },
      affectedPositions: contributors,
      transition: { before: { tumbleChainHit: 4 }, after: { tumbleChainHit: 5 } },
      payload: { resolutionId, chainHit: 5, threshold: 5 },
    }),
    envelope({
      roundId,
      index: 7,
      type: 'awardTumbleFreeSpins',
      cause: { eventIndex: 6, eventType: 'tumbleChainProgress' },
      transition: {
        before: { freeSpinsRemaining: 6, totalTumbleFreeSpinsAwarded: 0 },
        after: { freeSpinsRemaining: 7, totalTumbleFreeSpinsAwarded: 1 },
      },
      payload: { resolutionId, chainHit: 5, amount: 1, totalAwarded: 1 },
    }),
    envelope({
      roundId,
      index: 8,
      type: 'tumbleBoard',
      cause: { eventIndex: 7, eventType: 'awardTumbleFreeSpins' },
      affectedPositions: contributors,
      blocking: {
        policy: 'required',
        acknowledgement: { id: 'ack:morpheus:proof:mixed:tumble-5', status: 'acknowledged' },
      },
      transition: {
        before: { boardHash: hashMorpheusProtocolValue(expandedBoard) },
        after: { boardHash: hashMorpheusProtocolValue(tumblePayload.boardAfter) },
      },
      payload: tumblePayload,
    }),
  ];

  return proofResult('mysteryStarDreamfallTumble', events);
}

/** Build the exact-cap terminal proof without changing production math books. */
export function createExactMaxTerminationProofTrace() {
  const base = createDreamfallSignatureTrace();
  const roundId = 'morpheus:proof:exact-max:001';
  const reveal = clone(base.events[0]);
  reveal.roundId = roundId;
  const contributors = clone(base.events[1].payload.contributingPositions);
  const visibleMaxBoard = replacePositions(reveal.payload.board, contributors, 'MAX_MORPHEUS');
  reveal.payload.board = visibleMaxBoard;
  reveal.transition.after.boardHash = hashMorpheusProtocolValue(visibleMaxBoard);
  const resolutionId = 'proof:exact-max:resolution-1';

  const events = [
    reveal,
    envelope({
      roundId,
      index: 1,
      type: 'winInfo',
      cause: { eventIndex: 0, eventType: 'reveal' },
      affectedPositions: contributors,
      transition: { before: { totalWinAmount: 0 }, after: { totalWinAmount: MORPHEUS_MAX_WIN_AMOUNT } },
      payload: {
        resolutionId,
        totalWin: MORPHEUS_MAX_WIN_AMOUNT,
        cumulativeWin: MORPHEUS_MAX_WIN_AMOUNT,
        wins: [{
          symbol: 'MAX_MORPHEUS',
          win: MORPHEUS_MAX_WIN_AMOUNT,
          ways: 1,
          positions: contributors,
        }],
        contributingPositions: contributors,
      },
    }),
    envelope({
      roundId,
      index: 2,
      type: 'maxWinReached',
      cause: { eventIndex: 1, eventType: 'winInfo' },
      affectedPositions: contributors,
      blocking: {
        policy: 'required',
        acknowledgement: { id: 'ack:morpheus:proof:exact-max', status: 'acknowledged' },
      },
      transition: { before: { terminal: false }, after: { terminal: true } },
      payload: {
        amount: MORPHEUS_MAX_WIN_AMOUNT,
        multiplier: MORPHEUS_MAX_WIN_MULTIPLIER,
        terminalCause: 'MAX_MORPHEUS',
      },
    }),
    envelope({
      roundId,
      index: 3,
      type: 'roundTerminated',
      cause: { eventIndex: 2, eventType: 'maxWinReached' },
      transition: { before: { terminated: false }, after: { terminated: true } },
      payload: {
        amount: MORPHEUS_MAX_WIN_AMOUNT,
        multiplier: MORPHEUS_MAX_WIN_MULTIPLIER,
        terminalCause: 'MAX_MORPHEUS',
      },
    }),
  ];

  return proofResult('exactMaxTermination', events);
}
