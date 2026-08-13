import gsap from 'gsap';
import { MathEngine } from '../../engines/math/MathEngine.js';
import {
  BOOK_AMOUNT_MULTIPLIER,
  applyTumbleEvent,
  compileSpinBook,
  deserializeBoard,
  deserializePosition,
  deserializeWins,
  symbolName,
} from '../../engines/math/StakeRoundBook.js';
import { AudioEngine } from '../../engines/audio/AudioEngine.js?orchestration=20260811-1';
import { AnimationEngine, STANDARD_ANIMATION_STATES } from '../../engines/animation/AnimationEngine.js';
import {
  PRESENTATION_CHANNELS,
  WIN_TIER_ORDER,
  PresentationDirectorRuntime,
  createProfessionalPresentationDirector,
  ensurePresentationDirector,
  getReelStopSchedule,
  getPresentationCoverage,
  normalizeReelChoreography,
  normalizeWinEscalation,
  resolvePresentationWinTier,
  validatePresentationDirector,
} from '../../engines/presentation/PresentationDirector.js';
import {
  getPresentationInterruptionSummary,
  runPresentationInterruptionQA,
} from '../../engines/presentation/PresentationInterruptionQA.js';
import {
  getPresentationPolishSummary,
  recordPresentationPolishQA,
} from '../../engines/quality/PresentationPolishQA.js';
import {
  getPlayerInformationSummary,
  recordPlayerInformationQA,
} from '../../engines/quality/PlayerInformationQA.js';
import {
  PERFORMANCE_VIEWPORTS,
  estimateEmbeddedAssetBytes,
  getPerformanceProfileSummary,
  recordPerformanceProfile,
} from '../../engines/quality/PerformanceProfiler.js';
import {
  getReplayMatrixSummary,
  runReplayMatrixQA,
} from '../../engines/quality/ReplayMatrixQA.js';
import {
  LAYOUT_VIEWPORTS,
  getViewportLayoutSummary,
  recordViewportLayoutQA,
} from '../../engines/quality/ViewportLayoutQA.js';
import {
  createVisualEffectSeed,
  ensureVisualEffects,
  getVisualEffectBinding,
  resolveVisualEffectIntensity,
  resolveVisualEffectLayout,
  resolveVisualEffectRecipe,
} from '../../engines/animation/VisualEffectRecipes.js';
import {
  MORPHEUS_DREAMFALL_PROJECT_ID,
  MORPHEUS_RESERVED_WORLD_ROWS,
  MorpheusDreamfallPreviewDriver,
  createMorpheusReservedWorldLayout,
} from '../../engines/presentation/morpheus/MorpheusDreamfallPreviewDriver.js';
import {
  MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT,
  createMorpheusContentSafeRect,
  createMorpheusDreamfallRenderProfile,
  createMorpheusDreamfallWorldState,
  createMorpheusMotionSafeRect,
  evaluateMorpheusRenderAspectMetrics,
  resolveMorpheusMotionRowCount,
} from '../../engines/presentation/morpheus/MorpheusDreamfallRenderProfile.js';
import {
  resolveMorpheusDreamfallCabinetProfile,
} from '../../engines/presentation/morpheus/MorpheusDreamfallCabinetProfile.js';
import {
  MorpheusEffectOrchestrationPreviewDriver,
} from '../../engines/presentation/morpheus/MorpheusEffectOrchestrationPreviewDriver.js?orchestration=20260813-5';

function colorWithAlpha(value, alpha, fallback) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value || '').trim());
  if (!match) return fallback;
  const rgb = Number.parseInt(match[1], 16);
  return `rgba(${rgb >> 16},${(rgb >> 8) & 255},${rgb & 255},${alpha})`;
}

const SPECIAL_MECHANIC_EVENTS = new Set([
  'modeGridStart',
  'expandingWild',
  'mysteryTransform',
  'wildBomb',
  'symbolPurge',
  'wildStar',
  'specialTargetSelected',
  'specialPositionsResolved',
  'symbolUpgrade',
  'symbolMultiplierUpdate',
  'symbolMultiplierUpgrade',
  'positionMultiplierGridUpdate',
  'expandReelHeight',
  'expandStickyReel',
  'upgradeStickyReel',
  'clearTemporaryReels',
  'modeBoardSelection',
  'lucidWildMultiplier',
  'echoSplit',
  'maxDream',
  'symbolUpgradeApply',
]);

export class PreviewPanel {
  constructor(container, project, onChange, projectId = null) {
    this.container = container;
    this.project = project;
    this.onChange = onChange;
    this.projectId = projectId || project.build?.stakeEngine?.gameId || null;
    ensurePresentationDirector(this.project);
    ensureVisualEffects(this.project);
    this.mathEngine = new MathEngine(project);
    this.audioEngine = new AudioEngine(project);
    this.audioEngine.loadFromProject();
    this.animationEngine = new AnimationEngine(project);
    this.spineRuntime = null;
    this.visualEffectRuntime = null;
    this.visualEffectRuntimeStatus = 'idle';
    this.visualEffectMountGeneration = 0;
    this.symbolMotionSyncFrame = null;
    this.animationRuntimeStatus = 'idle';
    this.disposed = false;
    this.intervalIds = new Set();
    this.assetStatus = new Map();
    this.preloadedImages = new Map();
    this.viewport = 'desktop';
    this.spinning = false;
    this.landedReels = new Set();
    this.board = null;
    this.balance = 1000;
    this.selectedMode = project.math?.betModes?.[0]?.name || 'base';
    this.baseBetOptions = [0.10, 0.20, 0.50, 1, 2, 5, 10];
    this.baseBet = 1;
    this.showPlayerMenu = false;
    this.showModeMenu = false;
    this.showAutoMenu = false;
    this.pendingAutoSpins = 25;
    this.autoSpinsRemaining = 0;
    this.autoSpinTimer = null;
    this.turboMode = false;
    this.soundEnabled = true;
    this.showRules = false;
    this.idlePerformanceTimer = null;
    this.reactionReturnTimer = null;
    this.winOrbTimelines = [];
    this.featurePositionMultipliers = new Map();
    this.featurePositionGridMode = null;
    this.featurePositionGridPulse = new Set();
    this.featureSymbolMultipliers = new Map();
    this.featureReelRows = new Map();
    this.playbackTrace = [];
    this.playbackStartedAt = 0;
    this.morpheusDreamfallDriver = null;
    this.morpheusDreamfallPromise = null;
    this.morpheusDreamfallState = null;
    this.morpheusDreamfallWorldState = createMorpheusDreamfallWorldState();
    this.lastMorpheusDreamfallReport = null;
    this.morpheusEffectDriver = null;
    this.morpheusEffectPromise = null;
    this.morpheusEffectState = null;
    this.lastMorpheusEffectReport = null;
    this.prePresentedMechanicEvents = new Set();
    this.bet = this.totalWager();
    this.lastWin = 0;
    this.showDirector = false;
    this.selectedDirectorEvent = this.project.presentationDirector.recipes[0]?.event || 'reveal';
    this.directorRuntime = new PresentationDirectorRuntime(project, {
      execute: (cue, payload, recipe) => this.executeDirectorCue(cue, payload, recipe),
    });
    this.preloadSymbolArt();
    this.render();
  }

  isMorpheusDreamfallProject() {
    return this.projectId === MORPHEUS_DREAMFALL_PROJECT_ID;
  }

  isMorpheusDreamfallWorldActive() {
    return this.isMorpheusDreamfallProject() && this.morpheusDreamfallWorldState?.active === true;
  }

  setMorpheusDreamfallWorldState(state = {}) {
    this.morpheusDreamfallWorldState = createMorpheusDreamfallWorldState(state);
    const stage = this.container.querySelector('#previewStage');
    if (stage) stage.dataset.dreamfallWorld = this.morpheusDreamfallWorldState.active ? 'active' : 'inactive';
    return this.morpheusDreamfallWorldState;
  }

  activateMorpheusDreamfallWorld(reason = 'authoritative-signature') {
    return this.setMorpheusDreamfallWorldState({
      active: true,
      reason,
      status: 'active',
      checkpointHash: this.morpheusDreamfallWorldState?.checkpointHash || null,
      reelRows: this.morpheusDreamfallWorldState?.reelRows || this.project.math.grid.rows,
    });
  }

  deactivateMorpheusDreamfallWorld(reason = 'base-mode') {
    return this.setMorpheusDreamfallWorldState({ active: false, reason, status: 'inactive' });
  }

  retainMorpheusDreamfallWorldForAudit({ reelRows, checkpointHash } = {}) {
    return this.setMorpheusDreamfallWorldState({
      ...this.morpheusDreamfallWorldState,
      active: true,
      reason: 'signature-audit-retained',
      status: 'completed',
      checkpointHash: checkpointHash || this.morpheusDreamfallWorldState?.checkpointHash || null,
      reelRows: reelRows || this.morpheusDreamfallWorldState?.reelRows || this.project.math.grid.rows,
    });
  }

