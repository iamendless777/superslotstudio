import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSET_ORCHESTRATION_FORMAT,
  evaluateAssetOrchestrationQA,
  getAssetOrchestrationFingerprint,
  getAssetOrchestrationSummary,
  recordAssetOrchestrationQA,
} from '../src/engines/quality/AssetOrchestrationQA.js';

const EVENTS = [
  'reveal', 'winInfo', 'tumbleBoard', 'modeGridStart', 'positionMultiplierGridUpdate',
  'guaranteedSpecialReveal', 'symbolBarProgress', 'symbolUpgrade', 'symbolMultiplierUpdate',
  'expandReelHeight', 'tumbleChainProgress', 'awardTumbleFreeSpins', 'rainingWilds',
  'stackedReels', 'guaranteedScatters', 'mysteryTransform', 'specialTargetSelected',
  'specialPositionsResolved', 'maxWinReached', 'roundTerminated',
];

const MECHANICS = ['dreamfallReelGrowth', 'dreamfallTumbleAwards', 'dreamRift'];
const VIEWPORTS = ['desktop', 'mobile', 'mini'];
const ROWS = [4, 5, 6, 7, 8];
const sha = character => character.repeat(64);
const clone = value => JSON.parse(JSON.stringify(value));

function authority() {
  return {
    contractFingerprint: 'morpheus-game-info-v4-100000x-cost-aware-tail-20260811',
    requiredEventCount: 20,
    eventTypes: [...EVENTS],
    mechanicIds: [...MECHANICS],
    eventDefinitions: Object.fromEntries(EVENTS.map(eventType => [eventType, {
      acknowledgement: ['tumbleBoard', 'maxWinReached'].includes(eventType) ? 'required' : 'none',
    }])),
    viewports: [...VIEWPORTS],
    rowStates: [...ROWS],
    captureRequiredEventTypes: [...EVENTS],
  };
}

function project() {
  return {
    id: 'morpheus_dreamfall',
    theme: {
      symbols: [{ name: 'RIFT_WILD', src: 'data:image/png;base64,current', motionAssetId: 'dreamfall.motion.living-rift-core' }],
      cabinet: { layers: [{ id: 'background', type: 'image', assetPackRole: 'background', src: 'data:image/png;base64,current-bg' }] },
      presentationAssets: { modePortal: 'data:image/webp;base64,portal' },
    },
    animation: { visualEffects: { motionAssets: [], bindings: [] } },
    presentationDirector: { recipes: [] },
    audio: { layers: {}, stingers: {} },
    build: { frontend: { manifest: [] } },
    production: { qa: {} },
  };
}

function lineage(id, sourceSha, runtimeSha = sourceSha, packagedSha = runtimeSha) {
  return {
    source: { path: `masters/${id}.png`, sha256: sourceSha },
    runtime: { path: `runtime/${id}.png`, sha256: runtimeSha, derivedFromSha256: sourceSha },
    packaged: { path: `assets/${id}.png`, sha256: packagedSha, derivedFromSha256: runtimeSha },
  };
}

function filesFor(assets) {
  return {
    saved: assets.flatMap(asset => ['source', 'runtime'].map(lifecycle => ({
      assetId: asset.id,
      lifecycle,
      path: asset.lineage[lifecycle].path,
      sha256: asset.lineage[lifecycle].sha256,
    }))),
    packaged: assets.map(asset => ({
      assetId: asset.id,
      lifecycle: 'packaged',
      path: asset.lineage.packaged.path,
      sha256: asset.lineage.packaged.sha256,
    })),
  };
}

function renderSample(assetId, viewport, rows = null, size = 50) {
  return {
    id: `${assetId}:${viewport}${rows ? `:rows-${rows}` : ''}`,
    assetId,
    viewport,
    ...(rows ? { rows } : {}),
    intrinsic: { width: 100, height: 100 },
    rendered: { width: size, height: size },
    scaleX: size / 100,
    scaleY: size / 100,
    cropRatio: 0,
    edgeClipped: false,
    decoded: true,
    painted: true,
  };
}

