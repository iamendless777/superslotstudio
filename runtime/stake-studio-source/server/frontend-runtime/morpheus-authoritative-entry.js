import { MORPHEUS_CONTRACT_FINGERPRINT } from '../../src/engines/morpheus/MorpheusGameContract.js';
import { hashMorpheusProtocolValue } from '../../src/engines/morpheus/MorpheusEventProtocol.js';
import {
  MORPHEUS_ORCHESTRATION_PROOF_ROUTES,
} from '../../src/engines/morpheus/MorpheusEffectOrchestrationContract.js?orchestration=20260811-2';
import {
  MorpheusEffectOrchestrationRuntime,
} from '../../src/engines/presentation/morpheus/MorpheusEffectOrchestrationRuntime.js?orchestration=20260811-2';
import {
  createMorpheusEffectPresentationPlan,
  summarizeMorpheusEffectPresentationPlans,
} from '../../src/engines/presentation/morpheus/MorpheusEffectPresentation.js?orchestration=20260811-2';

export const MORPHEUS_PORTABLE_RUNTIME_FORMAT = 'morpheus-portable-authoritative-runtime-v1';
export const MORPHEUS_PORTABLE_PACKET_FORMAT = 'morpheus-portable-presentation-packet-v1';
export { MORPHEUS_CONTRACT_FINGERPRINT };

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function fail(message) {
  throw new Error(`Morpheus portable runtime: ${message}`);
}

function eventTypes(events) {
  return (events || []).map(event => String(event?.type || ''));
}

function routeEventTypes(route) {
  return (route?.steps || []).map(step => step.eventType);
}

export function inferMorpheusPortableRoute(events) {
  const actual = eventTypes(events);
  const matches = Object.entries(MORPHEUS_ORCHESTRATION_PROOF_ROUTES)
    .filter(([, route]) => JSON.stringify(routeEventTypes(route)) === JSON.stringify(actual));
  if (matches.length !== 1) {
    fail(`event sequence ${actual.join(' -> ') || '(empty)'} does not identify one governed route.`);
  }
  return matches[0][0];
}

function boardChanges(payload = {}, affectedPositions = []) {
  const before = payload.boardBefore || [];
  const after = payload.boardAfter || [];
  return affectedPositions.map(position => ({
    reel: Number(position.reel),
    row: Number(position.row),
    from: before?.[position.reel]?.[position.row]?.name || before?.[position.reel]?.[position.row] || null,
    to: after?.[position.reel]?.[position.row]?.name || after?.[position.reel]?.[position.row] || null,
  }));
}

/**
 * Convert a validated envelope into the flat presentation shape used by the
 * portable Stake client. The authoritative envelope and hashes remain attached
 * so the renderer can never become the source of mechanic truth.
 */
export function projectMorpheusPortableEvent(event, command) {
  const payload = clone(event.payload || {});
  const projected = {
    ...payload,
    index: Number(event.index),
    type: event.type,
    affectedPositions: clone(event.affectedPositions || []),
    positions: clone(payload.positions || event.affectedPositions || []),
    sources: clone(payload.sourcePosition ? [payload.sourcePosition] : []),
    morpheusAuthoritative: {
      format: MORPHEUS_PORTABLE_PACKET_FORMAT,
      contractFingerprint: event.contractFingerprint,
      roundId: event.roundId,
      routeId: command.routeId,
      sourceEventHash: command.sourceEventHash,
      semanticCommitHash: command.semanticCommitHash,
      acknowledgementId: command.acknowledgementId,
      orchestrationId: command.orchestrationId,
      priority: command.priority,
      blocking: command.blocking,
    },
  };

  if (event.type === 'winInfo') {
    projected.amount = payload.totalWin;
    projected.totalWin = payload.totalWin;
  }
  if (payload.boardAfter) {
    projected.board = clone(payload.boardAfter);
    projected.changes = boardChanges(payload, event.affectedPositions || []);
  }
  if (event.type === 'reveal') projected.board = clone(payload.board);
  if (event.type === 'tumbleBoard') {
    projected.explodingSymbols = clone(payload.explodingSymbols || []);
    projected.newSymbols = clone(payload.newSymbols || []);
  }
  if (event.type === 'specialTargetSelected') projected.target = payload.targetFamily;
  if (event.type === 'positionMultiplierGridUpdate') projected.updates = [{
    reel: payload.position?.reel,
    row: payload.position?.row,
    multiplier: payload.current,
  }];
  if (event.type === 'rainingWilds') projected.positions = clone((payload.wilds || []).map(wild => wild.position));
  if (event.type === 'tumbleChainProgress') projected.current = payload.chainHit;
  if (event.type === 'awardTumbleFreeSpins') projected.totalFs = Number(event.transition?.after?.freeSpinsRemaining);
  return projected;
}

export class MorpheusPortableAuthoritativeSession {
  constructor({ events, motionMode = 'normal', catalog = {} } = {}) {
    this.events = clone(events || []);
    this.catalog = clone(catalog || {});
    this.routeId = inferMorpheusPortableRoute(this.events);
    this.runtime = new MorpheusEffectOrchestrationRuntime({ routeId: this.routeId, motionMode });
    this.packets = [];
  }

  dispatch(event) {
    const command = this.runtime.dispatch(event);
    const presentationPlan = createMorpheusEffectPresentationPlan({ command, event, catalog: this.catalog });
    const packet = {
      format: MORPHEUS_PORTABLE_PACKET_FORMAT,
      command,
      sourceEvent: clone(event),
      presentationEvent: projectMorpheusPortableEvent(event, command),
      presentationPlan,
    };
    this.packets.push(packet);
    return clone(packet);
  }

  acknowledge({ id, evidence } = {}) {
    return this.runtime.acknowledge({ id, evidence });
  }

  checkpoint() {
    return this.runtime.checkpoint();
  }

  snapshot() {
    const report = this.runtime.snapshot();
    const presentationPlans = this.packets.map(packet => packet.presentationPlan);
    const acknowledgementIdentityHash = hashMorpheusProtocolValue(report.acknowledgements.map(receipt => ({
      id: receipt.id,
      eventIndex: receipt.eventIndex,
      eventType: receipt.eventType,
      sourceEventHash: receipt.sourceEventHash,
    })));
    return {
      format: MORPHEUS_PORTABLE_RUNTIME_FORMAT,
      contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
      routeId: this.routeId,
      ...report,
      acknowledgementIdentityHash,
      packets: clone(this.packets),
      presentationPlans: clone(presentationPlans),
      presentationCoverage: summarizeMorpheusEffectPresentationPlans(presentationPlans),
    };
  }
}

export function createMorpheusPortableSession(options) {
  return new MorpheusPortableAuthoritativeSession(options);
}

export function runMorpheusPortableProjection(events, { motionMode = 'normal', catalog = {} } = {}) {
  const session = createMorpheusPortableSession({ events, motionMode, catalog });
  for (const event of events) {
    const packet = session.dispatch(event);
    session.acknowledge({
      id: packet.command.acknowledgementId,
      evidence: `settled:${packet.command.eventIndex}:${packet.command.eventType}`,
    });
  }
  return session.snapshot();
}
