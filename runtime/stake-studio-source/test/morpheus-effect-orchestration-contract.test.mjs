import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_EVENT_TYPES,
  MORPHEUS_MAX_WIN_AMOUNT,
  MORPHEUS_MODE_REGISTRY,
  MORPHEUS_SPECIAL_SYMBOLS,
} from '../src/engines/morpheus/MorpheusGameContract.js';
import {
  CONTRACT_DETAIL_REQUIRED,
  MORPHEUS_ASSET_SLOT_TYPES,
  MORPHEUS_EFFECT_ORCHESTRATION_CONTRACT,
  MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY,
  MORPHEUS_EFFECT_ORCHESTRATIONS,
  MORPHEUS_ORCHESTRATION_PROOF_ROUTES,
  MORPHEUS_PRIORITY_LADDER,
  assertMorpheusEffectOrchestrationContract,
} from '../src/engines/morpheus/MorpheusEffectOrchestrationContract.js';

const clone = value => JSON.parse(JSON.stringify(value));

test('Morpheus effect orchestration binds the exact frozen contract and deterministic P0-P8 ladder', () => {
  assert.equal(assertMorpheusEffectOrchestrationContract(), true);
  assert.equal(MORPHEUS_EFFECT_ORCHESTRATION_CONTRACT.fingerprint, MORPHEUS_CONTRACT_FINGERPRINT);
  assert.deepEqual(Object.keys(MORPHEUS_PRIORITY_LADDER), ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
  assert.deepEqual(Object.values(MORPHEUS_PRIORITY_LADDER).map(priority => priority.rank), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(Object.isFrozen(MORPHEUS_EFFECT_ORCHESTRATION_CONTRACT), true);
  assert.equal(Object.isFrozen(MORPHEUS_EFFECT_ORCHESTRATIONS[0].assets), true);
});

test('registry covers every foundation/frozen event, mode journey, and special-symbol variant', () => {
  const coveredEvents = new Set(MORPHEUS_EFFECT_ORCHESTRATIONS.flatMap(entry => entry.eventTypes));
  const coveredModes = new Set(MORPHEUS_EFFECT_ORCHESTRATIONS.flatMap(entry => entry.modes));
  const coveredSpecials = new Set(MORPHEUS_EFFECT_ORCHESTRATIONS.flatMap(entry => entry.symbols));

  assert.deepEqual([...MORPHEUS_EVENT_TYPES].filter(type => !coveredEvents.has(type)), []);
  assert.deepEqual(Object.keys(MORPHEUS_MODE_REGISTRY).filter(mode => !coveredModes.has(mode)), []);
  assert.deepEqual(MORPHEUS_SPECIAL_SYMBOLS.filter(symbol => !coveredSpecials.has(symbol)), []);
  assert.equal(new Set(MORPHEUS_EFFECT_ORCHESTRATIONS.map(entry => entry.id)).size, MORPHEUS_EFFECT_ORCHESTRATIONS.length);
});

test('every effect declares authored asset slots, motion modes, barriers, concurrency, replay, and reconnect', () => {
  for (const entry of MORPHEUS_EFFECT_ORCHESTRATIONS) {
    assert.deepEqual(Object.keys(entry.assets), MORPHEUS_ASSET_SLOT_TYPES, `${entry.id} asset slots`);
    for (const [slotType, slot] of Object.entries(entry.assets)) {
      assert.ok(['required', 'not-applicable', 'explicit-silence', CONTRACT_DETAIL_REQUIRED].includes(slot.status), `${entry.id}.${slotType}`);
      if (slot.status === 'required') assert.ok(slot.ids.length > 0, `${entry.id}.${slotType} authored id`);
      for (const id of slot.ids) {
        assert.match(id, /^morpheus\./);
        assert.doesNotMatch(id, /(^|[.\-_])(generic|fallback|default)([.\-_]|$)/i);
      }
    }
    assert.deepEqual(Object.keys(entry.presentation.timing), ['normal', 'fast', 'reduced', 'none']);
    assert.ok(entry.presentation.blocking);
    assert.ok(entry.presentation.concurrency);
    assert.equal(entry.recovery.replay, 'required-idempotent');
    assert.equal(entry.recovery.reconnect, 'required-idempotent');
    assert.equal(entry.recovery.alreadyAppliedMutation, 'render-without-reapplying');
    assert.ok(entry.settlementScope);
  }
});

test('unfrozen mechanics are surfaced as contract-detail-required instead of guessed', () => {
  const requiredDetails = [
    ['mystery.transform', 'candidateSetAndAccountingLifetime'],
    ['special.veil-wild', 'protectedSetAndMultipleVeils'],
    ['special.lucid-wild', 'valueWeightsAndComposition'],
    ['special.dream-rift', 'edgeOverlapAndSourceRetention'],
    ['special.echo-split', 'duplicationWaysWildAndNoSpace'],
    ['special.dawn-purge', 'lowSetAndRefillConstraintLifetime'],
    ['dreamfall.expand-reel-height', 'allReelsAtMaximumBehavior'],
    ['mode.dream_enhancer.journey', 'enhancerSearchEvent'],
    ['mode.nightmare_descent.journey', 'releasePrice'],
    ['mode.dreamfall.journey', 'releasePrice'],
  ];

  for (const [id, field] of requiredDetails) {
    const detail = MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY[id].unresolved.find(item => item.field === field);
    assert.equal(detail?.status, CONTRACT_DETAIL_REQUIRED, `${id}.${field}`);
  }
});

test('settlement ownership distinguishes current-win arithmetic from next-board mutations', () => {
  const scopes = Object.fromEntries([
    'mystery.transform', 'star.target-selected', 'special.veil-wild', 'special.lucid-wild',
    'special.dream-rift', 'special.golden-rift', 'special.echo-split', 'special.dawn-purge',
    'special.oneiric-star-resolve',
  ].map(id => [id, MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY[id].settlementScope]));
  assert.deepEqual(scopes, {
    'mystery.transform': 'next-board-only',
    'star.target-selected': 'next-board-only',
    'special.veil-wild': 'next-board-only',
    'special.lucid-wild': 'current-settlement',
    'special.dream-rift': 'next-board-only',
    'special.golden-rift': 'next-board-only',
    'special.echo-split': 'current-settlement',
    'special.dawn-purge': 'next-board-only',
    'special.oneiric-star-resolve': 'next-board-only',
  });
});

test('Mystery -> Star -> Dreamfall -> tumble proof route is sequential and ends in authoritative acknowledgement', () => {
  const route = MORPHEUS_ORCHESTRATION_PROOF_ROUTES.mysteryStarDreamfallTumble;
  assert.equal(route.contractFingerprint, MORPHEUS_CONTRACT_FINGERPRINT);
  assert.deepEqual(route.steps.map(step => step.eventType), [
    'reveal', 'winInfo', 'mysteryTransform', 'specialTargetSelected', 'specialPositionsResolved',
    'expandReelHeight', 'tumbleChainProgress', 'awardTumbleFreeSpins', 'tumbleBoard',
  ]);
  assert.equal(route.concurrency, 'sequential-authoritative-commits; cosmetics-only-after-commit');
  assert.equal(route.requiredFinalAcknowledgement, 'authoritative-event-acknowledgement');
  assert.equal(MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY[route.steps.at(-1).orchestrationId].presentation.blocking, 'required');
});

test('exact 100,000x proof route preempts tumble and terminates deliberately', () => {
  const route = MORPHEUS_ORCHESTRATION_PROOF_ROUTES.exactMaxTermination;
  assert.equal(route.requiredMultiplier, 100_000);
  assert.equal(route.requiredAmount, MORPHEUS_MAX_WIN_AMOUNT);
  assert.equal(route.requiredAmount, 10_000_000);
  assert.deepEqual(route.steps.map(step => step.eventType), ['reveal', 'winInfo', 'maxWinReached', 'roundTerminated']);
  assert.ok(route.forbiddenAfterMax.includes('tumbleBoard'));
  assert.equal(MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY['max.max-win-reached'].priority, 'P0');
  assert.equal(MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY['max.max-win-reached'].presentation.concurrency, 'exclusive-terminal');
  assert.equal(MORPHEUS_EFFECT_ORCHESTRATION_REGISTRY['max.max-win-reached'].terminal.onlyNextEvent, 'roundTerminated');
});

test('validator rejects fingerprint drift, duplicate ids, unknown events, priority drift, and silent generic fallback', () => {
  const base = clone(MORPHEUS_EFFECT_ORCHESTRATION_CONTRACT);

  const fingerprint = clone(base);
  fingerprint.fingerprint = 'morpheus-game-info-v1';
  assert.throws(() => assertMorpheusEffectOrchestrationContract(fingerprint), /fingerprint mismatch/);

  const duplicate = clone(base);
  duplicate.entries.push(clone(duplicate.entries[0]));
  assert.throws(() => assertMorpheusEffectOrchestrationContract(duplicate), /ids must be unique/);

  const unknown = clone(base);
  unknown.entries[0].eventTypes = ['inventedPresentationEvent'];
  assert.throws(() => assertMorpheusEffectOrchestrationContract(unknown), /unknown event type/);

  const priority = clone(base);
  priority.priorityLadder.P4.rank = 99;
  assert.throws(() => assertMorpheusEffectOrchestrationContract(priority), /priority ranks must be deterministic/);

  const fallback = clone(base);
  fallback.entries[0].assets.motion.ids = ['morpheus.generic.fallback-glow'];
  assert.throws(() => assertMorpheusEffectOrchestrationContract(fallback), /silently uses a generic fallback/);
});
