import { getAnimationCoverage, PRODUCTION_ANIMATION_STATES } from '../animation/AnimationProfiles.js';
import { validateAnimationConfig } from '../animation/AnimationEngine.js';
import { validateRigCorrections } from '../animation/RigCorrectionEngine.js';
import { validatePoseMechanics } from '../animation/PoseMechanicsEngine.js';
import { getProjectSpineMotionReview } from '../animation/SpineMotionReview.js';
import { getPresentationCoverage, validatePresentationDirector } from '../presentation/PresentationDirector.js';
import { getPresentationInterruptionSummary } from '../presentation/PresentationInterruptionQA.js';
import { getPresentationPolishSummary } from './PresentationPolishQA.js';
import { validateAppliedBlueprint } from '../blueprints/GameBlueprintEngine.js';
import { validateAppliedAssetPack } from '../assets/AssetPackEngine.js';
import { getVisualCohesionStatus } from '../assets/VisualAssetFactory.js';
import { getPerformanceProfileSummary } from './PerformanceProfiler.js';
import { getReplayMatrixSummary } from './ReplayMatrixQA.js';
import { getViewportLayoutSummary } from './ViewportLayoutQA.js';
import { getAssetIntegritySummary } from './AssetIntegrityQA.js';
import { getAudioMasteringSummary } from './AudioMasteringQA.js';
import { getPlayerInformationSummary } from './PlayerInformationQA.js';
import { getProjectRigStressSummary } from './RigStressQA.js';
import { getProjectRigCertificationSummary } from './RigCertificationQA.js';
import { getVisualCohesionQASummary } from './VisualCohesionQA.js';
import { getMathSDKContractFingerprint } from '../build/MathSDKExporter.js';
import {
  createProductionWorkflow,
  getFlagshipWorkflowSummary,
  normalizeProductionWorkflow,
} from '../factory/FlagshipWorkflow.js';
import { getFlagshipScenarioLabSummary } from './FlagshipScenarioLab.js';
import { getAssetOrchestrationSummary } from './AssetOrchestrationQA.js';

export const PROFESSIONAL_STANDARD_ID = 'stake-three-star';

export const QUALITY_CATEGORIES = {
  creative: { label: 'Creative Direction', panel: 'config' },
  visual: { label: 'Visual Cohesion', panel: 'cabinet' },
  animation: { label: 'Animation & Motion', panel: 'spine' },
  audio: { label: 'Audio Direction', panel: 'audio' },
  gameplay: { label: 'Gameplay Depth', panel: 'config' },
  platform: { label: 'Platform Experience', panel: 'preview' },
  performance: { label: 'Performance', panel: 'build' },
  release: { label: 'Release Integrity', panel: 'build' },
};

export function createProfessionalProductionProfile() {
  return {
    standard: PROFESSIONAL_STANDARD_ID,
    targetScore: 90,
    categoryFloor: 70,
    creative: {
      coreHook: '',
      signatureMoment: '',
      differentiators: [],
    },
    workflow: createProductionWorkflow(),
    rig: {
      corrections: [],
      boneLimits: [],
      drawOrderRules: [],
      anchors: [],
      secondaryMotion: [],
      motionReviews: {},
      stressAudits: {},
      certifications: {},
    },
    presentation: {
      interruptionAudit: null,
      polishAudit: null,
      reelChoreographyReviewed: false,
      winEscalationReviewed: false,
    },
    audio: {
      loudnessNormalized: false,
      synchronizationReviewed: false,
      duckingConfigured: false,
      masteringAudit: null,
    },
    qa: {
      visualCohesionAudit: null,
      desktopApproved: false,
      mobileApproved: false,
      miniApproved: false,
      deterministicReplayVerified: false,
      replayAudit: null,
      viewportAudit: null,
      assetIntegrityAudit: null,
      assetOrchestrationAudit: null,
      playerInformationAudit: null,
      performanceProfiled: false,
      performanceAudit: null,
      gameCertification: null,
      repairRun: null,
      assetIntegrityVerified: false,
    },
    budgets: {
      targetFps: 60,
      maxInitialBundleMb: 8,
      maxTextureMemoryMb: 96,
    },
  };
}

function mergeSection(base, incoming, key) {
  return { ...base[key], ...(incoming?.[key] || {}) };
}