  morpheusDreamfallMotionMode() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'reduced';
    return this.turboMode ? 'fast' : 'normal';
  }

  getMorpheusDreamfallPreviewState() {
    return this.isMorpheusDreamfallProject() ? {
      ...(this.morpheusDreamfallState || { status: 'ready' }),
      report: this.lastMorpheusDreamfallReport,
      effectOrchestration: this.getMorpheusEffectProofState(),
      world: this.morpheusDreamfallWorldState,
      reservedWorld: this.reelGeometry?.reservedWorld ? {
        reels: 6,
        rows: MORPHEUS_RESERVED_WORLD_ROWS,
        cellWidth: this.reelGeometry.cellW,
        cellHeight: this.reelGeometry.cellH,
      } : null,
    } : null;
  }

  getMorpheusEffectProofState() {
    return this.isMorpheusDreamfallProject() ? {
      ...(this.morpheusEffectState || { status: 'ready' }),
      report: this.lastMorpheusEffectReport,
    } : null;
  }

  morpheusEffectAssetCatalog() {
    const audioCueAssets = Object.fromEntries(Object.entries(this.project.audio?.stingers || {}).map(([cueId, value]) => {
      const asset = Array.isArray(value) ? value.find(item => item?.src) : value;
      return [cueId, asset ? {
        source: asset.source || null,
        factory: asset.factory ? {
          packId: asset.factory.packId || null,
          fingerprint: asset.factory.fingerprint || null,
          approvalStatus: asset.factory.approvalStatus || null,
        } : null,
        orchestration: asset.orchestration ? { ...asset.orchestration } : null,
      } : null];
    }));
    return {
      motionAssetIds: (this.project.animation?.visualEffects?.motionAssets || []).map(asset => asset.id).filter(Boolean),
      presentationAssetKeys: Object.keys(this.project.theme?.presentationAssets || {}),
      characterStates: [...STANDARD_ANIMATION_STATES],
      audioCueIds: Object.keys(this.project.audio?.stingers || {}),
      audioCueAssets,
    };
  }

  updateMorpheusEffectProofState(state) {
    this.morpheusEffectState = state;
    const runtimeState = state?.runtime?.state || state?.report?.runtime?.state || null;
    const dreamfallRoute = runtimeState && ['mysteryStarDreamfallTumble', 'exactMaxTermination'].includes(runtimeState.routeId);
    if (runtimeState && !dreamfallRoute) {
      this.updateFeatureProgress(
        runtimeState.routeId,
        Number(runtimeState.freeSpinsRemaining) || 0,
        10,
        Number(runtimeState.totalWinAmount || 0) / BOOK_AMOUNT_MULTIPLIER * this.baseBet,
      );
    }
    if (dreamfallRoute) {
      this.updateMorpheusDreamfallState({
        ...(this.morpheusDreamfallState || {}),
        status: state.status,
        reelRows: runtimeState.reelRows,
        hud: {
          id: 'dreamfall-persistent-hud',
          visible: true,
          mode: 'Dreamfall',
          chainHit: runtimeState.tumbleChainHit,
          awardThreshold: 5,
          awardedFreeSpins: runtimeState.totalTumbleFreeSpinsAwarded,
          freeSpinsRemaining: runtimeState.freeSpinsRemaining,
          runningWin: runtimeState.totalWinAmount,
          finalWin: runtimeState.terminated ? runtimeState.totalWinAmount : 0,
          reelRows: runtimeState.reelRows,
          lastExpandedReel: null,
          maximumRows: 8,
        },
      });
    }
  }

  async playMorpheusEffectProofRoute({
    routeId = 'mysteryStarDreamfallTumble',
    motion = this.morpheusDreamfallMotionMode(),
    onCheckpoint = async () => {},
  } = {}) {
    if (!this.isMorpheusDreamfallProject()) throw new Error('Morpheus effect proof routes require morpheus_dreamfall.');
    if (this.morpheusEffectPromise) return this.morpheusEffectPromise;
    if (this.spinning) return null;
    if (['mysteryStarDreamfallTumble', 'exactMaxTermination'].includes(routeId)) {
      this.activateMorpheusDreamfallWorld(`effect-proof:${routeId}`);
    } else {
      this.deactivateMorpheusDreamfallWorld(`effect-proof:${routeId}`);
    }
    this.render();
    this.spinning = true;
    this.playbackTrace = [];
    this.playbackStartedAt = performance.now();
    this.clearFeatureState();
    this.clearWinHighlights();
    this.lastWin = 0;
    this.updateHUD();
    const driver = new MorpheusEffectOrchestrationPreviewDriver({
      routeId,
      motionMode: motion,
      catalog: this.morpheusEffectAssetCatalog(),
      renderCommand: context => this.renderMorpheusEffectProofCommand(context),
      onCheckpoint,
      onStatus: state => this.updateMorpheusEffectProofState(state),
    });
    this.morpheusEffectDriver = driver;
    const promise = driver.play();
    this.morpheusEffectPromise = promise;
    try {
      const report = await promise;
      if (this.morpheusEffectDriver !== driver) return report;
      this.lastMorpheusEffectReport = report;
      this.board = report.runtime.state.board.map(reel => reel.map(symbol => symbol.name || symbol));
      this.paintBoard(this.board);
      this.recordPlaybackEvent('morpheusEffectRouteComplete', {
        routeId,
        eventHash: report.runtime.eventHash,
        semanticTraceHash: report.runtime.semanticTraceHash,
        presentationFingerprint: report.coverage.fingerprint,
        productionReady: report.productionReady,
      });
      return report;
    } finally {
      if (this.morpheusEffectDriver === driver) {
        this.morpheusEffectDriver = null;
        this.morpheusEffectPromise = null;
        this.spinning = false;
        this.updateHUD();
      }
    }
  }

  async renderMorpheusEffectProofCommand({ command, plan, sourceEvent, signal }) {
    if (signal.aborted) return 'aborted-before-render';
    const payload = sourceEvent.payload;
    const noMotion = command.motionMode === 'none';
    const immediate = command.motionMode === 'reduced' || noMotion;
    const audioReceipt = this.playMorpheusEffectProofAudio(plan, sourceEvent);
    const audioBarrier = audioReceipt.played && audioReceipt.duration > 0
      ? this.wait(Math.ceil(audioReceipt.duration * 1000) + 20)
      : Promise.resolve();
    this.recordPlaybackEvent(sourceEvent.type, {
      bookIndex: sourceEvent.index,
      sourceEventHash: command.sourceEventHash,
      semanticHash: plan.semanticHash,
      acknowledgementId: command.acknowledgementId,
      orchestrationId: command.orchestrationId,
      visualAssetIds: plan.semantic.visual.assetIds,
      audioReady: plan.audioReady,
      audioProductionReady: plan.audioProductionReady,
      audioReceipt,
      motionMode: command.motionMode,
      motionSuppressed: noMotion,
    });

    if (sourceEvent.type === 'modeGridStart') {
      this.applyPersistentMechanicState({ type: 'modeGridStart', ...payload });
      this.syncFeatureStateMarkers();
      this.updateFeatureMechanic(this.mechanicCopy({ type: 'modeGridStart', ...payload }));
      if (!noMotion) this.pulseMechanicCells(payload.cells.map(cell => cell.position), 'is-mechanic-target');
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'positionMultiplierGridUpdate') {
      this.applyPersistentMechanicState({ type: 'positionMultiplierGridUpdate', updates: [{
        reel: payload.position.reel,
        row: payload.position.row,
        multiplier: payload.current,
      }] });
      this.syncFeatureStateMarkers();
      this.updateFeatureMechanic(`${this.label(payload.symbolFamily || 'POSITION')} · ${payload.previous}× → ${payload.current}×`);
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'guaranteedSpecialReveal') {
      this.updateFeatureMechanic(`NIGHTMARE · RELIQUARY ${payload.revealOrder}/3 · ${this.label(payload.special)}`);
      if (!noMotion) this.pulseMechanicCells(payload.targetPositions, 'is-mechanic-target');
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'symbolBarProgress') {
      this.updateFeatureMechanic(`VEIL ASCENT · ${this.label(payload.symbolFamily)} ${payload.previous} → ${payload.current} / ${payload.threshold}`);
      if (!noMotion) this.pulseMechanicCells(payload.hits, 'is-mechanic-target');
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'symbolUpgrade') {
      this.board = deserializeBoard(payload.boardBefore);
      this.paintBoard(this.board);
      if (noMotion) {
        this.board = deserializeBoard(payload.boardAfter);
        this.paintBoard(this.board);
      } else {
        this.board = await this.playStakeBoardTransform(this.board, {
          board: payload.boardAfter,
          changes: payload.positions.map(position => ({
            reel: Number(position.reel), row: Number(position.row),
            from: payload.fromFamily, to: payload.toFamily,
          })),
        });
      }
      this.updateFeatureMechanic(`VEIL ASCENT · ${this.label(payload.fromFamily)} → ${this.label(payload.toFamily)}`);
      if (!noMotion) this.pulseMechanicCells(payload.positions, 'is-mechanic-target');
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'symbolMultiplierUpdate') {
      this.applyPersistentMechanicState({ type: 'symbolMultiplierUpdate', ...payload });
      this.syncFeatureStateMarkers();
      this.updateFeatureMechanic(`LUCID BLESSING · ${this.label(payload.symbolFamily)} ${payload.previous}× → ${payload.current}×`);
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'rainingWilds') {
      const positions = payload.wilds.map(wild => wild.position);
      this.updateFeatureMechanic(`RAINING WILDS · ${payload.wilds.length} PREDETERMINED`);
      if (!noMotion) this.pulseMechanicCells(positions, 'is-mechanic-target');
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'stackedReels') {
      const positions = payload.reels.flatMap(reel => Array.from({ length: this.board[reel]?.length || 4 }, (_, row) => [reel, row]));
      this.updateFeatureMechanic(`STACKED REELS · ${payload.reels.map(reel => reel + 1).join(', ')} · ${this.label(payload.symbol)}`);
      if (!noMotion) this.pulseMechanicCells(positions, 'is-mechanic-target');
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'guaranteedScatters') {
      this.updateFeatureMechanic(`GATES OF SLEEP · ${payload.count} · ${this.label(payload.tier || 'FEATURE')}`);
      if (!noMotion) this.pulseMechanicCells(payload.positions, 'is-mechanic-target');
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'reveal') {
      this.board = deserializeBoard(payload.board);
      this.featureReelRows.clear();
      payload.reelHeights.forEach((rows, reel) => this.featureReelRows.set(reel, Number(rows)));
      this.paintBoard(this.board);
      if (!noMotion) this.animateBoardLanding();
      this.setAnimationState('bonusIdle');
      if (!immediate) await this.waitForPresentationMotion(this.dispatchPresentation('reveal', {
        board: this.board,
        mode: 'dreamfall',
        anticipation: false,
      }));
    } else if (sourceEvent.type === 'winInfo') {
      const wins = deserializeWins(payload.wins);
      this.lastWin = Number(payload.cumulativeWin) / BOOK_AMOUNT_MULTIPLIER * this.baseBet;
      this.updateHUD();
      if (!noMotion) this.animateWinDisplay(Number(payload.totalWin) / BOOK_AMOUNT_MULTIPLIER * this.baseBet);
      const highlight = this.highlightWins(wins, { staticOnly: noMotion });
      if (!immediate) await Promise.all([
        this.waitForPresentationMotion(highlight),
        Promise.resolve(this.dispatchPresentation('winInfo', {
          wins,
          winsAlreadyHighlighted: true,
          amount: Number(payload.totalWin) / BOOK_AMOUNT_MULTIPLIER * this.baseBet,
          runningAmount: this.lastWin,
          mode: 'dreamfall',
        })),
      ]);
    } else if (sourceEvent.type === 'mysteryTransform') {
      this.board = deserializeBoard(payload.boardBefore);
      this.paintBoard(this.board);
      if (!noMotion) await this.playSpecialMechanicEvent({
        type: 'mysteryTransform',
        sources: payload.positions,
        positions: payload.positions,
        symbol: payload.revealedAs,
      }, this.board);
      this.board = deserializeBoard(payload.boardAfter);
      this.paintBoard(this.board);
    } else if (sourceEvent.type === 'specialTargetSelected') {
      const targets = this.positionsForSymbol(this.board, payload.targetFamily);
      if (!noMotion) await this.playSpecialMechanicEvent({
        type: 'wildStar',
        sources: sourceEvent.affectedPositions,
        positions: targets,
        symbol: payload.targetFamily,
      }, this.board);
    } else if (sourceEvent.type === 'specialPositionsResolved') {
      this.board = deserializeBoard(payload.boardBefore);
      this.paintBoard(this.board);
      if (!noMotion) await this.playSpecialMechanicEvent({
        type: 'wildStar',
        sources: payload.sourcePosition ? [payload.sourcePosition] : sourceEvent.affectedPositions,
        positions: payload.positions,
        symbol: payload.special,
      }, this.board);
      this.board = deserializeBoard(payload.boardAfter);
      this.paintBoard(this.board);
    } else if (sourceEvent.type === 'expandReelHeight') {
      await this.animateMorpheusDreamfallExpansion({
        presentation: { durationMs: command.durationMs || 0 },
      }, sourceEvent, immediate);
    } else if (sourceEvent.type === 'tumbleChainProgress') {
      this.updateFeatureMechanic(`DREAMFALL · CHAIN ${payload.chainHit} / ${payload.threshold}`);
      if (!noMotion) this.pulseMechanicCells(this.eventPositions(sourceEvent.affectedPositions), 'is-mechanic-target');
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'awardTumbleFreeSpins') {
      this.updateFeatureMechanic(`DREAMFALL · +${payload.amount} FREE SPIN · ${payload.totalAwarded} AWARDED`);
      if (!immediate && command.durationMs) await this.wait(command.durationMs);
    } else if (sourceEvent.type === 'tumbleBoard') {
      this.clearWinHighlights();
      if (immediate) {
        this.board = deserializeBoard(payload.boardAfter);
        this.paintBoard(this.board);
      } else this.board = await this.playStakeTumble(this.board, payload);
    } else if (sourceEvent.type === 'maxWinReached') {
      this.clearWinHighlights();
      const positions = this.eventPositions(sourceEvent.affectedPositions);
      if (!noMotion) this.pulseMechanicCells(positions, 'is-mechanic-target');
      this.setAnimationState('wincap');
      this.lastWin = Number(payload.amount) / BOOK_AMOUNT_MULTIPLIER * this.baseBet;
      this.updateHUD();
      await this.playWincapCelebration(payload.multiplier, { immediate });
    } else if (sourceEvent.type === 'roundTerminated') {
      this.updateFeatureMechanic(`MAX MORPHEUS · ${Number(payload.multiplier).toLocaleString()}x · ROUND TERMINATED`);
    }
    await audioBarrier;
    return `visible:${sourceEvent.index}:${sourceEvent.type}:${plan.semanticHash}:audio:${audioReceipt.sourceFingerprint || audioReceipt.decision}`;
  }

  collectMorpheusEffectMotionState({ suppressed = false } = {}) {
    const tweenTargets = this.container.querySelectorAll(
      '.reel-frame *, #previewDreamfallHud *, .preview-visual-effect-layer *, .wincap-celebration *',
    );
    const activePresentationTweens = gsap.getTweensOf(tweenTargets, true)
      .filter(tween => tween.isActive()).length;
    return {
      format: 'morpheus-effect-motion-state-v1',
      suppressed: Boolean(suppressed),
      activeBlockingEffects: this.visualEffectRuntimeStatus === 'playing' ? 1 : 0,
      activePresentationTweens,
      ambientFlipbooks: Number(this.visualEffectRuntime?.ambientFlipbooks?.length || 0),
      semanticStateVisible: true,
      audioPolicy: 'owned-cue-barrier-preserved',
    };
  }

  playMorpheusEffectProofAudio(plan, sourceEvent) {
    const audio = plan?.semantic?.audio || { decision: 'intentional-silence', cueIds: [] };
    if (audio.decision === 'specialty-cue') {
      const cueId = audio.cueIds?.[0];
      const receipt = this.audioEngine.playStingerWithReceipt(cueId);
      if (!receipt.played) throw new Error(`Morpheus specialty cue ${cueId} was declared but did not start.`);
      return receipt;
    }
    if (audio.decision === 'existing-cue') {
      const cueId = audio.cueIds?.[0];
      return {
        format: 'stake-studio-audio-playback-receipt-v1',
        cueId,
        played: true,
        decision: 'presentation-director-delegated',
        sourceFingerprint: cueId === '$winTier' ? `win-tier:${sourceEvent.payload?.totalWin || 0}` : cueId,
      };
    }
    return {
      format: 'stake-studio-audio-playback-receipt-v1',
      cueId: null,
      played: false,
      decision: 'intentional-silence',
      reason: audio.reason || 'No cue is owned by this event.',
      sourceFingerprint: 'intentional-silence',
    };
  }

  updateMorpheusDreamfallState(state) {
    this.morpheusDreamfallState = state;
    if (this.isMorpheusDreamfallWorldActive()) {
      this.setMorpheusDreamfallWorldState({
        ...this.morpheusDreamfallWorldState,
        status: state?.status || this.morpheusDreamfallWorldState.status,
        checkpointHash: state?.checkpointHash || this.morpheusDreamfallWorldState.checkpointHash,
        reelRows: state?.reelRows || state?.hud?.reelRows || this.morpheusDreamfallWorldState.reelRows,
      });
    }
    const hud = state?.hud || state?.report?.state?.hud || null;
    const panel = this.container.querySelector('#previewDreamfallHud');
    if (panel) panel.dataset.status = state?.status || 'ready';
    const status = this.container.querySelector('#dreamfallHudStatus');
    const chain = this.container.querySelector('#dreamfallHudChain');
    const spins = this.container.querySelector('#dreamfallHudSpins');
    const remaining = this.container.querySelector('#dreamfallHudRemaining');
    const runningWin = this.container.querySelector('#dreamfallHudWin');
    const rows = this.container.querySelector('#dreamfallHudRows');
    if (status) status.textContent = String(state?.status || 'ready').toUpperCase();
    if (chain) chain.textContent = `${Number(hud?.chainHit || 0)} / ${Number(hud?.awardThreshold || 5)}`;
    if (spins) spins.textContent = String(Number(hud?.awardedFreeSpins || 0));
    if (remaining) remaining.textContent = String(Number(hud?.freeSpinsRemaining || 0));
    if (runningWin) runningWin.textContent = (Number(hud?.runningWin || 0) / BOOK_AMOUNT_MULTIPLIER * this.baseBet).toFixed(2);
    if (rows) rows.textContent = (hud?.reelRows || this.project.math.grid.rows).join('·');
    const button = this.container.querySelector('#previewMorpheusDreamfall');
    if (button) button.textContent = state?.status === 'playing' ? 'Finish Dreamfall Slice' : 'Play Dreamfall Slice';
  }

  cleanupMorpheusDreamfallPresentation() {
    this.directorRuntime?.cancel('dreamfall-preview-cleanup');
    this.visualEffectRuntime?.cancel?.();
    gsap.killTweensOf(this.container.querySelectorAll('.reel-frame *, #previewDreamfallHud *'));
    this.container.querySelectorAll('.preview-tumble-layer').forEach(layer => layer.remove());
    this.container.querySelector('.reel-frame')?.classList.remove('is-tumbling');
  }

  cancelMorpheusDreamfallPreview(reason = 'cancelled') {
    if (!this.morpheusDreamfallDriver) return null;
    const state = this.morpheusDreamfallDriver.cancel(reason);
    this.cleanupMorpheusDreamfallPresentation();
    this.morpheusDreamfallDriver = null;
    this.morpheusDreamfallPromise = null;
    this.spinning = false;
    this.deactivateMorpheusDreamfallWorld(reason);
    this.updateMorpheusDreamfallState(state);
    return state;
  }

  async playMorpheusDreamfallSignature({
    motion = this.morpheusDreamfallMotionMode(),
    onCheckpoint = async () => {},
  } = {}) {
    if (!this.isMorpheusDreamfallProject()) throw new Error('The Dreamfall signature slice is available only for morpheus_dreamfall.');
    if (this.morpheusDreamfallPromise) return this.morpheusDreamfallPromise;
    if (this.spinning) return null;
    this.activateMorpheusDreamfallWorld('authoritative-signature');
    this.render();
    this.spinning = true;
    this.playbackTrace = [];
    this.playbackStartedAt = performance.now();
    this.clearFeatureState();
    this.clearWinHighlights();
    this.lastWin = 0;
    this.updateHUD();
    const driver = new MorpheusDreamfallPreviewDriver({
      motion,
      renderCommand: context => this.renderMorpheusDreamfallCommand(context),
      commitFinal: context => this.commitMorpheusDreamfallFinal(context),
      onCheckpoint,
      onStatus: state => this.updateMorpheusDreamfallState(state),
    });
    this.morpheusDreamfallDriver = driver;
    const promise = driver.play();
    this.morpheusDreamfallPromise = promise;
    try {
      const report = await promise;
      if (this.morpheusDreamfallDriver !== driver) return report;
      this.lastMorpheusDreamfallReport = report;
      this.recordPlaybackEvent('dreamfallSliceComplete', {
        sourceTraceHash: report.sourceTraceHash,
        semanticTraceHash: report.semanticTraceHash,
      });
      return report;
    } catch (error) {
      if (error?.name !== 'MorpheusDreamfallPreviewCancellation') throw error;
      return null;
    } finally {
      if (this.morpheusDreamfallDriver === driver) {
        this.morpheusDreamfallPromise = null;
        this.morpheusDreamfallDriver = null;
        this.spinning = false;
        this.updateHUD();
      }
    }
  }

  async finishMorpheusDreamfallImmediately(reason = 'finish-immediately') {
    const driver = this.morpheusDreamfallDriver;
    if (!driver) return this.lastMorpheusDreamfallReport;
    this.cleanupMorpheusDreamfallPresentation();
    const report = await driver.finishImmediately(reason);
    if (this.morpheusDreamfallDriver === driver) {
      this.lastMorpheusDreamfallReport = report;
      this.morpheusDreamfallPromise = null;
      this.morpheusDreamfallDriver = null;
      this.spinning = false;
      this.updateHUD();
    }
    return report;
  }

  async renderMorpheusDreamfallCommand({ command, sourceEvent, signal, immediate }) {
    if (signal.aborted) return;
    const payload = sourceEvent.payload;
    const board = payload.board ? deserializeBoard(payload.board) : null;
    this.recordPlaybackEvent(sourceEvent.type, {
      bookIndex: sourceEvent.index,
      sourceEventHash: command.semantic.sourceEventHash,
      semanticHash: command.semanticHash,
      acknowledgementId: command.acknowledgement?.id || null,
    });

    if (sourceEvent.type === 'reveal') {
      this.board = board;
      this.paintBoard(board);
      this.animateBoardLanding();
      this.setAnimationState('bonusIdle');
      if (!immediate) await this.waitForPresentationMotion(this.dispatchPresentation('reveal', {
        board,
        mode: 'dreamfall',
        anticipation: false,
      }));
    } else if (sourceEvent.type === 'winInfo') {
      const wins = deserializeWins(payload.wins);
      this.lastWin = Number(payload.cumulativeWin || 0) / BOOK_AMOUNT_MULTIPLIER * this.baseBet;
      this.updateHUD();
      this.animateWinDisplay(Number(payload.totalWin || 0) / BOOK_AMOUNT_MULTIPLIER * this.baseBet);
      const motion = this.highlightWins(wins);
      if (!immediate) await Promise.all([
        this.waitForPresentationMotion(motion),
        Promise.resolve(this.dispatchPresentation('winInfo', {
          wins,
          winsAlreadyHighlighted: true,
          amount: Number(payload.totalWin || 0) / BOOK_AMOUNT_MULTIPLIER * this.baseBet,
          runningAmount: this.lastWin,
          mode: 'dreamfall',
        })),
      ]);
    } else if (sourceEvent.type === 'expandReelHeight') {
      await this.animateMorpheusDreamfallExpansion(command, sourceEvent, immediate);
    } else if (sourceEvent.type === 'tumbleChainProgress') {
      this.updateFeatureMechanic(`DREAMFALL · CHAIN ${payload.chainHit} / ${payload.threshold}`);
      this.pulseMechanicCells(this.eventPositions(sourceEvent.affectedPositions), 'is-mechanic-target');
      if (!immediate) await this.wait(command.presentation.durationMs);
    } else if (sourceEvent.type === 'awardTumbleFreeSpins') {
      this.updateFeatureMechanic(`DREAMFALL · +${payload.amount} FREE SPIN · ${payload.totalAwarded} AWARDED`);
      if (!immediate) await this.wait(command.presentation.durationMs);
    } else if (sourceEvent.type === 'tumbleBoard') {
      this.clearWinHighlights();
      if (immediate) {
        this.board = deserializeBoard(payload.boardAfter);
        this.paintBoard(this.board);
      } else {
        this.board = await this.playStakeTumble(this.board, payload);
      }
      this.syncFeatureStateMarkers();
    }
    this.updateMorpheusDreamfallState({
      ...(this.morpheusDreamfallState || {}),
      status: 'playing',
      activeEvent: { index: sourceEvent.index, type: sourceEvent.type },
      hud: command.semantic.hud,
      reelRows: command.semantic.reelRows,
      causalPhase: command.semantic.phase,
    });
  }

  async animateMorpheusDreamfallExpansion(command, sourceEvent, immediate) {
    const payload = sourceEvent.payload;
    const reel = Number(payload.reel);
    const before = createMorpheusReservedWorldLayout({
      worldHeight: this.reelGeometry.h,
      reelRows: payload.reelHeightsBefore,
    }).reels[reel];
    const after = createMorpheusReservedWorldLayout({
      worldHeight: this.reelGeometry.h,
      reelRows: payload.reelHeightsAfter,
    }).reels[reel];
    this.featureReelRows.set(reel, Number(payload.rows));
    this.board = deserializeBoard(payload.boardAfter);
    this.paintBoard(this.board);
    const mask = this.container.querySelector(`.reel-mask[data-reel="${reel}"]`);
    const cap = this.container.querySelector(`.reel-cap[data-reel="${reel}"]`);
    if (!mask || immediate) {
      this.updateFeatureMechanic(this.mechanicCopy({ type: 'expandReelHeight', ...payload }));
      return;
    }
    gsap.set(mask, { top: before.mask.top, height: before.mask.height });
    if (cap) gsap.set(cap, { top: before.cap.top });
    await new Promise(resolve => {
      const timeline = gsap.timeline({ onComplete: resolve });
      timeline.to(mask, {
        top: after.mask.top,
        height: after.mask.height,
        duration: Math.max(0.12, command.presentation.durationMs / 1000),
        ease: 'power3.out',
      });
      if (cap) timeline.to(cap, {
        top: after.cap.top,
        duration: Math.max(0.12, command.presentation.durationMs / 1000),
        ease: 'power3.out',
      }, 0);
    });
    await this.playSpecialMechanicEvent({
      type: 'expandReelHeight',
      ...payload,
      positions: sourceEvent.affectedPositions,
    }, this.board);
  }

  async commitMorpheusDreamfallFinal({ report }) {
    this.cleanupMorpheusDreamfallPresentation();
    const state = report.state;
    this.featureReelRows.clear();
    state.reelRows.forEach((rows, reel) => this.featureReelRows.set(reel, rows));
    this.board = state.board.map(reel => [...reel]);
    this.paintBoard(this.board);
    this.clearWinHighlights();
    this.lastWin = Number(state.hud.runningWin || 0) / BOOK_AMOUNT_MULTIPLIER * this.baseBet;
    this.updateHUD();
    this.updateFeatureMechanic('DREAMFALL · AUTHORITATIVE TUMBLE SETTLED');
    this.setAnimationState('bonusIdle');
    this.retainMorpheusDreamfallWorldForAudit({
      reelRows: state.reelRows,
      checkpointHash: report.checkpointHash,
    });
    this.updateMorpheusDreamfallState({
      ...(this.morpheusDreamfallState || {}),
      status: 'completed',
      hud: state.hud,
      reelRows: state.reelRows,
      sliceComplete: report.sliceComplete,
      report,
    });
  }

  preloadSymbolArt() {
    for (const symbol of this.project.theme?.symbols || []) {
      if (!symbol.src) continue;
      this.assetStatus.set(symbol.src, false);
      const image = new Image();
      image.decoding = 'async';
      image.loading = 'eager';
      this.preloadedImages.set(symbol.src, image);
      const markReady = () => {
        if (this.disposed || this.preloadedImages.get(symbol.src) !== image) return;
        this.assetStatus.set(symbol.src, true);
        if (this.board && !this.spinning) this.paintBoard(this.board);
      };
      image.onload = () => {
        const decoding = image.decode?.();
        if (decoding?.then) decoding.then(markReady, markReady);
        else markReady();
      };
      image.onerror = () => this.assetStatus.set(symbol.src, false);
      image.src = symbol.src;
    }
  }

  render() {
    this.cancelMorpheusDreamfallPreview('preview-render');
    this.killWinOrbTimelines();
    if (this.symbolMotionSyncFrame) cancelAnimationFrame(this.symbolMotionSyncFrame);
    this.symbolMotionSyncFrame = null;
    this.spineRuntime?.destroy();
    this.spineRuntime = null;
    this.visualEffectRuntime?.destroy();
    this.visualEffectRuntime = null;
    this.visualEffectRuntimeStatus = 'loading';
    this.visualEffectMountGeneration += 1;
    const cab = this.project.theme.cabinet;
    const math = this.project.math;
    const performanceProfile = getPerformanceProfileSummary(this.project);
    const replayMatrix = getReplayMatrixSummary(this.project);
    const viewportLayout = getViewportLayoutSummary(this.project);
    const palette = this.project.theme?.colorPalette || [];
    const presentationAssets = this.project.theme?.presentationAssets || {};
    const presentationEffects = this.project.theme?.presentationEffects || {};
    const connectionOrbArt = presentationAssets.connectionOrb || '';
    const particleConnections = presentationEffects.winConnections?.type === 'particleTap';
    const modePortalArt = presentationAssets.modePortal || '';
    const htmlVisibleEffects = this.allowsHtmlVisibleEffects();
    const motionStyle = [
      `--world-shadow:${palette[1] || '#17143d'}`,
      `--world-glow:${palette[6] || '#55d6c2'}`,
      `--world-hot:${palette[5] || '#d6a84b'}`,
      `--world-hot-alt:${palette[4] || '#e9e4ff'}`,
      `--world-glow-soft:${colorWithAlpha(palette[6], .42, 'rgba(85,214,194,.42)')}`,
      `--world-glow-faint:${colorWithAlpha(palette[6], .2, 'rgba(85,214,194,.2)')}`,
      `--world-hot-soft:${colorWithAlpha(palette[5], .58, 'rgba(214,168,75,.58)')}`,
      `--world-hot-alt-soft:${colorWithAlpha(palette[4], .7, 'rgba(233,228,255,.7)')}`,
    ].join(';');

    this.container.innerHTML = `
      <div class="preview-panel">
        <div class="preview-toolbar">
          <button class="tool-btn ${this.viewport === 'desktop' ? 'active' : ''}" data-vp="desktop">Desktop</button>
          <button class="tool-btn ${this.viewport === 'mobile' ? 'active' : ''}" data-vp="mobile">Mobile</button>
          <button class="tool-btn ${this.viewport === 'mini' ? 'active' : ''}" data-vp="mini">Mini</button>
          <span class="toolbar-sep"></span>
          <label class="preview-mode">Mode
            <select id="previewMode">
              ${(math.betModes || []).map(mode => `<option value="${mode.name}" ${mode.name === this.selectedMode ? 'selected' : ''}>${mode.name} (${mode.cost}x)</option>`).join('')}
            </select>
          </label>
          <span class="toolbar-sep"></span>
          <span class="preview-info">
            ${math.gameType} | ${math.grid.reels}x${math.grid.rows[0]} | RTP ${(math.rtp * 100).toFixed(1)}%
          </span>
          <span class="animation-runtime-badge" id="animationRuntimeBadge" data-status="loading">Animation: loading</span>
          <span class="animation-runtime-badge" id="visualEffectRuntimeBadge" data-status="loading">VFX: loading</span>
          <label class="preview-mode preview-animation-test">Test
            <select id="previewAnimationState">
              ${STANDARD_ANIMATION_STATES.map(state => `<option value="${state}">${state}</option>`).join('')}
            </select>
          </label>
          <button class="tool-btn" id="previewAnimationTrigger">Play</button>
          <button class="tool-btn ${this.showDirector ? 'active' : ''}" id="previewDirector" aria-expanded="${this.showDirector}">Director</button>
          <button class="tool-btn ${replayMatrix.complete ? 'is-profiled' : ''}" id="previewReplayMatrix">${replayMatrix.complete ? 'Rehearse ✓' : 'Rehearse'}</button>
          <button class="tool-btn ${viewportLayout.complete ? 'is-profiled' : ''}" id="previewLayoutAudit">${viewportLayout.complete ? 'Layout ✓' : 'Layout'}</button>
          <button class="tool-btn ${performanceProfile.complete ? 'is-profiled' : ''}" id="previewPerformanceProfile">${performanceProfile.complete ? 'Profile ✓' : 'Profile'}</button>
          ${this.isMorpheusDreamfallProject() ? '<button class="tool-btn" id="previewMorpheusDreamfall">Play Dreamfall Slice</button>' : ''}
          <button class="tool-btn preview-rules-button" id="previewRules" aria-haspopup="dialog">Game Info</button>
        </div>
        ${performanceProfile.fresh ? `
          <div class="preview-performance-strip ${performanceProfile.complete ? 'is-complete' : 'has-failures'}">
            <strong>${performanceProfile.complete ? 'Performance gate passed' : 'Performance repair required'}</strong>
            <span>${performanceProfile.samples.map(sample => `${sample.viewport} ${sample.fps.toFixed(0)}fps / p95 ${sample.p95Ms.toFixed(1)}ms`).join(' · ')}</span>
            <span>Textures ${(performanceProfile.peakTextureBytes / 1024 / 1024).toFixed(1)}MB · embedded load ${(performanceProfile.embeddedAssetBytes / 1024 / 1024).toFixed(1)}MB · ${performanceProfile.fingerprint}</span>
          </div>` : performanceProfile.stale ? '<div class="preview-performance-strip has-failures"><strong>Performance evidence is stale</strong><span>Assets or choreography changed after the last profile.</span></div>' : ''}
        ${replayMatrix.fresh ? `
          <div class="preview-replay-strip ${replayMatrix.complete ? 'is-complete' : 'has-failures'}">
            <strong>${replayMatrix.complete ? 'Replay matrix passed' : 'Replay repair required'}</strong>
            <span>${replayMatrix.passed}/${replayMatrix.total} cases · ${replayMatrix.presentationCases} critical journeys · ${replayMatrix.mathCases} seeded rounds</span>
            <span>${replayMatrix.fingerprint}</span>
          </div>` : replayMatrix.stale ? '<div class="preview-replay-strip has-failures"><strong>Replay evidence is stale</strong><span>Math or presentation behavior changed after the last rehearsal.</span></div>' : ''}
        ${viewportLayout.fresh ? `
          <div class="preview-layout-strip ${viewportLayout.complete ? 'is-complete' : 'has-failures'}">
            <strong>${viewportLayout.complete ? 'Layout gate passed' : 'Layout repair required'}</strong>
            <span>${viewportLayout.samples.map(sample => `${sample.viewport} target ${sample.spin.width.toFixed(0)}×${sample.spin.height.toFixed(0)}px · symbols ${sample.minimumSymbolWidth.toFixed(0)}×${sample.minimumSymbolHeight.toFixed(0)}px`).join(' · ')}</span>
            <span>${viewportLayout.fingerprint}</span>
          </div>` : viewportLayout.stale ? '<div class="preview-layout-strip has-failures"><strong>Layout evidence is stale</strong><span>Visual layout inputs changed after the last audit.</span></div>' : ''}
        <div class="preview-workspace ${this.showDirector ? 'has-director' : ''}">
          <div class="preview-viewport ${this.viewport}" id="previewViewport" style="display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative">
            <div class="preview-stage" id="previewStage" data-motion-graphics="${htmlVisibleEffects ? 'fallback' : 'authored'}" data-dreamfall-world="${this.isMorpheusDreamfallWorldActive() ? 'active' : 'inactive'}" style="width:${cab.width}px;height:${cab.height}px;position:relative;transform-origin:center center;${motionStyle}">
              ${this.renderCabinet(cab)}
              ${this.renderWorldResponse(cab)}
              ${this.renderAmbientFX()}
              <div class="preview-spine-layer" id="previewSpineLayer" aria-hidden="true"></div>
              ${this.renderCharacterRig()}
              ${this.renderLivingEnvironment()}
              ${this.renderReels(math, cab)}
              <div class="preview-visual-effect-layer" id="previewVisualEffectLayer" aria-hidden="true"></div>
              ${particleConnections || !htmlVisibleEffects
                ? ''
                : connectionOrbArt
                ? '<div class="preview-win-orbs" id="previewWinOrbs" aria-hidden="true"></div>'
                : `<svg class="preview-win-paths" id="previewWinPaths" viewBox="0 0 ${cab.width} ${cab.height}" preserveAspectRatio="none" aria-hidden="true"></svg>`}
              <div class="preview-mode-portal ${modePortalArt ? 'has-authored-art' : ''}" id="previewModePortal" aria-hidden="true">
                ${modePortalArt
                  ? `<img class="preview-presentation-art" src="${this.esc(modePortalArt)}" alt="" draggable="false">`
                  : htmlVisibleEffects ? '<i class="preview-mode-sigil"></i>' : ''}
                <div class="preview-mode-portal-copy">
                  <span id="previewModeKicker"></span><strong id="previewModeTitle"></strong><small id="previewModeRule"></small>
                </div>
              </div>
              ${this.renderHUD()}
            </div>
          </div>
          ${this.showDirector ? this.renderDirectorPanel() : ''}
        </div>
        ${this.showRules ? this.renderRulesPanel() : ''}
      </div>
    `;

    this.bindEvents();
    this.scaleStage();
    this.populateInitialBoard();
    this.setAnimationState(this.spinning ? 'spinning' : 'idle');
    this.mountAnimationRuntime(cab);
    this.mountVisualEffectRuntime(cab);
  }

  async mountAnimationRuntime(cab) {
    const layer = this.container.querySelector('#previewSpineLayer');
    if (!layer) return;
    const generation = (this.animationMountGeneration || 0) + 1;
    this.animationMountGeneration = generation;
    const { SpinePreviewRuntime } = await import('../../engines/animation/SpinePreviewRuntime.js');
    if (this.disposed || generation !== this.animationMountGeneration || !layer.isConnected) return;
    const runtime = new SpinePreviewRuntime(this.project, {
      onStatus: status => {
        if (this.disposed || this.spineRuntime !== runtime) return;
        this.animationRuntimeStatus = status.status;
        const stage = this.container.querySelector('#previewStage');
        const badge = this.container.querySelector('#animationRuntimeBadge');
        if (stage) stage.dataset.animationRuntime = status.status;
        if (badge) {
          badge.dataset.status = status.status;
          const label = status.status === 'ready' ? `Spine: ${status.asset}`
            : status.status === 'error' ? 'Pose fallback'
              : status.status === 'disabled' ? 'Pose / CSS'
                : 'Animation: loading';
          badge.textContent = label;
          badge.title = status.detail || label;
        }
      },
    });
    this.spineRuntime = runtime;
    runtime.pendingState = this.container.querySelector('#previewStage')?.dataset.animationState || 'idle';
    runtime.mount(layer, { width: cab.width, height: cab.height });
  }

  async mountVisualEffectRuntime(cab) {
    const layer = this.container.querySelector('#previewVisualEffectLayer');
    if (!layer) return;
    const generation = this.visualEffectMountGeneration;
    try {
      const { VisualEffectRuntime } = await import('../../engines/animation/VisualEffectRuntime.js');
      if (this.disposed || generation !== this.visualEffectMountGeneration || !layer.isConnected) return;
      const runtime = new VisualEffectRuntime({
        onFrame: event => this.handlePreviewVisualEffectFrame(event),
      });
      this.visualEffectRuntime = runtime;
      const mounted = await runtime.mount(layer, {
        viewport: this.viewport,
        width: cab.width,
        height: cab.height,
        sceneMode: 'overlay',
        motionAssets: this.project.animation?.visualEffects?.motionAssets || [],
      });
      if (!mounted || this.disposed || generation !== this.visualEffectMountGeneration || !layer.isConnected) {
        runtime.destroy();
        if (this.visualEffectRuntime === runtime) this.visualEffectRuntime = null;
        return;
      }
      const livingEnergy = this.project.theme?.presentationEffects?.livingEnergy;
      if (livingEnergy?.enabled !== false && Array.isArray(livingEnergy?.points) && livingEnergy.points.length) {
        runtime.enableAmbientEnergy({
          points: livingEnergy.points,
          color: livingEnergy.color || '#55d6f2',
          count: livingEnergy.particleCount || 18,
          reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        });
      }
      const authoredMotion = this.project.theme?.presentationEffects?.motionGraphics;
      if (authoredMotion?.enabled !== false && Array.isArray(authoredMotion?.ambient)) {
        runtime.enableAmbientFlipbooks(authoredMotion.ambient, {
          reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        });
      }
      const stage = this.container.querySelector('#previewStage');
      if (stage) stage.dataset.motionGraphics = !this.allowsHtmlVisibleEffects() || runtime.motionTextures.size ? 'authored' : 'fallback';
      if (runtime.motionLoadErrors.size) {
        console.error('Authored motion atlas preload failed.', Object.fromEntries(runtime.motionLoadErrors));
      }
      this.visualEffectRuntimeStatus = 'ready';
      this.updateVisualEffectRuntimeBadge('ready', runtime.motionTextures.size ? `VFX: ${runtime.motionTextures.size} atlases` : 'Pixi VFX ready');
      this.scheduleSymbolMotionSync();
    } catch (error) {
      if (this.disposed || generation !== this.visualEffectMountGeneration) return;
      this.visualEffectRuntimeStatus = 'error';
      this.updateVisualEffectRuntimeBadge('error', 'VFX fallback', error.message);
      console.error('Preview visual effect runtime failed to mount.', error);
    }
  }

  updateVisualEffectRuntimeBadge(status, label, detail = '') {
    const badge = this.container.querySelector('#visualEffectRuntimeBadge');
    const stage = this.container.querySelector('#previewStage');
    if (stage) stage.dataset.visualEffectRuntime = status;
    if (!badge) return;
    badge.dataset.status = status;
    badge.textContent = label;
    badge.title = detail || label;
  }

  resolvePreviewVisualEffectMotion(explicit) {
    if (['full', 'subtle', 'none'].includes(explicit)) return explicit;
    const policy = this.project.animation?.visualEffects?.runtime?.reducedMotion;
    if (policy === 'respect' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'subtle';
    return 'full';
  }

  previewVisualEffectAnchors(payload = {}, cab = this.project.theme.cabinet) {
    const layout = resolveVisualEffectLayout(cab.width, cab.height);
    const geometry = this.reelGeometry || { x: cab.width * 0.25, y: cab.height * 0.25, w: cab.width * 0.5, h: cab.height * 0.5 };
    const firstPosition = payload.wins?.[0]?.positions?.at(-1);
    const reelCount = Math.max(1, Number(this.project.math?.grid?.reels) || 5);
    const rowCount = Math.max(1, Number(geometry.maxRows) || Number(this.project.math?.grid?.rows?.[0]) || 3);
    const targetPixel = firstPosition
      ? {
          x: geometry.x + (Number(firstPosition[0]) + 0.5) * (geometry.w / reelCount),
          y: geometry.y + (Number(firstPosition[1]) + 0.5) * (geometry.h / rowCount),
        }
      : { x: geometry.x + geometry.w * 0.82, y: geometry.y + geometry.h * 0.5 };
    return {
      origin: layout.toDesign({ x: Math.max(cab.width * 0.11, geometry.x - cab.width * 0.045), y: geometry.y + geometry.h * 0.5 }),
      target: layout.toDesign(targetPixel),
    };
  }

  triggerVisualEffect(event, payload = {}, overrides = {}) {
    const runtime = this.visualEffectRuntime;
    const binding = overrides.recipeId
      ? { recipeId: overrides.recipeId, intensity: overrides.intensity, timeScale: overrides.timeScale }
      : getVisualEffectBinding(this.project, event);
    if (!runtime || this.visualEffectRuntimeStatus !== 'ready' || !binding) return null;
    const recipe = resolveVisualEffectRecipe(this.project, binding.recipeId);
    if (!recipe) return null;
    const anchors = this.previewVisualEffectAnchors(payload);
    const motion = this.resolvePreviewVisualEffectMotion(overrides.motion);
    const handle = runtime.play(recipe, {
      viewport: this.viewport,
      motion,
      intensity: overrides.intensity ?? resolveVisualEffectIntensity(binding, payload),
      timeScale: overrides.timeScale ?? binding.timeScale,
      seed: overrides.seed ?? createVisualEffectSeed(event, payload),
      origin: overrides.origin || anchors.origin,
      target: overrides.target || anchors.target,
    });
    const stage = this.container.querySelector('#previewStage');
    if (stage) {
      stage.dataset.visualEffect = recipe.id;
      stage.dataset.visualEffectEvent = event;
      stage.dataset.visualEffectMotion = motion;
      stage.dataset.visualEffectPhase = 'launch';
    }
    return handle;
  }

  handlePreviewVisualEffectFrame({ phase, compiled }) {
    const stage = this.container.querySelector('#previewStage');
    if (!stage) return;
    stage.dataset.visualEffectPhase = phase;
    stage.dataset.visualEffectSeed = String(compiled?.seed ?? '');
    if (phase !== 'contact' || compiled?.motion === 'none') return;
    const camera = compiled?.nodes?.find(node => node.type === 'camera');
    if (!camera?.strength) return;
    this.pulseDirectorClass(stage, compiled.motion === 'subtle' ? 'director-camera-pulse' : 'director-camera-shake', compiled.motion === 'subtle' ? 420 : 520);
  }

  getVisualEffectState() {
    const stage = this.container.querySelector('#previewStage');
    return {
      status: this.visualEffectRuntimeStatus,
      recipeId: stage?.dataset.visualEffect || null,
      event: stage?.dataset.visualEffectEvent || null,
      motion: stage?.dataset.visualEffectMotion || null,
      phase: stage?.dataset.visualEffectPhase || null,
      seed: stage?.dataset.visualEffectSeed || null,
      playing: Boolean(this.visualEffectRuntime?.playing),
      motionAtlasCount: this.visualEffectRuntime?.motionTextures?.size || 0,
      ambientFlipbookCount: this.visualEffectRuntime?.ambientFlipbooks?.length || 0,
      ambientFlipbookAssets: this.visualEffectRuntime?.ambientFlipbooks?.map(book => book.assetId) || [],
      ambientEnergyCount: this.visualEffectRuntime?.ambientEnergy?.particles?.length || 0,
      symbolFlipbookCount: this.visualEffectRuntime?.symbolFlipbooks?.length || 0,
      symbolFlipbookRenderer: this.visualEffectRuntime?.symbolFlipbooks?.length ? 'pixi-webgl-frame-atlas' : null,
      symbolFlipbookSamples: this.visualEffectRuntime?.symbolFlipbooks?.slice(0, 8).map(book => book.meta) || [],
      motionAtlasErrors: this.visualEffectRuntime?.motionLoadErrors ? Object.fromEntries(this.visualEffectRuntime.motionLoadErrors) : {},
    };
  }

  async auditionVisualEffect(args = {}) {
    const started = Date.now();
    while (this.visualEffectRuntimeStatus === 'loading' && Date.now() - started < 4000) await this.wait(50);
    if (this.visualEffectRuntimeStatus !== 'ready') throw new Error('The Preview VFX runtime is not ready.');
    const event = args.event || 'winInfo';
    const payload = {
      amount: Number(args.amount) || 25,
      mode: args.mode || this.selectedMode,
      wins: args.wins || [{ positions: [[0, 1], [1, 1], [2, 1]], symbol: 'H1', win: 25 }],
    };
    const handle = this.triggerVisualEffect(event, payload, args);
    if (!handle) throw new Error(`No enabled visual effect binding exists for “${event}”.`);
    const phase = ['launch', 'contact', 'tail', 'settled'].includes(args.phase) ? args.phase : 'contact';
    const time = phase === 'launch' ? 0.58 : phase === 'contact' ? 1.12 : phase === 'tail' ? 1.72 : this.visualEffectRuntime.current.duration;
    this.visualEffectRuntime.playing = false;
    this.visualEffectRuntime.seek(time);
    this.handlePreviewVisualEffectFrame({ phase, compiled: this.visualEffectRuntime.current });
    return { ...this.getVisualEffectState(), diagnostics: handle.diagnostics };
  }

  renderCabinet(cab) {
    const featureCabinet = resolveMorpheusDreamfallCabinetProfile({
      projectId: this.projectId,
      worldActive: this.isMorpheusDreamfallWorldActive(),
      renderProfile: MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT,
    });
    const layers = [...(cab.layers || [])].sort((a, b) => a.zIndex - b.zIndex);
    const base = layers.map(layer => {
      if (!layer.visible) return '';
      if (featureCabinet?.replacesBaseForeground && layer.assetPackRole === 'foreground') return '';
      const style = `position:absolute;left:${layer.x}px;top:${layer.y}px;width:${layer.width}px;height:${layer.height}px;opacity:${layer.opacity};z-index:${layer.zIndex};mix-blend-mode:${layer.blendMode || 'normal'}`;
      if (layer.src) {
        const regions = Array.isArray(layer.clipRegions) && layer.clipRegions.length ? layer.clipRegions : [null];
        return regions.map((region, index) => {
          const clip = region ? `;clip-path:inset(${Math.max(0, Number(region.y) || 0)}px ${Math.max(0, layer.width - (Number(region.x) || 0) - (Number(region.width) || 0))}px ${Math.max(0, layer.height - (Number(region.y) || 0) - (Number(region.height) || 0))}px ${Math.max(0, Number(region.x) || 0)}px)` : '';
          return `<div class="cabinet-layer cabinet-layer-${layer.type || 'visual'}" data-layer-instance="${layer.id}-${index}" style="${style}${clip}"><img src="${layer.src}" decoding="async" draggable="false" style="width:100%;height:100%;object-fit:contain"></div>`;
        }).join('');
      }
      return '';
    }).join('');
    if (!featureCabinet) return base;
    return `${base}<div class="cabinet-layer cabinet-layer-dreamfall-feature" data-cabinet-profile="${featureCabinet.format}" style="position:absolute;inset:0;width:${featureCabinet.asset.width}px;height:${featureCabinet.asset.height}px;z-index:59;pointer-events:none"><img src="${featureCabinet.asset.src}" decoding="async" draggable="false" style="width:100%;height:100%;object-fit:contain"></div>`;
  }

  allowsHtmlVisibleEffects() {
    const motionGraphics = this.project.theme?.presentationEffects?.motionGraphics;
    return motionGraphics?.enabled !== true || motionGraphics.htmlVisibleEffects !== false;
  }

  renderWorldResponse() {
    if (!this.allowsHtmlVisibleEffects()) return '';
    const environment = this.project.animation?.environment;
    const atmosphere = environment?.enabled === false || !environment ? '' : `
      <span class="preview-dream-atmosphere">
        <i class="preview-dream-moon"></i>
        <i class="preview-dream-portal preview-dream-portal-left"></i>
        <i class="preview-dream-portal preview-dream-portal-right"></i>
        <i class="preview-dream-fog preview-dream-fog-back"></i>
        <i class="preview-dream-fog preview-dream-fog-front"></i>
      </span>`;
    return `<div class="preview-world-response" aria-hidden="true"><i class="preview-world-glow"></i><i class="preview-world-sweep"></i><i class="preview-world-runes"></i><i class="preview-world-threshold"></i>${atmosphere}</div>`;
  }

  renderAmbientFX() {
    if (!this.allowsHtmlVisibleEffects()) return '';
    const effect = (this.project.animation?.particles || []).find(particle => particle.type === 'emberField');
    if (!effect) return '';
    const count = Math.max(8, Math.min(60, Number(effect.count) || 24));
    const color = effect.color || '#ff5a18';
    const secondary = effect.secondaryColor || '#ffc463';
    const speed = Math.max(0.35, Number(effect.speed) || 1);
    return `
      <div class="ambient-fx" aria-hidden="true" style="--ember-color:${color};--ember-secondary:${secondary};--ember-speed:${speed}">
        ${Array.from({ length: count }, (_, index) => {
          const x = (index * 37 + 11) % 100;
          const drift = ((index * 23) % 80) - 40;
          const delay = -((index * 0.47) % 8).toFixed(2);
          const size = 2 + (index * 7) % 6;
          const duration = (5.5 + (index * 13) % 55 / 10) / speed;
          return `<i style="--x:${x}%;--drift:${drift}px;--delay:${delay}s;--size:${size}px;--duration:${duration.toFixed(2)}s"></i>`;
        }).join('')}
      </div>`;
  }

  renderLivingEnvironment() {
    const assets = this.project.theme?.environmentAssets || {};
    const layers = [
      ['floraLeft', 'preview-living-flora preview-living-flora-left'],
      ['floraRight', 'preview-living-flora preview-living-flora-right'],
      ['crownSigil', 'preview-living-crown'],
    ];
    const art = layers.map(([key, className]) => {
      const asset = assets[key];
      if (!asset?.src) return '';
      const x = Number(asset.x) || 0;
      const y = Number(asset.y) || 0;
      const width = Math.max(1, Number(asset.width) || 1);
      const height = Math.max(1, Number(asset.height) || 1);
      return `<div class="${className}" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px"><img src="${this.esc(asset.src)}" decoding="async" draggable="false" alt=""></div>`;
    }).join('');
    return art ? `<div class="preview-living-environment" aria-hidden="true">${art}</div>` : '';
  }

  renderCharacterRig() {
    const character = this.project.theme?.character;
    if (!character?.poses?.idle) return '';
    const placement = character.placement || {};
    const x = Number(placement.x ?? 870);
    const y = Number(placement.y ?? 125);
    const width = Number(placement.width ?? 410);
    const height = Number(placement.height ?? 575);
    const poses = Object.entries(character.poses)
      .filter(([, src]) => Boolean(src))
      .map(([name, src]) => {
        const key = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return `<img class="preview-character-pose" data-pose-key="${this.esc(key)}" src="${this.esc(src)}" alt="" draggable="false">`;
      }).join('');
    const htmlEnergy = this.allowsHtmlVisibleEffects()
      ? '<div class="preview-character-aura"></div><div class="preview-character-rays"></div><div class="preview-character-heat"></div>'
      : '';
    return `
      <div class="preview-character" aria-hidden="true" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px">
        ${htmlEnergy}
        <div class="preview-character-rig">
          ${poses}
        </div>
      </div>`;
  }

  performanceStateForMode(mode = this.selectedMode) {
    const config = (this.project.math?.betModes || []).find(item => item.name === mode);
    return config?.presentationState || config?.profile?.presentationState || 'bonusIdle';
  }

  performanceStateForWin(win) {
    return resolvePresentationWinTier(this.project, win);
  }

  finaleCopy(mode) {
    return [this.label(mode).toUpperCase(), 'FEATURE COMPLETE'];
  }

  startPresentationEnergy(kind = 'verdict') {
    const layer = this.container.querySelector('#previewVisualEffectLayer');
    const config = this.project.theme?.presentationEffects?.announcementEnergy?.[kind];
    if (!layer || !config?.points?.length) return;
    const host = kind === 'mode'
      ? this.container.querySelector('#previewModePortal')
      : this.container.querySelector('.feature-result-celebration, .wincap-celebration');
    if (host) {
      host.appendChild(layer);
      layer.classList.add('is-presentation-nested');
    }
    layer.classList.add('is-presentation-active');
    this.visualEffectRuntime?.enablePresentationEnergy?.({
      ...config,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    });
  }

  stopPresentationEnergy() {
    const layer = this.container.querySelector('#previewVisualEffectLayer');
    layer?.classList.remove('is-presentation-active', 'is-presentation-nested');
    const stage = this.container.querySelector('#previewStage');
    if (layer && stage && layer.parentElement !== stage) stage.appendChild(layer);
    this.visualEffectRuntime?.disablePresentationEnergy?.();
  }

  modePortalCopy(mode) {
    const config = (this.project.math?.betModes || []).find(item => item.name === mode);
    const tier = Object.values(this.project.math?.featureArchitecture?.tiers || {})
      .find(item => item.id === mode);
    const presentation = config?.presentation || {};
    if (!config && tier) {
      const rules = {
        progressiveSymbolUpgrade: 'WINNING COMBINATIONS ASCEND SYMBOLS',
        persistentSymbolMultipliers: 'WINNING SYMBOL MULTIPLIERS PERSIST AND DOUBLE',
        winningCascadeReelExpansion: 'WINNING CASCADES EXPAND THE REELS',
        persistentPositionMultiplierGrid: 'WINNING POSITIONS CHARGE AND PERSIST',
      };
      return ['FEATURE START', String(tier.name || this.label(mode)).toUpperCase(), rules[tier.mechanic] || this.label(tier.mechanic).toUpperCase()];
    }
    return [
      presentation.kicker || 'FEATURE START',
      presentation.title || this.label(mode).toUpperCase(),
      presentation.rule || this.modeRule(config || { name: mode, profile: {} }),
    ];
  }

  showModePortal(mode = this.selectedMode) {
    if (mode === 'base') return;
    const portal = this.container.querySelector('#previewModePortal');
    if (!portal) return;
    const [kicker, title, rule] = this.modePortalCopy(mode);
    portal.querySelector('#previewModeKicker').textContent = kicker;
    portal.querySelector('#previewModeTitle').textContent = title;
    portal.querySelector('#previewModeRule').textContent = rule;
    portal.classList.remove('is-visible');
    void portal.offsetWidth;
    portal.classList.add('is-visible');
    this.startPresentationEnergy('mode');
    const energyToken = this.presentationEnergyToken = (this.presentationEnergyToken || 0) + 1;
    window.setTimeout(() => {
      portal.classList.remove('is-visible');
      if (energyToken === this.presentationEnergyToken) this.stopPresentationEnergy();
    }, 2400);
  }

  featurePresentationMode(round) {
    const selected = (this.project.math?.betModes || []).find(item => item.name === round?.mode);
    if ((selected?.profile?.entry || '') === 'freeSpins') return round.mode;
    return round?.featureTier || round?.mode || this.selectedMode;
  }

  worldStateForAnimation(state) {
    if (state === 'anticipation') return 'anticipation';
    if (state === 'spinStart' || state === 'spinning') return 'spin';
    if (state === 'featureResult' || state === 'wincap') return 'verdict';
    if (state.startsWith('win')) return 'win';
    if (['bonusEntry', 'bonusIdle'].includes(state)) return 'feature';
    return 'idle';
  }

  scheduleIdlePerformance() {
    window.clearTimeout(this.idlePerformanceTimer);
    this.idlePerformanceTimer = window.setTimeout(() => {
      const stage = this.container.querySelector('#previewStage');
      if (this.spinning || stage?.dataset.animationState !== 'idle') {
        this.scheduleIdlePerformance();
        return;
      }
      const hasAlternateIdle = Boolean(this.project.theme?.character?.poses?.idleAlt);
      this.setAnimationState(hasAlternateIdle ? 'idleAlt' : 'idle');
      this.reactionReturnTimer = window.setTimeout(() => {
        if (!this.spinning) this.setAnimationState('idle');
      }, 1250);
    }, 6200 + Math.random() * 4200);
  }

  setAnimationState(state) {
    if (this.disposed) return;
    window.clearTimeout(this.idlePerformanceTimer);
    window.clearTimeout(this.reactionReturnTimer);
    this.animationEngine.transition(state);
    this.spineRuntime?.transition(state);
    const stage = this.container.querySelector('#previewStage');
    if (stage) {
      stage.dataset.animationState = state;
      stage.dataset.performanceMode = this.selectedMode.replaceAll('_', '-');
      stage.dataset.worldState = this.worldStateForAnimation(state);
    }
    const candidates = this.animationEngine.poseCandidates(state);
    const poses = [...this.container.querySelectorAll('.preview-character-pose')];
    const activePose = candidates.map(candidate => poses.find(pose => pose.dataset.poseKey === candidate)).find(Boolean)
      || poses.find(pose => pose.dataset.poseKey === 'idle');
    poses.forEach(pose => pose.classList.toggle('is-active', pose === activePose));
    if (state === 'idle') this.scheduleIdlePerformance();
  }

  renderReels(math, cab) {
    const reelArea = cab.layers?.find(l => l.type === 'reel-area');
    let x = reelArea ? reelArea.x : cab.width * 0.12;
    let y = reelArea ? reelArea.y : cab.height * 0.12;
    let w = reelArea ? reelArea.width : cab.width * 0.76;
    let h = reelArea ? reelArea.height : cab.height * 0.60;

    const { reels, rows } = math.grid;
    const reservedWorld = this.isMorpheusDreamfallWorldActive();
    const profile = reservedWorld ? createMorpheusDreamfallRenderProfile({
      viewportWidth: cab.width,
      viewportHeight: cab.height,
      stageWidth: cab.width,
      stageHeight: cab.height,
    }) : null;
    const gap = profile?.gap ?? 4;
    if (profile) {
      x = profile.world.x;
      y = profile.world.y;
      w = profile.world.width;
      h = profile.world.height;
    }
    const cellW = (w - gap * (reels - 1)) / reels;
    const maxRows = reservedWorld ? MORPHEUS_RESERVED_WORLD_ROWS : Math.max(...rows);
    const cellH = h / maxRows;
    const buffer = 2;

    let html = `<div class="reel-frame" data-dreamfall-world="${reservedWorld ? 'active' : 'inactive'}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:50;border-radius:8px;overflow:hidden;background:rgba(0,0,0,0.5)">`;

    for (let r = 0; r < reels; r++) {
      const rRows = rows[r] || rows[0];
      const maskH = rRows * cellH;
      const offsetY = (maxRows - rRows) * cellH / (reservedWorld ? 1 : 2);
      const stripCells = (reservedWorld ? maxRows : rRows) + buffer * 2;
      const stripH = stripCells * cellH;

      html += `
        <div class="reel-mask" data-reel="${r}" data-reserved-world="${reservedWorld}" style="
          position:absolute;
          left:${r * (cellW + gap)}px;
          top:${offsetY}px;
          width:${cellW}px;
          height:${maskH}px;
          overflow:hidden;
        ">
          <div class="reel-strip" data-reel="${r}" style="
            position:absolute;
            left:0;top:${-buffer * cellH}px;
            width:${cellW}px;
            height:${stripH}px;
            will-change:transform;
          ">`;

      for (let s = 0; s < stripCells; s++) {
        const visible = s >= buffer && s < buffer + rRows;
        html += `<div class="reel-sym" data-reel="${r}" data-pos="${s}" data-visible="${visible}" style="
          position:absolute;
          left:0;
          top:${s * cellH}px;
          width:${cellW}px;
          height:${cellH}px;
          display:flex;align-items:center;justify-content:center;
          font-weight:700;
          font-size:${Math.min(cellW, cellH) * 0.3}px;
          color:#1a1a2e;
          box-sizing:border-box;
          border-bottom:2px solid rgba(0,0,0,0.2);
        "></div>`;
      }

      html += `</div></div>`;
      if (reservedWorld) {
        html += `<div class="reel-cap" data-reel="${r}" aria-hidden="true" style="position:absolute;left:${r * (cellW + gap)}px;top:${offsetY}px;width:${cellW}px;height:3px;z-index:4;transform:translateY(-1px);border-radius:3px;background:linear-gradient(90deg,rgba(214,168,75,.2),#d6a84b,rgba(214,168,75,.2));box-shadow:0 0 8px rgba(85,214,194,.48);pointer-events:none"></div>`;
      }
    }

    html += `<div class="preview-mechanic-state-layer" id="previewMechanicStateLayer" aria-hidden="true"></div></div>`;

    this.reelGeometry = { x, y, w, h, cellW, cellH, gap, buffer, maxRows, reservedWorld, profile };
    return html;
  }

  renderHUD() {
    const cab = this.project.theme.cabinet;
    const hudY = cab.height * 0.78;
    const mode = this.activeMode();
    const autoLabel = this.autoSpinsRemaining > 0 ? String(this.autoSpinsRemaining) : 'AUTO';
    const compactModeLabel = mode.name === 'base'
      ? 'BASE'
      : this.label(mode.name).trim().split(/\s+/)[0].toUpperCase();
    return `
      ${this.isMorpheusDreamfallWorldActive() ? '' : `<button class="preview-mode-chip ${this.selectedMode !== 'base' ? 'is-feature' : ''}" id="previewModeChip" aria-label="Choose game mode">
        <span>${this.esc(this.modeKind(mode))}</span><strong id="hudModeName">${this.esc(this.label(mode.name))}</strong><small id="hudModeCost">${Number(mode.cost)}×</small>
      </button>`}
      <div class="preview-hud" style="position:absolute;left:0;bottom:0;width:100%;height:${cab.height - hudY}px;z-index:60">
        <button class="hud-art-button" id="previewPlayerMenu" aria-label="Open game menu"><img src="/assets/morpheus-control-menu-v1.png" alt=""><span>MENU</span></button>
        <button class="hud-art-button" id="previewBonusMenu" aria-label="Choose game mode, current ${this.esc(this.label(mode.name))}"><img src="/assets/morpheus-control-bonus-v1.png" alt=""><span>${this.esc(compactModeLabel)}</span></button>
        <div class="hud-group hud-balance">
          <span class="hud-label">BALANCE</span>
          <span class="hud-value" id="hudBalance">${this.balance.toFixed(2)}</span>
        </div>
        <button class="hud-art-button hud-step-button" id="previewBetDown" aria-label="Decrease play amount"><img src="/assets/morpheus-control-minus-v1.png" alt=""></button>
        <div class="hud-group hud-bet">
          <span class="hud-label">PLAY AMOUNT</span>
          <span class="hud-value" id="hudBaseBet">${this.baseBet.toFixed(2)}</span>
          <small class="hud-total" id="hudBet">TOTAL ${this.bet.toFixed(2)}</small>
        </div>
        <button class="hud-art-button hud-step-button" id="previewBetUp" aria-label="Increase play amount"><img src="/assets/morpheus-control-plus-v1.png" alt=""></button>
        <button class="spin-btn" id="previewSpin">${this.autoSpinsRemaining > 0 ? 'STOP' : 'SPIN'}</button>
        <div class="hud-group hud-win">
          <span class="hud-label">WIN</span>
          <span class="hud-value" id="hudWin">${this.lastWin.toFixed(2)}</span>
        </div>
        <button class="hud-art-button ${this.autoSpinsRemaining > 0 ? 'is-active' : ''}" id="previewAutoMenu" aria-label="Configure autoplay"><img src="/assets/morpheus-control-autoplay-v1.png" alt=""><span id="hudAutoCount">${autoLabel}</span></button>
        <button class="hud-art-button ${this.turboMode ? 'is-active' : ''}" id="previewTurbo" aria-label="Toggle fast play"><img src="/assets/morpheus-control-turbo-v1.png" alt=""><span>TURBO</span></button>
      </div>
      <div class="preview-feature-progress" id="previewFeatureProgress" aria-live="polite">
        <span id="previewFeatureMode"></span>
        <strong id="previewFeatureCount"></strong>
        <small id="previewFeatureTotal"></small>
        <em id="previewFeatureMechanic"></em>
      </div>
      ${this.isMorpheusDreamfallWorldActive() ? `
        <div id="previewDreamfallHud" aria-live="polite" data-status="${this.esc(this.morpheusDreamfallState?.status || 'ready')}" style="position:absolute;right:2%;top:1.5%;z-index:82;display:${this.isMorpheusDreamfallWorldActive() ? 'grid' : 'none'};grid-template-columns:auto auto;gap:2px 12px;min-width:174px;padding:7px 11px;border:1px solid rgba(214,168,75,.55);border-radius:10px;background:rgba(8,10,27,.86);box-shadow:0 8px 28px rgba(0,0,0,.55);color:#e9e4ff;pointer-events:none">
          <span style="font-size:9px;letter-spacing:1.2px;color:#55d6c2">DREAMFALL</span><strong id="dreamfallHudStatus" style="font-size:10px;text-align:right">${this.esc(this.morpheusDreamfallState?.status || 'READY')}</strong>
          <small>CHAIN</small><b id="dreamfallHudChain">${Number(this.morpheusDreamfallState?.hud?.chainHit || 0)} / 5</b>
          <small>FREE SPINS</small><b id="dreamfallHudRemaining">${Number(this.morpheusDreamfallState?.hud?.freeSpinsRemaining || 0)}</b>
          <small>AWARDED</small><b id="dreamfallHudSpins">${Number(this.morpheusDreamfallState?.hud?.awardedFreeSpins || 0)}</b>
          <small>RUNNING WIN</small><b id="dreamfallHudWin">${(Number(this.morpheusDreamfallState?.hud?.runningWin || 0) / BOOK_AMOUNT_MULTIPLIER * this.baseBet).toFixed(2)}</b>
          <small>REELS</small><b id="dreamfallHudRows">${this.esc((this.morpheusDreamfallState?.hud?.reelRows || this.project.math.grid.rows).join('·'))}</b>
        </div>` : ''}
      ${this.renderPlayerOverlays()}
    `;
  }

  selectPlayerMode(name) {
    const mode = (this.project.math?.betModes || []).find(item => item.name === name);
    if (!mode || this.spinning) return;
    this.stopAutoSpins();
    if (this.isMorpheusDreamfallWorldActive()) {
      this.deactivateMorpheusDreamfallWorld(`mode-selection:${mode.name}`);
    }
    this.clearFeatureState();
    this.selectedMode = mode.name;
    this.bet = this.totalWager(mode);
    this.lastWin = 0;
    this.showModeMenu = false;
    this.render();
  }

  stepBaseBet(direction) {
    if (this.spinning || this.autoSpinsRemaining > 0) return;
    const current = this.baseBetOptions.findIndex(value => Math.abs(value - this.baseBet) < 1e-9);
    const fallback = this.baseBetOptions.reduce((best, value, index) => (
      Math.abs(value - this.baseBet) < Math.abs(this.baseBetOptions[best] - this.baseBet) ? index : best
    ), 0);
    const next = Math.max(0, Math.min(this.baseBetOptions.length - 1, (current >= 0 ? current : fallback) + direction));
    this.baseBet = this.baseBetOptions[next];
    this.bet = this.totalWager();
    this.updateHUD();
  }

  toggleTurboMode() {
    if (this.spinning) return;
    this.turboMode = !this.turboMode;
    this.container.querySelector('#previewTurbo')?.classList.toggle('is-active', this.turboMode);
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    this.audioEngine.setMuted(!this.soundEnabled);
  }

  stopAutoSpins() {
    window.clearTimeout(this.autoSpinTimer);
    this.autoSpinTimer = null;
    this.autoSpinsRemaining = 0;
    this.updateHUD();
  }

  queueAutoSpin(delay = this.turboMode ? 180 : 520) {
    window.clearTimeout(this.autoSpinTimer);
    this.autoSpinTimer = null;
    if (this.disposed || this.spinning || this.autoSpinsRemaining <= 0) return;
    this.autoSpinTimer = window.setTimeout(() => {
      this.autoSpinTimer = null;
      if (this.disposed || this.spinning || this.autoSpinsRemaining <= 0) return;
      this.autoSpinsRemaining -= 1;
      this.updateHUD();
      this.spin({ automatic: true });
    }, delay);
  }

  selectedDirectorRecipe() {
    return this.project.presentationDirector.recipes.find(recipe => recipe.event === this.selectedDirectorEvent)
      || this.project.presentationDirector.recipes[0] || null;
  }

  renderDirectorPanel() {
    const coverage = getPresentationCoverage(this.project);
    const issues = validatePresentationDirector(this.project);
    const interruption = getPresentationInterruptionSummary(this.project);
    const polish = getPresentationPolishSummary(this.project);
    const recipe = this.selectedDirectorRecipe();
    const duration = Math.max(1, Number(recipe?.duration) || 1);
    const reelMotion = normalizeReelChoreography(this.project.presentationDirector.reelChoreography);
    const winEscalation = normalizeWinEscalation(this.project.presentationDirector.winEscalation);
    const animationTargets = ['idle', 'spinStart', 'spinning', 'spinStop', 'anticipation', 'winSmall', 'winMedium', 'winBig', 'winMega', 'wincap', 'bonusEntry', 'bonusIdle', 'featureResult'];
    return `
      <aside class="presentation-director" aria-label="Presentation Director">
        <header class="director-header">
          <div><span>Event choreography</span><h2>Presentation Director</h2></div>
          <strong>${coverage.percent}%</strong>
        </header>
        <p class="director-intro">One event recipe drives animation, reels, sound, world response, camera and UI—then settles safely.</p>
        <section class="director-torture-test ${interruption.complete ? 'is-complete' : interruption.failures.length ? 'has-failures' : ''}">
          <div>
            <strong>Transition Torture Test</strong>
            <span>${interruption.complete ? `${interruption.passed}/${interruption.total} runtime cases passed` : interruption.stale ? 'Choreography changed — evidence is stale' : 'Solo, cancel, replace, queue and ignore behavior not yet proven'}</span>
          </div>
          <button class="btn-primary" id="directorRunTorture">${interruption.complete ? 'Run Again' : 'Run Automated QA'}</button>
          <small>Evidence fingerprint ${interruption.fingerprint}${interruption.runAt ? ` · ${this.esc(new Date(interruption.runAt).toLocaleString())}` : ''}</small>
          ${interruption.failures.length ? `<ul>${interruption.failures.slice(0, 4).map(item => `<li>${this.esc(item.event)}: ${this.esc(item.detail)}</li>`).join('')}</ul>` : ''}
        </section>
        <section class="director-torture-test ${polish.complete ? 'is-complete' : polish.fresh ? 'has-failures' : ''}">
          <div>
            <strong>Presentation Polish Audit</strong>
            <span>${polish.complete ? 'Reel cadence, anticipation and tier escalation passed' : polish.stale ? 'Motion or animation timing changed — evidence is stale' : polish.fresh ? `${polish.issues.length} measured timing issue${polish.issues.length === 1 ? '' : 's'}` : 'Reel timing and tier escalation not yet measured'}</span>
          </div>
          <small>Evidence fingerprint ${polish.fingerprint}${polish.runAt ? ` · ${this.esc(new Date(polish.runAt).toLocaleString())}` : ''}</small>
          ${polish.issues.length ? `<ul>${polish.issues.slice(0, 4).map(issue => `<li>${this.esc(issue)}</li>`).join('')}</ul>` : ''}
        </section>
        <div class="director-coverage"><i style="width:${coverage.percent}%"></i></div>
        <small class="director-coverage-copy">${coverage.covered.length}/${coverage.required.length} core Stake events covered${coverage.missing.length ? ` · missing ${coverage.missing.join(', ')}` : ''}</small>
        ${issues.length ? `<div class="director-issues">${issues.slice(0, 4).map(issue => `<span>${this.esc(issue.message)}</span>`).join('')}</div>` : ''}
        <details class="director-motion-contract">
          <summary><span><strong>Factory motion contract</strong><small>Data-driven reel cadence, anticipation hold and tier escalation</small></span><b>${reelMotion.perReelDelayMs + reelMotion.perReelDurationMs}ms stop gap</b></summary>
          <div class="director-recipe-grid">
            <label>First stop (ms)<input type="number" min="200" max="2000" step="10" value="${reelMotion.baseDurationMs}" data-director-reel="baseDurationMs"></label>
            <label>Reel start gap (ms)<input type="number" min="0" max="1000" step="10" value="${reelMotion.perReelDelayMs}" data-director-reel="perReelDelayMs"></label>
            <label>Reel duration growth (ms)<input type="number" min="0" max="1000" step="10" value="${reelMotion.perReelDurationMs}" data-director-reel="perReelDurationMs"></label>
            <label>Anticipation hold (ms)<input type="number" min="0" max="3000" step="10" value="${reelMotion.anticipationHoldMs}" data-director-reel="anticipationHoldMs"></label>
          </div>
          <div class="director-tier-contract">
            ${WIN_TIER_ORDER.map(tier => `<label><strong>${this.esc(tier.replace('win', ''))}</strong><span>Starts at <input type="number" min="0" step="1" value="${winEscalation.thresholds[tier]}" data-director-threshold="${tier}">×</span><span>Hold <input type="number" min="200" step="100" value="${winEscalation.tierDurations[tier]}" data-director-tier-duration="${tier}">ms</span></label>`).join('')}
          </div>
        </details>
        <div class="director-actions">
          <button class="btn-secondary" id="directorApplyDefaults">Restore Factory Recipes</button>
          <button class="btn-primary" id="directorAudition" ${recipe ? '' : 'disabled'}>Audition Event</button>
        </div>
        <label class="director-event-select">Event recipe
          <select id="directorEventSelect">${this.project.presentationDirector.recipes.map(item => `<option value="${this.esc(item.event)}" ${item.event === recipe?.event ? 'selected' : ''}>${this.esc(item.event)} — ${this.esc(item.name)}</option>`).join('')}</select>
        </label>
        ${recipe ? `
          <section class="director-recipe">
            <div class="director-recipe-grid">
              <label>Name<input id="directorRecipeName" value="${this.esc(recipe.name)}"></label>
              <label>Interrupt policy<select id="directorInterrupt"><option value="replace" ${recipe.interrupt === 'replace' ? 'selected' : ''}>Replace current</option><option value="queue" ${recipe.interrupt === 'queue' ? 'selected' : ''}>Queue</option><option value="ignore" ${recipe.interrupt === 'ignore' ? 'selected' : ''}>Ignore while busy</option></select></label>
              <label>Duration (ms)<input id="directorDuration" type="number" min="0" step="10" value="${recipe.duration}"></label>
              <label>Settle state<select id="directorSettle"><option value="">No automatic settle</option>${animationTargets.map(state => `<option value="${state}" ${recipe.settleState === state ? 'selected' : ''}>${state}</option>`).join('')}</select></label>
            </div>
            <div class="director-timeline" style="--director-duration:${duration}">
              <div class="director-time-ruler"><span>0</span><span>${Math.round(duration / 2)}ms</span><span>${duration}ms</span></div>
              ${Object.keys(PRESENTATION_CHANNELS).map(channel => {
                const channelCues = recipe.cues.filter(item => item.channel === channel);
                return `<div class="director-lane"><b>${channel}</b><div>${channelCues.map(item => `<i class="director-cue-dot ${item.enabled === false ? 'is-disabled' : ''}" style="left:${Math.min(100, item.at / duration * 100)}%" title="${this.esc(`${item.at}ms ${item.action} ${item.target}`)}"></i>`).join('')}</div></div>`;
              }).join('')}
            </div>
            <div class="director-cue-list">
              ${recipe.cues.map(item => `
                <article class="director-cue ${item.enabled === false ? 'is-disabled' : ''}">
                  <span>${item.at}<small>ms</small></span>
                  <div><strong>${this.esc(item.channel)} / ${this.esc(item.action)}</strong><small>${this.esc(item.target)}</small></div>
                  <label><input type="checkbox" data-director-cue-enable="${this.esc(item.id)}" ${item.enabled === false ? '' : 'checked'}> on</label>
                  <button class="btn-tiny" data-director-cue-delete="${this.esc(item.id)}" title="Delete cue">×</button>
                </article>`).join('')}
            </div>
            <div class="director-add-cue">
              <label>At<input id="directorCueAt" type="number" min="0" step="10" value="0"></label>
              <label>Channel<select id="directorCueChannel">${Object.keys(PRESENTATION_CHANNELS).map(channel => `<option value="${channel}">${channel}</option>`).join('')}</select></label>
              <label>Action<select id="directorCueAction">${PRESENTATION_CHANNELS.animation.map(action => `<option value="${action}">${action}</option>`).join('')}</select></label>
              <label>Target<input id="directorCueTarget" value="idle" placeholder="state, sound, or $value"></label>
              <button class="btn-secondary" id="directorAddCue">Add Cue</button>
            </div>
          </section>
        ` : '<p class="empty-state">No presentation recipe selected.</p>'}
        <div class="director-audition-status" id="directorAuditionStatus">Ready to audition ${this.esc(recipe?.event || 'an event')}.</div>
      </aside>`;
  }

  esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  label(value) {
    return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
  }

  formatPayout(value) {
    const amount = Number(value) || 0;
    return amount ? `${amount.toFixed(amount < 1 ? 3 : 2).replace(/0+$/, '').replace(/\.$/, '')}x` : '—';
  }

  modeRule(mode) {
    const profile = mode.profile || {};
    const entry = profile.entry || (mode.isBuyBonus ? 'freeSpins' : 'base');
    if (entry === 'freeSpins') {
      const tier = Object.values(this.project.math?.featureArchitecture?.tiers || {})
        .find(item => item.id === profile.featureTier);
      const behavior = {
        progressiveSymbolUpgrade: 'winning combinations upgrade symbols',
        persistentSymbolMultipliers: 'winning symbol multipliers persist',
        winningCascadeReelExpansion: 'winning cascades expand reels',
        persistentPositionMultiplierGrid: 'winning positions charge multipliers',
      }[tier?.mechanic] || this.label(tier?.mechanic || 'configured feature');
      return `${profile.freeSpins || 10} free spins · ${behavior} · retriggers ${profile.retriggers === false ? 'off' : 'on'}`;
    }
    const modifiers = [];
    if (Number(profile.scatterWeightMultiplier) > 1) modifiers.push(`${Number(profile.scatterWeightMultiplier)}× scatter chance`);
    if (Number(profile.specialSymbolBoost) > 1) modifiers.push(`${Number(profile.specialSymbolBoost)}× special-symbol selection`);
    return `${modifiers.join(' · ') || 'standard reels'} · natural free spins ${profile.triggerFreeSpins === false ? 'off' : 'on'}`;
  }

  activeMode() {
    return this.mathEngine.getBetMode(this.selectedMode);
  }

  totalWager(mode = this.activeMode()) {
    return this.baseBet * (Number(mode?.cost) || 1);
  }

  modeKind(mode) {
    if (mode.name === 'base') return 'STANDARD PLAY';
    const entry = mode.profile?.entry || (mode.isBuyBonus ? 'freeSpins' : 'base');
    if (entry === 'freeSpins') return mode.isBuyBonus ? 'BONUS FEATURE' : 'FEATURE MODE';
    return Number(mode.cost) > 1 ? 'ENHANCED PLAY' : 'PLAY MODE';
  }

  renderModeCards() {
    return (this.project.math?.betModes || []).map(mode => `
      <button class="player-mode-card ${mode.name === this.selectedMode ? 'is-selected' : ''}" data-player-mode="${this.esc(mode.name)}" aria-pressed="${mode.name === this.selectedMode}">
        <span class="player-mode-copy">
          <small>${this.esc(this.modeKind(mode))}</small>
          <strong>${this.esc(this.label(mode.name))}</strong>
          <span>${this.esc(this.modeRule(mode))}</span>
          <b>${Number(mode.cost) === 1 ? 'BASE BET' : `${Number(mode.cost).toLocaleString()}× BASE BET`} · RTP ${(Number(mode.rtp || this.project.math.rtp) * 100).toFixed(2)}%</b>
        </span>
      </button>`).join('');
  }

  renderPlayerOverlays() {
    const mode = this.activeMode();
    const close = '<button class="player-overlay-close" data-player-overlay-close aria-label="Close">CLOSE</button>';
    const modeOverlay = this.showModeMenu ? `
      <div class="preview-player-overlay" data-player-overlay="modes">
        <section class="player-mode-dialog" role="dialog" aria-modal="true" aria-label="Select game mode">
          <header><div><small>DREAM PATHS</small><strong>CHOOSE YOUR MODE</strong></div>${close}</header>
          <div class="player-mode-grid">${this.renderModeCards()}</div>
          <footer>Selected cost: ${this.totalWager(mode).toFixed(2)} · The play amount is multiplied by the chosen mode cost.</footer>
        </section>
      </div>` : '';
    const menuOverlay = this.showPlayerMenu ? `
      <div class="preview-player-overlay player-menu-overlay" data-player-overlay="menu">
        <aside class="player-menu-drawer" role="dialog" aria-modal="true" aria-label="Game menu">
          <header><div><small>MORPHEUS</small><strong>GAME MENU</strong></div>${close}</header>
          <button class="player-menu-entry" id="previewPlayerInfo"><img src="/assets/morpheus-control-info-v1.png" alt=""><span><strong>GAME INFO</strong><small>Rules, paytable, RTP and mechanics</small></span></button>
          <button class="player-menu-entry" id="previewPlayerSound"><img src="/assets/morpheus-control-sound-v1.png" alt=""><span><strong>SOUND ${this.soundEnabled ? 'ON' : 'OFF'}</strong><small>Music, ambience and effects</small></span></button>
          <button class="player-menu-entry" id="previewPlayerTurbo"><img src="/assets/morpheus-control-turbo-v1.png" alt=""><span><strong>FAST PLAY ${this.turboMode ? 'ON' : 'OFF'}</strong><small>Accelerated reel choreography</small></span></button>
        </aside>
      </div>` : '';
    const autoOverlay = this.showAutoMenu ? `
      <div class="preview-player-overlay" data-player-overlay="autoplay">
        <section class="player-auto-dialog" role="dialog" aria-modal="true" aria-label="Autoplay confirmation">
          <header><div><small>AUTOPLAY</small><strong>CONFIRM AUTO SPINS</strong></div>${close}</header>
          <p>Choose a bounded number of rounds. Autoplay stops when you press the spin button again.</p>
          <div class="player-auto-options">
            ${[10, 25, 50].map(count => `<button class="${count === this.pendingAutoSpins ? 'is-selected' : ''}" data-auto-count="${count}">${count}</button>`).join('')}
          </div>
          <button class="player-auto-confirm" id="previewAutoConfirm">START ${this.pendingAutoSpins} AUTO SPINS</button>
        </section>
      </div>` : '';
    return `${modeOverlay}${menuOverlay}${autoOverlay}`;
  }

  renderRulesPanel() {
    const summary = getPlayerInformationSummary(this.project);
    const information = summary.manifest;
    const paidSymbols = information.symbols.filter(symbol =>
      Object.values(symbol.payouts || {}).some(value => Number(value) > 0)
    );
    const kinds = [...new Set(paidSymbols.flatMap(symbol => Object.keys(symbol.payouts || {}).map(Number)))]
      .filter(Number.isFinite).sort((a, b) => b - a);

    return `
      <div class="preview-rules-overlay" role="presentation" data-close-rules>
        <section class="preview-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="previewRulesTitle">
          <header class="rules-header">
            <div>
              <span class="rules-kicker">Game Information</span>
              <h2 id="previewRulesTitle">${this.esc(information.identity.name)}</h2>
              <p>${this.esc(information.summary)}</p>
            </div>
            <button class="rules-close" id="previewRulesClose" aria-label="Close game information">×</button>
          </header>

          <div class="rules-audit ${summary.complete ? 'is-complete' : summary.fresh ? 'has-failures' : ''}">
            <div><strong>${summary.complete ? 'Player information verified' : summary.fresh ? 'Player information needs repair' : summary.stale ? 'Player information evidence is stale' : 'Player information has not been audited'}</strong>
              <span>${summary.complete ? `${information.symbols.length} symbols · ${information.modes.length} modes · ${information.disclosures.length} disclosures` : summary.fresh ? summary.issues.join(' ') : 'Audit the generated contract against the current game math and release identity.'}</span>
            </div>
            <button class="tool-btn" id="previewRulesAudit">${summary.fresh ? 'Run Again' : 'Audit Player Info'}</button>
          </div>

          <div class="rules-summary">
            <div><span>RTP</span><strong>${(information.rtp * 100).toFixed(2)}%</strong></div>
            <div><span>Maximum Win</span><strong>${Number(information.wincap).toLocaleString()}x</strong></div>
            <div><span>Win System</span><strong>${this.esc(information.winSystem.label)}</strong></div>
            <div><span>Volatility</span><strong>${this.label(information.volatility)}</strong></div>
          </div>

          <div class="rules-columns">
            <section class="rules-section">
              <h3>${this.esc(information.winSystem.label)} & Symbols</h3>
              <p>${this.esc(information.winSystem.description)}</p>
              <div class="rules-paytable">
                <div class="rules-pay-row rules-pay-head" style="grid-template-columns:minmax(130px,1.5fr) repeat(${kinds.length},.62fr)"><span>Symbol</span>${kinds.map(kind => `<span>${kind}</span>`).join('')}</div>
                ${paidSymbols.map(symbol => `
                  <div class="rules-pay-row" style="grid-template-columns:minmax(130px,1.5fr) repeat(${kinds.length},.62fr)">
                    <span class="rules-symbol">${symbol.src ? `<img src="${this.esc(symbol.src)}" alt="">` : ''}${this.esc(symbol.label)}</span>
                    ${kinds.map(kind => `<span>${this.formatPayout(symbol.payouts?.[kind])}</span>`).join('')}
                  </div>`).join('')}
              </div>
              ${information.specialRules.map(rule => `<p class="rules-note"><strong>${this.esc(this.label(rule.key))}:</strong> ${this.esc(rule.text)}</p>`).join('')}
              ${information.triggers.length ? `<p class="rules-note"><strong>Feature triggers:</strong> ${information.triggers.map(trigger => this.esc(trigger.text)).join(' ')}</p>` : ''}
              ${information.mechanics.length ? `<p class="rules-note"><strong>Features:</strong> ${information.mechanics.map(mechanic => this.esc(`${mechanic.name}: ${mechanic.description}`)).join(' ')}</p>` : ''}
              <p class="rules-note"><strong>Maximum Win:</strong> the configured maximum-win outcome awards ${Number(information.wincap).toLocaleString()}x.</p>
              <p class="rules-note"><strong>Controls:</strong> ${this.esc(information.controls)}</p>
            </section>

            <section class="rules-section">
              <h3>Selectable Wager Modes</h3>
              <div class="rules-mode-list">
                ${information.modes.map(mode => `
                  <article class="rules-mode-card">
                    <div><strong>${this.esc(mode.label)}</strong><span>${Number(mode.cost)}x bet</span></div>
                    <p>${this.esc(mode.description)}</p>
                    <small>RTP ${(mode.rtp * 100).toFixed(2)}% · Max ${Number(mode.maxWin).toLocaleString()}x</small>
                  </article>`).join('')}
              </div>
              ${information.governedModes?.length ? `
                <h3>Feature & Governed Modes</h3>
                <div class="rules-mode-list">
                  ${information.governedModes.filter(mode => !mode.selectable).map(mode => `
                    <article class="rules-mode-card">
                      <div><strong>${this.esc(mode.label)}</strong><span>${mode.releaseGated ? 'PRICE PENDING APPROVAL' : mode.entryPolicy === 'natural' ? 'NATURAL ENTRY ONLY' : this.esc(this.label(mode.entryPolicy))}</span></div>
                      <p>${this.esc(mode.description)}</p>
                      <small>${this.esc((mode.mechanics || []).map(item => this.label(item)).join(' · '))}</small>
                    </article>`).join('')}
                </div>` : ''}
            </section>
          </div>

          <footer class="rules-footer">${this.esc(information.disclaimer)}</footer>
        </section>
      </div>`;
  }

  getSymbolColor(sym) {
    if (!sym) return '#555';
    const s = this.project.theme.symbols?.find(s => s.name === sym || s.id === sym);
    const tier = s?.tier || 'low';
    const colors = {
      high: 'linear-gradient(135deg, #ff9a3c, #ff6f00)',
      medium: 'linear-gradient(135deg, #4fc3f7, #0288d1)',
      low: 'linear-gradient(135deg, #90a4ae, #607d8b)',
      special: 'linear-gradient(135deg, #e040fb, #aa00ff)',
    };
    return colors[tier] || colors.low;
  }

  morpheusSymbolContentSafeRect(sym) {
    if (!this.isMorpheusDreamfallWorldActive() || !this.reelGeometry) return null;
    const source = this.preloadedImages.get(sym?.src);
    const sourceWidth = Number(source?.naturalWidth) || 1;
    const sourceHeight = Number(source?.naturalHeight) || 1;
    return createMorpheusContentSafeRect({
      cellWidth: this.reelGeometry.cellW,
      cellHeight: this.reelGeometry.cellH,
      sourceWidth,
      sourceHeight,
    });
  }

  setSymbolCell(cell, symName) {
    const sym = this.project.theme.symbols?.find(s => s.name === symName || s.id === symName);
    cell.title = symName || '';
    cell.dataset.symbol = String(symName || '').toLowerCase().replaceAll('_', '-');
    cell.dataset.symbolName = symName || '';
    if (sym?.motionProfile) cell.dataset.motion = sym.motionProfile;
    else delete cell.dataset.motion;
    if (sym?.src && this.assetStatus.get(sym.src) === true) {
      // Use a real image element so both the browser and shared-frame capture
      // render the exact same symbol art reliably.
      const currentImage = cell.firstElementChild;
      const image = currentImage?.tagName === 'IMG' ? currentImage : document.createElement('img');
      if (image.getAttribute('src') !== sym.src) image.src = sym.src;
      image.alt = symName || '';
      image.draggable = false;
      image.decoding = 'async';
      image.loading = 'eager';
      const safeRect = this.morpheusSymbolContentSafeRect(sym);
      image.classList.toggle('reel-symbol-content-safe', Boolean(safeRect));
      image.style.width = safeRect ? `${safeRect.width}px` : '100%';
      image.style.height = safeRect ? `${safeRect.height}px` : '100%';
      image.style.objectFit = 'contain';
      image.style.pointerEvents = 'none';
      if (safeRect) {
        image.dataset.sourceAspectRatio = String(safeRect.sourceAspectRatio);
        image.dataset.contentAspectRatio = String(safeRect.aspectRatio);
      } else {
        delete image.dataset.sourceAspectRatio;
        delete image.dataset.contentAspectRatio;
      }
      if (currentImage !== image || cell.childElementCount !== 1) cell.replaceChildren(image);
      cell.style.background = 'none';
      cell.style.backgroundImage = '';
      this.scheduleSymbolMotionSync();
      return;
    }
    cell.replaceChildren();
    cell.style.backgroundImage = '';
    cell.textContent = symName || '';
    cell.style.background = this.getSymbolColor(symName);
    this.scheduleSymbolMotionSync();
  }

  scheduleSymbolMotionSync() {
    if (this.disposed || this.visualEffectRuntimeStatus !== 'ready') return;
    if (this.spinning && this.landedReels.size === 0) return;
    if (this.symbolMotionSyncFrame) cancelAnimationFrame(this.symbolMotionSyncFrame);
    this.symbolMotionSyncFrame = requestAnimationFrame(() => {
      this.symbolMotionSyncFrame = null;
      this.syncSymbolMotionFlipbooks();
    });
  }

  syncSymbolMotionFlipbooks({ authoritativeLanded = false } = {}) {
    const runtime = this.visualEffectRuntime;
    const stage = this.container.querySelector('#previewStage');
    if (!runtime || this.visualEffectRuntimeStatus !== 'ready' || !stage) {
      runtime?.clearSymbolFlipbooks?.();
      return 0;
    }
    const stageRect = stage.getBoundingClientRect();
    const stageWidth = Number.parseFloat(stage.style.width) || stageRect.width;
    const stageHeight = Number.parseFloat(stage.style.height) || stageRect.height;
    const scaleX = stageRect.width ? stageWidth / stageRect.width : 1;
    const scaleY = stageRect.height ? stageHeight / stageRect.height : 1;
    const { rows } = this.project.math.grid;
    const { buffer } = this.reelGeometry;
    const instances = [];
    for (const cell of this.container.querySelectorAll('.reel-sym')) {
      const reel = Number(cell.dataset.reel);
      const row = Number(cell.dataset.pos) - buffer;
      const activeRows = resolveMorpheusMotionRowCount({
        worldActive: this.isMorpheusDreamfallWorldActive(),
        featureRows: this.featureReelRows.get(reel),
        boardRows: this.board?.[reel]?.length,
        baseRows: rows[reel] || rows[0],
      });
      if (row < 0 || row >= activeRows) continue;
      if (this.isMorpheusDreamfallWorldActive() && cell.dataset.visible !== 'true') continue;
      if (this.spinning && !authoritativeLanded && !this.landedReels.has(reel)) continue;
      const symbolName = cell.dataset.symbolName;
      const symbol = this.project.theme.symbols?.find(item => item.name === symbolName || item.id === symbolName);
      if (!symbol?.motionAssetId) continue;
      const motionAsset = this.project.animation?.visualEffects?.motionAssets?.find(asset => asset.id === symbol.motionAssetId);
      if (!motionAsset?.src) continue;
      const cellRect = cell.getBoundingClientRect();
      const cellStage = {
        x: (cellRect.left - stageRect.left) * scaleX,
        y: (cellRect.top - stageRect.top) * scaleY,
        width: cellRect.width * scaleX,
        height: cellRect.height * scaleY,
      };
      const overlay = symbol.motionOverlay || {};
      const loadedMotion = runtime.motionTextures?.get(symbol.motionAssetId);
      const motionSourceAspectRatio = Number(loadedMotion?.frameWidth) > 0 && Number(loadedMotion?.frameHeight) > 0
        ? loadedMotion.frameWidth / loadedMotion.frameHeight : 1;
      const overlayBounds = {
        x: cellStage.x + cellStage.width * (Number(overlay.left) || 0) / 100,
        y: cellStage.y + cellStage.height * (Number(overlay.top) || 0) / 100,
        width: cellStage.width * Math.max(1, Number(overlay.width) || 100) / 100,
        height: cellStage.height * Math.max(1, Number(overlay.height) || 100) / 100,
      };
      const overlayStage = this.isMorpheusDreamfallWorldActive()
        ? createMorpheusMotionSafeRect({ cellRect: cellStage, overlay, sourceAspectRatio: motionSourceAspectRatio }).safe
        : overlayBounds;
      const design = runtime.stageRectToDesign({
        x: overlayStage.x + overlayStage.width / 2,
        y: overlayStage.y + overlayStage.height / 2,
        width: overlayStage.width,
        height: overlayStage.height,
      });
      if (!design) continue;
      instances.push({
        assetId: symbol.motionAssetId,
        x: design.x,
        y: design.y,
        width: design.width,
        height: design.height,
        fps: Number(overlay.fps || motionAsset.fps) || 8,
        alpha: Math.max(0, Math.min(1, Number(overlay.alpha) || 1)),
        blendMode: overlay.blendMode || motionAsset.blendMode || 'screen',
        interpolate: overlay.interpolate !== false,
        phase: ((reel * 5 + row * 3) % 16) / Math.max(1, Number(overlay.fps || motionAsset.fps) || 8),
        meta: {
          symbol: symbol.name,
          reel,
          row,
          renderer: 'pixi-webgl-frame-atlas',
          cellAspectRatio: cellStage.width / cellStage.height,
          motionAspectRatio: overlayStage.width / overlayStage.height,
          motionSourceAspectRatio,
          aspectPreserved: Math.abs(overlayStage.width / overlayStage.height / motionSourceAspectRatio - 1) <= 0.015,
        },
      });
    }
    return runtime.enableSymbolFlipbooks(instances, {
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    });
  }

  populateInitialBoard() {
    const mode = this.mathEngine.getBetMode(this.selectedMode);
    this.board = this.mathEngine.generateBoard(Math.random, mode.profile?.reelSet || 'BR');
    const { rows } = this.project.math.grid;
    const buffer = this.reelGeometry.buffer;
    const strips = this.container.querySelectorAll('.reel-strip');
    const allSymNames = this.project.theme.symbols
      .filter(s => !s.special?.length)
      .map(s => s.name);

    strips.forEach(strip => {
      const r = parseInt(strip.dataset.reel);
      const rRows = rows[r] || rows[0];
      const cells = strip.querySelectorAll('.reel-sym');

      cells.forEach((cell, i) => {
        const boardRow = i - buffer;
        if (boardRow >= 0 && boardRow < rRows && this.board[r]) {
          this.setSymbolCell(cell, this.board[r][boardRow]);
        } else {
          const rnd = allSymNames[Math.floor(Math.random() * allSymNames.length)];
          this.setSymbolCell(cell, rnd);
        }
      });
    });
  }

  /**
   * Fit the fixed-size stage into whatever space the viewport has. Observed
   * rather than computed once: immediately after innerHTML the viewport can
   * still measure 0x0, which would otherwise bake in scale(0) and leave the
   * cabinet invisible. The observer also handles window resizes.
   */
  scaleStage() {
    const viewport = document.getElementById('previewViewport');
    const stage = document.getElementById('previewStage');
    if (!viewport || !stage) return;

    const apply = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      if (!vw || !vh) return;   // not laid out yet — the observer will fire again
      const sw = parseInt(stage.style.width);
      const sh = parseInt(stage.style.height);
      if (!sw || !sh) return;
      const scale = Math.min(vw / sw, vh / sh, 1);
      stage.style.transform = `scale(${scale})`;
      // CSS transforms do not change layout dimensions. Compensating margins
      // make the flex viewport reserve the scaled footprint instead of the
      // original 1280px stage, preventing mobile/mini previews from clipping
      // the right edge while keeping the cabinet visually centered.
      const horizontalCompensation = (sw * scale - sw) / 2;
      const verticalCompensation = (sh * scale - sh) / 2;
      stage.style.marginLeft = `${horizontalCompensation}px`;
      stage.style.marginRight = `${horizontalCompensation}px`;
      stage.style.marginTop = `${verticalCompensation}px`;
      stage.style.marginBottom = `${verticalCompensation}px`;
    };

    apply();
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(apply);
    this.resizeObserver.observe(viewport);
  }

  bindEvents() {
    this.container.querySelectorAll('[data-vp]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.viewport = btn.dataset.vp;
        this.render();
      });
    });

    this.container.querySelector('#previewMode')?.addEventListener('change', (event) => {
      this.selectPlayerMode(event.target.value);
    });

    document.getElementById('previewSpin')?.addEventListener('click', () => {
      if (this.autoSpinsRemaining > 0) this.stopAutoSpins();
      else this.spin();
    });

    this.container.querySelector('#previewPlayerMenu')?.addEventListener('click', () => {
      if (this.spinning) return;
      this.showPlayerMenu = true;
      this.render();
    });
    const openModes = () => {
      if (this.spinning) return;
      this.showModeMenu = true;
      this.render();
    };
    this.container.querySelector('#previewBonusMenu')?.addEventListener('click', openModes);
    this.container.querySelector('#previewModeChip')?.addEventListener('click', openModes);
    this.container.querySelector('#previewBetDown')?.addEventListener('click', () => this.stepBaseBet(-1));
    this.container.querySelector('#previewBetUp')?.addEventListener('click', () => this.stepBaseBet(1));
    this.container.querySelector('#previewTurbo')?.addEventListener('click', () => this.toggleTurboMode());
    this.container.querySelector('#previewAutoMenu')?.addEventListener('click', () => {
      if (this.spinning) return;
      if (this.autoSpinsRemaining > 0) this.stopAutoSpins();
      else {
        this.showAutoMenu = true;
        this.render();
      }
    });
    this.container.querySelectorAll('[data-player-overlay-close]').forEach(button => button.addEventListener('click', () => {
      this.showPlayerMenu = false;
      this.showModeMenu = false;
      this.showAutoMenu = false;
      this.render();
    }));
    this.container.querySelectorAll('.preview-player-overlay').forEach(overlay => overlay.addEventListener('click', event => {
      if (event.target !== event.currentTarget) return;
      this.showPlayerMenu = false;
      this.showModeMenu = false;
      this.showAutoMenu = false;
      this.render();
    }));
    this.container.querySelectorAll('[data-player-mode]').forEach(button => button.addEventListener('click', () => {
      this.selectPlayerMode(button.dataset.playerMode);
    }));
    this.container.querySelector('#previewPlayerInfo')?.addEventListener('click', () => {
      this.showPlayerMenu = false;
      this.showRules = true;
      this.render();
    });
    this.container.querySelector('#previewPlayerSound')?.addEventListener('click', () => {
      this.toggleSound();
      this.showPlayerMenu = false;
      this.render();
    });
    this.container.querySelector('#previewPlayerTurbo')?.addEventListener('click', () => {
      this.toggleTurboMode();
      this.showPlayerMenu = false;
      this.render();
    });
    this.container.querySelectorAll('[data-auto-count]').forEach(button => button.addEventListener('click', () => {
      this.pendingAutoSpins = Number(button.dataset.autoCount) || 25;
      this.render();
    }));
    this.container.querySelector('#previewAutoConfirm')?.addEventListener('click', () => {
      if (this.spinning) return;
      this.autoSpinsRemaining = this.pendingAutoSpins;
      this.showAutoMenu = false;
      this.render();
      this.queueAutoSpin(120);
    });

    this.container.querySelector('#previewRules')?.addEventListener('click', () => {
      this.showRules = true;
      this.render();
    });

    this.container.querySelector('#previewRulesClose')?.addEventListener('click', () => {
      this.showRules = false;
      this.render();
    });

    this.container.querySelector('#previewRulesAudit')?.addEventListener('click', () => {
      recordPlayerInformationQA(this.project);
      this.onChange?.();
      this.render();
    });

    this.container.querySelector('.preview-rules-overlay')?.addEventListener('click', event => {
      if (event.target === event.currentTarget) {
        this.showRules = false;
        this.render();
      }
    });

    this.container.querySelector('#previewAnimationTrigger')?.addEventListener('click', () => {
      const state = this.container.querySelector('#previewAnimationState')?.value || 'idle';
      this.setAnimationState(state);
    });
    this.container.querySelector('#previewDirector')?.addEventListener('click', () => {
      this.showDirector = !this.showDirector;
      this.render();
    });
    this.container.querySelector('#previewReplayMatrix')?.addEventListener('click', () => this.runReplayMatrix());
    this.container.querySelector('#previewLayoutAudit')?.addEventListener('click', () => this.runViewportLayoutAudit());
    this.container.querySelector('#previewPerformanceProfile')?.addEventListener('click', () => this.runPerformanceProfile());
    this.container.querySelector('#previewMorpheusDreamfall')?.addEventListener('click', () => {
      if (this.morpheusDreamfallState?.status === 'playing') void this.finishMorpheusDreamfallImmediately();
      else void this.playMorpheusDreamfallSignature();
    });
    this.container.querySelector('#directorEventSelect')?.addEventListener('change', event => {
      this.selectedDirectorEvent = event.target.value;
      this.render();
    });
    this.container.querySelector('#directorApplyDefaults')?.addEventListener('click', () => {
      this.project.presentationDirector = createProfessionalPresentationDirector();
      this.selectedDirectorEvent = this.project.presentationDirector.recipes[0].event;
      this.directorRuntime.project = this.project;
      this.onChange?.();
      this.render();
    });
    this.container.querySelector('#directorAudition')?.addEventListener('click', () => this.auditionDirectorRecipe());
    this.container.querySelector('#directorRunTorture')?.addEventListener('click', () => this.runDirectorTortureTest());
    this.container.querySelectorAll('[data-director-reel]').forEach(input => input.addEventListener('change', event => {
      this.project.presentationDirector.reelChoreography[event.currentTarget.dataset.directorReel] = Number(event.currentTarget.value);
      this.project.presentationDirector.reelChoreography = normalizeReelChoreography(this.project.presentationDirector.reelChoreography);
      this.onChange?.();
      this.render();
    }));
    this.container.querySelectorAll('[data-director-threshold]').forEach(input => input.addEventListener('change', event => {
      this.project.presentationDirector.winEscalation.thresholds[event.currentTarget.dataset.directorThreshold] = Math.max(0, Number(event.currentTarget.value) || 0);
      this.project.presentationDirector.winEscalation = normalizeWinEscalation(this.project.presentationDirector.winEscalation);
      this.onChange?.();
      this.render();
    }));
    this.container.querySelectorAll('[data-director-tier-duration]').forEach(input => input.addEventListener('change', event => {
      this.project.presentationDirector.winEscalation.tierDurations[event.currentTarget.dataset.directorTierDuration] = Math.max(200, Number(event.currentTarget.value) || 200);
      this.project.presentationDirector.winEscalation = normalizeWinEscalation(this.project.presentationDirector.winEscalation);
      this.onChange?.();
      this.render();
    }));
    this.container.querySelector('#directorCueChannel')?.addEventListener('change', event => {
      const actions = PRESENTATION_CHANNELS[event.target.value] || [];
      const select = this.container.querySelector('#directorCueAction');
      if (select) select.innerHTML = actions.map(action => `<option value="${action}">${action}</option>`).join('');
    });
    this.container.querySelector('#directorAddCue')?.addEventListener('click', () => this.addDirectorCue());
    for (const [selector, key, transform] of [
      ['#directorRecipeName', 'name', value => value.trim() || 'Untitled recipe'],
      ['#directorInterrupt', 'interrupt', value => value],
      ['#directorDuration', 'duration', value => Math.max(0, Number(value) || 0)],
      ['#directorSettle', 'settleState', value => value || null],
    ]) {
      this.container.querySelector(selector)?.addEventListener('change', event => {
        const recipe = this.selectedDirectorRecipe();
        if (!recipe) return;
        recipe[key] = transform(event.target.value);
        this.onChange?.();
        this.render();
      });
    }
    this.container.querySelectorAll('[data-director-cue-enable]').forEach(input => {
      input.addEventListener('change', event => {
        const cue = this.selectedDirectorRecipe()?.cues.find(item => item.id === event.currentTarget.dataset.directorCueEnable);
        if (!cue) return;
        cue.enabled = event.currentTarget.checked;
        this.onChange?.();
        this.render();
      });
    });
    this.container.querySelectorAll('[data-director-cue-delete]').forEach(button => {
      button.addEventListener('click', event => {
        const recipe = this.selectedDirectorRecipe();
        if (!recipe) return;
        recipe.cues = recipe.cues.filter(item => item.id !== event.currentTarget.dataset.directorCueDelete);
        this.onChange?.();
        this.render();
      });
    });
  }

  addDirectorCue() {
    const recipe = this.selectedDirectorRecipe();
    if (!recipe) return;
    const channel = this.container.querySelector('#directorCueChannel')?.value || 'animation';
    const action = this.container.querySelector('#directorCueAction')?.value || PRESENTATION_CHANNELS[channel]?.[0];
    const target = this.container.querySelector('#directorCueTarget')?.value?.trim();
    if (!target) return;
    recipe.cues.push({
      id: crypto.randomUUID(), at: Math.max(0, Number(this.container.querySelector('#directorCueAt')?.value) || 0),
      channel, action, target, enabled: true,
    });
    recipe.cues.sort((a, b) => a.at - b.at);
    recipe.duration = Math.max(recipe.duration, ...recipe.cues.map(item => item.at));
    this.onChange?.();
    this.render();
  }

  resolveDirectorTarget(target, payload = {}) {
    if (target === '$winTier') return this.performanceStateForWin(Number(payload.amount) || 1);
    if (target === '$amount') return Number(payload.amount) || 0;
    if (target === '$runningAmount') return Number(payload.runningAmount ?? payload.amount) || 0;
    if (target === '$wins') return payload.wins || [];
    if (target === '$mode') return payload.mode || this.selectedMode;
    return target;
  }

  setDirectorStatus(value) {
    const status = this.container.querySelector('#directorAuditionStatus');
    if (status) status.textContent = value;
  }

  async executeDirectorCue(cue, payload, recipe) {
    if (this.disposed) return;
    const target = this.resolveDirectorTarget(cue.target, payload);
    this.setDirectorStatus(`${recipe.event} · ${cue.at}ms · ${cue.channel}/${cue.action} → ${Array.isArray(target) ? `${target.length} wins` : target}`);
    const stage = this.container.querySelector('#previewStage');
    if (cue.channel === 'animation' && cue.action === 'state') {
      // Tiny wins retain their sound, tile glow and moon messenger without
      // spending Morpheus's full hand performance on a sub-1x result.
      const microWin = cue.target === '$winTier' && Number(payload.amount) > 0 && Number(payload.amount) < 1;
      this.setAnimationState(microWin ? 'idle' : String(target));
    }
    if (cue.channel === 'audio' && cue.action === 'stinger') this.audioEngine.playStinger(String(target));
    if (cue.channel === 'audio' && cue.action === 'music') this.audioEngine.playMusic(String(target));
    if (cue.channel === 'reels' && cue.action === 'highlight' && !payload.winsAlreadyHighlighted) {
      this.highlightWins(Array.isArray(target) ? target : payload.wins || []);
    }
    if (cue.channel === 'reels' && cue.action === 'impact') this.pulseReelImpact(Number(target) || 0);
    if (cue.channel === 'world' && cue.action === 'state' && stage) stage.dataset.worldState = String(target);
    if (cue.channel === 'world' && cue.action === 'pulse' && stage) this.pulseDirectorClass(stage, `director-world-${String(target)}`, 620);
    if (cue.channel === 'camera' && stage) this.pulseDirectorClass(stage, cue.action === 'shake' ? 'director-camera-shake' : 'director-camera-pulse', cue.action === 'shake' ? 760 : 420);
    if (cue.channel === 'ui' && cue.action === 'modePortal' && !payload.suppressModePortal) this.showModePortal(String(target));
    if (cue.channel === 'ui' && cue.action === 'winDisplay') {
      this.lastWin = Number(target) || this.lastWin;
      this.updateHUD();
      this.animateWinDisplay(Number(target) || 0);
    }
    if (cue.channel === 'ui' && cue.action === 'featureResult') {
      await this.playFeatureFinale({ mode: payload.mode || this.selectedMode, totalWin: Number(target) || 0 }, payload.spins || 10);
    }
    if (cue.channel === 'ui' && cue.action === 'wincap') await this.playWincapCelebration();
  }

  pulseDirectorClass(element, className, duration) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), duration);
  }

  dispatchPresentation(event, payload = {}) {
    const stage = this.container.querySelector('#previewStage');
    const heavyPresentation = event === 'wincap';
    const loadToken = heavyPresentation ? (this.presentationLoadToken = (this.presentationLoadToken || 0) + 1) : 0;
    if (heavyPresentation && stage) stage.dataset.presentationLoad = 'heavy';
    this.triggerVisualEffect(event, payload);
    const result = this.directorRuntime.dispatch(event, payload);
    if (!heavyPresentation) return result;
    return Promise.resolve(result).finally(() => {
      if (loadToken === this.presentationLoadToken && stage) delete stage.dataset.presentationLoad;
    });
  }

  async auditionDirectorRecipe() {
    const recipe = this.selectedDirectorRecipe();
    if (!recipe) return;
    this.clearWinHighlights();
    const sampleWin = { positions: [[0, 1], [1, 1], [2, 1]], symbol: 'H1', win: 25 };
    const result = await this.dispatchPresentation(recipe.event, {
      amount: recipe.event === 'wincap' ? this.project.math.wincap : 25,
      wins: [sampleWin], mode: this.selectedMode, spins: 10,
    });
    this.setDirectorStatus(`${recipe.event} ${result.status} · ${result.cues.length} cues executed`);
  }

  async runDirectorTortureTest() {
    const button = this.container.querySelector('#directorRunTorture');
    if (button) {
      button.disabled = true;
      button.textContent = 'Testing transitions…';
    }
    this.setDirectorStatus('Running solo, cancellation, replacement, queue and ignore policy cases…');
    const report = await runPresentationInterruptionQA(this.project);
    const polish = recordPresentationPolishQA(this.project);
    this.onChange?.();
    this.setDirectorStatus(report.passed && polish.complete
      ? `${report.passedCases}/${report.total} transition cases plus reel and win polish passed.`
      : `${report.passedCases}/${report.total} transition cases · ${polish.issues.length} polish issue(s).`);
    this.render();
  }

  async runReplayMatrix() {
    const button = this.container.querySelector('#previewReplayMatrix');
    if (button?.disabled) return;
    if (button) {
      button.disabled = true;
      button.textContent = 'Rehearsing…';
    }
    try {
      await runReplayMatrixQA(this.project);
      this.onChange?.();
      this.render();
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = error.message || 'Rehearsal failed';
      }
    }
  }

  relativeRect(element, parentRect) {
    if (!element) return { x: 0, y: 0, width: 0, height: 0 };
    const rect = element.getBoundingClientRect();
    return { x: rect.left - parentRect.left, y: rect.top - parentRect.top, width: rect.width, height: rect.height };
  }

  rectanglesOverlap(left, right) {
    return Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1
      && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1;
  }

  waitForRenderFrames(count = 2, timeoutMs = 300) {
    return new Promise(resolve => {
      let frames = 0;
      let complete = false;
      const finish = rendered => {
        if (complete) return;
        complete = true;
        window.clearTimeout(watchdog);
        resolve(rendered);
      };
      const sample = () => {
        frames += 1;
        if (frames >= count) finish(true);
        else requestAnimationFrame(sample);
      };
      const watchdog = window.setTimeout(() => finish(false), timeoutMs);
      requestAnimationFrame(sample);
    });
  }

  async prepareMorpheusSignatureRenderEvidence(reelRows, timeoutMs = 4000) {
    if (!this.isMorpheusDreamfallWorldActive()) {
      throw new Error('Morpheus signature render evidence requires the active Dreamfall world.');
    }
    const expectedCells = [...reelRows].reduce((total, rows) => total + Number(rows || 0), 0);
    const deadline = Date.now() + timeoutMs;
    let diagnostics = null;
    while (Date.now() < deadline) {
      if (this.board) this.paintBoard(this.board);
      await this.waitForRenderFrames(2);
      this.syncSymbolMotionFlipbooks({ authoritativeLanded: true });
      await this.waitForRenderFrames(2);
      const visibleCells = [...this.container.querySelectorAll('.reel-sym[data-visible="true"]')];
      const images = visibleCells.map(cell => cell.querySelector('img')).filter(Boolean);
      const decodedImages = images.filter(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
      const motionCount = this.visualEffectRuntime?.symbolFlipbooks?.length || 0;
      diagnostics = {
        expectedCells,
        visibleCells: visibleCells.length,
        images: images.length,
        decodedImages: decodedImages.length,
        motionCount,
        runtimeStatus: this.visualEffectRuntimeStatus,
      };
      if (visibleCells.length === expectedCells && decodedImages.length === expectedCells
        && motionCount === expectedCells && this.visualEffectRuntimeStatus === 'ready') return diagnostics;
      await this.wait(25);
    }
    throw new Error(`Morpheus signature visual evidence did not become measurable: ${JSON.stringify(diagnostics)}`);
  }

  async prepareRenderedCellRecognitionEvidence(reelRows, timeoutMs = 4000) {
    const expectedCells = [...reelRows].reduce((total, rows) => total + Number(rows || 0), 0);
    const deadline = Date.now() + timeoutMs;
    let diagnostics = null;
    while (Date.now() < deadline) {
      // Repaint only the renderer-owned board. The recognition gate must never
      // manufacture the authoritative expected board it is about to inspect.
      if (this.board) this.paintBoard(this.board);
      await this.waitForRenderFrames(2);
      const visibleCells = [...this.container.querySelectorAll('.reel-sym[data-visible="true"]')];
      const images = visibleCells.map(cell => cell.querySelector('img')).filter(Boolean);
      const decodedImages = images.filter(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
      diagnostics = { expectedCells, visibleCells: visibleCells.length, images: images.length, decodedImages: decodedImages.length };
      if (visibleCells.length === expectedCells && decodedImages.length === expectedCells) return diagnostics;
      await this.wait(25);
    }
    throw new Error(`Rendered-cell recognition evidence did not become measurable: ${JSON.stringify(diagnostics)}`);
  }

  async collectViewportLayout(viewportName) {
    const viewport = this.container.querySelector('#previewViewport');
    const stage = this.container.querySelector('#previewStage');
    if (!viewport || !stage) throw new Error('Preview stage is unavailable.');
    viewport.classList.remove(...LAYOUT_VIEWPORTS);
    viewport.classList.add(viewportName);
    await this.waitForRenderFrames(3);
    const viewportRect = viewport.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const spin = stage.querySelector('#previewSpin');
    const symbols = [...stage.querySelectorAll('.reel-sym[data-visible="true"]')].map(element => element.getBoundingClientRect());
    const controls = [...stage.querySelectorAll('.preview-hud > .hud-group, .preview-hud > .spin-btn, .preview-hud > .hud-art-button')]
      .filter(element => getComputedStyle(element).display !== 'none')
      .map(element => element.getBoundingClientRect());
    const stageScale = stage.offsetWidth ? stageRect.width / stage.offsetWidth : 0;
    const viewportStyle = getComputedStyle(viewport);
    const scrollableX = ['auto', 'scroll'].includes(viewportStyle.overflowX);
    const scrollableY = ['auto', 'scroll'].includes(viewportStyle.overflowY);
    const label = stage.querySelector('.hud-label');
    const value = stage.querySelector('.hud-value');
    return {
      viewport: viewportName,
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
      overflowX: scrollableX ? Math.max(0, viewport.scrollWidth - viewport.clientWidth) : 0,
      overflowY: scrollableY ? Math.max(0, viewport.scrollHeight - viewport.clientHeight) : 0,
      stageScale,
      stage: this.relativeRect(stage, viewportRect),
      reels: this.relativeRect(stage.querySelector('.reel-frame'), viewportRect),
      hud: this.relativeRect(stage.querySelector('.preview-hud'), viewportRect),
      spin: this.relativeRect(spin, viewportRect),
      minimumSymbolWidth: symbols.length ? Math.min(...symbols.map(rect => rect.width)) : 0,
      minimumSymbolHeight: symbols.length ? Math.min(...symbols.map(rect => rect.height)) : 0,
      hudLabelFontPx: label ? parseFloat(getComputedStyle(label).fontSize) * stageScale : 0,
      hudValueFontPx: value ? parseFloat(getComputedStyle(value).fontSize) * stageScale : 0,
      controlsOverlap: controls.some((left, index) => controls.slice(index + 1).some(right => this.rectanglesOverlap(left, right))),
    };
  }

  intersectionArea(left, right) {
    const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
    const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    return width * height;
  }

  async collectMorpheusSignatureLayout(viewportName = this.viewport) {
    const layout = await this.collectViewportLayout(viewportName);
    const viewport = this.container.querySelector('#previewViewport');
    const stage = this.container.querySelector('#previewStage');
    const reels = stage?.querySelector('.reel-frame');
    const hud = stage?.querySelector('.preview-hud');
    const dreamfallHud = stage?.querySelector('#previewDreamfallHud');
    if (!viewport || !stage || !reels || !hud) return layout;
    const viewportRect = viewport.getBoundingClientRect();
    const relative = element => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left - viewportRect.left,
        top: value.top - viewportRect.top,
        right: value.right - viewportRect.left,
        bottom: value.bottom - viewportRect.top,
      };
    };
    const reelRect = relative(reels);
    const primaryHudRect = relative(hud);
    const persistentHudRect = dreamfallHud ? relative(dreamfallHud) : null;
    const dreamfallPersistentHudVisible = Boolean(dreamfallHud)
      && getComputedStyle(dreamfallHud).display !== 'none'
      && getComputedStyle(dreamfallHud).visibility !== 'hidden';
    const modeChip = stage.querySelector('#previewModeChip');
    const modeChipRect = modeChip ? relative(modeChip) : null;
    const controls = [...hud.querySelectorAll('.hud-group, .spin-btn, .hud-art-button')]
      .filter(element => getComputedStyle(element).display !== 'none')
      .map(relative);
    const visibleCells = [...stage.querySelectorAll('.reel-sym[data-visible="true"]')];
    const contentRects = visibleCells.map(cell => cell.querySelector('img')?.getBoundingClientRect()).filter(Boolean);
    const cellRects = visibleCells.map(cell => cell.getBoundingClientRect());
    const motionSamples = this.visualEffectRuntime?.symbolFlipbooks?.map(book => book.meta).filter(Boolean) || [];
    const maskBottoms = [...stage.querySelectorAll('.reel-mask')].map(mask => {
      const top = parseFloat(mask.style.top) || 0;
      return top + (parseFloat(mask.style.height) || 0);
    });
    return {
      ...layout,
      renderProfile: this.reelGeometry?.profile?.format || 'ordinary-reel-world',
      dreamfallWorldActive: this.isMorpheusDreamfallWorldActive(),
      dreamfallPersistentHudVisible,
      coordinateCells: 6 * MORPHEUS_RESERVED_WORLD_ROWS,
      fixedWorldBottomAligned: maskBottoms.length === 6
        && maskBottoms.every(bottom => Math.abs(bottom - this.reelGeometry.h) < 0.01),
      renderAspectRatios: {
        cells: cellRects.map(value => value.width / value.height),
        content: contentRects.map(value => value.width / value.height),
        motion: motionSamples.map(value => Number(value.motionAspectRatio)),
      },
      squareSafeCells: cellRects.length > 0
        && cellRects.every(value => Math.abs(value.width / value.height - 1) <= 0.015),
      motionAspectPreserved: motionSamples.length > 0
        && motionSamples.every(value => value.aspectPreserved === true),
      visibleHudFields: ['chainHit', 'freeSpinsRemaining', 'awardedFreeSpins', 'runningWin', 'reelRows']
        .filter(field => ({
          chainHit: '#dreamfallHudChain',
          freeSpinsRemaining: '#dreamfallHudRemaining',
          awardedFreeSpins: '#dreamfallHudSpins',
          runningWin: '#dreamfallHudWin',
          reelRows: '#dreamfallHudRows',
        })[field] && stage.querySelector(({
          chainHit: '#dreamfallHudChain',
          freeSpinsRemaining: '#dreamfallHudRemaining',
          awardedFreeSpins: '#dreamfallHudSpins',
          runningWin: '#dreamfallHudWin',
          reelRows: '#dreamfallHudRows',
        })[field])),
      collisionAreas: {
        hudReels: this.intersectionArea(primaryHudRect, reelRect),
        dreamfallHudReels: persistentHudRect ? this.intersectionArea(persistentHudRect, reelRect) : 0,
        modeChipReels: modeChipRect ? this.intersectionArea(modeChipRect, reelRect) : 0,
        hudPrimaryControls: persistentHudRect ? this.intersectionArea(persistentHudRect, primaryHudRect) : 0,
        controlPairs: controls.reduce((area, left, index) => area
          + controls.slice(index + 1).reduce((sum, right) => sum + this.intersectionArea(left, right), 0), 0),
      },
    };
  }

  collectMorpheusPreRevealPresentation(eventType) {
    const instrument = this.container.querySelector('#previewFeatureMechanic');
    const mechanicText = String(instrument?.textContent || '').trim();
    const style = instrument ? getComputedStyle(instrument) : null;
    return {
      format: 'morpheus-pre-reveal-presentation-v1',
      boardAuthority: 'uncommitted',
      eventType: String(eventType || ''),
      mechanicText,
      visiblyDeclared: Boolean(instrument && mechanicText && style?.display !== 'none' && style?.visibility !== 'hidden'),
    };
  }

  collectRenderedCellRecognitionRequest(expectedBoard, reelRows = expectedBoard?.map(reel => reel?.length || 0)) {
    const viewport = this.container.querySelector('#previewViewport');
    if (!viewport) throw new Error('Preview viewport is unavailable for rendered-cell recognition.');
    const viewportRect = viewport.getBoundingClientRect();
    const rows = Array.from({ length: 6 }, (_, reel) => Number(reelRows?.[reel] || expectedBoard?.[reel]?.length || 0));
    const cells = [];
    for (let reel = 0; reel < rows.length; reel++) for (let row = 0; row < rows[reel]; row++) {
      const cell = this.cellAt(reel, row);
      const image = cell?.querySelector('img');
      const expectedSymbol = String(expectedBoard?.[reel]?.[row]?.name || expectedBoard?.[reel]?.[row] || '');
      if (!cell || !image || !expectedSymbol) {
        throw new Error(`Rendered-cell recognition cannot resolve reel ${reel}, row ${row}.`);
      }
      const cellRect = cell.getBoundingClientRect();
      const cellLocalWidth = cell.offsetWidth;
      const cellLocalHeight = cell.offsetHeight;
      const scaleX = cellLocalWidth > 0 ? cellRect.width / cellLocalWidth : 1;
      const scaleY = cellLocalHeight > 0 ? cellRect.height / cellLocalHeight : 1;
      const rect = {
        left: cellRect.left + image.offsetLeft * scaleX,
        top: cellRect.top + image.offsetTop * scaleY,
        width: image.offsetWidth * scaleX,
        height: image.offsetHeight * scaleY,
      };
      const sourceAspect = Number(image.dataset.sourceAspectRatio)
        || (image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 0);
      const objectFit = getComputedStyle(image).objectFit || 'contain';
      let paintedRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      const localBoxWidth = image.offsetWidth;
      const localBoxHeight = image.offsetHeight;
      let paintedLayoutWidth = localBoxWidth;
      let paintedLayoutHeight = localBoxHeight;
      if (objectFit === 'contain' && sourceAspect > 0 && localBoxWidth > 0 && localBoxHeight > 0) {
        const boxAspect = localBoxWidth / localBoxHeight;
        if (boxAspect > sourceAspect) {
          paintedLayoutWidth = localBoxHeight * sourceAspect;
          paintedRect.width = rect.width * (paintedLayoutWidth / localBoxWidth);
          paintedRect.left += (rect.width - paintedRect.width) / 2;
        } else {
          paintedLayoutHeight = localBoxWidth / sourceAspect;
          paintedRect.height = rect.height * (paintedLayoutHeight / localBoxHeight);
          paintedRect.top += (rect.height - paintedRect.height) / 2;
        }
      }
      cells.push({
        reel,
        row,
        expectedSymbol,
        renderedSymbol: cell.dataset.symbolName || '',
        sourceAspect,
        layoutWidth: paintedLayoutWidth,
        layoutHeight: paintedLayoutHeight,
        objectFit,
        rect: {
          left: paintedRect.left - viewportRect.left,
          top: paintedRect.top - viewportRect.top,
          width: paintedRect.width,
          height: paintedRect.height,
        },
      });
    }
    return {
      format: 'stake-studio-rendered-cell-recognition-request-v1',
      minimumScore: 0.52,
      minimumMargin: 0.012,
      cells,
    };
  }

  collectMorpheusSignatureObservation(reelRows = this.project.math.grid.rows) {
    const rows = [...reelRows].map(Number);
    const board = rows.map((count, reel) => Array.from({ length: count }, (_, row) => (
      this.cellAt(reel, row)?.dataset.symbolName || ''
    )));
    const numberFrom = selector => Number.parseFloat(this.container.querySelector(selector)?.textContent || '0') || 0;
    const renderedRows = String(this.container.querySelector('#dreamfallHudRows')?.textContent || '')
      .split('·').map(Number).filter(Number.isFinite);
    const dreamfallWorld = this.isMorpheusDreamfallWorldActive();
    const runningWinSelector = dreamfallWorld ? '#dreamfallHudWin' : '#hudWin';
    const featureSpinMatch = String(this.container.querySelector('#previewFeatureCount')?.textContent || '')
      .match(/FREE SPIN\s+(\d+)\s*\//i);
    return {
      board,
      reelRows: renderedRows.length === 6 ? renderedRows : rows.map((_, reel) => {
        const mask = this.container.querySelector(`.reel-mask[data-reel="${reel}"]`);
        return Math.round((parseFloat(mask?.style.height) || 0) / this.reelGeometry.cellH);
      }),
      hud: {
        chainHit: numberFrom('#dreamfallHudChain'),
        freeSpinsRemaining: dreamfallWorld
          ? numberFrom('#dreamfallHudRemaining')
          : Number(featureSpinMatch?.[1] || 0),
        awardedFreeSpins: numberFrom('#dreamfallHudSpins'),
        runningWin: Math.round(numberFrom(runningWinSelector) / Math.max(this.baseBet, 0.000001) * BOOK_AMOUNT_MULTIPLIER),
        reelRows: renderedRows.length === 6 ? renderedRows : rows,
      },
    };
  }

  collectMorpheusMaxGrowthVisibilityProof(requiredCount = 48) {
    const viewport = this.container.querySelector('#previewViewport');
    const stage = this.container.querySelector('#previewStage');
    if (!viewport || !stage) {
      return {
        format: 'morpheus-max-growth-visibility-proof-v1',
        requiredCount,
        cellCount: 0,
        visiblyUnoccludedCellCount: 0,
        passed: false,
        cells: [],
      };
    }
    const viewportRect = viewport.getBoundingClientRect();
    const blockingSelectors = [
      '.wincap-celebration',
      '.feature-result-celebration',
      '.preview-rules-overlay',
      '#previewModePortal.is-visible',
      '#previewModeChip',
      '.preview-visual-effect-layer.is-presentation-active',
    ];
    const blockers = [...stage.querySelectorAll(blockingSelectors.join(','))].filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0.01 && rect.width > 0 && rect.height > 0;
    });
    const cells = [...stage.querySelectorAll('.reel-sym[data-visible="true"]')].map(cell => {
      const image = cell.querySelector('img');
      const rect = image?.getBoundingClientRect() || cell.getBoundingClientRect();
      const style = getComputedStyle(cell);
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const hitStack = document.elementsFromPoint(center.x, center.y);
      const targetHit = hitStack.some(element => element === cell || cell.contains(element));
      const occludedBy = blockers.filter(element => {
        const overlay = element.getBoundingClientRect();
        return center.x >= overlay.left && center.x <= overlay.right
          && center.y >= overlay.top && center.y <= overlay.bottom;
      }).map(element => element.id || String(element.className || element.tagName));
      const painted = Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0
        && rect.width > 0 && rect.height > 0 && style.display !== 'none'
        && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0.01);
      const insideViewport = rect.left >= viewportRect.left - 0.5 && rect.top >= viewportRect.top - 0.5
        && rect.right <= viewportRect.right + 0.5 && rect.bottom <= viewportRect.bottom + 0.5;
      return {
        reel: Number(cell.dataset.reel),
        row: Number(cell.dataset.pos) - this.reelGeometry.buffer,
        painted,
        insideViewport,
        targetHit,
        occludedBy,
        visiblyUnoccluded: painted && insideViewport && targetHit && occludedBy.length === 0,
      };
    });
    const visiblyUnoccludedCellCount = cells.filter(cell => cell.visiblyUnoccluded).length;
    return {
      format: 'morpheus-max-growth-visibility-proof-v1',
      requiredCount,
      cellCount: cells.length,
      visiblyUnoccludedCellCount,
      blockingOverlays: blockers.map(element => element.id || String(element.className || element.tagName)),
      passed: cells.length === requiredCount && visiblyUnoccludedCellCount === requiredCount,
      cells,
    };
  }

  sourceFingerprint(value) {
    const source = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  collectMorpheusCellAspectMetrics(cell, image, definition) {
    const cellRect = cell?.getBoundingClientRect();
    const contentRect = image?.getBoundingClientRect();
    const sourceAspectRatio = Number(image?.naturalWidth) > 0 && Number(image?.naturalHeight) > 0
      ? image.naturalWidth / image.naturalHeight : 1;
    const reel = Number(cell?.dataset.reel);
    const row = Number(cell?.dataset.pos) - this.reelGeometry.buffer;
    const book = this.visualEffectRuntime?.symbolFlipbooks?.find(item => (
      item.meta?.symbol === definition?.name && item.meta?.reel === reel && item.meta?.row === row
    ));
    const motionSourceAspectRatio = Number(book?.meta?.motionSourceAspectRatio) || 1;
    const motionAspectRatio = Number(book?.meta?.motionAspectRatio) || motionSourceAspectRatio;
    const metrics = evaluateMorpheusRenderAspectMetrics({
      cellRect,
      contentRect,
      contentSourceAspectRatio: sourceAspectRatio,
      motionRect: { width: motionAspectRatio, height: 1 },
      motionSourceAspectRatio,
    });
    return {
      ...metrics,
      motionRendered: Boolean(book),
      motionReel: reel,
      motionRow: row,
    };
  }

  analyzeMorpheusSymbolImage(image) {
    if (!image?.complete || !(image.naturalWidth > 0) || !(image.naturalHeight > 0)) {
      return { decoded: false, foregroundCoverage: 0, luminanceSeparation: 0, edgeClipped: true, perceptualHash: null };
    }
    try {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const scale = Math.min((size - 4) / image.naturalWidth, (size - 4) / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      const pixels = context.getImageData(0, 0, size, size).data;
      let foreground = 0;
      let minimum = 255;
      let maximum = 0;
      let edgeClipped = false;
      for (let pixel = 0; pixel < size * size; pixel++) {
        const offset = pixel * 4;
        if (pixels[offset + 3] < 24) continue;
        foreground += 1;
        const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
        minimum = Math.min(minimum, luminance);
        maximum = Math.max(maximum, luminance);
        const x = pixel % size;
        const y = Math.floor(pixel / size);
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) edgeClipped = true;
      }
      const hashCanvas = document.createElement('canvas');
      hashCanvas.width = 9;
      hashCanvas.height = 8;
      const hashContext = hashCanvas.getContext('2d', { willReadFrequently: true });
      hashContext.drawImage(image, 0, 0, 9, 8);
      const values = hashContext.getImageData(0, 0, 9, 8).data;
      let perceptualHash = '';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const left = (y * 9 + x) * 4;
        const right = left + 4;
        const leftLuma = values[left] + values[left + 1] + values[left + 2];
        const rightLuma = values[right] + values[right + 1] + values[right + 2];
        perceptualHash += leftLuma > rightLuma ? '1' : '0';
      }
      return {
        decoded: true,
        foregroundCoverage: foreground / (size * size),
        luminanceSeparation: foreground ? (maximum - minimum) / 255 : 0,
        edgeClipped,
        perceptualHash,
      };
    } catch {
      return { decoded: false, foregroundCoverage: 0, luminanceSeparation: 0, edgeClipped: true, perceptualHash: null };
    }
  }

  async presentMorpheusMaxGrowthForAudit() {
    if (!this.isMorpheusDreamfallProject()) throw new Error('Morpheus max-growth proof requires morpheus_dreamfall.');
    const definitions = this.project.theme.symbols.filter(symbol => symbol.src).slice(0, 8);
    if (!definitions.length) throw new Error('Morpheus max-growth proof requires authored symbol images.');
    this.featureReelRows.clear();
    for (let reel = 0; reel < 6; reel++) this.featureReelRows.set(reel, MORPHEUS_RESERVED_WORLD_ROWS);
    this.board = Array.from({ length: 6 }, (_, reel) => Array.from({ length: 8 }, (_, row) => (
      definitions[(reel * 8 + row) % definitions.length].name
    )));
    this.paintBoard(this.board);
    await this.waitForRenderFrames(3);
    this.syncSymbolMotionFlipbooks();
    await this.waitForRenderFrames(2);
    const cells = [];
    const familyHashes = new Map();
    for (let reel = 0; reel < 6; reel++) for (let row = 0; row < 8; row++) {
      const expectedSymbol = this.board[reel][row];
      const definition = this.project.theme.symbols.find(symbol => symbol.name === expectedSymbol || symbol.id === expectedSymbol);
      const cell = this.cellAt(reel, row);
      const image = cell?.querySelector('img');
      const rect = image?.getBoundingClientRect();
      const analysis = this.analyzeMorpheusSymbolImage(image);
      const aspect = this.collectMorpheusCellAspectMetrics(cell, image, definition);
      if (analysis.perceptualHash && !familyHashes.has(expectedSymbol)) familyHashes.set(expectedSymbol, analysis.perceptualHash);
      cells.push({
        expectedSymbol,
        renderedSymbol: cell?.dataset.symbolName || null,
        expectedSourceFingerprint: this.sourceFingerprint(this.preloadedImages.get(definition?.src)?.src || definition?.src),
        renderedSourceFingerprint: this.sourceFingerprint(image?.src),
        decoded: analysis.decoded,
        painted: Boolean(rect?.width && rect?.height),
        paintedWidth: rect?.width || 0,
        paintedHeight: rect?.height || 0,
        foregroundCoverage: analysis.foregroundCoverage,
        luminanceSeparation: analysis.luminanceSeparation,
        edgeClipped: analysis.edgeClipped,
        cellAspectRatio: aspect.cellAspectRatio,
        contentAspectRatio: aspect.contentAspectRatio,
        contentSourceAspectRatio: aspect.contentSourceAspectRatio,
        motionAspectRatio: aspect.motionAspectRatio,
        motionSourceAspectRatio: aspect.motionSourceAspectRatio,
        renderAspectPassed: aspect.passed,
        motionRendered: aspect.motionRendered,
      });
    }
    const renderAspectIntegrityPassed = cells.every(cell => cell.renderAspectPassed === true);
    const grownRowMotionCoveragePassed = cells
      .filter((_, index) => index % MORPHEUS_RESERVED_WORLD_ROWS >= 4)
      .every(cell => cell.motionRendered === true);
    if (!renderAspectIntegrityPassed) throw new Error('Morpheus max-growth render contains distorted cell, content, or motion aspect ratios.');
    if (!grownRowMotionCoveragePassed) throw new Error('Morpheus max-growth render omitted a grown-row symbol motion flipbook.');
    return {
      renderProfileFormat: MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT,
      reelRows: [8, 8, 8, 8, 8, 8],
      cells,
      renderAspectIntegrityPassed,
      grownRowMotionCoveragePassed,
      motionFlipbookCellCount: cells.filter(cell => cell.motionRendered).length,
      pairwiseFamilyHashesDistinct: familyHashes.size === definitions.length
        && new Set(familyHashes.values()).size === familyHashes.size,
    };
  }

  async runViewportLayoutAudit() {
    const button = this.container.querySelector('#previewLayoutAudit');
    if (button?.disabled) return;
    const originalViewport = this.viewport;
    if (button) button.disabled = true;
    const samples = [];
    try {
      for (const viewport of LAYOUT_VIEWPORTS) {
        if (button) button.textContent = `Checking ${viewport}…`;
        // Render the actual viewport-specific geometry before measuring it.
        // Merely swapping the CSS class kept desktop reel dimensions in the
        // compact audit and produced a false mini-legibility failure.
        this.viewport = viewport;
        this.render();
        await this.waitForRenderFrames(3);
        samples.push(await this.collectViewportLayout(viewport));
      }
      const summary = recordViewportLayoutQA(this.project, samples);
      this.onChange?.();
      this.viewport = originalViewport;
      this.render();
      const status = this.container.querySelector('.preview-layout-strip strong');
      if (status && !summary.complete) status.title = summary.issues.join(' ');
    } catch (error) {
      this.viewport = originalViewport;
      const viewport = this.container.querySelector('#previewViewport');
      viewport?.classList.remove(...LAYOUT_VIEWPORTS);
      viewport?.classList.add(originalViewport);
      if (button) {
        button.disabled = false;
        button.textContent = error.message || 'Layout audit failed';
      }
    }
  }

  measureFramePacing(frameCount = 48, warmupFrames = 12) {
    const targetFps = Math.max(30, Number(this.project.production?.budgets?.targetFps) || 60);
    const longFrameThreshold = 2000 / targetFps;
    return new Promise(resolve => {
      const durations = [];
      let previous = null;
      let warmupRemaining = warmupFrames;
      let complete = false;
      const finish = () => {
        if (complete) return;
        complete = true;
        window.clearTimeout(watchdog);
        const ordered = [...durations].sort((left, right) => left - right);
        const trimCount = Math.max(1, Math.floor(ordered.length * 0.1));
        const steadyFrames = ordered.length > trimCount ? ordered.slice(0, -trimCount) : ordered;
        const averageMs = steadyFrames.length ? steadyFrames.reduce((sum, value) => sum + value, 0) / steadyFrames.length : 0;
        const rawAverageMs = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
        resolve({
          frames: durations.length,
          averageMs,
          rawAverageMs,
          p95Ms: ordered[Math.floor((ordered.length - 1) * 0.95)] || 0,
          maxMs: ordered.at(-1) || 0,
          longFrames: durations.filter(value => value > longFrameThreshold).length,
          fps: averageMs ? 1000 / averageMs : 0,
        });
      };
      const sample = now => {
        if (complete) return;
        if (previous != null) {
          if (warmupRemaining > 0) warmupRemaining -= 1;
          else durations.push(now - previous);
        }
        previous = now;
        if (durations.length < frameCount) {
          requestAnimationFrame(sample);
          return;
        }
        finish();
      };
      const watchdog = window.setTimeout(finish, 4500);
      requestAnimationFrame(sample);
    });
  }

  estimatePreviewTextureMemory(stage) {
    const sources = new Set();
    let bytes = 0;
    const images = [
      ...(stage?.querySelectorAll('img') || []),
      ...this.preloadedImages.values(),
    ];
    for (const image of images) {
      const source = image.currentSrc || image.src;
      if (!source || sources.has(source)) continue;
      sources.add(source);
      bytes += Math.max(1, image.naturalWidth || image.width || 1) * Math.max(1, image.naturalHeight || image.height || 1) * 4;
    }
    for (const canvas of stage?.querySelectorAll('canvas') || []) bytes += Math.max(1, canvas.width) * Math.max(1, canvas.height) * 4;
    return bytes;
  }

  async collectViewportPerformance(viewportName) {
    const viewport = this.container.querySelector('#previewViewport');
    const stage = this.container.querySelector('#previewStage');
    if (!viewport || !stage) throw new Error('Preview stage is unavailable.');
    viewport.classList.remove(...PERFORMANCE_VIEWPORTS);
    viewport.classList.add(viewportName);
    const rendered = await this.waitForRenderFrames(2);
    if (!rendered || document.visibilityState !== 'visible') {
      return {
        viewport: viewportName,
        frames: 0, averageMs: 0, rawAverageMs: 0, p95Ms: 0, maxMs: 0, longFrames: 0, fps: 0,
        textureMemoryBytes: this.estimatePreviewTextureMemory(stage),
        renderSurfaces: stage.querySelectorAll('img, canvas, svg, .symbol-cell, .ambient-fx i').length,
        domNodes: stage.querySelectorAll('*').length,
        viewportWidth: viewport.clientWidth,
        viewportHeight: viewport.clientHeight,
      };
    }
    this.directorRuntime.cancel('performance-profile');
    void this.dispatchPresentation('wincap', { amount: this.project.math.wincap, wins: [], mode: this.selectedMode, spins: 10 });
    const pacing = await this.measureFramePacing();
    this.directorRuntime.cancel('performance-profile-complete');
    return {
      viewport: viewportName,
      ...pacing,
      textureMemoryBytes: this.estimatePreviewTextureMemory(stage),
      renderSurfaces: stage.querySelectorAll('img, canvas, svg, .symbol-cell, .ambient-fx i').length,
      domNodes: stage.querySelectorAll('*').length,
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
    };
  }

  async runPerformanceProfile() {
    const button = this.container.querySelector('#previewPerformanceProfile');
    if (button?.disabled) return;
    const originalViewport = this.viewport;
    this.performanceProfiling = true;
    if (button) button.disabled = true;
    const samples = [];
    try {
      for (const viewport of PERFORMANCE_VIEWPORTS) {
        if (button) button.textContent = `Profiling ${viewport}…`;
        samples.push(await this.collectViewportPerformance(viewport));
      }
      const summary = recordPerformanceProfile(this.project, samples, {
        embeddedAssetBytes: estimateEmbeddedAssetBytes(this.project),
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio || 1,
      });
      this.onChange?.();
      this.viewport = originalViewport;
      this.render();
      const status = this.container.querySelector('.preview-performance-strip strong');
      if (status && !summary.complete) status.title = summary.issues.join(' ');
    } catch (error) {
      this.viewport = originalViewport;
      const viewport = this.container.querySelector('#previewViewport');
      viewport?.classList.remove(...PERFORMANCE_VIEWPORTS);
      viewport?.classList.add(originalViewport);
      if (button) {
        button.disabled = false;
        button.textContent = error.message || 'Profile failed';
      }
    } finally {
      this.performanceProfiling = false;
    }
  }

  spin({ automatic = false } = {}) {
    if (this.spinning) return;
    if (!automatic && this.autoSpinsRemaining > 0) {
      this.stopAutoSpins();
      return;
    }
    this.spinning = true;
    this.playbackTrace = [];
    this.playbackStartedAt = performance.now();
    this.recordPlaybackEvent('spinStart', { mode: this.selectedMode });
    this.landedReels.clear();
    this.visualEffectRuntime?.clearSymbolFlipbooks?.();

    this.bet = this.totalWager();
    this.balance -= this.bet;
    this.lastWin = 0;
    this.updateHUD();

    this.clearWinHighlights();
    this.clearFeatureState();
    this.prePresentedMechanicEvents.clear();
    const mode = this.mathEngine.getBetMode(this.selectedMode);
    const bonusMode = mode.profile?.entry === 'freeSpins';
    if (this.selectedMode !== 'base') this.showModePortal(this.selectedMode);
    this.audioEngine.startSoundscape(bonusMode ? 'bonusMusic' : 'baseMusic');
    void this.dispatchPresentation('spinStart', { mode: this.selectedMode });

    // One canonical round — same engine path the simulator uses, so preview
    // wins match simulated wins for the same config.
    const round = this.mathEngine.resolveRound(Math.random, this.selectedMode);
    const visibleSpin = round.spins[0] || this.mathEngine.resolveSpin();
    this.spinResult = {
      ...visibleSpin,
      totalWin: round.totalWin,
      uncappedWin: round.uncappedWin,
      wincapHit: round.wincapHit,
      round,
    };
    // The physical reel choreography begins before the book player. Prime only
    // explicitly pre-reveal instruments from the authoritative book so a
    // modeGridStart is visibly present before the first symbol lands. The same
    // event is then consumed (without being presented twice) by the book loop.
    for (const event of visibleSpin.state || []) {
      if (event.type === 'reveal') break;
      if (event.type !== 'modeGridStart') continue;
      this.applyPersistentMechanicState(event);
      this.syncFeatureStateMarkers();
      this.updateFeatureMechanic(this.mechanicCopy(event));
      this.prePresentedMechanicEvents.add(event);
    }
    // Land the board exactly as it existed before any special symbol acted.
    // The ordered event book then lets the player watch that symbol cause the
    // authoritative transformed board instead of revealing only the aftermath.
    const newBoard = visibleSpin.sourceBoard || this.spinResult.board;
    const { rows } = this.project.math.grid;
    const { cellH, buffer } = this.reelGeometry;
    const reelCount = this.project.math.grid.reels;
    const strips = this.container.querySelectorAll('.reel-strip');
    const allSymNames = this.project.theme.symbols
      .filter(s => !s.special?.length)
      .map(s => s.name);

    const hasAnticipation = this.hasScatterAnticipation(newBoard);
    const reelSchedule = getReelStopSchedule(this.project, hasAnticipation);
    const motionScale = this.turboMode ? 0.42 : 1;

    const spinToken = Symbol('preview-spin');
    this.activeSpinToken = spinToken;
    const tl = gsap.timeline({
      onComplete: () => {
        if (this.activeSpinToken !== spinToken) return;
        for (const interval of this.intervalIds) clearInterval(interval);
        this.intervalIds.clear();
        this.board = newBoard;
        this.recordPlaybackEvent('reelsLanded', { mode: this.selectedMode });
        // Every reel commits its authoritative reveal symbols at its own stop.
        // Repainting here caused a visible last-frame board swap and delayed
        // the Pixi symbol motion layer until after the complete reel sequence.
        this.clearWinHighlights();
        void this.dispatchPresentation('reveal', { board: newBoard, anticipation: this.hasScatterAnticipation(newBoard), mode: this.selectedMode });
        this.playSpinResult().then(() => {
          if (this.activeSpinToken === spinToken) {
            this.spinning = false;
            this.scheduleSymbolMotionSync();
            this.queueAutoSpin();
          }
        });
      }
    });
    this.spinTimeline = tl;

    strips.forEach((strip, r) => {
      const rRows = rows[r] || rows[0];
      const cells = strip.querySelectorAll('.reel-sym');
      const stop = reelSchedule.stops[r];
      // Keep the strip's travel inside its populated top/bottom buffers. The
      // previous 8–21 cell translation moved the entire strip outside the
      // mask, exposing the black reel well during every spin.
      const reelSpinDist = cellH * (0.92 + Math.random() * 0.18 + r * 0.05);

      cells.forEach((cell, i) => {
        cell.classList.remove('is-landed');
        const boardRow = i - buffer;
        if (boardRow >= 0 && boardRow < rRows) {
          this.setSymbolCell(cell, newBoard[r][boardRow]);
        } else {
          const rnd = allSymNames[Math.floor(Math.random() * allSymNames.length)];
          this.setSymbolCell(cell, rnd);
        }
      });

      tl.fromTo(strip,
        { y: -reelSpinDist },
        {
          y: 0,
          duration: Math.max(0.12, stop.durationMs * motionScale / 1000),
          ease: 'back.out(0.7)',
          delay: stop.delayMs * motionScale / 1000,
          onComplete: () => {
            this.paintReelBoard(r, newBoard[r]);
            this.landedReels.add(r);
            this.syncSymbolMotionFlipbooks();
            this.animateLandedCells(cells);
            this.audioEngine.playStinger('reelStop', r);
            this.pulseReelImpact(r);
          },
        },
        0
      );
    });

    if (hasAnticipation) {
      tl.call(() => {
        void this.dispatchPresentation('anticipation', { board: newBoard, mode: this.selectedMode });
      }, [], reelSchedule.anticipationCueMs * motionScale / 1000);
    }

    this.runBlurPhase(strips, allSymNames, reelCount, motionScale);
  }

  finishSpinImmediately() {
    if (this.morpheusDreamfallDriver) return this.finishMorpheusDreamfallImmediately('preview-finish-immediately');
    if (!this.spinning || !this.spinResult) return;
    this.visualEffectRuntime?.cancel();
    this.activeSpinToken = null;
    this.spinTimeline?.kill();
    this.spinTimeline = null;
    this.board = this.spinResult.board;
    this.paintBoard(this.board);
    this.clearWinHighlights();
    this.lastWin = this.spinResult.totalWin * this.baseBet;
    this.balance += this.lastWin;
    this.spinning = false;
    this.scheduleSymbolMotionSync();
    this.setAnimationState('idle');
    this.updateHUD();
    this.queueAutoSpin();
  }

  runBlurPhase(strips, allSymNames, reelCount, motionScale = 1) {
    const { rows } = this.project.math.grid;
    const { buffer } = this.reelGeometry;
    let tick = 0;
    const reelTiming = normalizeReelChoreography(this.project.presentationDirector?.reelChoreography);
    const maxTicks = reelTiming.blurTicks;
    const reelStopTick = Array.from({ length: reelCount }, (_, r) => reelTiming.blurStopTickStart + r);

    const interval = setInterval(() => {
      strips.forEach((strip, r) => {
        if (this.landedReels.has(r)) return;
        if (tick >= reelStopTick[r]) return;
        const cells = strip.querySelectorAll('.reel-sym');
        const rRows = rows[r] || rows[0];
        cells.forEach((cell, i) => {
          const rnd = allSymNames[Math.floor(Math.random() * allSymNames.length)];
          this.setSymbolCell(cell, rnd);
        });
      });
      tick++;
      if (tick >= maxTicks) {
        clearInterval(interval);
        this.intervalIds.delete(interval);
      }
    }, Math.max(18, reelTiming.blurIntervalMs * motionScale));
    this.intervalIds.add(interval);
  }

  /** Play the same ordered event book the Stake frontend receives in round.state. */
  async playSpinResult() {
    const res = this.spinResult;
    if (!res) return;

    if (res.round?.freeSpinsPlayed > 0) {
      await this.playFeaturePerformance(res.round);
      return;
    }
    const playback = await this.playSpinEventBook(res, { alreadyLanded: true, mode: this.selectedMode });
    this.board = playback.currentBoard;
    this.paintBoard(playback.currentBoard);
    this.clearWinHighlights();

    // Settle on the engine's capped total — running sum is pre-cap.
    this.lastWin = res.totalWin * this.baseBet;
    this.balance += this.lastWin;
    this.updateHUD();

    this.scheduleSymbolMotionSync();
    this.setAnimationState('idle');
  }

  async playSpinEventBook(spin, {
    alreadyLanded = false,
    feature = false,
    featureRunning = 0,
    featureIndex = 0,
    featureTotal = 0,
    mode = this.selectedMode,
  } = {}) {
    const events = spin.state || compileSpinBook(spin, {
      gameType: spin.gameMode || (feature ? 'freegame' : 'basegame'),
      wincap: this.project.math.wincap,
    });
    let currentBoard = this.board || spin.sourceBoard || spin.board || [];
    let running = 0;
    let presentedWin = false;
    let revealIndex = 0;

    for (const event of events) {
      this.recordPlaybackEvent(event.type, {
        bookIndex: event.index,
        featureSpin: feature ? featureIndex : 0,
        mode,
      });
      if (event.type === 'reveal') {
        currentBoard = deserializeBoard(event.board);
        this.board = currentBoard;
        const landed = alreadyLanded && revealIndex === 0;
        if (!landed) {
          this.paintBoard(currentBoard);
          this.animateBoardLanding();
          this.syncFeatureStateMarkers();
          await this.dispatchPresentation('reveal', {
            board: currentBoard,
            anticipation: event.anticipation,
            mode,
          });
          await this.wait(this.turboMode ? 120 : 320);
        }
        revealIndex++;
        continue;
      }

      if (SPECIAL_MECHANIC_EVENTS.has(event.type)) {
        if (this.prePresentedMechanicEvents.has(event)) {
          this.prePresentedMechanicEvents.delete(event);
          continue;
        }
        await this.playSpecialMechanicEvent(event, currentBoard);
        continue;
      }

      if (event.type === 'winInfo') {
        const wins = deserializeWins(event.wins);
        const stepWin = Number(event.totalWin || 0) / BOOK_AMOUNT_MULTIPLIER;
        await this.playDerivedWinMechanics(wins, currentBoard);
        running += stepWin;
        presentedWin = true;
        this.lastWin = (featureRunning + running) * this.baseBet;
        this.updateHUD();
        if (feature) this.updateFeatureProgress(mode, featureIndex, featureTotal, (featureRunning + running) * this.baseBet);
        this.animateWinDisplay(stepWin * this.baseBet);
        const winMotion = this.highlightWins(wins);
        await Promise.all([
          this.waitForPresentationMotion(winMotion),
          Promise.resolve(this.dispatchPresentation('winInfo', {
            wins,
            winsAlreadyHighlighted: true,
            amount: stepWin * this.baseBet,
            runningAmount: (featureRunning + running) * this.baseBet,
            mode,
          })),
        ]);
        continue;
      }

      if (event.type === 'tumbleBoard') {
        this.clearWinHighlights();
        currentBoard = await this.playStakeTumble(currentBoard, event);
        this.board = currentBoard;
        this.syncFeatureStateMarkers();
        continue;
      }

      if (event.type === 'boardTransform') {
        currentBoard = await this.playStakeBoardTransform(currentBoard, event);
        this.board = currentBoard;
        this.syncFeatureStateMarkers();
        continue;
      }

      if (event.type === 'setWin' && !feature) {
        await this.dispatchPresentation('setWin', {
          amount: Number(event.amount || 0) / BOOK_AMOUNT_MULTIPLIER * this.baseBet,
          runningAmount: running * this.baseBet,
          mode,
        });
        continue;
      }

      if (event.type === 'wincap') {
        await this.dispatchPresentation('wincap', {
          amount: Number(event.amount || 0) / BOOK_AMOUNT_MULTIPLIER * this.baseBet,
          mode,
        });
      }
    }

    if (!presentedWin) {
      this.clearWinHighlights();
      await this.dispatchPresentation('roundLose', { amount: 0, mode });
      await this.wait(this.turboMode ? 160 : 720);
    }
    return { currentBoard, running, presentedWin };
  }

  waitForPresentationMotion(result) {
    if (result?.finished?.then) return result.finished;
    const duration = Math.max(0, Number(result?.duration) || 0);
    return duration > 0 ? this.wait(Math.ceil(duration * 1000) + 80) : Promise.resolve();
  }

  eventPositions(values = []) {
    return (values || []).map(deserializePosition).filter(([reel, row]) => (
      Number.isFinite(reel) && Number.isFinite(row) && reel >= 0 && row >= 0
    ));
  }

  positionsForSymbol(board, expectedName, flag = null) {
    const positions = [];
    for (let reel = 0; reel < (board || []).length; reel++) {
      for (let row = 0; row < (board[reel] || []).length; row++) {
        const name = symbolName(board[reel][row]);
        const definition = this.project.theme.symbols?.find(item => item.name === name || item.id === name);
        if ((expectedName && name === expectedName) || (flag && definition?.special?.includes(flag))) positions.push([reel, row]);
      }
    }
    return positions;
  }

  pointForPosition([reel, row]) {
    const position = this.tumbleCellPosition(reel, row);
    return {
      x: this.reelGeometry.x + position.left + this.reelGeometry.cellW / 2,
      y: this.reelGeometry.y + position.top + this.reelGeometry.cellH / 2,
    };
  }

  pulseMechanicCells(positions = [], className = 'is-mechanic-source') {
    const cells = this.eventPositions(positions).map(([reel, row]) => this.cellAt(reel, row)).filter(Boolean);
    for (const cell of cells) cell.classList.add(className);
    if (cells.length) {
      gsap.fromTo(cells, { scale: 1, filter: 'brightness(1)' }, {
        scale: 1.1,
        filter: 'brightness(1.7)',
        duration: this.turboMode ? 0.14 : 0.32,
        yoyo: true,
        repeat: 1,
        ease: 'power2.inOut',
        onComplete: () => {
          for (const cell of cells) {
            cell.classList.remove(className);
            gsap.set(cell, { clearProps: 'scale,filter' });
          }
        },
      });
    }
    return cells;
  }

  mechanicCopy(event) {
    const count = this.eventPositions(event.positions).length;
    if (event.type === 'wildBomb') return event.size >= 3
      ? `GOLDEN RIFT · ${event.size}×${event.size} WILD FIELD`
      : `DREAM RIFT · ${event.size || 2}×${event.size || 2} WILD FIELD`;
    if (event.type === 'mysteryTransform') return `MYSTERY VEIL · REVEALS ${this.label(event.target)}`;
    if (event.type === 'symbolPurge') return `DAWN PURGE · ${count} SYMBOLS REFORGED`;
    if (event.type === 'wildStar') return `ONEIRIC STAR · ${this.label(event.target)} BECOMES WILD`;
    if (event.type === 'specialTargetSelected') return `ONEIRIC STAR · TARGETS ${this.label(event.targetFamily || event.target)}`;
    if (event.type === 'specialPositionsResolved') return `${this.label(event.special || 'SPECIAL')} · ${event.positions?.length || 0} POSITIONS RESOLVED`;
    if (event.type === 'expandingWild') return 'VEIL WILD · DESCENT EXPANDS';
    if (event.type === 'lucidWildMultiplier') return `LUCID WILD · ${Number(event.multiplier) || 1}× POWER`;
    if (event.type === 'echoSplit') return `ECHO SPLIT · ${Number(event.multiplier) || 1}× RESONANCE`;
    if (event.type === 'maxDream') return 'MAX MORPHEUS · DREAM ASCENSION';
    if (event.type === 'modeBoardSelection') {
      if (event.kind === 'scatter') return `DREAM ENHANCER · CHOSEN FROM ${event.candidateCount || 1} DREAMS`;
      if (event.kind === 'special') return `TRICKSTER DREAM · CHOSEN FROM ${event.candidateCount || 1} DREAMS`;
      return `DREAM SELECTION · CHOSEN FROM ${event.candidateCount || 1} DREAMS`;
    }
    if (event.type === 'symbolUpgrade') return `VEIL ASCENT · ${this.label(event.source)} → ${this.label(event.target)}`;
    if (event.type === 'symbolUpgradeApply') return 'VEIL ASCENT · UPGRADED SYMBOLS RETURN';
    if (event.type === 'symbolMultiplierUpdate' || event.type === 'symbolMultiplierUpgrade') return `LUCID BLESSING · ${this.label(event.symbolFamily || event.symbol)} ${event.current || event.multiplier}×`;
    if (event.type === 'positionMultiplierGridUpdate') {
      const label = this.featurePositionGridMode === 'trickster_dream' ? 'TRICKSTER DREAM' : 'ONEIRIC NEXUS';
      return `${label} · ${event.updates?.length || 0} POSITIONS DOUBLE`;
    }
    if (event.type === 'modeGridStart') {
      const label = event.mode === 'trickster_dream' ? 'TRICKSTER DREAM' : 'ONEIRIC NEXUS';
      return `${label} · ${(event.cells || []).length} POSITION GRID AWAKENS`;
    }
    if (event.type === 'expandReelHeight') return `DREAMFALL · REEL ${Number(event.reel) + 1} GROWS TO ${event.rows}`;
    if (event.type === 'expandStickyReel') return `WILD REEL ${Number(event.reel) + 1} · ${event.multiplier}×`;
    if (event.type === 'upgradeStickyReel') return `WILD REEL ${Number(event.reel) + 1} · ${event.multiplier}×`;
    return this.label(event.type).toUpperCase();
  }

  updateFeatureMechanic(text = '') {
    const label = this.container.querySelector('#previewFeatureMechanic');
    if (!label) return;
    label.textContent = text;
    label.classList.toggle('is-visible', Boolean(text));
  }

  applyPersistentMechanicState(event) {
    if (event.type === 'modeGridStart') {
      this.featurePositionGridMode = event.mode || 'oneiric_nexus';
      for (const cell of event.cells || []) {
        const [reel, row] = this.eventPositions([cell.position])[0] || [];
        if (Number.isFinite(reel) && Number.isFinite(row)) this.featurePositionMultipliers.set(`${reel}:${row}`, Number(cell.value) || 1);
      }
    }
    if (event.type === 'positionMultiplierGridUpdate') {
      const updates = event.updates || (event.position ? [{
        reel: event.position.reel,
        row: event.position.row,
        multiplier: event.current,
      }] : []);
      for (const update of updates) {
        const key = `${Number(update.reel)}:${Number(update.row)}`;
        this.featurePositionMultipliers.set(key, Number(update.multiplier) || 1);
        this.featurePositionGridPulse.add(key);
      }
    }
    if (event.type === 'symbolMultiplierUpdate' || event.type === 'symbolMultiplierUpgrade') {
      this.featureSymbolMultipliers.set(event.symbolFamily || event.symbol, Number(event.current || event.multiplier) || 1);
    }
    if (event.type === 'expandReelHeight') {
      this.featureReelRows.set(Number(event.reel), Number(event.rows) || this.project.math.grid.rows[Number(event.reel)] || 0);
    }
    if (event.type === 'clearTemporaryReels') {
      for (const reel of event.reels || []) this.featureReelRows.delete(Number(reel));
    }
  }

  syncFeatureStateMarkers() {
    const layer = this.container.querySelector('#previewMechanicStateLayer');
    if (!layer) return;
    layer.replaceChildren();
    layer.dataset.positionGridMode = this.featurePositionGridMode || '';
    layer.classList.toggle('is-position-grid-active', Boolean(this.featurePositionGridMode));
    const addMarker = (reel, row, text, className, title) => {
      const position = this.tumbleCellPosition(reel, row);
      const marker = document.createElement('span');
      marker.className = `preview-mechanic-marker ${className}`;
      marker.textContent = text;
      marker.title = title;
      marker.style.left = `${position.left + this.reelGeometry.cellW - 28}px`;
      marker.style.top = `${position.top + 5}px`;
      layer.appendChild(marker);
    };
    const addGridPlate = (reel, row, multiplier) => {
      const position = this.tumbleCellPosition(reel, row);
      const key = `${reel}:${row}`;
      const plate = document.createElement('span');
      plate.className = `preview-position-grid-plate${multiplier > 1 ? ' is-charged' : ''}${this.featurePositionGridPulse.has(key) ? ' is-newly-charged' : ''}`;
      plate.dataset.reel = String(reel);
      plate.dataset.row = String(row);
      plate.dataset.multiplier = String(multiplier);
      plate.setAttribute('aria-label', `${this.featurePositionGridMode === 'trickster_dream' ? 'Trickster Dream' : 'Oneiric Nexus'} position ${reel + 1},${row + 1}: ${multiplier}x`);
      Object.assign(plate.style, {
        left: `${position.left + 2}px`,
        top: `${position.top + 2}px`,
        width: `${Math.max(0, this.reelGeometry.cellW - 4)}px`,
        height: `${Math.max(0, this.reelGeometry.cellH - 4)}px`,
      });
      const value = document.createElement('b');
      value.textContent = `${multiplier}×`;
      plate.appendChild(value);
      layer.appendChild(plate);
    };
    for (const [key, multiplier] of this.featurePositionMultipliers) {
      const [reel, row] = key.split(':').map(Number);
      if (this.featurePositionGridMode) addGridPlate(reel, row, multiplier);
      else if (multiplier > 1) addMarker(reel, row, `${multiplier}×`, 'is-position-multiplier', `Oneiric position multiplier ${multiplier}x`);
    }
    for (const [symbol, multiplier] of this.featureSymbolMultipliers) {
      if (multiplier <= 1) continue;
      for (const [reel, row] of this.positionsForSymbol(this.board, symbol)) {
        addMarker(reel, row, `${multiplier}×`, 'is-symbol-multiplier', `${this.label(symbol)} multiplier ${multiplier}x`);
      }
    }
    this.featurePositionGridPulse.clear();
  }

  collectPositionGridLayoutProof() {
    const layer = this.container.querySelector('#previewMechanicStateLayer');
    const plates = [...this.container.querySelectorAll('.preview-position-grid-plate')].map(plate => {
      const rect = plate.getBoundingClientRect();
      const value = plate.querySelector('b');
      const valueRect = value?.getBoundingClientRect();
      return {
        reel: Number(plate.dataset.reel),
        row: Number(plate.dataset.row),
        multiplier: Number(plate.dataset.multiplier),
        position: getComputedStyle(plate).position,
        valuePosition: value ? getComputedStyle(value).position : '',
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        valueRect: valueRect ? { left: valueRect.left, top: valueRect.top, width: valueRect.width, height: valueRect.height } : null,
      };
    });
    const keys = plates.map(plate => `${plate.reel}:${plate.row}`);
    const coordinateKeys = plates.map(plate => `${Math.round(plate.rect.left * 100) / 100}:${Math.round(plate.rect.top * 100) / 100}`);
    const overlaps = [];
    for (let left = 0; left < plates.length; left++) for (let right = left + 1; right < plates.length; right++) {
      const a = plates[left].rect;
      const b = plates[right].rect;
      const area = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left))
        * Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
      if (area > 1) overlaps.push(`${keys[left]}:${keys[right]}`);
    }
    return {
      format: 'morpheus-position-grid-layout-proof-v1',
      mode: layer?.dataset.positionGridMode || '',
      requiredCount: this.featurePositionMultipliers.size,
      plateCount: plates.length,
      uniqueCellCount: new Set(keys).size,
      uniqueCoordinateCount: new Set(coordinateKeys).size,
      overlaps,
      plates,
      passed: plates.length === this.featurePositionMultipliers.size
        && new Set(keys).size === plates.length
        && new Set(coordinateKeys).size === plates.length
        && plates.every(plate => plate.position === 'absolute'
          && plate.valuePosition === 'absolute'
          && plate.rect.width >= 12 && plate.rect.height >= 12
          && plate.valueRect?.width > 0 && plate.valueRect?.height > 0)
        && overlaps.length === 0,
    };
  }

  clearFeatureState() {
    this.featurePositionMultipliers.clear();
    this.featurePositionGridMode = null;
    this.featurePositionGridPulse.clear();
    this.featureSymbolMultipliers.clear();
    this.featureReelRows.clear();
    this.updateFeatureMechanic('');
    this.syncReelLayout(this.project.math.grid.rows);
    this.syncFeatureStateMarkers();
  }

  async playSpecialMechanicEvent(event, board = this.board) {
    this.applyPersistentMechanicState(event);
    this.syncReelLayout((board || []).map(column => column?.length || 0));
    let sources = this.eventPositions(event.sources || []);
    let targets = this.eventPositions(event.positions || []);
    if (event.type === 'positionMultiplierGridUpdate') {
      targets = (event.updates || []).map(update => [Number(update.reel), Number(update.row)]);
    }
    if (event.type === 'modeGridStart') targets = (event.cells || []).map(cell => this.eventPositions([cell.position])[0]).filter(Boolean);
    if (event.type === 'symbolMultiplierUpdate' || event.type === 'symbolMultiplierUpgrade') targets = this.positionsForSymbol(board, event.symbolFamily || event.symbol);
    if (event.type === 'expandReelHeight' || event.type === 'expandStickyReel' || event.type === 'upgradeStickyReel') {
      const reel = Number(event.reel);
      targets = (board?.[reel] || []).map((_, row) => [reel, row]);
    }
    if (!sources.length && event.source) sources = this.positionsForSymbol(board, event.source);
    if (!sources.length && event.type === 'wildBomb') {
      sources = this.positionsForSymbol(board, null, Number(event.size) >= 3 ? 'goldWildBomb' : 'wildBomb');
    }
    if (!sources.length && event.type === 'mysteryTransform') sources = this.positionsForSymbol(board, null, 'mystery');
    if (!sources.length && event.type === 'positionMultiplierGridUpdate') sources = targets;
    if (!targets.length) targets = sources;

    const label = this.mechanicCopy(event);
    this.updateFeatureMechanic(label);
    this.pulseMechanicCells(sources, 'is-mechanic-source');
    const uniqueTargets = [...new Map(targets.map(position => [position.join(':'), position])).values()];
    const targetPoints = uniqueTargets.map(position => this.pointForPosition(position));
    const origin = sources.length
      ? this.pointForPosition(sources[0])
      : event.fromMoon ? this.project.theme?.presentationEffects?.winConnections?.origin || null : null;
    const result = targetPoints.length ? this.visualEffectRuntime?.playEnergyTaps(targetPoints, {
      origin,
      groups: [targetPoints],
      color: event.type === 'symbolPurge' ? '#f1c66c' : '#62e7ff',
      coreColor: '#ffffff',
      rimColor: event.type === 'wildBomb' && Number(event.size) >= 3 ? '#f1c66c' : '#d6a84b',
      launchDuration: this.turboMode ? 0.18 : 0.42,
      launchHold: this.turboMode ? 0.02 : 0.08,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      messengerAssetId: 'dreamfall.motion.moon-messenger',
      impactAssetId: 'dreamfall.motion.oneiric-impact',
    }) : null;
    this.pulseMechanicCells(uniqueTargets, 'is-mechanic-target');
    await this.waitForPresentationMotion(result);
    this.syncFeatureStateMarkers();
    await this.wait(this.turboMode ? 80 : 260);
  }

  async playDerivedWinMechanics(wins, board) {
    for (const win of wins || []) {
      const meta = win.meta || {};
      const multiplierWildPositions = this.eventPositions(meta.multiplierWildPositions || []);
      if (Number(meta.multiplierWild) > 1 && multiplierWildPositions.length) {
        await this.playSpecialMechanicEvent({
          type: 'lucidWildMultiplier',
          multiplier: meta.multiplierWild,
          sources: multiplierWildPositions,
          positions: win.positions,
        }, board);
      }
      if (Number(meta.splitMultiplier) > 1) {
        const sources = this.positionsForSymbol(board, null, 'split');
        if (sources.length) {
          await this.playSpecialMechanicEvent({
            type: 'echoSplit',
            multiplier: meta.splitMultiplier,
            sources,
            positions: win.positions,
          }, board);
        }
      }
      if (meta.maxWildTriggered) {
        const sources = this.positionsForSymbol(board, null, 'maxWild');
        await this.playSpecialMechanicEvent({ type: 'maxDream', sources, positions: win.positions }, board);
      }
    }
  }

  tumbleCellPosition(reel, row) {
    const rows = this.project.math.grid.rows;
    const reelRows = this.featureReelRows.get(reel) || this.board?.[reel]?.length || rows[reel] || rows[0];
    const offsetY = (this.reelGeometry.maxRows - reelRows) * this.reelGeometry.cellH
      / (this.reelGeometry.reservedWorld ? 1 : 2);
    return {
      left: reel * (this.reelGeometry.cellW + this.reelGeometry.gap),
      top: offsetY + row * this.reelGeometry.cellH,
    };
  }

  createTumbleSymbol(layer, symbol, reel, row, className = '') {
    const cell = document.createElement('div');
    const position = this.tumbleCellPosition(reel, row);
    cell.className = `preview-tumble-symbol ${className}`.trim();
    cell.dataset.reel = String(reel);
    cell.dataset.row = String(row);
    Object.assign(cell.style, {
      position: 'absolute',
      left: `${position.left}px`,
      top: `${position.top}px`,
      width: `${this.reelGeometry.cellW}px`,
      height: `${this.reelGeometry.cellH}px`,
    });
    this.setSymbolCell(cell, symbolName(symbol));
    layer.appendChild(cell);
    return cell;
  }

  /**
   * Stake tumble choreography: snapshot, explode exact positions, compact each
   * reel, insert exact incoming symbols, then atomically reveal the settled
   * canonical board. The canonical reel DOM is never left partially empty.
   */
  async playStakeTumble(board, event) {
    const frame = this.container.querySelector('.reel-frame');
    if (!frame) return applyTumbleEvent(board, event);

    const layer = document.createElement('div');
    layer.className = 'preview-tumble-layer';
    const removed = new Set((event.explodingSymbols || [])
      .map(position => `${Number(position.reel)},${Number(position.row)}`));
    const survivorMotions = [];
    const explodingCells = [];

    for (let reel = 0; reel < board.length; reel++) {
      const incoming = event.newSymbols?.[reel] || [];
      let survivorIndex = 0;
      for (let row = 0; row < board[reel].length; row++) {
        const cell = this.createTumbleSymbol(layer, board[reel][row], reel, row,
          removed.has(`${reel},${row}`) ? 'is-exploding' : 'is-survivor');
        if (removed.has(`${reel},${row}`)) {
          explodingCells.push(cell);
          continue;
        }
        const target = this.tumbleCellPosition(reel, incoming.length + survivorIndex);
        cell.dataset.targetTop = String(target.top);
        survivorMotions.push(cell);
        survivorIndex++;
      }
      incoming.forEach((symbol, index) => {
        const cell = this.createTumbleSymbol(layer, symbol, reel, index - incoming.length, 'is-incoming');
        const target = this.tumbleCellPosition(reel, index);
        cell.dataset.targetTop = String(target.top);
        cell.style.opacity = '0';
        survivorMotions.push(cell);
      });
    }

    frame.appendChild(layer);
    frame.classList.add('is-tumbling');
    this.visualEffectRuntime?.clearSymbolFlipbooks?.();

    const motion = new Promise(resolve => {
      const timeline = gsap.timeline({ onComplete: resolve });
      if (explodingCells.length) {
        timeline.to(explodingCells, {
          scale: 0.18,
          opacity: 0,
          rotation: (_, target) => (Number(target.dataset.reel) % 2 ? 7 : -7),
          duration: 0.28,
          stagger: 0.012,
          ease: 'power2.in',
        });
      }
      timeline.to(survivorMotions, {
        top: (_, target) => Number(target.dataset.targetTop),
        opacity: 1,
        duration: 0.46,
        stagger: 0.014,
        ease: 'power3.out',
      }, explodingCells.length ? '-=0.035' : 0);
    });

    try {
      await Promise.all([
        motion,
        Promise.resolve(this.dispatchPresentation('tumbleBoard', {
          newSymbols: event.newSymbols,
          explodingSymbols: event.explodingSymbols,
          mode: this.selectedMode,
        })),
      ]);
      const settled = applyTumbleEvent(board, event);
      this.board = settled;
      this.paintBoard(settled);
      return settled;
    } finally {
      layer.remove();
      frame.classList.remove('is-tumbling');
      this.scheduleSymbolMotionSync();
    }
  }

  /** Animate only mechanic-authored symbol changes instead of repainting a board. */
  async playStakeBoardTransform(board, event) {
    const frame = this.container.querySelector('.reel-frame');
    const targetBoard = deserializeBoard(event.board);
    if (!frame || !(event.changes || []).length) {
      this.board = targetBoard;
      this.paintBoard(targetBoard);
      return targetBoard;
    }

    const layer = document.createElement('div');
    layer.className = 'preview-tumble-layer preview-transform-layer';
    const outgoing = [];
    const incoming = [];
    for (const change of event.changes) {
      const oldCell = this.createTumbleSymbol(layer, change.from, change.reel, change.row, 'is-transform-out');
      const newCell = this.createTumbleSymbol(layer, change.to, change.reel, change.row, 'is-transform-in');
      newCell.style.opacity = '0';
      outgoing.push(oldCell);
      incoming.push(newCell);
    }
    frame.appendChild(layer);
    this.visualEffectRuntime?.clearSymbolFlipbooks?.();
    this.board = targetBoard;
    this.paintBoard(targetBoard);

    await new Promise(resolve => {
      gsap.timeline({ onComplete: resolve })
        .to(outgoing, { opacity: 0, scale: 1.16, duration: 0.3, ease: 'power2.out' })
        .fromTo(incoming, { opacity: 0, scale: 0.82 }, { opacity: 1, scale: 1, duration: 0.34, ease: 'back.out(1.4)' }, '-=0.2');
    });
    layer.remove();
    this.scheduleSymbolMotionSync();
    return targetBoard;
  }

  pulseReelImpact(reel) {
    if (!this.allowsHtmlVisibleEffects()) return;
    const stage = this.container.querySelector('#previewStage');
    if (!stage) return;
    const impact = document.createElement('div');
    impact.className = 'preview-reel-impact';
    const center = this.reelGeometry.x + (reel + 0.5) * (this.reelGeometry.w / this.project.math.grid.reels);
    impact.style.left = `${center}px`;
    impact.style.top = `${this.reelGeometry.y}px`;
    impact.style.height = `${this.reelGeometry.h}px`;
    stage.appendChild(impact);
    const reelTiming = normalizeReelChoreography(this.project.presentationDirector?.reelChoreography);
    window.setTimeout(() => impact.remove(), reelTiming.impactMs * (this.turboMode ? 0.5 : 1));
  }

  updateFeatureProgress(mode, current, total, amount, unit = 'FREE SPIN') {
    const panel = this.container.querySelector('#previewFeatureProgress');
    if (!panel) return;
    panel.classList.add('is-visible');
    panel.querySelector('#previewFeatureMode').textContent = this.label(mode);
    panel.querySelector('#previewFeatureCount').textContent = `${unit} ${current} / ${total}`;
    panel.querySelector('#previewFeatureTotal').textContent = `FEATURE TOTAL ${Number(amount || 0).toFixed(2)}`;
  }

  async playFeaturePerformance(round) {
    const baseSpins = (round.spins || []).filter(spin => spin.gameMode === 'basegame');
    const featureSpins = (round.spins || []).filter(spin => spin.gameMode === 'freegame');
    const totalSpins = featureSpins.length || round.freeSpinsPlayed || 1;
    const directFeature = baseSpins.length === 0;
    const presentationMode = this.featurePresentationMode(round);
    const modeState = this.performanceStateForMode(round.mode);
    let running = 0;

    this.clearFeatureState();
    this.recordPlaybackEvent('featureStart', { mode: presentationMode, spins: totalSpins });

    // A naturally triggered feature still has to finish its triggering base
    // spin book before feature entry. A directly purchased feature has already
    // landed the first free-spin source board in the outer reel choreography.
    for (let index = 0; index < baseSpins.length; index++) {
      const playback = await this.playSpinEventBook(baseSpins[index], {
        alreadyLanded: index === 0,
        mode: round.mode,
      });
      running += playback.running;
      this.board = playback.currentBoard;
    }

    await this.dispatchPresentation('freeSpinTrigger', {
      amount: round.totalWin * this.baseBet,
      mode: presentationMode,
      spins: totalSpins,
      suppressModePortal: directFeature,
    });
    await this.dispatchPresentation('enterBonus', {
      amount: round.totalWin * this.baseBet,
      mode: presentationMode,
      spins: totalSpins,
    });

    for (let index = 0; index < featureSpins.length; index++) {
      const spin = featureSpins[index];
      const featureSpinStartedAt = performance.now();
      this.recordPlaybackEvent('featureSpinStart', { mode: presentationMode, featureSpin: index + 1 });
      this.setAnimationState(this.hasScatterAnticipation(spin.sourceBoard || spin.board) ? 'anticipation' : modeState);
      this.updateFeatureProgress(presentationMode, index + 1, totalSpins, running * this.baseBet);
      const playback = await this.playSpinEventBook(spin, {
        alreadyLanded: directFeature && index === 0,
        feature: true,
        featureRunning: running,
        featureIndex: index + 1,
        featureTotal: totalSpins,
        mode: presentationMode,
      });
      running += playback.running;
      if (!this.turboMode) {
        const elapsed = performance.now() - featureSpinStartedAt;
        await this.wait(Math.max(0, 1450 - elapsed));
      }
      this.recordPlaybackEvent('featureSpinEnd', {
        mode: presentationMode,
        featureSpin: index + 1,
        runningWin: Number(running.toFixed(4)),
      });
      this.board = playback.currentBoard;
      this.lastWin = running * this.baseBet;
      this.updateHUD();
      this.updateFeatureProgress(presentationMode, index + 1, totalSpins, running * this.baseBet);
      await this.wait(this.turboMode ? 120 : (index === featureSpins.length - 1 ? 900 : 600));
      if (index < featureSpins.length - 1) this.setAnimationState(modeState);
    }

    this.lastWin = round.totalWin * this.baseBet;
    this.balance += this.lastWin;
    this.updateHUD();
    if (round.wincapHit) {
      await this.dispatchPresentation('wincap', { amount: round.totalWin * this.baseBet, mode: presentationMode });
    }

    await this.dispatchPresentation('freeSpinEnd', { amount: round.totalWin * this.baseBet, mode: presentationMode, spins: totalSpins });
    this.container.querySelector('#previewFeatureProgress')?.classList.remove('is-visible');
    this.clearWinHighlights();
    this.clearFeatureState();
    this.scheduleSymbolMotionSync();
    this.setAnimationState('idle');
    this.recordPlaybackEvent('featureEnd', { mode: presentationMode, totalWin: round.totalWin });
  }

  playFeatureFinale(round, spins, stage = this.container.querySelector('#previewStage'), unit = 'FREE SPINS') {
    if (!stage) return Promise.resolve();
    const overlay = document.createElement('div');
    const [kicker, title] = this.finaleCopy(round.mode);
    const verdictArt = this.project.theme?.presentationAssets?.verdictPlate || '';
    overlay.className = `feature-result-celebration ${verdictArt ? 'has-authored-art' : ''}`;
    overlay.innerHTML = `${verdictArt ? `<img class="preview-presentation-art" src="${this.esc(verdictArt)}" alt="" draggable="false">` : ''}
      <div class="feature-result-copy"><span>${this.esc(kicker)}</span><strong>${this.esc(title)}</strong><small>${this.esc(`${spins} ${unit}`)}</small><b>${(Number(round.totalWin || 0) * this.baseBet).toFixed(2)}</b></div>`;
    stage.appendChild(overlay);
    this.startPresentationEnergy('verdict');
    return new Promise(resolve => {
      const timeline = gsap.timeline({
        onComplete: () => {
          this.stopPresentationEnergy();
          overlay.remove();
          resolve();
        },
      });
      timeline.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: .28 })
        .fromTo(overlay.querySelector('strong'), { x: -42, opacity: 0 }, { x: 0, opacity: 1, duration: .52, ease: 'power3.out' }, .14)
        .fromTo(overlay.querySelector('b'), { scale: .55, opacity: 0 }, { scale: 1, opacity: 1, duration: .58, ease: 'back.out(1.8)' }, .24)
        .to(overlay, { opacity: 0, duration: .42, delay: 1.65 });
    });
  }

  playWincapCelebration(multiplier = this.project.math.wincap, { immediate = false } = {}) {
    const stage = this.container.querySelector('#previewStage');
    if (!stage) return Promise.resolve();
    const overlay = document.createElement('div');
    const verdictArt = this.project.theme?.presentationAssets?.verdictPlate || '';
    overlay.className = `wincap-celebration ${verdictArt ? 'has-authored-art' : ''}`;
    overlay.innerHTML = `${verdictArt ? `<img class="preview-presentation-art" src="${this.esc(verdictArt)}" alt="" draggable="false">` : ''}
      <div class="wincap-celebration-copy"><span>MAXIMUM WIN</span><strong>${Number(multiplier).toLocaleString()}x</strong><small>ROUND COMPLETE</small></div>`;
    stage.appendChild(overlay);
    this.startPresentationEnergy('verdict');
    if (immediate) {
      this.stopPresentationEnergy();
      overlay.remove();
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const timeline = gsap.timeline({
        onComplete: () => {
          this.stopPresentationEnergy();
          overlay.remove();
          resolve();
        },
      });
      timeline.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.25 })
        .fromTo(overlay.querySelector('strong'), { scale: 0.35, rotation: -4 }, { scale: 1, rotation: 0, duration: 0.8, ease: 'elastic.out(1, 0.45)' }, 0.05)
        .fromTo(overlay.querySelector('span'), { y: -25, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 }, 0.18)
        .to(overlay, { opacity: 0, duration: 0.45, delay: 1.6 });
    });
  }

  winTier(win) {
    return resolvePresentationWinTier(this.project, win);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  recordPlaybackEvent(type, detail = {}) {
    const elapsedMs = this.playbackStartedAt ? Math.max(0, Math.round(performance.now() - this.playbackStartedAt)) : 0;
    this.playbackTrace.push({ type, elapsedMs, ...detail });
    if (this.playbackTrace.length > 240) this.playbackTrace.splice(0, this.playbackTrace.length - 240);
  }

  cellAt(reel, row) {
    return this.container.querySelector(
      `.reel-sym[data-reel="${reel}"][data-pos="${row + this.reelGeometry.buffer}"]`
    );
  }

  isScatterSymbol(name) {
    const symbol = this.project.theme.symbols?.find(item => item.name === name || item.id === name);
    return String(name || '').toLowerCase().includes('scatter') || symbol?.special?.includes('scatter');
  }

  hasScatterAnticipation(board) {
    if (!Array.isArray(board) || board.length < 2) return false;
    const beforeFinalReel = board.slice(0, -1).flat();
    return beforeFinalReel.filter(symbol => this.isScatterSymbol(symbol)).length >= 2;
  }

  /** Repaint the visible window from a board, leaving buffer cells alone. */
  paintBoard(board) {
    this.syncReelLayout((board || []).map((column, reel) => column?.length || this.project.math.grid.rows[reel]));
    for (let r = 0; r < board.length; r++) {
      const rRows = board[r]?.length || 0;
      for (let row = 0; row < rRows; row++) {
        const cell = this.cellAt(r, row);
        if (cell) this.setSymbolCell(cell, board[r][row]);
      }
    }
  }

  paintReelBoard(reel, symbols) {
    const rowCounts = this.board?.map(column => column?.length || 0) || [...this.project.math.grid.rows];
    rowCounts[reel] = symbols?.length || rowCounts[reel] || this.project.math.grid.rows[reel] || this.project.math.grid.rows[0];
    this.syncReelLayout(rowCounts);
    const rows = symbols?.length || 0;
    for (let row = 0; row < rows; row++) {
      const cell = this.cellAt(reel, row);
      if (cell) this.setSymbolCell(cell, symbols?.[row]);
    }
  }

  /** Resize the real reel masks/cells when Dreamfall grows beyond four rows. */
  syncReelLayout(rowCounts = this.project.math.grid.rows) {
    if (!this.reelGeometry) return;
    const counts = Array.from({ length: this.project.math.grid.reels }, (_, reel) => (
      Math.max(1, Number(this.featureReelRows.get(reel) || rowCounts?.[reel] || this.project.math.grid.rows[reel] || this.project.math.grid.rows[0]) || 1)
    ));
    const reservedWorld = this.isMorpheusDreamfallWorldActive();
    const maxRows = reservedWorld ? MORPHEUS_RESERVED_WORLD_ROWS : Math.max(...counts);
    const cellH = this.reelGeometry.h / maxRows;
    const { buffer, cellW } = this.reelGeometry;
    this.reelGeometry.maxRows = maxRows;
    this.reelGeometry.cellH = cellH;

    for (let reel = 0; reel < counts.length; reel++) {
      const reelRows = counts[reel];
      const stripCells = (reservedWorld ? maxRows : reelRows) + buffer * 2;
      const mask = this.container.querySelector(`.reel-mask[data-reel="${reel}"]`);
      const strip = this.container.querySelector(`.reel-strip[data-reel="${reel}"]`);
      if (!mask || !strip) continue;
      const maskTop = (maxRows - reelRows) * cellH / (reservedWorld ? 1 : 2);
      mask.style.top = `${maskTop}px`;
      mask.style.height = `${reelRows * cellH}px`;
      strip.style.top = `${-buffer * cellH}px`;
      strip.style.height = `${stripCells * cellH}px`;
      while (strip.children.length < stripCells) {
        const cell = document.createElement('div');
        cell.className = 'reel-sym';
        cell.dataset.reel = String(reel);
        cell.dataset.pos = String(strip.children.length);
        Object.assign(cell.style, {
          position: 'absolute', left: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: '700', color: '#1a1a2e', boxSizing: 'border-box', borderBottom: '2px solid rgba(0,0,0,0.2)',
        });
        strip.appendChild(cell);
      }
      [...strip.children].forEach((cell, index) => {
        cell.style.display = index < stripCells ? 'flex' : 'none';
        cell.dataset.visible = String(index >= buffer && index < buffer + reelRows);
        cell.style.top = `${index * cellH}px`;
        cell.style.width = `${cellW}px`;
        cell.style.height = `${cellH}px`;
        cell.style.fontSize = `${Math.min(cellW, cellH) * 0.3}px`;
      });
      const cap = this.container.querySelector(`.reel-cap[data-reel="${reel}"]`);
      if (cap) cap.style.top = `${maskTop}px`;
    }
  }

  animateBoardLanding() {
    const cells = [...this.container.querySelectorAll('.reel-sym')].filter(cell => {
      const row = Number(cell.dataset.pos) - this.reelGeometry.buffer;
      return row >= 0 && row < this.reelGeometry.maxRows;
    });
    this.animateLandedCells(cells);
  }

  animateLandedCells(cells) {
    const targets = [...cells];
    for (const cell of targets) cell.classList.remove('is-landed');
    if (targets[0]) void targets[0].offsetWidth;
    for (const cell of targets) cell.classList.add('is-landed');
    window.setTimeout(() => {
      for (const cell of targets) cell.classList.remove('is-landed');
    }, 340);
  }

  collapseWinningCells(wins) {
    const cells = [];
    for (const win of wins) {
      for (const [r, row] of win.positions || []) {
        const cell = this.cellAt(r, row);
        if (cell && !cells.includes(cell)) cells.push(cell);
      }
    }
    if (cells.length === 0) return Promise.resolve();

    this.clearWinHighlights();
    return new Promise(resolve => {
      gsap.to(cells, {
        scale: 0, opacity: 0, duration: 0.25, ease: 'back.in(1.6)',
        stagger: 0.015,
        onComplete: () => {
          gsap.set(cells, { scale: 1, opacity: 1 });
          resolve();
        },
      });
    });
  }

  dropBoardIn() {
    const strips = this.container.querySelectorAll('.reel-strip');
    const { cellH } = this.reelGeometry;
    return new Promise(resolve => {
      gsap.fromTo(strips,
        { y: -cellH * 1.5 },
        { y: 0, duration: 0.38, ease: 'bounce.out', stagger: 0.04, onComplete: resolve }
      );
    });
  }

  highlightWins(wins, { staticOnly = false } = {}) {
    const winningCells = new Set();
    for (const win of wins) {
      for (const [r, row] of win.positions || []) {
        const cell = this.cellAt(r, row);
        if (cell) {
          cell.classList.add('win-highlight');
          winningCells.add(cell);
        }
      }
    }
    this.container.querySelectorAll('.reel-sym').forEach(cell => {
      const pos = Number(cell.dataset.pos) - this.reelGeometry.buffer;
      const visible = pos >= 0 && pos < this.reelGeometry.maxRows;
      cell.classList.toggle('win-dimmed', visible && winningCells.size > 0 && !winningCells.has(cell));
    });
    return staticOnly ? null : this.renderWinPaths(wins);
  }

  renderWinPaths(wins) {
    if (this.project.theme?.presentationEffects?.winConnections?.type === 'particleTap') {
      return this.playWinEnergyTaps(wins);
    }
    const orbLayer = this.container.querySelector('#previewWinOrbs');
    const orbSrc = this.project.theme?.presentationAssets?.connectionOrb;
    if (orbLayer && orbSrc) {
      this.renderWinOrbTaps(orbLayer, wins, orbSrc);
      return null;
    }
    const svg = this.container.querySelector('#previewWinPaths');
    if (!svg) return null;
    const paths = [];
    for (const [index, win] of (wins || []).entries()) {
      const positions = [...(win.positions || [])].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (positions.length < 2) continue;
      const points = positions.map(([reel, row]) => ({
        x: this.reelGeometry.x + (reel + .5) * (this.reelGeometry.w / this.project.math.grid.reels),
        y: this.reelGeometry.y + (row + .5) * (this.reelGeometry.h / this.reelGeometry.maxRows),
      }));
      const pointString = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
      paths.push(`<polyline class="preview-win-path preview-win-path-${index % 3}" points="${pointString}" pathLength="1" style="--path-delay:${index * 90}ms"></polyline>`);
      paths.push(...points.map((point, pointIndex) => `<circle class="preview-win-node" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="6" style="--path-delay:${index * 90 + pointIndex * 55}ms"></circle>`));
    }
    svg.innerHTML = paths.join('');
    svg.classList.toggle('is-visible', paths.length > 0);
    return null;
  }

  playWinEnergyTaps(wins) {
    const seen = new Set();
    const positionGroups = [];
    for (const win of wins || []) {
      const group = [];
      for (const position of [...(win.positions || [])].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
        const key = `${position[0]}:${position[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        group.push(position);
      }
      if (group.length) positionGroups.push(group);
    }
    const positions = positionGroups.flat();
    if (!positions.length) return;
    const reelWidth = this.reelGeometry.w / this.project.math.grid.reels;
    const rowHeight = this.reelGeometry.h / this.reelGeometry.maxRows;
    const points = positions.map(position => this.pointForPosition(position));
    let pointOffset = 0;
    const groups = positionGroups.map(group => {
      const mapped = points.slice(pointOffset, pointOffset + group.length);
      pointOffset += group.length;
      return mapped;
    });
    const effect = this.project.theme?.presentationEffects?.winConnections || {};
    const play = () => this.visualEffectRuntime?.playEnergyTaps(points, {
      color: effect.color || '#62e7ff',
      coreColor: effect.coreColor || '#ffffff',
      rimColor: effect.rimColor || '#d6a84b',
      origin: effect.origin || null,
      groups,
      launchDuration: Math.min(0.3, Number(effect.launchDuration) || 0.3),
      launchHold: Math.min(0.04, Number(effect.launchHold) || 0.04),
      hopDuration: Math.min(0.12, Number(effect.hopDuration) || 0.11),
      messengerSize: Math.min(36, Number(effect.messengerSize) || 32),
      impactSize: Math.min(34, Number(effect.impactSize) || 30),
      impactAlpha: Math.min(0.68, Number(effect.impactAlpha) || 0.58),
      messengerAssetId: effect.messengerAssetId || null,
      impactAssetId: effect.impactAssetId || null,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    });
    const result = play();
    if (!result) window.setTimeout(play, 120);
    return result;
  }

  renderWinOrbTaps(layer, wins, orbSrc) {
    this.killWinOrbTimelines();
    layer.replaceChildren();
    layer.classList.remove('is-visible');
    const reelWidth = this.reelGeometry.w / this.project.math.grid.reels;
    const rowHeight = this.reelGeometry.h / this.reelGeometry.maxRows;
    const orbSize = Math.max(36, Math.min(62, Math.min(reelWidth, rowHeight) * .62));
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    for (const [winIndex, win] of (wins || []).entries()) {
      const positions = [...(win.positions || [])].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (positions.length < 2) continue;
      const points = positions.map(([reel, row]) => ({
        x: this.reelGeometry.x + (reel + .5) * reelWidth,
        y: this.reelGeometry.y + (row + .5) * rowHeight,
      }));

      points.forEach((point, pointIndex) => {
        const marker = new Image();
        marker.className = 'preview-win-orb preview-win-orb-marker';
        marker.alt = '';
        marker.draggable = false;
        marker.src = orbSrc;
        marker.style.left = `${point.x}px`;
        marker.style.top = `${point.y}px`;
        marker.style.width = `${orbSize * .86}px`;
        marker.style.height = `${orbSize * .86}px`;
        marker.style.setProperty('--orb-delay', `${winIndex * 120 + pointIndex * 165}ms`);
        layer.appendChild(marker);
      });

      if (reducedMotion) continue;
      const traveler = new Image();
      traveler.className = 'preview-win-orb preview-win-orb-traveler';
      traveler.alt = '';
      traveler.draggable = false;
      traveler.src = orbSrc;
      traveler.style.width = `${orbSize}px`;
      traveler.style.height = `${orbSize}px`;
      layer.appendChild(traveler);

      const timeline = gsap.timeline({ delay: winIndex * .12 });
      timeline.set(traveler, { x: points[0].x, y: points[0].y, xPercent: -50, yPercent: -50, scale: .4, rotation: -10, opacity: 0 })
        .to(traveler, { scale: 1, rotation: 0, opacity: 1, duration: .14, ease: 'back.out(2)' });
      points.forEach((point, pointIndex) => {
        if (pointIndex) timeline.to(traveler, { x: point.x, y: point.y, duration: .2, ease: 'power2.inOut' }, '>-0.01');
        timeline.to(traveler, { scale: 1.24, filter: 'brightness(1.35)', duration: .075, ease: 'power2.out' })
          .to(traveler, { scale: .84, filter: 'brightness(1)', duration: .12, ease: 'power2.in' });
      });
      timeline.to(traveler, { scale: 1.18, opacity: 0, duration: .28, ease: 'power2.out' });
      this.winOrbTimelines.push(timeline);
    }

    layer.classList.toggle('is-visible', layer.childElementCount > 0);
  }

  killWinOrbTimelines() {
    for (const timeline of this.winOrbTimelines || []) timeline.kill();
    this.winOrbTimelines = [];
  }

  clearWinHighlights() {
    this.visualEffectRuntime?.cancelEnergyTaps?.();
    this.container.querySelectorAll('.win-highlight').forEach(el => {
      el.classList.remove('win-highlight');
    });
    this.container.querySelectorAll('.win-dimmed').forEach(el => el.classList.remove('win-dimmed'));
    const paths = this.container.querySelector('#previewWinPaths');
    if (paths) {
      paths.replaceChildren();
      paths.classList.remove('is-visible');
    }
    const orbs = this.container.querySelector('#previewWinOrbs');
    if (orbs) {
      this.killWinOrbTimelines();
      orbs.replaceChildren();
      orbs.classList.remove('is-visible');
    }
  }

  animateWinDisplay(totalWin) {
    const winEl = document.getElementById('hudWin');
    if (!winEl) return;

    gsap.fromTo(winEl, { scale: 1.5, color: '#ffd700' }, {
      scale: 1, color: '#00e5ff', duration: 0.6, ease: 'elastic.out(1, 0.4)'
    });

    if (totalWin >= 10) {
      const stage = document.getElementById('previewStage');
      if (stage) {
        gsap.fromTo(stage, { boxShadow: '0 0 60px rgba(255,215,0,0.8) inset' }, {
          boxShadow: '0 0 0px rgba(255,215,0,0) inset', duration: 1.5, ease: 'power2.out'
        });
      }
    }
  }

  updateHUD() {
    const bal = document.getElementById('hudBalance');
    const baseBet = document.getElementById('hudBaseBet');
    const bet = document.getElementById('hudBet');
    const win = document.getElementById('hudWin');
    const spin = document.getElementById('previewSpin');
    const auto = document.getElementById('previewAutoMenu');
    const autoCount = document.getElementById('hudAutoCount');
    if (bal) bal.textContent = this.balance.toFixed(2);
    if (baseBet) baseBet.textContent = this.baseBet.toFixed(2);
    if (bet) bet.textContent = `TOTAL ${this.bet.toFixed(2)}`;
    if (win) win.textContent = this.lastWin.toFixed(2);
    if (spin) spin.textContent = this.autoSpinsRemaining > 0 ? 'STOP' : 'SPIN';
    if (autoCount) autoCount.textContent = this.autoSpinsRemaining > 0 ? String(this.autoSpinsRemaining) : 'AUTO';
    auto?.classList.toggle('is-active', this.autoSpinsRemaining > 0);
    const betIndex = this.baseBetOptions.findIndex(value => Math.abs(value - this.baseBet) < 1e-9);
    const locked = this.spinning || this.autoSpinsRemaining > 0;
    const down = document.getElementById('previewBetDown');
    const up = document.getElementById('previewBetUp');
    if (down) down.disabled = locked || betIndex <= 0;
    if (up) up.disabled = locked || betIndex >= this.baseBetOptions.length - 1;
  }

  destroy() {
    this.disposed = true;
    this.cancelMorpheusDreamfallPreview('preview-destroyed');
    if (this.symbolMotionSyncFrame) cancelAnimationFrame(this.symbolMotionSyncFrame);
    this.symbolMotionSyncFrame = null;
    this.directorRuntime?.cancel('preview-destroyed');
    this.animationMountGeneration = (this.animationMountGeneration || 0) + 1;
    this.visualEffectMountGeneration += 1;
    this.activeSpinToken = null;
    window.clearTimeout(this.idlePerformanceTimer);
    window.clearTimeout(this.reactionReturnTimer);
    window.clearTimeout(this.autoSpinTimer);
    for (const interval of this.intervalIds) clearInterval(interval);
    this.intervalIds.clear();
    this.resizeObserver?.disconnect();
    this.spinTimeline?.kill();
    this.killWinOrbTimelines();
    this.spineRuntime?.destroy();
    this.visualEffectRuntime?.destroy();
    this.visualEffectRuntime = null;
    this.preloadedImages.clear();
    this.assetStatus.clear();
    this.audioEngine.stopAll();
    this.audioEngine.unload();
    gsap.killTweensOf(this.container.querySelectorAll('*'));
  }
}
