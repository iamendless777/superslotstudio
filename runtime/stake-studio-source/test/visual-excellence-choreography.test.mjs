import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE_CONNECTION_PHASES,
  TUMBLE_PHASES,
  createChoreographyAcknowledgement,
  createAspectPreservingOverlayRect,
  createTileConnectionPlan,
  createTumblePlan,
  normalizeReelGeometry,
  resolveCellAnchor,
  resolvePlanInterruption,
  validateConnectionGraph,
  validateTumbleInput,
} from '../src/engines/presentation/visual-excellence/index.js';

function variableGeometry() {
  return {
    coordinateSpace: { x: 0, y: 0, width: 500, height: 420 },
    reels: [
      { reel: 0, x: 10, y: 20, width: 90, height: 300, rows: [{ height: 70 }, { height: 100 }, { height: 130 }] },
      { reel: 1, x: 110, y: 20, width: 110, height: 300, rows: [{ height: 60 }, { height: 80 }, { height: 70 }, { height: 90 }] },
      { reel: 2, x: 230, y: 20, width: 120, height: 300, rows: [{ height: 150 }, { height: 150 }] },
    ],
  };
}

test('motion overlays preserve source aspect in rectangular base cells without discarding authored offsets', () => {
  const result = createAspectPreservingOverlayRect({
    cellRect: { x: 100, y: 50, width: 75, height: 90 },
    overlay: { left: 10, top: -5, width: 80, height: 120 },
    sourceAspectRatio: 1,
  });
  assert.deepEqual(result.bounds, { x: 107.5, y: 45.5, width: 60, height: 108 });
  assert.equal(result.safe.width, 60);
  assert.equal(result.safe.height, 60);
  assert.equal(result.safe.x, 107.5);
  assert.equal(result.safe.y, 69.5);
  assert.equal(result.safe.width / result.safe.height, 1);
});

test('current reel geometry resolves variable row counts and row heights without consulting a board', () => {
  const geometry = normalizeReelGeometry(variableGeometry());
  assert.equal(geometry.cells.length, 9);
  assert.deepEqual(resolveCellAnchor(geometry, { reel: 0, row: 1 }), {
    x: 55,
    y: 140,
    anchor: 'center',
    bounds: { x: 10, y: 90, width: 90, height: 100 },
  });
  assert.deepEqual(resolveCellAnchor(geometry, { reel: 1, row: 3 }, 'bottom'), {
    x: 165,
    y: 320,
    anchor: 'bottom',
    bounds: { x: 110, y: 230, width: 110, height: 90 },
  });
  assert.throws(() => resolveCellAnchor(geometry, { reel: 2, row: 3 }), /absent from the current reel geometry/);
});

test('connection graph rejects missing authoritative relationships instead of inferring from final board state', () => {
  const issues = validateConnectionGraph({
    finalBoard: [['A', 'A']],
    eventPositions: [{ reel: 0, row: 0 }, { reel: 1, row: 0 }],
  });
  assert.ok(issues.some(item => item.code === 'edges-required' && item.severity === 'error'));
  assert.throws(() => createTileConnectionPlan({
    eventId: 'link-1',
    finalBoard: [['A', 'A']],
    eventPositions: [{ reel: 0, row: 0 }, { reel: 1, row: 0 }],
    reelGeometry: variableGeometry(),
  }), /authoritative relationship edge/);
});

test('connection plan normalizes event graph deterministically and resolves exact routes', () => {
  const base = {
    eventId: 'link-42',
    reelGeometry: variableGeometry(),
    intensity: 'major',
    motionPolicy: 'normal',
    eventPositions: [
      { id: 'right', reel: 2, row: 1, order: 2 },
      { id: 'source', reel: 0, row: 1, order: 0 },
      { id: 'middle', reel: 1, row: 2, order: 1 },
    ],
    relationshipEdges: [
      { source: 'middle', target: 'right', order: 1 },
      { source: 'source', target: 'middle', order: 0 },
    ],
  };
  const plan = createTileConnectionPlan(base);
  const reordered = createTileConnectionPlan({
    ...base,
    eventPositions: [...base.eventPositions].reverse(),
    relationshipEdges: [...base.relationshipEdges].reverse(),
  });
  assert.deepEqual(plan, reordered);
  assert.deepEqual(plan.phases.map(phase => phase.id), TILE_CONNECTION_PHASES);
  assert.deepEqual(plan.graph.positions.map(position => position.id), ['source', 'middle', 'right']);
  assert.deepEqual(plan.graph.edges.map(edge => `${edge.source}->${edge.target}`), ['source->middle', 'middle->right']);
  assert.equal(plan.routes[0].source.x, 55);
  assert.equal(plan.routes[0].source.y, 140);
  assert.equal(plan.routes[0].target.x, 165);
  assert.equal(plan.routes[0].target.y, 195);
  assert.equal(plan.acknowledgement.completionPhase, 'resolution');
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
});

test('connection graph reports unknown endpoints, duplicate edges, and isolated positions', () => {
  const issues = validateConnectionGraph({
    eventPositions: [
      { id: 'a', reel: 0, row: 0 },
      { id: 'b', reel: 1, row: 0 },
      { id: 'isolated', reel: 2, row: 0 },
    ],
    relationshipEdges: [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'ab-again', source: 'a', target: 'b' },
      { id: 'missing', source: 'a', target: 'unknown' },
    ],
  });
  assert.ok(issues.some(item => item.code === 'edge-duplicate'));
  assert.ok(issues.some(item => item.code === 'edge-target-unknown'));
  assert.ok(issues.some(item => item.code === 'position-unconnected' && item.severity === 'warning'));
});