function completeChoreography(eventType, index) {
  const acknowledgement = ['tumbleBoard', 'maxWinReached'].includes(eventType) ? 'required' : 'none';
  return {
    eventType,
    mechanicIds: [MECHANICS[index % MECHANICS.length]],
    decision: 'choreography',
    visual: { decision: 'asset', assetIds: ['signature-symbol'] },
    motion: { decision: 'none', rationale: 'Semantic state change is rendered without decorative motion.' },
    audio: { decision: 'silence', rationale: 'Intentional silence preserves the causal read.' },
    fallback: { decision: 'asset', assetId: 'world-background' },
    causal: {
      stages: [{ id: 'apply-authoritative-event', order: 0 }],
      acknowledgement,
      ...(acknowledgement === 'required' ? { acknowledgementEvidence: `ack:${eventType}` } : {}),
      noLateMutation: true,
      proofId: `causal:${eventType}`,
    },
    collision: {
      measured: true,
      policy: 'serialize',
      evidenceId: `collision:${eventType}`,
      forbiddenCombinations: ['hud-controls', 'reel-cells'],
    },
    recovery: {
      cancellation: 'settle-current-stage',
      reconnect: 'reconstruct-from-checkpoint',
      skip: 'apply-semantic-final-frame',
      lateMutation: 'forbidden',
      proofId: `recovery:${eventType}`,
    },
    nfr: { targetFps: 60, maxLiveObjects: 32, maxParticles: 16, proofId: `nfr:${eventType}` },
  };
}

function completeEvidence(value) {
  const assets = [
    {
      id: 'world-background', role: 'world', allowedRoles: ['world'], displayed: true,
      requiredInPackage: true,
      semantic: { eventTypes: [...EVENTS], mechanicIds: [] },
      lineage: lineage('world-background', sha('1')),
    },
    {
      id: 'signature-symbol', role: 'symbol', allowedRoles: ['symbol'], displayed: true,
      requiredInPackage: true,
      semantic: { eventTypes: [...EVENTS], mechanicIds: [...MECHANICS] },
      reuse: { declared: true, rationale: 'One governed test asset represents declared multi-mechanic reuse.' },
      lineage: lineage('signature-symbol', sha('2')),
    },
  ];
  const renderSamples = [
    ...VIEWPORTS.map(viewport => renderSample('world-background', viewport)),
    ...VIEWPORTS.flatMap(viewport => ROWS.map(rows => renderSample('signature-symbol', viewport, rows))),
  ];
  const choreographies = EVENTS.map(completeChoreography);
  const captureBindings = EVENTS.map(eventType => ({
    eventType,
    activeAssetIds: ['signature-symbol'],
    motionRecipeId: '',
    audioCueIds: [],
    sourceEventHash: '1234abcd',
    boardHash: '2345bcde',
    stateHash: '3456cdef',
    transformSampleIds: ['signature-symbol:desktop:rows-4'],
    collisionEvidenceId: `collision:${eventType}`,
    fallbackEvidenceId: `fallback:${eventType}`,
    packagedSha256: { 'signature-symbol': sha('2') },
  }));
  const interactionDispositions = [];
  const interactionScenarios = [];
  for (let left = 0; left < MECHANICS.length; left++) {
    for (let right = left + 1; right < MECHANICS.length; right++) {
      const pair = [MECHANICS[left], MECHANICS[right]];
      const id = `scenario:${pair.join('+')}`;
      interactionDispositions.push({ mechanics: pair, disposition: 'scenario', scenarioId: id });
      interactionScenarios.push({
        id, mechanics: pair, passed: true, eventOrder: ['reveal', 'winInfo', 'tumbleBoard'],
        forbiddenOverlapsChecked: true, recoveryProofId: `recovery:${id}`,
        hashes: { event: '4567def0', board: '5678ef01', state: '6789f012' },
      });
    }
  }
  const evidence = {
    format: ASSET_ORCHESTRATION_FORMAT,
    authority: authority(),
    assets,
    files: filesFor(assets),
    renderSamples,
    choreographies,
    captureBindings,
    interactionDispositions,
    interactionScenarios,
    nfr: {
      performanceBudgetProofId: 'performance:peak-8-row',
      textureBudgetProofId: 'texture:decoded-assets',
      reducedMotionProofId: 'motion:normal-fast-reduced-none',
      recoveryProofId: 'recovery:reconnect-replay',
    },
  };
  evidence.fingerprint = getAssetOrchestrationFingerprint(value, evidence);
  return evidence;
}

