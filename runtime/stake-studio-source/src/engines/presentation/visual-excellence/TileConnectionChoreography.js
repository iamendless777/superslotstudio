import {
  INTENSITY_PROFILES,
  VISUAL_CHOREOGRAPHY_FORMAT,
  assemblePhases,
  createPlanControl,
  normalizeEventPosition,
  normalizeMotionPolicy,
  normalizeReelGeometry,
  normalizeVisualIntensity,
  resolveCellAnchor,
  roundVisualNumber,
  scalePhaseTiming,
} from './VisualChoreography.js';

export const TILE_CONNECTION_PHASES = Object.freeze([
  'interaction', 'reaction', 'propagation', 'resolution',
]);

export const TILE_CONNECTION_TIMING = Object.freeze({
  durations: Object.freeze({ interaction: 100, reaction: 140, propagation: 260, resolution: 180 }),
  staggerMs: 55,
});

function issue(severity, code, message, path) {
  return { severity, code, message, path };
}

function positionKey(position) {
  return `${position.reel}:${position.row}`;
}

function comparePositions(a, b) {
  return a.order - b.order || a.reel - b.reel || a.row - b.row || a.id.localeCompare(b.id);
}

function normalizePosition(raw, index) {
  const position = normalizeEventPosition(raw, `eventPositions[${index}]`);
  return {
    id: String(raw?.id || `cell-${position.reel}-${position.row}`),
    reel: position.reel,
    row: position.row,
    order: Math.max(0, Number.isFinite(Number(raw?.order)) ? Number(raw.order) : 0),
    anchor: raw?.anchor || 'center',
  };
}

function resolvePositionReference(reference, byId, byCell) {
  if (typeof reference === 'string' || typeof reference === 'number') return byId.get(String(reference)) || null;
  if (reference?.id != null && byId.has(String(reference.id))) return byId.get(String(reference.id));
  try {
    const position = normalizeEventPosition(reference);
    return byCell.get(positionKey(position)) || null;
  } catch {
    return null;
  }
}

function inspectConnectionGraph({ eventPositions, relationshipEdges } = {}) {
  const issues = [];
  if (!Array.isArray(eventPositions) || eventPositions.length < 2) {
    issues.push(issue('error', 'positions-required', 'At least two authoritative event positions are required.', 'eventPositions'));
  }
  if (!Array.isArray(relationshipEdges) || relationshipEdges.length < 1) {
    issues.push(issue('error', 'edges-required', 'At least one authoritative relationship edge is required.', 'relationshipEdges'));
  }

  const positions = [];
  const byId = new Map();
  const byCell = new Map();
  for (const [index, raw] of (Array.isArray(eventPositions) ? eventPositions : []).entries()) {
    try {
      const position = normalizePosition(raw, index);
      const cellKey = positionKey(position);
      if (!position.id) issues.push(issue('error', 'position-id-empty', 'Event position IDs cannot be empty.', `eventPositions[${index}].id`));
      if (byId.has(position.id)) issues.push(issue('error', 'position-id-duplicate', `Event position ID "${position.id}" is duplicated.`, `eventPositions[${index}].id`));
      if (byCell.has(cellKey)) issues.push(issue('error', 'position-cell-duplicate', `Event cell ${cellKey} is declared more than once.`, `eventPositions[${index}]`));
      positions.push(position);
      byId.set(position.id, position);
      byCell.set(cellKey, position);
    } catch (error) {
      issues.push(issue('error', 'position-invalid', error.message, `eventPositions[${index}]`));
    }
  }

  const edges = [];
  const edgeIds = new Set();
  const edgeRelationships = new Set();
  for (const [index, raw] of (Array.isArray(relationshipEdges) ? relationshipEdges : []).entries()) {
    const source = resolvePositionReference(raw?.source, byId, byCell);
    const target = resolvePositionReference(raw?.target, byId, byCell);
    if (!source) issues.push(issue('error', 'edge-source-unknown', `Relationship edge ${index} has an unknown source.`, `relationshipEdges[${index}].source`));
    if (!target) issues.push(issue('error', 'edge-target-unknown', `Relationship edge ${index} has an unknown target.`, `relationshipEdges[${index}].target`));
    if (!source || !target) continue;
    const relationshipKey = `${source.id}->${target.id}`;
    const id = String(raw?.id || `edge-${source.id}-${target.id}`);
    if (source.id === target.id) issues.push(issue('error', 'edge-self-reference', `Relationship edge "${id}" connects a position to itself.`, `relationshipEdges[${index}]`));
    if (edgeIds.has(id)) issues.push(issue('error', 'edge-id-duplicate', `Relationship edge ID "${id}" is duplicated.`, `relationshipEdges[${index}].id`));
    if (edgeRelationships.has(relationshipKey)) issues.push(issue('error', 'edge-duplicate', `Relationship ${relationshipKey} is duplicated.`, `relationshipEdges[${index}]`));
    edgeIds.add(id);
    edgeRelationships.add(relationshipKey);
    edges.push({
      id,
      source: source.id,
      target: target.id,
      order: Math.max(0, Number.isFinite(Number(raw?.order)) ? Number(raw.order) : 0),
      relationship: String(raw?.relationship || 'connect'),
    });
  }

  const connected = new Set(edges.flatMap(edge => [edge.source, edge.target]));
  for (const position of positions) {
    if (!connected.has(position.id)) issues.push(issue('warning', 'position-unconnected', `Event position "${position.id}" has no relationship edge.`, 'eventPositions'));
  }

  positions.sort(comparePositions);
  edges.sort((a, b) => a.order - b.order || a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.id.localeCompare(b.id));
  return { issues, positions, edges };
}