test('normal, fast, reduced, and none policies preserve phases with deterministic timing', () => {
  const input = {
    eventId: 'policy-link',
    reelGeometry: variableGeometry(),
    eventPositions: [{ id: 'a', reel: 0, row: 0 }, { id: 'b', reel: 1, row: 0 }],
    relationshipEdges: [{ source: 'a', target: 'b' }],
  };
  const normal = createTileConnectionPlan({ ...input, motionPolicy: 'normal' });
  const fast = createTileConnectionPlan({ ...input, motionPolicy: 'fast' });
  const reduced = createTileConnectionPlan({ ...input, motionPolicy: 'reduced' });
  const none = createTileConnectionPlan({ ...input, motionPolicy: 'none' });
  assert.ok(normal.totalDurationMs > fast.totalDurationMs);
  assert.equal(reduced.motionEnabled, false);
  assert.equal(reduced.phases.find(phase => phase.id === 'propagation').cues[0].action, 'show-relationship-state');
  assert.equal(none.totalDurationMs, 0);
  assert.deepEqual(none.phases.map(phase => phase.id), TILE_CONNECTION_PHASES);
});

test('tumble plan preserves the full physical sequence from authoritative clears and movements', () => {
  const plan = createTumblePlan({
    eventId: 'tumble-7',
    reelGeometry: variableGeometry(),
    intensity: 'normal',
    clearedPositions: [
      { id: 'clear-a', reel: 1, row: 2 },
      { id: 'clear-b', reel: 1, row: 3 },
    ],
    movements: [
      { id: 'fall-a', tileId: 'tile-existing', type: 'fall', from: { reel: 1, row: 0 }, to: { reel: 1, row: 2 }, order: 0 },
      { id: 'enter-a', tileId: 'tile-new', type: 'enter', to: { reel: 1, row: 3 }, order: 1, entryOrder: 0 },
    ],
  });
  assert.deepEqual(plan.phases.map(phase => phase.id), TUMBLE_PHASES);
  assert.equal(plan.paths[0].type, 'fall');
  assert.equal(plan.paths[0].from.y, 50);
  assert.equal(plan.paths[0].to.y, 195);
  assert.equal(plan.paths[1].type, 'enter');
  assert.equal(plan.paths[1].from.source, 'geometry-entry');
  assert.equal(plan.paths[1].from.y, -25);
  assert.equal(plan.paths[1].to.y, 275);
  assert.equal(plan.phases.find(phase => phase.id === 'evaluate').cues[0].action, 'request-next-authoritative-evaluation');
  assert.equal(plan.acknowledgement.completionPhase, 'evaluate');
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
});

test('tumble input does not accept an instantaneous replacement board as movement evidence', () => {
  const issues = validateTumbleInput({ finalBoard: [['B']], clearedPositions: [{ reel: 0, row: 0 }] });
  assert.ok(issues.some(item => item.code === 'movements-required'));
  assert.throws(() => createTumblePlan({
    eventId: 'invalid-tumble',
    reelGeometry: variableGeometry(),
    clearedPositions: [{ reel: 0, row: 0 }],
    movements: [{ type: 'fall', from: { reel: 0, row: 0 }, to: { reel: 0, row: 0 } }],
  }), /does not change cells/);
});

test('completion, cancellation, replacement, queue, and ignore have explicit serializable outcomes', () => {
  const input = {
    reelGeometry: variableGeometry(),
    eventPositions: [{ id: 'a', reel: 0, row: 0 }, { id: 'b', reel: 1, row: 0 }],
    relationshipEdges: [{ source: 'a', target: 'b' }],
  };
  const active = createTileConnectionPlan({ ...input, eventId: 'active' });
  const queued = createTileConnectionPlan({ ...input, eventId: 'queued', interruption: 'queue' });
  const replaced = createTileConnectionPlan({ ...input, eventId: 'replacement', interruption: 'replace' });
  const ignored = createTileConnectionPlan({ ...input, eventId: 'ignored', interruption: 'ignore' });

  assert.deepEqual(createChoreographyAcknowledgement(active), {
    format: 'stake-studio-visual-choreography-ack-v1',
    planId: active.id,
    eventId: 'active',
    token: 'tile-connection:active:ack',
    status: 'completed',
    completedPhase: 'resolution',
  });
  assert.equal(resolvePlanInterruption({ activePlan: active, incomingPlan: queued }).decision, 'queue');
  assert.deepEqual(resolvePlanInterruption({ activePlan: active, incomingPlan: replaced, activePhase: 'reaction' }), {
    decision: 'replace-at-phase-boundary',
    cancelPlanId: active.id,
    afterPhase: 'reaction',
    acknowledgementRequired: true,
  });
  assert.equal(resolvePlanInterruption({ activePlan: active, incomingPlan: replaced, activePhase: 'reaction', phaseComplete: true }).decision, 'replace-now');
  assert.deepEqual(resolvePlanInterruption({ activePlan: active, incomingPlan: ignored }), {
    decision: 'ignore',
    acknowledgeIncomingAs: 'skipped',
  });
  assert.deepEqual(createChoreographyAcknowledgement(active, { status: 'cancelled', completedPhase: 'reaction' }).completedPhase, 'reaction');
});
