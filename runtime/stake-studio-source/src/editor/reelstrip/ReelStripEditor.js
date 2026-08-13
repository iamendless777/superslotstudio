import { DEFAULT_SYMBOLS, generateDefaultReelStrips } from '../../engines/schema.js';

export class ReelStripEditor {
  constructor(container, project, onChange) {
    this.container = container;
    this.project = project;
    this.onChange = onChange;
    this.selectedReel = 0;
    this.mode = 'base';
    this.render();
  }

  get math() { return this.project.math; }
  get symbols() { return this.project.theme.symbols || []; }
  get reelCount() { return this.math.grid.reels; }

  getStrips() {
    const key = this.mode === 'base' ? 'BR' : 'FR';
    if (!this.math.reelStrips[key]) {
      this.math.reelStrips[key] = [];
      for (let i = 0; i < this.reelCount; i++) {
        this.math.reelStrips[key].push(this.generateDefaultStrip());
      }
    }
    while (this.math.reelStrips[key].length < this.reelCount) {
      this.math.reelStrips[key].push(this.generateDefaultStrip());
    }
    return this.math.reelStrips[key];
  }

  generateDefaultStrip() {
    return generateDefaultReelStrips(this.project)[0];
  }

  getWeightTable(reelIndex) {
    const strip = this.getStrips()[reelIndex] || [];
    const counts = {};
    for (const sym of strip) {
      counts[sym] = (counts[sym] || 0) + 1;
    }
    const total = strip.length;
    const table = [];
    const allSyms = new Set([...this.symbols.map(s => s.name), ...Object.keys(counts)]);
    for (const name of allSyms) {
      const count = counts[name] || 0;
      const sym = this.symbols.find(s => s.name === name);
      table.push({
        name,
        tier: sym?.tier || 'unknown',
        count,
        total,
        pct: total > 0 ? ((count / total) * 100).toFixed(1) : '0.0',
      });
    }
    table.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2, special: 3, unknown: 4 };
      return (order[a.tier] ?? 5) - (order[b.tier] ?? 5);
    });
    return table;
  }

  render() {
    const strips = this.getStrips();

    this.container.innerHTML = `
      <div class="reelstrip-editor">
        <div class="reelstrip-sidebar">
          <div class="sidebar-section">
            <h3>Reel Strips</h3>
            <div class="reelstrip-mode-toggle">
              <button class="tool-btn ${this.mode === 'base' ? 'active' : ''}" data-mode="base">Base Game</button>
              <button class="tool-btn ${this.mode === 'free' ? 'active' : ''}" data-mode="free">Free Spins</button>
            </div>
          </div>

          <div class="sidebar-section">
            <h3>Select Reel</h3>
            <div class="reel-tab-list">
              ${Array.from({ length: this.reelCount }, (_, i) => `
                <button class="reel-tab ${i === this.selectedReel ? 'active' : ''}" data-reel="${i}">
                  Reel ${i + 1}
                  <span class="reel-tab-count">${strips[i]?.length || 0} stops</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="sidebar-section">
            <h3>Weight Table</h3>
            <div class="weight-table" id="weightTable"></div>
          </div>

          <div class="sidebar-section">
            <h3>Actions</h3>
            <button class="btn-small" id="btnAutoBalance">Auto-Balance Weights</button>
            <button class="btn-small" id="btnCopyToAll">Copy to All Reels</button>
            <button class="btn-small" id="btnResetStrip">Reset Strip</button>
          </div>
        </div>

        <div class="reelstrip-main">
          <div class="reelstrip-toolbar">
            <span class="reelstrip-info">
              ${this.mode === 'base' ? 'Base Game' : 'Free Spin'} Strips &mdash;
              Reel ${this.selectedReel + 1} of ${this.reelCount} &mdash;
              ${strips[this.selectedReel]?.length || 0} stops
            </span>
            <button class="btn-small" id="btnAddSymbol">+ Add Symbol</button>
          </div>

          <div class="reelstrip-content">
            <div class="reelstrip-visual" id="reelStripVisual"></div>
            <div class="reelstrip-distribution" id="reelDistribution"></div>
          </div>
        </div>
      </div>
    `;

    this.renderWeightTable();
    this.renderStripVisual();
    this.renderDistribution();
    this.bind();
  }

  renderWeightTable() {
    const table = this.getWeightTable(this.selectedReel);
    const el = this.container.querySelector('#weightTable');
    if (!el) return;

    el.innerHTML = `
      <table class="wt-table">
        <thead><tr><th>Sym</th><th>Tier</th><th>Count</th><th>%</th><th></th></tr></thead>
        <tbody>
          ${table.map(row => `
            <tr>
              <td><span class="sym-chip sym-${row.tier}">${row.name}</span></td>
              <td class="wt-tier">${row.tier}</td>
              <td>
                <input type="number" class="wt-count-input" data-sym="${row.name}"
                  value="${row.count}" min="0" max="99" style="width:48px">
              </td>
              <td>${row.pct}%</td>
              <td>
                <div class="wt-bar-wrap">
                  <div class="wt-bar wt-bar-${row.tier}" style="width:${row.pct}%"></div>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  renderStripVisual() {
    const strip = this.getStrips()[this.selectedReel] || [];
    const el = this.container.querySelector('#reelStripVisual');
    if (!el) return;

    const tierColors = { high: '#f59e0b', medium: '#3b82f6', low: '#6b7280', special: '#a855f7', unknown: '#374151' };

    el.innerHTML = `
      <div class="strip-visual-scroll">
        ${strip.map((sym, i) => {
          const s = this.symbols.find(x => x.name === sym);
          const tier = s?.tier || 'unknown';
          const color = tierColors[tier];
          return `
            <div class="strip-cell" data-index="${i}" style="background:${color}20; border-left:3px solid ${color}">
              <span class="strip-cell-index">${i}</span>
              <span class="strip-cell-sym">${sym}</span>
              <button class="strip-cell-del" data-index="${i}">&times;</button>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderDistribution() {
    const table = this.getWeightTable(this.selectedReel);
    const el = this.container.querySelector('#reelDistribution');
    if (!el) return;

    const maxPct = Math.max(...table.map(r => parseFloat(r.pct)), 1);
    const tierColors = { high: '#f59e0b', medium: '#3b82f6', low: '#6b7280', special: '#a855f7', unknown: '#374151' };

    el.innerHTML = `
      <div class="dist-chart">
        <h4>Symbol Distribution — Reel ${this.selectedReel + 1}</h4>
        <div class="dist-bars">
          ${table.map(row => `
            <div class="dist-bar-group">
              <div class="dist-bar-label">${row.name}</div>
              <div class="dist-bar-track">
                <div class="dist-bar-fill" style="width:${(parseFloat(row.pct) / maxPct) * 100}%; background:${tierColors[row.tier]}"></div>
              </div>
              <div class="dist-bar-value">${row.pct}%</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  bind() {
    this.container.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.mode;
        this.render();
      });
    });

    this.container.querySelectorAll('.reel-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedReel = parseInt(btn.dataset.reel);
        this.render();
      });
    });

    this.container.querySelectorAll('.wt-count-input').forEach(input => {
      input.addEventListener('change', () => {
        const sym = input.dataset.sym;
        const newCount = parseInt(input.value) || 0;
        this.updateSymbolCount(this.selectedReel, sym, newCount);
      });
    });

    this.container.querySelectorAll('.strip-cell-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        this.removeStopAt(this.selectedReel, idx);
      });
    });

    this.container.querySelector('#btnAddSymbol')?.addEventListener('click', () => this.addSymbolToStrip());
    this.container.querySelector('#btnAutoBalance')?.addEventListener('click', () => this.autoBalance());
    this.container.querySelector('#btnCopyToAll')?.addEventListener('click', () => this.copyToAllReels());
    this.container.querySelector('#btnResetStrip')?.addEventListener('click', () => this.resetStrip());
  }

  updateSymbolCount(reelIndex, symName, targetCount) {
    const strips = this.getStrips();
    const strip = strips[reelIndex];
    const currentCount = strip.filter(s => s === symName).length;

    if (targetCount > currentCount) {
      for (let i = 0; i < targetCount - currentCount; i++) strip.push(symName);
    } else if (targetCount < currentCount) {
      let removed = 0;
      for (let i = strip.length - 1; i >= 0 && removed < currentCount - targetCount; i--) {
        if (strip[i] === symName) { strip.splice(i, 1); removed++; }
      }
    }
    this.onChange?.();
    this.render();
  }

  removeStopAt(reelIndex, stopIndex) {
    const strips = this.getStrips();
    strips[reelIndex].splice(stopIndex, 1);
    this.onChange?.();
    this.render();
  }

  addSymbolToStrip() {
    const syms = (this.symbols.length > 0 ? this.symbols : DEFAULT_SYMBOLS).map(s => s.name);

    const strips = this.getStrips();
    strips[this.selectedReel].push(syms[0]);
    this.onChange?.();
    this.render();
  }

  autoBalance() {
    const strips = this.getStrips();
    const strip = [];
    const syms = this.symbols.length > 0 ? this.symbols : DEFAULT_SYMBOLS;

    const wilds = new Set(this.math.specialSymbols?.wild || []);
    const scatters = new Set(this.math.specialSymbols?.scatter || []);

    for (const sym of syms) {
      let count;
      if (wilds.has(sym.name)) count = 1;
      else if (scatters.has(sym.name)) count = 1;
      else if (sym.tier === 'high') count = 3;
      else if (sym.tier === 'medium') count = 5;
      else count = 7;
      for (let i = 0; i < count; i++) strip.push(sym.name);
    }
    strips[this.selectedReel] = strip;
    this.onChange?.();
    this.render();
  }

  copyToAllReels() {
    const strips = this.getStrips();
    const source = [...strips[this.selectedReel]];
    for (let i = 0; i < this.reelCount; i++) {
      strips[i] = [...source];
    }
    this.onChange?.();
    this.render();
  }

  resetStrip() {
    const strips = this.getStrips();
    strips[this.selectedReel] = this.generateDefaultStrip();
    this.onChange?.();
    this.render();
  }
}
