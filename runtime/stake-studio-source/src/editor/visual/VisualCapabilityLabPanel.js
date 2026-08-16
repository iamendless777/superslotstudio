import { VisualEffectRuntime } from '../../engines/animation/VisualEffectRuntime.js';
import {
  createCapabilityShowcaseRecipe,
  createCapabilityShowcaseBinding,
  ensureVisualEffects,
  getVisualCapabilitySummary,
  validateVisualEffectRecipe,
  VISUAL_EFFECT_VIEWPORTS,
} from '../../engines/animation/VisualEffectRecipes.js';

const motionLabels = { full: 'Full motion', subtle: 'Reduced', none: 'Static semantic' };

export class VisualCapabilityLabPanel {
  constructor(container, project, onChange, bridge = null) {
    this.container = container;
    this.project = project;
    this.onChange = onChange;
    this.bridge = bridge;
    this.viewport = 'desktop';
    this.motion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'subtle' : 'full';
    this.intensity = 2;
    this.seed = 1337;
    this.phase = 'ready';
    this.destroyed = false;
    this.mountGeneration = 0;
    this.recipe = createCapabilityShowcaseRecipe();
    this.issues = validateVisualEffectRecipe(this.recipe);
    ensureVisualEffects(this.project);
    this.render();
  }

  render() {
    const summary = getVisualCapabilitySummary(this.project);
    const errors = this.issues.filter(issue => issue.severity === 'error');
    const registered = this.project.animation.visualEffects.recipes.some(recipe => recipe.id === this.recipe.id);
    this.container.innerHTML = `
      <div class="visual-lab-panel">
        <header class="visual-lab-header">
          <div>
            <span class="visual-lab-eyebrow">REAL-TIME RENDER CAPABILITY</span>
            <h2>Visual Capability Lab</h2>
            <p>One reusable Pixi/WebGL recipe proving flares, additive glow, rotating energy, trails, deterministic particles, shockwaves, camera impact, responsive framing, and reduced motion.</p>
          </div>
          <div class="visual-lab-runtime-badge">
            <strong>${errors.length ? 'RECIPE ERROR' : 'PIXEL-READY'}</strong>
            <span>Pixi v8 · WebGL · deterministic seed</span>
          </div>
        </header>

        <section class="visual-lab-toolbar" aria-label="Effect controls">
          <div class="visual-lab-control-group">
            <span>Viewport</span>
            ${Object.entries(VISUAL_EFFECT_VIEWPORTS).map(([id, item]) => `<button class="btn-small visual-lab-option ${this.viewport === id ? 'is-active' : ''}" data-visual-viewport="${id}">${item.label}</button>`).join('')}
          </div>
          <div class="visual-lab-control-group">
            <span>Motion</span>
            ${Object.entries(motionLabels).map(([id, label]) => `<button class="btn-small visual-lab-option ${this.motion === id ? 'is-active' : ''}" data-visual-motion="${id}">${label}</button>`).join('')}
          </div>
          <label class="visual-lab-intensity">Intensity
            <input id="visualLabIntensity" type="range" min="1" max="3" step="1" value="${this.intensity}">
            <output id="visualLabIntensityValue">${this.intensity}</output>
          </label>
          <button class="btn-primary" id="visualLabPlay">Replay Arcane Impact</button>
          <button class="btn-secondary" id="visualLabRegister">${registered ? 'Recipe Registered' : 'Register Recipe'}</button>
        </section>

        <div class="visual-lab-workspace">
          <section class="visual-lab-stage-card">
            <div class="visual-lab-stage-heading">
              <div><span>REFERENCE RECIPE</span><strong>ARCANE IMPACT</strong></div>
              <div class="visual-lab-phase" id="visualLabPhase" data-phase="${this.phase}">${this.phase}</div>
            </div>
            <div class="visual-lab-stage-shell is-${this.viewport}" id="visualLabStageShell">
              <div class="visual-lab-stage" id="visualLabStage"><div class="visual-lab-loading">Starting Pixi WebGL…</div></div>
            </div>
            <footer class="visual-lab-stage-footer">
              <span>Seed <strong id="visualLabSeed">${this.seed}</strong></span>
              <span>Design space <strong>640 × 360</strong></span>
              <span>Object cap <strong>${this.recipe.budgets.maxLiveObjects}</strong></span>
              <span>Particle cap <strong>${this.recipe.budgets.maxParticles}</strong></span>
            </footer>
          </section>

          <aside class="visual-lab-sidebar">
            <section class="visual-lab-card">
              <span class="visual-lab-card-kicker">PIPELINE COVERAGE</span>
              <h3>Reusable primitives</h3>
              <div class="visual-capability-grid">
                ${[
                  ['Glow + blur', 'live'], ['Lens flare', 'live'], ['Orbit / spin', 'live'], ['Projectile', 'live'],
                  ['Energy trail', 'live'], ['Seeded particles', 'live'], ['Shockwave', 'live'], ['Camera impulse', 'live'],
                  ['Blend modes', 'live'], ['Color grade', 'live'], ['Responsive anchors', 'live'], ['Reduced motion', 'live'],
                ].map(([label, status]) => `<div><i data-status="${status}"></i><span>${label}</span><strong>${status}</strong></div>`).join('')}
              </div>
            </section>

            <section class="visual-lab-card visual-lab-spine-card">
              <span class="visual-lab-card-kicker">ANIMATED RIG RUNWAY</span>
              <h3>Spine 4.3 adapter</h3>
              <div class="visual-lab-spine-meter"><span style="--coverage:${summary.spineJsonAssets > 0 ? 100 : 18}%"></span></div>
              <dl>
                <div><dt>JSON skeletons</dt><dd>${summary.spineJsonAssets}</dd></div>
                <div><dt>Binary .skel</dt><dd>${summary.spineBinaryAssets ? summary.spineBinaryAssets : 'pending'}</dd></div>
                <div><dt>Runtime</dt><dd>Spine 4.3 / Pixi 8</dd></div>
                <div><dt>Release adapter</dt><dd>pending</dd></div>
              </dl>
              <p>${summary.spineJsonAssets > 0 ? 'The active project has a JSON rig available for mapped game-state playback.' : 'Import a licensed Spine 4.3 JSON + atlas bundle in the Spine panel. Binary .skel import is the next fixture-driven milestone.'}</p>
            </section>

            <section class="visual-lab-card visual-lab-contract-card">
              <span class="visual-lab-card-kicker">RECIPE CONTRACT</span>
              <h3>Portable, not one-off</h3>
              <code>origin → target · intensity · palette · motion · seed</code>
              <p>${this.recipe.nodes.length} typed nodes · ${this.recipe.duration.toFixed(1)}s · ${errors.length ? `${errors.length} validation errors` : 'schema valid'}</p>
            </section>
          </aside>
        </div>
      </div>
    `;
    this.bindEvents();
    this.mountRuntime();
  }

