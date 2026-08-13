import {
  createExactMaxTerminationProofTrace,
  createMysteryStarDreamfallProofTrace,
  createTricksterGridSettlementProofTrace,
  createLucidFamilyMultiplierProofTrace,
  createVeilAscentUpgradeProofTrace,
  createPredeterminedGeneratorProofTrace,
  createNightmareReliquaryProofTrace,
} from '../../morpheus/MorpheusEffectProofTraces.js?orchestration=20260813-4';
import {
  MorpheusEffectOrchestrationRuntime,
} from './MorpheusEffectOrchestrationRuntime.js?orchestration=20260813-3';
import {
  createMorpheusEffectPresentationPlan,
  summarizeMorpheusEffectPresentationPlans,
} from './MorpheusEffectPresentation.js?orchestration=20260811-1';

export const MORPHEUS_EFFECT_PREVIEW_DRIVER_FORMAT = 'morpheus-effect-orchestration-preview-driver-v1';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function routeTrace(routeId) {
  if (routeId === 'predeterminedGeneratorDeclarations') return createPredeterminedGeneratorProofTrace();
  if (routeId === 'nightmareReliquaryDeclarations') return createNightmareReliquaryProofTrace();
  if (routeId === 'lucidFamilyMultiplierSettlement') return createLucidFamilyMultiplierProofTrace();
  if (routeId === 'veilAscentUpgrade') return createVeilAscentUpgradeProofTrace();
  if (routeId === 'tricksterGridSettlement') return createTricksterGridSettlementProofTrace();
  if (routeId === 'mysteryStarDreamfallTumble') return createMysteryStarDreamfallProofTrace();
  if (routeId === 'exactMaxTermination') return createExactMaxTerminationProofTrace();
  throw new Error(`Unknown Morpheus effect Preview route ${routeId}.`);
}

function cancellation(reason) {
  const error = new Error(`Morpheus effect Preview cancelled: ${reason}.`);
  error.name = 'MorpheusEffectPreviewCancellation';
  return error;
}

export class MorpheusEffectOrchestrationPreviewDriver {
  constructor({
    routeId,
    motionMode = 'normal',
    catalog = {},
    renderCommand = async () => {},
    onCheckpoint = async () => {},
    onStatus = () => {},
  } = {}) {
    this.routeId = routeId;
    this.trace = routeTrace(routeId);
    this.motionMode = motionMode;
    this.catalog = clone(catalog);
    this.renderCommand = renderCommand;
    this.onCheckpoint = onCheckpoint;
    this.onStatus = onStatus;
    this.runtime = null;
    this.plans = [];
    this.status = 'idle';
    this.activeEvent = null;
    this.reason = null;
    this.controller = null;
    this.playPromise = null;
    this.report = null;
  }

  snapshot() {
    return {
      format: MORPHEUS_EFFECT_PREVIEW_DRIVER_FORMAT,
      routeId: this.routeId,
      motionMode: this.motionMode,
      status: this.status,
      reason: this.reason,
      activeEvent: clone(this.activeEvent),
      pendingAcknowledgement: clone(this.runtime?.pendingAcknowledgement || null),
      nextEventIndex: this.runtime?.nextEventIndex || 0,
      runtime: clone(this.runtime?.snapshot() || null),
      coverage: summarizeMorpheusEffectPresentationPlans(this.plans),
      report: clone(this.report),
    };
  }

  publish() {
    this.onStatus(this.snapshot());
  }

  play() {
    if (this.playPromise) return this.playPromise;
    this.controller = new AbortController();
    this.status = 'playing';
    this.reason = null;
    this.runtime = new MorpheusEffectOrchestrationRuntime({
      routeId: this.routeId,
      motionMode: this.motionMode,
    });
    this.plans = [];
    this.publish();
    this.playPromise = this.run(this.controller.signal).finally(() => {
      this.controller = null;
      this.playPromise = null;
    });
    return this.playPromise;
  }

  async run(signal) {
    try {
      for (const event of this.trace.events) {
        if (signal.aborted) throw cancellation(this.reason || 'aborted');
        const command = this.runtime.dispatch(event);
        const plan = createMorpheusEffectPresentationPlan({ command, event, catalog: this.catalog });
        if (!plan.previewReady) {
          throw new Error(`Morpheus effect Preview is missing visual assets for ${event.type}.`);
        }
        this.plans.push(plan);
        this.activeEvent = { index: event.index, type: event.type };
        this.publish();
        const nextEvent = this.trace.events[event.index + 1];
        const blockingProof = { attempted: Boolean(nextEvent), blocked: true, message: 'route-complete' };
        if (nextEvent) {
          try {
            this.runtime.dispatch(nextEvent);
            blockingProof.blocked = false;
            blockingProof.message = 'next event advanced before acknowledgement';
          } catch (error) {
            blockingProof.message = error.message;
            blockingProof.blocked = /before acknowledging/.test(error.message);
          }
          if (!blockingProof.blocked) throw new Error(blockingProof.message);
        }
        const evidence = await this.renderCommand({
          command: clone(command),
          plan: clone(plan),
          sourceEvent: clone(event),
          signal,
        });
        if (signal.aborted) throw cancellation(this.reason || 'aborted');
        const acknowledgement = this.runtime.acknowledge({
          id: command.acknowledgementId,
          evidence: typeof evidence === 'string' && evidence.length
            ? evidence : `presented:${event.index}:${event.type}:${plan.semanticHash}`,
        });
        await this.onCheckpoint({
          sourceEvent: clone(event),
          command: clone(command),
          plan: clone(plan),
          runtime: clone(this.runtime.snapshot()),
          acknowledgement: clone(acknowledgement),
          nextEventBlockedBeforeAck: blockingProof.blocked,
          blockingProof: clone(blockingProof),
        });
      }
      const runtime = this.runtime.snapshot();
      const coverage = summarizeMorpheusEffectPresentationPlans(this.plans);
      this.status = 'completed';
      this.activeEvent = null;
      this.report = {
        format: MORPHEUS_EFFECT_PREVIEW_DRIVER_FORMAT,
        routeId: this.routeId,
        passed: runtime.state.completed && coverage.previewReady,
        productionReady: coverage.productionReady,
        contractFingerprint: this.trace.contractFingerprint,
        runtime,
        presentationPlans: clone(this.plans),
        coverage,
      };
      this.publish();
      return clone(this.report);
    } catch (error) {
      this.status = error?.name === 'MorpheusEffectPreviewCancellation' ? 'cancelled' : 'failed';
      this.activeEvent = null;
      this.reason = error.message;
      this.publish();
      throw error;
    }
  }

  cancel(reason = 'cancelled') {
    this.reason = reason;
    this.controller?.abort(reason);
    return this.snapshot();
  }
}
