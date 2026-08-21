/**
 * Thin wrapper around PreviewPanel that injects Motion template playback.
 *
 * Cluster templates → playStakeTumble (same cascade pixels as a live round).
 * Classic-nine → Preview reel spin tracks + stop schedule (no wager, no setWin).
 * No HTML overlay grid. No wincap / setWin during rehearsal.
 */
import gsap from 'gsap';
import { PreviewPanel as BasePreviewPanel } from './PreviewPanel.js?orchestration=20260820-living-cabinet';
import { playMotionTemplate, loadMotionFixture } from '../../engines/presentation/playMotionTemplate.js';
import { getScatterTeaseSchedule, scatterThresholds, waitingReelsFromBoard } from '../../engines/presentation/PresentationDirector.js';
import {
  cloneBoard,
  cueSheetHasReel,
  cueSheetHasTumble,
  cueSheetToTumbleEvents,
  largestEqualCluster,
  seedAdjacentWaysWin,
  seedMatchingCluster,
  seedStickyWilds,
} from '../../engines/presentation/cueSheetToTumbleEvents.js';
import {
  buildLiveBoardArtBrief,
  slimBoardArtBrief,
} from '../../engines/assets/BoardArtBrief.js';

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

function rehearsalReelSchedule(project, waiting, reelCount) {
  return getScatterTeaseSchedule(project, {
    reelCount,
    waiting,
  });
}

/** Studio-only rehearsal fixtures (not in domain planner templates). */
const SCATTER_TEASE_INDEX = [
  { id: 'scatter-tease', styleId: 'scatter-tease', kind: 'reel', totalDurationMs: 7200, title: '2-scatter tease', seedScatterCount: 2, missingArt: 0, readyToCommission: false },
  { id: 'scatter-tease-3', styleId: 'scatter-tease', kind: 'reel', totalDurationMs: 7200, title: '3-scatter tease', seedScatterCount: 3, missingArt: 0, readyToCommission: false },
  { id: 'scatter-tease-4', styleId: 'scatter-tease', kind: 'reel', totalDurationMs: 6000, title: '4-scatter tease', seedScatterCount: 4, missingArt: 0, readyToCommission: false },
  { id: 'scatter-tease-5', styleId: 'scatter-tease', kind: 'reel', totalDurationMs: 4800, title: '5-scatter tease', seedScatterCount: 5, missingArt: 0, readyToCommission: false },
  { id: 'dreamfall-grow', styleId: 'dreamfall-grow', kind: 'feature', totalDurationMs: 5200, title: 'Dreamfall grow', missingArt: 0, readyToCommission: false },
  { id: 'nexus-grid', styleId: 'nexus-grid', kind: 'feature', totalDurationMs: 3600, title: 'Nexus grid', missingArt: 0, readyToCommission: false },
];