  bindEvents() {
    this.container.querySelectorAll('[data-visual-viewport]').forEach(button => button.addEventListener('click', () => this.setViewport(button.dataset.visualViewport)));
    this.container.querySelectorAll('[data-visual-motion]').forEach(button => button.addEventListener('click', () => this.setMotion(button.dataset.visualMotion)));
    this.container.querySelector('#visualLabIntensity')?.addEventListener('input', event => {
      this.intensity = Number(event.target.value);
      this.container.querySelector('#visualLabIntensityValue').textContent = String(this.intensity);
    });
    this.container.querySelector('#visualLabIntensity')?.addEventListener('change', () => this.play());
    this.container.querySelector('#visualLabPlay')?.addEventListener('click', () => this.play());
    this.container.querySelector('#visualLabRegister')?.addEventListener('click', () => this.registerRecipe());
  }

  async mountRuntime() {
    const generation = ++this.mountGeneration;
    this.runtime?.destroy();
    this.runtime = new VisualEffectRuntime({ onFrame: event => this.handleRuntimeFrame(event) });
    const mounted = await this.runtime.mount(this.container.querySelector('#visualLabStage'), { viewport: this.viewport });
    if (!mounted || this.destroyed || generation !== this.mountGeneration) return;
    this.play();
  }

  handleRuntimeFrame(event) {
    if (this.destroyed) return;
    this.phase = event.phase;
    const element = this.container.querySelector('#visualLabPhase');
    if (element) {
      element.textContent = event.phase;
      element.dataset.phase = event.phase;
    }
    if (event.phase === 'contact' || event.phase === 'settled') this.bridge?.scheduleCapture(`visual-lab:${event.phase}`, 120);
  }

