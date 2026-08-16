import { GAME_TYPES, BONUS_MECHANICS, getCompatibleMechanics, getMechanicsByCategory } from '../../mechanics/registry.js';
import { generateDefaultReelStrips } from '../../engines/schema.js';
import { generateDefaultPaylines, getExecutableWinType } from '../../engines/math/WinTypeEngine.js';
import {
  GAME_BLUEPRINTS,
  applyGameBlueprint,
  getBlueprint,
  getBlueprintSummary,
  validateAppliedBlueprint,
} from '../../engines/blueprints/GameBlueprintEngine.js';
import {
  ASSET_PACK_NAMING_GUIDE,
  compileAssetPack,
  getAssetPackCoverage,
  planAssetPack,
  validateAppliedAssetPack,
} from '../../engines/assets/AssetPackEngine.js';

export class ConfigPanel {
  constructor(container, project, onDirty) {
    this.container = container;
    this.project = project;
    this.onDirty = onDirty;
    this.activeSection = 'blueprints';
    this.selectedBlueprint = project.blueprint?.id || Object.keys(GAME_BLUEPRINTS)[0];
    this.pendingAssets = [];
    this.assetPlan = null;
    this.render();
  }

  render() {
    const math = this.project.math;
    const type = GAME_TYPES[math.gameType] || {};
    const compatible = getCompatibleMechanics(math.gameType);
    const byCategory = getMechanicsByCategory();

    this.container.innerHTML = `
      <div class="config-panel">
        <div class="config-sidebar">
          <div class="config-nav">
            <button class="config-tab ${this.activeSection === 'blueprints' ? 'active' : ''}" data-section="blueprints">Game Blueprints</button>
            <button class="config-tab ${this.activeSection === 'asset-pack' ? 'active' : ''}" data-section="asset-pack">Asset Pack</button>
            <button class="config-tab ${this.activeSection === 'game-type' ? 'active' : ''}" data-section="game-type">Game Type</button>
            <button class="config-tab ${this.activeSection === 'grid' ? 'active' : ''}" data-section="grid">Grid & Layout</button>
            <button class="config-tab ${this.activeSection === 'math' ? 'active' : ''}" data-section="math">Math Settings</button>
            <button class="config-tab ${this.activeSection === 'symbols' ? 'active' : ''}" data-section="symbols">Symbols</button>
            <button class="config-tab ${this.activeSection === 'mechanics' ? 'active' : ''}" data-section="mechanics">Bonus Mechanics</button>
            <button class="config-tab ${this.activeSection === 'betmodes' ? 'active' : ''}" data-section="betmodes">Bet Modes</button>
            <button class="config-tab ${this.activeSection === 'freespins' ? 'active' : ''}" data-section="freespins">Free Spins</button>
            <button class="config-tab ${this.activeSection === 'stake-release' ? 'active' : ''}" data-section="stake-release">Stake Release</button>
          </div>
        </div>
        <div class="config-content" id="configContent">
          ${this.renderBlueprints()}
          ${this.renderAssetPack()}
          ${this.renderGameType(math, type)}
          ${this.renderGrid(math)}
          ${this.renderMathSettings(math)}
          ${this.renderSymbols(math)}
          ${this.renderMechanics(math, compatible, byCategory)}
          ${this.renderBetModes(math)}
          ${this.renderFreeSpins(math)}
          ${this.renderStakeRelease()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  renderBlueprints() {
    const selected = getBlueprint(this.selectedBlueprint) || Object.values(GAME_BLUEPRINTS)[0];
    const summary = getBlueprintSummary(selected);
    const applied = validateAppliedBlueprint(this.project);
    return `
      <section class="config-section blueprint-section ${this.activeSection === 'blueprints' ? 'active' : ''}" id="section-blueprints">
        <div class="blueprint-heading">
          <div><span>Factory compiler</span><h2>Game Blueprints</h2><p>Choose a proven structural combination. The compiler rebuilds math, modes, reels and presentation while preserving your art, audio, Spine rigs and provider identity.</p></div>
          ${applied.applied ? `<div class="blueprint-current ${applied.valid ? 'is-valid' : 'has-errors'}"><strong>${this.esc(applied.blueprint?.name || this.project.blueprint.id)}</strong><span>${applied.valid ? 'Blueprint provenance valid' : applied.issues.join(' ')}</span>${applied.drift.length ? `<small>Intentional drift: ${this.esc(applied.drift.join(' · '))}</small>` : ''}</div>` : '<div class="blueprint-current"><strong>Custom project</strong><span>No factory blueprint applied</span></div>'}
        </div>

        <div class="blueprint-card-grid">
          ${Object.values(GAME_BLUEPRINTS).map(blueprint => {
            const info = getBlueprintSummary(blueprint);
            return `<button class="blueprint-card ${blueprint.id === selected.id ? 'selected' : ''}" data-blueprint-select="${blueprint.id}">
              <span>${this.esc(blueprint.family)}</span><strong>${this.esc(blueprint.name)}</strong><p>${this.esc(blueprint.summary)}</p>
              <div><small>${info.grid}</small><small>${blueprint.pace}</small><small>${blueprint.complexity}</small></div>
            </button>`;
          }).join('')}
        </div>

        <article class="blueprint-review">
          <header>
            <div><span>Selected contract</span><h3>${this.esc(selected.name)}</h3><p>${this.esc(selected.signature)}</p></div>
            <div class="blueprint-fingerprint"><span>Contract</span><strong>${summary.fingerprint}</strong></div>
          </header>
          <div class="blueprint-metrics">
            <div><strong>${summary.grid}</strong><span>${this.esc(GAME_TYPES[selected.gameType]?.name || selected.gameType)}</span></div>
            <div><strong>${(selected.rtp * 100).toFixed(1)}%</strong><span>target RTP</span></div>
            <div><strong>${selected.wincap.toLocaleString()}×</strong><span>win cap</span></div>
            <div><strong>${selected.betModes.length}</strong><span>modes</span></div>
          </div>
          <div class="blueprint-contract-grid">
            <section><h4>Executable mechanics</h4><div class="blueprint-chip-list">${selected.mechanics.map(mechanic => `<span>${this.esc(BONUS_MECHANICS[mechanic]?.name || mechanic)}</span>`).join('')}</div><small>Only mechanics already supported by the current math and export path are included.</small></section>
            <section><h4>Wager modes</h4>${selected.betModes.map(mode => `<div class="blueprint-mode"><strong>${this.esc(mode.name)}</strong><span>${mode.cost}× cost · ${(mode.rtp * 100).toFixed(1)}% RTP · ${mode.profile?.entry === 'freeSpins' ? `${mode.profile.freeSpins} free spins` : 'natural entry'}</span></div>`).join('')}</section>
            <section><h4>Creative questions</h4>${selected.creativePrompts.map(prompt => `<p>${this.esc(prompt)}</p>`).join('')}<small>The blueprint supplies structure—not a fake theme or generic AI identity.</small></section>
            <section><h4>Compilation behavior</h4><p>Rebuilds grid, reel strips, mechanics, modes, triggers, win-cap path and Presentation Director timing.</p><p>Preserves project identity, art, audio, Spine assets and Stake provider settings.</p><small>Existing math books and QA approvals are invalidated because the executable game has changed.</small></section>
          </div>
          <button class="btn-primary blueprint-compile" id="blueprintCompile">${this.project.blueprint?.id === selected.id ? 'Recompile Blueprint' : 'Compile Into Project'}</button>
          ${this.blueprintReport ? `<div class="blueprint-report"><strong>${this.esc(this.blueprintReport.title)}</strong><span>${this.esc(this.blueprintReport.message)}</span></div>` : ''}
        </article>
      </section>`;
  }

  renderAssetPack() {
    const coverage = getAssetPackCoverage(this.project);
    const validation = validateAppliedAssetPack(this.project);
    const assignmentFor = name => this.assetPlan?.assignments.find(item => [item.asset?.name, item.atlas?.name, item.image?.name].includes(name));
    return `
      <section class="config-section asset-pack-section ${this.activeSection === 'asset-pack' ? 'active' : ''}" id="section-asset-pack">
        <div class="asset-pack-heading">
          <div><span>Creative intake compiler</span><h2>Theme / Asset Pack</h2><p>Drop one named batch. StakeStudio identifies the files, connects every safe match, stages atlas inputs, and preserves anything it cannot prove.</p></div>
          <div class="asset-pack-provenance ${validation.applied ? (validation.valid ? 'is-valid' : 'has-errors') : ''}">
            <strong>${validation.applied ? 'Imported pack' : 'No pack compiled'}</strong>
            <span>${validation.applied ? (validation.valid ? `${this.project.assetPack.bindings.length} bindings intact` : validation.issues.join(' ')) : 'Manual assets remain untouched'}</span>
            ${validation.drift.length ? `<small>${validation.drift.length} intentional replacement${validation.drift.length === 1 ? '' : 's'} detected</small>` : ''}
          </div>
        </div>

        <div class="asset-coverage-grid">
          <div><strong>${coverage.symbols.ready}/${coverage.symbols.total}</strong><span>symbol art</span></div>
          <div><strong>${coverage.cabinet.ready}/${coverage.cabinet.target}+</strong><span>cabinet layers</span></div>
          <div><strong>${coverage.characterPoses}</strong><span>character poses</span></div>
          <div><strong>${coverage.audio.ready}/${coverage.audio.total}</strong><span>core sounds</span></div>
          <div><strong>${coverage.spine}</strong><span>Spine rigs</span></div>
          <div><strong>${coverage.submission}/3</strong><span>submission tiles</span></div>
        </div>

        <label class="asset-pack-drop" id="assetPackDrop">
          <input type="file" id="assetPackFiles" multiple accept="image/*,audio/*,.json,.atlas,.txt" hidden>
          <strong>Choose or drop the whole asset folder</strong>
          <span>Images, audio, and a complete Spine JSON + atlas + page image bundle</span>
          <small>Files are compiled into the project only after review below.</small>
        </label>
        <div class="asset-pack-actions">
          <button class="btn-secondary" id="assetNamingGuide">Download Naming Guide</button>
          ${this.pendingAssets.length ? `<button class="btn-secondary" id="assetPackClear">Clear ${this.pendingAssets.length} staged files</button>` : ''}
        </div>

        ${this.pendingAssets.length ? `
          <article class="asset-pack-review">
            <header><div><span>Staged intake</span><h3>${this.pendingAssets.length} files · ${this.assetPlan?.assignments.length || 0} proven bindings</h3></div><strong class="${this.assetPlan?.conflicts.length ? 'has-errors' : 'is-valid'}">${this.assetPlan?.conflicts.length ? `${this.assetPlan.conflicts.length} conflict${this.assetPlan.conflicts.length === 1 ? '' : 's'}` : 'Safe to compile'}</strong></header>
            <div class="asset-file-list">
              ${this.pendingAssets.map(asset => {
                const assignment = assignmentFor(asset.name);
                const unmatched = this.assetPlan?.unmatched.some(item => item.name === asset.name);
                const conflict = this.assetPlan?.conflicts.find(item => item.files.includes(asset.name));
                const target = assignment ? (assignment.kind === 'spine' ? `Spine rig → ${assignment.target}` : `${assignment.kind} → ${assignment.target}${assignment.index !== undefined ? ` #${assignment.index + 1}` : ''}`) : '';
                return `<div class="asset-file-row ${conflict ? 'has-errors' : unmatched ? 'is-unmatched' : 'is-matched'}"><span>${this.esc(asset.name)}</span><small>${conflict ? `Conflict: ${conflict.key}` : unmatched ? 'Unmatched — preserved for manual assignment' : this.esc(target)}</small></div>`;
              }).join('')}
            </div>
            ${this.assetPlan?.conflicts.length ? `<div class="asset-pack-warning"><strong>Compilation stopped.</strong><span>Rename or remove files that target the same slot. StakeStudio will never guess between competing final assets.</span></div>` : ''}
            <button class="btn-primary asset-pack-compile" id="assetPackCompile" ${!this.assetPlan?.assignments.length || this.assetPlan?.conflicts.length ? 'disabled' : ''}>Compile ${this.assetPlan?.assignments.length || 0} Bindings Into Project</button>
          </article>
        ` : '<div class="asset-pack-conventions"><strong>Examples</strong><span>H1.png · background.png · character_win_big.png · base_music.ogg · reel_stop_1.wav · provider_logo.png</span></div>'}

        ${this.assetPackReport ? `<div class="asset-pack-report ${this.assetPackReport.error ? 'has-errors' : 'is-success'}" role="status"><strong>${this.esc(this.assetPackReport.title)}</strong><span>${this.esc(this.assetPackReport.message)}</span></div>` : ''}
      </section>`;
  }

  renderGameType(math, type) {
    return `
      <section class="config-section ${this.activeSection === 'game-type' ? 'active' : ''}" id="section-game-type">
        <h2>Game Type</h2>
        <p class="section-desc">Choose the core win mechanic for your game.</p>
        <div class="type-selector">
          ${Object.entries(GAME_TYPES).map(([key, t]) => `
            <button class="type-option ${key === math.gameType ? 'selected' : ''}" data-type="${key}">
              <strong>${t.name}</strong>
              <span>${t.description}</span>
              <small>${t.defaults.reels}x${t.defaults.rows[0]} · ${getExecutableWinType(key) ? 'production compiler' : 'prototype only'}</small>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }

  renderGrid(math) {
    return `
      <section class="config-section ${this.activeSection === 'grid' ? 'active' : ''}" id="section-grid">
        <h2>Grid & Layout</h2>
        <div class="form-group">
          <label>Reels <input type="number" id="cfgReels" value="${math.grid.reels}" min="3" max="12"></label>
        </div>
        <div class="form-group">
          <label>Rows per reel</label>
          <div class="reel-rows" id="reelRows">
            ${math.grid.rows.map((r, i) => `
              <label>R${i + 1} <input type="number" class="reel-row-input" data-reel="${i}" value="${r}" min="1" max="12"></label>
            `).join('')}
          </div>
        </div>
        <button class="btn-small" id="uniformRows">Make all rows equal</button>
      </section>
    `;
  }

  renderMathSettings(math) {
    return `
      <section class="config-section ${this.activeSection === 'math' ? 'active' : ''}" id="section-math">
        <h2>Math Settings</h2>
        <div class="form-group">
          <label>Target RTP <input type="number" id="cfgRTP" value="${math.rtp}" min="0.8" max="0.99" step="0.001"></label>
          <small>Stake requires 92%–96.5%</small>
        </div>
        <div class="form-group">
          <label>Win Cap (x bet) <input type="number" id="cfgWincap" value="${math.wincap}" min="100" max="50000"></label>
          <small>Stake max: 50,000x</small>
        </div>
        <div class="form-group">
          <label>Max-win RTP allocation <input type="number" id="cfgWincapRTP" value="${Number(math.wincapRtp) || 0}" min="0" max="0.01" step="0.0001"></label>
          <label>Max-win odds (1 in N) <input type="number" id="cfgMaxWinOdds" value="${Number(math.maxWinHitRate) > 0 ? Math.round(1 / Number(math.maxWinHitRate)) : 0}" min="0" max="10000000" step="1"></label>
          <small>Executable probability budget. 0.001 = 0.10% RTP, or about 1 in ${Math.max(1, Math.round((Number(math.wincap) || 1) / 0.001)).toLocaleString()} base bets at this cap.</small>
        </div>
        <div class="form-group">
          <label>Volatility
            <select id="cfgVolatility">
              ${['low', 'medium', 'high', 'very-high'].map(v => `<option value="${v}" ${math.volatility === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
        </div>
      </section>
    `;
  }

  renderSymbols(math) {
    const symbols = this.project.theme.symbols || [];
    return `
      <section class="config-section ${this.activeSection === 'symbols' ? 'active' : ''}" id="section-symbols">
        <h2>Symbols</h2>
        <p class="section-desc">Define pay symbols and their payouts.</p>
        <div class="symbol-list" id="symbolList">
          ${symbols.map((sym, i) => `
            <div class="symbol-row" data-index="${i}">
              <label class="symbol-art ${sym.src ? 'has-art' : ''}" title="${sym.src ? 'Replace art' : 'Add art'}">
                ${sym.src ? `<img src="${sym.src}" alt="${sym.name}">` : '<span class="symbol-art-empty">+</span>'}
                <input type="file" accept="image/*" data-field="src" style="display:none">
              </label>
              <input type="text" value="${sym.name}" placeholder="Name" data-field="name">
              <select data-field="tier">
                ${['high', 'medium', 'low', 'special'].map(t => `<option value="${t}" ${sym.tier === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
              <input type="number" placeholder="3x" data-field="pay3" value="${sym.payouts?.[3] || ''}">
              <input type="number" placeholder="4x" data-field="pay4" value="${sym.payouts?.[4] || ''}">
              <input type="number" placeholder="5x" data-field="pay5" value="${sym.payouts?.[5] || ''}">
              ${sym.src ? '<button class="btn-tiny" data-action="clearArt" title="Remove art">&#8635;</button>' : ''}
              <button class="btn-tiny" data-action="removeSymbol">x</button>
            </div>
          `).join('')}
        </div>
        <div class="symbol-actions">
          <button class="btn-small" id="addSymbol">+ Add Symbol</button>
          <label class="btn-small symbol-bulk-label" title="Filenames are matched to symbol names, e.g. H1.png to symbol H1">
            + Import Art (bulk)
            <input type="file" accept="image/*" multiple id="bulkSymbolArt" style="display:none">
          </label>
          <span class="symbol-art-count">${symbols.filter(s => s.src).length}/${symbols.length} have art</span>
        </div>
        ${this.bulkArtReport ? `
          <div class="bulk-art-report">
            ${this.bulkArtReport.matched.length ? `<div class="bulk-ok">Matched ${this.bulkArtReport.matched.length}: ${this.bulkArtReport.matched.join(', ')}</div>` : ''}
            ${this.bulkArtReport.unmatched.length ? `<div class="bulk-warn">No symbol matched: ${this.bulkArtReport.unmatched.join(', ')} — rename the file to the symbol name, or assign it with the thumbnail slot.</div>` : ''}
          </div>
        ` : ''}
        <div class="form-group" style="margin-top:16px">
          <label>Wild symbols <input type="text" id="cfgWilds" value="${(math.specialSymbols?.wild || []).join(', ')}" placeholder="W"></label>
          <label>Scatter symbols <input type="text" id="cfgScatters" value="${(math.specialSymbols?.scatter || []).join(', ')}" placeholder="S"></label>
        </div>
      </section>
    `;
  }

  /**
   * Match dropped files to symbols by filename stem, so an export of
   * H1.png / W.png / S.png lands on the right symbols in one go.
   * Matching is case-insensitive and ignores separators.
   */
  async handleBulkSymbolArt(e) {
    const files = Array.from(e.target.files);
    const symbols = this.project.theme.symbols || [];
    const key = s => s.toLowerCase().replace(/[\s_-]/g, '');

    const matched = [];
    const unmatched = [];

    for (const file of files) {
      const stem = file.name.replace(/\.[^.]+$/, '');
      const sym = symbols.find(s => s.name && key(s.name) === key(stem))
        || symbols.find(s => s.id && key(s.id) === key(stem));
      if (sym) {
        sym.src = await this.readFileAsDataURL(file);
        matched.push(`${stem} -> ${sym.name}`);
      } else {
        unmatched.push(stem);
      }
    }

    this.bulkArtReport = { matched, unmatched };
    this.onDirty();
    this.render();
  }

  renderMechanics(math, compatible, byCategory) {
    const enabled = new Set(math.bonusMechanics || []);
    if (!math.mechanicConfig) math.mechanicConfig = {};
    const categories = {};
    for (const m of compatible) {
      const cat = m.category || 'other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(m);
    }
    const catLabels = { core: 'Core', wilds: 'Wild Features', multipliers: 'Multipliers', entry: 'Entry Modes', symbols: 'Symbol Features', progression: 'Progression', random: 'Random', bonus: 'Bonus Rounds', grid: 'Grid Features' };

    return `
      <section class="config-section ${this.activeSection === 'mechanics' ? 'active' : ''}" id="section-mechanics">
        <h2>Bonus Mechanics</h2>
        <p class="section-desc">Toggle and configure mechanics compatible with ${GAME_TYPES[math.gameType]?.name || math.gameType}.</p>
        <div class="mechanics-builder">
          ${Object.entries(categories).map(([cat, mechs]) => `
            <div class="mech-category">
              <h3 class="mech-category-label">${catLabels[cat] || cat}</h3>
              ${mechs.map(m => {
                const isOn = enabled.has(m.key);
                const fields = BONUS_MECHANICS[m.key]?.configFields || {};
                const config = math.mechanicConfig[m.key] || {};
                return `
                  <div class="mechanic-card ${isOn ? 'enabled' : ''}">
                    <div class="mechanic-header">
                      <label class="mechanic-toggle-row">
                        <input type="checkbox" data-mechanic="${m.key}" ${isOn ? 'checked' : ''}>
                        <strong>${m.name}</strong>
                      </label>
                      <span class="mechanic-desc">${m.description}</span>
                    </div>
                    ${isOn && Object.keys(fields).length > 0 ? `
                      <div class="mechanic-config" data-mechanic-key="${m.key}">
                        ${Object.entries(fields).map(([fKey, fDef]) => this.renderConfigField(m.key, fKey, fDef, config[fKey])).join('')}
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>
        ${compatible.length === 0 ? '<p class="empty-state">No compatible mechanics for this game type.</p>' : ''}
      </section>
    `;
  }

  renderConfigField(mechKey, fieldKey, def, value) {
    const val = value ?? def.default;
    const id = `mech_${mechKey}_${fieldKey}`;
    const label = def.label || fieldKey;

    if (def.type === 'number') {
      return `<div class="form-group mech-field"><label>${label} <input type="number" id="${id}" data-mech="${mechKey}" data-field="${fieldKey}" value="${val}" step="any"></label></div>`;
    }
    if (def.type === 'boolean') {
      return `<div class="form-group mech-field"><label><input type="checkbox" id="${id}" data-mech="${mechKey}" data-field="${fieldKey}" ${val ? 'checked' : ''}> ${label}</label></div>`;
    }
    if (def.type === 'select') {
      return `<div class="form-group mech-field"><label>${label} <select id="${id}" data-mech="${mechKey}" data-field="${fieldKey}">${(def.options || []).map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label></div>`;
    }
    if (def.type === 'json') {
      return `<div class="form-group mech-field"><label>${label} <textarea id="${id}" data-mech="${mechKey}" data-field="${fieldKey}" rows="3" style="font-family:monospace;font-size:12px;width:100%">${JSON.stringify(val, null, 2)}</textarea></label></div>`;
    }
    return `<div class="form-group mech-field"><label>${label} <input type="text" id="${id}" data-mech="${mechKey}" data-field="${fieldKey}" value="${typeof val === 'object' ? JSON.stringify(val) : val}"></label></div>`;
  }

  renderBetModes(math) {
    const modes = math.betModes || [];
    return `
      <section class="config-section ${this.activeSection === 'betmodes' ? 'active' : ''}" id="section-betmodes">
        <h2>Bet Modes</h2>
        <p class="section-desc">Each bet mode is a separate distribution with its own RTP.</p>
        <div class="betmode-list" id="betmodeList">
          ${modes.map((mode, i) => `
            <div class="betmode-card" data-index="${i}">
              <div class="form-group"><label>Name <input type="text" data-field="name" value="${mode.name}"></label></div>
              <div class="form-row">
                <label>Cost <input type="number" data-field="cost" value="${mode.cost}" step="0.25" min="0.25"></label>
                <label>RTP <input type="number" data-field="rtp" value="${mode.rtp}" step="0.001" min="0.8" max="0.99"></label>
                <label>Max Win <input type="number" data-field="maxWin" value="${mode.maxWin}" min="100"></label>
              </div>
              <div class="form-row">
                <label><input type="checkbox" data-field="isFeature" ${mode.isFeature ? 'checked' : ''}> Feature</label>
                <label><input type="checkbox" data-field="isBuyBonus" ${mode.isBuyBonus ? 'checked' : ''}> Buy Bonus</label>
                <label><input type="checkbox" data-field="autoCloseDisabled" ${mode.autoCloseDisabled ? 'checked' : ''}> No Auto-Close</label>
              </div>
              <button class="btn-tiny" data-action="removeBetmode">Remove</button>
            </div>
          `).join('')}
        </div>
        <button class="btn-small" id="addBetmode">+ Add Bet Mode</button>
      </section>
    `;
  }

  renderFreeSpins(math) {
    const triggers = math.freespinTriggers?.basegame || {};
    return `
      <section class="config-section ${this.activeSection === 'freespins' ? 'active' : ''}" id="section-freespins">
        <h2>Free Spins Configuration</h2>
        <h3>Base Game Triggers</h3>
        <div class="trigger-grid" id="triggerGrid">
          ${Object.entries(triggers).map(([count, spins]) => `
            <div class="trigger-row">
              <label>${count} scatters <input type="number" data-count="${count}" value="${spins}" min="1"></label>
            </div>
          `).join('')}
        </div>
        <div class="form-row" style="margin-top:8px">
          <input type="number" id="newTriggerCount" placeholder="Scatters" min="2" max="6" style="width:80px">
          <input type="number" id="newTriggerSpins" placeholder="Free spins" min="1" style="width:80px">
          <button class="btn-small" id="addTrigger">Add</button>
        </div>
      </section>
    `;
  }

  renderStakeRelease() {
    const stake = this.project.build?.stakeEngine || {};
    return `
      <section class="config-section ${this.activeSection === 'stake-release' ? 'active' : ''}" id="section-stake-release">
        <h2>Stake Release</h2>
        <p class="section-desc">Confirm the provider identity used by Stake Engine. The ACP identifies the provider through your signed-in team.</p>
        <div class="form-group">
          <label>Game ID <input type="text" value="${stake.gameId || ''}" readonly></label>
          <small>The project folder and math package use this ID.</small>
        </div>
        <div class="form-group">
          <label>Game Name <input type="text" id="cfgStakeGameName" value="${stake.gameName || this.project.name || ''}"></label>
        </div>
        <div class="form-group">
          <label>Provider Name <input type="text" id="cfgProviderName" value="${stake.providerName || ''}"></label>
        </div>
        <div class="form-group">
          <label>Provider Number <input type="number" id="cfgProviderNumber" value="${Number(stake.providerNumber) || 0}" min="1" step="1"></label>
          <small>Use 0 until Stake assigns the team provider number, then replace it with the assigned non-negative integer.</small>
        </div>
        <div class="form-group">
          <label>Team Name <input type="text" id="cfgTeamName" value="${stake.teamName || ''}"></label>
        </div>
      </section>
    `;
  }

  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
      reader.readAsDataURL(file);
    });
  }

  loadImageDimensions(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
      image.onerror = () => reject(new Error('Image data could not be decoded.'));
      image.src = src;
    });
  }

  async stageAssetFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    this.assetPackReport = { title: 'Reading asset pack', message: `Inspecting ${files.length} files before any project data changes.` };
    this.render();
    try {
      const descriptors = [];
      for (const file of files) {
        const ext = file.name.toLowerCase().split('.').pop();
        const descriptor = { name: file.name, type: file.type, size: file.size };
        if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
          descriptor.src = await this.readFileAsDataURL(file);
          Object.assign(descriptor, await this.loadImageDimensions(descriptor.src));
        } else if (file.type.startsWith('audio/') || ['wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) {
          descriptor.src = await this.readFileAsDataURL(file);
        } else if (['json', 'atlas', 'txt'].includes(ext)) {
          descriptor.text = await file.text();
        }
        descriptors.push(descriptor);
      }
      this.pendingAssets = descriptors;
      this.assetPlan = planAssetPack(this.project, descriptors);
      this.assetPackReport = null;
    } catch (error) {
      this.pendingAssets = [];
      this.assetPlan = null;
      this.assetPackReport = { error: true, title: 'Pack staging stopped', message: error.message };
    }
    this.render();
  }

  downloadAssetNamingGuide() {
    const url = URL.createObjectURL(new Blob([ASSET_PACK_NAMING_GUIDE], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'StakeStudio-Asset-Pack-Naming.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  bindEvents() {
    this.container.querySelectorAll('[data-blueprint-select]').forEach(button => {
      button.addEventListener('click', () => {
        this.selectedBlueprint = button.dataset.blueprintSelect;
        this.blueprintReport = null;
        this.render();
      });
    });
    this.container.querySelector('#blueprintCompile')?.addEventListener('click', () => {
      try {
        const result = applyGameBlueprint(this.project, this.selectedBlueprint);
        this.blueprintReport = {
          title: `${result.blueprint.summary.name} compiled`,
          message: `Preserved ${result.preserved.join(', ')}. Invalidated ${result.invalidated.join(', ')} for honest re-verification.`,
        };
        this.onDirty();
        this.render();
      } catch (error) {
        this.blueprintReport = { title: 'Blueprint failed', message: error.message };
        this.render();
      }
    });
    const assetInput = this.container.querySelector('#assetPackFiles');
    assetInput?.addEventListener('change', event => this.stageAssetFiles(event.target.files));
    const dropZone = this.container.querySelector('#assetPackDrop');
    dropZone?.addEventListener('dragover', event => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'));
    dropZone?.addEventListener('drop', event => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
      this.stageAssetFiles(event.dataTransfer.files);
    });
    this.container.querySelector('#assetNamingGuide')?.addEventListener('click', () => this.downloadAssetNamingGuide());
    this.container.querySelector('#assetPackClear')?.addEventListener('click', () => {
      this.pendingAssets = [];
      this.assetPlan = null;
      this.assetPackReport = null;
      this.render();
    });
    this.container.querySelector('#assetPackCompile')?.addEventListener('click', () => {
      try {
        const result = compileAssetPack(this.project, this.assetPlan);
        this.pendingAssets = [];
        this.assetPlan = null;
        this.assetPackReport = {
          title: 'Asset pack compiled',
          message: `${result.compiled} proven bindings connected. ${result.unmatched.length} unmatched file${result.unmatched.length === 1 ? '' : 's'} left untouched. Review approvals were reset for honest QA.`,
        };
        this.onDirty();
      } catch (error) {
        this.assetPackReport = { error: true, title: 'Compilation stopped', message: error.message };
      }
      this.render();
    });
    this.container.querySelectorAll('.config-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeSection = tab.dataset.section;
        this.container.querySelectorAll('.config-tab').forEach(t => t.classList.remove('active'));
        this.container.querySelectorAll('.config-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`section-${tab.dataset.section}`).classList.add('active');
      });
    });

    this.container.querySelectorAll('.type-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const newType = btn.dataset.type;
        const typeInfo = GAME_TYPES[newType];
        this.project.math.gameType = newType;
        this.project.math.grid = { reels: typeInfo.defaults.reels, rows: [...typeInfo.defaults.rows] };
        this.project.math.paylines = newType === 'lines'
          ? generateDefaultPaylines(this.project.math.grid, typeInfo.defaults.paylineCount || 20)
          : null;
        this.project.math.reelStrips = { BR: generateDefaultReelStrips(this.project) };
        this.onDirty();
        this.render();
      });
    });

    const cfgReels = document.getElementById('cfgReels');
    if (cfgReels) cfgReels.addEventListener('change', () => {
      const n = parseInt(cfgReels.value);
      const rows = this.project.math.grid.rows;
      while (rows.length < n) rows.push(rows[rows.length - 1] || 3);
      rows.length = n;
      this.project.math.grid.reels = n;
      this.onDirty();
      this.render();
    });

    this.container.querySelectorAll('.reel-row-input').forEach(input => {
      input.addEventListener('change', () => {
        this.project.math.grid.rows[parseInt(input.dataset.reel)] = parseInt(input.value);
        this.onDirty();
      });
    });

    const uniformBtn = document.getElementById('uniformRows');
    if (uniformBtn) uniformBtn.addEventListener('click', () => {
      const first = this.project.math.grid.rows[0] || 3;
      this.project.math.grid.rows = this.project.math.grid.rows.map(() => first);
      this.onDirty();
      this.render();
    });

    this.bindField('cfgRTP', v => { this.project.math.rtp = parseFloat(v); });
    this.bindField('cfgWincap', v => { this.project.math.wincap = parseInt(v); });
    this.bindField('cfgWincapRTP', v => { this.project.math.wincapRtp = Math.max(0, Math.min(0.01, parseFloat(v) || 0)); });
    this.bindField('cfgMaxWinOdds', v => {
      const odds = Math.max(0, Math.floor(parseFloat(v) || 0));
      this.project.math.maxWinHitRate = odds > 0 ? 1 / odds : 0;
    });
    this.bindSelect('cfgVolatility', v => { this.project.math.volatility = v; });

    this.bindField('cfgStakeGameName', v => { this.project.build.stakeEngine.gameName = v.trim(); });
    this.bindField('cfgProviderName', v => { this.project.build.stakeEngine.providerName = v.trim(); });
    this.bindField('cfgProviderNumber', v => { this.project.build.stakeEngine.providerNumber = Math.max(0, parseInt(v, 10) || 0); });
    this.bindField('cfgTeamName', v => { this.project.build.stakeEngine.teamName = v.trim(); });

    this.bindField('cfgWilds', v => {
      this.project.math.specialSymbols.wild = v.split(',').map(s => s.trim()).filter(Boolean);
    });
    this.bindField('cfgScatters', v => {
      this.project.math.specialSymbols.scatter = v.split(',').map(s => s.trim()).filter(Boolean);
    });

    this.container.querySelectorAll('[data-mechanic]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.mechanic;
        if (cb.checked) {
          if (!this.project.math.bonusMechanics.includes(key)) this.project.math.bonusMechanics.push(key);
          if (!this.project.math.mechanicConfig) this.project.math.mechanicConfig = {};
          if (!this.project.math.mechanicConfig[key]) {
            const fields = BONUS_MECHANICS[key]?.configFields || {};
            this.project.math.mechanicConfig[key] = {};
            for (const [fk, fd] of Object.entries(fields)) {
              this.project.math.mechanicConfig[key][fk] = fd.default;
            }
          }
        } else {
          this.project.math.bonusMechanics = this.project.math.bonusMechanics.filter(m => m !== key);
        }
        this.onDirty();
        this.render();
      });
    });

    this.container.querySelectorAll('.mechanic-config input, .mechanic-config select, .mechanic-config textarea').forEach(el => {
      const event = el.type === 'checkbox' ? 'change' : 'change';
      el.addEventListener(event, () => {
        const mech = el.dataset.mech;
        const field = el.dataset.field;
        if (!this.project.math.mechanicConfig) this.project.math.mechanicConfig = {};
        if (!this.project.math.mechanicConfig[mech]) this.project.math.mechanicConfig[mech] = {};
        if (el.type === 'checkbox') {
          this.project.math.mechanicConfig[mech][field] = el.checked;
        } else if (el.type === 'number') {
          this.project.math.mechanicConfig[mech][field] = parseFloat(el.value);
        } else if (el.tagName === 'TEXTAREA') {
          try { this.project.math.mechanicConfig[mech][field] = JSON.parse(el.value); } catch {}
        } else {
          this.project.math.mechanicConfig[mech][field] = el.value;
        }
        this.onDirty();
      });
    });

    const addSymbol = document.getElementById('addSymbol');
    if (addSymbol) addSymbol.addEventListener('click', () => {
      if (!this.project.theme.symbols) this.project.theme.symbols = [];
      this.project.theme.symbols.push({ id: crypto.randomUUID(), name: '', tier: 'low', src: '', payouts: { 3: 0, 4: 0, 5: 0 }, special: [] });
      this.onDirty();
      this.render();
    });

    this.container.querySelectorAll('.symbol-row input[data-field="src"]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const idx = parseInt(input.closest('.symbol-row').dataset.index);
        this.project.theme.symbols[idx].src = await this.readFileAsDataURL(file);
        this.onDirty();
        this.render();
      });
    });

    this.container.querySelectorAll('[data-action="clearArt"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.closest('.symbol-row').dataset.index);
        this.project.theme.symbols[idx].src = '';
        this.onDirty();
        this.render();
      });
    });

    const bulkArt = document.getElementById('bulkSymbolArt');
    if (bulkArt) bulkArt.addEventListener('change', (e) => this.handleBulkSymbolArt(e));

    const addBetmode = document.getElementById('addBetmode');
    if (addBetmode) addBetmode.addEventListener('click', () => {
      this.project.math.betModes.push({ name: 'new_mode', cost: 1.0, rtp: 0.965, maxWin: 5000, autoCloseDisabled: false, isFeature: true, isBuyBonus: false, distributions: [] });
      this.onDirty();
      this.render();
    });

    const addTrigger = document.getElementById('addTrigger');
    if (addTrigger) addTrigger.addEventListener('click', () => {
      const count = document.getElementById('newTriggerCount').value;
      const spins = document.getElementById('newTriggerSpins').value;
      if (!count || !spins) return;
      if (!this.project.math.freespinTriggers.basegame) this.project.math.freespinTriggers.basegame = {};
      this.project.math.freespinTriggers.basegame[count] = parseInt(spins);
      this.onDirty();
      this.render();
    });
  }

  bindField(id, setter) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { setter(el.value); this.onDirty(); });
  }

  bindSelect(id, setter) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { setter(el.value); this.onDirty(); });
  }
}
