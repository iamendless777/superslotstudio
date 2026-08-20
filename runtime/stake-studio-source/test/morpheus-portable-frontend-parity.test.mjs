import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createGameProject } from '../src/engines/schema.js';
import {
  createExactMaxTerminationProofTrace,
  createMysteryStarDreamfallProofTrace,
} from '../src/engines/morpheus/MorpheusEffectProofTraces.js';
import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_EVENT_TYPES,
} from '../src/engines/morpheus/MorpheusGameContract.js';
import {
  createMorpheusPortableFrontendEvidence,
  evaluateMorpheusPortableFrontendQA,
} from '../src/engines/quality/morpheus/MorpheusPortableFrontendQA.js';
import {
  createMorpheusPortableSession,
  runMorpheusPortableProjection,
} from '../server/frontend-runtime/morpheus-authoritative-entry.js';
import {
  compileFrontendProject,
  createFrontendConfig,
  FRONTEND_COMPILER_VERSION,
} from '../server/frontend-compiler.mjs';

test('portable runtime preserves typed envelopes and blocks dispatch until rendered acknowledgement', () => {
  const trace = createMysteryStarDreamfallProofTrace();
  const session = createMorpheusPortableSession({ events: trace.events, motionMode: 'normal' });
  const first = session.dispatch(trace.events[0]);
  assert.deepEqual(first.sourceEvent, trace.events[0]);
  assert.equal(first.presentationEvent.morpheusAuthoritative.contractFingerprint, MORPHEUS_CONTRACT_FINGERPRINT);
  assert.deepEqual(first.presentationEvent.board, trace.events[0].payload.board);
  assert.throws(() => session.dispatch(trace.events[1]), /before acknowledging/);
  session.acknowledge({ id: first.command.acknowledgementId, evidence: 'rendered:first' });
  const second = session.dispatch(trace.events[1]);
  assert.equal(second.presentationEvent.totalWin, 250);
  assert.equal(second.presentationEvent.wins[0].symbol, 'MORPHEUS');

  session.acknowledge({ id: second.command.acknowledgementId, evidence: 'rendered:win' });
  const mystery = session.dispatch(trace.events[2]);
  session.acknowledge({ id: mystery.command.acknowledgementId, evidence: 'rendered:mystery' });
  const target = session.dispatch(trace.events[3]);
  assert.deepEqual(target.presentationEvent.sources, trace.events[3].affectedPositions,
    'portable target tell must launch from the authoritative ONEIRIC_STAR tile');
  assert.equal(target.presentationEvent.target, 'POPPY');
});

test('portable mixed and terminal projections equal the governed Preview authority in every motion mode', () => {
  const evidence = createMorpheusPortableFrontendEvidence({
    runProjection: runMorpheusPortableProjection,
    runtimeFile: 'morpheus-authoritative-runtime.js',
    bundleSha256: 'a'.repeat(64),
  });
  assert.equal(evidence.passed, true, evidence.issues.join('\n'));
  assert.equal(evaluateMorpheusPortableFrontendQA(evidence).passed, true);
  assert.equal(evidence.routes.mysteryStarDreamfallTumble.eventCount, 9);
  assert.equal(evidence.routes.exactMaxTermination.eventCount, 4);
  assert.equal(evidence.routes.exactMaxTermination.motionModes.normal.protocolStateHash, 'a150b176');
  assert.equal(evidence.routes.exactMaxTermination.motionModes.normal.eventHash, '97db83cc');
});

test('portable runtime rejects route drift, fingerprint drift, and post-MAX mutation before presentation', () => {
  const terminal = createExactMaxTerminationProofTrace();
  const drifted = structuredClone(terminal.events);
  drifted[1].contractFingerprint = 'morpheus-stale-contract';
  const session = createMorpheusPortableSession({ events: drifted, motionMode: 'none' });
  const first = session.dispatch(drifted[0]);
  session.acknowledge({ id: first.command.acknowledgementId, evidence: 'rendered:first' });
  assert.throws(() => session.dispatch(drifted[1]), /fingerprint mismatch/);
  assert.throws(() => createMorpheusPortableSession({
    events: [...terminal.events, terminal.events[0]], motionMode: 'none',
  }), /does not identify one governed route/);
});

test('Morpheus frontend config enables the lazy authoritative runtime without changing other games', () => {
  const morpheus = createGameProject({ name: 'Morpheus Portable Config' });
  morpheus.build.stakeEngine.gameId = 'morpheus_dreamfall';
  const morpheusConfig = createFrontendConfig(morpheus);
  assert.equal(morpheusConfig.authoritativeRuntime.enabled, true);
  assert.equal(morpheusConfig.authoritativeRuntime.contractFingerprint, MORPHEUS_CONTRACT_FINGERPRINT);
  assert.deepEqual(morpheusConfig.authoritativeRuntime.routeIds, ['predeterminedGeneratorDeclarations', 'nightmareReliquaryDeclarations', 'lucidFamilyMultiplierSettlement', 'tricksterGridSettlement', 'mysteryStarDreamfallTumble', 'exactMaxTermination']);
  assert.equal(morpheusConfig.authoritativeRuntime.productionContractParity.passed, false);
  assert.match(morpheusConfig.authoritativeRuntime.productionContractParity.issues.join(' '), /approved contract requires 100000x/);
  assert.equal(morpheusConfig.renderProfiles.morpheusDreamfall.cell.aspectRatio, 1);

  const other = createGameProject({ name: 'Portable Control' });
  other.build.stakeEngine.gameId = 'portable_control';
  assert.deepEqual(createFrontendConfig(other).authoritativeRuntime, { enabled: false });
});

