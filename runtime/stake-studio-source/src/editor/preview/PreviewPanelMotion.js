/**
 * Thin wrapper around PreviewPanel that injects Motion template playback.
 *
 * Cluster templates → playStakeTumble (same cascade pixels as a live round).
 * Classic-nine → Preview reel spin tracks + stop schedule (no wager, no setWin).
 * No HTML overlay grid. No wincap / setWin during rehearsal.
 */
import gsap from 'gsap';
import { PreviewPanel as BasePreviewPanel } from './PreviewPanel.js?orchestration=20260815-40';
import { playMotionTemplate, loadMotionFixture } from '../../engines/presentation/playMotionTemplate.js';
import { getReelStopSchedule } from '../../engines/presentation/PresentationDirector.js';
import {
  cueSheetHasReel,
  cueSheetHasTumble,
  cueSheetToTumbleEvents,
} from '../../engines/presentation/cueSheetToTumbleEvents.js';

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

  motionFillerSymbol() {
    const names = (this.project?.math?.symbols || [])
      .map((symbol) => symbol?.name)
      .filter(Boolean);
    return names.find((name) => !/wild|scatter|bonus|star/i.test(String(name))) || names[0] || 'L1';
  }

  /**
   * Drive Play Motion through playStakeTumble — same pixels as a live cascade.
   * Returns true when the tumble path ran.
   */
  async playMotionAsTumble(sheet) {
    if (typeof this.playStakeTumble !== 'function') return false;
    if (!Array.isArray(this.board) || !this.board.length) return false;
    if (!cueSheetHasTumble(sheet)) return false;

    const events = cueSheetToTumbleEvents(sheet, this.board, {
      fillerSymbol: this.motionFillerSymbol(),
    });
    if (!events.length) return false;

    this.recordPlaybackEvent?.('motionTumbleStart', {
      depths: events.length,
      exploding: events[0].explodingSymbols,
    });

    for (let index = 0; index < events.length; index++) {
      this.setMotionStatus(`Cascade ${index + 1} / ${events.length}`);
      this.board = await this.playStakeTumble(this.board, events[index]);
    }

    this.setMotionStatus('Done');
    window.setTimeout(() => this.setMotionStatus(''), 900);
    return true;
  }

  /**
   * Classic-nine / lines rehearsal: same Preview reel-spin tracks and stop
   * schedule as a live spin, without wagering or firing setWin / wincap.
   */
  async playMotionAsReelRehearsal(sheet) {
    if (!cueSheetHasReel(sheet)) return false;
    if (typeof this.createPreviewReelSpinTrack !== 'function') return false;
    const masks = [...(this.container?.querySelectorAll('.reel-mask') || [])];
    if (!masks.length) return false;
    if (!Array.isArray(this.board) || !this.board.length) return false;

    const rows = this.project?.math?.grid?.rows || [this.board[0]?.length || 3];
    const allSymNames = (this.project?.theme?.symbols || [])
      .filter((symbol) => !symbol.special?.length)
      .map((symbol) => symbol.name)
      .filter(Boolean);
    const hasAnticipation = (sheet.cues || []).some((cue) => cue.cue === 'reel.anticipation');
    const reelSchedule = getReelStopSchedule(this.project, hasAnticipation);
    const board = this.board;

    this.setMotionStatus('Reels spinning');
    this.setAnimationState?.('spinning');
    this.clearPreviewReelSpinTracks?.();

    const spinTracks = masks.map((mask, reelIndex) => this.createPreviewReelSpinTrack(
      mask,
      reelIndex,
      rows[reelIndex] || rows[0],
      allSymNames.length ? allSymNames : (board[reelIndex] || []),
    ));

    await new Promise((resolve) => {
      const tl = gsap.timeline({
        onComplete: resolve,
      });
      this.motionReelTimeline = tl;
      this.motionPlayback = {
        stop: () => {
          tl.kill();
          resolve();
        },
      };
      masks.forEach((mask, reel) => {
        const stopAt = Math.max(0, Number(reelSchedule.stops[reel]?.stopAtMs || 400 + reel * 120) / 1000);
        const landingLead = 0.12;
        tl.call(() => {
          mask.classList.add('is-stopping');
          this.setMotionStatus(`Reel ${reel + 1} stop`);
          this.setAnimationState?.('spinStop');
        }, [], Math.max(0, stopAt - landingLead));
        tl.call(() => {
          this.paintReelBoard?.(reel, board[reel]);
          spinTracks[reel]?.remove();
          mask.classList.remove('is-spinning', 'is-stopping');
          mask.classList.add('has-stopped');
          this.pulseReelImpact?.(reel);
        }, [], stopAt);
      });
      if (hasAnticipation) {
        const cueMs = Number(reelSchedule.anticipationCueMs || 0) / 1000;
        tl.call(() => {
          this.setMotionStatus('Anticipation');
          this.setAnimationState?.('anticipation');
        }, [], Math.max(0, cueMs));
      }
    });

    this.motionReelTimeline = null;
    this.clearPreviewReelSpinTracks?.();
    this.paintBoard?.(board);
    this.setAnimationState?.('idle');

    const winCue = (sheet.cues || []).find((cue) => cue.cue === 'win.pulse');
    if (winCue) {
      this.setMotionStatus('Win pulse');
      await this.motionWin(parseCells(winCue.cells), winCue.durationMs);
    }

    this.setMotionStatus('Done');
    window.setTimeout(() => this.setMotionStatus(''), 900);
    return true;
  }

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

    const byColumn = board.children?.[reel]?.children?.[row];
    if (byColumn) return byColumn;

    const byData =
      board.querySelector(`[data-reel="${reel}"][data-row="${row}"]`) ||
      board.querySelector(`[data-col="${reel}"][data-row="${row}"]`) ||
      board.querySelector(`[data-cell="${reel}:${row}"]`);
    if (byData) return byData;

    const symbols = board.querySelectorAll('.symbol, .reel-symbol, [data-symbol]');
    if (symbols.length) {
      const reels = Number(this.project?.math?.grid?.reels) || 6;
      const rows = Number(this.project?.math?.grid?.rows?.[0]) || 4;
      const colMajor = symbols[reel * rows + row];
      if (colMajor) return colMajor;
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

    if (cueName === 'win.pulse' || action === 'win-highlight' || phase === 'win') {
      void this.motionWin(positions, duration);
    }
  }

  async playMotionStylePreview() {
    if (this.spinning) return;
    const templateId =
      this.container.querySelector('#previewMotionTemplate')?.value || 'cluster-hex';
    this.motionPlayback?.stop?.();
    this.resetMotionStyles();
    this.setMotionStatus('Playing…');

    try {
      const sheet = await loadMotionFixture(templateId);
      if (await this.playMotionAsTumble(sheet)) return;
      if (await this.playMotionAsReelRehearsal(sheet)) return;

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
    this.motionReelTimeline?.kill?.();
    this.motionReelTimeline = null;
    this.resetMotionStyles();
    super.destroy();
  }
}