function currentMorpheusGapEvidence(value) {
  const embedded = (path, digest) => ({ path, sha256: digest, embedded: true });
  const packaged = (path, digest, derivedFromSha256) => ({ path, sha256: digest, derivedFromSha256 });
  const currentBackgroundSha = 'efecc4bafefbfc9fbf3a86e30c41c5b81dd86c7d4d9d7182bd76fa71f77828ad';
  const staleNamedBackgroundSha = '40fbbccc0a6e067b194e598a2a682d5abd6f802d2a7a77f2b94cab56f6625222';
  const currentRiftSha = '9e2d8130ea4822adf694822f2cca3359ee3f15b666e411fed1514e1fc84634a2';
  const staleNamedRiftSha = '6619790d2f9ed61aa3d6f54a819e5f4dc80486bd82ade751d664926b7e6df12e';
  const foregroundSha = '2e02ff4fc2a3a3b6d3ca1693f72eaad5af416b1c3e8f43c5740afac1d44b6456';
  const background = {
    id: 'cabinet-background', role: 'world', allowedRoles: ['world'], displayed: false,
    semantic: { eventTypes: [...EVENTS], mechanicIds: [] },
    lineage: {
      source: embedded('project:theme.cabinet.background', currentBackgroundSha),
      runtime: { path: 'assets/runtime/background-v1.png', sha256: staleNamedBackgroundSha, derivedFromSha256: staleNamedBackgroundSha },
      packaged: packaged('assets/cabinet/efecc4bafefbfc9fbf3a86e3.png', currentBackgroundSha, currentBackgroundSha),
    },
  };
  const rift = {
    id: 'RIFT_WILD', role: 'symbol', allowedRoles: ['symbol'], displayed: true,
    semantic: { eventTypes: ['reveal', 'specialPositionsResolved'], mechanicIds: ['dreamRift'] },
    lineage: {
      source: embedded('project:theme.symbols.RIFT_WILD', currentRiftSha),
      runtime: { path: 'assets/runtime/rift-wild-v1.png', sha256: staleNamedRiftSha, derivedFromSha256: staleNamedRiftSha },
      packaged: packaged('assets/symbols/9e2d8130ea4822adf694822f.png', currentRiftSha, currentRiftSha),
    },
  };
  const foreground = {
    id: 'cabinet-foreground', role: 'foreground', allowedRoles: ['foreground'], displayed: true,
    semantic: { eventTypes: [...EVENTS], mechanicIds: [] },
    lineage: {
      source: embedded('project:theme.cabinet.foreground', foregroundSha),
      runtime: { path: 'assets/runtime/cabinet-inner-pillars-v1.png', sha256: foregroundSha, derivedFromSha256: foregroundSha },
    },
  };
  const environments = ['flora-left', 'flora-right', 'crown-sigil'].map((id, index) => ({
    id, role: 'environment', allowedRoles: ['environment'], displayed: true,
    semantic: { eventTypes: [...EVENTS], mechanicIds: [] },
    lineage: { source: embedded(`project:theme.environmentAssets.${id}`, [
      '381003180b81ad42aceac2ceed4cfaf8b3d97770bd85d9c5500c7f5cd54b6eb8',
      'b0fdf2278ce458d15c462198fb8c7a99bb44f328bc0df72a74a1d6fee2945523',
      'e7bc36484f81b8a58b83321f7d5e8a7af61495a116714720403827e7f346cdb5',
    ][index]) },
  }));
  const livingRift = {
    id: 'living-rift-core', role: 'motion', allowedRoles: ['motion'], displayed: false,
    semantic: { eventTypes: ['winInfo', 'specialPositionsResolved'], mechanicIds: [...MECHANICS] },
    lineage: lineage('living-rift-core', '248a422b764b05ccbd1557d5b6af3c4dfa1a9c7db76e562d423afd5706ec789e'),
  };
  const modePortal = {
    id: 'mode-portal', role: 'presentation', allowedRoles: ['presentation'], displayed: false,
    semantic: { eventTypes: ['guaranteedScatters', 'maxWinReached'], mechanicIds: [] },
    lineage: lineage('mode-portal', '7d706106296a13d337aa818fba31b2b97a02f6da9841dd5655505d8148ee87dd'),
  };
  const assets = [background, rift, foreground, ...environments, livingRift, modePortal];
  const files = {
    saved: assets.flatMap(asset => lineageEntriesForTest(asset, ['source', 'runtime'])),
    packaged: assets.flatMap(asset => lineageEntriesForTest(asset, ['packaged'])),
  };
  files.saved.push({ assetId: '', lifecycle: 'source', path: 'assets/visual/background-v1.png', sha256: 'cf6672f852e8aba7340f7483c0ef91dd25054e4de59cc961c4ef8f616dc9fd23' });
  files.packaged.push({ assetId: '', lifecycle: 'packaged', path: 'assets/morpheus-mode-card-v1.png', sha256: '93d9a74ef69790adcc8f273ee7ffe7a044a43ebb65e2460737db108f2a10cb4c' });

  const renderSamples = VIEWPORTS.flatMap(viewport => ROWS.map(rows => {
    const sample = renderSample('RIFT_WILD', viewport, rows);
    if (viewport === 'mini' && rows === 8) {
      sample.rendered = { width: 25, height: 18 };
      sample.scaleX = 0.25;
      sample.scaleY = 0.18;
    }
    return sample;
  }));
  const choreographies = [
    legacyCurrentChoreography('reveal', 'cabinet-background'),
    legacyCurrentChoreography('winInfo', 'living-rift-core', {
      motion: { decision: 'recipe', recipeId: 'dreamfall.oneiric-win-impact', bindingEvent: 'winInfo', enabled: false },
    }),
    legacyCurrentChoreography('tumbleBoard', 'cabinet-background'),
    legacyCurrentChoreography('guaranteedScatters', 'mode-portal', {
      motion: { decision: 'recipe', recipeId: 'dreamfall.gate-awakening', bindingEvent: 'freeSpinTrigger', enabled: true },
    }),
    legacyCurrentChoreography('maxWinReached', 'mode-portal', {
      motion: { decision: 'recipe', recipeId: 'dreamfall.sovereign-verdict', bindingEvent: 'wincap', enabled: true },
    }),
  ];
  const captureBindings = choreographies.map(choreography => ({
    eventType: choreography.eventType,
    activeAssetIds: choreography.visual.assetIds,
    motionRecipeId: choreography.motion.decision === 'recipe' ? choreography.motion.recipeId : '',
    audioCueIds: [], sourceEventHash: '1234abcd', boardHash: '2345bcde', stateHash: '3456cdef',
    transformSampleIds: choreography.visual.assetIds.includes('RIFT_WILD') ? ['RIFT_WILD:mini:rows-8'] : [],
    collisionEvidenceId: `collision:${choreography.eventType}`,
    fallbackEvidenceId: `fallback:${choreography.eventType}`,
    packagedSha256: Object.fromEntries(choreography.visual.assetIds.map(id => [id, assets.find(asset => asset.id === id)?.lineage?.packaged?.sha256 || ''])),
  }));
  const evidence = {
    format: ASSET_ORCHESTRATION_FORMAT,
    authority: authority(), assets, files, renderSamples, choreographies, captureBindings,
    interactionDispositions: [], interactionScenarios: [], nfr: {},
  };
  evidence.fingerprint = getAssetOrchestrationFingerprint(value, evidence);
  return evidence;
}

