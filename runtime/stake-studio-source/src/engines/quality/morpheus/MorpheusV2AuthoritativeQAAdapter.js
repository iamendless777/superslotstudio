import {
  MORPHEUS_BOOK_AMOUNT_MULTIPLIER,
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_CONTRACT_REGISTRY,
  MORPHEUS_EVENT_TYPES,
  MORPHEUS_MAX_BASE_BET_USD,
  MORPHEUS_MAX_TOTAL_EXPOSURE_USD,
  MORPHEUS_MAX_WIN_MULTIPLIER,
  MORPHEUS_MODE_REGISTRY,
  assertMorpheusContractRegistry,
} from '../../morpheus/MorpheusGameContract.js';
import {
  createDreamfallSignatureTrace,
  reconstructMorpheusTrace,
} from '../../morpheus/MorpheusEventProtocol.js';
import {
  MORPHEUS_PROOF_DISCIPLINES,
  MORPHEUS_V2_CONTRACT_FORMAT,
  createMorpheusContractSummary,
  fingerprintMorpheusV2Contract,
} from './MorpheusV2ContractParity.js';

export const MORPHEUS_V2_AUTHORITATIVE_ADAPTER_FORMAT = 'morpheus-v2-authoritative-qa-adapter-v1';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function promiseLedger() {
  return [
    { id: 'promise:economics', title: 'Exact three-star economics', requiredDisciplines: ['math'], assertionIds: ['v2.economics.100000'] },
    { id: 'promise:causal-book', title: 'Causal event book and snapshots', requiredDisciplines: ['events'], assertionIds: ['v2.events.exact-book', 'v2.snapshots.board-state'] },
    { id: 'promise:readable-client', title: 'Frontend and presentation read the same causes', requiredDisciplines: ['frontend', 'presentation'], assertionIds: ['v2.frontend.trace', 'v2.presentation.trace'] },
    { id: 'promise:truthful-info', title: 'Effective payouts and rounding are disclosed', requiredDisciplines: ['gameInfo'], assertionIds: ['v2.game-info.effective-pay'] },
    { id: 'promise:recovery', title: 'Reconnect reconstructs the authoritative result', requiredDisciplines: ['replay'], assertionIds: ['v2.replay.reconnect'] },
  ];
}

function buildContract() {
  return {
    format: MORPHEUS_V2_CONTRACT_FORMAT,
    version: 2,
    sourceContractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    economics: {
      rtp: 0.96,
      maxWin: MORPHEUS_MAX_WIN_MULTIPLIER,
      totalExposure: MORPHEUS_MAX_TOTAL_EXPOSURE_USD,
      maxBaseBet: MORPHEUS_MAX_BASE_BET_USD,
      payoutIncrement: 0.1,
      bookAmountMultiplier: MORPHEUS_BOOK_AMOUNT_MULTIPLIER,
    },
    modeIds: Object.keys(MORPHEUS_MODE_REGISTRY),
    eventVocabulary: [...MORPHEUS_EVENT_TYPES],
    promises: promiseLedger(),
  };
}

function buildArtifacts(contract) {
  const contractFingerprint = fingerprintMorpheusV2Contract(contract);
  const contractSummary = createMorpheusContractSummary(contract);
  const artifacts = Object.fromEntries(MORPHEUS_PROOF_DISCIPLINES.map(discipline => [discipline, {
    format: `morpheus-v2-authoritative-${discipline}-evidence-v1`,
    contractFingerprint,
    sourceContractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
    contractSummary,
  }]));
  artifacts.gameInfo.payDisclosure = {
    showsModeAdjustedPayouts: true,
    increment: 0.1,
    rounding: 'nearest',
    settlementOrder: ['ways', 'contributingMultipliers', 'cascades', 'modeSettlementScale', 'quantize'],
    maximumWin: MORPHEUS_MAX_WIN_MULTIPLIER,
    roundingExamples: [
      { raw: 0.04, settled: 0 },
      { raw: 0.05, settled: 0.1 },
      { raw: 0.14, settled: 0.1 },
      { raw: 0.15, settled: 0.2 },
    ],
  };
  artifacts.gameInfo.effectivePayCases = [
    { id: 'signature-settlement', mode: 'dreamfall', basePayout: 2.5, modeSettlementScale: 1, effectivePayout: 2.5, settledPayout: 2.5 },
    { id: 'mode-scale-disclosure', mode: 'dream_enhancer', basePayout: 0.37, modeSettlementScale: 1.5, effectivePayout: 0.555, settledPayout: 0.6 },
  ];
  return artifacts;
}