export function normalizeProductionProfile(profile = {}) {
  const base = createProfessionalProductionProfile();
  const normalized = {
    ...base,
    ...profile,
    creative: mergeSection(base, profile, 'creative'),
    workflow: normalizeProductionWorkflow(profile.workflow || base.workflow),
    rig: mergeSection(base, profile, 'rig'),
    presentation: mergeSection(base, profile, 'presentation'),
    audio: mergeSection(base, profile, 'audio'),
    qa: mergeSection(base, profile, 'qa'),
    budgets: mergeSection(base, profile, 'budgets'),
  };
  delete normalized.qa.visualCohesionApproved;
  delete normalized.rig.correctionsNotNeeded;
  delete normalized.rig.poseMechanicsNotNeeded;
  return normalized;
}

export function applyProfessionalDefaults(project) {
  project.production = normalizeProductionProfile(project.production);
  project.production.standard = PROFESSIONAL_STANDARD_ID;
  project.production.targetScore = 90;
  project.production.categoryFloor = 70;
  project.production.budgets = {
    ...project.production.budgets,
    targetFps: 60,
    maxInitialBundleMb: 8,
    maxTextureMemoryMb: 96,
  };
  project.animation ||= {};
  project.animation.runtime ||= {};
  project.animation.runtime.profile ||= 'balanced';
  project.animation.runtime.reducedMotion = 'respect';
  project.atlas ||= {};
  project.atlas.padding = Math.max(2, Number(project.atlas.padding) || 0);
  project.atlas.maxSize = Math.min(4096, Math.max(1024, Number(project.atlas.maxSize) || 2048));
  project.build ||= {};
  project.build.simulations ||= {};
  project.build.simulations.base = Math.max(500000, Number(project.build.simulations.base) || 0);
  project.build.simulations.bonus = Math.max(125000, Number(project.build.simulations.bonus) || 0);
  return project.production;
}

const configured = value => Boolean(value && (typeof value !== 'string' || value.trim()));
const listCount = value => Array.isArray(value) ? value.filter(Boolean).length : 0;

function check(id, category, label, passed, options = {}) {
  return {
    id,
    category,
    label,
    passed: Boolean(passed),
    severity: options.severity || 'warning',
    evidence: options.evidence || '',
    remedy: options.remedy || '',
    panel: options.panel || QUALITY_CATEGORIES[category]?.panel || 'quality',
  };
}

function hasAudio(project, key) {
  const value = project.audio?.stingers?.[key];
  return Array.isArray(value) ? value.some(Boolean) : Boolean(value);
}

function hasPresentationAnimation(project) {
  const stateLayers = Object.values(project.animation?.states || {}).some(state => listCount(state?.layers) > 0);
  return stateLayers || listCount(project.animation?.spineAssets) > 0
    || Object.values(project.theme?.character?.poses || {}).some(Boolean);
}

export class QualityDirector {
  constructor(project) {
    this.project = project;
  }