function lineageEntriesForTest(asset, lifecycles) {
  return lifecycles.flatMap(lifecycle => {
    const entry = asset.lineage?.[lifecycle];
    if (!entry || entry.embedded === true) return [];
    return [{ assetId: asset.id, lifecycle, path: entry.path, sha256: entry.sha256 }];
  });
}

function legacyCurrentChoreography(eventType, assetId, overrides = {}) {
  const required = ['tumbleBoard', 'maxWinReached'].includes(eventType);
  return {
    eventType, mechanicIds: [], decision: 'choreography',
    visual: { decision: 'asset', assetIds: [assetId] },
    motion: { decision: 'none', rationale: 'No dedicated effect.' },
    audio: { decision: 'silence', rationale: 'No authoritative cue mapping.' },
    fallback: { decision: 'text', text: eventType },
    causal: {
      stages: [{ id: 'present', order: 0 }], acknowledgement: required ? 'required' : 'none',
      ...(required ? { acknowledgementEvidence: `ack:${eventType}` } : {}),
      noLateMutation: true, proofId: `causal:${eventType}`,
    },
    collision: { measured: true, policy: 'serialize', evidenceId: `collision:${eventType}`, forbiddenCombinations: [] },
    recovery: { cancellation: 'cancel', reconnect: 'rebuild', skip: 'semantic-final', lateMutation: 'forbidden', proofId: `recovery:${eventType}` },
    nfr: { targetFps: 60, maxLiveObjects: 32, maxParticles: 16, proofId: `nfr:${eventType}` },
    ...overrides,
  };
}

