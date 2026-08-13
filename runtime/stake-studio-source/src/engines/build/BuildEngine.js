import { MathEngine } from '../math/MathEngine.js';
import { SeededRNG } from '../math/SeededRNG.js';
import { getMathSDKContractFingerprint, MathSDKExporter } from './MathSDKExporter.js';
import { getExecutableWinType } from '../math/WinTypeEngine.js';
import { animationRuntimeFingerprint, createAnimationManifest, validateAnimationConfig } from '../animation/AnimationEngine.js';
import { generateAnimationFiles } from '../animation/AnimationExporter.js';
import { validateRigCorrections } from '../animation/RigCorrectionEngine.js';
import { validatePoseMechanics } from '../animation/PoseMechanicsEngine.js';
import { QualityDirector } from '../quality/QualityDirector.js';
import { evaluateStakeApprovalEconomics } from '../quality/StakeApprovalProfile.js';
import { auditMorpheusProjectContract } from '../morpheus/MorpheusProjectContract.js';
import { explicitMaximumWinHitRate, maximumWinOddsForMode } from '../math/MaximumWinPolicy.js';
import { createPresentationDirectorManifest, validatePresentationDirector } from '../presentation/PresentationDirector.js';
import { createBlueprintManifest, validateAppliedBlueprint } from '../blueprints/GameBlueprintEngine.js';
import { createAssetPackManifest, validateAppliedAssetPack } from '../assets/AssetPackEngine.js';
import { createArtDirectionManifest } from '../assets/VisualAssetFactory.js';
import { visualEffectsFingerprint } from '../animation/VisualEffectRecipes.js';
import {
  createProductionWorkflowManifest,
  validateProductionWorkflow,
} from '../factory/FlagshipWorkflow.js';

export function publishedRtpAuthority(project, currentMathContract, mode) {
  const publish = project?.build?.mathPublish || {};
  const report = (publish.modeReports || []).find(candidate => (
    (candidate.mode || candidate.name) === mode?.name
  ));
  const declaredRtp = Number(mode?.rtp ?? project?.math?.rtp);
  const exactRtp = Number(report?.exactRtp);
  const fresh = Number(publish.totalBooks) > 0
    && publish.profile === 'production'
    && publish.officialVerification === true
    && publish.fullStreamIntegrity === true
    && publish.rtpAligned === true
    && publish.contractFingerprint === currentMathContract
    && (publish.modes || []).includes(mode?.name)
    && Number.isFinite(exactRtp)
    && Number.isFinite(declaredRtp)
    && Math.abs(exactRtp - declaredRtp) <= 1e-12;
  return { fresh, exactRtp, declaredRtp, report: report || null };
}

export class BuildEngine {
  constructor(project) {
    this.project = project;
    this.mathEngine = new MathEngine(project);
  }

