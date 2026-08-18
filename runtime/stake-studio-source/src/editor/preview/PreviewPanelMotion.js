/**
 * Thin wrapper around PreviewPanel that injects Motion template playback.
 * Animates the real DOM symbol tiles on the preview board — no HTML overlay grid.
 */
import { PreviewPanel as BasePreviewPanel } from './PreviewPanel.js?orchestration=20260815-40';
import { playMotionTemplate } from '../../engines/presentation/playMotionTemplate.js';

const PHASE_LABELS = {
  'symbol.dropIn': 'Board fills',
  'board.settle': 'Settle',
  'cluster.remove': 'Cluster marked',
  'symbol.pop': 'Symbols pop',
  'cluster.fall': 'Tiles fall',
  'cluster.refill': 'New tiles drop in',
  'win.pulse': 'Win pulse',
  'board.shake': 'Board shake',
};

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

function artworkOf(el) {
  if (!el) return null;
  return el.querySelector?.('img') || el;
}

export class PreviewPanel extends BasePreviewPanel {
  render() {
    super.render();
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

    const status = document.createElement('span');
    status.id = 'previewMotionStatus';
    status.className = 'preview-mode';
    status.style.opacity = '0.85';
    status.style.minWidth = '10rem';
    status.textContent = '';

    trigger.insertAdjacentElement('afterend', label);
    label.insertAdjacentElement('afterend', button);
    button.insertAdjacentElement('afterend', status);

    button.addEventListener('click', () => {
      void this.playMotionStylePreview();
    });
  }

  setMotionStatus(text) {
    const el = this.container?.querySelector('#previewMotionStatus');
    if (el) el.textContent = text || '';
  }

  /**
   * Locate the live preview board. Studio and portable shells both use
   * reel columns with .symbol children (or equivalent).
   */
  findPreviewBoard() {
    const root = this.container || document;
    return (
      root.querySelector('.board') ||
      root.querySelector('.preview-board') ||
      root.querySelector('[data-preview-board]') ||
      root.querySelector('.preview-reels') ||
      root.querySelector('[data-preview-grid]') ||
      null
    );
  }

  findSymbolAt(reel, row) {
    const board = this.findPreviewBoard();
    if (!board) return null;

    // Preferred: reel column → symbol row (portable + many studio boards).
    const byColumn = board.children?.[reel]?.children?.[row];
    if (byColumn) return byColumn;

    // data attributes
    const byData =
      board.querySelector(`[data-reel="${reel}"][data-row="${row}"]`) ||
      board.querySelector(`[data-col="${reel}"][data-row="${row}"]`) ||
      board.querySelector(`[data-cell="${reel}:${row}"]`);
    if (byData) return byData;

    // Flat grid of symbols ordered row-major or column-major.
    const symbols = board.querySelectorAll('.symbol, .reel-symbol, [data-symbol]');
    if (symbols.length) {
      const reels = Number(this.project?.math?.grid?.reels) || 6;
      const rows = Number(this.project?.math?.grid?.rows?.[0]) || 4;
      // column-major: reel * rows + row
      const colMajor = symbols[reel * rows + row];
      if (colMajor) return colMajor;
      // row-major: row * reels + reel
      const rowMajor = symbols[row * reels + reel];
      if (rowMajor) return rowMajor;
    }
    return null;
  }

  symbolsAt(positions) {
    return positions.map(([reel, row]) => this.findSymbolAt(reel, row)).filter(Boolean);
  }

  animateElements(elements, keyframes, options = {}) {
    const duration = Math.max(40, Number(options.duration) || 240);
    const animations = [];
    for (const [index, el] of elements.entries()) {
      const target = artworkOf(el);
      if (!target?.animate) continue;
      try {
        const anim = target.animate(keyframes, {
          duration,
          delay: Number(options.delay) || index * (Number(options.stagger) || 0),
          easing: options.easing || 'cubic-bezier(.4,0,.68,1)',
          fill: options.fill || 'forwards',
        });
        animations.push(anim.finished.catch(() => {}));
      } catch {
        /* non-fatal */
      }
    }
    return Promise.all(animations);
  }