test('complete synthetic 20-event orchestration passes every reusable gate', () => {
  const value = project();
  const evidence = completeEvidence(value);
  const result = evaluateAssetOrchestrationQA(value, evidence);
  assert.equal(result.passed, true, result.issues.join('\n'));
  assert.deepEqual(result.counts, {
    assets: 2,
    savedFiles: 4,
    packagedFiles: 2,
    renderSamples: 18,
    authoritativeEvents: 20,
    choreographyDecisions: 20,
    captureBindings: 20,
    interactionPairs: 3,
    requiredInteractionPairs: 3,
    sourceInventoryFiles: 0,
  });
});

test('flagship contracts may require an explicit legal interaction graph without demanding impossible all-pairs coverage', () => {
  const value = project();
  const evidence = completeEvidence(value);
  evidence.authority.requiredInteractionPairs = [[MECHANICS[0], MECHANICS[1]]];
  evidence.interactionDispositions = evidence.interactionDispositions.filter(item => item.mechanics.includes(MECHANICS[0]) && item.mechanics.includes(MECHANICS[1]));
  evidence.interactionScenarios = evidence.interactionScenarios.filter(item => item.mechanics.includes(MECHANICS[0]) && item.mechanics.includes(MECHANICS[1]));
  evidence.fingerprint = getAssetOrchestrationFingerprint(value, evidence);
  const result = evaluateAssetOrchestrationQA(value, evidence);
  assert.equal(result.passed, true, result.issues.join('\n'));
  assert.equal(result.counts.interactionPairs, 3);
  assert.equal(result.counts.requiredInteractionPairs, 1);
});

test('current Morpheus evidence fails deterministically for the known asset and choreography gaps', () => {
  const value = project();
  const evidence = currentMorpheusGapEvidence(value);
  const first = evaluateAssetOrchestrationQA(value, evidence);
  const second = evaluateAssetOrchestrationQA(value, clone(evidence));
  assert.equal(first.passed, false);
  assert.deepEqual(second.diagnostics, first.diagnostics);
  const ids = new Set(first.diagnostics.map(item => item.id));
  for (const id of [
    'lineage.stale-runtime:cabinet-background',
    'lineage.stale-runtime:RIFT_WILD',
    'lineage.missing-package:cabinet-foreground',
    'lineage.missing-package:flora-left',
    'lineage.missing-package:flora-right',
    'lineage.missing-package:crown-sigil',
    'registry.orphan-saved:assets/visual/background-v1.png',
    'registry.orphan-packaged:assets/morpheus-mode-card-v1.png',
    'semantic.undeclared-overload:living-rift-core',
    'render.nonuniform-scale:RIFT_WILD:mini:rows-8',
    'choreography.motion-disabled:winInfo',
    'choreography.legacy-binding:guaranteedScatters',
    'choreography.legacy-binding:maxWinReached',
    'choreography.missing:modeGridStart',
    'capture.missing:roundTerminated',
    'interaction.missing:dreamRift::dreamfallReelGrowth',
    'nfr.missing:reducedMotionProofId',
  ]) assert.equal(ids.has(id), true, `missing deterministic diagnostic ${id}`);
});

test('nonuniform scaling is capped at 2% unless the exact sample is approved', () => {
  const value = project();
  const evidence = completeEvidence(value);
  const sample = evidence.renderSamples.find(item => item.id === 'signature-symbol:mini:rows-8');
  sample.rendered.height = 40;
  sample.scaleY = 0.4;
  evidence.fingerprint = getAssetOrchestrationFingerprint(value, evidence);
  let result = evaluateAssetOrchestrationQA(value, evidence);
  assert.equal(result.diagnostics.some(item => item.id === 'render.nonuniform-scale:signature-symbol:mini:rows-8'), true);
  sample.nonuniformScaleApproved = true;
  evidence.fingerprint = getAssetOrchestrationFingerprint(value, evidence);
  result = evaluateAssetOrchestrationQA(value, evidence);
  assert.equal(result.passed, true, result.issues.join('\n'));
});

test('recorded orchestration evidence is fresh only for the exact governed project fingerprint', () => {
  const value = project();
  const summary = recordAssetOrchestrationQA(value, completeEvidence(value));
  assert.equal(summary.complete, true);
  assert.equal(summary.fresh, true);
  value.theme.symbols[0].motionAssetId = 'drifted-motion';
  const stale = getAssetOrchestrationSummary(value);
  assert.equal(stale.complete, false);
  assert.equal(stale.stale, true);
});
