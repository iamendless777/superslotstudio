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
  largestEqualCluster,
  seedAdjacentWaysWin,
  seedMatchingCluster,
  seedStickyWilds,
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
        <option value="scatter-tease">2-scatter tease</option>
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
    art.innerHTML = '<summary>Art · click</summary><div class="preview-motion-art-body">No brief</div>';

    const copyArt = document.createElement('button');
    copyArt.className = 'tool-btn';
    copyArt.id = 'previewMotionArtCopyToolbar';
    copyArt.type = 'button';
    copyArt.textContent = 'Copy art brief';

    trigger.insertAdjacentElement('afterend', label);
    label.insertAdjacentElement('afterend', button);
    button.insertAdjacentElement('afterend', copyArt);
    copyArt.insertAdjacentElement('afterend', status);
    status.insertAdjacentElement('afterend', debug);
    debug.insertAdjacentElement('afterend', art);

    button.addEventListener('click', () => {
      void this.playMotionStylePreview();
    });
    copyArt.addEventListener('click', () => {
      this.copyLiveArtBrief();
    });
    void this.populateMotionTemplates();
  }

  copyLiveArtBrief() {
    const brief = this.liveProjectArtBrief();
    const slim = {
      ...brief,
      slots: (brief.slots || []).map((slot) => ({
        symbolId: slot.symbolId,
        label: slot.label,
        role: slot.role,
        status: slot.status,
        guidance: slot.guidance,
        hasArt: Boolean(slot.artKey),
      })),
    };
    void navigator.clipboard?.writeText(JSON.stringify(slim, null, 2));
    this.setMotionStatus(`Art brief copied · ${slim.slots.length} symbols`);
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

  liveSymbolSize() {
    const el = this.container?.querySelector('.reel-sym');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (!width || !height) return null;
    return { width, height };
  }

  liveSlotGuidance(role, winType) {
    if (role === 'wild') return 'Wild badge must read under tumble and sticky morph.';
    if (role === 'scatter') return 'Scatter must read at a glance for 3/4/5/6-tier entry.';
    if (role === 'special') return 'Feature/collect — distinct from pays; keep silhouette clear in tumble.';
    if (role === 'high') return 'Hero symbol; strongest silhouette on the 6×4 ways board.';
    if (winType === 'cluster') return 'Readable cluster gem; clear at 5-connected pays.';
    return 'Readable at symbol size; pays as adjacent-ways 3-kind, not a cluster blob.';
  }

  liveProjectArtBrief() {
    const gaps = new Set(this.liveProjectArtGaps().map((gap) => gap.name));
    const winType = this.motionWinType();
    const size = this.liveSymbolSize();
    let regular = 0;
    const slots = (this.project?.theme?.symbols || [])
      .filter((symbol) => symbol && !symbol.special?.includes?.('empty'))
      .map((symbol) => {
        const name = symbol.name || symbol.id || 'symbol';
        const special = symbol.special || [];
        let role = 'low';
        if (special.includes('wild') || /wild/i.test(name)) role = 'wild';
        else if (special.includes('scatter') || /scatter|gate/i.test(name)) role = 'scatter';
        else if (special.includes('bonus') || /rift|star|mystery|purge|split/i.test(name)) role = 'special';
        else if (regular++ === 0) role = 'high';
        return {
          symbolId: symbol.id || name,
          label: name,
          role,
          artKey: symbol.src || null,
          status: gaps.has(name) ? 'missing' : 'assigned',
          guidance: this.liveSlotGuidance(role, winType),
        };
      });
    return {
      gameId: this.project?.id || 'preview',
      title: this.project?.name || this.project?.id || 'Loaded project',
      grid: this.motionGridLabel(),
      winType,
      motion: winType === 'cluster'
        ? 'Cluster tumble. Min 5 to pay; rehearsal pops 3+ 4-connected.'
        : 'Adjacent-ways 6×4 like Waylanders Forge. Min 3-kind left-to-right, then tumble. Swap art; keep motion.',
      symbolSize: size,
      slots,
      missingCount: slots.filter((slot) => slot.status === 'missing').length,
      readyToCommission: slots.length > 0,
    };
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
    if (template?.id === 'scatter-tease') return '2-scatter tease';
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

  seedTwoScatterTease(board) {
    const scatter = this.motionScatterSymbol();
    const next = cloneBoard(board);
    const cells = [];
    if (!scatter || !next.length) return { board: next, cells, scatter };
    for (const reel of [0, 1]) {
      if (!next[reel]?.length) continue;
      const row = Math.min(1, next[reel].length - 1);
      next[reel][row] = scatter;
      cells.push([reel, row]);
    }
    return { board: next, cells, scatter };
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
    const hasAnticipation = (sheet.cues || []).some((cue) => cue.cue === 'reel.anticipation');
    const reelSchedule = rehearsalReelSchedule(this.project, hasAnticipation, masks.length);
    this.motionSourceBoard = cloneBoard(this.board);
    let board = this.board;
    if (hasAnticipation) {
      const seeded = this.seedTwoScatterTease(board);
      board = seeded.board;
      this.board = board;
      this.setMotionStatus(seeded.scatter ? 'Seed 2 scatters' : 'No scatter in theme');
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
      note: hasAnticipation ? '2-scatter tease' : 'classic',
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
          const scatterCount = [...(this.landedReels || [])].reduce((count, landed) => (
            count + (board[landed] || []).filter((symbol) => this.isScatterSymbol?.(symbol?.name || symbol)).length
          ), 0);
          if (hasAnticipation && scatterCount >= 2) {
            this.enterReelAnticipation?.();
            this.setMotionStatus('Tease · last reel holds');
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
