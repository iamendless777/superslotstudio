import {
  MORPHEUS_PROOF_DISCIPLINES,
  MORPHEUS_V2_CONTRACT_FORMAT,
  createMorpheusContractSummary,
  fingerprintMorpheusV2Contract,
} from '../../src/engines/quality/morpheus/MorpheusV2ContractParity.js';

export function morpheusV2ContractFixture() {
  return {
    format: MORPHEUS_V2_CONTRACT_FORMAT,
    version: 2,
    economics: { rtp: 0.96, maxWin: 100000, totalExposure: 50000000, maxBaseBet: 500, payoutIncrement: 0.1 },
    modeIds: [
      'base', 'dream_enhancer', 'trickster_dream', 'nightmare_descent',
      'veil_ascent', 'lucid_blessing', 'dreamfall', 'oneiric_nexus',
    ],
    eventVocabulary: [
      'reveal', 'winInfo', 'tumbleBoard', 'modeGridStart', 'positionMultiplierGridUpdate', 'guaranteedSpecialReveal',
      'symbolBarProgress', 'symbolUpgrade', 'symbolMultiplierUpdate', 'expandReelHeight',
      'tumbleChainProgress', 'awardTumbleFreeSpins', 'rainingWilds', 'stackedReels',
      'guaranteedScatters', 'mysteryTransform', 'specialTargetSelected', 'specialPositionsResolved',
      'maxWinReached', 'roundTerminated',
    ],
    promises: [
      { id: 'promise:economics', title: 'Exact three-star economics', requiredDisciplines: ['math'], assertionIds: ['v2.economics.100000'] },
      { id: 'promise:causal-book', title: 'Causal event book and snapshots', requiredDisciplines: ['events'], assertionIds: ['v2.events.exact-book', 'v2.snapshots.board-state'] },
      { id: 'promise:readable-client', title: 'Frontend and presentation read the same causes', requiredDisciplines: ['frontend', 'presentation'], assertionIds: ['v2.frontend.trace', 'v2.presentation.trace'] },
      { id: 'promise:truthful-info', title: 'Effective payouts and rounding are disclosed', requiredDisciplines: ['gameInfo'], assertionIds: ['v2.game-info.effective-pay'] },
      { id: 'promise:recovery', title: 'Reconnect reconstructs the authoritative result', requiredDisciplines: ['replay'], assertionIds: ['v2.replay.reconnect'] },
    ],
  };
}

export function morpheusV2ArtifactsFixture(contract) {
  const fingerprint = fingerprintMorpheusV2Contract(contract);
  const contractSummary = createMorpheusContractSummary(contract);
  return Object.fromEntries(MORPHEUS_PROOF_DISCIPLINES.map(discipline => [discipline, {
    format: `fixture:${discipline}`,
    contractFingerprint: fingerprint,
    contractSummary,
  }]));
}
