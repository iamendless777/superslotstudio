import { applyCreativeConcept, generateOfflineConcepts } from '../creative/CreativeDirector.js';
import { GAME_BLUEPRINTS } from '../blueprints/GameBlueprintEngine.js';
import { getCreativeFactoryGate } from './FactoryRunEngine.js';
import {
  initializeFlagshipFromConcept,
  setProductionTrack,
} from './FlagshipWorkflow.js';

export const FACTORY_LAUNCH_FORMAT = 'stake-studio-factory-launch-v1';
export const STICKY_REELS_CONTRACT_FORMAT = 'stake-studio-sticky-reels-contract-v1';

const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');

function applyStickyReelsContract(project) {
  project.production ||= {};
  project.production.mechanicContracts ||= {};
  project.production.mechanicContracts.stickyReels = {
    format: STICKY_REELS_CONTRACT_FORMAT,
    status: 'preserved-design-contract',
    executable: false,
    releaseBlocker: 'Port and verify the preserved sticky-reel event/state model before release math is published.',
    scope: 'originating feature/RGS round only',
    aggregation: 'additive across contributing claimed reel multipliers',
    rules: [
      'The result/book controls reel, value, and persistence; presentation never decides them.',
      'Temporary claimed multiplier reels clear after the spin.',
      'Sticky multiplier reels persist only inside the originating feature and never into later paid play.',
      'A sticky reel multiplier never decreases; upgrades identify the previous and new values.',
      'Replay and reconnect restore the exact claimed-reel multiplier map.',
    ],
    featureTiers: [
      { id: 'I', freeSpins: 8, stickyRule: 'none' },
      { id: 'II', freeSpins: 10, stickyRule: 'optional' },
      { id: 'III', freeSpins: 12, stickyRule: 'at least one by the end of feature spin three' },
    ],
  };
  return project.production.mechanicContracts.stickyReels;
}

export function validateFactoryLaunchOptions(options = {}) {
  const name = clean(options.name);
  const premise = clean(options.premise);
  const providerName = clean(options.providerName);
  if (!name) throw new Error('A game name is required.');
  if (!premise) throw new Error('A concrete game premise is required.');
  if (!providerName) throw new Error('Set the real provider name before launching the factory. StakeStudio will not invent provider identity.');
  const blueprintId = clean(options.blueprintId);
  if (blueprintId && !GAME_BLUEPRINTS[blueprintId]) throw new Error(`Unknown game blueprint "${blueprintId}".`);
  const productionTrack = options.productionTrack === 'flagship' ? 'flagship' : 'blueprint';
  return { name, premise, providerName, blueprintId, productionTrack };
}

export function prepareFactoryLaunch(project, options = {}) {
  const { name, premise, providerName, blueprintId, productionTrack } = validateFactoryLaunchOptions({ ...options, name: options.name ?? project.name });

  project.name = name;
  const candidates = generateOfflineConcepts(project, {
    premise,
    tone: clean(options.tone) || 'cinematic',
    audience: clean(options.audience) || 'adult slot players',
    providerName,
    seed: clean(options.seed) || name,
    blueprintId,
  });
  const requestedIndex = Math.max(0, Math.min(candidates.length - 1, Number.parseInt(options.conceptIndex, 10) || 0));
  const concept = candidates[requestedIndex];
  const applied = applyCreativeConcept(project, concept.id, {
    compileBlueprint: productionTrack === 'blueprint',
    renameProject: false,
    providerName,
  });
  const mechanicContractId = clean(options.mechanicContractId);
  const mechanicContract = mechanicContractId === 'sticky-reels' ? applyStickyReelsContract(project) : null;
  if (productionTrack === 'flagship') initializeFlagshipFromConcept(project, { premise, concept });
  else setProductionTrack(project, 'blueprint');
  const gate = getCreativeFactoryGate(project);
  if (!gate.complete) throw new Error(gate.message);

  const launchedAt = new Date().toISOString();
  project.factoryLaunch = {
    format: FACTORY_LAUNCH_FORMAT,
    premise,
    tone: clean(options.tone) || 'cinematic',
    providerName,
    conceptId: concept.id,
    blueprintId: concept.blueprintId,
    productionTrack,
    mechanicContractId: mechanicContract ? 'sticky-reels' : null,
    mechanicStatus: mechanicContract?.status || null,
    artBibleFingerprint: applied.artBibleFingerprint,
    launchedAt,
  };
  return {
    project: { name: project.name, gameId: project.build?.stakeEngine?.gameId || null },
    concept: {
      id: concept.id,
      title: concept.title,
      tagline: concept.tagline,
      blueprintId: concept.blueprintId,
      blueprintName: concept.blueprintName,
      productionTrack,
      playerHook: concept.playerHook,
      signatureMoment: concept.signatureMoment,
    },
    providerName,
    artBibleFingerprint: applied.artBibleFingerprint,
    creativeGate: gate,
    mechanicContract,
    launchedAt,
  };
}
