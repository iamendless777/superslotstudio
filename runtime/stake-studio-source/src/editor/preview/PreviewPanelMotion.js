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
  cloneBoard,
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

function rehearsalReelSchedule(project, hasAnticipation, reelCount) {
  const base = getReelStopSchedule(project, hasAnticipation);
  const timing = base.timing;
  const holdMs = hasAnticipation ? Math.max(Number(timing.anticipationHoldMs) || 0, 1400) : 0;
  const count = Math.max(1, reelCount);
  const stops = Array.from({ length: count }, (_, reel) => {
    const delayMs = reel * timing.perReelDelayMs;
    const extra = hasAnticipation && reel === count - 1 ? holdMs : 0;
    const durationMs = timing.baseDurationMs + reel * timing.perReelDurationMs + extra;
    return { reel, delayMs, durationMs, stopAtMs: delayMs + durationMs };
  });
  const penultimate = stops[Math.max(0, stops.length - 2)];
  return {
    timing,
    stops,
    totalMs: Math.max(...stops.map((stop) => stop.stopAtMs)),
    anticipationCueMs: hasAnticipation
      ? penultimate.stopAtMs + (timing.anticipationCueLagMs || 50)
      : null,
  };
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
        <option value="sticky-five">sticky-five</option>
        <option value="anticipation-five">anticipation-five</option>
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

    const debug = document.createElement('span');
    debug.id = 'previewMotionDebug';
    debug.className = 'preview-mode';
    debug.textContent = 'motion idle';

    const art = document.createElement('details');
    art.id = 'previewMotionArt';
    art.className = 'preview-motion-art';
    art.innerHTML = '<summary>Art</summary><div class="preview-motion-art-body">No brief</div>';

    trigger.insertAdjacentElement('afterend', label);
    label.insertAdjacentElement('afterend', button);
    button.insertAdjacentElement('afterend', status);
    status.insertAdjacentElement('afterend', debug);
    debug.insertAdjacentElement('afterend', art);

    button.addEventListener('click', () => {
      void this.playMotionStylePreview();
    });
    void this.populateMotionTemplates();
  }

  async populateMotionTemplates() {
    const select = this.container?.querySelector('#previewMotionTemplate');
    if (!select) return;
    try {
      const response = await fetch('/motion-fixtures/index.json');
      if (!response.ok) return;
      const index = await response.json();
      const templates = Array.isArray(index?.templates) ? index.templates : [];
      if (!templates.length) return;
      this.motionTemplateIndex = templates;
      const current = select.value || 'cluster-hex';
      select.replaceChildren();
      for (const template of templates) {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.kind ? `${template.id} · ${template.kind}` : template.id;
        option.selected = template.id === current;
        select.appendChild(option);
      }
      if (![...select.options].some((option) => option.selected) && select.options.length) {
        const cluster = [...select.options].find((option) => option.value === 'cluster-hex');
        (cluster || select.options[0]).selected = true;
      }
      if (!select.dataset.artBound) {
        select.dataset.artBound = '1';
        select.addEventListener('change', () => this.syncMotionArtStatus());
      }
      this.syncMotionArtStatus();
    } catch {
      /* keep the static fallback options */
    }
  }

  setMotionStatus(text) {
    const el = this.container?.querySelector('#previewMotionStatus');
    if (el) el.textContent = text || '';
  }

  setMotionDebug(info) {
    const snapshot = {
      at: new Date().toISOString(),
      ...info,
    };
    window.__MOTION_LAST_PLAY__ = snapshot;
    const el = this.container?.querySelector('#previewMotionDebug');
    if (!el) return;
    const exploding = Array.isArray(info.exploding)
      ? info.exploding.map((cell) => `${cell.reel}:${cell.row}`).join(',')
      : (info.exploding || '');
    el.textContent = [
      info.path || 'idle',
      info.grid,
      info.step,
      exploding ? `pop ${exploding}` : '',
      info.tumbling ? 'layer-on' : '',
      info.note,
    ].filter(Boolean).join(' · ');
  }

  motionGridLabel() {
    const reels = this.board?.length || this.project?.math?.grid?.reels || 0;
    const rows = this.board?.[0]?.length || this.project?.math?.grid?.rows?.[0] || 0;
    return `${reels}x${rows}`;
  }

  escapeMotionText(value) {
    return String(value ?? '')
      .replace(/&/g, '&' + 'amp;')
      .replace(/</g, '&' + 'lt;')
      .replace(/>/g, '&' + 'gt;')
      .replace(/"/g, '&' + 'quot;');
  }

  liveProjectArtGaps() {
    return (this.project?.theme?.symbols || [])
      .filter((symbol) => {
        if (!symbol || symbol.special?.includes?.('empty')) return false;
        if (!symbol.src) return true;
        const image = this.preloadedImages?.get(symbol.src);
        return Boolean(image?.complete && !image.naturalWidth);
      })
      .map((symbol) => ({
        name: symbol.name || symbol.id || 'symbol',
        reason: symbol.src ? 'failed' : 'unassigned',
      }));
  }

  liveProjectArtBrief() {
    const gaps = new Set(this.liveProjectArtGaps().map((gap) => gap.name));
    let regular = 0;
    const slots = (this.project?.theme?.symbols || [])
      .filter((symbol) => symbol && !symbol.special?.includes?.('empty'))
      .map((symbol) => {
        const name = symbol.name || symbol.id || 'symbol';
        const special = symbol.special || [];
        let role = 'low';
        if (special.includes('wild') || /wild/i.test(name)) role = 'wild';
        else if (special.includes('scatter') || /scatter/i.test(name)) role = 'scatter';
        else if (regular++ === 0) role = 'high';
        return {
          symbolId: symbol.id || name,
          label: name,
          role,
          artKey: symbol.src || null,
          status: gaps.has(name) ? 'missing' : 'assigned',
        };
      });
    return {
      gameId: this.project?.id || 'preview',
      title: this.project?.name || this.project?.id || 'Loaded project',
      grid: this.motionGridLabel(),
      slots,
      missingCount: slots.filter((slot) => slot.status === 'missing').length,
      readyToCommission: slots.length > 0,
    };
  }

  syncMotionArtStatus() {
    if (this.motionPlaying) return;
    const select = this.container?.querySelector('#previewMotionTemplate');
    const id = select?.value;
    const entry = (this.motionTemplateIndex || []).find((template) => template.id === id);
    const liveGaps = this.liveProjectArtGaps();
    const templateMissing = Number(entry?.missingArt) || 0;
    if (liveGaps.length) {
      this.setMotionStatus(`Board ${liveGaps.length} art gaps`);
    } else if (templateMissing) {
      this.setMotionStatus(`Board art ready · ${id} recipe ${templateMissing} unassigned`);
    } else {
      this.setMotionStatus('Art assigned');
    }
    void this.loadMotionArtBrief(id, liveGaps);
  }

  async loadMotionArtBrief(templateId, liveGaps = this.liveProjectArtGaps()) {
    const host = this.container?.querySelector('#previewMotionArt');
    if (!host || !templateId) return;
    const summary = host.querySelector('summary');
    const body = host.querySelector('.preview-motion-art-body');
    try {
      const response = await fetch(`/motion-fixtures/art-briefs/${templateId}.json`);
      if (!response.ok) return;
      const brief = await response.json();
      const boardBrief = this.liveProjectArtBrief();
      this.motionArtBrief = { board: boardBrief, recipe: brief };
      const esc = (value) => this.escapeMotionText(value);
      if (summary) {
        summary.textContent = liveGaps.length
          ? `Art · ${liveGaps.length} board gaps`
          : 'Art · board ready';
      }
      if (body) {
        const liveItems = liveGaps.length
          ? liveGaps.map((gap) => `<li data-status="missing"><strong>${esc(gap.name)}</strong> · ${esc(gap.reason)}</li>`).join('')
          : `<li data-status="assigned"><strong>${esc(boardBrief.title)}</strong> · ${boardBrief.slots.length} symbols assigned</li>`;
        const slots = (brief.slots || [])
          .map((slot) => (
            `<li data-status="${esc(slot.status)}"><strong>${esc(slot.label)}</strong> · ${esc(slot.role)} · ${esc(slot.status)}<span>${esc(slot.guidance)}</span></li>`
          ))
          .join('');
        body.innerHTML = `
          <p>This board · ${esc(boardBrief.grid)}</p>
          <ol>${liveItems}</ol>
          <p>${esc(brief.title)} recipe · ${esc(brief.notes || '')}</p>
          <ol>${slots}</ol>
          <button type="button" class="tool-btn" id="previewMotionArtCopyBoard">Copy board brief</button>
          <button type="button" class="tool-btn" id="previewMotionArtCopy">Copy recipe brief</button>`;
        body.querySelector('#previewMotionArtCopyBoard')?.addEventListener('click', (event) => {
          event.preventDefault();
          void navigator.clipboard?.writeText(JSON.stringify(boardBrief, null, 2));
          this.setMotionStatus('Board art brief copied');
        });
        body.querySelector('#previewMotionArtCopy')?.addEventListener('click', (event) => {
          event.preventDefault();
          void navigator.clipboard?.writeText(JSON.stringify(brief, null, 2));
          this.setMotionStatus('Recipe art brief copied');
        });
      }
    } catch {
      /* keep last brief */
    }
  }

  motionFillerSymbol() {
    const names = (this.project?.math?.symbols || [])
      .map((symbol) => symbol?.name)
      .filter(Boolean);
    return names.find((name) => !/wild|scatter|bonus|star/i.test(String(name))) || names[0] || 'L1';
  }

  stickyMorphCells(board, morphCue) {
    const flagged = this.positionsForSymbol?.(board, null, 'wild') || [];
    if (flagged.length) return flagged;
    const named = [];
    for (let reel = 0; reel < (board || []).length; reel++) {
      for (let row = 0; row < (board[reel] || []).length; row++) {
        const name = String(board[reel][row]?.name || board[reel][row] || '');
        if (/wild|sticky|oneiric|star/i.test(name)) named.push([reel, row]);
      }
    }
    if (named.length) return named;
    return parseCells(morphCue?.cells).filter(([reel, row]) => (
      reel >= 0 && reel < (board || []).length && row >= 0 && row < (board[reel] || []).length
    ));
  }

  restoreMotionBoard() {
    if (!this.motionSourceBoard) return;
    this.board = this.motionSourceBoard;
    this.paintBoard?.(this.motionSourceBoard);
    this.motionSourceBoard = null;
  }

  scheduleMotionBoardRestore() {
    if (this.motionRestoreTimer) window.clearTimeout(this.motionRestoreTimer);
    this.motionRestoreTimer = window.setTimeout(() => {
      this.motionRestoreTimer = null;
      this.restoreMotionBoard();
      this.syncMotionArtStatus();
      this.setMotionDebug({
        path: 'idle',
        grid: this.motionGridLabel(),
        step: 'restored',
        tumbling: false,
      });
    }, 1200);
  }

  /**
   * Drive Play Motion through playStakeTumble — same pixels as a live cascade.
   * Returns true when the tumble path ran.
   */
  async playMotionAsTumble(sheet) {
    if (typeof this.playStakeTumble !== 'function') return false;
    if (!Array.isArray(this.board) || !this.board.length) return false;
    if (!cueSheetHasTumble(sheet)) return false;

    const sourceBoard = cloneBoard(this.board);
    const events = cueSheetToTumbleEvents(sheet, sourceBoard, {
      fillerSymbol: this.motionFillerSymbol(),
      retargetFromBoard: true,
      minCluster: 3,
    });
    if (!events.length) return false;

    this.motionSourceBoard = sourceBoard;
    this.setMotionDebug({
      path: 'tumble',
      grid: this.motionGridLabel(),
      step: `d0/${events.length}`,
      exploding: events[0].explodingSymbols,
      tumbling: true,
      note: 'playStakeTumble',
    });
    this.recordPlaybackEvent?.('motionTumbleStart', {
      depths: events.length,
      exploding: events[0].explodingSymbols,
    });

    try {
      let current = sourceBoard;
      for (let index = 0; index < events.length; index++) {
        this.setMotionStatus(`Cascade ${index + 1} / ${events.length}`);
        this.setMotionDebug({
          path: 'tumble',
          grid: this.motionGridLabel(),
          step: `d${index + 1}/${events.length}`,
          exploding: events[index].explodingSymbols,
          tumbling: true,
          note: 'playStakeTumble',
        });
        current = await this.playStakeTumble(current, events[index]);
        this.board = current;
      }
      this.setMotionStatus('Done');
      this.setMotionDebug({
        path: 'tumble',
        grid: this.motionGridLabel(),
        step: 'done',
        tumbling: false,
        note: 'restore queued',
      });
      this.scheduleMotionBoardRestore();
      return true;
    } catch (error) {
      this.restoreMotionBoard();
      throw error;
    }
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
    const reelSchedule = rehearsalReelSchedule(this.project, hasAnticipation, masks.length);
    const board = this.board;

    this.setMotionStatus('Reels spinning');
    this.setMotionDebug({
      path: 'reel',
      grid: this.motionGridLabel(),
      step: 'blur',
      tumbling: false,
      note: hasAnticipation ? 'anticipation' : 'classic',
    });
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
        const lastMask = masks[masks.length - 1];
        tl.call(() => {
          lastMask?.classList.add('is-anticipation');
          this.setMotionStatus('Anticipation');
          this.setMotionDebug({
            path: 'reel',
            grid: this.motionGridLabel(),
            step: 'hold',
            tumbling: false,
            note: 'last-reel hold',
          });
        }, [], Math.max(0, cueMs));
      }
    });

    this.motionReelTimeline = null;
    this.clearPreviewReelSpinTracks?.();
    this.paintBoard?.(board);
    this.setAnimationState?.('idle');

    const winCue = (sheet.cues || []).find((cue) => cue.cue === 'win.pulse');
    const morphCue = (sheet.cues || []).find((cue) => cue.cue === 'wild.stickyMorph');
    if (morphCue) {
      const wilds = this.stickyMorphCells(board, morphCue);
      this.setMotionStatus(wilds.length ? 'Sticky morph' : 'No wilds on board');
      this.setMotionDebug({
        path: 'reel',
        grid: this.motionGridLabel(),
        step: 'sticky',
        exploding: wilds.map(([reel, row]) => ({ reel, row })),
        note: wilds.length ? 'wild.stickyMorph' : 'no-wild-skip',
      });
      if (wilds.length) await this.motionWin(wilds, morphCue.durationMs);
    }
    if (winCue) {
      this.setMotionStatus('Win pulse');
      await this.motionWin(parseCells(winCue.cells), winCue.durationMs);
    }

    this.setMotionStatus('Done');
    window.setTimeout(() => {
      this.syncMotionArtStatus();
      this.setMotionDebug({
        path: 'idle',
        grid: this.motionGridLabel(),
        step: 'restored',
        tumbling: false,
      });
    }, 900);
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
    if (this.spinning || this.motionPlaying) return;
    const templateId =
      this.container.querySelector('#previewMotionTemplate')?.value || 'cluster-hex';
    this.motionPlayback?.stop?.();
    if (this.motionRestoreTimer) {
      window.clearTimeout(this.motionRestoreTimer);
      this.motionRestoreTimer = null;
    }
    this.restoreMotionBoard();
    this.resetMotionStyles();
    this.setMotionStatus('Playing…');
    this.setMotionDebug({
      path: 'start',
      grid: this.motionGridLabel(),
      step: templateId,
      tumbling: false,
    });
    this.motionPlaying = true;

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
      this.restoreMotionBoard();
      window.alert(error.message || String(error));
    } finally {
      this.motionPlaying = false;
    }
  }

  destroy() {
    this.motionPlayback?.stop?.();
    this.motionPlayback = null;
    this.motionReelTimeline?.kill?.();
    this.motionReelTimeline = null;
    if (this.motionRestoreTimer) {
      window.clearTimeout(this.motionRestoreTimer);
      this.motionRestoreTimer = null;
    }
    this.restoreMotionBoard();
    this.resetMotionStyles();
    super.destroy();
  }
}