  audit() {
    const project = this.project;
    const production = normalizeProductionProfile(project.production);
    const symbols = project.theme?.symbols || [];
    const cabinetLayers = project.theme?.cabinet?.layers || [];
    const spineAssets = project.animation?.spineAssets || [];
    const animationCoverage = getAnimationCoverage(project);
    const frontend = project.build?.frontend || {};
    const capabilities = frontend.capabilities || {};
    const mathPublish = project.build?.mathPublish || {};
    const betModes = project.math?.betModes || [];
    const checks = [];

    const replayMatrix = getReplayMatrixSummary(project);
    const flagship = getFlagshipWorkflowSummary(project);
    const flagshipScenarios = flagship.track === 'flagship' ? getFlagshipScenarioLabSummary(project) : null;
    const assetOrchestration = getAssetOrchestrationSummary(project);
    checks.push(
      check('creative-hook', 'creative', 'The game has a one-sentence player hook', configured(production.creative.coreHook), {
        severity: 'blocker', remedy: 'Write the immediate reason a player would choose this game over another.',
      }),
      check('creative-signature', 'creative', 'A signature gameplay or presentation moment is defined', configured(production.creative.signatureMoment), {
        severity: 'blocker', remedy: 'Define the moment players will remember and share.',
      }),
      check('creative-differentiation', 'creative', 'At least two concrete differentiators are documented', listCount(production.creative.differentiators) >= 2, {
        remedy: 'Document two specific differences that are visible or playable, not theme adjectives.',
      }),
      check('creative-world', 'creative', 'Art direction and world lore are established', configured(project.theme?.style) && configured(project.theme?.lore), {
        remedy: 'Complete the style and lore fields so every asset follows one world.',
      }),
    );

    if (flagship.track === 'flagship') {
      const preproductionIssues = Object.values(flagship.gates).filter(gate => !gate.complete);
      checks.push(
        check('flagship-preproduction', 'creative', 'Flagship vision and preproduction proof gates are complete', flagship.readyForProduction, {
          severity: 'blocker',
          evidence: `${flagship.completedGates}/${flagship.totalGates} vision, research, contract, capability, architecture, spike and vertical-slice gates`,
          remedy: preproductionIssues[0]?.message || 'Complete the Flagship preproduction workflow before production.',
          panel: 'build',
        }),
        check('flagship-no-degradation', 'gameplay', 'Unsupported mechanics cannot silently degrade into generic substitutes', flagship.policyEnforced && flagship.agentPolicyEnforced, {
          severity: 'blocker',
          evidence: flagship.policyEnforced && flagship.agentPolicyEnforced
            ? 'Capability tasks, explicit approval, bounded specialist ownership and accepted handoffs are mandatory'
            : 'No-degradation or specialty-agent coordination policy has been weakened',
          remedy: 'Restore capability-task escalation, explicit substitution approval, contract-first production, bounded single-writer ownership and the ban on automated scope reduction.',
          panel: 'build',
        }),
      );
      checks.push(check('flagship-scenario-lab', 'platform', 'Flagship mechanics and interactions have deterministic proof scenarios', flagshipScenarios.complete, {
        severity: 'blocker',
        evidence: `${flagshipScenarios.passing}/${flagshipScenarios.scenarios} scenarios pass · ${flagshipScenarios.interactions.covered}/${flagshipScenarios.interactions.requiredPairs} interaction pairs covered`,
        remedy: flagshipScenarios.failing.length
          ? `Run or repair: ${flagshipScenarios.failing.slice(0, 3).map(item => item.label || item.id).join(', ')}.`
          : 'Author deterministic signature, mechanic, interaction, edge and failure scenarios; disposition every mechanic pair.',
        panel: 'build',
      }));
      checks.push(check('flagship-asset-orchestration', 'animation', 'Every authoritative event has asset, effect, audio, collision and recovery proof', assetOrchestration.complete, {
        severity: 'blocker',
        evidence: assetOrchestration.fresh
          ? `${assetOrchestration.counts.choreographyDecisions || 0}/${assetOrchestration.counts.authoritativeEvents || 0} event decisions · ${assetOrchestration.counts.renderSamples || 0} rendered transform samples · ${assetOrchestration.counts.requiredInteractionPairs ?? assetOrchestration.counts.interactionPairs ?? 0} required mechanic pairs`
          : assetOrchestration.stale ? 'Stored asset-orchestration evidence is stale' : 'No governed asset-orchestration evidence',
        remedy: assetOrchestration.issues[0] || 'Inventory source/runtime/package lineage, bind every authoritative event to its visual/audio/recovery contract, and capture real viewport transform evidence.',
        panel: 'build',
      }));
    }

    const missingSymbolArt = symbols.filter(symbol => !symbol.src);
    const submissionAssets = project.theme?.submission || {};
    const visualCohesion = getVisualCohesionStatus(project);
    const visualCohesionQa = getVisualCohesionQASummary(project);
    const submissionReady = ['background', 'foreground', 'providerLogo'].filter(key => submissionAssets[key]).length;
    checks.push(
      check('visual-cabinet', 'visual', 'The cabinet has layered environmental artwork', cabinetLayers.length >= 2, {
        severity: 'blocker', evidence: `${cabinetLayers.length} cabinet layers`, remedy: 'Add at least background and foreground art layers.',
      }),
      check('visual-symbols', 'visual', 'Every symbol has final artwork', symbols.length > 0 && missingSymbolArt.length === 0, {
        severity: 'blocker', evidence: missingSymbolArt.length ? `${missingSymbolArt.length} symbols missing art` : `${symbols.length} symbols covered`, remedy: 'Replace every placeholder or empty symbol source.',
      }),
      check('visual-palette', 'visual', 'A production color palette is defined', listCount(project.theme?.colorPalette) >= 4, {
        remedy: 'Define at least four intentional palette colors for consistency and contrast.',
      }),
      check('visual-direction-bible', 'visual', 'A locked Art Direction Bible governs generated assets', visualCohesion.ready && visualCohesion.driftedAssignments.length === 0, {
        severity: 'blocker',
        evidence: visualCohesion.ready
          ? `${visualCohesion.currentFingerprint} · ${visualCohesion.generatedAssignments} generated assignments`
          : visualCohesion.bibleDrift ? 'Bible changed after it was locked' : `${visualCohesion.validation.completed}/${visualCohesion.validation.total} direction fields complete`,
        remedy: 'Open Atlas, complete and lock the Art Direction Bible, then regenerate any assignments from an older Bible.',
      }),
      check('visual-automated-qa', 'visual', 'Generated assignments passed deterministic visual QA', visualCohesion.automatedQaFailed.length === 0, {
        severity: 'blocker',
        evidence: visualCohesion.automatedQaFailed.length
          ? `${visualCohesion.automatedQaFailed.length} generated assignment${visualCohesion.automatedQaFailed.length === 1 ? '' : 's'} missing a passing report`
          : `${visualCohesion.automatedQaPassed} generated assignments passed`,
        remedy: 'Open Atlas and replace any generated asset that fails local alpha, crop, contrast, palette, or reference-continuity checks.',
      }),
      check('visual-review', 'visual', 'The complete visual pack passes cohesion QA', visualCohesionQa.complete, {
        severity: 'blocker',
        evidence: visualCohesionQa.complete
          ? `${visualCohesionQa.passedAssets}/${visualCohesionQa.totalAssets} assets · evidence ${visualCohesionQa.fingerprint}`
          : visualCohesionQa.stale ? 'Visual Pack QA evidence is stale' : `${visualCohesionQa.passedAssets}/${visualCohesionQa.totalAssets} assets currently pass`,
        remedy: 'Open Atlas and run Visual Pack QA. Correct every palette, role, readability, framing, reference, or identity failure.',
        panel: 'atlas',
      }),
      check('visual-submission', 'visual', 'Stake submission artwork is complete', submissionReady === 3, {
        severity: 'blocker', evidence: `${submissionReady}/3 background, foreground and provider logo assets`, remedy: 'Import or assign the required Stake submission background, foreground and provider logo.',
      }),
    );

    const hasSpine = spineAssets.length > 0;
    const animationRuntimeErrors = validateAnimationConfig(project).filter(issue => issue.severity === 'error');
    const rigCorrectionIssues = validateRigCorrections(project).filter(issue => issue.severity === 'error');
    const enabledRigCorrections = (production.rig.corrections || []).filter(correction => correction.enabled !== false).length;
    const poseMechanicIssues = validatePoseMechanics(project).filter(issue => issue.severity === 'error');
    const enabledPoseMechanics = [
      ...(production.rig.drawOrderRules || []),
      ...(production.rig.anchors || []),
      ...(production.rig.secondaryMotion || []),
    ].filter(item => item.enabled !== false).length;
    const motionReview = getProjectSpineMotionReview(project);
    const rigStress = getProjectRigStressSummary(project);
    const rigCertification = getProjectRigCertificationSummary(project);
    const rigCorrectionsCovered = !hasSpine || (
      rigStress.complete && rigStress.correctionRequired === 0 && rigCorrectionIssues.length === 0
    );
    const poseMechanicsCovered = !hasSpine || (
      rigStress.complete && rigStress.poseMechanicsRequired === 0 && poseMechanicIssues.length === 0
    );
    const animationCovered = hasSpine
      ? animationCoverage.productionPercent === 100
      : PRODUCTION_ANIMATION_STATES.every(state => listCount(project.animation?.states?.[state]?.layers) > 0);
    const directorCoverage = getPresentationCoverage(project);
    const directorIssues = validatePresentationDirector(project).filter(issue => issue.severity === 'error');
    const directorReady = directorCoverage.percent === 100 && directorIssues.length === 0;
    const interruptionQa = getPresentationInterruptionSummary(project);
    const presentationPolish = getPresentationPolishSummary(project);
    checks.push(
      check('animation-present', 'animation', 'The game has authored presentation animation', hasPresentationAnimation(project), {
        severity: 'blocker', remedy: 'Add a Spine rig, character poses, or state animation layers.',
      }),
      check('animation-choreography', 'animation', 'Core production states resolve to animation', animationCovered, {
        severity: 'blocker', evidence: hasSpine ? `${animationCoverage.productionPercent}% production Spine coverage` : 'State-layer choreography', remedy: 'Cover idle, spin, win, anticipation, bonus and wincap states.',
      }),
      check('animation-runtime-contract', 'animation', 'Spine exports satisfy the runtime and rig audit', !hasSpine || animationRuntimeErrors.length === 0, {
        severity: 'blocker', evidence: hasSpine ? `${animationRuntimeErrors.length} blocking import or runtime issue${animationRuntimeErrors.length === 1 ? '' : 's'}` : 'No Spine character rig', remedy: 'Open Spine, repair version, atlas-region, mesh, skin, or mapping errors shown by the Pro Rig Audit, then reimport the complete bundle.',
      }),
      check('animation-rig-corrections', 'animation', 'Extreme rig poses have corrective deformation evidence', rigCorrectionsCovered, {
        severity: 'blocker', evidence: hasSpine ? `${rigStress.correctionRequired} residual pixel findings · ${enabledRigCorrections} active corrections · ${rigCorrectionIssues.length} invalid${rigStress.stale ? ' · stale evidence' : ''}` : 'No Spine character rig', remedy: 'Run Spine → Pixel Deformation Audit. If it detects collapse, bloat, gaps, fragmentation or aspect damage, add angle-driven correction art or attachment swaps and rerun until the rendered pixels pass.',
      }),
      check('animation-pose-mechanics', 'animation', 'Layering, anchors and secondary motion are accounted for', poseMechanicsCovered, {
        severity: 'blocker', evidence: hasSpine ? `${rigStress.poseMechanicsRequired} residual position/clipping findings · ${enabledPoseMechanics} active mechanics · ${poseMechanicIssues.length} invalid${rigStress.stale ? ' · stale evidence' : ''}` : 'No Spine character rig', remedy: 'Run Spine → Pixel Deformation Audit. If the silhouette drifts or clips, add anchors, draw-order rules or secondary motion and rerun until the rendered pixels pass.',
      }),
      check('animation-director', 'animation', 'Stake events resolve through reusable presentation recipes', directorReady, {
        severity: 'blocker', evidence: `${directorCoverage.percent}% core event coverage · ${directorIssues.length} invalid`, remedy: 'Open Preview → Director and restore or author complete event recipes.',
      }),
      check('animation-rig-stress', 'animation', 'The rig has passed one-click production certification', !hasSpine || rigCertification.complete, {
        severity: 'blocker',
        evidence: hasSpine ? `${motionReview.passed}/${motionReview.total} animation/skin cases · ${rigCertification.motionFrames} motion frames · ${rigStress.passed}/${rigStress.total} bone/state sweeps · ${rigCertification.stressRenders} stress renders${rigCertification.stale ? ' · stale certification' : ''}` : 'No Spine character rig',
        remedy: 'Open Spine and run Certify Rig. Repair the unified structural, motion, loop, event, clipping or deformation findings, then rerun the single certification action.',
      }),
      check('animation-interruption', 'animation', 'Every presentation can be interrupted safely', interruptionQa.complete, {
        severity: 'blocker',
        evidence: `${interruptionQa.passed}/${interruptionQa.total} executable solo, cancellation and policy cases passed${interruptionQa.stale ? ' · stale choreography evidence' : ''}`,
        remedy: 'Open Preview → Director and run the Transition Torture Test.',
      }),
      check('animation-escalation', 'animation', 'Reel choreography and win escalation pass measured polish QA', presentationPolish.complete, {
        severity: 'blocker',
        evidence: presentationPolish.complete ? `${presentationPolish.reels.stopGapsMs.join('/')}ms stop gaps · ${presentationPolish.wins.authoredTiers}/4 authored win tiers` : presentationPolish.stale ? 'Stored presentation-polish evidence is stale' : presentationPolish.fresh ? `${presentationPolish.issues.length} measured timing issues` : 'No presentation-polish audit recorded',
        remedy: 'Open Preview → Director and run Automated QA to verify stop cadence, anticipation timing, tier-specific motion and non-truncated win durations.',
      }),
    );

    const coreAudio = ['spinStart', 'reelStop', 'winSmall', 'bonusTrigger'];
    const missingCoreAudio = coreAudio.filter(key => !hasAudio(project, key));
    const audioMastering = getAudioMasteringSummary(project);
    checks.push(
      check('audio-bed', 'audio', 'Music or ambience establishes the world', Boolean(project.audio?.layers?.baseMusic || project.audio?.layers?.ambience), {
        severity: 'blocker', remedy: 'Add a base music or ambience layer.',
      }),
      check('audio-events', 'audio', 'Core gameplay events have sound', missingCoreAudio.length === 0, {
        severity: 'blocker', evidence: missingCoreAudio.length ? `Missing: ${missingCoreAudio.join(', ')}` : 'Core event set covered', remedy: 'Cover spin start, reel stop, small win and bonus trigger.',
      }),
      check('audio-loudness', 'audio', 'Every audio asset passes measured mastering QA', audioMastering.loudness.passed && audioMastering.fresh, {
        evidence: audioMastering.fresh ? `${audioMastering.decodedAssets}/${audioMastering.totalAssets} decoded · ${audioMastering.loudness.issues.length} mastering issues` : audioMastering.stale ? 'Stored mastering evidence is stale' : 'No mastering audit recorded',
        remedy: 'Open Audio and run Mastering Audit to measure loudness, clipping, silence, DC offset, channels and sample rate.',
      }),
      check('audio-sync', 'audio', 'Important impacts have structurally synchronized audio cues', audioMastering.synchronization.passed && audioMastering.fresh, {
        severity: 'blocker', evidence: audioMastering.fresh ? `${audioMastering.synchronization.checked} critical recipes checked` : 'No current cue-timing evidence', remedy: 'Run Audio Mastering Audit, then repair any critical Presentation Director cue more than 120ms from its visual impact.',
      }),
      check('audio-ducking', 'audio', 'Music ducking meets the production mix contract', audioMastering.ducking.passed && audioMastering.fresh, {
        evidence: audioMastering.fresh ? (audioMastering.ducking.passed ? 'Depth, timing, event coverage and voice routing passed' : `${audioMastering.ducking.issues.length} ducking issues`) : 'No current ducking evidence', remedy: 'Use Audio Director to configure production-range depth, attack, release, event coverage and voice ducking, then rerun the audit.',
      }),
    );

    const freespinAwards = Object.values(project.math?.freespinTriggers?.basegame || {}).some(value => Number(value) > 0);
    const playerInformation = getPlayerInformationSummary(project);
    checks.push(
      check('gameplay-feature', 'gameplay', 'The game includes meaningful feature depth', listCount(project.math?.bonusMechanics) > 0 || betModes.length > 1, {
        severity: 'blocker', remedy: 'Add an executable bonus mechanic or meaningfully distinct wager mode.',
      }),
      check('gameplay-trigger', 'gameplay', 'Feature access and awards are configured', freespinAwards || betModes.some(mode => mode.name !== 'base' && mode.profile), {
        severity: 'blocker', remedy: 'Configure a reachable feature trigger and its award.',
      }),
      check('gameplay-wincap', 'gameplay', 'The maximum win has an explicit executable path', Number(project.math?.maxWinHitRate) > 0 || Number(project.math?.wincapRtp) > 0, {
        severity: 'blocker', remedy: 'Configure a maximum-win hit rate or RTP allocation and verify the outcome is reachable.',
      }),
      check('gameplay-rules', 'gameplay', 'Rules, payouts, modes and disclaimer are generated and verified', playerInformation.complete, {
        severity: 'blocker',
        evidence: playerInformation.fresh
          ? `${playerInformation.manifest.symbols.length} symbols · ${playerInformation.manifest.modes.length} modes · ${playerInformation.manifest.disclosures.length} disclosures`
          : playerInformation.stale ? 'Stored player-information evidence is stale after game rules changed' : 'No player-information audit recorded',
        remedy: playerInformation.fresh && playerInformation.issues.length
          ? playerInformation.issues.join(' ')
          : 'Open Preview → Game Info and run Audit Player Info.',
      }),
    );

    const requiredCapabilities = ['walletLifecycle', 'replay', 'jurisdiction', 'serverOwnedBalance', 'responsive'];
    const missingCapabilities = requiredCapabilities.filter(key => !capabilities[key]);
    const viewportLayout = getViewportLayoutSummary(project);
    checks.push(
      check('platform-frontend', 'platform', 'Stake frontend capabilities are implemented', configured(frontend.entry) && listCount(frontend.files) > 0 && missingCapabilities.length === 0, {
        severity: 'blocker', evidence: missingCapabilities.length ? `Missing: ${missingCapabilities.join(', ')}` : 'Capability contract covered', remedy: 'Package the frontend and satisfy every wallet, replay, jurisdiction and responsive capability.',
      }),
      check('platform-viewports', 'platform', 'Desktop, mobile and mini layouts meet safe-zone budgets', viewportLayout.complete, {
        severity: 'blocker',
        evidence: viewportLayout.fresh
          ? `${viewportLayout.samples.map(sample => `${sample.viewport} ${sample.spin.width.toFixed(0)}×${sample.spin.height.toFixed(0)}px control`).join(' · ')}`
          : viewportLayout.stale ? 'Layout evidence is stale after a cabinet, grid, art, animation, or choreography change' : 'No measured desktop/mobile/mini layout audit',
        remedy: 'Open Preview and run Layout to measure cropping, overflow, target sizes, symbol legibility, HUD text, and control collisions.',
      }),
      check('platform-replay', 'platform', 'Deterministic bet replay is verified', replayMatrix.complete, {
        severity: 'blocker',
        evidence: replayMatrix.fresh
          ? `${replayMatrix.passed}/${replayMatrix.total} replay cases · ${replayMatrix.presentationCases} journeys · ${replayMatrix.mathCases} seeded rounds`
          : replayMatrix.stale ? 'Replay evidence is stale after a math, choreography, animation, or audio change' : 'No deterministic replay matrix',
        remedy: 'Open Preview and run Rehearse to prove loss, win, big-win, bonus, wincap and seeded math replay paths.',
      }),
      check('platform-reduced-motion', 'platform', 'Reduced-motion preferences are respected', project.animation?.runtime?.reducedMotion === 'respect', {
        remedy: 'Keep the runtime reduced-motion policy set to respect.',
      }),
    );

    const totalFrontendBytes = Number(frontend.totalBytes) || 0;
    const initialFrontendBytes = Number(frontend.initialBytes) || totalFrontendBytes;
    const bundleBudgetBytes = Number(production.budgets.maxInitialBundleMb) * 1024 * 1024;
    const performanceProfile = getPerformanceProfileSummary(project);
    const assetIntegrity = getAssetIntegritySummary(project);
    checks.push(
      check('performance-profile', 'performance', 'All production viewports meet the performance budget', performanceProfile.complete, {
        severity: 'blocker',
        evidence: performanceProfile.fresh
          ? `${performanceProfile.samples.map(sample => `${sample.viewport} ${sample.fps.toFixed(0)}fps`).join(' · ')} · peak textures ${(performanceProfile.peakTextureBytes / 1024 / 1024).toFixed(1)}MB`
          : performanceProfile.stale ? 'Performance evidence is stale after an asset or choreography change' : 'No measured desktop/mobile/mini profile',
        remedy: 'Open Preview and run Profile across desktop, mobile and mini; repair frame pacing or texture-memory failures.',
      }),
      check('performance-assets', 'performance', 'Asset integrity and atlas edges are verified', assetIntegrity.complete, {
        severity: 'blocker',
        evidence: assetIntegrity.fresh
          ? `${assetIntegrity.passedAssets}/${assetIntegrity.totalAssets} assignments · ${(assetIntegrity.decodedBytes / 1024 / 1024).toFixed(1)}MB decoded · atlas ${assetIntegrity.atlasReady ? 'safe' : 'blocked'}`
          : assetIntegrity.stale ? 'Asset evidence is stale after an art, atlas, Spine-page, or texture-budget change' : 'No decoded production-asset audit',
        remedy: 'Open Atlas and run Integrity Audit; repair missing files, undersized art, unsafe alpha, atlas padding, format, or texture-memory failures.',
      }),
      check('performance-bundle', 'performance', 'Initial frontend bundle is within budget', initialFrontendBytes > 0 && initialFrontendBytes <= bundleBudgetBytes, {
        severity: 'blocker',
        evidence: initialFrontendBytes
          ? `${(initialFrontendBytes / 1024 / 1024).toFixed(2)} MB initial / ${production.budgets.maxInitialBundleMb} MB · ${(totalFrontendBytes / 1024 / 1024).toFixed(2)} MB complete package`
          : 'No measured initial bundle size',
        remedy: 'Build the frontend and record its first-frame shell and deferred asset byte sizes.',
      }),
    );

    let currentMathContract = null;
    try { currentMathContract = getMathSDKContractFingerprint(project); } catch { /* compiler readiness is reported elsewhere */ }
    const mathContractFresh = Boolean(currentMathContract && mathPublish.contractFingerprint === currentMathContract);
    const productionMathReady = Number(mathPublish.totalBooks) > 0
      && mathPublish.officialVerification
      && mathPublish.fullStreamIntegrity
      && mathContractFresh
      && betModes.every(mode => (mathPublish.modes || []).includes(mode.name));
    const providerNumber = Number(project.build?.stakeEngine?.providerNumber);
    const blueprintValidation = validateAppliedBlueprint(project);
    const assetPackValidation = validateAppliedAssetPack(project);
    checks.push(
      check('release-identity', 'release', 'Game and provider identity are complete', configured(project.build?.stakeEngine?.gameId) && configured(project.build?.stakeEngine?.providerName) && Number.isSafeInteger(providerNumber) && providerNumber >= 0, {
        severity: 'blocker', remedy: 'Set the final game ID and provider name. Use provider number 0 until Stake assigns the team number.',
      }),
      check('release-math', 'release', 'Production math books pass official verification', productionMathReady, {
        severity: 'blocker',
        evidence: mathContractFresh
          ? `${Number(mathPublish.totalBooks || 0).toLocaleString()} verified books · executable contract ${currentMathContract}`
          : `${Number(mathPublish.totalBooks || 0).toLocaleString()} stored books · stale or missing executable contract`,
        remedy: 'Generate, optimize and verify books/LUTs for every mode after the latest mechanic change.',
      }),
      check('release-simulation', 'release', 'Production simulation budgets meet the studio standard', Number(project.build?.simulations?.base) >= 500000 && Number(project.build?.simulations?.bonus) >= 125000, {
        severity: 'blocker', remedy: 'Use at least 500k base and 125k bonus simulations before optimization.',
      }),
      check('release-standard', 'release', 'The project targets the professional three-star standard', production.standard === PROFESSIONAL_STANDARD_ID, {
        severity: 'blocker', remedy: 'Apply the Professional Factory defaults.',
      }),
      check('release-blueprint', 'release', 'Applied factory blueprint provenance is valid', !blueprintValidation.applied || blueprintValidation.valid, {
        severity: 'blocker',
        evidence: blueprintValidation.applied
          ? `${project.blueprint.id}${blueprintValidation.drift.length ? ` · ${blueprintValidation.drift.length} intentional edit${blueprintValidation.drift.length === 1 ? '' : 's'}` : ' · unchanged contract'}`
          : 'Custom project — no blueprint contract',
        remedy: 'Recompile the blueprint from Game Config, or deliberately continue as a custom project after removing stale provenance.',
      }),
      check('release-asset-pack', 'release', 'Applied asset-pack bindings are intact', !assetPackValidation.applied || assetPackValidation.valid, {
        severity: 'blocker',
        evidence: assetPackValidation.applied ? `${project.assetPack.bindings?.length || 0} recorded bindings` : 'Manual asset workflow',
        remedy: 'Recompile the Theme / Asset Pack or repair the missing binding before release.',
      }),
    );

    if (flagship.track === 'flagship') {
      checks.push(check('release-vision-fidelity', 'release', 'Every approved flagship promise has final cross-discipline evidence', flagship.fidelity.complete, {
        severity: 'blocker',
        evidence: `${flagship.fidelity.proven}/${flagship.fidelity.total} promises proven or explicitly approved as changed`,
        remedy: flagship.fidelity.unresolved.length
          ? `Complete evidence for: ${flagship.fidelity.unresolved.slice(0, 3).map(entry => entry.title || entry.id || 'unnamed promise').join(', ')}.`
          : 'Add the approved promises to the Vision Fidelity Ledger and prove each through math, events, frontend, presentation, Game Info and replay.',
        panel: 'build',
      }));
    }

    const categories = Object.entries(QUALITY_CATEGORIES).map(([id, meta]) => {
      const categoryChecks = checks.filter(item => item.category === id);
      const passed = categoryChecks.filter(item => item.passed).length;
      return {
        id,
        ...meta,
        score: categoryChecks.length ? Math.round(passed / categoryChecks.length * 100) : 0,
        passed,
        total: categoryChecks.length,
        blockers: categoryChecks.filter(item => !item.passed && item.severity === 'blocker').length,
        checks: categoryChecks,
      };
    });
    const score = Math.round(categories.reduce((sum, category) => sum + category.score, 0) / categories.length);
    const blockers = checks.filter(item => !item.passed && item.severity === 'blocker');
    const warnings = checks.filter(item => !item.passed && item.severity !== 'blocker');
    const weakCategories = categories.filter(category => category.score < production.categoryFloor);
    const releaseReady = score >= production.targetScore && blockers.length === 0 && weakCategories.length === 0;

    return {
      standard: production.standard,
      score,
      targetScore: production.targetScore,
      categoryFloor: production.categoryFloor,
      releaseReady,
      blockers,
      warnings,
      weakCategories,
      categories,
      checks,
      animationCoverage,
      summary: releaseReady
        ? 'Professional quality gate passed across every discipline.'
        : `${blockers.length} blocker${blockers.length === 1 ? '' : 's'} · ${warnings.length} improvement${warnings.length === 1 ? '' : 's'} · ${weakCategories.length} discipline${weakCategories.length === 1 ? '' : 's'} below floor`,
    };
  }
}