function mergeMotionTemplateIndex(templates) {
  const list = Array.isArray(templates) ? [...templates] : [];
  const seen = new Set(list.map((template) => template?.id));
  for (const entry of SCATTER_TEASE_INDEX) {
    if (seen.has(entry.id)) continue;
    list.push(entry);
    seen.add(entry.id);
  }
  return list;
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
        <option value="scatter-tease">2-scatter tease</option>
        <option value="scatter-tease-3">3-scatter tease</option>
        <option value="scatter-tease-4">4-scatter tease</option>
        <option value="scatter-tease-5">5-scatter tease</option>
        <option value="dreamfall-grow">Dreamfall grow</option>
        <option value="nexus-grid">Nexus grid</option>
      </select>`;

    const button = document.createElement('button');
    button.className = 'tool-btn';
    button.id = 'previewMotionPlay';
    button.type = 'button';
    button.textContent = 'Play Motion';

    const liveTease = document.createElement('button');
    liveTease.className = 'tool-btn';
    liveTease.id = 'previewLiveTwoScatter';
    liveTease.type = 'button';
    liveTease.textContent = 'Live 2-scatter';
    liveTease.title = 'Paid live SPIN that plants two scatters on reels 1–2, then uses the same waiting-reel schedule as Play Motion.';

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
    art.innerHTML = '<summary>Art · click</summary><div class="preview-motion-art-body">No brief</div>';

    const copyArt = document.createElement('button');
    copyArt.className = 'tool-btn';
    copyArt.id = 'previewMotionArtCopyToolbar';
    copyArt.type = 'button';
    copyArt.textContent = 'Copy board brief';
    copyArt.title = 'Copy the loaded board art brief. Ways games: do not commission cluster-hex gems.';

    trigger.insertAdjacentElement('afterend', label);
    label.insertAdjacentElement('afterend', button);
    button.insertAdjacentElement('afterend', liveTease);
    liveTease.insertAdjacentElement('afterend', copyArt);
    copyArt.insertAdjacentElement('afterend', status);
    status.insertAdjacentElement('afterend', debug);
    debug.insertAdjacentElement('afterend', art);

    button.addEventListener('click', () => {
      void this.playMotionStylePreview();
    });
    liveTease.addEventListener('click', () => {
      this.playLiveTwoScatter();
    });
    copyArt.addEventListener('click', () => {
      this.copyLiveArtBrief();
    });
    void this.populateMotionTemplates();
  }

  playLiveTwoScatter() {
    this.motionPlayback?.stop?.();
    this.motionPlaying = false;
    if (this.spinning) return;
    this.setMotionStatus('Live 2-scatter');
    this.setMotionDebug({
      path: 'live',
      grid: this.motionGridLabel(),
      step: 'force-2',
      tumbling: false,
      note: 'resolveRound',
    });
    this.spin({ forceScatterCount: 2 });
  }

  copyLiveArtBrief() {
    const slim = slimBoardArtBrief(this.liveProjectArtBrief());
    void navigator.clipboard?.writeText(JSON.stringify(slim, null, 2));
    this.setMotionStatus(`Board brief copied · ${slim.slots.length} symbols`);
  }

  async populateMotionTemplates() {
    const select = this.container?.querySelector('#previewMotionTemplate');
    if (!select) return;
    try {
      const response = await fetch('/motion-fixtures/index.json');
      if (!response.ok) return;
      const index = await response.json();
      const templates = mergeMotionTemplateIndex(index?.templates);
      if (!templates.length) return;
      this.motionTemplateIndex = templates;
      const preferred = this.preferredMotionTemplate();
      const current = select.dataset.userPicked ? (select.value || preferred) : preferred;
      select.replaceChildren();
      for (const template of templates) {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = this.motionTemplateLabel(template);
        option.selected = template.id === current;
        select.appendChild(option);
      }
      if (![...select.options].some((option) => option.selected) && select.options.length) {
        const fallback = [...select.options].find((option) => option.value === preferred);
        (fallback || select.options[0]).selected = true;
      }
      if (!select.dataset.artBound) {
        select.dataset.artBound = '1';
        select.addEventListener('change', () => {
          select.dataset.userPicked = '1';
          this.syncMotionArtStatus();
        });
      }
      this.syncMotionArtStatus();
    } catch {
      /* keep the static fallback options (includes scatter-tease family) */
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

  liveSymbolSize() {
    const el = this.container?.querySelector('.reel-sym');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (!width || !height) return null;
    return { width, height };
  }

  liveProjectArtBrief() {
    return buildLiveBoardArtBrief(this.project, {
      symbolSize: this.liveSymbolSize(),
      missingNames: new Set(this.liveProjectArtGaps().map((gap) => gap.name)),
    });
  }

  syncMotionArtStatus() {
    if (this.motionPlaying) return;
    const select = this.container?.querySelector('#previewMotionTemplate');
    const id = select?.value;
    const liveGaps = this.liveProjectArtGaps();
    if (liveGaps.length) {
      this.setMotionStatus(`Board ${liveGaps.length} art gaps`);
    } else {
      this.setMotionStatus('Board art ready');
    }
    void this.loadMotionArtBrief(id, liveGaps);
  }

  async loadMotionArtBrief(templateId, liveGaps = this.liveProjectArtGaps()) {
    const host = this.container?.querySelector('#previewMotionArt');
    if (!host || !templateId) return;
    const summary = host.querySelector('summary');
    const body = host.querySelector('.preview-motion-art-body');
    const boardBrief = this.liveProjectArtBrief();
    let brief = null;
    try {
      const response = await fetch(`/motion-fixtures/art-briefs/${templateId}.json`);
      if (response.ok) brief = await response.json();
    } catch {
      brief = null;
    }
    this.motionArtBrief = { board: boardBrief, recipe: brief };
    const esc = (value) => this.escapeMotionText(value);
    if (summary) {
      summary.textContent = liveGaps.length
        ? `Art · ${liveGaps.length} board gaps`
        : `Art · ${boardBrief.slots.length} to swap`;
    }
    if (!body) return;
    const size = boardBrief.symbolSize
      ? `${boardBrief.symbolSize.width}×${boardBrief.symbolSize.height}px`
      : 'symbol size from preview';
    const boardSlots = (boardBrief.slots || []).map((slot) => (
      `<li data-status="${esc(slot.status)}"><strong>${esc(slot.label)}</strong> · ${esc(slot.role)} · ${esc(slot.status)}<span>${esc(slot.guidance)}</span></li>`
    )).join('');
    const recipeSlots = (brief?.slots || []).map((slot) => (
      `<li data-status="${esc(slot.status)}"><strong>${esc(slot.label)}</strong> · ${esc(slot.role)} · ${esc(slot.status)}</li>`
    )).join('');
    body.innerHTML = `
      <p>This board · ${esc(boardBrief.grid)} · ${esc(boardBrief.winType)} · ${esc(size)}</p>
      <p>${esc(boardBrief.motion)}</p>
      <ol>${boardSlots || '<li>No symbols on this board</li>'}</ol>
      <button type="button" class="tool-btn" id="previewMotionArtCopyBoard">Copy board brief</button>
      ${brief ? `<details class="preview-motion-art-recipe"><summary>${esc(brief.title)} motion clock</summary><ol>${recipeSlots}</ol><button type="button" class="tool-btn" id="previewMotionArtCopy">Copy recipe brief</button></details>` : ''}`;
    body.querySelector('#previewMotionArtCopyBoard')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.copyLiveArtBrief();
    });
    body.querySelector('#previewMotionArtCopy')?.addEventListener('click', (event) => {
      event.preventDefault();
      void navigator.clipboard?.writeText(JSON.stringify(brief, null, 2));
      this.setMotionStatus('Recipe art brief copied');
    });
  }

  motionWildSymbol() {
    const symbols = this.project?.theme?.symbols || [];
    const flagged = symbols.find((symbol) => (symbol.special || []).includes('wild'));
    if (flagged?.name) return flagged.name;
    const named = symbols.find((symbol) => /wild/i.test(String(symbol.name || symbol.id || '')));
    return named?.name || null;
  }

  waitMs(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  preferredMotionTemplate() {
    if (this.motionWinType() === 'cluster') return 'cluster-hex';
    const type = String(this.project?.math?.gameType || '').toLowerCase();
    if (type === 'lines') return 'classic-nine';
    return 'cluster-hex';
  }

  motionTemplateLabel(template) {
    if (String(template?.id || '').startsWith('scatter-tease')) {
      const count = Number(template.seedScatterCount) || Number(String(template.id).split('-').pop()) || 2;
      return `${count}-scatter tease`;
    }
    if (template?.id === 'dreamfall-grow') return 'Dreamfall grow';
    if (template?.id === 'nexus-grid') return 'Nexus grid';
    if (template?.kind === 'tumble' && this.motionWinType() !== 'cluster') {
      return 'cascade · ways';
    }
    return template?.kind ? `${template.id} · ${template.kind}` : (template?.id || '');
  }

  motionWinType() {
    const type = String(
      this.project?.math?.gameType
      || this.project?.math?.winType
      || this.project?.blueprint?.winType
      || 'ways',
    ).toLowerCase();
    return type === 'cluster' ? 'cluster' : 'ways';
  }

  motionScatterSymbol() {
    const symbols = this.project?.theme?.symbols || [];
    const flagged = symbols.find((symbol) => (symbol.special || []).includes('scatter'));
    if (flagged?.name) return flagged.name;
    const named = symbols.find((symbol) => /scatter|gate/i.test(String(symbol.name || symbol.id || '')));
    return named?.name || null;
  }

  seedScatterTease(board, count = 2) {
    const scatter = this.motionScatterSymbol();
    const filler = this.motionFillerSymbol();
    const next = cloneBoard(board);
    const cells = [];
    if (!scatter || !next.length) return { board: next, cells, scatter, count: 0 };
    const want = Math.max(0, Math.min(Number(count) || 0, next.length));
    for (let reel = 0; reel < next.length; reel++) {
      for (let row = 0; row < (next[reel] || []).length; row++) {
        if (this.isScatterSymbol?.(next[reel][row]?.name || next[reel][row])) next[reel][row] = filler;
      }
    }
    for (let reel = 0; reel < want; reel++) {
      if (!next[reel]?.length) continue;
      const row = Math.min(1, next[reel].length - 1);
      next[reel][row] = scatter;
      cells.push([reel, row]);
    }
    return { board: next, cells, scatter, count: want };
  }

  seedTwoScatterTease(board) {
    return this.seedScatterTease(board, 2);
  }

  motionFillerSymbol() {
    const names = (this.project?.math?.symbols || [])
      .map((symbol) => symbol?.name)
      .filter(Boolean);
    const themeNames = (this.project?.theme?.symbols || [])
      .map((symbol) => symbol?.name)
      .filter(Boolean);
    const pool = names.length ? names : themeNames;
    return pool.find((name) => !/wild|scatter|bonus|star|gate/i.test(String(name))) || pool[0] || 'L1';
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
    return [];
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

    const original = cloneBoard(this.board);
    this.motionSourceBoard = original;
    let working = original;
    const winType = this.motionWinType();
    if (winType === 'cluster') {
      if (!largestEqualCluster(working, 3).length) {
        const seeded = seedMatchingCluster(working);
        working = seeded.board;
        this.board = working;
        this.paintBoard?.(working);
        this.setMotionStatus('Seed cluster');
        this.setMotionDebug({
          path: 'tumble',
          grid: this.motionGridLabel(),
          step: 'seed',
          exploding: seeded.cells.map(([reel, row]) => ({ reel, row })),
          tumbling: false,
          note: `cluster ${seeded.name || ''}`.trim(),
        });
        await this.waitMs(280);
      }
    } else {
      const seeded = seedAdjacentWaysWin(working, 3);
      working = seeded.board;
      this.board = working;
      this.paintBoard?.(working);
      this.setMotionStatus('Seed 3-kind');
      this.setMotionDebug({
        path: 'tumble',
        grid: this.motionGridLabel(),
        step: 'seed',
        exploding: seeded.cells.map(([reel, row]) => ({ reel, row })),
        tumbling: false,
        note: `ways ${seeded.name || ''}`.trim(),
      });
      await this.waitMs(280);
    }

    const events = cueSheetToTumbleEvents(sheet, working, {
      fillerSymbol: this.motionFillerSymbol(),
      retargetFromBoard: true,
      retargetMode: winType,
      minCluster: 3,
      minWays: 3,
    });
    if (!events.length) {
      this.restoreMotionBoard();
      return false;
    }
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
      let current = working;
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
      .filter((symbol) => symbol?.src && !symbol.special?.length)
      .map((symbol) => symbol.name)
      .filter(Boolean);
    const seedCount = Math.max(
      0,
      Number(sheet.seedScatterCount)
      || (String(sheet.templateId || sheet.styleId || '').match(/scatter-tease-(\d+)/)?.[1])
      || ((sheet.cues || []).some((cue) => cue.cue === 'reel.anticipation') ? 2 : 0),
    );
    this.motionSourceBoard = cloneBoard(this.board);
    let board = this.board;
    if (seedCount > 0) {
      const seeded = this.seedScatterTease(board, seedCount);
      board = seeded.board;
      this.board = board;
      this.setMotionStatus(seeded.scatter ? `Seed ${seeded.count} scatters` : 'No scatter in theme');
      this.setMotionDebug({
        path: 'reel',
        grid: this.motionGridLabel(),
        step: 'seed',
        exploding: seeded.cells.map(([reel, row]) => ({ reel, row })),
        tumbling: false,
        note: seeded.scatter || 'missing-scatter',
      });
      if (!seeded.scatter) {
        this.restoreMotionBoard();
        return false;
      }
    }
    const waiting = waitingReelsFromBoard(board, {
      isScatter: (symbol) => this.isScatterSymbol?.(symbol),
      thresholds: scatterThresholds(this.project),
    });
    const reelSchedule = rehearsalReelSchedule(this.project, waiting, masks.length);

    this.landedReels?.clear?.();
    this.reelsSlammed = false;
    this.reelAnticipationActive = false;
    this.reelAnticipationCued = false;

    this.setMotionStatus('Reels spinning');
    this.setMotionDebug({
      path: 'reel',
      grid: this.motionGridLabel(),
      step: 'blur',
      tumbling: false,
      note: seedCount ? `${seedCount}-scatter tease` : 'classic',
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
      this.spinTimeline = tl;
      if (reelSchedule.stops[0]?.waiting) this.enterReelAnticipation?.();
      this.motionPlayback = {
        stop: () => {
          tl.kill();
          resolve();
        },
      };
      masks.forEach((mask, reel) => {
        const stopAt = Math.max(0, Number(reelSchedule.stops[reel]?.stopAtMs || 400 + reel * 120) / 1000);
        const landingLead = 0.12;
        const track = spinTracks[reel];
        const prepare = () => {
          mask.classList.add('is-stopping');
          this.setMotionStatus(`Reel ${reel + 1} stop`);
        };
        const settle = () => {
          mask.classList.add('has-stopped');
          this.paintReelBoard?.(reel, board[reel]);
          this.landedReels?.add?.(reel);
          if ((board[reel] || []).some((symbol) => this.isScatterSymbol?.(symbol?.name || symbol))) {
            this.audioEngine?.playStinger?.('scatterLand', reel);
          } else {
            this.audioEngine?.playStinger?.('reelStop', reel);
          }
          this.pulseReelImpact?.(reel);
          if (reelSchedule.stops[reel + 1]?.waiting) {
            this.enterReelAnticipation?.();
            const scatterCount = [...(this.landedReels || [])].reduce((count, landed) => (
              count + (board[landed] || []).filter((symbol) => this.isScatterSymbol?.(symbol?.name || symbol)).length
            ), 0);
            this.setMotionStatus(`Tease · waiting for scatter ${scatterCount + 1}`);
            this.setMotionDebug({
              path: 'reel',
              grid: this.motionGridLabel(),
              step: `tease r${reel + 1}`,
              tumbling: false,
              note: `${scatterCount} scatters in`,
            });
          }
        };
        if (track) {
          tl.to(track, {
            opacity: 1,
            filter: 'blur(.2px) saturate(.96) brightness(.94)',
            duration: landingLead,
            ease: 'power2.out',
            immediateRender: false,
            onStart: prepare,
            onComplete: () => {
              settle();
              mask.classList.remove('is-spinning', 'is-stopping');
              track.remove();
            },
          }, Math.max(0, stopAt - landingLead));
        } else {
          tl.call(() => {
            prepare();
            settle();
            mask.classList.remove('is-spinning', 'is-stopping');
          }, [], stopAt);
        }
      });
    });

    this.motionReelTimeline = null;
    this.spinTimeline = null;
    this.reelAnticipationActive = false;
    this.spinning = false;
    this.container?.querySelector('#previewStage')?.classList.remove('is-reel-tease');
    this.clearPreviewReelSpinTracks?.();
    this.paintBoard?.(board);
    this.setAnimationState?.('idle');

    const winCue = (sheet.cues || []).find((cue) => cue.cue === 'win.pulse');
    const morphCue = (sheet.cues || []).find((cue) => cue.cue === 'wild.stickyMorph');
    if (morphCue) {
      let wilds = this.stickyMorphCells(board, morphCue);
      const wildName = this.motionWildSymbol();
      if (!wilds.length && wildName) {
        const seeded = seedStickyWilds(cloneBoard(board), wildName, 3);
        this.board = seeded.board;
        this.paintBoard?.(seeded.board);
        wilds = seeded.cells;
        this.setMotionStatus('Seed wilds');
        this.setMotionDebug({
          path: 'reel',
          grid: this.motionGridLabel(),
          step: 'sticky-seed',
          exploding: wilds.map(([reel, row]) => ({ reel, row })),
          note: wildName,
        });
        await this.waitMs(280);
      }
      this.setMotionStatus(wilds.length ? 'Sticky morph' : 'No wilds in theme');
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
    this.scheduleMotionBoardRestore();
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

  async playDreamfallGrowRehearsal() {
    const originalBoard = cloneBoard(this.board);
    this.motionSourceBoard = originalBoard;
    this.activateMorpheusDreamfallWorld?.('play-motion-grow');
    this.featureReelRows?.clear?.();
    for (let reel = 0; reel < 6; reel += 1) this.featureReelRows.set(reel, 4);
    this.render();
    const filler = this.motionFillerSymbol();
    const boardAt = (rows) => rows.map((count) => Array.from({ length: count }, () => ({ name: filler })));
    let heights = [4, 4, 4, 4, 4, 4];
    this.board = boardAt(heights);
    this.paintBoard?.(this.board);
    this.setMotionStatus('Dreamfall · 6×4 start · chance growth, not 48');
    this.setMotionDebug({ path: 'dreamfall', grid: '6x4', step: 'start', note: 'growth is chance; 48 is the cap, not a destination' });
    await this.waitMs(380);
    // One random non-maxed reel per win. This rehearsal is a typical jagged
    // bonus, not a maxed 6×8 / 48-cell board.
    const growths = [0, 2, 5, 2, 3, 0];
    for (const reel of growths) {
      if (heights[reel] >= 8) continue;
      const before = [...heights];
      heights[reel] += 1;
      const afterBoard = boardAt(heights);
      this.setMotionStatus(`Reel ${reel + 1} grows to ${heights[reel]}`);
      this.setMotionDebug({
        path: 'dreamfall',
        grid: `6x${Math.max(...heights)}`,
        step: `reel-${reel + 1}`,
        note: heights.join('·'),
      });
      await this.animateMorpheusDreamfallExpansion({
        presentation: { durationMs: 420 },
      }, {
        type: 'expandReelHeight',
        payload: {
          reel,
          rows: heights[reel],
          previousRows: before[reel],
          maximumRows: 8,
          reelHeightsBefore: before,
          reelHeightsAfter: [...heights],
          boardAfter: afterBoard,
          newSymbol: { name: filler },
        },
        affectedPositions: [{ reel, row: 0 }],
      }, false);
      await this.waitMs(160);
    }
    this.setMotionStatus(`Jagged ${heights.join('·')} · ${heights.reduce((sum, rows) => sum + rows, 0)}/48 cells`);
    await this.waitMs(1100);
    this.deactivateMorpheusDreamfallWorld?.('play-motion-restore');
    this.featureReelRows?.clear?.();
    this.render();
    this.restoreMotionBoard();
    this.setMotionStatus('Done');
  }

  async playNexusGridRehearsal() {
    const originalBoard = cloneBoard(this.board);
    this.motionSourceBoard = originalBoard;
    this.featurePositionGridMode = 'oneiric_nexus';
    this.morpheusNexusWorldState = { active: true, reason: 'play-motion' };
    this.render();
    if (originalBoard) {
      this.board = originalBoard;
      this.paintBoard?.(originalBoard);
    }
    const cells = [];
    for (let reel = 0; reel < 6; reel += 1) {
      for (let row = 0; row < 4; row += 1) {
        this.featurePositionMultipliers.set(`${reel}:${row}`, 1);
        cells.push({ position: { reel, row }, value: 1 });
      }
    }
    this.applyPersistentMechanicState?.({ type: 'modeGridStart', mode: 'oneiric_nexus', cells });
    this.syncFeatureStateMarkers?.();
    this.playSpecialLook?.({ type: 'modeGridStart' }, [], cells.map((cell) => [cell.position.reel, cell.position.row]));
    this.setMotionStatus('Nexus sanctum · grid awakens');
    this.setMotionDebug({ path: 'nexus', grid: '6x4', step: 'awaken' });
    await this.waitMs(520);
    const charged = [[1, 1, 2], [2, 0, 2], [4, 2, 4], [3, 1, 2]];
    for (const [reel, row, multiplier] of charged) {
      this.applyPersistentMechanicState?.({
        type: 'positionMultiplierGridUpdate',
        updates: [{ reel, row, multiplier }],
      });
      this.syncFeatureStateMarkers?.();
      this.playSpecialLook?.({ type: 'positionMultiplierGridUpdate', updates: [{ reel, row, multiplier }] }, [], [[reel, row]]);
      this.setMotionStatus(`Plate ${reel + 1},${row + 1} · ${multiplier}×`);
      await this.waitMs(360);
    }
    await this.waitMs(800);
    this.morpheusNexusWorldState = { active: false };
    this.featurePositionGridMode = null;
    this.featurePositionMultipliers.clear();
    this.render();
    this.restoreMotionBoard();
    this.setMotionStatus('Done');
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
      if (templateId === 'dreamfall-grow') {
        await this.playDreamfallGrowRehearsal();
        return;
      }
      if (templateId === 'nexus-grid') {
        await this.playNexusGridRehearsal();
        return;
      }
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
