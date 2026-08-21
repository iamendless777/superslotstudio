import html2canvas from 'html2canvas';
import {
  getCodexVisualBatchSummary,
  getNextCodexVisualTask,
  recordCodexVisualAttempt,
  startCodexVisualBatch,
} from '../engines/assets/CodexVisualBatch.js';
import {
  createCapabilityShowcaseBinding,
  createCapabilityShowcaseRecipe,
  ensureVisualEffects,
} from '../engines/animation/VisualEffectRecipes.js';
import { getVisualCohesionStatus, lockArtBible } from '../engines/assets/VisualAssetFactory.js';
import { BuildEngine } from '../engines/build/BuildEngine.js';
import {
  MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
  MORPHEUS_SIGNATURE_CHECKPOINTS,
  MORPHEUS_SIGNATURE_SCENARIO_ID,
  MORPHEUS_SIGNATURE_VIEWPORTS,
  getMorpheusSignatureCaptureFingerprint,
  recordMorpheusSignatureCaptureQA,
} from '../engines/quality/morpheus/MorpheusSignatureCaptureQA.js?orchestration=20260811-3';
import {
  MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
  MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES,
  MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES,
  MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID,
  MORPHEUS_EFFECT_ROUTE_CAPTURE_VIEWPORTS,
  compactMorpheusEffectCaptureFrame,
  compactMorpheusEffectRouteCaptureEvidence,
  createMorpheusEffectRouteCaptureAuthority,
  evaluateMorpheusEffectRouteCaptureQA,
  getMorpheusAcknowledgementIdentityHash,
  getMorpheusEffectRouteCaptureFingerprint,
  recordMorpheusEffectRouteCaptureQA,
} from '../engines/quality/morpheus/MorpheusEffectRouteCaptureQA.js?orchestration=20260813-3';
import {
  createDreamfallSignatureTrace,
  reconstructMorpheusTrace,
} from '../engines/morpheus/MorpheusEventProtocol.js';
import { proveMorpheusDreamfallMotionEquivalence } from '../engines/presentation/morpheus/MorpheusDreamfallRuntime.js';
import { createMorpheusPreviewObservationProof } from '../engines/presentation/morpheus/MorpheusDreamfallPreviewDriver.js';

const API = '/__stake_studio';
const VALID_PANELS = new Set(['cabinet', 'config', 'reelstrips', 'simulate', 'preview', 'audio', 'atlas', 'visual', 'spine', 'quality', 'build']);
const VALID_CONFIG_SECTIONS = new Set(['game-type', 'grid', 'math', 'symbols', 'mechanics', 'betmodes', 'freespins', 'stake-release']);
const BRIDGE_OWNER_KEY = 'stakeStudioBridgeOwner';
const BRIDGE_OWNER_HEARTBEAT_KEY = 'stakeStudioBridgeOwnerHeartbeat';
const BRIDGE_OWNER_LEASE_MS = 6000;
const BASE_PREVIEW_SPIN_TIMEOUT_MS = 20000;
const FEATURE_SPIN_PRESENTATION_BUDGET_MS = 12000;
const MAX_PREVIEW_SPIN_TIMEOUT_MS = 150000;
const SHARED_FRAME_MAX_WIDTH = 1100;
const SHARED_FRAME_MAX_HEIGHT = 800;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function slug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled';
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || `Bridge request failed (${response.status}).`);
  return body;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error || new Error('Could not encode the shared frame.'));
    reader.readAsDataURL(blob);
  });
}


const STUDIO_PRODUCT = Object.freeze({
  product: 'Stake Studio',
  role: 'factory',
  mission: 'Industry-standard slot game generator. Ship Stake.com games in about 2 days.',
  projectVsProduct: 'The open project is the game being made in the factory right now. Games change. The studio does not. Read the open project name from the studio. Do not hide Cabinet / Config / nav / New / Load. Do not skin the studio as a player. If the slot is not visible, open the Preview panel.',
});

function compactPreviewTelemetry(preview) {
  if (!preview || typeof preview !== 'object') return preview;
  const dream = preview.morpheusDreamfall;
  const orch = preview.morpheusEffectOrchestration;
  const choreo = preview.visualChoreography;
  const effect = preview.visualEffect;
  const playback = preview.playback;
  return {
    ...preview,
    playback: playback ? {
      events: playback.events,
      elapsedMs: playback.elapsedMs,
      mechanics: playback.mechanics,
      lastTrace: Array.isArray(playback.trace)
        ? playback.trace.slice(-6).map(event => ({ type: event.type, elapsedMs: event.elapsedMs, mode: event.mode }))
        : [],
    } : null,
    visualEffect: effect ? {
      status: effect.status,
      playing: effect.playing,
      recipeId: effect.recipeId || null,
      motionAtlasCount: effect.motionAtlasCount,
      symbolFlipbookCount: effect.symbolFlipbookCount,
    } : null,
    visualChoreography: choreo ? {
      active: (choreo.active || []).map(item => item.kind || item.planId),
      last: choreo.recent?.[0] ? {
        planId: choreo.recent[0].planId,
        kind: choreo.recent[0].kind,
        status: choreo.recent[0].status,
      } : null,
    } : null,
    morpheusDreamfall: dream ? {
      status: dream.status,
      reelRows: dream.reelRows,
      hud: dream.hud ? {
        visible: dream.hud.visible,
        mode: dream.hud.mode,
        chainHit: dream.hud.chainHit,
        freeSpinsRemaining: dream.hud.freeSpinsRemaining,
        runningWin: dream.hud.runningWin,
        reelRows: dream.hud.reelRows,
      } : null,
      worldActive: Boolean(dream.world?.active),
    } : null,
    morpheusEffectOrchestration: orch ? {
      routeId: orch.routeId,
      status: orch.status,
      motionMode: orch.motionMode,
      nextEventIndex: orch.nextEventIndex,
      productionReady: orch.coverage?.productionReady ?? orch.report?.productionReady ?? null,
    } : null,
  };
}

