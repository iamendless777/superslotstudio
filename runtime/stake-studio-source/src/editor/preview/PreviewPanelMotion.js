/**
 * Thin wrapper around PreviewPanel that injects Motion template playback
 * and a fixed-position overlay locked to the visible reel window.
 */
import { PreviewPanel as BasePreviewPanel } from './PreviewPanel.js?orchestration=20260815-40';
import { playMotionTemplate } from '../../engines/presentation/playMotionTemplate.js';

const MOTION_STYLE_ID = 'stake-studio-motion-cascade-css';

const PHASE_LABELS = {
  'symbol.dropIn': 'Board fills',
  'board.settle': 'Settle',
  'cluster.remove': 'Cluster marked',
  'symbol.pop': 'Symbols pop',
  'cluster.fall': 'Tiles fall',
  'cluster.refill': 'New tiles drop in',
  'win.pulse': 'Win pulse',
  'board.shake': 'Board shake',
  'reel.blur': 'Reels spin',
  'reel.stop': 'Reels stop',
  'reel.anticipation': 'Anticipation',
};

function ensureMotionCascadeStyles() {
  if (document.getElementById(MOTION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MOTION_STYLE_ID;
  style.textContent = `
    .motion-overlay-root {
      position: fixed;
      z-index: 99990;
      pointer-events: none;
      box-sizing: border-box;
    }
    .motion-overlay {
      position: absolute;
      inset: 0;
      display: grid;
      pointer-events: none;
      box-sizing: border-box;
    }
    .motion-overlay-cell {
      border-radius: 12px;
      margin: 5%;
      background: rgba(80, 160, 255, 0.12);
      border: 2px solid rgba(140, 200, 255, 0.35);
      opacity: 0;
      transform: scale(0.96);
      box-sizing: border-box;
    }
    .motion-overlay-cell.is-live {
      opacity: 0.55;
      transform: scale(1);
      background: rgba(100, 180, 255, 0.22);
    }
    .motion-overlay-cell.motion-cell-pop {
      animation: motion-pop 260ms ease-out forwards !important;
      background: rgba(255, 200, 80, 0.75) !important;
      border-color: rgba(255, 230, 120, 0.95) !important;
      opacity: 1 !important;
    }
    .motion-overlay-cell.motion-cell-clear {
      animation: motion-clear 220ms ease-in forwards !important;
      background: rgba(255, 90, 60, 0.8) !important;
      border-color: rgba(255, 160, 120, 0.9) !important;
      opacity: 1 !important;
    }
    .motion-overlay-cell.motion-cell-fall {
      animation: motion-fall 300ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards !important;
      background: rgba(120, 200, 255, 0.55) !important;
      opacity: 1 !important;
    }
    .motion-overlay-cell.motion-cell-refill {
      animation: motion-refill 340ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards !important;
      background: rgba(90, 220, 255, 0.65) !important;
      opacity: 1 !important;
    }
    .motion-overlay-cell.motion-cell-win {
      animation: motion-win 450ms ease-in-out !important;
      background: rgba(255, 215, 100, 0.55) !important;
      box-shadow: 0 0 24px 6px rgba(255, 215, 100, 0.85) !important;
      border-color: rgba(255, 235, 150, 1) !important;
      opacity: 1 !important;
    }
    .motion-overlay-label {
      position: fixed;
      z-index: 99991;
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(0,0,0,0.78);
      color: #d7ecff;
      font: 600 13px/1.35 system-ui, sans-serif;
      letter-spacing: 0.02em;
      pointer-events: none;
      border: 1px solid rgba(160,210,255,0.3);
      max-width: min(420px, 70vw);
    }
    .motion-overlay-label small {
      display: block;
      margin-top: 2px;
      color: #8eb6d8;
      font-weight: 500;
      font-size: 11px;
    }
    @keyframes motion-pop {
      0% { transform: scale(1); opacity: 1; }
      40% { transform: scale(1.18); opacity: 1; }
      100% { transform: scale(0.12); opacity: 0; }
    }
    @keyframes motion-clear {
      0% { transform: scale(1); opacity: 1; }
      100% { transform: scale(0.08); opacity: 0; }
    }
    @keyframes motion-fall {
      0% { transform: translateY(-40%); opacity: 0.35; }
      100% { transform: translateY(0); opacity: 1; }
    }
    @keyframes motion-refill {
      0% { transform: translateY(-130%) scale(0.85); opacity: 0; }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes motion-win {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.12); }
    }
  `;
  document.head.appendChild(style);
}

function parseCells(cells) {
  if (!Array.isArray(cells)) return [];
  return cells
    .map((cell) => {
      if (Array.isArray(cell) && cell.length >= 2) return [Number(cell[0]), Number(cell[1])];
      const parts = String(cell).split(/[: ,x×]/).map(Number);
      return [parts[0], parts[1]];
    })
    .filter(([reel, row]) => Number.isFinite(reel) && Number.isFinite(row));
}

export class PreviewPanel extends BasePreviewPanel {
  render() {
    super.render();
    ensureMotionCascadeStyles();
    this.injectMotionControls();
  }

  injectMotionControls() {
    if (this.disposed) return;
    const trigger = this.container.querySelector('#previewAnimationTrigger');
    if (!trigger) return;
    if (this.container.querySelector('#previewMotionPlay')) return;

    const label = document.createElement('label');
    label.className = 'preview-mode';
    label.innerHTML = `Motion
      <select id="previewMotionTemplate">
        <option value="classic-nine">classic-nine</option>
        <option value="cluster-hex" selected>cluster-hex</option>
      </select>`;

    const button = document.createElement('button');
    button.className = 'tool-btn';
    button.id = 'previewMotionPlay';
    button.type = 'button';
    button.textContent = 'Play Motion';

    trigger.insertAdjacentElement('afterend', label);
    label.insertAdjacentElement('afterend', button);
    button.addEventListener('click', () => {
      void this.playMotionStylePreview();
    });
  }

  gridSize() {
    const reels = Number(this.project?.math?.grid?.reels) || 6;
    const rows = Number(this.project?.math?.grid?.rows?.[0]) || 4;
    return { reels, rows };
  }

  /**
   * Prefer the tightest on-screen rectangle that looks like the reel window.
   */
  findReelRect() {
    const root = this.container || document;
    const candidates = [
      ...root.querySelectorAll('[data-preview-grid], .preview-reels, .reel-grid, .symbol-grid, .game-grid'),
      ...root.querySelectorAll('canvas'),
      ...root.querySelectorAll('.preview-stage, .preview-cabinet, .cabinet-stage, .cabinet-frame'),
    ];

    let best = null;
    let bestScore = -1;
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 120) continue;
      // Prefer ~square-ish mid-size frames over full-page shells.
      const area = r.width * r.height;
      const aspect = r.width / r.height;
      const aspectScore = aspect > 0.7 && aspect < 2.2 ? 1 : 0.4;
      const sizeScore = area > 80000 && area < 900000 ? 1 : 0.5;
      const score = area * aspectScore * sizeScore;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    if (best) return best;

    // Fallback: center box in the preview container.
    const host = root.getBoundingClientRect?.() || { left: 80, top: 120, width: 700, height: 480 };
    const w = Math.min(640, host.width * 0.55);
    const h = Math.min(420, host.height * 0.55);
    return {
      left: host.left + (host.width - w) / 2,
      top: host.top + (host.height - h) / 2.4,
      width: w,
      height: h,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {},
    };
  }

  ensureMotionOverlay() {
    const rect = this.findReelRect();
    const { reels, rows } = this.gridSize();

    let root = document.getElementById('stake-motion-overlay-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'stake-motion-overlay-root';
      root.className = 'motion-overlay-root';
      document.body.appendChild(root);
    }

    root.style.left = `${Math.round(rect.left)}px`;
    root.style.top = `${Math.round(rect.top)}px`;
    root.style.width = `${Math.round(rect.width)}px`;
    root.style.height = `${Math.round(rect.height)}px`;

    let overlay = root.querySelector('.motion-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'motion-overlay';
      root.appendChild(overlay);
    }

    const needed = reels * rows;
    if (overlay.childElementCount !== needed) {
      overlay.innerHTML = '';
      overlay.style.gridTemplateColumns = `repeat(${reels}, 1fr)`;
      overlay.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
      for (let row = 0; row < rows; row += 1) {
        for (let reel = 0; reel < reels; reel += 1) {
          const cell = document.createElement('div');
          cell.className = 'motion-overlay-cell';
          cell.dataset.reel = String(reel);
          cell.dataset.row = String(row);
          cell.dataset.cell = `${reel}:${row}`;
          overlay.appendChild(cell);
        }
      }
    }

    let badge = document.getElementById('stake-motion-overlay-label');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'stake-motion-overlay-label';
      badge.className = 'motion-overlay-label';
      document.body.appendChild(badge);
    }
    badge.style.left = `${Math.round(rect.left + 8)}px`;
    badge.style.top = `${Math.max(8, Math.round(rect.top - 40))}px`;
    badge.innerHTML = 'MOTION PREVIEW<small>cue timeline on reel window</small>';

    this.motionOverlayRoot = root;
    this.motionOverlay = overlay;
    this.motionOverlayBadge = badge;
    return overlay;
  }

  clearMotionOverlay() {
    this.motionOverlayRoot?.remove();
    this.motionOverlayBadge?.remove();
    this.motionOverlayRoot = null;
    this.motionOverlay = null;
    this.motionOverlayBadge = null;
  }

  setMotionBadge(title, detail = '') {
    if (!this.motionOverlayBadge) return;
    this.motionOverlayBadge.innerHTML = detail ? `${title}<small>${detail}</small>` : title;
  }

  overlayCells(positions) {
    const overlay = this.ensureMotionOverlay();
    if (!overlay || !positions.length) return [];
    const found = [];
    for (const [reel, row] of positions) {
      const el = overlay.querySelector(`[data-reel="${reel}"][data-row="${row}"]`);
      if (el) found.push(el);
    }
    return found;
  }

  applyMotionClass(elements, className, durationMs) {
    for (const el of elements) {
      el.classList.add('is-live');
      el.classList.remove(
        'motion-cell-pop',
        'motion-cell-clear',
        'motion-cell-fall',
        'motion-cell-refill',
        'motion-cell-win',
      );
      void el.offsetWidth;
      el.classList.add(className);
      window.setTimeout(() => {
        el.classList.remove(className);
        if (className === 'motion-cell-clear' || className === 'motion-cell-pop') {
          el.classList.remove('is-live');
          el.style.opacity = '0';
        }
        if (className === 'motion-cell-refill') {
          el.classList.add('is-live');
          el.style.opacity = '';
        }
      }, Math.max(50, durationMs || 300));
    }
  }

  handleMotionTumble(action, phase, cue) {
    this.recordPlaybackEvent?.('motionCue', {
      action,
      phase,
      cue: cue?.cue,
      depth: cue?.depth,
    });

    const cueName = cue?.cue || action;
    const human = PHASE_LABELS[cueName] || cueName;
    const cellsLabel = Array.isArray(cue?.cells) && cue.cells.length
      ? cue.cells.join(' · ')
      : 'timing only';
    this.setMotionBadge(`${human}  ·  depth ${cue?.depth ?? 0}`, cellsLabel);

    const positions = parseCells(cue?.cells);
    const duration = Number(cue?.durationMs) || 300;
    const cells = this.overlayCells(positions);

    if (positions.length && typeof this.pulseMechanicCells === 'function') {
      if (action === 'clear-tile' || action === 'react-before-clear' || action === 'win-highlight') {
        try {
          this.pulseMechanicCells(positions, 'is-mechanic-target');
        } catch {
          /* non-fatal */
        }
      }
    }

    if (cueName === 'symbol.dropIn') {
      for (const el of cells) {
        el.style.opacity = '';
        el.classList.add('is-live');
      }
      this.applyMotionClass(cells, 'motion-cell-refill', duration);
      return;
    }
    if (action === 'react-before-clear' || phase === 'reaction' || cueName === 'symbol.pop') {
      this.applyMotionClass(cells, 'motion-cell-pop', duration);
      return;
    }
    if (action === 'clear-tile' || phase === 'clear' || phase === 'remove' || cueName === 'cluster.remove') {
      this.applyMotionClass(cells, 'motion-cell-clear', duration);
      return;
    }
    if (action === 'travel-to-destination' || phase === 'fall' || cueName === 'cluster.fall') {
      this.applyMotionClass(cells, 'motion-cell-fall', duration);
      return;
    }
    if (action === 'stage-entry' || phase === 'enter' || phase === 'refill' || cueName === 'cluster.refill') {
      for (const el of cells) {
        el.style.opacity = '';
        el.classList.add('is-live');
      }
      this.applyMotionClass(cells, 'motion-cell-refill', duration);
      return;
    }
    if (action === 'settle-at-destination' || phase === 'settle' || cueName === 'board.settle') {
      return;
    }
    if (action === 'win-highlight' || phase === 'win' || cueName === 'win.pulse') {
      this.applyMotionClass(cells, 'motion-cell-win', duration);
      return;
    }
  }

  async playMotionStylePreview() {
    if (this.spinning) return;
    const templateId =
      this.container.querySelector('#previewMotionTemplate')?.value || 'cluster-hex';
    this.motionPlayback?.stop?.();
    this.clearMotionOverlay();
    this.ensureMotionOverlay();

    try {
      this.motionPlayback = await playMotionTemplate(templateId, {
        project: this.project,
        onAnimState: (state) => this.setAnimationState?.(state),
        onTumbleAction: (action, phase, cue) => this.handleMotionTumble(action, phase, cue),
        onLog: (line) => console.log('[motion]', line),
        onComplete: () => {
          this.setMotionBadge('Done', 'timeline rehearsal finished');
          window.setTimeout(() => this.clearMotionOverlay(), 900);
        },
        executePresentation: () => {},
      });
    } catch (error) {
      console.error('Motion preview failed', error);
      this.clearMotionOverlay();
      window.alert(error.message || String(error));
    }
  }

  destroy() {
    this.motionPlayback?.stop?.();
    this.motionPlayback = null;
    this.clearMotionOverlay();
    super.destroy();
  }
}