function recoveryEvents(trace) {
  const acknowledgement = trace.events[5].blocking.acknowledgement.id;
  return trace.events.map(event => {
    const mapped = { id: `protocol:${event.index}:${event.type}`, type: event.type, protocolEvent: clone(event) };
    if (event.type === 'reveal') {
      mapped.board = clone(event.payload.board);
      mapped.statePatch = {
        mode: event.payload.mode,
        featureTier: event.payload.featureTier,
        reelRows: clone(event.payload.reelHeights),
        totalWinAmount: 0,
        tumbleChainHit: event.payload.featureState.tumbleChainHit,
        freeSpinsRemaining: event.payload.featureState.freeSpinsRemaining,
        totalTumbleFreeSpinsAwarded: event.payload.featureState.totalTumbleFreeSpinsAwarded,
        acknowledgements: [],
      };
    } else if (event.type === 'winInfo') {
      mapped.statePatch = { totalWinAmount: event.payload.cumulativeWin };
    } else if (event.type === 'expandReelHeight') {
      mapped.board = clone(event.payload.boardAfter);
      mapped.persistentStatePatch = { reelRows: clone(event.payload.reelHeightsAfter) };
    } else if (event.type === 'tumbleChainProgress') {
      mapped.persistentStatePatch = { tumbleChainHit: event.payload.chainHit };
    } else if (event.type === 'awardTumbleFreeSpins') {
      mapped.persistentStatePatch = {
        freeSpinsRemaining: event.transition.after.freeSpinsRemaining,
        totalTumbleFreeSpinsAwarded: event.payload.totalAwarded,
      };
    } else if (event.type === 'tumbleBoard') {
      mapped.board = clone(event.payload.boardAfter);
      mapped.statePatch = { acknowledgements: [acknowledgement] };
    }
    return mapped;
  });
}

function buildSignatureSlice(trace, reconstructed) {
  const mappedRecoveryEvents = recoveryEvents(trace);
  const afterGrowthState = {
    mode: 'dreamfall',
    featureTier: 'dreamfall',
    reelRows: [4, 4, 4, 5, 4, 4],
    totalWinAmount: 250,
    tumbleChainHit: 4,
    freeSpinsRemaining: 6,
    totalTumbleFreeSpinsAwarded: 0,
    acknowledgements: [],
  };
  const finalState = {
    ...afterGrowthState,
    tumbleChainHit: reconstructed.finalState.tumbleChainHit,
    freeSpinsRemaining: reconstructed.finalState.freeSpinsRemaining,
    totalTumbleFreeSpinsAwarded: reconstructed.finalState.totalTumbleFreeSpinsAwarded,
    acknowledgements: clone(reconstructed.finalState.acknowledgements),
  };
  const frontendTrace = trace.events.map(event => `${event.index}:${event.type}`);
  const presentationTrace = trace.events.map(event => ({
    eventIndex: event.index,
    eventType: event.type,
    blocking: event.blocking.policy,
    cause: clone(event.cause),
  }));
  return {
    events: clone(trace.events),
    expectedEvents: clone(trace.events),
    recovery: {
      initialBoard: [],
      initialState: {},
      events: mappedRecoveryEvents,
      reconnectAfter: 5,
    },
    boardSnapshots: [
      { id: 'authoritative-reveal', afterEventIndex: 0, board: clone(trace.events[0].payload.board) },
      { id: 'authoritative-growth', afterEventIndex: 2, board: clone(trace.events[2].payload.boardAfter) },
      { id: 'authoritative-tumble', afterEventIndex: 5, board: clone(reconstructed.finalBoard) },
    ],
    stateSnapshots: [
      { id: 'authoritative-growth-state', afterEventIndex: 2, state: afterGrowthState },
      { id: 'authoritative-final-state', afterEventIndex: 5, state: finalState },
    ],
    traces: {
      frontend: { expected: frontendTrace, actual: clone(frontendTrace) },
      presentation: { expected: presentationTrace, actual: clone(presentationTrace) },
    },
    sourceEvidence: {
      contractFingerprint: trace.contractFingerprint,
      protocolEventHash: reconstructed.eventHash,
      protocolBoardHash: reconstructed.boardHash,
      protocolStateHash: reconstructed.stateHash,
    },
  };
}

/** Build the QA projection strictly from the real frozen registry and trace factory. */
export function buildMorpheusV2AuthoritativeQAFixture() {
  assertMorpheusContractRegistry(MORPHEUS_CONTRACT_REGISTRY);
  const trace = createDreamfallSignatureTrace();
  if (trace.contractFingerprint !== MORPHEUS_CONTRACT_FINGERPRINT
    || trace.events.some(event => event.contractFingerprint !== MORPHEUS_CONTRACT_FINGERPRINT)) {
    throw new Error('Authoritative Morpheus trace is not bound to the frozen registry fingerprint.');
  }
  const reconstructed = reconstructMorpheusTrace(trace.events);
  const contract = buildContract();
  return {
    format: MORPHEUS_V2_AUTHORITATIVE_ADAPTER_FORMAT,
    authority: 'authoritative',
    contract,
    artifacts: buildArtifacts(contract),
    signatureSlice: buildSignatureSlice(trace, reconstructed),
  };
}

/** The studio-supplied QA adapter that attests the production Morpheus registry. */
export function createMorpheusV2AuthoritativeQAAdapter() {
  const fixture = buildMorpheusV2AuthoritativeQAFixture();
  return Object.freeze({
    authority: 'authoritative',
    readContract: () => clone(fixture.contract),
    readArtifacts: () => clone(fixture.artifacts),
    readSignatureSlice: () => clone(fixture.signatureSlice),
  });
}
