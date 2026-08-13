import {
  morpheusV2ArtifactsFixture,
  morpheusV2ContractFixture,
} from './morpheus-v2-foundation-fixture.mjs';

function oldBoard() {
  return [
    ['MORPHEUS', 'OBOL', 'POPPY', 'LAUREL'],
    ['NYX', 'OBOL', 'HOURGLASS', 'POPPY'],
    ['OWL', 'OBOL', 'DREAM_MASK', 'LAUREL'],
    ['HYPNOS', 'POPPY', 'MOON_MOTH', 'OBOL'],
    ['LAUREL', 'OWL', 'POPPY', 'OBOL'],
    ['OBOL', 'NYX', 'LAUREL', 'POPPY'],
  ];
}

function expandedBoard() {
  const board = oldBoard();
  board[2] = ['MOON_MOTH', ...board[2]];
  return board;
}

export function morpheusV2SignatureSliceFixture() {
  const before = oldBoard();
  const after = expandedBoard();
  const initialState = { reelRows: [4, 4, 4, 4, 4, 4], totalWin: 0, tumbleChain: 0 };
  const expandedState = { reelRows: [4, 4, 5, 4, 4, 4], totalWin: 1.2, tumbleChain: 1 };
  const events = [
    { index: 0, id: 'reveal', type: 'reveal', board: before, finalAuthoritativeSymbols: true },
    {
      index: 1, id: 'settled-win', type: 'winInfo', amount: 1.2,
      wins: [{ symbol: 'OBOL', positions: [{ reel: 0, row: 1 }, { reel: 1, row: 1 }, { reel: 2, row: 1 }] }],
      statePatch: { totalWin: 1.2, tumbleChain: 1 },
    },
    {
      index: 2, id: 'reel-expansion', type: 'expandReelHeight', reel: 2,
      previousRows: 4, rows: 5, maximumRows: 8, sourceWinEvent: 1,
      persistentStatePatch: { reelRows: [4, 4, 5, 4, 4, 4] },
    },
    { index: 3, id: 'next-tumble', type: 'tumbleBoard', board: after, acknowledgedEvent: 2 },
    { index: 4, id: 'settlement', type: 'setTotalWin', amount: 1.2 },
    { index: 5, id: 'round-end', type: 'finalWin', amount: 1.2 },
  ];
  return {
    events,
    expectedEvents: JSON.parse(JSON.stringify(events)),
    recovery: { initialBoard: before, initialState, reconnectAfter: 3 },
    boardSnapshots: [
      { id: 'landed', afterEventIndex: 0, board: JSON.parse(JSON.stringify(before)) },
      { id: 'height-committed-before-tumble', afterEventIndex: 2, board: JSON.parse(JSON.stringify(before)) },
      { id: 'expanded-tumble', afterEventIndex: 3, board: JSON.parse(JSON.stringify(after)) },
    ],
    stateSnapshots: [
      { id: 'expanded-state', afterEventIndex: 2, state: expandedState },
      { id: 'settled-state', afterEventIndex: 5, state: expandedState },
    ],
    traces: {
      frontend: {
        expected: ['reveal:6x4', 'win:1.2', 'expand:reel2:4>5', 'tumble:reel2:5', 'settle:1.2'],
        actual: ['reveal:6x4', 'win:1.2', 'expand:reel2:4>5', 'tumble:reel2:5', 'settle:1.2'],
      },
      presentation: {
        expected: [
          { event: 'reveal', cue: 'board-landed' },
          { event: 'winInfo', cue: 'positive-win-readable' },
          { event: 'expandReelHeight', cue: 'shaft-rise-acknowledged' },
          { event: 'tumbleBoard', cue: 'next-tumble-after-ack' },
        ],
        actual: [
          { event: 'reveal', cue: 'board-landed' },
          { event: 'winInfo', cue: 'positive-win-readable' },
          { event: 'expandReelHeight', cue: 'shaft-rise-acknowledged' },
          { event: 'tumbleBoard', cue: 'next-tumble-after-ack' },
        ],
      },
    },
  };
}

export function morpheusV2FoundationInputFixture() {
  const contract = morpheusV2ContractFixture();
  const artifacts = morpheusV2ArtifactsFixture(contract);
  artifacts.gameInfo.payDisclosure = {
    showsModeAdjustedPayouts: true,
    increment: 0.1,
    rounding: 'nearest',
    settlementOrder: ['ways', 'contributingMultipliers', 'cascades', 'modeSettlementScale', 'quantize'],
    maximumWin: 100000,
    roundingExamples: [
      { raw: 0.04, settled: 0 },
      { raw: 0.05, settled: 0.1 },
      { raw: 0.14, settled: 0.1 },
      { raw: 0.15, settled: 0.2 },
    ],
  };
  artifacts.gameInfo.effectivePayCases = [
    { id: 'base-example', mode: 'base', basePayout: 0.37, modeSettlementScale: 1, effectivePayout: 0.37, settledPayout: 0.4 },
    { id: 'enhanced-example', mode: 'dream_enhancer', basePayout: 0.37, modeSettlementScale: 1.5, effectivePayout: 0.555, settledPayout: 0.6 },
  ];
  return { contract, artifacts, signatureSlice: morpheusV2SignatureSliceFixture() };
}