  validate() {
    const errors = [];
    const m = this.project.math;
    const b = this.project.build;

    for (const issue of validateProductionWorkflow(this.project, { release: true })) errors.push(issue);

    if (!b.stakeEngine.gameId) errors.push('Missing game ID');
    if (!b.stakeEngine.providerName) errors.push('Missing provider name');
    const providerNumber = Number(b.stakeEngine.providerNumber);
    if (!Number.isSafeInteger(providerNumber) || providerNumber <= 0) {
      errors.push('Provider number must be the positive integer assigned to the signed-in Stake Engine team');
    }
    if (m.rtp < 0.92 || m.rtp > 0.965) errors.push(`RTP ${m.rtp} outside Stake range (92%-96.5%)`);
    const wincapRtp = Number(m.wincapRtp) || 0;
    const explicitMaxHitRate = explicitMaximumWinHitRate(m);
    if (!(wincapRtp > 0) && explicitMaxHitRate === null) errors.push('No explicit max-win hit rate, RTP allocation, or executable max-win path');
    if (wincapRtp > 0.01) errors.push(`Max-win RTP allocation ${(wincapRtp * 100).toFixed(3)}% is implausibly high`);
    if (!m.betModes || m.betModes.length === 0) errors.push('No bet modes configured');
    if ((this.project.theme.symbols || []).length === 0) errors.push('No symbols defined');
    if (!getExecutableWinType(m.gameType)) {
      errors.push(`Game type "${m.gameType}" is available for prototyping but does not yet have a production math-sdk compiler`);
    }

    const frontend = b.frontend || {};
    if (!frontend.entry) errors.push('Missing packaged Stake frontend entry point');
    if (!Array.isArray(frontend.files) || frontend.files.length === 0) errors.push('Packaged Stake frontend has no file manifest');
    const requiredCapabilities = {
      walletLifecycle: 'wallet lifecycle',
      replay: 'mandatory replay',
      jurisdiction: 'jurisdiction controls',
      serverOwnedBalance: 'server-owned balance',
      responsive: 'responsive desktop/mobile/mini layout',
    };
    for (const [key, label] of Object.entries(requiredCapabilities)) {
      if (!frontend.capabilities?.[key]) errors.push(`Stake frontend is missing ${label} support`);
    }
    const enabledVisualEffectBindings = (this.project.animation?.visualEffects?.bindings || []).filter(binding => binding.enabled !== false);
    if (enabledVisualEffectBindings.length) {
      const verification = frontend.verification?.visualEffects;
      const fingerprint = visualEffectsFingerprint(this.project.animation.visualEffects);
      if (!verification?.runtimeBundled) errors.push('Stake frontend is missing the configured visual-effects runtime');
      if (verification?.fingerprint !== fingerprint) errors.push('Stake frontend visual-effects package is stale; recompile the frontend');
    }
    if (Object.keys(this.project.animation?.stateAnimations || {}).length) {
      const verification = frontend.verification?.spine;
      const fingerprint = animationRuntimeFingerprint(this.project);
      if (!verification?.runtimeBundled || !verification?.manifestBundled) errors.push('Stake frontend is missing the configured Spine runtime package');
      if (verification?.fingerprint !== fingerprint) errors.push('Stake frontend Spine package is stale; recompile the frontend');
    }

    const mathPublish = b.mathPublish || {};
    let currentMathContract = null;
    try {
      currentMathContract = getMathSDKContractFingerprint(this.project);
    } catch (error) {
      errors.push(`Production math contract could not be compiled: ${error.message}`);
    }
    if (!(Number(mathPublish.totalBooks) > 0)) errors.push('No production math books are staged for release');
    if (!mathPublish.officialVerification) errors.push('Production math has not passed the official RGS verifier');
    if (!mathPublish.fullStreamIntegrity) errors.push('Production math has not passed full book/LUT integrity verification');
    if (Number(mathPublish.totalBooks) > 0 && !mathPublish.rtpAligned) errors.push('Published LUT RTP is not aligned with every declared wager-mode target');
    if (Number(mathPublish.totalBooks) > 0 && mathPublish.contractFingerprint !== currentMathContract) {
      errors.push('Production math books are stale for the current executable mechanics; regenerate and verify them');
    }
    const publishedModes = new Set(mathPublish.modes || []);
    for (const mode of m.betModes || []) {
      if (!publishedModes.has(mode.name)) errors.push(`Production math is missing mode "${mode.name}"`);
    }

    for (const mode of m.betModes || []) {
      if (mode.releaseGated !== true && mode.entryPolicy !== 'natural' && mode.cost <= 0) errors.push(`Bet mode "${mode.name}" has invalid cost`);
      if (mode.rtp < 0.8 || mode.rtp > 0.99) errors.push(`Bet mode "${mode.name}" RTP out of range`);
      if (mode.name !== 'base' && !mode.profile) errors.push(`Bet mode "${mode.name}" has no executable mechanic profile`);
    }
    errors.push(...evaluateStakeApprovalEconomics(this.project).issues);
    if (b.stakeEngine.gameId === 'morpheus_dreamfall') {
      errors.push(...auditMorpheusProjectContract(this.project).issues.map(issue => `Morpheus approved contract: ${issue}`));
    }

    const baseMode = (m.betModes || []).find(mode => mode.name === 'base') || m.betModes?.[0];
    if (baseMode && (wincapRtp > 0 || explicitMaxHitRate !== null) && m.wincap > 0) {
      const odds = maximumWinOddsForMode(m, baseMode);
      if (!Number.isFinite(odds) || odds > 10000000) {
        errors.push(`Max win is less frequent than Stake's 1-in-10,000,000 reachability requirement`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  validateReadiness({ rounds = 50000, seed = 0x51a7e, rtpTolerance = 0.01 } = {}) {
    const structural = this.validate();
    const issues = [];
    const project = this.project;
    const quality = new QualityDirector(project).audit();
    const symbols = project.theme?.symbols || [];
    const cabinetLayers = project.theme?.cabinet?.layers || [];
    let currentMathContract = null;
    try {
      currentMathContract = getMathSDKContractFingerprint(project);
    } catch {
      // Structural validation reports an uncompileable contract. The local
      // simulation remains blocking when no fresh published authority exists.
    }

    if (cabinetLayers.length === 0) {
      issues.push({ severity: 'error', category: 'presentation', message: 'Cabinet has no visual layers — Preview cannot render a playable game.' });
    }

    for (const symbol of symbols) {
      const hasPayout = Object.values(symbol.payouts || {}).some(value => Number(value) > 0);
      const hasBehavior = (symbol.special || []).length > 0;
      if (!symbol.src) {
        issues.push({ severity: 'error', category: 'asset', message: `Symbol "${symbol.name}" has no artwork source.` });
      }
      if (symbol.tier === 'special' && !hasPayout && !hasBehavior) {
        issues.push({ severity: 'error', category: 'symbol', message: `Special symbol "${symbol.name}" has no payout or special behavior.` });
      }
    }

    const audio = project.audio || {};
    const audioValues = [
      ...Object.values(audio.layers || {}),
      ...Object.values(audio.stingers || {}).flatMap(value => Array.isArray(value) ? value : [value]),
    ].filter(Boolean);
    if (audioValues.length === 0) {
      issues.push({ severity: 'warning', category: 'audio', message: 'No music, ambience, or sound effects are configured.' });
    }

    const animationStates = Object.values(project.animation?.states || {});
    const characterPoses = Object.values(project.theme?.character?.poses || {}).filter(Boolean);
    const hasAnimation = animationStates.some(state => (state.layers || []).length > 0)
      || Object.keys(project.animation?.stateAnimations || {}).length > 0
      || characterPoses.length > 0;
    if (!hasAnimation) {
      issues.push({ severity: 'warning', category: 'animation', message: 'No animation layers or Spine assets are configured.' });
    }
    issues.push(...validateAnimationConfig(project));
    issues.push(...validateRigCorrections(project));
    issues.push(...validatePoseMechanics(project));
    issues.push(...validatePresentationDirector(project));
    const blueprintValidation = validateAppliedBlueprint(project);
    for (const message of blueprintValidation.issues) {
      issues.push({ severity: 'error', category: 'blueprint', message });
    }
    for (const message of blueprintValidation.drift) {
      issues.push({ severity: 'warning', category: 'blueprint-drift', message: `Blueprint contract drift: ${message}.` });
    }
    const assetPackValidation = validateAppliedAssetPack(project);
    for (const message of assetPackValidation.issues) {
      issues.push({ severity: 'error', category: 'asset-pack', message });
    }
    for (const message of assetPackValidation.drift) {
      issues.push({ severity: 'warning', category: 'asset-pack-drift', message: `Asset pack drift: ${message}.` });
    }

    if (!quality.releaseReady) {
      issues.push({
        severity: 'error',
        category: 'professional-quality',
        message: `Professional Quality gate is not satisfied: ${quality.summary}.`,
      });
    }

    const simulations = [];
    for (const [modeIndex, mode] of (project.math.betModes || []).entries()) {
      const modeSeed = (seed + Math.imul(modeIndex + 1, 0x9e3779b1)) >>> 0;
      const rng = new SeededRNG(modeSeed);
      const rand = () => rng.random();
      let paid = 0;
      let wagered = 0;
      let hits = 0;
      let maxWin = 0;
      let meanReturn = 0;
      let m2 = 0;
      let invalidPayouts = 0;
      const invalidPayoutSamples = [];
      for (let i = 0; i < rounds; i++) {
        const round = this.mathEngine.resolveRound(rand, mode.name);
        const value = round.normalizedWin;
        const payoutUnits = Math.round(round.totalWin * 100);
        if (payoutUnits !== 0 && (payoutUnits < 10 || payoutUnits % 10 !== 0)) {
          invalidPayouts++;
          if (invalidPayoutSamples.length < 5) invalidPayoutSamples.push(payoutUnits);
        }
        paid += round.totalWin;
        wagered += round.wager;
        if (round.totalWin > 0) hits++;
        if (value > maxWin) maxWin = value;
        const meanDelta = value - meanReturn;
        meanReturn += meanDelta / (i + 1);
        m2 += meanDelta * (value - meanReturn);
      }
      const realizedRtp = paid / wagered;
      const declaredRtp = mode.rtp ?? project.math.rtp;
      const rtpDelta = realizedRtp - declaredRtp;
      const hitRate = hits / rounds;
      const standardError = Math.sqrt(m2 / rounds) / Math.sqrt(rounds);
      const allowedDelta = Math.max(rtpTolerance, 1.96 * standardError);
      const publishedAuthority = publishedRtpAuthority(project, currentMathContract, mode);
      const result = {
        mode: mode.name, rounds, seed: modeSeed, realizedRtp, declaredRtp,
        delta: rtpDelta, hitRate, maxWin, tolerance: rtpTolerance,
        standardError, allowedDelta,
        rtpAuthority: publishedAuthority.fresh ? 'official-published-lut' : 'local-design-simulation',
        publishedExactRtp: publishedAuthority.fresh ? publishedAuthority.exactRtp : null,
      };
      simulations.push(result);

      if (Math.abs(rtpDelta) > allowedDelta) {
        issues.push({
          severity: publishedAuthority.fresh ? 'warning' : 'error',
          category: publishedAuthority.fresh ? 'local-simulation-drift' : 'realized-rtp',
          message: publishedAuthority.fresh
            ? `${mode.name}: local design simulation produced ${(realizedRtp * 100).toFixed(3)}%, but fresh official published lookup weights verify ${(publishedAuthority.exactRtp * 100).toFixed(3)}%; treat the local result as a Preview diagnostic, not release RTP authority.`
            : `${mode.name}: simulated RTP ${(realizedRtp * 100).toFixed(3)}% differs from the declared ${(declaredRtp * 100).toFixed(3)}% by ${(rtpDelta * 100).toFixed(3)} points (allowed ${(allowedDelta * 100).toFixed(3)} at this sample size).`,
        });
      }
      if (hitRate < 0.05) {
        issues.push({
          severity: 'error',
          category: 'hit-rate',
          message: `${mode.name}: non-zero win frequency ${(hitRate * 100).toFixed(2)}% is below Stake's 5% minimum.`,
        });
      }
      if (invalidPayouts > 0) {
        issues.push({
          severity: 'error',
          category: 'payout-granularity',
          message: `${mode.name}: ${invalidPayouts.toLocaleString()} simulated payouts violate Stake's 0.1x book increment (${invalidPayoutSamples.join(', ')} book units sampled).`,
        });
      }
    }

    const blockingIssues = issues.filter(issue => issue.severity === 'error');
    return {
      valid: structural.valid && blockingIssues.length === 0,
      structural,
      issues,
      quality,
      simulation: simulations[0] || null,
      simulations,
    };
  }

  /**
   * A math-sdk-conformant `games/<game_id>/` tree. The previous output here was
   * three invented flat files (config/symbols/paytable.py) that nothing in
   * math-sdk consumes.
   */
  generateMathSDKFiles() {
    return new MathSDKExporter(this.project).generateFiles();
  }

  generateAnimationFiles() {
    return generateAnimationFiles(this.project);
  }

  generatePresentationFiles() {
    return {
      'presentation/director.json': JSON.stringify(createPresentationDirectorManifest(this.project), null, 2),
    };
  }

  generateBlueprintFiles() {
    return {
      'stakestudio/blueprint.json': JSON.stringify(createBlueprintManifest(this.project), null, 2),
    };
  }

  generateWorkflowFiles() {
    return {
      'stakestudio/production-workflow.json': JSON.stringify(createProductionWorkflowManifest(this.project), null, 2),
    };
  }

  generateAssetPackFiles() {
    const files = {
      'stakestudio/asset-pack.json': JSON.stringify(createAssetPackManifest(this.project), null, 2),
      'stakestudio/art-direction.json': JSON.stringify(createArtDirectionManifest(this.project), null, 2),
    };
    const submission = this.project.theme?.submission || {};
    const gameName = String(this.project.name || 'Game').replace(/[^a-z0-9]+/gi, '') || 'Game';
    const providerName = String(this.project.build?.stakeEngine?.providerName || 'Provider').replace(/[^a-z0-9]+/gi, '') || 'Provider';
    const names = {
      background: `${gameName}-BG`, foreground: `${gameName}-FG`, providerLogo: `${providerName}-Logo`,
    };
    for (const [key, src] of Object.entries(submission)) {
      if (!src?.startsWith('data:') || !names[key]) continue;
      const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
      if (!match) continue;
      const mime = match[1];
      const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
      const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
      files[`submission/${names[key]}.${ext}`] = Uint8Array.from(binary, character => character.charCodeAt(0));
    }
    return files;
  }

  exportProjectBundle() {
    return {
      project: this.project,
      validation: this.validate(),
      readiness: this.validateReadiness(),
      mathSDK: this.generateMathSDKFiles(),
      animation: createAnimationManifest(this.project),
      presentationDirector: createPresentationDirectorManifest(this.project),
      blueprint: createBlueprintManifest(this.project),
      productionWorkflow: createProductionWorkflowManifest(this.project),
      assetPack: createAssetPackManifest(this.project),
      artDirection: createArtDirectionManifest(this.project),
      quality: new QualityDirector(this.project).audit(),
      timestamp: new Date().toISOString(),
    };
  }
}