/** The graph is derived only from event-supplied positions and relationships. */
export function validateConnectionGraph(input) {
  return inspectConnectionGraph(input).issues;
}

export function normalizeConnectionGraph(input) {
  const inspected = inspectConnectionGraph(input);
  const errors = inspected.issues.filter(item => item.severity === 'error');
  if (errors.length) throw new TypeError(errors.map(item => item.message).join(' '));
  return {
    format: 'stake-studio-authoritative-connection-graph-v1',
    authority: { positions: 'event', relationships: 'event' },
    positions: inspected.positions,
    edges: inspected.edges,
    warnings: inspected.issues.filter(item => item.severity === 'warning'),
  };
}

function createRoute(edge, positionsById, geometry) {
  const sourcePosition = positionsById.get(edge.source);
  const targetPosition = positionsById.get(edge.target);
  const source = resolveCellAnchor(geometry, sourcePosition, sourcePosition.anchor);
  const target = resolveCellAnchor(geometry, targetPosition, targetPosition.anchor);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  return {
    id: edge.id,
    sourceId: edge.source,
    targetId: edge.target,
    relationship: edge.relationship,
    order: edge.order,
    source,
    target,
    vector: {
      x: roundVisualNumber(dx),
      y: roundVisualNumber(dy),
      distance: roundVisualNumber(Math.hypot(dx, dy)),
      angleRadians: roundVisualNumber(Math.atan2(dy, dx)),
    },
  };
}

function createConnectionCues(phaseId, context, graph, routes) {
  const sourceIds = [...new Set(graph.edges.map(edge => edge.source))];
  if (phaseId === 'interaction') {
    return sourceIds.map((targetId, index) => ({ id: `interaction-${targetId}`, action: 'focus-source', targetId, relativeAtMs: index * context.staggerMs }));
  }
  if (phaseId === 'reaction') {
    return graph.positions.map((position, index) => ({ id: `reaction-${position.id}`, action: 'react', targetId: position.id, relativeAtMs: index * context.staggerMs }));
  }
  if (phaseId === 'propagation') {
    return routes.map((route, index) => ({
      id: `propagation-${route.id}`,
      action: context.motionEnabled ? 'trace-relationship' : 'show-relationship-state',
      routeId: route.id,
      relativeAtMs: index * context.staggerMs,
    }));
  }
  return graph.positions.map(position => ({ id: `resolution-${position.id}`, action: 'resolve', targetId: position.id, relativeAtMs: 0 }));
}

export function createTileConnectionPlan({
  eventId,
  eventPositions,
  relationshipEdges,
  reelGeometry,
  intensity = 'normal',
  motionPolicy = 'normal',
  interruption = 'queue',
} = {}) {
  const resolvedEventId = String(eventId || '').trim();
  if (!resolvedEventId) throw new TypeError('eventId is required for deterministic choreography and acknowledgement.');
  const graph = normalizeConnectionGraph({ eventPositions, relationshipEdges });
  const geometry = normalizeReelGeometry(reelGeometry);
  const positionsById = new Map(graph.positions.map(position => [position.id, position]));
  const anchors = graph.positions.map(position => ({
    id: position.id,
    reel: position.reel,
    row: position.row,
    point: resolveCellAnchor(geometry, position, position.anchor),
  }));
  const routes = graph.edges.map(edge => createRoute(edge, positionsById, geometry));
  const resolvedIntensity = normalizeVisualIntensity(intensity);
  const resolvedMotionPolicy = normalizeMotionPolicy(motionPolicy);
  const timing = scalePhaseTiming(TILE_CONNECTION_TIMING, resolvedIntensity, resolvedMotionPolicy);
  const phases = assemblePhases(
    TILE_CONNECTION_PHASES,
    timing,
    (phaseId, context) => createConnectionCues(phaseId, context, graph, routes),
  );
  const control = createPlanControl({
    eventId: resolvedEventId,
    kind: 'tile-connection',
    interruption,
    completionPhase: 'resolution',
  });
  return {
    format: VISUAL_CHOREOGRAPHY_FORMAT,
    version: 1,
    id: `tile-connection:${resolvedEventId}`,
    kind: 'tile-connection',
    eventId: resolvedEventId,
    deterministic: true,
    authority: { positions: 'event', relationships: 'event', geometry: 'current-renderer' },
    intensity: resolvedIntensity,
    intensityProfile: { ...INTENSITY_PROFILES[resolvedIntensity] },
    motionPolicy: resolvedMotionPolicy,
    motionEnabled: timing.motionEnabled,
    coordinateSpace: geometry.coordinateSpace,
    anchors,
    graph,
    routes,
    phases,
    totalDurationMs: phases.at(-1)?.endMs || 0,
    ...control,
  };
}