test('compiler bundles and executes the authoritative runtime and records immutable parity evidence', async () => {
  const home = mkdtempSync(join(tmpdir(), 'morpheus-portable-frontend-'));
  try {
    const root = join(home, 'games', 'morpheus_dreamfall');
    mkdirSync(root, { recursive: true });
    const project = createGameProject({ name: 'MORPHEUS: DREAMFALL' });
    project.build.stakeEngine.gameId = 'morpheus_dreamfall';
    writeFileSync(join(root, 'project.json'), JSON.stringify(project));

    const result = await compileFrontendProject({ studioHome: home, projectId: 'morpheus_dreamfall' });
    assert.equal(result.version, FRONTEND_COMPILER_VERSION);
    assert.equal(result.capabilities.authoritativeMorpheusEvents, true);
    assert.ok(result.files.includes('morpheus-authoritative-runtime.js'));
    assert.ok(result.files.includes('morpheus-authoritative-qa.json'));
    assert.equal(result.initialFiles.includes('morpheus-authoritative-runtime.js'), false, 'runtime must remain lazy-loaded');
    assert.equal(result.initialFiles.includes('morpheus-authoritative-qa.json'), false, 'QA routes must never join the casino first load');
    const config = JSON.parse(readFileSync(join(root, 'frontend', 'game-config.json'), 'utf8'));
    assert.equal(config.authoritativeRuntime.verification.passed, true, config.authoritativeRuntime.verification.issues.join('\n'));
    assert.equal(evaluateMorpheusPortableFrontendQA(config.authoritativeRuntime.verification).passed, true);

    const bundlePath = join(root, 'frontend', 'morpheus-authoritative-runtime.js');
    const portable = await import(`${pathToFileURL(bundlePath).href}?test=${Date.now()}`);
    const terminal = portable.runMorpheusPortableProjection(createExactMaxTerminationProofTrace().events, { motionMode: 'none' });
    assert.equal(terminal.contractFingerprint, MORPHEUS_CONTRACT_FINGERPRINT);
    assert.equal(terminal.protocolEvidence.finalState.terminated, true);
    assert.equal(terminal.protocolEvidence.finalState.totalWinAmount, 10_000_000);
    const qaBook = JSON.parse(readFileSync(join(root, 'frontend', 'morpheus-authoritative-qa.json'), 'utf8'));
    assert.equal(qaBook.contractFingerprint, MORPHEUS_CONTRACT_FINGERPRINT);
    assert.deepEqual(Object.keys(qaBook.routes).sort(), ['exactMaxTermination', 'lucidFamilyMultiplierSettlement', 'mysteryStarDreamfallTumble', 'nightmareReliquaryDeclarations', 'predeterminedGeneratorDeclarations', 'tricksterGridSettlement', 'veilAscentUpgrade']);
    assert.deepEqual(qaBook.routes.veilAscentUpgrade.events.map(event => event.type), [
      'guaranteedScatters', 'reveal', 'winInfo', 'symbolBarProgress', 'symbolUpgrade', 'tumbleBoard',
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('compiled template routes typed envelopes through the portable session and renders exact terminal semantics', () => {
  const source = readFileSync(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  assert.match(source, /presentMorpheusAuthoritative/);
  assert.match(source, /createMorpheusPortableSession/);
  assert.match(source, /catalog: config\.authoritativeRuntime\.presentationCatalog/);
  assert.match(source, /compiled-rendered:/);
  for (const stage of ['dispatching', 'rendering-dom', 'rendering-governed-plan', 'acknowledging', 'acknowledged', 'completed']) {
    assert.match(source, new RegExp(`['\"]${stage}['\"]`));
  }
  assert.match(source, /loadMorpheusAuthoritativeQaRoute/);
  assert.match(source, /runtime\.launch\.studioPreview/);
  assert.match(source, /case 'mysteryTransform':[\s\S]{0,240}playBoardTransform/);
  assert.match(source, /case 'specialPositionsResolved':[\s\S]{0,600}playBoardTransform/);
  assert.match(source, /case 'expandReelHeight':[\s\S]{0,400}settleReelMotion/);
  assert.match(source, /case 'maxWinReached':[\s\S]{0,500}showFeatureFinale/);
  assert.match(source, /case 'roundTerminated'/);
});

test('portable template has an explicit presentation branch for every authoritative Morpheus event', () => {
  const source = readFileSync(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  for (const eventType of MORPHEUS_EVENT_TYPES) {
    assert.match(source, new RegExp(`case ['"]${eventType}['"]:`), `${eventType} must have an explicit portable presentation branch`);
  }
  assert.match(source, /case 'guaranteedSpecialReveal':[\s\S]{0,420}targetPositions/);
  assert.match(source, /case 'symbolBarProgress':[\s\S]{0,420}event\.hits/);
  assert.match(source, /case 'rainingWilds':[\s\S]{0,420}event\.wilds/);
  assert.match(source, /case 'stackedReels':[\s\S]{0,600}currentBoard/);
  assert.match(source, /case 'guaranteedScatters':[\s\S]{0,420}event\.positions/);
  const expansionBranch = source.match(/case 'expandReelHeight':[\s\S]*?case 'tumbleChainProgress':/)?.[0] || '';
  assert.equal((expansionBranch.match(/settleReelMotion\(event\.board, instant, event\.anticipation\)/g) || []).length, 1,
    'authoritative reel growth must settle the board once');
});
