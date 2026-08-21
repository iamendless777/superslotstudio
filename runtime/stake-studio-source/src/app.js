import { createGameProject } from './engines/schema.js';
import { generateDefaultPaylines, getExecutableWinType } from './engines/math/WinTypeEngine.js';
import { GAME_TYPES, BONUS_MECHANICS, getCompatibleMechanics } from './mechanics/registry.js';
import { CabinetEditor } from './editor/cabinet/CabinetEditor.js';
import { ConfigPanel } from './editor/configurator/ConfigPanel.js';
// Preview MUST use PreviewPanelMotion (Play Motion → playStakeTumble for cluster templates).
import { PreviewPanel } from './editor/preview/PreviewPanelMotion.js';
import { ReelStripEditor } from './editor/reelstrip/ReelStripEditor.js';
import { SimulationDashboard } from './editor/simulation/SimulationDashboard.js';
import { PaytableValidator } from './engines/math/PaytableValidator.js';
import { GDDGenerator } from './engines/build/GDDGenerator.js';
import { BuildEngine } from './engines/build/BuildEngine.js';
import { getMathSDKContractFingerprint } from './engines/build/MathSDKExporter.js';
import { AudioPanel } from './editor/audio/AudioPanel.js?orchestration=20260811-2';
import { AtlasPanel } from './editor/atlas/AtlasPanel.js';
import { SpinePanel } from './editor/spine/SpinePanel.js';
import { VisualCapabilityLabPanel } from './editor/visual/VisualCapabilityLabPanel.js';
import { QualityPanel } from './editor/quality/QualityPanel.js?visual-excellence=20260813-2';
import { recordPlayerInformationQA } from './engines/quality/PlayerInformationQA.js';
import { getFlagshipScenarioLabSummary } from './engines/quality/FlagshipScenarioLab.js';
import { recordGameCertification } from './engines/quality/GameCertificationQA.js';
import {
  addSafeRepairResult,
  applySafeRepairs,
  finalizeSafeRepairRun,
} from './engines/quality/SafeRepairOrchestrator.js';
import { StudioBridge } from './bridge/StudioBridge.js?orchestration=20260815-32';
import { ensurePresentationDirector } from './engines/presentation/PresentationDirector.js';
import { stripGeneratedOverlayArt } from './editor/composition/CabinetComposition.js';
import { ensureVisualEffects } from './engines/animation/VisualEffectRecipes.js';
import { GAME_BLUEPRINTS, applyGameBlueprint, getBlueprint } from './engines/blueprints/GameBlueprintEngine.js';
import {
  FACTORY_PROFILES,
  beginFactoryRepairAttempt,
  FACTORY_STAGE_ORDER,
  createFactoryRunReport,
  finishFactoryRun,
  finishFactoryRepairAttempt,
  getCreativeFactoryGate,
  getFactoryWorkflowGate,
  getFactoryProfile,
  pauseFactoryRun,
  prepareFactoryVisualCheckpoint,
  prepareFactoryProject,
  resumeFactoryRun,
  setFactoryStage,
} from './engines/factory/FactoryRunEngine.js';
import {
  FLAGSHIP_PREPRODUCTION_STAGES,
  PRODUCTION_TRACKS,
  SPECIALTY_AGENT_ROLES,
  ensureProductionWorkflow,
  getFactoryStageOrder,
  getFlagshipWorkflowSummary,
  getProductionTrack,
  setProductionTrack,
} from './engines/factory/FlagshipWorkflow.js';
import { calibratePrototypeMath, getMathCalibrationStatus } from './engines/math/MathAutopilot.js';
import { getAssetProductionSummary } from './engines/assets/AssetProductionConductor.js';
import { prepareFactoryLaunch, validateFactoryLaunchOptions } from './engines/factory/FactoryLaunchEngine.js';
import {
  applyStudioProfileToLaunch,
  getStudioProfileReadiness,
  normalizeStudioProfile,
  STUDIO_PROFILE_DEFAULTS,
} from './engines/factory/StudioProfile.js';

if (location.hostname === 'localhost' && window.top === window.self) {
  const canonicalUrl = new URL(location.href);
  canonicalUrl.hostname = '127.0.0.1';
  location.replace(canonicalUrl.href);
}

const slug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled';

/**
 * StakeStudio — main application controller.
 * Manages the active project, coordinates between editor panels.
 */
class StakeStudio {
  constructor() {
    this.project = null;
    this.projectId = null;
    this.panels = {};
    this.activePanel = 'cabinet';
    this.unsaved = false;
    this.mathPublisherProfile = 'smoke';
    this.mathPublisherJob = null;
    this.mathPublisherTimer = null;
    this.frontendCompileStatus = null;
    this.factoryRunProfile = 'prototype';
    this.factoryRunReport = null;
    this.factoryRunTimer = null;
    this.gameCertificationRun = null;
    this.gameRepairRun = null;
    this.mathCalibrationRun = null;
    this.factoryLaunchBusy = false;
    this.studioProfile = { ...STUDIO_PROFILE_DEFAULTS };
    this.bridge = new StudioBridge(this);
  }

  async init() {
    this.renderShell();
    this.bindNav();
    this.bridge.start();
    const params = new URLSearchParams(location.search);
    const requested = String(params.get('project') || '').trim();
    const bootPanel = String(params.get('panel') || '').trim() || 'preview';
    const lastProjectId = requested || localStorage.getItem('stakeStudioLastProjectId');
    if (!lastProjectId) {
      try {
        const projects = await this.bridge.listProjects();
        const fallback = (projects || []).find((project) => (
          /morpheus/i.test(`${project.id || ''} ${project.name || ''}`)
        ));
        if (fallback?.id) {
          await this.bridge.loadProject(fallback.id, 'restore-available-project');
          this.activatePanel(bootPanel || 'preview');
          return;
        }
      } catch {
        /* fall through to welcome */
      }
      this.showWelcome();
      return;
    }
    try {
      await this.bridge.loadProject(lastProjectId, requested ? 'open-query-project' : 'restore-last-project');
      this.activatePanel(bootPanel || 'preview');
    } catch {
      localStorage.removeItem('stakeStudioLastProjectId');
      this.showWelcome();
    }
  }

  renderShell() {
    document.getElementById('app').innerHTML = `
      <div class="studio">
        <header class="studio-header">
          <div class="studio-logo">StakeStudio</div>
          <nav class="studio-nav">
            <button class="nav-btn active" data-panel="cabinet">Cabinet</button>
            <button class="nav-btn" data-panel="config">Game Config</button>
            <button class="nav-btn" data-panel="reelstrips">Reel Strips</button>
            <button class="nav-btn" data-panel="simulate">Simulate</button>
            <button class="nav-btn" data-panel="preview">Preview</button>
            <button class="nav-btn" data-panel="audio">Audio</button>
            <button class="nav-btn" data-panel="atlas">Atlas</button>
            <button class="nav-btn" data-panel="visual">FX Lab</button>
            <button class="nav-btn" data-panel="spine">Spine</button>
            <button class="nav-btn" data-panel="quality">Quality</button>
            <button class="nav-btn" data-panel="build">Build</button>
          </nav>
          <div class="studio-actions">
            <span class="bridge-status" id="bridgeStatus" data-state="connecting">Connecting…</span>
            <span class="project-name" id="projectName">No project</span>
            <button class="btn-secondary" id="btnNew">New Game</button>
            <button class="btn-secondary" id="btnSave" disabled>Save</button>
            <button class="btn-secondary" id="btnLoad">Load</button>
          </div>
        </header>
        <main class="studio-main" id="studioMain">
          <div class="welcome-screen" id="welcomeScreen"></div>
        </main>
      </div>
    `;
  }

  bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.project) return;
        this.activatePanel(btn.dataset.panel);
      });
    });

    document.getElementById('btnNew').addEventListener('click', () => this.newProject());
    document.getElementById('btnSave').addEventListener('click', () => this.saveProject());
    document.getElementById('btnLoad').addEventListener('click', () => this.loadProject());
  }

  async showWelcome() {
    const main = document.getElementById('studioMain');
    main.scrollTop = 0;
    main.innerHTML = `
      <div class="welcome-screen">
        <h1>StakeStudio</h1>
        <p class="welcome-subtitle">Slot Game Development Engine</p>
        <section class="studio-profile-card">
          <header>
            <div><span>STUDIO IDENTITY</span><h2>Your factory defaults</h2><p>Saved once, applied to every new production. Paid tools remain optional adapters.</p></div>
            <strong id="studioProfileBadge">SETUP NEEDED</strong>
          </header>
          <form id="studioProfileForm">
            <label>Provider name<input name="providerName" maxlength="80" placeholder="Your real studio/provider name"></label>
            <label>Provider number · release only<input name="providerNumber" maxlength="80" placeholder="Add when Stake assigns it"></label>
            <label>Brand pillars<input name="brandPillars" maxlength="220" placeholder="cinematic, dangerous, tactile"></label>
            <label>Default tone<select name="defaultTone">
              <option value="cinematic">Cinematic</option><option value="brutal">Brutal</option><option value="mysterious">Mysterious</option>
              <option value="triumphant">Triumphant</option><option value="playful">Playful</option><option value="luxurious">Luxurious</option>
            </select></label>
            <label>Default factory depth<select name="defaultFactoryProfile">
              <option value="review">Review · daily studio build</option><option value="prototype">Prototype · fastest proof</option><option value="release">Release · production math</option>
            </select></label>
            <label>Default production track<select name="defaultProductionTrack">
              <option value="blueprint">Blueprint · fast catalog foundation</option><option value="flagship">Flagship · contract-first custom game</option>
            </select></label>
            <label>Animation pipeline<select name="animationPipeline">
              <option value="native-spine-ready">Native now · Spine-ready later</option><option value="native-only">Native 2D only</option><option value="spine">Spine enabled</option>
            </select></label>
            <label>Audio pipeline<select name="audioPipeline">
              <option value="hybrid-generative">Generated + recorded + imported</option><option value="procedural-only">Procedural/generative only</option><option value="import-only">Imported masters only</option>
            </select></label>
            <button class="btn-secondary" type="submit">Save Studio Identity</button>
          </form>
          <div class="studio-profile-status" id="studioProfileStatus">Loading the local studio profile…</div>
        </section>
        <section class="welcome-launchpad">
          <header>
            <div>
              <span>FASTEST PATH · LOCAL-FIRST</span>
              <h2>Launch the Game Factory</h2>
              <p>Choose a fast executable blueprint or a contract-first flagship workflow that proves bespoke mechanics before production.</p>
            </div>
            <strong>NO PAID API</strong>
          </header>
          <form id="factoryLaunchForm">
            <label>Game name<input id="factoryLaunchName" name="name" maxlength="80" required placeholder="WIZARD CRAFT"></label>
            <label>Provider name<input id="factoryLaunchProvider" name="providerName" maxlength="80" required placeholder="Your real studio/provider name"></label>
            <label class="is-wide">Premise<textarea id="factoryLaunchPremise" name="premise" maxlength="600" required placeholder="Who is the host, where are we, what is at stake, and what visibly escalates?"></textarea></label>
            <label>Tone<select id="factoryLaunchTone" name="tone">
              <option value="cinematic">Cinematic</option><option value="brutal">Brutal</option><option value="mysterious">Mysterious</option>
              <option value="triumphant">Triumphant</option><option value="playful">Playful</option><option value="luxurious">Luxurious</option>
            </select></label>
            <label>Game engine<select id="factoryLaunchBlueprint" name="blueprintId">
              <option value="">Director chooses</option>
              ${Object.values(GAME_BLUEPRINTS).map(blueprint => `<option value="${blueprint.id}">${blueprint.name}</option>`).join('')}
            </select></label>
            <label>Production track<select id="factoryLaunchTrack" name="productionTrack">
              <option value="blueprint">Blueprint · fastest executable path</option>
              <option value="flagship">Flagship · preserve bespoke vision</option>
            </select></label>
            <label>Factory depth<select id="factoryLaunchProfile" name="profile">
              <option value="review">Review · daily studio build</option>
              <option value="prototype">Prototype · fastest proof</option>
              <option value="release">Release · production math</option>
            </select></label>
            <button class="btn-primary" id="factoryLaunchSubmit" type="submit">Launch Factory Project</button>
          </form>
          <div class="welcome-launch-status" id="factoryLaunchStatus">Nothing is sent to a paid service. Existing project names are protected from overwrite.</div>
        </section>
        <div class="welcome-grid">
          <button class="welcome-card" id="welcomeNew">
            <span class="welcome-icon">+</span>
            <span class="welcome-label">New Game</span>
            <span class="welcome-desc">Start from scratch with a game type</span>
          </button>
          <button class="welcome-card" id="welcomeLoad">
            <span class="welcome-icon">&#8593;</span>
            <span class="welcome-label">Load Project</span>
            <span class="welcome-desc">Open an existing game project</span>
          </button>
        </div>
        <div class="welcome-types">
          <h3>Factory Blueprints — one click to an executable starting contract</h3>
          <div class="welcome-blueprint-grid" id="welcomeBlueprintGrid"></div>
        </div>
        <div class="welcome-types">
          <h3>Quick Start — Pick a Game Type</h3>
          <div class="type-grid" id="typeGrid"></div>
        </div>
      </div>
    `;
    main.scrollTop = 0;

    const blueprintGrid = document.getElementById('welcomeBlueprintGrid');
    for (const blueprint of Object.values(GAME_BLUEPRINTS)) {
      const card = document.createElement('button');
      card.className = 'welcome-blueprint-card';
      card.innerHTML = `
        <span>${blueprint.family}</span>
        <strong>${blueprint.name}</strong>
        <p>${blueprint.signature}</p>
        <small>${blueprint.grid.reels}×${blueprint.grid.rows[0]} · ${blueprint.mechanics.length} mechanic${blueprint.mechanics.length === 1 ? '' : 's'} · ${blueprint.betModes.length} modes</small>
      `;
      card.addEventListener('click', () => this.newBlueprintProject(blueprint.id));
      blueprintGrid.appendChild(card);
    }

    const typeGrid = document.getElementById('typeGrid');
    for (const [key, type] of Object.entries(GAME_TYPES)) {
      const card = document.createElement('button');
      card.className = 'type-card';
      card.innerHTML = `
        <strong>${type.name}</strong>
        <span>${type.description}</span>
        <small>${type.defaults.reels}x${type.defaults.rows[0]} grid · ${getExecutableWinType(key) ? 'production compiler' : 'prototype only'}</small>
      `;
      card.addEventListener('click', () => this.newProject(key));
      typeGrid.appendChild(card);
    }

    document.getElementById('welcomeNew').addEventListener('click', () => this.newProject());
    document.getElementById('welcomeLoad').addEventListener('click', () => this.loadProject());
    await this.loadStudioProfile();
    this.renderStudioProfileForm();
    document.getElementById('studioProfileForm').addEventListener('submit', event => this.saveStudioProfile(event));
    document.getElementById('factoryLaunchProvider').value = this.studioProfile.providerName || '';
    document.getElementById('factoryLaunchTone').value = this.studioProfile.defaultTone;
    document.getElementById('factoryLaunchProfile').value = this.studioProfile.defaultFactoryProfile;
    document.getElementById('factoryLaunchTrack').value = this.studioProfile.defaultProductionTrack;
    if (GAME_BLUEPRINTS[this.studioProfile.defaultBlueprintId]) document.getElementById('factoryLaunchBlueprint').value = this.studioProfile.defaultBlueprintId;
    document.getElementById('factoryLaunchForm').addEventListener('submit', async event => {
      event.preventDefault();
      if (this.factoryLaunchBusy) return;
      const form = new FormData(event.currentTarget);
      const input = Object.fromEntries(form.entries());
      const button = document.getElementById('factoryLaunchSubmit');
      const status = document.getElementById('factoryLaunchStatus');
      this.factoryLaunchBusy = true;
      button.disabled = true;
      button.textContent = input.productionTrack === 'flagship' ? 'Creating flagship contract workspace…' : 'Building creative + math preflight…';
      status.className = 'welcome-launch-status is-running';
      status.textContent = input.productionTrack === 'flagship'
        ? 'Creating the vision, capability, architecture and proof gates without simplifying unsupported mechanics.'
        : 'Creating the project, compiling its blueprint, and starting the first free visual task.';
      try {
        await this.launchFactoryProject(applyStudioProfileToLaunch(this.studioProfile, input));
      } catch (error) {
        this.factoryLaunchBusy = false;
        button.disabled = false;
        button.textContent = 'Launch Factory Project';
        status.className = 'welcome-launch-status is-error';
        status.textContent = error.message;
        this.bridge?.recordError('factory-launch.ui', error);
      }
    });
  }

  async loadStudioProfile() {
    try {
      const response = await fetch('/__stake_studio/studio-profile');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load the studio profile.');
      this.studioProfile = normalizeStudioProfile(body.profile || {});
    } catch (error) {
      this.studioProfile = normalizeStudioProfile({ providerName: localStorage.getItem('stakeStudioProviderName') || '' });
      this.bridge?.recordError('studio-profile.load', error);
    }
  }

  renderStudioProfileForm(message = '') {
    const form = document.getElementById('studioProfileForm');
    if (!form) return;
    for (const [key, value] of Object.entries(this.studioProfile)) {
      const field = form.elements.namedItem(key);
      if (field) field.value = Array.isArray(value) ? value.join(', ') : (value || '');
    }
    const readiness = getStudioProfileReadiness(this.studioProfile);
    const badge = document.getElementById('studioProfileBadge');
    badge.textContent = readiness.releaseReady ? 'RELEASE READY' : readiness.productionReady ? 'PRODUCTION READY' : 'SETUP NEEDED';
    badge.dataset.state = readiness.releaseReady ? 'ready' : readiness.productionReady ? 'production' : 'missing';
    document.getElementById('studioProfileStatus').textContent = message || readiness.message;
  }

  async saveStudioProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const input = Object.fromEntries(new FormData(form).entries());
      const profile = normalizeStudioProfile({ ...this.studioProfile, ...input }, { stamp: true });
      const response = await fetch('/__stake_studio/studio-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save the studio profile.');
      this.studioProfile = normalizeStudioProfile(body.profile);
      localStorage.setItem('stakeStudioProviderName', this.studioProfile.providerName);
      document.getElementById('factoryLaunchProvider').value = this.studioProfile.providerName;
      this.renderStudioProfileForm('Studio Identity saved locally. New factory launches now inherit these defaults.');
      this.bridge.scheduleSync('studio-profile-saved');
    } catch (error) {
      document.getElementById('studioProfileStatus').textContent = error.message;
      this.bridge?.recordError('studio-profile.save', error);
    } finally {
      button.disabled = false;
    }
  }

  newProject(gameType = 'ways', name = 'New Game') {
    const type = GAME_TYPES[gameType] || GAME_TYPES.ways;
    this.factoryRunReport = null;
    this.factoryRunProfile = 'prototype';
    this.mathPublisherJob = null;
    this.frontendCompileStatus = null;

    this.project = createGameProject({
      name,
      math: {
        gameType,
        grid: { reels: type.defaults.reels, rows: [...type.defaults.rows] },
        rtp: 0.965,
        wincap: 5000,
        volatility: 'high',
        betModes: [
          { name: 'base', cost: 1.0, rtp: 0.965, maxWin: 5000, autoCloseDisabled: false, isFeature: true, isBuyBonus: false, distributions: [] },
        ],
        paylines: type.requires.includes('paylines')
          ? generateDefaultPaylines({ reels: type.defaults.reels, rows: type.defaults.rows }, type.defaults.paylineCount || 20)
          : null,
        specialSymbols: { wild: ['W'], scatter: ['S'] },
        bonusMechanics: [],
        freespinTriggers: { basegame: { 3: 10, 4: 15, 5: 20 } },
        reelStrips: {},
        distributions: [],
      },
    });

    this.projectId = this.project.build?.stakeEngine?.gameId || slug(name);
    localStorage.setItem('stakeStudioLastProjectId', this.projectId);
    if (this.project.build?.stakeEngine) this.project.build.stakeEngine.gameId = this.projectId;
    this.unsaved = true;
    this.updateProjectName();
    document.getElementById('btnSave').disabled = false;
    this.activatePanel('cabinet');
    this.bridge.scheduleSync('new-project');
  }

  newBlueprintProject(blueprintId) {
    const blueprint = getBlueprint(blueprintId);
    if (!blueprint) return;
    this.newProject(blueprint.gameType, `New ${blueprint.name}`);
    applyGameBlueprint(this.project, blueprint.id);
    this.markDirty();
    this.activatePanel('config');
    this.bridge.scheduleSync('new-blueprint-project');
  }

  async launchFactoryProject(input = {}) {
    const options = validateFactoryLaunchOptions(input);
    if (!['prototype', 'review', 'release'].includes(input.profile)) throw new Error('Factory depth must be prototype, review, or release.');
    const response = await fetch('/__stake_studio/projects');
    const catalog = await response.json();
    if (!response.ok) throw new Error(catalog.error || 'Could not verify the project library.');
    const projectId = slug(options.name);
    if ((catalog.projects || []).some(project => project.id === projectId)) {
      throw new Error(`A project named "${options.name}" already exists. Load it or choose a different name; Factory Launch will not overwrite it.`);
    }
    this.newProject('ways', options.name);
    const launch = prepareFactoryLaunch(this.project, { ...input, ...options });
    this.factoryRunProfile = input.profile;
    await this.bridge.saveProject('factory-launch-greenlit');
    this.activatePanel('build');
    const report = await this.startFactoryRun(document.getElementById('studioMain'));
    this.factoryLaunchBusy = false;
    return { launch, report };
  }

  activatePanel(panel) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.panel === panel));
    this.switchPanel(panel);
  }

  switchPanel(panel) {
    this.panels[this.activePanel]?.destroy?.();
    if (panel !== 'build' && this.mathPublisherTimer) {
      clearTimeout(this.mathPublisherTimer);
      this.mathPublisherTimer = null;
    }
    this.activePanel = panel;
    const main = document.getElementById('studioMain');

    switch (panel) {
      case 'cabinet':
        this.panels.cabinet = new CabinetEditor(main, this.project, () => this.markDirty());
        break;
      case 'config':
        this.panels.config = new ConfigPanel(main, this.project, () => this.markDirty());
        break;
      case 'reelstrips':
        this.panels.reelstrips = new ReelStripEditor(main, this.project, () => this.markDirty());
        break;
      case 'simulate':
        this.panels.simulate = new SimulationDashboard(main, this.project);
        break;
      case 'preview':
        this.panels.preview = new PreviewPanel(main, this.project, () => this.markDirty(), this.projectId);
        break;
      case 'audio':
        this.panels.audio = new AudioPanel(main, this.project, () => this.markDirty());
        break;
      case 'atlas':
        this.panels.atlas = new AtlasPanel(main, this.project, () => this.markDirty(), this.projectId);
        break;
      case 'visual':
        this.panels.visual = new VisualCapabilityLabPanel(main, this.project, () => this.markDirty(), this.bridge);
        break;
      case 'spine':
        this.panels.spine = new SpinePanel(main, this.project, () => this.markDirty());
        break;
      case 'quality':
        this.panels.quality = new QualityPanel(
          main,
          this.project,
          () => this.markDirty(),
          destination => this.activatePanel(destination),
          () => this.runGameCertification(),
          () => this.runRepairAndCertification(),
        );
        break;
      case 'build':
        this.renderBuildPanel(main);
        break;
    }
    this.bridge?.afterRender(`panel:${panel}`);
  }

  updateGameCertificationProgress(stage, detail, current, total) {
    let element = document.getElementById('gameCertificationProgress');
    if (!element) {
      element = document.createElement('div');
      element.id = 'gameCertificationProgress';
      element.className = 'game-certification-progress';
      document.body.appendChild(element);
    }
    element.innerHTML = `<b>${current}/${total}</b><span><strong>${this.escapeHtml(stage)}</strong><small>${this.escapeHtml(detail)}</small></span>`;
    this.bridge?.scheduleCapture(`certify:${stage}`, 80);
  }

  finishGameCertificationProgress(message, passed = false) {
    this.gameCertificationRun = { running: false, message, passed };
    const element = document.getElementById('gameCertificationProgress');
    if (!element) return;
    element.classList.add(passed ? 'is-passed' : 'is-blocked');
    element.innerHTML = `<b>${passed ? '✓' : '!'}</b><span><strong>${passed ? 'Game certified' : 'Certification complete'}</strong><small>${this.escapeHtml(message)}</small></span>`;
    window.setTimeout(() => element.remove(), 3200);
  }

  async runGameCertification() {
    if (!this.project || this.gameCertificationRun?.running) return null;
    this.gameCertificationRun = { running: true };
    const total = 8;
    try {
      this.updateGameCertificationProgress('Visual pack', 'Decoding assets and measuring whole-pack cohesion…', 1, total);
      this.activatePanel('atlas');
      await this.panels.atlas.runVisualCohesionAudit();

      this.updateGameCertificationProgress('Rig', 'Testing structure, motion, events and extreme deformation…', 2, total);
      if ((this.project.animation?.spineAssets || []).length) {
        this.activatePanel('spine');
        await this.panels.spine.runAllRigCertifications((current, count, asset) => {
          this.updateGameCertificationProgress('Rig', `${asset.name} · ${current}/${count} rigs`, 2, total);
        });
      }

      this.updateGameCertificationProgress('Presentation', 'Stress-testing interruptions and measured polish…', 3, total);
      this.activatePanel('preview');
      recordPlayerInformationQA(this.project);
      await this.panels.preview.runDirectorTortureTest();

      this.updateGameCertificationProgress('Replay', 'Rehearsing deterministic player journeys and seeded rounds…', 4, total);
      await this.panels.preview.runReplayMatrix();

      this.updateGameCertificationProgress('Layout', 'Measuring desktop, mobile and mini safe zones…', 5, total);
      await this.panels.preview.runViewportLayoutAudit();

      this.updateGameCertificationProgress('Performance', 'Profiling frame pacing and texture memory on every viewport…', 6, total);
      await this.panels.preview.runPerformanceProfile();

      this.updateGameCertificationProgress('Audio', 'Decoding, mastering and checking cue synchronization…', 7, total);
      this.activatePanel('audio');
      await this.panels.audio.runAudioMasteringAudit();

      this.updateGameCertificationProgress('Release verdict', 'Combining every fingerprinted audit into one certificate…', 8, total);
      const certification = recordGameCertification(this.project);
      this.markDirty();
      this.activatePanel('quality');
      this.finishGameCertificationProgress(
        certification.complete
          ? `${certification.score}/100 with every release gate passed.`
          : `${certification.blockers} blockers and ${certification.warnings} improvements are ordered in the repair queue.`,
        certification.complete,
      );
      return certification;
    } catch (error) {
      let certification = null;
      try { certification = recordGameCertification(this.project); } catch { /* Preserve the original audit failure. */ }
      this.markDirty();
      this.activatePanel('quality');
      this.finishGameCertificationProgress(`The audit runner stopped: ${error.message || error}`);
      await this.bridge?.recordError?.('qa.game-certification', error);
      return certification;
    }
  }

  async runRepairAndCertification() {
    if (!this.project || this.gameRepairRun?.running || this.gameCertificationRun?.running) return null;
    this.gameRepairRun = { running: true };
    let report = null;
    try {
      this.updateGameCertificationProgress('Safe repairs', 'Applying deterministic fixes while preserving authored work…', 1, 3);
      report = applySafeRepairs(this.project);
      this.markDirty();
      await this.bridge.saveProject('safe-repairs-applied');

      this.updateGameCertificationProgress('Frontend', 'Compiling wallet, replay, jurisdiction, rules and responsive contracts…', 2, 3);
      try {
        const response = await fetch(`/__stake_studio/projects/${encodeURIComponent(this.projectId)}/frontend-compiler/build`, { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Frontend compiler failed.');
        const { root, projectId, ...frontend } = result;
        this.project.build ||= {};
        this.project.build.frontend = frontend;
        addSafeRepairResult(report, {
          id: 'frontend-compile',
          label: 'Stake frontend',
          detail: `${frontend.files.length} files · ${Number(frontend.totalBytes).toLocaleString()} bytes · all five platform capabilities compiled.`,
        });
      } catch (error) {
        addSafeRepairResult(report, { id: 'frontend-compile', applied: false, reason: error.message || String(error) });
      }
      this.markDirty();
      await this.bridge.saveProject('safe-repairs-frontend');

      this.updateGameCertificationProgress('Certification', 'Rerunning every measured audit against the repaired project…', 3, 3);
      const certification = await this.runGameCertification();
      const finalized = finalizeSafeRepairRun(this.project, certification);
      this.markDirty();
      this.activatePanel('quality');
      this.finishGameCertificationProgress(
        certification?.complete
          ? `${finalized.applied.length} safe repairs applied; the game is certified.`
          : `${finalized.applied.length} safe repairs applied; ${finalized.deferred.length} decisions or production assets remain.`,
        Boolean(certification?.complete),
      );
      return finalized;
    } catch (error) {
      if (report) addSafeRepairResult(report, { id: 'repair-run', applied: false, reason: error.message || String(error) });
      this.markDirty();
      this.activatePanel('quality');
      this.finishGameCertificationProgress(`Repair run stopped: ${error.message || error}`);
      await this.bridge?.recordError?.('qa.safe-repair', error);
      return report;
    } finally {
      this.gameRepairRun = { running: false };
    }
  }

  markDirty() {
    this.unsaved = true;
    this.updateProjectName();
    this.bridge.scheduleSync('project-edit');
  }

  updateProjectName() {
    const element = document.getElementById('projectName');
    if (!element) return;
    element.textContent = this.project ? `${this.project.name}${this.unsaved ? ' *' : ''}` : 'No project';
  }

  async saveProject() {
    if (!this.project) return;
    await this.bridge.saveProject('manual-save');
    this.bridge.scheduleCapture('manual-save', 150);
  }

  async loadProject() {
    try {
      const projects = await this.bridge.listProjects();
      if (projects.length) {
        const choices = projects.map(project => `${project.id} — ${project.name}`).join('\n');
        const requested = window.prompt(`Open a shared StakeStudio project by id:\n\n${choices}`, projects[0].id);
        if (requested) await this.bridge.loadProject(requested.trim());
        return;
      }
    } catch (error) {
      await this.bridge.recordError('ui.load-projects', error);
    }
    this.importProjectFile();
  }

  importProjectFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const project = JSON.parse(text);
      this.replaceProject(project, project.build?.stakeEngine?.gameId || slug(project.name));
      this.unsaved = true;
      this.updateProjectName();
      this.bridge.scheduleSync('file-import');
    });
    input.click();
  }

  replaceProject(project, id) {
    const destination = this.project && this.activePanel ? this.activePanel : 'cabinet';
    this.project = project;
    stripGeneratedOverlayArt(this.project);
    ensurePresentationDirector(this.project);
    ensureVisualEffects(this.project);
    ensureProductionWorkflow(this.project);
    this.projectId = id || project.build?.stakeEngine?.gameId || slug(project.name);
    localStorage.setItem('stakeStudioLastProjectId', this.projectId);
    if (this.project.build?.stakeEngine) this.project.build.stakeEngine.gameId = this.projectId;
    this.factoryRunReport = this.project.build?.factoryRun || null;
    if (this.factoryRunReport?.profile in FACTORY_PROFILES) this.factoryRunProfile = this.factoryRunReport.profile;
    if (this.factoryRunReport?.status === 'running' && this.factoryRunReport.mathJobId) {
      this.mathPublisherJob = { id: this.factoryRunReport.mathJobId, status: 'running', profile: this.factoryRunReport.mathProfile };
    }
    this.panels = {};
    this.unsaved = false;
    this.updateProjectName();
    document.getElementById('btnSave').disabled = false;
    this.activatePanel(destination);
  }

  renderBuildPanel(main) {
    const buildEngine = new BuildEngine(this.project);
    const validation = buildEngine.validate();
    // The Build dashboard rerenders throughout factory progress. Keep this
    // overview bounded; Math Autopilot and final certification record the
    // larger deterministic evidence instead of freezing the UI on every paint.
    const readiness = buildEngine.validateReadiness({ rounds: 5000 });
    const quality = readiness.quality;
    const validator = new PaytableValidator(this.project);
    const paytableIssues = validator.validate();
    const paytableBlocking = paytableIssues.filter(issue => issue.severity === 'error');
    const releaseReady = readiness.valid && paytableBlocking.length === 0;
    const simulations = readiness.simulations || [readiness.simulation].filter(Boolean);
    const rtpWithinTolerance = simulations.every(sim => Math.abs(sim.delta) <= sim.allowedDelta);
    const mathPublish = this.project.build?.mathPublish || {};
    let currentMathContract = null;
    try { currentMathContract = getMathSDKContractFingerprint(this.project); } catch { /* build validation shows compiler errors */ }
    const mathContractFresh = Boolean(currentMathContract && mathPublish.contractFingerprint === currentMathContract);
    const mathPublishReady = Boolean(mathPublish.officialVerification && mathPublish.fullStreamIntegrity && mathContractFresh && Number(mathPublish.totalBooks) > 0);
    const publishedModeReports = Array.isArray(mathPublish.modeReports) ? mathPublish.modeReports : [];
    const frontend = this.project.build?.frontend || {};
    const frontendCapabilities = frontend.capabilities || {};
    const frontendReady = Boolean(frontend.entry && Array.isArray(frontend.files) && frontend.files.length && ['walletLifecycle', 'replay', 'jurisdiction', 'serverOwnedBalance', 'responsive'].every(key => frontendCapabilities[key]));
    const factoryReport = this.factoryRunReport || this.project.build?.factoryRun || null;
    const factoryProfile = getFactoryProfile(this.factoryRunProfile);
    const factoryRunning = factoryReport?.status === 'running';
    const factoryAwaiting = factoryReport?.status === 'awaiting-input';
    const factoryActive = factoryRunning || factoryAwaiting;
    const creativeGate = getCreativeFactoryGate(this.project);
    const productionTrack = getProductionTrack(this.project);
    const flagshipWorkflow = getFlagshipWorkflowSummary(this.project);
    const flagshipScenarios = productionTrack === 'flagship' ? getFlagshipScenarioLabSummary(this.project) : null;
    const factoryStageOrder = factoryReport?.stageOrder || getFactoryStageOrder(productionTrack);
    const visualProduction = getAssetProductionSummary(this.project);
    const mathCalibration = getMathCalibrationStatus(this.project);
    const localMathReports = mathCalibration.calibration?.modes || [];

    main.innerHTML = `
      <div class="build-panel">
        <div class="build-section">
          <h2>Build Pipeline</h2>
          <p class="section-desc">Validate, generate configs, export GDD, and package your game.</p>
        </div>

        <section class="factory-run-card">
          <div class="factory-run-heading">
            <div>
              <span>ONE-BUTTON STUDIO CONDUCTOR</span>
              <h2>${productionTrack === 'flagship' ? 'Flagship Game Factory' : 'Game Factory'}</h2>
              <p>${productionTrack === 'flagship'
                ? 'Freeze the vision, research, mechanic contract, capability map and architecture; prove hard risks and a signature vertical slice; then enter full production without silent simplification.'
                : 'Greenlight the creative contract, assemble the visual pack, master audio, compile the Stake frontend, execute official math, run browser certification, and unlock one release package.'}</p>
            </div>
            <div class="factory-run-verdict is-${this.escapeHtml(factoryReport?.status || 'idle')}">${this.escapeHtml((factoryReport?.status || 'Ready').replaceAll('-', ' '))}</div>
          </div>
          <div class="factory-track-grid">
            ${Object.values(PRODUCTION_TRACKS).map(track => `
              <button class="factory-track ${productionTrack === track.id ? 'is-selected' : ''}" data-production-track="${track.id}" ${factoryActive ? 'disabled' : ''}>
                <strong>${track.label}</strong><span>${track.description}</span>
              </button>
            `).join('')}
          </div>
          <div class="factory-profile-grid">
            ${Object.values(FACTORY_PROFILES).map(profile => `
              <button class="factory-profile ${this.factoryRunProfile === profile.id ? 'is-selected' : ''}" data-factory-profile="${profile.id}" ${factoryActive ? 'disabled' : ''}>
                <strong>${profile.label}</strong>
                <span>${profile.description}</span>
              </button>
            `).join('')}
          </div>
          <div class="factory-stage-grid">
            ${factoryStageOrder.map((stage, index) => {
              const value = factoryReport?.stages?.[stage] || { status: 'pending', message: 'Waiting' };
              return `<div class="factory-stage is-${this.escapeHtml(value.status)}" ${value.panel ? `data-factory-stage-panel="${this.escapeHtml(value.panel)}"` : ''}><b>${index + 1}</b><span><strong>${stage}</strong><small>${this.escapeHtml(value.message)}</small></span></div>`;
            }).join('')}
          </div>
          <div class="factory-run-actions">
            <button class="btn-primary" id="btnRunFactory" ${factoryRunning ? 'disabled' : ''}>${factoryRunning ? 'Factory running…' : factoryAwaiting ? `Resume at ${this.escapeHtml(factoryReport.resumeStage || 'checkpoint')}` : factoryProfile.id === 'release' ? 'Run Release Factory · production counts' : `Run ${factoryProfile.label} Factory`}</button>
            <button class="btn-secondary" id="btnCancelFactory" ${factoryActive ? '' : 'disabled'}>Cancel run</button>
            ${factoryAwaiting && factoryReport.awaiting?.panel ? `<button class="btn-secondary" id="btnOpenFactoryCheckpoint">Open ${this.escapeHtml(factoryReport.awaiting.action || factoryReport.awaiting.stage)}</button>` : ''}
            <span>${factoryAwaiting ? 'Checkpoint saved. Complete the requested work, then resume without repeating finished stages.' : factoryProfile.id === 'release' ? 'Explicit production run: optimizer and configured book counts will execute.' : 'Safe daily profile: production optimization will not execute.'}</span>
          </div>
          <div class="factory-gate-summary">
            <span class="${creativeGate.complete ? 'is-ready' : ''}"><b>${creativeGate.complete ? '✓' : creativeGate.missing.length}</b> Creative greenlight</span>
            ${productionTrack === 'flagship' ? `
              <span class="${flagshipWorkflow.readyForProduction ? 'is-ready' : ''}"><b>${flagshipWorkflow.completedGates}/${flagshipWorkflow.totalGates}</b> Flagship proof gates</span>
              <span class="${flagshipWorkflow.fidelity.complete ? 'is-ready' : ''}"><b>${flagshipWorkflow.fidelity.proven}/${flagshipWorkflow.fidelity.total}</b> Vision promises proven</span>
              <span class="${flagshipWorkflow.agentPolicyEnforced ? 'is-ready' : ''}"><b>${flagshipWorkflow.agentPolicyEnforced ? '✓' : '!'}</b> Specialist handoffs governed</span>
              <span class="${flagshipScenarios.complete ? 'is-ready' : ''}"><b>${flagshipScenarios.passing}/${flagshipScenarios.scenarios}</b> Deterministic scenarios</span>
              <span class="${flagshipScenarios.interactions.complete ? 'is-ready' : ''}"><b>${flagshipScenarios.interactions.covered}/${flagshipScenarios.interactions.requiredPairs}</b> Interaction pairs</span>
            ` : ''}
            <span class="${visualProduction.complete ? 'is-ready' : ''}"><b>${visualProduction.assigned}/${visualProduction.total || 0}</b> Visual production</span>
            <span class="${mathCalibration.complete ? 'is-ready' : ''}"><b>${mathCalibration.alignedModes}/${mathCalibration.totalModes}</b> Local math calibration</span>
            <span class="${this.project.production?.qa?.gameCertification?.passed ? 'is-ready' : ''}"><b>${this.project.production?.qa?.gameCertification?.passed ? '✓' : '○'}</b> Browser certificate</span>
          </div>
          ${productionTrack === 'flagship' ? `
            <details class="flagship-workflow-details" ${flagshipWorkflow.readyForProduction ? '' : 'open'}>
              <summary>Flagship proof board · ${flagshipWorkflow.completedGates}/${flagshipWorkflow.totalGates} gates · ${Object.keys(SPECIALTY_AGENT_ROLES).length} governed specialist lanes</summary>
              <div class="flagship-proof-grid">
                ${Object.values(flagshipWorkflow.gates).map(gate => `<div class="${gate.complete ? 'is-ready' : ''}"><b>${gate.complete ? '✓' : '○'}</b><span><strong>${this.escapeHtml(gate.label)}</strong><small>${this.escapeHtml(gate.message)}</small></span></div>`).join('')}
              </div>
              <div class="flagship-agent-grid">
                ${Object.entries(SPECIALTY_AGENT_ROLES).map(([id, role]) => `<div><span>${this.escapeHtml(id)}</span><strong>${this.escapeHtml(role.label)}</strong><small>${this.escapeHtml(role.owns.join(' · '))}</small></div>`).join('')}
              </div>
            </details>
          ` : ''}
          ${factoryReport?.blockers?.length ? `<details class="factory-blockers"><summary>${factoryReport.blockers.length} remaining blocker${factoryReport.blockers.length === 1 ? '' : 's'}</summary><ul>${factoryReport.blockers.slice(0, 20).map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul></details>` : ''}
        </section>

        <div class="build-cards">
          <div class="build-card">
            <h3>Declared Compliance</h3>
            <div class="validation-status ${validation.valid ? 'valid' : 'invalid'}">
              ${validation.valid ? 'All checks passed' : `${validation.errors.length} issue(s)`}
            </div>
            ${validation.errors.length > 0 ? `
              <ul class="validation-errors">
                ${validation.errors.map(e => `<li>${e}</li>`).join('')}
              </ul>
            ` : ''}
          </div>

          <div class="build-card">
            <h3>Paytable Validation</h3>
            <div class="validation-status ${paytableBlocking.length === 0 ? 'valid' : 'invalid'}">
              ${paytableIssues.length === 0 ? 'All checks passed' : `${paytableBlocking.length} blocking, ${paytableIssues.length - paytableBlocking.length} advisory`}
            </div>
            ${paytableIssues.length > 0 ? `
              <ul class="validation-errors">
                ${paytableIssues.map(i => `
                  <li class="issue-${i.severity}">
                    <span class="issue-badge ${i.severity}">${i.severity}</span>
                    ${i.message}
                  </li>
                `).join('')}
              </ul>
            ` : ''}
          </div>

          <div class="build-card">
            <h3>Realized Math</h3>
            <div class="validation-status ${rtpWithinTolerance ? 'valid' : 'invalid'}">
              ${rtpWithinTolerance ? 'Every mode is statistically aligned' : 'One or more modes are outside tolerance'}
            </div>
            <ul class="validation-errors">
              ${simulations.map(sim => {
                const aligned = Math.abs(sim.delta) <= sim.allowedDelta;
                return `<li class="${aligned ? '' : 'issue-error'}"><strong>${sim.mode}</strong>: ${(sim.realizedRtp * 100).toFixed(3)}% RTP, ${(sim.hitRate * 100).toFixed(2)}% hit rate, ${sim.maxWin.toFixed(2)}x observed max (${sim.rounds.toLocaleString()} rounds)</li>`;
              }).join('')}
            </ul>
          </div>

          <div class="build-card math-autopilot-card">
            <h3>Local Math Autopilot</h3>
            <div class="validation-status ${mathCalibration.complete ? 'valid' : 'invalid'}">
              ${this.mathCalibrationRun?.state === 'running' ? 'Calibrating every wager mode…' : mathCalibration.complete ? `${mathCalibration.alignedModes}/${mathCalibration.totalModes} modes calibrated` : mathCalibration.stale ? 'Calibration is stale' : 'Calibration required'}
            </div>
            <ul class="validation-errors">
              ${localMathReports.length ? localMathReports.map(mode => `<li class="${mode.aligned ? '' : 'issue-error'}"><strong>${this.escapeHtml(mode.name)}</strong>: ${(Number(mode.realizedRtp) * 100).toFixed(3)}% local RTP · ${(Number(mode.declaredRtp) * 100).toFixed(3)}% declared · ${Number(mode.rounds).toLocaleString()} deterministic rounds</li>`).join('') : '<li>No local calibration evidence yet</li>'}
            </ul>
            <button class="btn-small" id="btnCalibrateMath" ${this.mathCalibrationRun?.state === 'running' || factoryRunning || this.mathPublisherJob?.status === 'running' ? 'disabled' : ''}>${mathCalibration.complete ? 'Recalibrate Local Math' : 'Calibrate Local Math'}</button>
            <small>Adjusts each wager mode independently without flattening symbol values. No API or paid service is used; production LUT optimization remains a separate official release step.</small>
            ${this.mathCalibrationRun?.state === 'failed' ? `<p class="issue-error">${this.escapeHtml(this.mathCalibrationRun.message)}</p>` : ''}
          </div>

          <div class="build-card">
            <h3>Production Math</h3>
            <div class="validation-status ${mathPublishReady ? 'valid' : 'invalid'}">
              ${mathPublishReady ? 'Official verification passed' : 'Production books are not verified'}
            </div>
            <ul class="validation-errors">
              <li><strong>${Number(mathPublish.totalBooks || 0).toLocaleString()}</strong> staged books · ${this.escapeHtml(mathPublish.profile || 'none')} profile</li>
              ${publishedModeReports.length ? publishedModeReports.map(mode => {
                const exact = Number(mode.exactRtp);
                const target = Number(mode.declaredRtp);
                const delta = Number(mode.delta);
                const aligned = Number.isFinite(delta) && Math.abs(delta) <= 1e-8;
                const normalizedCvar = Number(mode.tailAnalysis?.costNormalized?.cvar);
                const tailSummary = Number.isFinite(normalizedCvar) ? ` · ${normalizedCvar.toFixed(2)}× cost-normalized tail CVaR` : '';
                return `<li class="${aligned ? '' : 'issue-error'}"><strong>${this.escapeHtml(mode.name)}</strong>: ${(exact * 100).toFixed(5)}% exact LUT RTP · ${(target * 100).toFixed(5)}% target${aligned ? ' · aligned' : ` · ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(5)} points`}${tailSummary}</li>`;
              }).join('') : '<li>No published mode reports yet</li>'}
              <li>Full compressed book/LUT stream integrity: <strong>${mathPublish.fullStreamIntegrity ? 'passed' : 'pending'}</strong></li>
              <li>Executable mechanic contract: <strong>${mathContractFresh ? `current · ${this.escapeHtml(currentMathContract)}` : 'stale — republish required'}</strong></li>
              ${publishedModeReports.some(mode => mode.tailAnalysis?.sdkAdvisories?.length) ? '<li>Official SDK raw tail-limit messages are recorded as advisory; paid-mode review uses the cost-normalized values shown above.</li>' : ''}
            </ul>
          </div>

          <div class="build-card">
            <h3>Professional Quality</h3>
            <div class="validation-status ${quality.releaseReady ? 'valid' : 'invalid'}">
              ${quality.releaseReady ? `${quality.score}/100 — every discipline passed` : `${quality.score}/100 — quality gate blocked`}
            </div>
            <ul class="validation-errors">
              <li><strong>${quality.blockers.length}</strong> hard blockers</li>
              <li><strong>${quality.weakCategories.length}</strong> disciplines below the ${quality.categoryFloor}-point floor</li>
              <li><strong>${quality.warnings.length}</strong> improvement opportunities</li>
            </ul>
            <button class="btn-small" id="btnOpenQuality">Open Quality Director</button>
          </div>

          <div class="build-card frontend-compiler-card">
            <div class="math-publisher-heading">
              <div>
                <span>Platform shell automation</span>
                <h3>Stake Frontend Compiler</h3>
                <p>Package the wallet lifecycle, mandatory replay, jurisdiction behavior, server-owned balance, rules panel, and responsive desktop/mobile/mini shell around this game.</p>
              </div>
              <div class="validation-status ${frontendReady ? 'valid' : 'invalid'}">${frontendReady ? 'Platform shell compiled' : 'Frontend required'}</div>
            </div>
            <div class="frontend-capability-grid">
              ${[
                ['walletLifecycle', 'Wallet lifecycle'], ['replay', 'Sessionless replay'], ['jurisdiction', 'Jurisdiction flags'],
                ['serverOwnedBalance', 'Server balance'], ['responsive', 'Responsive views'],
              ].map(([key, label]) => `<div class="${frontendCapabilities[key] ? 'is-ready' : ''}"><span>${frontendCapabilities[key] ? '✓' : '○'}</span><strong>${label}</strong></div>`).join('')}
            </div>
            <div class="frontend-compiler-actions">
              <button class="btn-primary" id="btnCompileFrontend" ${this.frontendCompileStatus?.state === 'running' ? 'disabled' : ''}>${this.frontendCompileStatus?.state === 'running' ? 'Compiling…' : frontendReady ? 'Recompile Stake Frontend' : 'Compile Stake Frontend'}</button>
              <button class="btn-secondary" id="btnPreviewFrontend" ${frontendReady ? '' : 'disabled'}>Open Responsive Preview</button>
              <span>${frontendReady ? `${Number(frontend.totalBytes || 0).toLocaleString()} bytes · ${frontend.files.length} files · compiler v${frontend.version || 1}` : 'No packaged frontend yet'}</span>
            </div>
            ${this.frontendCompileStatus ? `<div class="frontend-compile-status is-${this.frontendCompileStatus.state}"><strong>${this.escapeHtml(this.frontendCompileStatus.title)}</strong><span>${this.escapeHtml(this.frontendCompileStatus.message)}</span></div>` : ''}
          </div>

          <div class="build-card math-publisher-card">
            <div class="math-publisher-heading">
              <div>
                <span>Official SDK automation</span>
                <h3>Math Publisher</h3>
                <p>Generate the Python game, execute Stake's math-sdk, stage the library, then compare every compressed book with every LUT row.</p>
              </div>
              <div class="validation-status ${mathPublishReady ? 'valid' : 'invalid'}">${mathPublishReady ? 'Release math verified' : 'Awaiting production run'}</div>
            </div>
            <div class="math-publisher-controls">
              <label>Run profile
                <select id="mathPublisherProfile" ${this.mathPublisherJob?.status === 'running' ? 'disabled' : ''}>
                  <option value="smoke" ${this.mathPublisherProfile === 'smoke' ? 'selected' : ''}>Smoke · up to 1,000 books/mode</option>
                  <option value="draft" ${this.mathPublisherProfile === 'draft' ? 'selected' : ''}>Draft · up to 25,000 books/mode</option>
                  <option value="production" ${this.mathPublisherProfile === 'production' ? 'selected' : ''}>Production · configured counts + Rust optimizer + official analysis</option>
                </select>
              </label>
              <button class="btn-primary" id="btnRunMathPublisher" ${this.mathPublisherJob?.status === 'running' ? 'disabled' : ''}>${this.mathPublisherJob?.status === 'running' ? 'Publisher running…' : 'Prepare + Run Official Publisher'}</button>
              <button class="btn-secondary" id="btnCancelMathPublisher" ${this.mathPublisherJob?.status === 'running' ? '' : 'disabled'}>Cancel</button>
            </div>
            <div class="math-publisher-note">
              <strong>Production counts:</strong>
              ${(this.project.math.betModes || []).map(mode => `${mode.name} ${(Number(this.project.build?.simulations?.[mode.name]) || Number(this.project.build?.simulations?.base) || 0).toLocaleString()}`).join(' · ') || 'No modes configured'}
            </div>
            <div class="math-publisher-status" id="mathPublisherStatus"></div>
          </div>

          <div class="build-card">
            <h3>Production Readiness</h3>
            <div class="validation-status ${releaseReady ? 'valid' : 'invalid'}">
              ${releaseReady ? 'Ready to package' : 'Release blocked'}
            </div>
            ${readiness.issues.length > 0 ? `
              <ul class="validation-errors">
                ${readiness.issues.map(issue => `
                  <li class="issue-${issue.severity}">
                    <span class="issue-badge ${issue.severity}">${issue.severity}</span>
                    ${issue.message}
                  </li>
                `).join('')}
              </ul>
            ` : ''}
          </div>

          <div class="build-card">
            <h3>Export for Stake Engine review</h3>
            <p>Upload both halves in the Stake Engine dashboard: <strong>Math</strong> (books / LUT / index from the official math-sdk publisher) and <strong>Frontend</strong> (compiled static shell). Then submit that pair for review. Cabinet layers, Preview motion, and this zip are the same game.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
              <button class="btn-secondary" id="btnGenSDK">Export math-sdk Game Folder (.zip)</button>
              <button class="btn-secondary" id="btnGenGDD">Export Game Design Document</button>
              <button class="btn-secondary" id="btnExportBundle" ${releaseReady ? '' : 'disabled'}>Export Stake Release (.zip)</button>
              ${releaseReady ? '' : '<small class="issue-error">Resolve every blocking issue before release export.</small>'}
            </div>
          </div>
        </div>
      </div>
    `;

    main.querySelector('#btnGenSDK')?.addEventListener('click', async () => {
      const { createZip } = await import('./engines/build/zip.js');
      const files = buildEngine.generateMathSDKFiles();
      const gameId = Object.keys(files)[0].split('/')[1];
      const url = URL.createObjectURL(createZip(files));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${gameId}_math_sdk.zip`;
      a.click();
      URL.revokeObjectURL(url);
    });

    main.querySelectorAll('[data-factory-profile]').forEach(button => button.addEventListener('click', event => {
      this.factoryRunProfile = event.currentTarget.dataset.factoryProfile;
      this.renderBuildPanel(main);
    }));
    main.querySelectorAll('[data-production-track]').forEach(button => button.addEventListener('click', event => {
      const previous = getProductionTrack(this.project);
      const workflow = setProductionTrack(this.project, event.currentTarget.dataset.productionTrack);
      if (workflow.track === previous) return;
      this.factoryRunReport = null;
      this.markDirty();
      this.renderBuildPanel(main);
      this.bridge.scheduleSync(`production-track:${workflow.track}`);
    }));
    main.querySelector('#btnRunFactory')?.addEventListener('click', () => this.startFactoryRun(main));
    main.querySelector('#btnCancelFactory')?.addEventListener('click', () => this.cancelFactoryRun(main));
    main.querySelector('#btnOpenFactoryCheckpoint')?.addEventListener('click', () => this.activatePanel(factoryReport.awaiting.panel));
    main.querySelectorAll('[data-factory-stage-panel]').forEach(stage => stage.addEventListener('click', () => this.activatePanel(stage.dataset.factoryStagePanel)));
    main.querySelector('#btnOpenQuality')?.addEventListener('click', () => this.activatePanel('quality'));
    main.querySelector('#btnCalibrateMath')?.addEventListener('click', () => this.calibrateLocalMath(main));
    main.querySelector('#btnCompileFrontend')?.addEventListener('click', () => this.compileFrontend(main));
    main.querySelector('#btnPreviewFrontend')?.addEventListener('click', () => this.openFrontendPreview());
    main.querySelector('#mathPublisherProfile')?.addEventListener('change', event => {
      this.mathPublisherProfile = event.target.value;
    });
    main.querySelector('#btnRunMathPublisher')?.addEventListener('click', () => this.startMathPublisher(buildEngine, main));
    main.querySelector('#btnCancelMathPublisher')?.addEventListener('click', () => this.cancelMathPublisher(main));
    this.renderMathPublisherStatus(main);
    if (factoryRunning && factoryReport?.mathJobId) this.pollFactoryRun(main);
    else if (this.mathPublisherJob?.status === 'running') this.pollMathPublisher(main);

    main.querySelector('#btnGenGDD')?.addEventListener('click', () => {
      const gdd = new GDDGenerator(this.project);
      gdd.downloadAsText();
    });

    main.querySelector('#btnExportBundle')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      const previousLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Packaging…';
      try {
        const { createZip } = await import('./engines/build/zip.js');
        const gameId = this.project.build.stakeEngine.gameId;
        const manifestResponse = await fetch(`/__stake_studio/projects/${encodeURIComponent(gameId)}/frontend-manifest`);
        if (!manifestResponse.ok) throw new Error((await manifestResponse.json()).error || 'Frontend manifest unavailable.');
        const frontendManifest = await manifestResponse.json();
        const mathManifestResponse = await fetch(`/__stake_studio/projects/${encodeURIComponent(gameId)}/math-publish-manifest`);
        if (!mathManifestResponse.ok) throw new Error((await mathManifestResponse.json()).error || 'Production math manifest unavailable.');
        const mathManifest = await mathManifestResponse.json();
        const files = {};
        for (const path of frontendManifest.files) {
          const response = await fetch(`/__stake_studio/projects/${encodeURIComponent(gameId)}/frontend/${path.split('/').map(encodeURIComponent).join('/')}`);
          if (!response.ok) throw new Error(`Could not package frontend/${path}.`);
          files[`frontend/${path}`] = new Uint8Array(await response.arrayBuffer());
        }
        Object.assign(files, buildEngine.generateMathSDKFiles());
        const animationFiles = buildEngine.generateAnimationFiles();
        Object.assign(files, animationFiles);
        const presentationFiles = buildEngine.generatePresentationFiles();
        Object.assign(files, presentationFiles);
        const blueprintFiles = buildEngine.generateBlueprintFiles();
        Object.assign(files, blueprintFiles);
        const workflowFiles = buildEngine.generateWorkflowFiles();
        Object.assign(files, workflowFiles);
        const assetPackFiles = buildEngine.generateAssetPackFiles();
        Object.assign(files, assetPackFiles);
        for (const entry of mathManifest.files) {
          const path = entry.path;
          const response = await fetch(`/__stake_studio/projects/${encodeURIComponent(gameId)}/math-publish/${path.split('/').map(encodeURIComponent).join('/')}`);
          if (!response.ok) throw new Error(`Could not package production math/${path}.`);
          files[`games/${gameId}/library/${path}`] = new Uint8Array(await response.arrayBuffer());
        }
        files['stakestudio/project.json'] = JSON.stringify(this.project, null, 2);
        const releaseReadiness = buildEngine.validateReadiness();
        files['release-manifest.json'] = JSON.stringify({
          format: 'stake-studio-release-v1',
          gameId,
          version: this.project.version,
          frontend: { entry: 'frontend/index.html', files: frontendManifest.files },
          animation: {
            manifest: Object.keys(animationFiles).length ? 'animation/runtime.json' : null,
            runtime: 'pixi-v8',
            spineVersion: '4.3',
          },
          presentation: { manifest: 'presentation/director.json', format: 'stake-studio-presentation-director-v1' },
          blueprint: { manifest: 'stakestudio/blueprint.json', id: this.project.blueprint?.id || null },
          assets: { manifest: 'stakestudio/asset-pack.json', submissionRoot: 'submission/' },
          mathSDKRoot: `games/${gameId}`,
          mathPublish: {
            root: mathManifest.root,
            files: mathManifest.files,
            totalBytes: mathManifest.totalBytes,
            verification: this.project.build.mathPublish,
          },
          validation: buildEngine.validate(),
          readiness: releaseReadiness,
          quality: releaseReadiness.quality,
          factoryRun: this.project.build.factoryRun || null,
          generatedAt: new Date().toISOString(),
        }, null, 2);
        const url = URL.createObjectURL(createZip(files));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${gameId}_${this.project.version}_stake_release.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        this.bridge?.recordError('build.release-export', error);
        window.alert(`Release export failed: ${error.message}`);
      } finally {
        button.disabled = false;
        button.textContent = previousLabel;
      }
    });
  }

  renderMathPublisherStatus(main) {
    const element = main.querySelector('#mathPublisherStatus');
    if (!element) return;
    const job = this.mathPublisherJob;
    if (!job) {
      element.innerHTML = '<strong>Idle</strong><span>Smoke and draft runs prove the pipeline but never mark release verification. Only a successful production profile can unlock Production Math.</span>';
      return;
    }
    const tail = String(job.log || '').trim().split(/\r?\n/).slice(-12).join('\n');
    element.className = `math-publisher-status is-${job.status}`;
    element.innerHTML = `
      <div><strong>${job.phase || job.status}</strong><span>${job.profile} · ${job.id}</span></div>
      ${job.error ? `<p class="issue-error">${this.escapeHtml(job.error)}</p>` : ''}
      ${job.result?.verification ? `<p>${job.result.verification.totalBooks.toLocaleString()} books passed full-stream book/LUT verification.</p>` : ''}
      ${tail ? `<pre>${this.escapeHtml(tail)}</pre>` : ''}
    `;
  }

  async startFactoryRun(main) {
    const profile = getFactoryProfile(this.factoryRunProfile);
    const track = getProductionTrack(this.project);
    const stageOrder = getFactoryStageOrder(track);
    const existing = this.factoryRunReport || this.project.build?.factoryRun || null;
    const report = existing?.status === 'awaiting-input' && existing.profile === profile.id && (existing.track || 'blueprint') === track
      ? resumeFactoryRun(existing)
      : createFactoryRunReport(profile.id, { track });
    report.track = track;
    report.stageOrder = stageOrder;
    for (const stage of stageOrder) report.stages[stage] ||= { status: 'pending', message: 'Waiting' };
    this.factoryRunReport = report;
    this.project.build ||= {};
    this.project.build.factoryRun = report;
    const openingStage = stageOrder[0];
    setFactoryStage(report, openingStage, 'running', track === 'flagship'
      ? 'Checking the approved vision before any production work begins.'
      : 'Checking the player hook, signature moment, differentiators, world direction and provider identity.');
    this.renderBuildPanel(main);
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      if (track === 'flagship') {
        for (const stage of FLAGSHIP_PREPRODUCTION_STAGES) {
          const gate = getFactoryWorkflowGate(this.project, stage);
          setFactoryStage(report, stage, 'running', `Checking ${gate.label.toLowerCase()}.`);
          if (!gate.complete) {
            pauseFactoryRun(report, stage, gate.message, {
              action: gate.label, panel: gate.panel, blockers: gate.missing,
            });
            await this.bridge.saveProject(`factory-awaiting-${stage}`);
            this.renderBuildPanel(main);
            return report;
          }
          setFactoryStage(report, stage, 'completed', gate.message);
        }
      } else {
        const creativeGate = getCreativeFactoryGate(this.project);
        if (!creativeGate.complete) {
          pauseFactoryRun(report, 'creative', creativeGate.message, {
            action: 'Creative Contract', panel: 'quality', blockers: creativeGate.missing,
          });
          await this.bridge.saveProject('factory-awaiting-creative');
          this.renderBuildPanel(main);
          return report;
        }
        setFactoryStage(report, 'creative', 'completed', creativeGate.message);
      }
      const preflightRounds = 50000;
      const preflightStatus = getMathCalibrationStatus(this.project);
      const reusePreflight = preflightStatus.complete && Number(preflightStatus.calibration?.rounds || 0) >= preflightRounds;
      const preflight = reusePreflight ? preflightStatus.calibration : calibratePrototypeMath(this.project, {
        rounds: preflightRounds,
        seed: 0x51a7e,
        maxPasses: 3,
        tolerance: 0.005,
      });
      report.mathPreflight = {
        fingerprint: preflight.fingerprint,
        rounds: preflight.rounds,
        reused: reusePreflight,
        modes: preflight.modes.map(mode => ({
          name: mode.name,
          realizedRtp: mode.realizedRtp,
          declaredRtp: mode.declaredRtp,
          aligned: mode.aligned,
        })),
      };
      await this.bridge.saveProject(reusePreflight ? 'factory-math-preflight-reused' : 'factory-math-preflight-complete');
      setFactoryStage(report, 'visual', 'running', 'Checking the continuity-safe visual production plan and complete assigned pack.');

      const visualCheckpoint = prepareFactoryVisualCheckpoint(this.project, profile.id);
      const { visual, workOrder, batch, task } = visualCheckpoint;
      if (!visual.complete) {
        const visualBlockers = [
          ...(visual.blockers || []),
          ...(visual.protected ? [`${visual.protected} protected visual decision${visual.protected === 1 ? '' : 's'} remain.`] : []),
          `${visual.assigned}/${visual.total} visual assets are assigned.`,
        ];
        const nextAsset = task ? ` Next: ${task.label} → ${task.output.filename}.` : '';
        pauseFactoryRun(report, 'visual', `Visual production is ${visual.assigned}/${visual.total} complete.${workOrder.current ? ' The free Codex batch is active.' : ''}${nextAsset} Passing each asset unlocks the next; Codex submission resumes the factory automatically after the final one.`, {
          action: workOrder.current ? 'Codex Visual Batch' : 'Visual Conductor', panel: 'atlas', blockers: visualBlockers,
        });
        report.visualBatch = batch;
        await this.bridge.saveProject('factory-awaiting-visuals');
        this.renderBuildPanel(main);
        return report;
      }
      setFactoryStage(report, 'visual', 'completed', `${visual.assigned}/${visual.total} production assets assigned through one locked visual lineage.`);
      setFactoryStage(report, 'audio', 'running', 'Restoring presentation recipes and filling only missing generated audio.');

      const generated = prepareFactoryProject(this.project, profile.id);
      report.generated = generated;
      const soundscape = generated.soundscapeLayers
        ? ` and ${generated.soundscapeLayers} ${generated.soundscapeProfile} soundscape layers`
        : '';
      setFactoryStage(report, 'audio', 'completed', generated.sfx || generated.soundscapeLayers
        ? `Added ${generated.sfx} missing SFX${soundscape}; existing audio was preserved.`
        : 'Presentation and audio contracts already complete; existing work was preserved.');
      setFactoryStage(report, 'frontend', 'running', 'Compiling wallet, replay, jurisdiction, rules and responsive shells.');
      this.unsaved = true;
      await this.bridge.saveProject('factory-audio-ready');

      const frontendResponse = await fetch(`/__stake_studio/projects/${encodeURIComponent(this.projectId)}/frontend-compiler/build`, { method: 'POST' });
      const frontendResult = await frontendResponse.json();
      if (!frontendResponse.ok) throw new Error(frontendResult.error || 'Factory frontend compilation failed.');
      const { root, projectId, ...frontend } = frontendResult;
      this.project.build.frontend = frontend;
      setFactoryStage(report, 'frontend', 'completed', `${frontend.files.length} files · ${Number(frontend.totalBytes).toLocaleString()} bytes · all five platform capabilities installed.`);
      setFactoryStage(report, 'math', 'running', 'Math Autopilot is calibrating every wager mode locally before the official publisher starts.');
      await this.bridge.saveProject('factory-frontend-ready');
      this.renderBuildPanel(main);
      await new Promise(resolve => setTimeout(resolve, 0));

      const calibration = calibratePrototypeMath(this.project, {
        rounds: 25000,
        seed: 0x51a7e,
        maxPasses: 3,
        tolerance: 0.005,
      });
      report.mathCalibration = {
        format: calibration.format,
        fingerprint: calibration.fingerprint,
        rounds: calibration.rounds,
        modes: calibration.modes.map(mode => ({
          name: mode.name,
          realizedRtp: mode.realizedRtp,
          declaredRtp: mode.declaredRtp,
          aligned: mode.aligned,
          calibratedFactor: mode.calibratedFactor,
        })),
      };
      setFactoryStage(report, 'math', 'running', `${calibration.modes.length}/${calibration.modes.length} wager modes locally aligned across ${calibration.rounds.toLocaleString()} deterministic rounds each; starting the ${profile.mathProfile} official publisher.`);
      await this.bridge.saveProject('factory-math-calibrated');

      const buildEngine = new BuildEngine(this.project);
      const response = await fetch(`/__stake_studio/projects/${encodeURIComponent(this.projectId)}/math-publisher/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: profile.mathProfile,
          simulations: this.project.build?.simulations || {},
          files: buildEngine.generateMathSDKFiles(),
        }),
      });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || 'Factory math publisher could not start.');
      this.mathPublisherJob = job;
      report.mathJobId = job.id;
      report.mathProfile = job.profile;
      await this.bridge.saveProject('factory-math-started');
      this.renderBuildPanel(main);
      this.pollFactoryRun(main);
      return report;
    } catch (error) {
      this.failFactoryRun(error, main);
      return report;
    }
  }

  pollFactoryRun(main) {
    const report = this.factoryRunReport;
    if (!report?.mathJobId || report.status !== 'running') return;
    if (this.factoryRunTimer) clearTimeout(this.factoryRunTimer);
    this.factoryRunTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/__stake_studio/math-publisher/jobs/${encodeURIComponent(report.mathJobId)}`);
        const job = await response.json();
        if (!response.ok) throw new Error(job.error || 'Factory math status is unavailable.');
        const previousPhase = this.mathPublisherJob?.phase;
        this.mathPublisherJob = job;
        setFactoryStage(report, 'math', 'running', `${job.phase || 'official-sdk'} · ${job.profile} · the full generated stream will be checked against its LUT.`);
        this.renderMathPublisherStatus(main);
        if (job.status === 'running') {
          if (job.phase !== previousPhase) this.renderBuildPanel(main);
          this.pollFactoryRun(main);
          return;
        }
        if (job.status !== 'completed' || !job.result?.mathPublish) {
          throw new Error(job.error || `Official math publisher ended with status ${job.status}.`);
        }

        this.project.build.mathPublish = job.result.mathPublish;
        setFactoryStage(report, 'math', 'completed', `${Number(job.result.verification.totalBooks || 0).toLocaleString()} books passed full-stream book/LUT integrity.${job.result.mathPublish.officialVerification ? ' Production RTP is officially aligned.' : ' This non-production run does not claim release verification.'}`);
        setFactoryStage(report, 'certification', 'running', 'Running browser-measured visual, rig, presentation, replay, layout, performance and audio audits.');
        await this.finalizeFactoryRun(main);
      } catch (error) {
        this.failFactoryRun(error, main);
      }
    }, 1000);
  }

  async finalizeFactoryRun(main) {
    const report = this.factoryRunReport;
    let certification = await this.runGameCertification();
    while (!certification?.complete) {
      const attempt = beginFactoryRepairAttempt(report, certification?.blockers || 0);
      if (!attempt) break;
      setFactoryStage(report, 'certification', 'running', `Safe repair pass ${attempt.number}/${report.repairAutomation.maxAttempts}: applying deterministic repairs, recompiling affected output, and rerunning measured certification.`);
      await this.bridge.saveProject(`factory-repair-pass-${attempt.number}-started`);
      this.renderBuildPanel(main);
      const repairReport = await this.runRepairAndCertification();
      certification = this.project.production?.qa?.gameCertification || certification;
      finishFactoryRepairAttempt(report, repairReport, certification);
      await this.bridge.saveProject(`factory-repair-pass-${attempt.number}-complete`);
      if (report.repairAutomation.status !== 'active') break;
    }
    const buildEngine = new BuildEngine(this.project);
    const validation = buildEngine.validate();
    const readiness = buildEngine.validateReadiness({ rounds: 50000 });
    const paytableIssues = new PaytableValidator(this.project).validate().filter(issue => issue.severity === 'error');
    const blockers = [
      ...validation.errors,
      ...paytableIssues.map(issue => issue.message),
      ...readiness.issues.filter(issue => issue.severity === 'error').map(issue => issue.message),
    ].filter((value, index, values) => values.indexOf(value) === index);
    const releaseReady = Boolean(certification?.complete) && validation.valid && readiness.valid && paytableIssues.length === 0;
    setFactoryStage(report, 'certification', certification?.complete ? 'completed' : 'blocked', certification?.complete
      ? `Fingerprint ${certification.fingerprint} · Professional Quality ${readiness.quality.score}/100 · every browser and release gate passed.${report.repairAutomation?.attempts?.length ? ` Certified after ${report.repairAutomation.attempts.length} safe repair pass${report.repairAutomation.attempts.length === 1 ? '' : 'es'}.` : ''}`
      : `${certification?.blockers ?? blockers.length} certification blocker${(certification?.blockers ?? blockers.length) === 1 ? '' : 's'} remain · Quality ${readiness.quality.score}/100.${report.repairAutomation ? ` Repair automation stopped ${report.repairAutomation.status === 'needs-input' ? 'because no safe measurable progress remained' : `after ${report.repairAutomation.attempts.length}/${report.repairAutomation.maxAttempts} passes`}.` : ''}`);
    setFactoryStage(report, 'package', releaseReady ? 'completed' : 'blocked', releaseReady
      ? 'Stake release export is unlocked.'
      : 'Packaging stays safely locked until the reported blockers are resolved.');
    finishFactoryRun(report, { releaseReady, blockers });
    this.project.build.factoryRun = report;
    this.unsaved = true;
    await this.bridge.saveProject('factory-run-complete');
    this.activatePanel('build');
    this.bridge.scheduleCapture('factory-run-complete', 150);
  }

  async failFactoryRun(error, main) {
    const report = this.factoryRunReport || createFactoryRunReport(this.factoryRunProfile, { track: getProductionTrack(this.project) });
    const activeStage = (report.stageOrder || FACTORY_STAGE_ORDER).find(stage => report.stages?.[stage]?.status === 'running') || 'package';
    setFactoryStage(report, activeStage, 'failed', error.message);
    finishFactoryRun(report, { failed: error.message, blockers: [error.message] });
    this.factoryRunReport = report;
    this.project.build ||= {};
    this.project.build.factoryRun = report;
    this.bridge?.recordError('factory-run', error);
    try { await this.bridge.saveProject('factory-run-failed'); } catch { /* diagnostic is already recorded */ }
    this.renderBuildPanel(main);
  }

  async cancelFactoryRun(main) {
    const report = this.factoryRunReport;
    if (!report || !['running', 'awaiting-input'].includes(report.status)) return;
    if (report.mathJobId) {
      const response = await fetch(`/__stake_studio/math-publisher/jobs/${encodeURIComponent(report.mathJobId)}/cancel`, { method: 'POST' });
      if (response.ok) this.mathPublisherJob = await response.json();
    }
    if (this.factoryRunTimer) clearTimeout(this.factoryRunTimer);
    const activeStage = (report.stageOrder || FACTORY_STAGE_ORDER).find(stage => ['running', 'awaiting'].includes(report.stages?.[stage]?.status)) || 'package';
    setFactoryStage(report, activeStage, 'cancelled', 'Run cancelled; completed artifacts were left intact and recoverable.');
    report.status = 'cancelled';
    report.completedAt = new Date().toISOString();
    report.updatedAt = report.completedAt;
    this.project.build.factoryRun = report;
    await this.bridge.saveProject('factory-run-cancelled');
    this.renderBuildPanel(main);
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  async startMathPublisher(buildEngine, main, { skipCalibration = false } = {}) {
    const button = main.querySelector('#btnRunMathPublisher');
    if (button) {
      button.disabled = true;
      button.textContent = 'Preparing official workspace…';
    }
    try {
      if (!skipCalibration) {
        this.mathCalibrationRun = { state: 'running', message: 'Calibrating local wager modes before the official publisher.' };
        await new Promise(resolve => setTimeout(resolve, 0));
        calibratePrototypeMath(this.project, { rounds: 25000, seed: 0x51a7e, maxPasses: 3, tolerance: 0.005 });
        this.mathCalibrationRun = { state: 'completed', message: 'Every local wager mode is statistically aligned.' };
      }
      await this.bridge.saveProject('math-publisher-start');
      const response = await fetch(`/__stake_studio/projects/${encodeURIComponent(this.projectId)}/math-publisher/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: this.mathPublisherProfile,
          simulations: this.project.build?.simulations || {},
          files: buildEngine.generateMathSDKFiles(),
        }),
      });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || 'Math Publisher could not start.');
      this.mathPublisherJob = job;
      this.renderBuildPanel(main);
      this.pollMathPublisher(main);
    } catch (error) {
      this.mathCalibrationRun = { state: 'failed', message: error.message };
      this.mathPublisherJob = { status: 'failed', phase: 'failed', profile: this.mathPublisherProfile, id: 'not-started', error: error.message, log: '' };
      this.bridge?.recordError('math-publisher.start', error);
      this.renderBuildPanel(main);
    }
  }

  async calibrateLocalMath(main) {
    this.mathCalibrationRun = { state: 'running', message: 'Calibrating every wager mode locally.' };
    this.renderBuildPanel(main);
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      const calibration = calibratePrototypeMath(this.project, {
        rounds: 25000,
        seed: 0x51a7e,
        maxPasses: 3,
        tolerance: 0.005,
        force: true,
      });
      this.mathCalibrationRun = { state: 'completed', message: `${calibration.modes.length} wager modes aligned.` };
      this.unsaved = true;
      await this.bridge.saveProject('math-autopilot-complete');
      this.renderBuildPanel(main);
      this.bridge.scheduleCapture('math-autopilot-complete', 150);
      return calibration;
    } catch (error) {
      this.mathCalibrationRun = { state: 'failed', message: error.message };
      this.bridge?.recordError('math-autopilot', error);
      this.renderBuildPanel(main);
      return null;
    }
  }

  async compileFrontend(main) {
    this.frontendCompileStatus = { state: 'running', title: 'Compiling platform shell', message: 'Writing an atomic, self-contained frontend package from the saved project.' };
    this.renderBuildPanel(main);
    try {
      await this.bridge.saveProject('frontend-compiler-start');
      const response = await fetch(`/__stake_studio/projects/${encodeURIComponent(this.projectId)}/frontend-compiler/build`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Frontend compiler failed.');
      const { root, projectId, ...frontend } = result;
      this.project.build.frontend = frontend;
      this.unsaved = false;
      this.updateProjectName();
      this.frontendCompileStatus = { state: 'completed', title: 'Stake frontend compiled', message: `${frontend.files.length} files · ${Number(frontend.totalBytes).toLocaleString()} bytes · wallet, replay, jurisdiction and responsive contracts installed.` };
      this.renderBuildPanel(main);
      this.bridge.scheduleCapture('frontend-compiler-complete', 150);
    } catch (error) {
      this.frontendCompileStatus = { state: 'failed', title: 'Frontend compilation stopped', message: error.message };
      this.bridge?.recordError('frontend-compiler.build', error);
      this.renderBuildPanel(main);
    }
  }

  openFrontendPreview() {
    const url = `/__stake_studio/projects/${encodeURIComponent(this.projectId)}/frontend/index.html?studioPreview=true&device=desktop`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  pollMathPublisher(main) {
    if (!this.mathPublisherJob?.id || this.mathPublisherJob.status !== 'running') return;
    if (this.mathPublisherTimer) clearTimeout(this.mathPublisherTimer);
    this.mathPublisherTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/__stake_studio/math-publisher/jobs/${encodeURIComponent(this.mathPublisherJob.id)}`);
        const job = await response.json();
        if (!response.ok) throw new Error(job.error || 'Math Publisher status is unavailable.');
        this.mathPublisherJob = job;
        this.renderMathPublisherStatus(main);
        if (job.status === 'running') {
          this.pollMathPublisher(main);
        } else if (job.result?.mathPublish) {
          this.project.build.mathPublish = job.result.mathPublish;
          this.unsaved = false;
          this.updateProjectName();
          this.renderBuildPanel(main);
          this.bridge.scheduleCapture('math-publisher-complete', 150);
        } else {
          this.renderBuildPanel(main);
        }
      } catch (error) {
        this.mathPublisherJob = { ...this.mathPublisherJob, status: 'failed', phase: 'status-failed', error: error.message };
        this.bridge?.recordError('math-publisher.poll', error);
        this.renderBuildPanel(main);
      }
    }, 1000);
  }

  async cancelMathPublisher(main) {
    if (!this.mathPublisherJob?.id || this.mathPublisherJob.status !== 'running') return;
    const response = await fetch(`/__stake_studio/math-publisher/jobs/${encodeURIComponent(this.mathPublisherJob.id)}/cancel`, { method: 'POST' });
    this.mathPublisherJob = await response.json();
    this.renderBuildPanel(main);
  }

  downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

const studio = new StakeStudio();
window.studio = studio;
studio.init();