  async motionPop(positions, durationMs) {
    const els = this.symbolsAt(positions);
    for (const el of els) el.classList?.add('is-tumble-reacting', 'is-tumble-clearing');
    await this.animateElements(
      els,
      [
        { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
        { offset: 0.4, opacity: 1, transform: 'scale(1.12)', filter: 'brightness(1.6)' },
        { opacity: 0, transform: 'scale(0.2)', filter: 'brightness(2) blur(4px)' },
      ],
      { duration: durationMs || 260, easing: 'cubic-bezier(.4,0,.68,1)' },
    );
  }

  async motionClear(positions, durationMs) {
    const els = this.symbolsAt(positions);
    for (const el of els) el.classList?.add('is-tumble-clearing');
    await this.animateElements(
      els,
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.15)' },
      ],
      { duration: durationMs || 220 },
    );
  }

  async motionFall(positions, durationMs) {
    const els = this.symbolsAt(positions);
    await this.animateElements(
      els,
      [
        { transform: 'translateY(-28%)', filter: 'brightness(0.9)' },
        { transform: 'translateY(0)', filter: 'none' },
      ],
      { duration: durationMs || 300, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }

  async motionRefill(positions, durationMs) {
    const els = this.symbolsAt(positions);
    for (const el of els) {
      // Reset any prior pop opacity so refill is visible.
      const art = artworkOf(el);
      if (art) {
        art.style.opacity = '';
        art.style.transform = '';
        art.style.filter = '';
      }
      el.classList?.remove('is-tumble-clearing', 'is-tumble-reacting');
    }
    await this.animateElements(
      els,
      [
        { opacity: 0, transform: 'translateY(-110%) scale(0.9)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: durationMs || 340, easing: 'cubic-bezier(.2,.9,.3,1)' },
    );
  }

  async motionWin(positions, durationMs) {
    const els = this.symbolsAt(positions);
    for (const el of els) el.classList?.add('is-win-target', 'is-winning');
    await this.animateElements(
      els,
      [
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { offset: 0.5, transform: 'scale(1.1)', filter: 'brightness(1.45)' },
        { transform: 'scale(1)', filter: 'brightness(1)' },
      ],
      { duration: durationMs || 400, fill: 'none', easing: 'ease-in-out' },
    );
  }

  resetMotionStyles() {
    const board = this.findPreviewBoard();
    if (!board) return;
    board.querySelectorAll('.symbol, .reel-symbol, [data-symbol]').forEach((el) => {
      const art = artworkOf(el);
      if (art) {
        art.style.opacity = '';
        art.style.transform = '';
        art.style.filter = '';
      }
      el.classList?.remove(
        'is-tumble-clearing',
        'is-tumble-reacting',
        'is-tumble-recognized',
        'is-win-target',
        'is-winning',
      );
    });
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
    this.setMotionStatus(`${human} · d${cue?.depth ?? 0}`);

    const positions = parseCells(cue?.cells);
    const duration = Number(cue?.durationMs) || 260;

    // Prefer native helper when present (no overlay).
    if (positions.length && typeof this.pulseMechanicCells === 'function') {
      if (
        cueName === 'cluster.remove' ||
        cueName === 'symbol.pop' ||
        cueName === 'win.pulse'
      ) {
        try {
          this.pulseMechanicCells(positions, 'is-mechanic-target');
        } catch {
          /* non-fatal */
        }
      }
    }

    if (cueName === 'symbol.pop' || action === 'react-before-clear' || phase === 'reaction') {
      void this.motionPop(positions, duration);
      return;
    }
    if (cueName === 'cluster.remove' || action === 'clear-tile' || phase === 'clear' || phase === 'remove') {
      void this.motionClear(positions, duration);
      return;
    }
    if (cueName === 'cluster.fall' || action === 'travel-to-destination' || phase === 'fall') {
      void this.motionFall(positions, duration);
      return;
    }
    if (cueName === 'cluster.refill' || cueName === 'symbol.dropIn' || phase === 'refill' || phase === 'enter') {
      void this.motionRefill(positions, duration);
      return;
    }
    if (cueName === 'win.pulse' || action === 'win-highlight' || phase === 'win') {
      void this.motionWin(positions, duration);
      return;
    }
  }

  async playMotionStylePreview() {
    if (this.spinning) return;
    const templateId =
      this.container.querySelector('#previewMotionTemplate')?.value || 'cluster-hex';
    this.motionPlayback?.stop?.();
    this.resetMotionStyles();
    this.setMotionStatus('Playing…');

    const board = this.findPreviewBoard();
    if (!board) {
      console.warn('[motion] no preview board found — cues will log only');
    }

    try {
      this.motionPlayback = await playMotionTemplate(templateId, {
        project: this.project,
        onAnimState: (state) => this.setAnimationState?.(state),
        onTumbleAction: (action, phase, cue) => this.handleMotionTumble(action, phase, cue),
        onLog: (line) => console.log('[motion]', line),
        onComplete: () => {
          this.setMotionStatus('Done');
          window.setTimeout(() => {
            this.resetMotionStyles();
            this.setMotionStatus('');
          }, 900);
        },
        executePresentation: () => {},
      });
    } catch (error) {
      console.error('Motion preview failed', error);
      this.setMotionStatus('Failed');
      window.alert(error.message || String(error));
    }
  }

  destroy() {
    this.motionPlayback?.stop?.();
    this.motionPlayback = null;
    this.resetMotionStyles();
    super.destroy();
  }
}
