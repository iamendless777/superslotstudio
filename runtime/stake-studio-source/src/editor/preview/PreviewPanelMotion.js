/**
 * Thin wrapper around PreviewPanel that injects Motion template playback
 * and applies visible cascade feedback on the preview grid.
 */
import { PreviewPanel as BasePreviewPanel } from './PreviewPanel.js?orchestration=20260815-40';
import { playMotionTemplate } from '../../engines/presentation/playMotionTemplate.js';

const MOTION_STYLE_ID = 'stake-studio-motion-cascade-css';

function ensureMotionCascadeStyles() {
  if (document.getElementById(MOTION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MOTION_STYLE_ID;
  style.textContent = `
    .motion-cell-pop {
      animation: motion-pop 260ms ease-out forwards !important;
      z-index: 5;
    }
    .motion-cell-clear {
      animation: motion-clear 220ms ease-in forwards !important;
      pointer-events: none;
    }
    .motion-cell-fall {
      animation: motion-fall 300ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards !important;
    }
    .motion-cell-refill {
      animation: motion-refill 340ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards !important;
    }
    .motion-cell-win {
      animation: motion-win 450ms ease-in-out !important;
      box-shadow: 0 0 18px 4px rgba(255, 215, 100, 0.85) !important;
      outline: 2px solid rgba(255, 220, 120, 0.95);
      z-index: 6;
    }
    .motion-board-shake {
      animation: motion-shake 180ms ease-in-out !important;
    }
    @keyframes motion-pop {
      0% { transform: scale(1); filter: brightness(1); }
      40% { transform: scale(1.18); filter: brightness(1.35); }
      100% { transform: scale(0.2); opacity: 0; filter: brightness(2); }
    }
    @keyframes motion-clear {
      0% { transform: scale(1); opacity: 1; }
      100% { transform: scale(0.15); opacity: 0; }
    }
    @keyframes motion-fall {
      0% { transform: translateY(-28%); opacity: 0.85; }
      100% { transform: translateY(0); opacity: 1; }
    }
    @keyframes motion-refill {
      0% { transform: translateY(-110%) scale(0.9); opacity: 0; }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes motion-win {
      0%, 100% { transform: scale(1); filter: brightness(1); }
      50% { transform: scale(1.08); filter: brightness(1.4); }
    }
    @keyframes motion-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-6px); }
      75% { transform: translateX(6px); }
    }
  `;
  document.head.appendChild(style);
}

function parseCells(cells) {
  if (!Array.isArray(cells)) return [];
  return cells
    .map((cell) => {
      if (Array.isArray(cell) && cell.length >= 2) {
        return [Number(cell[0]), Number(cell[1])];
      }
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

  /**
   * Best-effort cell lookup across DOM layouts used by the preview.
   * Returns HTMLElement[] that can take CSS animation classes.
   */
  findMotionCells(positions) {
    const root = this.container || document;
    const found = [];
    for (const [reel, row] of positions) {
      const selectors = [
        `[data-reel="${reel}"][data-row="${row}"]`,
        `[data-col="${reel}"][data-row="${row}"]`,
        `[data-x="${reel}"][data-y="${row}"]`,
        `.reel-${reel} .row-${row}`,
        `.reel-${reel} .symbol-${row}`,
        `#reel-${reel}-row-${row}`,
        `[data-cell="${reel}:${row}"]`,
        `[data-cell="${reel},${row}"]`,
      ];
      let el = null;
      for (const sel of selectors) {
        el = root.querySelector(sel);
        if (el) break;
      }
      // Grid-order fallback: reels left-to-right, rows top-to-bottom.
      if (!el) {
        const grid =
          root.querySelector('.preview-reels, .reel-grid, .symbol-grid, .game-grid, [data-preview-grid]') ||
          root.querySelector('.preview-stage, .preview-cabinet, .cabinet-stage');
        if (grid) {
          const reels = Number(this.project?.math?.grid?.reels) || 6;
          const rows = Number(this.project?.math?.grid?.rows?.[0]) || 4;
          const index = row * reels + reel;
          const candidates = grid.querySelectorAll(
            '.symbol, .reel-symbol, .cell, [data-symbol], img, canvas',
          );
          if (candidates[index]) el = candidates[index];
          // Sometimes structure is reel columns each with row children.
          if (!el) {
            const cols = grid.querySelectorAll('.reel, [data-reel], .reel-column');
            const col = cols[reel];
            if (col) {
              const cells = col.querySelectorAll('.symbol, .reel-symbol, .cell, [data-symbol], img');
              if (cells[row]) el = cells[row];
            }
          }
          void rows;
        }
      }
      if (el) found.push(el);
    }
    return found;
  }

  applyMotionClass(elements, className, durationMs) {
    for (const el of elements) {
      el.classList.remove(
        'motion-cell-pop',
        'motion-cell-clear',
        'motion-cell-fall',
        'motion-cell-refill',
        'motion-cell-win',
      );
      // Force reflow so re-triggering the same animation works.
      void el.offsetWidth;
      el.classList.add(className);
      window.setTimeout(() => {
        el.classList.remove(className);
        if (className === 'motion-cell-clear' || className === 'motion-cell-pop') {
          el.style.opacity = '0';
        }
        if (className === 'motion-cell-refill') {
          el.style.opacity = '';
        }
      }, Math.max(50, durationMs || 300));
    }
  }

  shakeMotionBoard() {
    const stage =
      this.container.querySelector(
        '.preview-stage, .preview-cabinet, .cabinet-stage, .preview-reels, [data-preview-grid]',
      ) || this.container;
    stage.classList.remove('motion-board-shake');
    void stage.offsetWidth;
    stage.classList.add('motion-board-shake');
    window.setTimeout(() => stage.classList.remove('motion-board-shake'), 200);
  }

  handleMotionTumble(action, phase, cue) {
    this.recordPlaybackEvent?.('motionCue', {
      action,
      phase,
      cue: cue?.cue,
      depth: cue?.depth,
    });

    const positions = parseCells(cue?.cells);
    const duration = Number(cue?.durationMs) || 300;
    const cells = positions.length ? this.findMotionCells(positions) : [];

    // Prefer existing studio helpers when present.
    if (positions.length && typeof this.pulseMechanicCells === 'function') {
      if (action === 'clear-tile' || action === 'react-before-clear' || action === 'win-highlight') {
        try {
          this.pulseMechanicCells(positions, 'is-mechanic-target');
        } catch {
          /* non-fatal */
        }
      }
    }

    if (action === 'react-before-clear' || phase === 'reaction') {
      this.applyMotionClass(cells, 'motion-cell-pop', duration);
      return;
    }
    if (action === 'clear-tile' || phase === 'clear' || phase === 'remove') {
      this.applyMotionClass(cells, 'motion-cell-clear', duration);
      return;
    }
    if (action === 'travel-to-destination' || phase === 'fall') {
      // Fall often has empty cells in the fixture — animate whole board columns lightly.
      if (cells.length) {
        this.applyMotionClass(cells, 'motion-cell-fall', duration);
      } else {
        const all = this.findMotionCells(this.sampleBoardPositions());
        this.applyMotionClass(all, 'motion-cell-fall', duration);
      }
      return;
    }
    if (action === 'stage-entry' || phase === 'enter' || phase === 'refill') {
      if (cells.length) {
        this.applyMotionClass(cells, 'motion-cell-refill', duration);
      } else {
        const all = this.findMotionCells(this.sampleBoardPositions());
        // Restore opacity after clears, then refill motion.
        for (const el of all) el.style.opacity = '';
        this.applyMotionClass(all, 'motion-cell-refill', duration);
      }
      return;
    }
    if (action === 'settle-at-destination' || phase === 'settle') {
      for (const el of cells.length ? cells : this.findMotionCells(this.sampleBoardPositions())) {
        el.style.opacity = '';
        el.style.transform = '';
      }
      return;
    }
    if (action === 'win-highlight' || phase === 'win') {
      this.applyMotionClass(cells, 'motion-cell-win', duration);
      return;
    }
    if (cue?.cue === 'board.shake') {
      this.shakeMotionBoard();
    }
  }

  sampleBoardPositions() {
    const reels = Number(this.project?.math?.grid?.reels) || 6;
    const rows = Number(this.project?.math?.grid?.rows?.[0]) || 4;
    const out = [];
    for (let row = 0; row < rows; row += 1) {
      for (let reel = 0; reel < reels; reel += 1) out.push([reel, row]);
    }
    return out;
  }

  async playMotionStylePreview() {
    if (this.spinning) return;
    const templateId =
      this.container.querySelector('#previewMotionTemplate')?.value || 'cluster-hex';
    this.motionPlayback?.stop?.();

    // Reset any leftover motion opacity from a prior run.
    for (const el of this.findMotionCells(this.sampleBoardPositions())) {
      el.style.opacity = '';
      el.style.transform = '';
      el.classList.remove(
        'motion-cell-pop',
        'motion-cell-clear',
        'motion-cell-fall',
        'motion-cell-refill',
        'motion-cell-win',
      );
    }

    try {
      this.motionPlayback = await playMotionTemplate(templateId, {
        project: this.project,
        onAnimState: (state) => this.setAnimationState?.(state),
        onTumbleAction: (action, phase, cue) => this.handleMotionTumble(action, phase, cue),
        onLog: (line) => console.log('[motion]', line),
        // Do not route motion cues through the full presentation director.
        // That path previously fired wincap / max-win overlays.
        executePresentation: () => {},
      });
    } catch (error) {
      console.error('Motion preview failed', error);
      window.alert(error.message || String(error));
    }
  }

  destroy() {
    this.motionPlayback?.stop?.();
    this.motionPlayback = null;
    super.destroy();
  }
}
