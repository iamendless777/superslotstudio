import { MathEngine } from '../../engines/math/MathEngine.js';
import { SeededRNG } from '../../engines/math/SeededRNG.js';

export class SimulationDashboard {
  constructor(container, project) {
    this.container = container;
    this.project = project;
    this.mathEngine = new MathEngine(project);
    this.running = false;
    this.results = null;
    this.history = [];
    this.roundLog = [];
    this.config = {
      rounds: 100000,
      seed: SeededRNG.generateSeed(),
      useSeed: true,
      mode: project.math?.betModes?.[0]?.name || 'base',
    };
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="sim-dashboard">
        <div class="sim-sidebar">
          <div class="sidebar-section">
            <h3>Simulation Config</h3>
            <div class="prop-grid">
              <label>Bet mode
                <select id="simMode">
                  ${(this.project.math?.betModes || []).map(mode => `
                    <option value="${mode.name}" ${mode.name === this.config.mode ? 'selected' : ''}>${mode.name} (${mode.cost}x)</option>
                  `).join('')}
                </select>
              </label>
              <label>Rounds
                <input type="number" id="simRounds" value="${this.config.rounds}" min="1000" max="10000000" step="1000">
              </label>
              <label>
                <div style="display:flex;align-items:center;gap:6px">
                  <input type="checkbox" id="simUseSeed" ${this.config.useSeed ? 'checked' : ''}>
                  Seeded (Deterministic)
                </div>
              </label>
              <label>Seed
                <div style="display:flex;gap:4px">
                  <input type="number" id="simSeed" value="${this.config.seed}" style="flex:1" ${!this.config.useSeed ? 'disabled' : ''}>
                  <button class="btn-small" id="btnNewSeed">Roll</button>
                </div>
              </label>
            </div>
          </div>

          <div class="sidebar-section">
            <button class="btn-primary" id="btnRunSim" style="width:100%">${this.running ? 'Running...' : 'Run Simulation'}</button>
            <button class="btn-small" id="btnExportResults" style="width:100%;margin-top:8px" ${!this.results ? 'disabled' : ''}>Export Results</button>
          </div>

          ${this.results ? `
          <div class="sidebar-section">
            <h3>Results Summary</h3>
            <div class="sim-stats">
              <div class="sim-stat">
                <span class="sim-stat-label">RTP</span>
                <span class="sim-stat-value ${this.getRTPClass()}">${(this.results.rtp * 100).toFixed(3)}%</span>
              </div>
              <div class="sim-stat">
                <span class="sim-stat-label">Target RTP</span>
                <span class="sim-stat-value">${(this.results.targetRtp * 100).toFixed(1)}%</span>
              </div>
              <div class="sim-stat">
                <span class="sim-stat-label">Hit Rate</span>
                <span class="sim-stat-value">${(this.results.hitRate * 100).toFixed(2)}%</span>
              </div>
              <div class="sim-stat">
                <span class="sim-stat-label">Avg Win</span>
                <span class="sim-stat-value">${this.results.avgWin.toFixed(2)}x</span>
              </div>
              <div class="sim-stat">
                <span class="sim-stat-label">Max Win</span>
                <span class="sim-stat-value">${this.results.maxWin.toFixed(1)}x</span>
              </div>
              <div class="sim-stat">
                <span class="sim-stat-label">Rounds</span>
                <span class="sim-stat-value">${this.results.rounds.toLocaleString()}</span>
              </div>
              <div class="sim-stat">
                <span class="sim-stat-label">Std Dev</span>
                <span class="sim-stat-value">${this.results.stdDev.toFixed(3)}</span>
              </div>
              <div class="sim-stat">
                <span class="sim-stat-label">95% CI</span>
                <span class="sim-stat-value">${(this.results.ci95Low * 100).toFixed(2)}–${(this.results.ci95High * 100).toFixed(2)}%</span>
              </div>
              <div class="sim-stat">
                <span class="sim-stat-label">Wincap Hits</span>
                <span class="sim-stat-value ${this.results.wincapHits > 0 ? 'stat-warn' : ''}">${this.results.wincapHits.toLocaleString()}</span>
              </div>
              ${this.results.avgCascades > 0 ? `
              <div class="sim-stat">
                <span class="sim-stat-label">Avg Cascades</span>
                <span class="sim-stat-value">${this.results.avgCascades.toFixed(2)}</span>
              </div>
              ` : ''}
            </div>
          </div>
          ` : ''}

          ${this.results ? `
          <div class="sidebar-section">
            <h3>Replay</h3>
            <p class="section-desc">Seed: ${this.results.seed}</p>
            <button class="btn-small" id="btnReplay" style="width:100%">Replay with Same Seed</button>
          </div>
          ` : ''}
        </div>

        <div class="sim-main">
          ${this.results ? this.renderCharts() : this.renderEmpty()}
        </div>
      </div>
    `;

    this.bind();
  }

  renderEmpty() {
    return `
      <div class="panel-placeholder">
        <h2>Simulation Dashboard</h2>
        <p>Configure rounds and seed, then run a simulation to see RTP convergence, win distribution, and hit frequency analysis.</p>
      </div>
    `;
  }

  renderCharts() {
    return `
      <div class="sim-charts">
        <div class="sim-chart-card">
          <h3>RTP Convergence</h3>
          <div class="rtp-chart" id="rtpChart"></div>
        </div>
        <div class="sim-chart-card">
          <h3>Win Distribution</h3>
          <div class="win-dist-chart" id="winDistChart"></div>
        </div>
        <div class="sim-chart-card">
          <h3>Win Tier Breakdown</h3>
          <div class="win-tier-chart" id="winTierChart"></div>
        </div>
        <div class="sim-chart-card">
          <h3>Round Log (Last 20)</h3>
          <div class="round-log" id="roundLog"></div>
        </div>
      </div>
    `;
  }

  getRTPClass() {
    if (!this.results) return '';
    const diff = Math.abs(this.results.rtp - this.results.targetRtp);
    if (diff < 0.005) return 'stat-good';
    if (diff < 0.02) return 'stat-warn';
    return 'stat-bad';
  }

  bind() {
    this.container.querySelector('#simMode')?.addEventListener('change', (e) => {
      this.config.mode = e.target.value;
    });

    this.container.querySelector('#simRounds')?.addEventListener('change', (e) => {
      this.config.rounds = Math.max(1000, parseInt(e.target.value) || 100000);
    });

    this.container.querySelector('#simUseSeed')?.addEventListener('change', (e) => {
      this.config.useSeed = e.target.checked;
      const seedInput = this.container.querySelector('#simSeed');
      if (seedInput) seedInput.disabled = !e.target.checked;
    });

    this.container.querySelector('#simSeed')?.addEventListener('change', (e) => {
      this.config.seed = parseInt(e.target.value) || 0;
    });

    this.container.querySelector('#btnNewSeed')?.addEventListener('click', () => {
      this.config.seed = SeededRNG.generateSeed();
      const seedInput = this.container.querySelector('#simSeed');
      if (seedInput) seedInput.value = this.config.seed;
    });

    this.container.querySelector('#btnRunSim')?.addEventListener('click', () => {
      if (!this.running) this.runSimulation();
    });

    this.container.querySelector('#btnReplay')?.addEventListener('click', () => {
      if (!this.running && this.results) {
        this.config.seed = this.results.seed;
        this.config.useSeed = true;
        this.runSimulation();
      }
    });

    this.container.querySelector('#btnExportResults')?.addEventListener('click', () => this.exportResults());
  }

  runSimulation() {
    this.running = true;
    this.render();

    requestAnimationFrame(() => {
      const seed = this.config.useSeed ? this.config.seed : SeededRNG.generateSeed();
      const rng = new SeededRNG(seed);
      const rounds = this.config.rounds;
      const mode = this.mathEngine.getBetMode(this.config.mode);

      let totalWagered = 0;
      let totalPaid = 0;
      let maxWin = 0;
      let wins = 0;
      let wincapHits = 0;
      let totalCascades = 0;
      let totalBonusSpins = 0;
      const winAmounts = [];
      const roundReturns = [];
      const rtpSnapshots = [];
      const winBuckets = { 0: 0, small: 0, medium: 0, big: 0, mega: 0, epic: 0 };
      this.roundLog = [];

      const snapshotInterval = Math.max(1, Math.floor(rounds / 200));
      const rand = () => rng.random();

      for (let i = 0; i < rounds; i++) {
        const spin = this.mathEngine.resolveRound(rand, mode.name);
        totalWagered += spin.wager;
        const { board, wins: evalWins, totalWin } = spin;
        totalPaid += totalWin;
        totalCascades += spin.spins.reduce((sum, child) => sum + child.cascades, 0);
        totalBonusSpins += spin.freeSpinsPlayed;
        if (spin.wincapHit) wincapHits++;

        if (totalWin > 0) {
          wins++;
          winAmounts.push(totalWin);
          if (spin.normalizedWin > maxWin) maxWin = spin.normalizedWin;
        }

        const normalizedWin = spin.normalizedWin;
        roundReturns.push(normalizedWin);
        if (normalizedWin === 0) winBuckets[0]++;
        else if (normalizedWin < 2) winBuckets.small++;
        else if (normalizedWin < 10) winBuckets.medium++;
        else if (normalizedWin < 50) winBuckets.big++;
        else if (normalizedWin < 200) winBuckets.mega++;
        else winBuckets.epic++;

        if ((i + 1) % snapshotInterval === 0 || i === rounds - 1) {
          rtpSnapshots.push({ round: i + 1, rtp: totalPaid / totalWagered });
        }

        if (i >= rounds - 20) {
          this.roundLog.push({
            round: i + 1, seed: rng.state,
            board: board.map(col => col.join(',')),
            wins: evalWins, totalWin,
            cascades: spin.spins.reduce((sum, child) => sum + child.cascades, 0),
            wager: spin.wager,
            freeSpins: spin.freeSpinsPlayed,
          });
        }
      }

      const rtp = totalPaid / totalWagered;
      const mean = rtp;
      const variance = roundReturns.reduce((s, value) => s + (value - mean) ** 2, 0) / rounds;
      const stdDev = Math.sqrt(variance);
      const se = stdDev / Math.sqrt(rounds);

      this.results = {
        rounds, rtp, seed, mode: mode.name, targetRtp: mode.rtp ?? this.project.math.rtp,
        hitRate: wins / rounds,
        avgWin: wins > 0 ? totalPaid / wins : 0,
        maxWin, stdDev,
        ci95Low: rtp - 1.96 * se,
        ci95High: rtp + 1.96 * se,
        winBuckets, rtpSnapshots,
        wincapHits,
        avgCascades: totalCascades / rounds,
        avgBonusSpins: totalBonusSpins / rounds,
      };

      this.running = false;
      this.render();
      this.drawCharts();
    });
  }

  drawCharts() {
    this.drawRTPChart();
    this.drawWinDistChart();
    this.drawWinTierChart();
    this.drawRoundLog();
  }

  drawRTPChart() {
    const el = this.container.querySelector('#rtpChart');
    if (!el || !this.results) return;

    const snapshots = this.results.rtpSnapshots;
    const targetRTP = this.results.targetRtp;
    const maxRound = snapshots[snapshots.length - 1]?.round || 1;
    const rtpValues = snapshots.map(s => s.rtp);
    const minRTP = Math.min(...rtpValues, targetRTP) - 0.02;
    const maxRTP = Math.max(...rtpValues, targetRTP) + 0.02;
    const range = maxRTP - minRTP;

    const w = el.clientWidth || 600;
    const h = 200;

    const points = snapshots.map(s => {
      const x = (s.round / maxRound) * w;
      const y = h - ((s.rtp - minRTP) / range) * h;
      return `${x},${y}`;
    }).join(' ');

    const targetY = h - ((targetRTP - minRTP) / range) * h;

    el.innerHTML = `
      <svg width="${w}" height="${h + 30}" style="width:100%">
        <line x1="0" y1="${targetY}" x2="${w}" y2="${targetY}" stroke="var(--accent)" stroke-dasharray="4" opacity="0.6"/>
        <polyline points="${points}" fill="none" stroke="var(--success)" stroke-width="2"/>
        <text x="${w - 4}" y="${targetY - 4}" fill="var(--accent)" font-size="10" text-anchor="end">
          Target ${(targetRTP * 100).toFixed(1)}%
        </text>
        <text x="4" y="${h + 16}" fill="var(--text-dim)" font-size="10">0</text>
        <text x="${w - 4}" y="${h + 16}" fill="var(--text-dim)" font-size="10" text-anchor="end">${maxRound.toLocaleString()}</text>
        <text x="4" y="12" fill="var(--text-dim)" font-size="10">${(maxRTP * 100).toFixed(1)}%</text>
        <text x="4" y="${h}" fill="var(--text-dim)" font-size="10">${(minRTP * 100).toFixed(1)}%</text>
      </svg>
    `;
  }

  drawWinDistChart() {
    const el = this.container.querySelector('#winDistChart');
    if (!el || !this.results) return;

    const buckets = this.results.winBuckets;
    const labels = [
      { key: '0', label: 'No Win', color: '#374151' },
      { key: 'small', label: '< 2x', color: '#6b7280' },
      { key: 'medium', label: '2-10x', color: '#3b82f6' },
      { key: 'big', label: '10-50x', color: '#f59e0b' },
      { key: 'mega', label: '50-200x', color: '#ef4444' },
      { key: 'epic', label: '200x+', color: '#a855f7' },
    ];

    const total = this.results.rounds;
    const maxCount = Math.max(...Object.values(buckets));

    el.innerHTML = `
      <div class="dist-bars">
        ${labels.map(l => {
          const count = buckets[l.key] || 0;
          const pct = ((count / total) * 100).toFixed(2);
          const barW = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return `
            <div class="dist-bar-group">
              <div class="dist-bar-label" style="min-width:60px">${l.label}</div>
              <div class="dist-bar-track">
                <div class="dist-bar-fill" style="width:${barW}%; background:${l.color}"></div>
              </div>
              <div class="dist-bar-value">${pct}% (${count.toLocaleString()})</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  drawWinTierChart() {
    const el = this.container.querySelector('#winTierChart');
    if (!el || !this.results) return;

    const buckets = this.results.winBuckets;
    const total = this.results.rounds;
    const winTotal = total - (buckets[0] || 0);

    const tiers = [
      { key: 'small', label: 'Small (< 2x)', color: '#6b7280' },
      { key: 'medium', label: 'Medium (2-10x)', color: '#3b82f6' },
      { key: 'big', label: 'Big (10-50x)', color: '#f59e0b' },
      { key: 'mega', label: 'Mega (50-200x)', color: '#ef4444' },
      { key: 'epic', label: 'Epic (200x+)', color: '#a855f7' },
    ];

    el.innerHTML = `
      <div class="tier-summary">
        <div class="tier-bar-stacked" style="display:flex;height:28px;border-radius:4px;overflow:hidden;margin-bottom:12px">
          ${tiers.map(t => {
            const pct = winTotal > 0 ? ((buckets[t.key] || 0) / winTotal) * 100 : 0;
            return pct > 0 ? `<div style="width:${pct}%;background:${t.color}" title="${t.label}: ${pct.toFixed(1)}%"></div>` : '';
          }).join('')}
        </div>
        <div class="tier-legend">
          ${tiers.map(t => {
            const count = buckets[t.key] || 0;
            const pct = winTotal > 0 ? ((count / winTotal) * 100).toFixed(1) : '0.0';
            return `<div style="display:flex;align-items:center;gap:6px;font-size:12px">
              <div style="width:10px;height:10px;border-radius:2px;background:${t.color}"></div>
              ${t.label}: ${pct}% (${count.toLocaleString()})
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  drawRoundLog() {
    const el = this.container.querySelector('#roundLog');
    if (!el) return;

    el.innerHTML = `
      <table class="wt-table" style="font-size:11px">
        <thead><tr><th>#</th><th>Board</th><th>Win</th></tr></thead>
        <tbody>
          ${this.roundLog.map(r => `
            <tr>
              <td>${r.round}</td>
              <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${r.board.join(' | ')}</td>
              <td style="color:${r.totalWin > 0 ? 'var(--success)' : 'var(--text-dim)'}">${r.totalWin.toFixed(2)}x</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  exportResults() {
    if (!this.results) return;
    const data = JSON.stringify({ config: this.config, results: this.results, roundLog: this.roundLog }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation_${this.results.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
