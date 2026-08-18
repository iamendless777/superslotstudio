/**
 * Thin wrapper around PreviewPanel that injects Motion template playback
 * and a DOM overlay grid so cascade is visible even when the board is Pixi.
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
    .motion-overlay {
      position: absolute;
      inset: 12% 18% 22% 18%;
      display: grid;
      pointer-events: none;
      z-index: 40;
      box-sizing: border-box;
    }
    .motion-overlay-cell {
      border-radius: 10px;
      margin: 6%;
      background: radial-gradient(circle at 40% 30%, rgba(255,255,255,0.28), rgba(120,180,255,0.06) 55%, transparent);
      border: 1px solid rgba(255,255,255,0.08);
      opacity: 0;
      transform: scale(0.94);
      transition: opacity 100ms linear;
    }
    .motion-overlay-cell.is-live {
      opacity: 0.45;
      transform: scale(1);
    }
    .motion-overlay-cell.motion-cell-pop {
      animation: motion-pop 260ms ease-out forwards !important;
      background: radial-gradient(circle, rgba(255,220,120,0.9), rgba(255,80,40,0.4));
      opacity: 1 !important;
    }
    .motion-overlay-cell.motion-cell-clear {
      animation: motion-clear 220ms ease-in forwards !important;
      background: radial-gradient(circle, rgba(255,120,80,0.95), rgba(80,20,20,0.25));
      opacity: 1 !important;
    }
    .motion-overlay-cell.motion-cell-fall {
      animation: motion-fall 300ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards !important;
      opacity: 0.85 !important;
    }
    .motion-overlay-cell.motion-cell-refill {
      animation: motion-refill 340ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards !important;
      background: radial-gradient(circle, rgba(140,220,255,0.8), rgba(40,80,160,0.3));
      opacity: 1 !important;
    }
    .motion-overlay-cell.motion-cell-win {
      animation: motion-win 450ms ease-in-out !important;
      box-shadow: 0 0 22px 6px rgba(255, 215, 100, 0.9) !important;
      border-color: rgba(255, 230, 140, 0.95);
      opacity: 1 !important;
    }
    .motion-board-shake {
      animation: motion-shake 180ms ease-in-out !important;
    }
    .motion-overlay-label {
      position: absolute;
      left: 12px;
      top: 12px;
      max-width: 60%;
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(0,0,0,0.72);
      color: #d7ecff;
      font: 600 13px/1.35 system-ui, sans-serif;
      letter-spacing: 0.02em;
      z-index: 41;
      pointer-events: none;
      border: 1px solid rgba(160,210,255,0.25);
    }
    .motion-overlay-label small {
      display: block;
      margin-top: 2px;
      color: #8eb6d8;
      font-weight: 500;
      font-size: 11px;
    }
    @keyframes motion-pop {
      0% { transform: scale(1); filter: brightness(1); opacity: 1; }
      40% { transform: scale(1.2); filter: brightness(1.4); opacity: 1; }
      100% { transform: scale(0.15); opacity: 0; filter: brightness(2); }
    }
    @keyframes motion-clear {
      0% { transform: scale(1); opacity: 1; }
      100% { transform: scale(0.1); opacity: 0; }
    }
    @keyframes motion-fall {
      0% { transform: translateY(-35%); opacity: 0.4; }
      100% { transform: translateY(0); opacity: 0.85; }
    }
    @keyframes motion-refill {
      0% { transform: translateY(-120%) scale(0.85); opacity: 0; }
      100% { transform: translateY(0) scale(1); opacity: 0.75; }
    }
    @keyframes motion-win {
      0%, 100% { transform: scale(1); filter: brightness(1); }
      50% { transform: scale(1.1); filter: brightness(1.5); }
    }
    @keyframes motion-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-7px); }
      75% { transform: translateX(7px); }
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

  findBoardHost() {
    const root = this.container || document;
    return (
      root.querySelector('[data-preview-grid]') ||
      root.querySelector('.preview-reels') ||
      root.querySelector('.reel-grid') ||
      root.querySelector('.symbol-grid') ||
      root.querySelector('.game-grid') ||
      root.querySelector('.preview-stage') ||
      root.querySelector('.preview-cabinet') ||
      root.querySelector('.cabinet-stage') ||
      root.querySelector('.cabinet-frame') ||
      root.querySelector('canvas')?.parentElement ||
      root.querySelector('.preview-panel, .preview, main') ||
      root
    );
  }

  ensureMotionOverlay() {
    const host = this.findBoardHost();
    if (!host) return null;
    const style = getComputedStyle(host);
    if (style.position === 'static') host.style.position = 'relative';

    let overlay = host.querySelector(':scope > .motion-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'motion-overlay';
      overlay.setAttribute('data-motion-overlay', '1');
      host.appendChild(overlay);
    }

    const { reels, rows } = this.gridSize();
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

    let badge = host.querySelector(':scope > .motion-overlay-label');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'motion-overlay-label';
      host.appendChild(badge);
    }
    badge.innerHTML = 'MOTION PREVIEW<small>cue timeline rehearsal — not final art motion</small>';

    this.motionOverlay = overlay;
    this.motionOverlayHost = host;
    this.motionOverlayBadge = badge;
    return overlay;
  }

  clearMotionOverlay() {
    this.motionOverlay?.remove();
    this.motionOverlayBadge?.remove();
    this.motionOverlay = null;
    this.motionOverlayBadge = null;
    this.motionOverlayHost = null;
  }

  setMotionBadge(title, detail = '') {
    if (!this.motionOverlayBadge) return;
    this.motionOverlayBadge.innerHTML = detail
      ? `${title}<small>${detail}</small>`
      : title;
  }

  overlayCells(positions) {
    const overlay = this.ensureMotionOverlay();
    if (!overlay) return [];
    // Never animate the whole board unless positions are explicit.
    if (!positions.length) return [];
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

  shakeMotionBoard() {
    const host = this.motionOverlayHost || this.findBoardHost();
    if (!host) return;
    host.classList.remove('motion-board-shake');
    void host.offsetWidth;
    host.classList.add('motion-board-shake');
    window.setTimeout(() => host.classList.remove('motion-board-shake'), 200);
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
      : 'board-wide timing only';
    this.setMotionBadge(
      `${human}  ·  depth ${cue?.depth ?? 0}`,
      cellsLabel,
    );

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

    // drop-in / reveal: show listed cells as the board coming online
    if (cueName === 'symbol.dropIn' || action === 'stage-entry' && phase === 'enter' && positions.length > 6) {
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
      // Only explicit fall cells — never whole board.
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
      // Timing beat only — no flash.
      return;
    }
    if (action === 'win-highlight' || phase === 'win' || cueName === 'win.pulse') {
      this.applyMotionClass(cells, 'motion-cell-win', duration);
      return;
    }
    if (cueName === 'board.shake') {
      this.shakeMotionBoard();
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
          window.setTimeout(() => this.clearMotionOverlay(), 800);
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