  play() {
    if (!this.runtime?.app || this.issues.some(issue => issue.severity === 'error')) return null;
    this.seed += 1;
    const seedElement = this.container.querySelector('#visualLabSeed');
    if (seedElement) seedElement.textContent = String(this.seed);
    const handle = this.runtime.play(this.recipe, {
      viewport: this.viewport,
      motion: this.motion,
      intensity: this.intensity,
      seed: this.seed,
      origin: { x: 132, y: 180 },
      target: { x: 512, y: 180 },
    });
    this.bridge?.publishState('visual-lab:play');
    this.bridge?.scheduleCapture('visual-lab:launch', 260);
    return handle;
  }

  freezeAt(phase = 'contact') {
    if (!this.runtime?.current) return null;
    const times = {
      launch: this.motion === 'none' ? 0.03 : 0.58,
      contact: this.motion === 'none' ? 0.08 : 1.12,
      tail: this.motion === 'none' ? 0.14 : 1.62,
      settled: this.runtime.current.duration,
    };
    const resolved = Object.hasOwn(times, phase) ? phase : 'contact';
    this.runtime.playing = false;
    this.runtime.seek(times[resolved]);
    this.handleRuntimeFrame({ phase: resolved, progress: times[resolved] / this.runtime.current.duration, compiled: this.runtime.current });
    return this.getState();
  }

  setViewport(viewport) {
    if (!Object.hasOwn(VISUAL_EFFECT_VIEWPORTS, viewport) || viewport === this.viewport) return;
    this.viewport = viewport;
    this.container.querySelectorAll('[data-visual-viewport]').forEach(button => button.classList.toggle('is-active', button.dataset.visualViewport === viewport));
    const shell = this.container.querySelector('#visualLabStageShell');
    shell.className = `visual-lab-stage-shell is-${viewport}`;
    this.runtime?.resize(viewport);
    this.play();
  }

  setMotion(motion) {
    if (!Object.hasOwn(motionLabels, motion) || motion === this.motion) return;
    this.motion = motion;
    this.container.querySelectorAll('[data-visual-motion]').forEach(button => button.classList.toggle('is-active', button.dataset.visualMotion === motion));
    this.play();
  }

  registerRecipe() {
    const effects = ensureVisualEffects(this.project);
    let changed = false;
    if (!effects.recipes.some(recipe => recipe.id === this.recipe.id)) {
      effects.recipes.push(JSON.parse(JSON.stringify(this.recipe)));
      changed = true;
    }
    const binding = createCapabilityShowcaseBinding();
    if (!effects.bindings.some(item => item.id === binding.id)) {
      effects.bindings.push(binding);
      changed = true;
    }
    if (changed) this.onChange?.();
    const button = this.container.querySelector('#visualLabRegister');
    if (button) button.textContent = 'Recipe + Win Binding Registered';
    this.bridge?.scheduleCapture('visual-lab:registered', 120);
  }

  getState() {
    return {
      viewport: this.viewport,
      motion: this.motion,
      intensity: this.intensity,
      seed: this.seed,
      phase: this.phase,
      recipeId: this.recipe.id,
      diagnostics: this.runtime?.current?.diagnostics || null,
    };
  }

  destroy() {
    this.destroyed = true;
    this.mountGeneration++;
    this.runtime?.destroy();
    this.runtime = null;
  }
}