export class StudioBridge {
  constructor(studio) {
    this.studio = studio;
    this.instanceId = crypto.randomUUID();
    this.errors = [];
    this.lastPublishedErrorsSignature = null;
    const storedSequence = Number.parseInt(localStorage.getItem('stakeStudioLastCommandSequence') || '0', 10);
    const requestedSequence = Number.parseInt(new URLSearchParams(location.search).get('bridge_after') || '0', 10);
    this.lastCommandSequence = Math.max(
      Number.isSafeInteger(storedSequence) ? storedSequence : 0,
      Number.isSafeInteger(requestedSequence) ? requestedSequence : 0,
    );
    this.lastProjectUpdatedAt = 0;
    this.saveTimer = null;
    this.captureTimer = null;
    this.captureInFlight = false;
    this.localSaveInFlight = false;
    this.commandPollInFlight = false;
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (document.visibilityState === 'visible') this.claimOwnership();
    localStorage.setItem('stakeStudioLastCommandSequence', String(this.lastCommandSequence));
    this.onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        this.releaseOwnership();
        return;
      }
      this.claimOwnership();
      this.publishState('visible-tab-owner');
      this.scheduleCapture('visible-tab-owner', 250);
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('focus', this.onVisibilityChange);
    this.installDiagnostics();
    this.installMutationObserver();
    this.setStatus('Connected', 'connected');
    this.publishState('startup');
    this.scheduleCapture('startup', 500);
    this.commandTimer = window.setInterval(() => this.pollCommands(), 500);
    this.heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        this.releaseOwnership();
        return;
      }
      if (!this.isOwner() && document.visibilityState === 'visible' && this.ownerLeaseExpired()) this.claimOwnership();
      if (this.isOwner()) {
        localStorage.setItem(BRIDGE_OWNER_HEARTBEAT_KEY, String(Date.now()));
        this.publishState('heartbeat');
      }
    }, 2500);
    this.projectTimer = window.setInterval(() => this.checkForExternalProjectChange(), 1500);
  }

  isOwner() {
    return localStorage.getItem(BRIDGE_OWNER_KEY) === this.instanceId;
  }

  ownerLeaseExpired() {
    const heartbeat = Number(localStorage.getItem(BRIDGE_OWNER_HEARTBEAT_KEY) || 0);
    return !localStorage.getItem(BRIDGE_OWNER_KEY) || !Number.isFinite(heartbeat) || Date.now() - heartbeat > BRIDGE_OWNER_LEASE_MS;
  }

  claimOwnership() {
    if (document.visibilityState !== 'visible') return false;
    localStorage.setItem(BRIDGE_OWNER_KEY, this.instanceId);
    localStorage.setItem(BRIDGE_OWNER_HEARTBEAT_KEY, String(Date.now()));
    this.lastPublishedErrorsSignature = null;
    return true;
  }

  releaseOwnership() {
    if (!this.isOwner()) return false;
    localStorage.removeItem(BRIDGE_OWNER_KEY);
    localStorage.removeItem(BRIDGE_OWNER_HEARTBEAT_KEY);
    return true;
  }

  setStatus(message, state = '') {
    const element = document.getElementById('bridgeStatus');
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
  }

  installDiagnostics() {
    window.addEventListener('error', event => {
      if (event.target && event.target !== window) {
        const source = event.target.currentSrc || event.target.src || event.target.href || '(unknown resource)';
        this.recordError('resource.error', `Failed to load ${event.target.tagName || 'resource'}: ${source}`, { source });
        return;
      }
      this.recordError('window.error', event.error || event.message, {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    }, true);
    window.addEventListener('unhandledrejection', event => {
      this.recordError('unhandledrejection', event.reason);
    });

    const originalError = console.error.bind(console);
    console.error = (...args) => {
      originalError(...args);
      this.recordError('console.error', args.map(value => value instanceof Error ? value.stack || value.message : String(value)).join(' '));
    };
  }

  installMutationObserver() {
    const root = document.getElementById('app');
    if (!root) return;
    this.observer = new MutationObserver(mutations => {
      if (this.captureInFlight) return;
      if (mutations.every(item => item.target?.closest?.('.html2canvas-container'))) return;
      this.scheduleCapture('visual-change', 650);
    });
    this.observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  }

  async recordError(kind, error, extra = {}) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    const signature = `${kind}:${message}`;
    if (this.errors.at(-1)?.signature === signature) return;
    this.errors.push({ signature, kind, message, ...extra, at: new Date().toISOString() });
    this.errors = this.errors.slice(-50);
    try {
      await this.publishDiagnostics();
    } catch {
      // The bridge may be restarting; keep the diagnostic locally for the next publish.
    }
  }

  async publishDiagnostics({ force = false } = {}) {
    if (!this.isOwner()) return null;
    const signature = JSON.stringify(this.errors);
    if (!force && signature === this.lastPublishedErrorsSignature) return null;
    const result = await request('/errors', { method: 'POST', body: JSON.stringify({ errors: this.errors }) });
    this.lastPublishedErrorsSignature = signature;
    return result;
  }

  currentState(reason = 'update') {
    const project = this.studio.project;
    const preview = this.studio.panels.preview;
    const visual = this.studio.panels.visual;
    return {
      reason,
      publishedAt: new Date().toISOString(),
      page: { title: document.title, url: location.href },
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      activePanel: this.studio.activePanel,
      availablePanels: [...VALID_PANELS],
      projectId: this.studio.projectId || null,
      project: project ? {
        name: project.name,
        gameType: project.math?.gameType,
        grid: project.math?.grid,
        rtp: project.math?.rtp,
        wincap: project.math?.wincap,
        wincapRtp: project.math?.wincapRtp,
        volatility: project.math?.volatility,
        symbols: (project.theme?.symbols || []).map(symbol => symbol.name),
        mechanics: project.math?.bonusMechanics || [],
        unsaved: this.studio.unsaved,
      } : null,
      identity: STUDIO_PRODUCT,
      preview: preview ? compactPreviewTelemetry({
        viewport: preview.viewport,
        spinning: preview.spinning,
        balance: preview.balance,
        bet: preview.bet,
        lastWin: preview.lastWin,
        publishedReplay: preview.publishedReplay,
        playback: {
          events: preview.playbackTrace?.length || 0,
          elapsedMs: preview.playbackTrace?.at(-1)?.elapsedMs || 0,
          mechanics: [...new Set((preview.playbackTrace || [])
            .filter(event => ['expandingWild', 'mysteryTransform', 'wildBomb', 'symbolPurge', 'wildStar', 'specialTargetSelected', 'specialPositionsResolved', 'symbolUpgrade', 'symbolMultiplierUpdate', 'symbolMultiplierUpgrade', 'positionMultiplierGridUpdate', 'expandReelHeight'].includes(event.type))
            .map(event => event.type))],
          trace: (preview.playbackTrace || []).slice(-40),
        },
        visualEffect: preview.getVisualEffectState?.() || null,
        visualChoreography: preview.getVisualChoreographyState?.() || null,
        morpheusDreamfall: preview.getMorpheusDreamfallPreviewState?.() || null,
        morpheusEffectOrchestration: preview.getMorpheusEffectProofState?.() || null,
      }) : null,
      visualLab: visual?.getState?.() || null,
      interactive: {
        canSave: Boolean(project),
        canSpin: this.studio.activePanel === 'preview' && Boolean(preview),
      },
      diagnostics: {
        errorCount: this.errors.length,
        latestError: this.errors.at(-1) || null,
        // The server removes this ledger from the compact state response after
        // atomically synchronizing /errors. Keeping both writes under the same
        // owner publication prevents a clean tab from inheriting stale errors.
        errors: this.errors,
      },
    };
  }

  async publishState(reason = 'update') {
    if (!this.isOwner()) return null;
    try {
      await this.publishDiagnostics();
      await request('/state', { method: 'POST', body: JSON.stringify(this.currentState(reason)) });
      this.setStatus('Shared', 'connected');
    } catch (error) {
      this.setStatus('Bridge offline', 'error');
      if (!String(error.message).includes('fetch')) this.recordError('bridge.state', error);
    }
  }

  afterRender(reason = 'panel-change') {
    window.requestAnimationFrame(() => {
      this.publishState(reason);
      this.scheduleCapture(reason, 250);
    });
  }

  scheduleSync(reason = 'project-change') {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveProject(reason), 300);
    this.scheduleCapture(reason, 700);
  }

  scheduleCapture(reason = 'update', delay = 400) {
    window.clearTimeout(this.captureTimer);
    // Rasterizing the asset-heavy Studio with html2canvas blocks Chromium's UI
    // thread. Ordinary renders therefore invalidate the shared frame instead
    // of taking a screenshot behind the user's back. MCP tools that actually
    // need pixels detect this marker and request one coalesced capture.
    this.captureTimer = window.setTimeout(() => {
      if (!this.isOwner()) return;
      void request('/frame-stale', {
        method: 'POST',
        body: JSON.stringify({ reason, markedAt: new Date().toISOString() }),
      }).catch(error => {
        if (!String(error?.message || error).includes('fetch')) void this.recordError('bridge.frame-stale', error);
      });
    }, Math.max(0, delay));
  }

  async saveProject(reason = 'save') {
    const project = this.studio.project;
    if (!project) return null;
    const id = this.studio.projectId || project.build?.stakeEngine?.gameId || slug(project.name);
    this.studio.projectId = id;
    this.localSaveInFlight = true;
    this.setStatus('Saving…', 'saving');
    try {
      const result = await request(`/projects/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ project, source: 'ui', reason }),
      });
      this.lastProjectUpdatedAt = result.meta?.updatedAt || Date.now();
      this.studio.unsaved = false;
      this.studio.updateProjectName();
      this.setStatus('Saved + shared', 'connected');
      await this.publishState(reason);
      return result;
    } catch (error) {
      this.setStatus('Save failed', 'error');
      await this.recordError('bridge.save', error);
      throw error;
    } finally {
      this.localSaveInFlight = false;
    }
  }

  async listProjects() {
    return (await request('/projects')).projects || [];
  }

  async loadProject(id, reason = 'open-project') {
    let result = null;
    // External tools may replace project.json while the file watcher is
    // polling. Give a transient empty/partial read a moment to settle instead
    // of sending a null project into the Studio runtime.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await request(`/projects/${encodeURIComponent(id)}`);
      if (result?.project && typeof result.project === 'object') break;
      if (attempt < 2) await wait(120);
    }
    if (!result?.project || typeof result.project !== 'object') {
      throw new Error(`Project "${id}" did not return a valid project document.`);
    }
    this.lastProjectUpdatedAt = result.meta?.updatedAt || 0;
    this.studio.replaceProject(result.project, id);
    await this.publishState(reason);
    this.scheduleCapture(reason, 300);
    return { id, name: result.project.name };
  }

  async checkForExternalProjectChange() {
    const id = this.studio.projectId;
    if (!id || this.localSaveInFlight || this.studio.unsaved) return;
    try {
      const meta = await request(`/projects/${encodeURIComponent(id)}/meta`);
      if (this.lastProjectUpdatedAt && meta.updatedAt > this.lastProjectUpdatedAt + 0.5) {
        await this.loadProject(id, 'external-project-change');
      } else if (!this.lastProjectUpdatedAt) {
        this.lastProjectUpdatedAt = meta.updatedAt;
      }
    } catch (error) {
      if (!String(error.message).includes('No project')) await this.recordError('bridge.project-watch', error);
    }
  }

  async captureView(reason = 'manual') {
    if (!this.isOwner()) return null;
    window.clearTimeout(this.captureTimer);
    // Encoding a full Studio screenshot is intentionally expensive. Never let
    // an automatic mutation capture compete with a spin, a measured frame
    // sample, or a live VFX burst; explicit post-action captures still run.
    const preview = this.studio.panels.preview;
    if (reason === 'visual-change' && this.studio.activePanel === 'preview'
      && (preview?.spinning
        || preview?.performanceProfiling
        || preview?.visualEffectRuntime?.playing
        || preview?.activeVisualChoreography?.size > 0)) {
      this.scheduleCapture(reason, 900);
      return null;
    }
    // A mutation-triggered capture must not wait behind and then overwrite an
    // authoritative command frame after the rehearsed overlay has closed.
    if (reason === 'visual-change' && this.captureInFlight) return null;
    // A command capture is authoritative. If a slower mutation-triggered frame
    // is still encoding, wait for it and then capture the requested state; a
    // stale frame must never overwrite newer semantic state.
    const waitStarted = Date.now();
    while (this.captureInFlight && Date.now() - waitStarted < 10000) await wait(50);
    if (this.captureInFlight || !this.isOwner()) return null;
    const root = document.querySelector('.studio');
    if (!root) return null;
    this.captureInFlight = true;
    try {
      await wait(50);
      const maxWidth = SHARED_FRAME_MAX_WIDTH;
      const maxHeight = SHARED_FRAME_MAX_HEIGHT;
      const scale = Math.min(1, maxWidth / Math.max(root.scrollWidth, 1), maxHeight / Math.max(root.scrollHeight, 1));
      // html2canvas cannot reliably clone live WebGL backing stores. Snapshot
      // every Pixi surface explicitly so shared QA frames match the game the
      // user actually sees, including Preview's Spine and VFX layers.
      try { preview?.spineRuntime?.app?.render?.(); } catch { /* best effort */ }
      // The VFX overlay preserves its WebGL drawing buffer, so its latest ticker
      // frame is already available to toDataURL. Forcing a second render here can
      // re-enter Pixi's filter pipeline during an automatic capture.
      const pixiSelector = 'canvas.visual-lab-canvas, canvas.preview-spine-canvas, .preview-visual-effect-layer canvas';
      const canvasSnapshots = [...root.querySelectorAll(pixiSelector)].map(canvas => {
        try { return canvas.toDataURL('image/png'); } catch { return null; }
      });
      const canvas = await html2canvas(root, {
        backgroundColor: '#101114',
        logging: false,
        useCORS: true,
        allowTaint: false,
        imageTimeout: 4000,
        scale,
        width: root.scrollWidth,
        height: root.scrollHeight,
        windowWidth: root.scrollWidth,
        windowHeight: root.scrollHeight,
        onclone: clonedDocument => {
          clonedDocument.querySelectorAll('.html2canvas-ignore').forEach(element => element.remove());
          // Hidden presentation art and inactive character poses can contain
          // several full-resolution embedded images. They contribute no pixels
          // to the shared frame, but html2canvas still decodes them unless the
          // capture clone drops them before resource discovery.
          clonedDocument.querySelectorAll('.preview-character-pose:not(.is-active)').forEach(element => element.remove());
          clonedDocument.querySelectorAll('#previewModePortal:not(.is-visible)').forEach(element => element.remove());
          const liveModePortal = root.querySelector('#previewModePortal.is-visible');
          const clonedModePortal = clonedDocument.querySelector('#previewModePortal.is-visible');
          if (liveModePortal && clonedModePortal) {
            // CSS animations restart from 0% in html2canvas' cloned document.
            // The mode portal begins transparent, so freeze the clone at the
            // visible presentation state the user is actually seeing.
            clonedModePortal.style.animation = 'none';
            clonedModePortal.style.opacity = '1';
          }
          clonedDocument.querySelectorAll(pixiSelector).forEach((clonedCanvas, index) => {
            const source = canvasSnapshots[index];
            if (!source) return;
            const image = clonedDocument.createElement('img');
            image.src = source;
            image.className = clonedCanvas.className;
            image.setAttribute('aria-label', clonedCanvas.getAttribute('aria-label') || 'Pixi visual effect frame');
            image.style.cssText = clonedCanvas.style.cssText;
            image.style.display = 'block';
            image.style.width = '100%';
            image.style.height = '100%';
            clonedCanvas.replaceWith(image);
          });
        },
      });
      const blob = await new Promise((resolveBlob, reject) => canvas.toBlob(value => value ? resolveBlob(value) : reject(new Error('PNG encoding failed.')), 'image/png'));
      const data = await blobToBase64(blob);
      const result = await request('/frame', {
        method: 'POST',
        body: JSON.stringify({ data, width: canvas.width, height: canvas.height, reason, capturedAt: new Date().toISOString() }),
      });
      await this.publishState(`frame:${reason}`);
      return result;
    } catch (error) {
      await this.recordError('bridge.capture', error);
      return null;
    } finally {
      this.captureInFlight = false;
    }
  }

  async archivePreviewQACapture({
    preview, scenarioId, runId, viewport, checkpointId, requireUnoccludedCells = 0,
    recognitionRequest = null,
  }) {
    const element = preview.container.querySelector('#previewViewport');
    if (!element) throw new Error('Preview viewport is unavailable for QA capture.');
    const studioRoot = document.querySelector('.studio');
    if (!studioRoot) throw new Error('Studio root is unavailable for QA capture.');
    await preview.waitForRenderFrames(3);
    const visibilityProof = requireUnoccludedCells > 0
      ? preview.collectMorpheusMaxGrowthVisibilityProof(requireUnoccludedCells)
      : null;
    if (visibilityProof && !visibilityProof.passed) {
      throw new Error(`Preview QA capture requires ${requireUnoccludedCells} visibly unoccluded cells; found ${visibilityProof.visiblyUnoccludedCellCount}.`);
    }
    try { preview.spineRuntime?.app?.render?.(); } catch { /* best effort */ }
    const canvasSelector = 'canvas.preview-spine-canvas, .preview-visual-effect-layer canvas';
    // html2canvas's element-target crop drops Preview's .3125-scaled stage at
    // the 400×250 boundary even though Chromium paints it. The full Studio
    // root is the same path used by the proven shared screenshot capture, so
    // mini is rendered there and then cropped to the exact live viewport.
    const useStudioCrop = viewport === 'mini';
    const captureTarget = useStudioCrop ? studioRoot : element;
    const snapshots = [...captureTarget.querySelectorAll(canvasSelector)].map(canvas => {
      try { return canvas.toDataURL('image/png'); } catch { return null; }
    });
    const width = element.clientWidth;
    const height = element.clientHeight;
    // Preserve the live Studio layout while html2canvas clones the Preview.
    // Using the 400×250 mini target as the cloned browser window triggers the
    // app's compact media queries and moves the centered viewport after the
    // element crop has been resolved, producing a background-only PNG. The
    // output is still constrained to the exact viewport width and height.
    const captureWindowWidth = document.documentElement.clientWidth || window.innerWidth || width;
    const captureWindowHeight = document.documentElement.clientHeight || window.innerHeight || height;
    const viewportRect = element.getBoundingClientRect();
    const captureRect = captureTarget.getBoundingClientRect();
    const captureWidth = useStudioCrop ? captureTarget.scrollWidth : width;
    const captureHeight = useStudioCrop ? captureTarget.scrollHeight : height;
    const renderCapture = async ({ suppressOrchestration = false } = {}) => html2canvas(captureTarget, {
      backgroundColor: '#080a1b',
      logging: false,
      useCORS: true,
      allowTaint: false,
      scale: 1,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWindowWidth,
      windowHeight: captureWindowHeight,
      onclone: clonedDocument => {
        clonedDocument.querySelectorAll(canvasSelector).forEach((clonedCanvas, index) => {
          if (!snapshots[index]) return;
          const image = clonedDocument.createElement('img');
          image.src = snapshots[index];
          image.className = clonedCanvas.className;
          image.style.cssText = clonedCanvas.style.cssText;
          clonedCanvas.replaceWith(image);
        });
        if (suppressOrchestration) {
          clonedDocument.querySelectorAll([
            '.preview-visual-effect-layer',
            '.preview-mechanic-state-layer',
            '.preview-feature-progress',
            '.preview-win-path',
            '.preview-win-node',
            '.preview-win-orb',
            '.preview-mode-portal',
            '.preview-mode-sigil',
          ].join(',')).forEach(layer => {
            layer.style.visibility = 'hidden';
          });
          clonedDocument.querySelectorAll('.reel-sym').forEach(cell => {
            cell.classList.remove('is-mechanic-source', 'is-mechanic-target', 'win-dimmed', 'is-winning', 'is-landed', 'win-highlight');
            cell.style.removeProperty('filter');
            cell.style.removeProperty('transform');
            cell.style.removeProperty('opacity');
            cell.style.animation = 'none';
            const image = cell.querySelector('img');
            if (image) {
              image.style.animation = 'none';
              image.style.transform = 'none';
              image.style.filter = 'none';
              image.style.opacity = '1';
            }
          });
        }
      },
    });
    const renderedCanvas = await renderCapture();
    const renderedIdentityCanvas = recognitionRequest
      ? await renderCapture({ suppressOrchestration: true })
      : null;
    let canvas = renderedCanvas;
    let identityCanvas = renderedIdentityCanvas;
    if (useStudioCrop) {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Preview QA crop canvas is unavailable.');
      const cropX = viewportRect.left - captureRect.left + captureTarget.scrollLeft;
      const cropY = viewportRect.top - captureRect.top + captureTarget.scrollTop;
      context.drawImage(renderedCanvas, cropX, cropY, width, height, 0, 0, width, height);
      if (renderedIdentityCanvas) {
        identityCanvas = document.createElement('canvas');
        identityCanvas.width = width;
        identityCanvas.height = height;
        const identityContext = identityCanvas.getContext('2d');
        if (!identityContext) throw new Error('Preview QA static-identity crop canvas is unavailable.');
        identityContext.drawImage(renderedIdentityCanvas, cropX, cropY, width, height, 0, 0, width, height);
      }
    }
    const blob = await new Promise((resolveBlob, reject) => canvas.toBlob(value => (
      value ? resolveBlob(value) : reject(new Error('Preview QA PNG encoding failed.'))
    ), 'image/png'));
    const data = await blobToBase64(blob);
    const recognitionData = identityCanvas ? await blobToBase64(await new Promise((resolveBlob, reject) => (
      identityCanvas.toBlob(value => value ? resolveBlob(value) : reject(new Error('Static-identity PNG encoding failed.')), 'image/png')
    ))) : null;
    const archived = await request(`/projects/${encodeURIComponent(this.studio.projectId)}/qa-captures`, {
      method: 'POST',
      body: JSON.stringify({
        scenarioId,
        runId,
        viewport,
        checkpointId,
        data,
        width: canvas.width,
        height: canvas.height,
        capturedAt: new Date().toISOString(),
        ...(recognitionRequest ? { renderedCellRecognition: recognitionRequest } : {}),
        ...(recognitionData ? { recognitionData } : {}),
      }),
    });
    if (recognitionRequest && (archived.renderedCellRecognition?.passed !== true
      || archived.staticIdentityRecognition?.passed !== true)) {
      const compositeFailed = archived.renderedCellRecognition?.failedCells || [];
      const identityFailed = archived.staticIdentityRecognition?.failedCells || [];
      throw new Error(`Rendered-cell recognition failed for ${checkpointId}: composite [${compositeFailed.join(', ')}], static [${identityFailed.join(', ')}].`);
    }
    return visibilityProof ? { ...archived, visibilityProof } : archived;
  }

  async runMorpheusSignatureCaptureAudit(preview) {
    if (this.studio.projectId !== 'morpheus_dreamfall') {
      throw new Error('The Morpheus signature capture audit requires project morpheus_dreamfall.');
    }
    const trace = createDreamfallSignatureTrace();
    const protocol = reconstructMorpheusTrace(trace.events);
    const motion = proveMorpheusDreamfallMotionEquivalence(trace.events);
    const runId = `run-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17)}`;
    const viewportRuns = [];

    for (const viewport of MORPHEUS_SIGNATURE_VIEWPORTS) {
      preview.viewport = viewport;
      preview.render();
      await preview.waitForRenderFrames(3);
      const checkpoints = [];
      await preview.playMorpheusDreamfallSignature({
        motion: 'reduced',
        onCheckpoint: async observation => {
          const definition = MORPHEUS_SIGNATURE_CHECKPOINTS.find(item => item.eventIndex === observation.sourceEvent.index);
          if (!definition) return;
          await preview.prepareMorpheusSignatureRenderEvidence(observation.runtime.state.reelRows);
          const layout = await preview.collectMorpheusSignatureLayout(viewport);
          const frame = await this.archivePreviewQACapture({
            preview,
            scenarioId: MORPHEUS_SIGNATURE_SCENARIO_ID,
            runId,
            viewport,
            checkpointId: definition.id,
          });
          const observationProof = createMorpheusPreviewObservationProof(
            observation.runtime.state,
            preview.collectMorpheusSignatureObservation(observation.runtime.state.reelRows),
          );
          checkpoints.push({
            id: definition.id,
            eventIndex: observation.sourceEvent.index,
            eventType: observation.sourceEvent.type,
            sourceEventHash: observation.command.semantic.sourceEventHash,
            semanticHash: observation.command.semanticHash,
            expected: observationProof.expected,
            observed: observationProof.observed,
            observationPassed: observationProof.passed,
            nextEventBlockedBeforeAck: observation.nextEventBlockedBeforeAck,
            blockingProof: observation.blockingProof,
            acknowledgement: observation.acknowledgement ? {
              id: observation.acknowledgement.acknowledgementId,
              evidence: observation.acknowledgement.evidence,
              receiptHash: observation.acknowledgement.receiptHash,
            } : null,
            frame,
            layout,
          });
          await this.publishState(`morpheus-signature:${viewport}:${definition.id}`);
        },
      });
      const peakState = await preview.presentMorpheusMaxGrowthForAudit();
      const peakLayout = await preview.collectMorpheusSignatureLayout(viewport);
      // Capture the mini legibility proof before performance profiling starts
      // its intentional worst-case wincap presentation. The profiler still
      // measures the already-presented 8-row board, but its overlay must never
      // replace the separate max-growth visual evidence.
      const maxGrowthFrame = viewport === 'mini' ? await this.archivePreviewQACapture({
        preview,
        scenarioId: MORPHEUS_SIGNATURE_SCENARIO_ID,
        runId,
        viewport,
        checkpointId: 'mini-max-growth-8-row',
        requireUnoccludedCells: 48,
      }) : null;
      const performance = {
        ...(await preview.collectViewportPerformance(viewport)),
        reelRows: [...peakState.reelRows],
        coordinateCells: peakLayout.coordinateCells,
        fixedWorldBottomAligned: peakLayout.fixedWorldBottomAligned,
        peakState: {
          scenarioId: MORPHEUS_SIGNATURE_SCENARIO_ID,
          reelRows: [...peakState.reelRows],
        },
      };
      if (performance.peakState.scenarioId !== MORPHEUS_SIGNATURE_SCENARIO_ID
        || JSON.stringify(performance.peakState.reelRows) !== JSON.stringify([8, 8, 8, 8, 8, 8])
        || performance.coordinateCells !== 48 || performance.fixedWorldBottomAligned !== true) {
        throw new Error(`${viewport} performance was not measured at the verified 6×8 peak state.`);
      }
      const run = { viewport, checkpoints, performance };
      if (viewport === 'mini') {
        const maxGrowth = peakState;
        maxGrowth.layout = peakLayout;
        maxGrowth.frame = maxGrowthFrame;
        run.maxGrowth = maxGrowth;
      }
      viewportRuns.push(run);
    }

    const evidence = {
      format: MORPHEUS_SIGNATURE_CAPTURE_FORMAT,
      scenarioId: MORPHEUS_SIGNATURE_SCENARIO_ID,
      fingerprint: getMorpheusSignatureCaptureFingerprint(this.studio.project),
      sourceContractFingerprint: trace.contractFingerprint,
      protocol: {
        protocolEventHash: protocol.eventHash,
        protocolBoardHash: protocol.boardHash,
        protocolStateHash: protocol.stateHash,
      },
      motionEquivalence: {
        passed: motion.passed,
        stateHash: motion.stateHash,
        semanticTraceHash: motion.semanticTraceHash,
        acknowledgementHash: motion.acknowledgementHash,
      },
      viewportRuns,
      runAt: new Date().toISOString(),
    };
    const summary = recordMorpheusSignatureCaptureQA(this.studio.project, evidence);
    const report = this.studio.project.production?.qa?.morpheusSignatureCaptureAudit || null;
    const resources = viewportRuns.flatMap(run => [
      ...(run.checkpoints || []).map(checkpoint => checkpoint.frame).filter(Boolean),
      ...(run.maxGrowth?.frame ? [run.maxGrowth.frame] : []),
    ]);
    return { report, summary, resources, runId };
  }

  morpheusEffectRouteShardKey({ routeId, motionMode, viewport }) {
    return `${routeId}:${motionMode}:${viewport}`;
  }

  async runMorpheusEffectRouteCaptureShard(preview, { routeId, motionMode, viewport, runId }) {
    const authority = createMorpheusEffectRouteCaptureAuthority();
    if (!MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES.includes(routeId)) throw new Error(`Unknown Morpheus effect route ${routeId}.`);
    if (!MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES.includes(motionMode)) throw new Error(`Unknown Morpheus motion mode ${motionMode}.`);
    if (!MORPHEUS_EFFECT_ROUTE_CAPTURE_VIEWPORTS.includes(viewport)) throw new Error(`Unknown Morpheus viewport ${viewport}.`);
    preview.viewport = viewport;
    preview.render();
    await preview.waitForRenderFrames(3);
    const eventCount = authority.routes[routeId].eventCount;
    const checkpoints = [];
    const resources = [];
    let authoritativeRevealCommitted = false;
    const report = await preview.playMorpheusEffectProofRoute({
      routeId,
      motion: motionMode,
      onCheckpoint: async observation => {
        const eventIndex = Number(observation.sourceEvent.index);
        if (observation.sourceEvent.type === 'reveal') authoritativeRevealCommitted = true;
        if (motionMode !== 'normal' && eventIndex !== eventCount - 1) return;
        await preview.waitForRenderFrames(2);
        const state = observation.runtime.state;
        const expectedState = {
          board: (state.board || []).map(reel => reel.map(symbol => symbol?.name || symbol)),
          reelRows: [...state.reelRows],
          hud: {
            chainHit: state.tumbleChainHit,
            freeSpinsRemaining: state.freeSpinsRemaining,
            awardedFreeSpins: state.totalTumbleFreeSpinsAwarded,
            runningWin: state.totalWinAmount,
            reelRows: [...state.reelRows],
          },
        };
        const boardCommitted = authoritativeRevealCommitted;
        const preRevealPresentation = boardCommitted
          ? null
          : preview.collectMorpheusPreRevealPresentation(observation.sourceEvent.type);
        let observationProof;
        if (boardCommitted) {
          await preview.prepareRenderedCellRecognitionEvidence(state.reelRows);
          observationProof = createMorpheusPreviewObservationProof(
            expectedState,
            preview.collectMorpheusSignatureObservation(state.reelRows),
          );
        } else {
          observationProof = {
            passed: preRevealPresentation?.visiblyDeclared === true,
            expected: { boardAuthority: 'uncommitted' },
            observed: { boardAuthority: preRevealPresentation?.boardAuthority || 'unknown' },
          };
        }
        const checkpointId = `${routeId}-${motionMode}-${eventIndex}-${observation.sourceEvent.type}`;
        const layout = await preview.collectMorpheusSignatureLayout(viewport);
        const positionGridLayout = preview.featurePositionGridMode
          ? preview.collectPositionGridLayoutProof()
          : null;
        if (positionGridLayout && positionGridLayout.passed !== true) {
          throw new Error(`Position-grid orchestration layout failed for ${checkpointId}: ${positionGridLayout.plateCount}/${positionGridLayout.requiredCount} plates, ${positionGridLayout.uniqueCoordinateCount} unique coordinates, ${positionGridLayout.overlaps.length} overlaps.`);
        }
        const frame = await this.archivePreviewQACapture({
          preview,
          scenarioId: MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID,
          runId,
          viewport,
          checkpointId,
          recognitionRequest: boardCommitted
            ? preview.collectRenderedCellRecognitionRequest(expectedState.board, state.reelRows)
            : null,
        });
        const playback = [...(preview.playbackTrace || [])].reverse().find(item => (
          item.bookIndex === eventIndex && item.sourceEventHash === observation.command.sourceEventHash
        ));
        const compactFrame = compactMorpheusEffectCaptureFrame(frame);
        checkpoints.push({
          eventIndex,
          eventType: observation.sourceEvent.type,
          sourceEventHash: observation.command.sourceEventHash,
          semanticCommitHash: observation.command.semanticCommitHash,
          expected: observationProof.expected,
          observed: observationProof.observed,
          observationPassed: observationProof.passed,
          boardAuthority: boardCommitted ? 'authoritative-reveal-or-later' : 'uncommitted-pre-reveal',
          preRevealPresentation,
          nextEventBlockedBeforeAck: observation.nextEventBlockedBeforeAck,
          blockingProof: observation.blockingProof,
          acknowledgement: observation.acknowledgement,
          audioReceipt: playback?.audioReceipt || null,
          motion: preview.collectMorpheusEffectMotionState({ suppressed: observation.command.motionSuppressed }),
          positionGridLayout,
          layout,
          frame: compactFrame,
        });
        resources.push(compactFrame);
        await this.publishState(`morpheus-effect-capture:${viewport}:${checkpointId}`);
      },
    });
    return {
      run: {
        routeId,
        motionMode,
        viewport,
        passed: report.passed,
        productionReady: report.productionReady,
        eventHash: report.runtime.eventHash,
        boardHash: report.runtime.protocolEvidence.boardHash,
        protocolStateHash: report.runtime.protocolEvidence.stateHash,
        stateHash: report.runtime.stateHash,
        semanticTraceHash: report.runtime.semanticTraceHash,
        acknowledgementHash: report.runtime.acknowledgementHash,
        acknowledgementIdentityHash: getMorpheusAcknowledgementIdentityHash(report.runtime.acknowledgements),
        checkpoints,
      },
      resources,
    };
  }

  async runMorpheusEffectRouteCaptureAudit(preview, { resume = true, only = null } = {}) {
    if (this.studio.projectId !== 'morpheus_dreamfall') {
      throw new Error('The Morpheus effect-route capture audit requires project morpheus_dreamfall.');
    }
    const authority = createMorpheusEffectRouteCaptureAuthority();
    const fingerprint = getMorpheusEffectRouteCaptureFingerprint(this.studio.project);
    const qa = this.studio.project.production?.qa || {};
    const draft = qa.morpheusEffectRouteCaptureDraft;
    const certified = qa.morpheusEffectRouteCaptureAudit;
    const compatible = source => resume && source?.scenarioId === MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID
      && source?.contractFingerprint === authority.contractFingerprint
      && source?.fingerprint === fingerprint
      && Array.isArray(source?.runs);
    const resumeSources = [certified, draft].filter(compatible);
    const mergedRuns = new Map();
    for (const source of resumeSources) {
      for (const run of compactMorpheusEffectRouteCaptureEvidence(source).runs) {
        mergedRuns.set(this.morpheusEffectRouteShardKey(run), run);
      }
    }
    const runId = compatible(draft) && draft.format === MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT
      ? draft.runId : `run-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17)}`;
    const runs = [...mergedRuns.values()];
    const resumeEvidence = resumeSources.length ? {
      format: MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
      scenarioId: MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID,
      contractFingerprint: authority.contractFingerprint,
      authorityFingerprint: authority.fingerprint,
      fingerprint,
      runId,
      runAt: new Date().toISOString(),
      runs,
    } : null;
    const resumeEvaluation = resumeEvidence
      ? evaluateMorpheusEffectRouteCaptureQA(resumeEvidence, this.studio.project)
      : null;
    const reusableRunKeys = new Set(runs.filter(run => {
      const key = this.morpheusEffectRouteShardKey(run);
      return run.passed === true && !(resumeEvaluation?.issues || []).some(problem => (
        problem === key || problem.startsWith(`${key}:`)
      ));
    }).map(run => this.morpheusEffectRouteShardKey(run)));
    const resources = [];
    const shards = MORPHEUS_EFFECT_ROUTE_CAPTURE_VIEWPORTS.flatMap(viewport => (
      MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES.flatMap(routeId => (
        MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES.map(motionMode => ({ viewport, routeId, motionMode }))
      ))
    )).filter(shard => !only || this.morpheusEffectRouteShardKey(shard) === this.morpheusEffectRouteShardKey(only));
    for (const shard of shards) {
      const key = this.morpheusEffectRouteShardKey(shard);
      if (reusableRunKeys.has(key)) continue;
      const result = await this.runMorpheusEffectRouteCaptureShard(preview, { ...shard, runId });
      const replaceIndex = runs.findIndex(run => this.morpheusEffectRouteShardKey(run) === key);
      if (replaceIndex >= 0) runs.splice(replaceIndex, 1, result.run);
      else runs.push(result.run);
      resources.push(...result.resources);
      this.studio.project.production = this.studio.project.production || {};
      this.studio.project.production.qa = this.studio.project.production.qa || {};
      this.studio.project.production.qa.morpheusEffectRouteCaptureDraft = {
        format: MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
        scenarioId: MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID,
        contractFingerprint: authority.contractFingerprint,
        authorityFingerprint: authority.fingerprint,
        fingerprint,
        runId,
        runAt: new Date().toISOString(),
        runs,
        completedShardKeys: runs.filter(run => run.passed === true).map(run => this.morpheusEffectRouteShardKey(run)).sort(),
      };
      await this.saveProject(`morpheus-effect-route-shard:${key}`);
      await this.publishState(`morpheus-effect-route-shard:${key}:saved`);
    }

    const evidence = {
      format: MORPHEUS_EFFECT_ROUTE_CAPTURE_FORMAT,
      scenarioId: MORPHEUS_EFFECT_ROUTE_CAPTURE_SCENARIO_ID,
      contractFingerprint: authority.contractFingerprint,
      authorityFingerprint: authority.fingerprint,
      fingerprint,
      runId,
      runAt: new Date().toISOString(),
      runs,
    };
    const fullMatrix = !only && runs.length === MORPHEUS_EFFECT_ROUTE_CAPTURE_VIEWPORTS.length
      * MORPHEUS_EFFECT_ROUTE_CAPTURE_ROUTES.length * MORPHEUS_EFFECT_ROUTE_CAPTURE_MOTION_MODES.length;
    const summary = fullMatrix
      ? recordMorpheusEffectRouteCaptureQA(this.studio.project, evidence)
      : { passed: true, complete: false, runCount: runs.length, shard: only };
    const report = this.studio.project.production?.qa?.morpheusEffectRouteCaptureAudit || null;
    return { report, summary, resources, runId };
  }

  async pollCommands() {
    if (document.visibilityState !== 'visible') {
      this.releaseOwnership();
      return;
    }
    if (this.commandPollInFlight || !this.isOwner()) return;
    this.commandPollInFlight = true;
    try {
      const payload = await request(`/commands?after=${this.lastCommandSequence}&claim=${encodeURIComponent(this.instanceId)}`);
      const serverSequence = Number(payload.sequence || 0);
      if (Number.isSafeInteger(serverSequence) && serverSequence < this.lastCommandSequence) {
        // The local bridge queue can be rebuilt or restored independently of
        // browser storage. Adopt its current high-water mark so this tab does
        // not remain permanently stranded beyond every future command.
        this.lastCommandSequence = Math.max(0, serverSequence);
        localStorage.setItem('stakeStudioLastCommandSequence', String(this.lastCommandSequence));
        return;
      }
      for (const command of payload.commands || []) {
        // Server-side leasing elects exactly one live tab for each command.
        // Make that tab the frame/state owner before execution so a hot reload
        // or a stale background tab cannot strand the command queue.
        this.claimOwnership();
        let result;
        try {
          result = { id: command.id, ok: true, result: await this.executeCommand(command.command, command.arguments || {}) };
        } catch (error) {
          result = { id: command.id, ok: false, error: String(error?.message || error) };
          await this.recordError('bridge.command', error, { command: command.command });
        }
        await request('/command-results', { method: 'POST', body: JSON.stringify(result) });
        this.lastCommandSequence = Math.max(this.lastCommandSequence, command.sequence || 0);
        localStorage.setItem('stakeStudioLastCommandSequence', String(this.lastCommandSequence));
      }
    } catch (error) {
      if (!String(error.message).includes('fetch')) await this.recordError('bridge.command-poll', error);
    } finally {
      this.commandPollInFlight = false;
    }
  }

  async executeCommand(command, args) {
    switch (command) {
      case 'capture_view':
        return await this.captureView('codex-request');
      case 'inspect_preview': {
        const preview = this.studio.panels.preview;
        if (!preview) throw new Error('Open the Preview panel first.');
        const stage = preview.container.querySelector('#previewStage');
        const cells = [...preview.container.querySelectorAll('.reel-sym')];
        const spineRuntime = preview.spineRuntime;
        const spine = spineRuntime?.spine;
        const spineLayer = preview.container.querySelector('#previewSpineLayer');
        const spineCanvas = preview.container.querySelector('#previewSpineLayer canvas');
        let spineBounds = null;
        try {
          const bounds = spine?.getBounds?.();
          if (bounds) spineBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
        } catch {
          // The status below remains useful even if a renderer cannot report bounds.
        }
        return {
          mode: preview.selectedMode,
          board: preview.board,
          spinning: preview.spinning,
          presentation: stage ? {
            animationState: stage.dataset.animationState || null,
            performanceMode: stage.dataset.performanceMode || null,
            worldState: stage.dataset.worldState || null,
            winPaths: preview.container.querySelectorAll('.preview-win-path').length,
            winNodes: preview.container.querySelectorAll('.preview-win-node').length,
            highlightedSymbols: preview.container.querySelectorAll('.win-highlight').length,
            dimmedSymbols: preview.container.querySelectorAll('.win-dimmed').length,
            spine: {
              status: spineRuntime?.status || null,
              asset: spineRuntime?.asset?.name || null,
              state: spineRuntime?.currentRigState || null,
              bounds: spineBounds,
              position: spine ? { x: spine.position.x, y: spine.position.y } : null,
              scale: spine ? { x: spine.scale.x, y: spine.scale.y } : null,
              visible: spine?.visible ?? null,
              renderable: spine?.renderable ?? null,
              alpha: spine?.alpha ?? null,
              attachment: spine?.skeleton?.slots?.[0]?.pose?.getAttachment?.()?.name || null,
              layer: spineLayer ? (() => {
                const style = getComputedStyle(spineLayer);
                return {
                  opacity: style.opacity,
                  visibility: style.visibility,
                  display: style.display,
                  zIndex: style.zIndex,
                };
              })() : null,
              canvas: spineCanvas ? {
                width: spineCanvas.width,
                height: spineCanvas.height,
                clientWidth: spineCanvas.clientWidth,
                clientHeight: spineCanvas.clientHeight,
              } : null,
            },
          } : null,
          assetStatus: [...preview.assetStatus.entries()].map(([src, loaded]) => ({ src, loaded })),
          cells: cells.map(cell => {
            const style = getComputedStyle(cell);
            const image = cell.querySelector('img');
            const imageStyle = image ? getComputedStyle(image) : null;
            return {
              reel: Number(cell.dataset.reel),
              position: Number(cell.dataset.pos),
              symbol: cell.dataset.symbol || null,
              classes: [...cell.classList],
              title: cell.title,
              text: cell.textContent,
              image: image?.src || null,
              imageAnimation: imageStyle?.animationName || null,
              backgroundImage: style.backgroundImage,
              display: style.display,
              opacity: style.opacity,
              visibility: style.visibility,
              transform: style.transform,
              width: style.width,
              height: style.height,
            };
          }),
        };
      }
      case 'capture_spine_layer': {
        const preview = this.studio.panels.preview;
        const runtime = preview?.spineRuntime;
        if (!runtime?.app?.renderer || !runtime?.app?.stage) throw new Error('Open Preview and wait for the Spine runtime first.');
        runtime.app.render();
        const canvas = runtime.app.canvas;
        return {
          width: canvas.width,
          height: canvas.height,
          dataUrl: canvas.toDataURL('image/png'),
        };
      }
      case 'inspect_studio': {
        const project = this.studio.project || {};
        const cabinet = project.theme?.cabinet || {};
        const preview = this.studio.panels.preview;
        return {
          identity: STUDIO_PRODUCT,
          chrome: {
            activePanel: this.studio.activePanel || null,
            availablePanels: [...VALID_PANELS],
            neverHide: true,
          },
          openProject: this.studio.projectId ? {
            id: this.studio.projectId,
            name: project.name || null,
            role: 'loaded example project, not the product',
            unsaved: this.studio.unsaved === true,
          } : null,
          cabinet: {
            width: cabinet.width || null,
            height: cabinet.height || null,
            layers: (cabinet.layers || []).map(layer => ({
              id: layer.id || null,
              type: layer.type || null,
              name: layer.name || null,
              x: layer.x,
              y: layer.y,
              width: layer.width,
              height: layer.height,
              hasSrc: Boolean(layer.src),
              visible: layer.visible !== false,
            })),
          },
          preview: preview ? {
            spinning: preview.spinning === true,
            viewport: preview.viewport || null,
            canSpin: this.studio.activePanel === 'preview',
          } : null,
          symbols: (project.theme?.symbols || []).length,
          symbolsWithArt: (project.theme?.symbols || []).filter(symbol => symbol?.src).length,
        };
      }
      case 'select_panel':
        if (!VALID_PANELS.has(args.panel)) throw new Error(`Unknown panel "${args.panel}".`);
        if (!this.studio.project) throw new Error('Open or create a project first.');
        this.studio.activatePanel(args.panel);
        await wait(200);
        await this.publishState(`panel:${args.panel}`);
        this.scheduleCapture(`panel:${args.panel}`, 0);
        return { activePanel: args.panel };
      case 'set_visual_lab_viewport': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'visual' || !this.studio.panels.visual) this.studio.activatePanel('visual');
        await wait(220);
        const panel = this.studio.panels.visual;
        panel.setViewport(args.viewport);
        await wait(180);
        await this.publishState(`visual-lab:viewport:${args.viewport}`);
        this.scheduleCapture(`visual-lab:viewport:${args.viewport}`, 0);
        return panel.getState();
      }
      case 'set_visual_lab_motion': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'visual' || !this.studio.panels.visual) this.studio.activatePanel('visual');
        await wait(220);
        const panel = this.studio.panels.visual;
        panel.setMotion(args.motion);
        await wait(180);
        await this.publishState(`visual-lab:motion:${args.motion}`);
        this.scheduleCapture(`visual-lab:motion:${args.motion}`, 0);
        return panel.getState();
      }
      case 'audition_visual_recipe': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'visual' || !this.studio.panels.visual) this.studio.activatePanel('visual');
        await wait(260);
        const panel = this.studio.panels.visual;
        if (args.viewport) panel.setViewport(args.viewport);
        if (args.motion) panel.setMotion(args.motion);
        if (args.intensity) panel.intensity = Math.min(3, Math.max(1, Number(args.intensity)));
        const handle = panel.play();
        await wait(80);
        panel.freezeAt(args.captureAt || 'contact');
        await wait(80);
        await this.publishState('visual-lab:audition');
        return { ...panel.getState(), diagnostics: handle?.diagnostics || null };
      }
      case 'select_config_section': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (!VALID_CONFIG_SECTIONS.has(args.section)) throw new Error(`Unknown config section "${args.section}".`);
        if (this.studio.activePanel !== 'config' || !this.studio.panels.config) this.studio.activatePanel('config');
        const panel = this.studio.panels.config;
        panel.activeSection = args.section;
        panel.render();
        await wait(150);
        await this.publishState(`config:${args.section}`);
        this.scheduleCapture(`config:${args.section}`, 0);
        return { activePanel: 'config', section: args.section };
      }
      case 'clear_diagnostics':
        this.errors = [];
        await this.publishDiagnostics({ force: true });
        await this.publishState('diagnostics-cleared');
        return { errorCount: 0 };
      case 'start_math_publisher': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        const profile = String(args.profile || 'smoke');
        if (!['smoke', 'draft', 'production'].includes(profile)) throw new Error('Math publisher profile must be smoke, draft, or production.');
        if (this.studio.mathPublisherJob?.status === 'running') return this.studio.mathPublisherJob;
        if (this.studio.activePanel !== 'build') this.studio.activatePanel('build');
        await wait(250);
        this.studio.mathPublisherProfile = profile;
        const main = document.getElementById('studioMain');
        this.studio.renderBuildPanel(main);
        await wait(80);
        const button = main.querySelector('#btnRunMathPublisher');
        if (!button || button.disabled) throw new Error('Math Publisher is unavailable in the Build panel.');
        void this.studio.startMathPublisher(new BuildEngine(this.studio.project), main, {
          skipCalibration: args.skipCalibration === true,
        });
        await this.publishState(`math-publisher:${profile}:preparing`);
        return { status: 'preparing', profile, skipCalibration: args.skipCalibration === true };
      }
      case 'get_math_publisher_job': {
        const job = this.studio.mathPublisherJob;
        if (!job?.id || job.id === 'not-started') return job || null;
        const current = await request(`/math-publisher/jobs/${encodeURIComponent(job.id)}`);
        this.studio.mathPublisherJob = current;
        await this.publishState(`math-publisher:${current.status}`);
        return current;
      }
      case 'open_project':
        return await this.loadProject(args.id, 'codex-open-project');
      case 'close_project':
        this.studio.project = null;
        this.studio.projectId = null;
        localStorage.removeItem('stakeStudioLastProjectId');
        this.studio.panels = {};
        this.studio.activePanel = 'cabinet';
        this.studio.unsaved = false;
        this.studio.updateProjectName();
        document.querySelectorAll('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.panel === 'cabinet'));
        this.studio.showWelcome();
        await this.publishState('project-closed');
        await this.captureView('project-closed');
        return { closed: true };
      case 'repair_and_certify': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        const report = await this.studio.runRepairAndCertification();
        await this.publishState('repair-and-certify-complete');
        await this.captureView('repair-and-certify-complete');
        return report ? {
          status: report.status,
          beforeScore: report.beforeScore,
          afterScore: report.afterScore,
          applied: report.applied,
          deferred: report.deferred,
          certificationFingerprint: report.certificationFingerprint,
        } : null;
      }
      case 'plan_visual_pack': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'atlas' || !this.studio.panels.atlas) this.studio.activatePanel('atlas');
        const run = this.studio.panels.atlas.planVisualProduction();
        document.querySelector('.asset-production')?.scrollIntoView({ block: 'start', behavior: 'auto' });
        await wait(200);
        await this.publishState('visual-pack-planned');
        await this.captureView('visual-pack-planned');
        return {
          status: run.status,
          quality: run.quality,
          maxAttempts: run.maxAttempts,
          total: run.items.length,
          assigned: run.items.filter(item => item.state === 'assigned').length,
          protected: run.items.filter(item => item.state === 'protected').map(item => ({ key: item.key, reason: item.lastError })),
          blockers: run.blockers,
          planFingerprint: run.planFingerprint,
        };
      }
      case 'prepare_visual_work_order': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'atlas' || !this.studio.panels.atlas) this.studio.activatePanel('atlas');
        const workOrder = this.studio.panels.atlas.prepareVisualWorkOrder();
        if (!workOrder) throw new Error('Visual work order could not be prepared. Inspect the Atlas message for the blocking contract.');
        document.querySelector('.visual-work-order')?.scrollIntoView({ block: 'center', behavior: 'auto' });
        await wait(200);
        await this.publishState('visual-work-order-ready');
        await this.captureView('visual-work-order-ready');
        return {
          ...workOrder,
          referenceAttachments: workOrder.referenceAttachments.map(({ dataUrl, ...reference }) => reference),
        };
      }
      case 'ingest_visual_delivery': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'atlas' || !this.studio.panels.atlas) this.studio.activatePanel('atlas');
        const summary = await this.studio.panels.atlas.ingestVisualDelivery();
        if (summary?.error) throw new Error(summary.error);
        if (args.codexFilename) recordCodexVisualAttempt(this.studio.project, { filename: args.codexFilename });
        await this.saveProject('visual-delivery-ingested');
        document.querySelector('.visual-work-order')?.scrollIntoView({ block: 'center', behavior: 'auto' });
        await wait(200);
        await this.publishState('visual-delivery-ingested');
        await this.captureView('visual-delivery-ingested');
        return summary;
      }
      case 'start_codex_visual_batch': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'atlas' || !this.studio.panels.atlas) this.studio.activatePanel('atlas');
        startCodexVisualBatch(this.studio.project, {
          force: args.force === true,
          mode: args.mode === 'manual' ? 'manual' : 'autopilot',
          maxAttemptsPerTask: args.maxAttemptsPerTask,
        });
        await this.saveProject('codex-visual-batch-started');
        document.querySelector('.visual-work-order')?.scrollIntoView({ block: 'center', behavior: 'auto' });
        await wait(200);
        await this.publishState('codex-visual-batch-started');
        await this.captureView('codex-visual-batch-started');
        return getCodexVisualBatchSummary(this.studio.project);
      }
      case 'next_codex_visual_task': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'atlas' || !this.studio.panels.atlas) this.studio.activatePanel('atlas');
        const task = getNextCodexVisualTask(this.studio.project);
        await this.saveProject('codex-visual-task-issued');
        await this.publishState('codex-visual-task-issued');
        return { task, batch: getCodexVisualBatchSummary(this.studio.project) };
      }
      case 'codex_visual_batch_status': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        return getCodexVisualBatchSummary(this.studio.project);
      }
      case 'produce_visual_batch': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'atlas' || !this.studio.panels.atlas) this.studio.activatePanel('atlas');
        const panel = this.studio.panels.atlas;
        panel.visualProductionAuthorized = true;
        const summary = await panel.runVisualProductionBatch(Math.max(1, Math.min(10, Number(args.maxRequests) || 1)));
        document.querySelector('.asset-production')?.scrollIntoView({ block: 'start', behavior: 'auto' });
        await wait(200);
        await this.publishState('visual-batch-complete');
        await this.captureView('visual-batch-complete');
        return summary;
      }
      case 'run_factory': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (!['prototype', 'review', 'release'].includes(args.profile)) throw new Error('Factory profile must be prototype, review, or release.');
        this.studio.factoryRunProfile = args.profile;
        if (this.studio.activePanel !== 'build') this.studio.activatePanel('build');
        const main = document.getElementById('studioMain');
        const report = await this.studio.startFactoryRun(main);
        await this.publishState('factory-checkpoint');
        await this.captureView('factory-checkpoint');
        const visualTask = report?.status === 'awaiting-input' && report.resumeStage === 'visual'
          ? getNextCodexVisualTask(this.studio.project)
          : null;
        return report ? {
          id: report.id,
          profile: report.profile,
          track: report.track || 'blueprint',
          stageOrder: report.stageOrder,
          status: report.status,
          resumeStage: report.resumeStage,
          awaiting: report.awaiting,
          stages: report.stages,
          blockers: report.blockers,
          mathPreflight: report.mathPreflight || null,
          visualTask,
          visualBatch: visualTask ? getCodexVisualBatchSummary(this.studio.project) : null,
        } : null;
      }
      case 'get_factory_status': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        const report = this.studio.factoryRunReport || this.studio.project.build?.factoryRun || null;
        const visualTask = report?.status === 'awaiting-input' && report.resumeStage === 'visual'
          ? getNextCodexVisualTask(this.studio.project)
          : null;
        if (visualTask) await this.saveProject('factory-status-visual-task');
        await this.publishState('factory-status');
        return report ? {
          id: report.id,
          profile: report.profile,
          track: report.track || 'blueprint',
          stageOrder: report.stageOrder,
          status: report.status,
          resumeStage: report.resumeStage,
          awaiting: report.awaiting,
          stages: report.stages,
          blockers: report.blockers,
          mathPreflight: report.mathPreflight || null,
          visualTask,
          visualBatch: visualTask ? getCodexVisualBatchSummary(this.studio.project) : null,
        } : { status: 'idle' };
      }
      case 'launch_factory_project': {
        const { launch, report } = await this.studio.launchFactoryProject(args);
        const visualTask = report?.status === 'awaiting-input' && report.resumeStage === 'visual'
          ? getNextCodexVisualTask(this.studio.project)
          : null;
        if (visualTask) await this.saveProject('factory-launch-visual-task');
        await this.publishState('factory-project-launched');
        await this.captureView('factory-project-launched');
        return {
          launch,
          factory: report ? {
            id: report.id,
            profile: report.profile,
            track: report.track || 'blueprint',
            stageOrder: report.stageOrder,
            status: report.status,
            resumeStage: report.resumeStage,
            awaiting: report.awaiting,
            stages: report.stages,
            blockers: report.blockers,
            mathPreflight: report.mathPreflight || null,
            visualTask,
            visualBatch: visualTask ? getCodexVisualBatchSummary(this.studio.project) : null,
          } : null,
        };
      }
      case 'cancel_factory': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'build') this.studio.activatePanel('build');
        await this.studio.cancelFactoryRun(document.getElementById('studioMain'));
        await this.publishState('factory-cancelled');
        return { status: this.studio.factoryRunReport?.status || 'idle' };
      }
      case 'run_audio_mastering_audit': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'audio' || !this.studio.panels.audio) this.studio.activatePanel('audio');
        await this.studio.panels.audio.runAudioMasteringAudit();
        await this.saveProject('audio-mastering-audit');
        await this.publishState('audio-mastering-audit');
        await this.captureView('audio-mastering-audit');
        return this.studio.project.production?.audio?.masteringAudit || null;
      }
      case 'install_morpheus_effect_audio_pack': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.projectId !== 'morpheus_dreamfall') throw new Error('Open project morpheus_dreamfall first.');
        if (this.studio.activePanel !== 'audio' || !this.studio.panels.audio) this.studio.activatePanel('audio');
        const result = this.studio.panels.audio.handleGenerateMorpheusEffectPack({
          seed: Number.isFinite(Number(args.seed)) ? Number(args.seed) : 110811,
          approvalStatus: args.approvalStatus === 'approved' ? 'approved' : 'foundation',
        });
        await this.saveProject('morpheus-effect-audio-pack-installed');
        await this.publishState('morpheus-effect-audio-pack-installed');
        await this.captureView('morpheus-effect-audio-pack-installed');
        return result.audit;
      }
      case 'audition_morpheus_effect_audio_pack': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.projectId !== 'morpheus_dreamfall') throw new Error('Open project morpheus_dreamfall first.');
        if (this.studio.activePanel !== 'audio' || !this.studio.panels.audio) this.studio.activatePanel('audio');
        const result = await this.studio.panels.audio.auditionMorpheusEffectPack();
        await this.publishState('morpheus-effect-audio-pack-auditioned');
        await this.captureView('morpheus-effect-audio-pack-auditioned');
        return result;
      }
      case 'run_rig_certification': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'spine' || !this.studio.panels.spine) this.studio.activatePanel('spine');
        const summary = await this.studio.panels.spine.runAllRigCertifications();
        await this.saveProject('rig-certification');
        await this.publishState('rig-certification');
        await this.captureView('rig-certification');
        return summary;
      }
      case 'lock_art_bible': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        const fingerprint = lockArtBible(this.studio.project);
        await this.saveProject('art-bible-locked');
        await this.publishState('art-bible-locked');
        return { fingerprint, cohesion: getVisualCohesionStatus(this.studio.project) };
      }
      case 'set_creative_identity': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        const coreHook = String(args.coreHook || '').trim();
        const signatureMoment = String(args.signatureMoment || '').trim();
        const differentiators = (Array.isArray(args.differentiators) ? args.differentiators : [])
          .map(value => String(value || '').trim()).filter(Boolean);
        if (!coreHook || !signatureMoment) throw new Error('Core hook and signature moment are required.');
        if (differentiators.length < 2) throw new Error('At least two differentiators are required.');
        this.studio.project.production ||= {};
        this.studio.project.production.creative = { coreHook, signatureMoment, differentiators };
        await this.saveProject('creative-identity');
        await this.publishState('creative-identity');
        return this.studio.project.production.creative;
      }
      case 'run_visual_cohesion_audit': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'atlas' || !this.studio.panels.atlas) this.studio.activatePanel('atlas');
        await this.studio.panels.atlas.runVisualCohesionAudit();
        await this.saveProject('visual-cohesion-audit');
        await this.publishState('visual-cohesion-audit');
        await this.captureView('visual-cohesion-audit');
        return this.studio.project.production?.qa?.visualCohesionAudit || null;
      }
      case 'run_viewport_layout_audit': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        await this.studio.panels.preview.runViewportLayoutAudit();
        await this.saveProject('viewport-layout-audit');
        await this.publishState('viewport-layout-audit');
        await this.captureView('viewport-layout-audit');
        return this.studio.project.production?.qa?.viewportAudit || null;
      }
      case 'run_replay_matrix_audit': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        await this.studio.panels.preview.runReplayMatrix();
        const report = this.studio.project.production?.qa?.replayAudit || null;
        if (!report) throw new Error('The Preview replay rehearsal did not produce a report.');
        await this.saveProject('replay-matrix-audit');
        await this.publishState('replay-matrix-audit');
        await this.captureView('replay-matrix-audit');
        return report;
      }
      case 'run_game_certification': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        const certification = await this.studio.runGameCertification();
        await this.saveProject('game-certification');
        await this.publishState('game-certification');
        await this.captureView('game-certification');
        return certification;
      }
      case 'new_project':
        this.studio.newProject(args.gameType || 'ways', args.name || 'New Game');
        await this.saveProject('codex-new-project');
        return { id: this.studio.projectId, name: this.studio.project.name };
      case 'set_preview_viewport': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        if (!['desktop', 'mobile', 'mini'].includes(args.viewport)) throw new Error('Viewport must be desktop, mobile, or mini.');
        preview.viewport = args.viewport;
        preview.render();
        await wait(200);
        await this.publishState(`preview:${args.viewport}`);
        this.scheduleCapture(`preview:${args.viewport}`, 0);
        return { viewport: args.viewport };
      }
      case 'set_preview_mode': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        const mode = preview.mathEngine.getBetMode(args.mode);
        if (mode.name !== args.mode) throw new Error(`Unknown bet mode "${args.mode}".`);
        preview.selectedMode = mode.name;
        preview.bet = mode.cost || 1;
        preview.lastWin = 0;
        preview.render();
        await wait(200);
        await this.publishState(`preview-mode:${mode.name}`);
        this.scheduleCapture(`preview-mode:${mode.name}`, 0);
        return { mode: mode.name, cost: mode.cost, profile: mode.profile || null };
      }
      case 'set_preview_dashboard': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        const view = String(args.view || 'closed');
        if (!['closed', 'menu', 'modes', 'autoplay'].includes(view)) throw new Error('Dashboard view must be closed, menu, modes, or autoplay.');
        preview.showPlayerMenu = view === 'menu';
        preview.showModeMenu = view === 'modes';
        preview.showAutoMenu = view === 'autoplay';
        preview.render();
        await wait(220);
        const reason = `preview-dashboard:${view}`;
        await this.publishState(reason);
        await this.captureView(reason);
        return { view, mode: preview.selectedMode, baseBet: preview.baseBet, totalWager: preview.totalWager() };
      }
      case 'set_preview_rules': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        preview.showRules = args.open !== false;
        preview.render();
        await wait(200);
        const rulesReason = preview.showRules ? 'preview-rules:open' : 'preview-rules:closed';
        await this.publishState(rulesReason);
        this.scheduleCapture(rulesReason, 0);
        return { open: preview.showRules };
      }
      case 'set_preview_animation_state': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        const states = this.studio.project.animation?.states || {};
        if (!Object.hasOwn(states, args.state)) throw new Error(`Unknown animation state "${args.state}".`);
        preview.setAnimationState(args.state);
        await wait(260);
        const reason = `preview-animation:${args.state}`;
        await this.publishState(reason);
        await this.captureView(reason);
        return { state: args.state, character: this.studio.project.theme?.character?.name || null };
      }
      case 'audition_preview_symbol_motion': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        // A freshly activated Preview builds its DOM synchronously but loads
        // Pixi and motion atlases asynchronously. Wait for that initialization
        // to settle so the initial-board paint cannot overwrite the requested
        // audition cell a moment later.
        const readyStarted = Date.now();
        while (preview.visualEffectRuntimeStatus !== 'ready' && Date.now() - readyStarted < 12000) {
          await wait(100);
        }
        if (preview.visualEffectRuntimeStatus !== 'ready') {
          throw new Error('The Preview motion runtime did not become ready for symbol auditioning.');
        }
        const symbolName = String(args.symbol || 'GATE_OF_SLEEP');
        const symbol = this.studio.project.theme?.symbols?.find(item => item.name === symbolName || item.id === symbolName);
        if (!symbol) throw new Error(`Unknown symbol “${symbolName}”.`);
        const reel = Math.max(0, Math.min((this.studio.project.math?.grid?.reels || 1) - 1, Number(args.reel) || 2));
        const row = Math.max(0, Math.min((this.studio.project.math?.grid?.rows?.[reel] || 1) - 1, Number(args.row) || 1));
        const position = row + (preview.reelGeometry?.buffer || 2);
        const cell = preview.container.querySelector(`.reel-sym[data-reel="${reel}"][data-pos="${position}"]`);
        if (!cell) throw new Error('The requested Preview symbol cell is unavailable.');
        if (preview.board?.[reel]) preview.board[reel][row] = symbol.name;
        preview.setSymbolCell(cell, symbol.name);
        await wait(50);
        preview.syncSymbolMotionFlipbooks?.();
        await wait(Math.max(100, Math.min(2500, Number(args.captureDelay) || 360)));
        const flipbook = cell.querySelector('.reel-symbol-flipbook');
        const pixiFlipbook = preview.visualEffectRuntime?.symbolFlipbooks?.find(book => (
          book.meta?.symbol === symbol.name && book.meta?.reel === reel && book.meta?.row === row
        ));
        const reason = `preview-symbol-motion:${symbol.name}`;
        await this.publishState(reason);
        await this.captureView(reason);
        return {
          symbol: symbol.name,
          reel,
          row,
          motionAssetId: symbol.motionAssetId || null,
          flipbook: pixiFlipbook ? {
            active: true,
            renderer: pixiFlipbook.meta?.renderer || 'pixi-webgl-frame-atlas',
            fps: pixiFlipbook.fps,
            alpha: pixiFlipbook.alpha,
            blendMode: pixiFlipbook.sprite?.blendMode || null,
          } : flipbook ? {
            active: true,
            renderer: 'dom-css-background',
            backgroundPosition: getComputedStyle(flipbook).backgroundPosition,
            duration: getComputedStyle(flipbook).animationDuration,
            blendMode: getComputedStyle(flipbook).mixBlendMode,
          } : { active: false },
        };
      }
      case 'audition_preview_vfx': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        let preview = this.studio.panels.preview;
        if (args.viewport && args.viewport !== preview.viewport) {
          if (!['desktop', 'mobile', 'mini'].includes(args.viewport)) throw new Error('Viewport must be desktop, mobile, or mini.');
          preview.viewport = args.viewport;
          preview.render();
          await wait(260);
          preview = this.studio.panels.preview;
        }
        const result = await preview.auditionVisualEffect(args);
        await wait(80);
        await this.publishState(`preview-vfx:${result.phase}`);
        return result;
      }
      case 'audition_preview_presentation': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        const event = String(args.event || 'winInfo');
        const recipe = this.studio.project.presentationDirector?.recipes?.find(item => item.event === event);
        if (!recipe) throw new Error(`No presentation recipe exists for “${event}”.`);
        const mode = String(args.mode || preview.selectedMode);
        const configuredMode = preview.mathEngine.getBetMode(mode);
        if (configuredMode.name !== mode) throw new Error(`Unknown bet mode “${mode}”.`);
        preview.selectedMode = mode;
        preview.clearWinHighlights();
        const amount = Math.max(0, Number(args.amount) || (event === 'wincap' ? Number(this.studio.project.math?.wincap) : 25));
        const wins = Array.isArray(args.wins) && args.wins.length
          ? args.wins
          : [{ positions: [[0, 1], [1, 2], [2, 1], [3, 2], [4, 1], [5, 2]], symbol: 'POPPY', win: amount }];
        const payload = {
          amount,
          runningAmount: amount,
          wins,
          mode,
          spins: Math.max(1, Number(args.spins) || 10),
        };
        let result;
        if (args.soloCue) {
          const [channel, action] = String(args.soloCue).split('/');
          const cue = recipe.cues.find(item => item.enabled !== false && item.channel === channel && item.action === action);
          if (!cue) throw new Error(`No enabled ${args.soloCue} cue exists in the “${event}” recipe.`);
          await preview.executeDirectorCue(cue, payload, recipe);
          result = { status: 'auditioned', cues: [cue] };
        } else {
          result = await preview.dispatchPresentation(event, payload);
        }
        if (Number.isFinite(Number(args.freezeEnergyAt))) {
          await wait(40);
          preview.visualEffectRuntime?.seekEnergyTaps?.(Number(args.freezeEnergyAt));
        }
        await wait(Math.max(0, Math.min(2500, Number(args.captureDelay) || 260)));
        const reason = `preview-presentation:${event}`;
        await this.publishState(reason);
        await this.captureView(reason);
        const orbNodes = [...preview.container.querySelectorAll('.preview-win-orb')];
        return {
          event,
          mode,
          amount,
          cues: result?.cues?.length ?? recipe.cues.filter(cue => cue.enabled !== false).length,
          presentation: {
            winOrbs: preview.container.querySelectorAll('.preview-win-orb').length,
            svgWinPaths: preview.container.querySelectorAll('.preview-win-path').length,
            energyTap: preview.visualEffectRuntime?.getEnergyTapState?.() || null,
            ambientEnergyParticles: preview.visualEffectRuntime?.ambientEnergy?.particles?.length || 0,
            vfxCanvas: (() => {
              const canvas = preview.container.querySelector('#previewVisualEffectLayer canvas');
              return canvas ? {
                bufferWidth: canvas.width,
                bufferHeight: canvas.height,
                clientWidth: canvas.clientWidth,
                clientHeight: canvas.clientHeight,
                styleWidth: canvas.style.width,
                styleHeight: canvas.style.height,
              } : null;
            })(),
            modePortalVisible: preview.container.querySelector('#previewModePortal')?.classList.contains('is-visible') || false,
            featureResultVisible: Boolean(preview.container.querySelector('.feature-result-celebration')),
            wincapVisible: Boolean(preview.container.querySelector('.wincap-celebration')),
            orbLayer: (() => {
              const layer = preview.container.querySelector('#previewWinOrbs');
              if (!layer) return null;
              const style = getComputedStyle(layer);
              return { classes: [...layer.classList], opacity: style.opacity, display: style.display, zIndex: style.zIndex };
            })(),
            orbSamples: orbNodes.slice(0, 3).map(orb => {
              const style = getComputedStyle(orb);
              return {
                complete: orb.complete,
                naturalWidth: orb.naturalWidth,
                left: style.left,
                top: style.top,
                width: style.width,
                height: style.height,
                opacity: style.opacity,
                display: style.display,
                visibility: style.visibility,
                transform: style.transform,
                animationName: style.animationName,
              };
            }),
          },
        };
      }
      case 'profile_preview': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        await preview.runPerformanceProfile();
        const report = this.studio.project.production?.qa?.performanceAudit || null;
        if (!report) throw new Error('The Preview performance profile did not produce a report.');
        await this.saveProject('preview-performance-profile');
        await this.publishState('preview-performance-profile');
        await this.captureView('preview-performance-profile');
        return report;
      }
      case 'profile_preview_runtime': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        await preview.runPerformanceProfile();
        const report = this.studio.project.production?.qa?.performanceAudit || null;
        if (!report) throw new Error('The Preview performance profile did not produce a report.');
        // Runtime-only profiling is used when the machine cannot safely absorb
        // another full embedded-project write. It still exercises all viewports
        // but deliberately skips save and PNG capture.
        await this.publishState('preview-performance-profile-runtime');
        return report;
      }
      case 'play_morpheus_dreamfall_signature': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.projectId !== 'morpheus_dreamfall') throw new Error('Open project morpheus_dreamfall first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        if (args.viewport) {
          if (!['desktop', 'mobile', 'mini'].includes(args.viewport)) throw new Error('Viewport must be desktop, mobile, or mini.');
          preview.viewport = args.viewport;
          preview.render();
          await preview.waitForRenderFrames(3);
        }
        const report = await preview.playMorpheusDreamfallSignature({
          motion: ['normal', 'fast', 'reduced'].includes(args.motion) ? args.motion : preview.morpheusDreamfallMotionMode(),
        });
        await this.publishState('morpheus-dreamfall-signature-complete');
        await this.captureView('morpheus-dreamfall-signature-complete');
        return {
          report,
          preview: preview.getMorpheusDreamfallPreviewState(),
          playback: preview.playbackTrace || [],
        };
      }
      case 'play_morpheus_effect_proof_route': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.projectId !== 'morpheus_dreamfall') throw new Error('Open project morpheus_dreamfall first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        const routeId = ['predeterminedGeneratorDeclarations', 'nightmareReliquaryDeclarations', 'lucidFamilyMultiplierSettlement', 'tricksterGridSettlement', 'mysteryStarDreamfallTumble', 'exactMaxTermination'].includes(args.routeId)
          ? args.routeId : 'mysteryStarDreamfallTumble';
        if (args.viewport) {
          if (!['desktop', 'mobile', 'mini'].includes(args.viewport)) throw new Error('Viewport must be desktop, mobile, or mini.');
          preview.viewport = args.viewport;
          preview.render();
          await preview.waitForRenderFrames(3);
        }
        const report = await preview.playMorpheusEffectProofRoute({
          routeId,
          motion: ['normal', 'fast', 'reduced', 'none'].includes(args.motion) ? args.motion : preview.morpheusDreamfallMotionMode(),
        });
        await this.publishState(`morpheus-effect-proof:${routeId}:complete`);
        await this.captureView(`morpheus-effect-proof:${routeId}:complete`);
        return {
          report,
          preview: preview.getMorpheusEffectProofState(),
          playback: preview.playbackTrace || [],
        };
      }
      case 'run_morpheus_signature_capture_audit': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.projectId !== 'morpheus_dreamfall') throw new Error('Open project morpheus_dreamfall first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const result = await this.runMorpheusSignatureCaptureAudit(this.studio.panels.preview);
        await this.saveProject('morpheus-signature-capture-audit');
        await this.publishState('morpheus-signature-capture-audit');
        await this.captureView('morpheus-signature-capture-audit');
        return result;
      }
      case 'run_morpheus_effect_route_capture_audit': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.projectId !== 'morpheus_dreamfall') throw new Error('Open project morpheus_dreamfall first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const only = args.routeId || args.motionMode || args.viewport ? {
          routeId: args.routeId,
          motionMode: args.motionMode,
          viewport: args.viewport,
        } : null;
        if (only && (!only.routeId || !only.motionMode || !only.viewport)) {
          throw new Error('A Morpheus capture shard requires routeId, motionMode, and viewport together.');
        }
        const result = await this.runMorpheusEffectRouteCaptureAudit(this.studio.panels.preview, {
          resume: args.resume !== false,
          only,
        });
        await this.saveProject('morpheus-effect-route-capture-audit');
        await this.publishState('morpheus-effect-route-capture-audit');
        await this.captureView('morpheus-effect-route-capture-audit');
        return result;
      }
      case 'spin_preview': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        const preview = this.studio.panels.preview;
        const forcedScatters = Math.max(0, Math.min(6, Math.floor(Number(args.forceScatterCount) || 0)));
        // Live Dreamfall (5) and Live Nexus (6) are Preview buttons, not Play Motion.
        // They plant gates on a paid resolveRound from base so the well starts 6×4.
        if (forcedScatters > 0 && typeof preview.playLiveForcedScatter === 'function') {
          const liveLabel = forcedScatters >= 6 ? 'Live Nexus'
            : forcedScatters === 5 ? 'Live Dreamfall'
            : `Live ${forcedScatters}-scatter`;
          preview.playLiveForcedScatter(forcedScatters, liveLabel, { switchToBase: forcedScatters >= 5 });
        } else {
          preview.spin(forcedScatters > 0 ? { forceScatterCount: forcedScatters } : {});
        }
        const resolvedRound = preview.spinResult?.round;
        const freeSpins = Math.max(0, Number(resolvedRound?.freeSpinsPlayed) || 0);
        const completionWindowMs = Math.min(
          MAX_PREVIEW_SPIN_TIMEOUT_MS,
          BASE_PREVIEW_SPIN_TIMEOUT_MS + freeSpins * FEATURE_SPIN_PRESENTATION_BUDGET_MS,
        );
        const started = Date.now();
        while (preview.spinning && Date.now() - started < completionWindowMs) await wait(200);
        const forcedFinish = preview.spinning;
        if (forcedFinish) await Promise.resolve(preview.finishSpinImmediately());
        const round = preview.spinResult?.round;
        const finalWinningStep = [...(preview.spinResult?.steps || [])].reverse().find(step => step.wins?.length);
        if (forcedFinish && finalWinningStep && !round?.freeSpinsPlayed) {
          preview.board = finalWinningStep.board;
          preview.paintBoard(finalWinningStep.board);
          preview.clearWinHighlights();
          preview.highlightWins(finalWinningStep.wins);
          preview.setAnimationState(preview.performanceStateForWin(finalWinningStep.stepWin));
          await wait(320);
        }
        await this.publishState('preview-spin-complete');
        await this.captureView('preview-spin-complete');
        const dreamfall = preview.getMorpheusDreamfallPreviewState?.() || null;
        const paidBoard = round?.spins?.[0]?.board || preview.spinResult?.board || null;
        const scatterNames = new Set(this.studio.project?.math?.specialSymbols?.scatter || ['GATE_OF_SLEEP']);
        const plantedScatterCount = Array.isArray(paidBoard)
          ? paidBoard.reduce((sum, reel) => sum + (reel || []).filter(cell => scatterNames.has(cell?.name || cell)).length, 0)
          : 0;
        return {
          mode: preview.selectedMode,
          forceScatterCount: forcedScatters || null,
          plantedScatterCount,
          feature: dreamfall?.hud?.mode || null,
          reelRows: dreamfall?.reelRows || (preview.board || []).map(reel => reel?.length || 0),
          wager: round?.wager || preview.bet,
          totalWin: preview.spinResult?.totalWin || 0,
          freeSpins: round?.freeSpinsPlayed || 0,
          forcedFinish,
          board: preview.board,
          balance: preview.balance,
          playback: {
            events: preview.playbackTrace?.length || 0,
            elapsedMs: preview.playbackTrace?.at(-1)?.elapsedMs || 0,
            trace: preview.playbackTrace || [],
          },
        };
      }
      case 'play_published_reviewer_replay': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'preview' || !this.studio.panels.preview) this.studio.activatePanel('preview');
        let preview = this.studio.panels.preview;
        const category = String(args.category || 'normalWin');
        if (!['loss', 'normalWin', 'bigWin', 'wincap', 'bonusTrigger'].includes(category)) {
          throw new Error(`Unknown published replay category "${category}".`);
        }
        const mode = String(args.mode || preview.selectedMode);
        const configuredMode = preview.mathEngine.getBetMode(mode);
        if (configuredMode.name !== mode) throw new Error(`Unknown bet mode "${mode}".`);
        if (preview.selectedMode !== mode) {
          preview.selectedMode = mode;
          preview.bet = configuredMode.cost || 1;
          preview.lastWin = 0;
          preview.render();
          await wait(300);
          preview = this.studio.panels.preview;
        }
        const replay = await request(`/projects/${encodeURIComponent(this.studio.projectId)}/published-replay/${encodeURIComponent(mode)}/${encodeURIComponent(category)}`);
        const provenance = preview.playPublishedReviewerReplay(replay);
        const started = Date.now();
        while (preview.spinning && Date.now() - started < MAX_PREVIEW_SPIN_TIMEOUT_MS) await wait(200);
        const forcedFinish = preview.spinning;
        if (forcedFinish) await Promise.resolve(preview.finishSpinImmediately());
        const reason = `published-replay:${mode}:${category}`;
        await this.publishState(reason);
        await this.captureView(reason);
        return {
          mode,
          category,
          totalWin: Number(replay.book?.payoutMultiplier || 0) / 100,
          criteria: replay.book?.criteria || null,
          eventCount: replay.book?.events?.length || 0,
          forcedFinish,
          provenance,
          balanceUnchanged: true,
          playback: {
            events: preview.playbackTrace?.length || 0,
            elapsedMs: preview.playbackTrace?.at(-1)?.elapsedMs || 0,
            trace: preview.playbackTrace || [],
          },
        };
      }
      case 'run_studio_simulation': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        if (this.studio.activePanel !== 'simulate' || !this.studio.panels.simulate) this.studio.activatePanel('simulate');
        const dashboard = this.studio.panels.simulate;
        if (args.mode) {
          const exists = (this.studio.project.math?.betModes || []).some(mode => mode.name === args.mode);
          if (!exists) throw new Error(`Unknown bet mode "${args.mode}".`);
          dashboard.config.mode = args.mode;
        }
        if (args.rounds) dashboard.config.rounds = Math.min(Math.max(Number(args.rounds), 1000), 2000000);
        if (args.seed !== undefined) {
          dashboard.config.seed = Number(args.seed);
          dashboard.config.useSeed = true;
        }
        dashboard.runSimulation();
        const started = Date.now();
        while (dashboard.running && Date.now() - started < 30000) await wait(100);
        if (dashboard.running) throw new Error('The visible simulation did not finish within 30 seconds.');
        await this.publishState('simulation-complete');
        this.scheduleCapture('simulation-complete', 0);
        return dashboard.results ? {
          rounds: dashboard.results.rounds,
          seed: dashboard.results.seed,
          mode: dashboard.results.mode,
          targetRtp: dashboard.results.targetRtp,
          rtp: dashboard.results.rtp,
          hitRate: dashboard.results.hitRate,
          maxWin: dashboard.results.maxWin,
          stdDev: dashboard.results.stdDev,
          avgBonusSpins: dashboard.results.avgBonusSpins,
        } : null;
      }
      case 'save_project':
        await this.saveProject('codex-save');
        return { id: this.studio.projectId, saved: true };
      case 'set_wincap_allocation': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        const allocation = Number(args.rtp);
        if (!(allocation > 0 && allocation <= 0.01)) throw new Error('Max-win RTP allocation must be above 0 and no more than 0.01.');
        this.studio.project.math.wincapRtp = allocation;
        this.studio.unsaved = true;
        if (this.studio.activePanel !== 'config' || !this.studio.panels.config) this.studio.activatePanel('config');
        this.studio.panels.config.activeSection = 'math';
        this.studio.panels.config.render();
        await this.saveProject('max-win-allocation');
        await this.publishState('max-win-allocation');
        await this.captureView('max-win-allocation');
        const cap = Number(this.studio.project.math.wincap) || 0;
        return {
          rtp: allocation,
          rtpPercent: allocation * 100,
          maxWin: cap,
          baseProbability: cap > 0 ? allocation / cap : 0,
          oneInBaseBets: cap > 0 ? Math.round(cap / allocation) : null,
        };
      }
      case 'register_visual_showcase': {
        if (!this.studio.project) throw new Error('Open or create a project first.');
        const effects = ensureVisualEffects(this.studio.project);
        const recipe = createCapabilityShowcaseRecipe();
        const binding = createCapabilityShowcaseBinding();
        if (!effects.recipes.some(item => item.id === recipe.id)) effects.recipes.push(recipe);
        if (!effects.bindings.some(item => item.id === binding.id)) effects.bindings.push(binding);
        this.studio.unsaved = true;
        await this.saveProject('visual-showcase-registered');
        return { recipeId: recipe.id, bindingId: binding.id, event: binding.event };
      }
      default:
        throw new Error(`Unknown StakeStudio command: ${command}`);
    }
  }
}
