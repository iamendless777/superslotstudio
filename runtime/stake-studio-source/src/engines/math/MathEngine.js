import { BONUS_MECHANICS } from '../../mechanics/registry.js';
import { resolvePaylines } from './WinTypeEngine.js';
import { FeatureArchitectureRuntime, resolveFeatureTier } from './FeatureArchitectureEngine.js';
import { compileSpinBook } from './StakeRoundBook.js';
import { maximumWinHitRateForMode } from './MaximumWinPolicy.js';

/**
 * Hard bound on the cascade loop. A pathological reel strip (e.g. one symbol
 * repeated) keeps producing wins on every refill, so "unlimited" cascades
 * still needs a termination guarantee.
 */
const CASCADE_SAFETY_LIMIT = 100;

export class MathEngine {
  constructor(project) {
    this.project = project;
  }

  get math() { return this.project.math; }

  // --- MECHANIC CONFIG ---

  isEnabled(key) {
    return (this.math.bonusMechanics || []).includes(key);
  }

  /**
   * Merged config for a mechanic: registry defaults with the project's
   * overrides applied. Falling back to defaults matters because a mechanic can
   * be enabled before its config fields have ever been touched in the editor.
   */
  getConfig(key) {
    const fields = BONUS_MECHANICS[key]?.configFields || {};
    const stored = this.math.mechanicConfig?.[key] || {};
    const out = {};
    for (const [fk, fd] of Object.entries(fields)) {
      out[fk] = stored[fk] !== undefined ? stored[fk] : fd.default;
    }
    return out;
  }

  // --- BOARD GENERATION ---

  generateBoard(rand = Math.random, reelSet = 'BR', rowOverride = null) {
    const { reels } = this.math.grid;
    const rows = rowOverride || this.math.grid.rows;
    const board = [];
    for (let r = 0; r < reels; r++) {
      board.push(this.generateReel(r, rows[r] || rows[0], rand, reelSet));
    }
    return board;
  }

  generateProfileBoard(rand = Math.random, reelSet = 'BR', rowOverride = null, options = {}) {
    const scatterWeight = Math.max(1, Number(options.scatterWeightMultiplier) || 1);
    const specialWeight = Math.max(1, Number(options.specialSymbolBoost) || 1);
    const candidateCount = Math.min(16, Math.ceil(Math.max(scatterWeight, specialWeight)));
    if (candidateCount === 1) return this.generateBoard(rand, reelSet, rowOverride);

    const scatters = new Set(this.math.specialSymbols?.scatter || []);
    const specialSymbols = new Set((this.project.theme.symbols || [])
      .filter(symbol => (symbol.special || []).length > 0
        && !(symbol.special || []).includes('scatter')
        && !(symbol.special || []).includes('spawnOnly')
        && !(symbol.special || []).includes('maxWild'))
      .map(symbol => symbol.name));
    const candidates = Array.from({ length: candidateCount }, () => this.generateBoard(rand, reelSet, rowOverride));
    const weights = candidates.map(board => {
      const symbols = board.flat();
      const scatterCount = symbols.filter(symbol => scatters.has(symbol)).length;
      const specialCount = symbols.filter(symbol => specialSymbols.has(symbol)).length;
      return (scatterWeight ** scatterCount) * (specialWeight ** specialCount);
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = rand() * totalWeight;
    for (let index = 0; index < candidates.length; index++) {
      cursor -= weights[index];
      if (cursor <= 0) return candidates[index];
    }
    return candidates.at(-1);
  }

  profileBoardSelectionEvent(board, options = {}) {
    const scatterBoost = Math.max(1, Number(options.scatterWeightMultiplier) || 1);
    const specialBoost = Math.max(1, Number(options.specialSymbolBoost) || 1);
    const candidateCount = Math.min(16, Math.ceil(Math.max(scatterBoost, specialBoost)));
    if (candidateCount <= 1) return null;
    const scatters = new Set(this.math.specialSymbols?.scatter || []);
    const specials = new Set((this.project.theme.symbols || [])
      .filter(symbol => (symbol.special || []).length > 0
        && !(symbol.special || []).includes('scatter')
        && !(symbol.special || []).includes('spawnOnly')
        && !(symbol.special || []).includes('maxWild'))
      .map(symbol => symbol.name));
    const kind = scatterBoost > 1 && specialBoost > 1
      ? 'scatterAndSpecial'
      : scatterBoost > 1 ? 'scatter' : 'special';
    const positions = [];
    for (let reel = 0; reel < (board || []).length; reel++) {
      for (let row = 0; row < (board[reel] || []).length; row++) {
        const symbol = board[reel][row];
        if ((kind !== 'special' && scatters.has(symbol)) || (kind !== 'scatter' && specials.has(symbol))) {
          positions.push([reel, row]);
        }
      }
    }
    if (!positions.length && board?.length) {
      const reel = Math.max(0, Math.floor((board.length - 1) / 2));
      positions.push([reel, Math.max(0, Math.floor(((board[reel]?.length || 1) - 1) / 2))]);
    }
    return {
      type: 'modeBoardSelection',
      kind,
      candidateCount,
      multiplier: Math.max(scatterBoost, specialBoost),
      fromMoon: true,
      sources: [],
      positions,
    };
  }

  generateReel(reelIndex, count, rand = Math.random, reelSet = 'BR') {
    const strip = this.math.reelStrips?.[reelSet]?.[reelIndex]
      || this.math.reelStrips?.BR?.[reelIndex];
    const col = [];
    if (strip && strip.length > 0) {
      const start = Math.floor(rand() * strip.length);
      for (let i = 0; i < count; i++) col.push(strip[(start + i) % strip.length]);
    } else {
      const pool = this.getWeightedSymbolPool();
      for (let i = 0; i < count; i++) col.push(pool[Math.floor(rand() * pool.length)]);
    }
    return col;
  }

  generateReelExcluding(reelIndex, count, rand = Math.random, reelSet = 'BR', excluded = new Set()) {
    if (!excluded?.size) return this.generateReel(reelIndex, count, rand, reelSet);
    const strip = this.math.reelStrips?.[reelSet]?.[reelIndex]
      || this.math.reelStrips?.BR?.[reelIndex]
      || [];
    const allowed = strip.filter(symbol => !excluded.has(symbol));
    const pool = allowed.length ? allowed : this.getWeightedSymbolPool().filter(symbol => !excluded.has(symbol));
    if (!pool.length) throw new Error(`Reel ${reelIndex + 1} has no symbols available after feature exclusions.`);
    const start = Math.floor(rand() * pool.length);
    return Array.from({ length: count }, (_, index) => pool[(start + index) % pool.length]);
  }

  replaceExcludedBoardSymbols(board, rand, reelSet, excluded) {
    if (!excluded?.size) return board;
    return board.map((column, reel) => column.map(symbol => (
      excluded.has(symbol) ? this.generateReelExcluding(reel, 1, rand, reelSet, excluded)[0] : symbol
    )));
  }

  getWeightedSymbolPool() {
    const syms = this.project.theme.symbols || [];
    const pool = [];
    for (const sym of syms) {
      const weight = sym.tier === 'high' ? 2 : sym.tier === 'medium' ? 4 : sym.tier === 'low' ? 6 : 1;
      for (let i = 0; i < weight; i++) pool.push(sym.name);
    }
    return pool;
  }

  // --- EVALUATION ---

  evaluateBoard(board) {
    const type = this.math.gameType;
    switch (type) {
      case 'ways': case 'ways5x4': case 'ways5x5': case 'waysLarge': case 'megaways': return this.evalWays(board);
      case 'lines': return this.evalLines(board);
      case 'cluster': return this.evalCluster(board);
      case 'scatter': return this.evalScatter(board);
      default: return this.evalWays(board);
    }
  }

  evalWays(board) {
    const wins = [];
    const symbols = new Set(board.flat());
    const wilds = new Set(this.math.specialSymbols?.wild || []);
    for (const sym of symbols) {
      if (wilds.has(sym)) continue;
      let ways = 1;
      let count = 0;
      for (let r = 0; r < board.length; r++) {
        const matches = board[r].filter(s => s === sym || wilds.has(s)).length;
        if (matches === 0) break;
        ways *= matches;
        count++;
      }
      if (count >= 3) {
        const payout = this.getSymbolPayout(sym, count);
        wins.push({ symbol: sym, count, ways, payout: payout * ways, positions: this.winningPositions(board, sym, count, wilds) });
      }
    }
    return wins;
  }

  /** Cells on the winning reels that contributed to the win — needed to cascade. */
  winningPositions(board, sym, count, wilds) {
    const positions = [];
    for (let r = 0; r < count; r++) {
      for (let row = 0; row < board[r].length; row++) {
        const s = board[r][row];
        if (s === sym || wilds.has(s)) positions.push([r, row]);
      }
    }
    return positions;
  }

  evalLines(board) {
    const wins = [];
    const wilds = new Set(this.math.specialSymbols?.wild || []);
    for (const [lineId, line] of Object.entries(resolvePaylines(this.math))) {
      const symbols = line.map((row, reel) => board[reel]?.[row]);
      const target = symbols.find(symbol => symbol && !wilds.has(symbol)) || symbols[0];
      if (!target) continue;
      let count = 0;
      for (const symbol of symbols) {
        if (symbol === target || wilds.has(symbol)) count++;
        else break;
      }
      const payout = this.getSymbolPayout(target, count);
      if (payout <= 0) continue;
      wins.push({
        symbol: target,
        count,
        kind: count,
        lineIndex: Number(lineId),
        payout,
        positions: line.slice(0, count).map((row, reel) => [reel, row]),
      });
    }
    return wins;
  }

  evalCluster(board) {
    const wins = [];
    const wilds = new Set(this.math.specialSymbols?.wild || []);
    const visited = new Set();
    const key = (reel, row) => `${reel},${row}`;
    const neighbours = (reel, row) => [[reel - 1, row], [reel + 1, row], [reel, row - 1], [reel, row + 1]]
      .filter(([nextReel, nextRow]) => board[nextReel]?.[nextRow] !== undefined);

    for (let reel = 0; reel < board.length; reel++) {
      for (let row = 0; row < board[reel].length; row++) {
        const symbol = board[reel][row];
        if (wilds.has(symbol) || visited.has(key(reel, row))) continue;
        const queue = [[reel, row]];
        const local = new Set([key(reel, row)]);
        const positions = [];
        while (queue.length) {
          const [currentReel, currentRow] = queue.shift();
          positions.push([currentReel, currentRow]);
          if (!wilds.has(board[currentReel][currentRow])) visited.add(key(currentReel, currentRow));
          for (const [nextReel, nextRow] of neighbours(currentReel, currentRow)) {
            const nextKey = key(nextReel, nextRow);
            const nextSymbol = board[nextReel][nextRow];
            if (!local.has(nextKey) && (nextSymbol === symbol || wilds.has(nextSymbol))) {
              local.add(nextKey);
              queue.push([nextReel, nextRow]);
            }
          }
        }
        const payout = this.getSymbolPayout(symbol, positions.length);
        if (payout > 0) wins.push({ symbol, count: positions.length, kind: positions.length, clusterSize: positions.length, payout, positions });
      }
    }
    return wins;
  }

  evalScatter(board) {
    const wins = [];
    const wilds = new Set(this.math.specialSymbols?.wild || []);
    const wildPositions = [];
    for (let reel = 0; reel < board.length; reel++) {
      for (let row = 0; row < board[reel].length; row++) {
        if (wilds.has(board[reel][row])) wildPositions.push([reel, row]);
      }
    }
    for (const definition of this.project.theme.symbols || []) {
      if (wilds.has(definition.name) || !Object.values(definition.payouts || {}).some(value => Number(value) > 0)) continue;
      const positions = [...wildPositions];
      for (let reel = 0; reel < board.length; reel++) {
        for (let row = 0; row < board[reel].length; row++) {
          if (board[reel][row] === definition.name) positions.push([reel, row]);
        }
      }
      const payout = this.getSymbolPayout(definition.name, positions.length);
      if (payout > 0) wins.push({ symbol: definition.name, count: positions.length, kind: positions.length, payout, positions });
    }
    return wins;
  }

  getSymbolPayout(symName, count) {
    const sym = (this.project.theme.symbols || []).find(s => s.name === symName);
    if (!sym || !sym.payouts) return 0;
    return sym.payouts[count] || 0;
  }

  /** Stake lookup payouts must resolve to 0.1x units (book units divisible by 10). */
  quantizePayout(value) {
    const increment = Number(this.math.payoutIncrement) || 0.1;
    return Number((Math.round((Number(value) + Number.EPSILON) / increment) * increment).toFixed(10));
  }

  // --- MECHANICS ---

  /** Wilds grow to fill their whole reel before evaluation. */
  applyExpandingWilds(board) {
    return this.resolveExpandingWilds(board).board;
  }

  /** Resolve expanding wilds with the intermediate boards needed for playback. */
  resolveExpandingWilds(inputBoard) {
    const wilds = this.math.specialSymbols?.wild || [];
    const board = (inputBoard || []).map(column => [...column]);
    if (wilds.length === 0) return { board, events: [] };
    const definitions = new Map((this.project.theme.symbols || []).map(symbol => [symbol.name, symbol]));
    const explicit = new Set(wilds.filter(name => (definitions.get(name)?.special || []).includes('expandingWild')));
    const wildSet = explicit.size ? explicit : new Set(wilds);
    const events = [];
    board.forEach((column, reel) => {
      const row = column.findIndex(symbol => wildSet.has(symbol));
      if (row < 0) return;
      const wild = column[row];
      const positions = [];
      let stoppedBy = null;
      for (let targetRow = explicit.size ? row : 0; targetRow < column.length; targetRow++) {
        const symbol = column[targetRow];
        if (explicit.size && targetRow > row) {
          const definition = definitions.get(symbol);
          const protectedSymbol = definition?.tier === 'special' || (definition?.special || []).length > 0;
          if (protectedSymbol) {
            stoppedBy = { position: [reel, targetRow], symbol };
            break;
          }
        }
        board[reel][targetRow] = wild;
        positions.push([reel, targetRow]);
      }
      events.push({
        type: 'expandingWild',
        source: wild,
        sources: [[reel, row]],
        positions,
        stoppedBy,
        board: board.map(current => [...current]),
      });
    });
    return { board, events };
  }

  /** Remove winning cells, drop survivors down, refill the gaps from the top. */
  cascade(board, wins, rand = Math.random, reelSet = 'BR') {
    return this.cascadeWithMetadata(board, wins, rand, reelSet).board;
  }

  /**
   * Resolve a cascade and retain Stake's exact tumbleBoard payload. Keeping the
   * incoming symbols and exploding positions at generation time avoids trying
   * to reconstruct animation state from two completed boards later.
   */
  cascadeWithMetadata(board, wins, rand = Math.random, reelSet = 'BR', excluded = new Set(), additionalRemoved = []) {
    const removed = new Set();
    for (const win of wins) {
      for (const [r, row] of win.positions || []) removed.add(`${r},${row}`);
    }
    for (const [reel, row] of additionalRemoved || []) removed.add(`${reel},${row}`);
    const explodingSymbols = [...removed]
      .map(value => value.split(',').map(Number))
      .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    if (removed.size === 0) {
      return { board, newSymbols: board.map(() => []), explodingSymbols };
    }

    const newSymbols = board.map(() => []);
    const nextBoard = board.map((col, r) => {
      const survivors = col.filter((_, row) => !removed.has(`${r},${row}`));
      const gaps = col.length - survivors.length;
      if (gaps === 0) return survivors;
      newSymbols[r] = this.generateReelExcluding(r, gaps, rand, reelSet, excluded);
      return [...newSymbols[r], ...survivors];
    });
    return { board: nextBoard, newSymbols, explodingSymbols };
  }

  /** Weighted pick from the mechanic's `values` map, e.g. { 2: 60, 3: 80 }. */
  rollSymbolMultiplier(rand = Math.random, gameMode = 'basegame') {
    const values = this.getConfig('multiplierSymbols').values || {};
    const table = values[gameMode] || values.basegame || {};
    const entries = Object.entries(table);
    if (entries.length === 0) return 1;

    const total = entries.reduce((s, [, weight]) => s + Number(weight), 0);
    if (total <= 0) return 1;

    let roll = rand() * total;
    for (const [mult, weight] of entries) {
      roll -= Number(weight);
      if (roll <= 0) return Number(mult);
    }
    return Number(entries[entries.length - 1][0]);
  }

  rollWeightedValue(table = {}, rand = Math.random, fallback = 1) {
    const entries = Object.entries(table).filter(([, weight]) => Number(weight) > 0);
    if (entries.length === 0) return fallback;
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let roll = rand() * total;
    for (const [value, weight] of entries) {
      roll -= Number(weight);
      if (roll <= 0) return Number(value);
    }
    return Number(entries.at(-1)[0]);
  }

  getStickyReelTierConfig(tier = 1) {
    const config = this.getConfig('stickyReelMultipliers');
    return config.tiers?.[tier] || config.tiers?.[String(tier)] || {};
  }

  createStickyReelState(rand = Math.random, tier = 1) {
    const rule = this.getStickyReelTierConfig(tier);
    const guaranteeBy = Math.max(0, Number(rule.guaranteedStickyBySpin) || 0);
    return {
      tier,
      stickyReels: {},
      guaranteedSpin: guaranteeBy > 0 ? 1 + Math.floor(rand() * guaranteeBy) : null,
      guaranteedReel: guaranteeBy > 0 ? Math.floor(rand() * this.math.grid.reels) : null,
    };
  }

  stickyTierFromFreeSpins(freeSpins) {
    const config = this.getConfig('stickyReelMultipliers');
    const tiers = Object.entries(config.tiers || {})
      .map(([tier, rule]) => ({ tier: Number(tier), freeSpins: Number(rule.freeSpins) || 0 }))
      .sort((left, right) => right.freeSpins - left.freeSpins);
    return tiers.find(item => freeSpins >= item.freeSpins)?.tier || 1;
  }

  stickyReelWinMultiplier(win, activeReels = {}) {
    const count = Math.max(0, Number(win.count ?? win.kind) || 0);
    const contributingStickyReels = Object.entries(activeReels)
      .map(([reel, multiplier]) => ({ reel: Number(reel), multiplier: Number(multiplier) }))
      .filter(item => item.reel < count && item.multiplier > 0)
      .sort((left, right) => left.reel - right.reel);
    return {
      multiplier: contributingStickyReels.reduce((sum, item) => sum + item.multiplier, 0) || 1,
      contributingStickyReels,
    };
  }

  prepareStickyReels(board, rand = Math.random, gameMode = 'basegame', options = {}) {
    const config = this.getConfig('stickyReelMultipliers');
    const state = options.stickyReelState || { tier: null, stickyReels: {}, guaranteedSpin: null, guaranteedReel: null };
    state.stickyReels ||= {};
    const tier = Number(options.featureTier ?? state.tier) || 1;
    const rule = this.getStickyReelTierConfig(tier);
    const events = [];
    const temporaryReels = {};
    const newlySticky = new Set();
    const valueTable = gameMode === 'freegame'
      ? config.valueWeights?.[`tier${tier}`] || config.valueWeights?.freegame || config.valueWeights?.basegame
      : config.valueWeights?.basegame;
    const drawValue = minimum => Math.max(minimum, this.rollWeightedValue(valueTable, rand, minimum));
    const claim = (reel, persistence, minimum = 2) => {
      const multiplier = drawValue(minimum);
      if (persistence === 'sticky') {
        state.stickyReels[reel] = multiplier;
        newlySticky.add(reel);
      } else {
        temporaryReels[reel] = multiplier;
      }
      events.push({ type: 'expandStickyReel', reel, multiplier, persistence });
    };

    if (gameMode === 'freegame'
      && Number(options.featureSpin) === Number(state.guaranteedSpin)
      && state.guaranteedReel !== null
      && state.stickyReels[state.guaranteedReel] === undefined) {
      claim(Number(state.guaranteedReel), 'sticky');
    }

    for (let reel = 0; reel < this.math.grid.reels; reel++) {
      if (state.stickyReels[reel] !== undefined) {
        if (!newlySticky.has(reel) && rand() < (Number(rule.upgradeChance) || 0)) {
          const previousMultiplier = Number(state.stickyReels[reel]);
          const multiplier = drawValue(previousMultiplier);
          if (multiplier > previousMultiplier) {
            state.stickyReels[reel] = multiplier;
            events.push({ type: 'upgradeStickyReel', reel, previousMultiplier, multiplier });
          }
        }
        continue;
      }
      const stickyChance = gameMode === 'freegame' ? Number(rule.stickyChance) || 0 : 0;
      const temporaryChance = gameMode === 'freegame'
        ? Number(rule.temporaryChance) || 0
        : Number(config.baseTemporaryChance) || 0;
      if (rand() < stickyChance) claim(reel, 'sticky');
      else if (rand() < temporaryChance) claim(reel, 'spin');
    }

    const activeReels = { ...state.stickyReels, ...temporaryReels };
    const wild = this.math.specialSymbols?.wild?.[0];
    const claimedBoard = wild
      ? board.map((column, reel) => activeReels[reel] === undefined ? column : column.map(() => wild))
      : board;
    if (Object.keys(temporaryReels).length > 0) {
      events.push({ type: 'clearTemporaryReels', reels: Object.keys(temporaryReels).map(Number).sort((a, b) => a - b) });
    }
    return { board: claimedBoard, state, activeReels, temporaryReels, events };
  }

  /**
   * Resolve one full round: board generation, mechanics, cascade chain and
   * win-cap clamping. `rand` is threaded through every random draw so a seeded
   * simulation replays identically.
   */
  resolveSpin(rand = Math.random, gameMode = 'basegame', options = {}) {
    const cascadesOn = this.isEnabled('cascades');
    const incMultOn = this.isEnabled('increasingMultipliers');
    const symMultOn = this.isEnabled('multiplierSymbols');
    const stickyReelsOn = this.isEnabled('stickyReelMultipliers');

    const incCfg = incMultOn ? this.getConfig('increasingMultipliers') : null;
    let globalMult = incCfg ? incCfg.startValue : 1;

    const configured = cascadesOn ? this.getConfig('cascades').maxCascades : 0;
    const maxCascades = cascadesOn ? (configured > 0 ? configured : CASCADE_SAFETY_LIMIT) : 0;

    const reelSet = options.reelSet || (gameMode === 'freegame' ? 'FR' : 'BR');
    const featureRuntime = options.featureRuntime || new FeatureArchitectureRuntime(this.project, {
      tier: options.featureTier,
      premiumSetup: options.premiumSetup,
      positionGridMode: options.positionGridMode,
      gridModeId: options.gridModeId,
    });
    featureRuntime.beginSpin();
    const forbiddenRefillSymbols = featureRuntime.forbiddenRefillSymbols();
    let board = this.generateProfileBoard(rand, reelSet, featureRuntime.state.reelRows, options);
    board = this.replaceExcludedBoardSymbols(board, rand, reelSet, forbiddenRefillSymbols);
    const sourceBoard = board;

    let prepared = featureRuntime.prepareBoard(board, rand);
    const profileSelection = this.profileBoardSelectionEvent(sourceBoard, options);
    if (profileSelection) prepared.events.unshift(profileSelection);
    board = prepared.board;
    const stickyOutcome = stickyReelsOn
      ? this.prepareStickyReels(board, rand, gameMode, options)
      : { board, state: options.stickyReelState || null, activeReels: {}, temporaryReels: {}, events: [] };
    board = stickyOutcome.board;

    const initialBoard = board;
    const steps = [];
    let totalWin = 0;
    let uncappedTotalWin = 0;
    let cascadeCount = 0;
    let forcedWincap = false;
    let ordinaryCapHit = false;

    while (true) {
      const wins = this.evaluateBoard(board);
      if (wins.length === 0) break;

      const configuredMultiplierSymbols = this.math.specialSymbols?.multiplier || [];
      const symMult = symMultOn && configuredMultiplierSymbols.length === 0 ? this.rollSymbolMultiplier(rand, gameMode) : 1;
      const appliedWins = wins.map(win => {
        const sticky = stickyReelsOn ? this.stickyReelWinMultiplier(win, stickyOutcome.activeReels) : { multiplier: 1, contributingStickyReels: [] };
        const feature = featureRuntime.multiplierForWin(board, win, {
          rand,
          gameMode,
          rollSymbolMultiplier: (featureRand, featureMode) => symMultOn ? this.rollSymbolMultiplier(featureRand, featureMode) : 1,
        });
        const appliedMultiplier = symMult * feature.multiplier * globalMult * sticky.multiplier * (Number(options.payoutMultiplier) || 1);
        return {
          ...win,
          payout: win.payout * appliedMultiplier,
          meta: {
            ...(win.meta || {}),
            ...feature.meta,
            appliedMultiplier,
            stickyReelMultiplier: sticky.multiplier,
            contributingStickyReels: sticky.contributingStickyReels,
          },
        };
      });
      const wincap = Number(options.roundWincap ?? this.math.wincap) || Infinity;
      const roundWinBefore = Math.max(0, Number(options.roundWinBefore) || 0);
      let rawStepWin = appliedWins.reduce((sum, win) => sum + win.payout, 0);
      let stepWin = this.quantizePayout(rawStepWin);
      let ordinaryCapApplied = false;
      let featureAfter = { events: [], expansions: [], maxWildTriggered: false };
      if (stepWin > 0) featureAfter = featureRuntime.afterWinStep(board, wins, rand);
      if (stepWin > 0 && !featureAfter.maxWildTriggered && (options.expandingWilds || this.isEnabled('expandingWilds'))) {
        const expanding = this.resolveExpandingWilds(featureAfter.reactionBoard || board);
        featureAfter.reactionBoard = expanding.board;
        featureAfter.events.push(...expanding.events);
      }
      if (featureAfter.maxWildTriggered && appliedWins.length) {
        forcedWincap = true;
        rawStepWin = Math.max(0, wincap - roundWinBefore - totalWin);
        appliedWins.forEach(win => { win.payout = 0; });
        appliedWins[0].payout = rawStepWin;
        appliedWins[0].meta.maxWildTriggered = true;
        stepWin = this.quantizePayout(rawStepWin);
      }
      if (!forcedWincap) {
        uncappedTotalWin += stepWin;
        const ordinaryCap = Number.isFinite(wincap)
          ? Math.max(0, wincap - 0.1 - roundWinBefore)
          : wincap;
        const remaining = Math.max(0, ordinaryCap - totalWin);
        if (stepWin > remaining) {
          stepWin = this.quantizePayout(remaining);
          ordinaryCapHit = true;
          ordinaryCapApplied = true;
        }
      } else {
        uncappedTotalWin = Math.max(uncappedTotalWin, totalWin + stepWin);
      }
      if (ordinaryCapApplied && appliedWins.length) {
        const ratio = rawStepWin > 0 ? stepWin / rawStepWin : 0;
        appliedWins.forEach(win => {
          win.payout = Number((Math.max(0, win.payout) * ratio).toFixed(10));
          win.meta.ordinaryCapApplied = true;
        });
        const distributed = appliedWins.reduce((sum, win) => sum + win.payout, 0);
        appliedWins[0].payout = Number((appliedWins[0].payout + stepWin - distributed).toFixed(10));
      } else if (appliedWins.length) {
        appliedWins[0].payout = Number((appliedWins[0].payout + stepWin - rawStepWin).toFixed(10));
      }
      totalWin += stepWin;

      const step = {
        board,
        wins: appliedWins,
        stepWin,
        globalMult,
        symMult,
        modifierEvents: prepared.events,
        featureEvents: featureAfter.events,
        reactionBoard: featureAfter.reactionBoard || board,
      };
      steps.push(step);

      // A ways/line match that rounds below Stake's payout quantum is not a
      // settled win. Preserve the evaluated step for diagnostics, but do not
      // explode symbols or manufacture a cascade with no payable cause.
      if (stepWin <= 0) break;
      if (forcedWincap || ordinaryCapHit || !cascadesOn || cascadeCount >= maxCascades) break;
      const refillExclusions = new Set([
        ...forbiddenRefillSymbols,
        ...(featureAfter.restrictedRefillSymbols || []),
      ]);
      const tumble = this.cascadeWithMetadata(
        featureAfter.reactionBoard || board,
        appliedWins,
        rand,
        reelSet,
        refillExclusions,
        featureAfter.purgePositions,
      );
      step.tumble = {
        newSymbols: tumble.newSymbols,
        explodingSymbols: tumble.explodingSymbols,
      };
      board = tumble.board;
      board = featureRuntime.applyExpansions(
        board,
        featureAfter.expansions,
        reel => this.generateReelExcluding(reel, 1, rand, reelSet, forbiddenRefillSymbols)[0],
      );
      prepared = featureRuntime.prepareBoard(board, rand);
      board = prepared.board;
      cascadeCount++;

      if (incMultOn) {
        const next = globalMult + incCfg.increment;
        globalMult = incCfg.maxValue > 0 ? Math.min(next, incCfg.maxValue) : next;
      }
    }

    const wincap = Number(options.roundWincap ?? this.math.wincap) || Infinity;
    const roundWinBefore = Math.max(0, Number(options.roundWinBefore) || 0);
    const ordinaryCap = Number.isFinite(wincap)
      ? Math.max(0, wincap - 0.1 - roundWinBefore)
      : wincap;
    const cappedWin = Math.min(totalWin, forcedWincap ? wincap : ordinaryCap);

    const spin = {
      board: initialBoard,
      sourceBoard,
      finalBoard: board,
      steps,
      wins: steps[0]?.wins || [],
      cascades: cascadeCount,
      totalWin: cappedWin,
      uncappedWin: Math.max(totalWin, uncappedTotalWin),
      wincapHit: forcedWincap || ordinaryCapHit,
      maxMorpheusHit: forcedWincap,
      featureTier: featureRuntime.tier?.id || null,
      featureState: featureRuntime.snapshot(),
      tumbleFreeSpinsAwarded: steps.reduce((sum, step) => sum
        + (step.featureEvents || []).filter(event => event.type === 'awardTumbleFreeSpins').length, 0),
      stickyReels: { ...(stickyOutcome.state?.stickyReels || {}) },
      temporaryReels: { ...stickyOutcome.temporaryReels },
      stickyReelEvents: stickyOutcome.events,
    };
    spin.state = compileSpinBook(spin, { gameType: gameMode, wincap });
    return spin;
  }

  // --- BET MODE / BONUS ROUND RESOLUTION ---

  getBetMode(name = 'base') {
    const modes = this.math.betModes || [];
    return modes.find(mode => mode.name === name) || modes[0] || {
      name: 'base', cost: 1, rtp: this.math.rtp,
    };
  }

  countScatters(board) {
    const scatters = new Set(this.math.specialSymbols?.scatter || []);
    if (scatters.size === 0) return 0;
    return board.flat().reduce((count, symbol) => count + (scatters.has(symbol) ? 1 : 0), 0);
  }

  awardedFreeSpins(board, gameMode = 'basegame') {
    const table = this.math.freespinTriggers?.[gameMode] || {};
    const count = this.countScatters(board);
    const thresholds = Object.keys(table).map(Number).filter(Number.isFinite).sort((a, b) => b - a);
    const threshold = thresholds.find(value => count >= value);
    return threshold === undefined ? 0 : Number(table[threshold]) || 0;
  }

  /**
   * Resolve a complete paid round. Unlike resolveSpin(), this includes bonus
   * entry, natural free spins, and retriggers, then reports the actual wager.
   * Bet modes may declare a small, explicit profile:
   *
   *   { entry: 'base'|'freeSpins', reelSet, freeSpinReelSet,
   *     freeSpins, multiplier, freeSpinMultiplier, retriggers }
   */
  resolveRound(rand = Math.random, modeName = 'base', options = {}) {
    const mode = this.getBetMode(modeName);
    const profile = mode.profile || {};
    const entry = profile.entry || (mode.isBuyBonus ? 'freeSpins' : 'base');
    const wager = Number(mode.cost) || 1;
    const configuredCap = Number(mode.maxWin ?? this.math.wincap ?? Infinity);
    const maxWin = Number(mode.maxWin ?? this.math.wincap) || 0;
    const wincapChance = options.includeAllocatedMax === false
      ? 0
      : maximumWinHitRateForMode(this.math, mode);
    if (wincapChance > 0 && rand() < wincapChance) {
      return this.resolveWincapRound(mode, wager, maxWin);
    }
    const spins = [];
    let totalWin = 0;
    let uncappedWin = 0;
    let freeSpinsPlayed = 0;
    let freeSpinsAwarded = 0;
    let wincapHit = false;
    let featureTier = null;
    let architectureTier = null;
    let featureRuntime = null;
    let stickyReelState = null;

    const addSpin = (gameMode, options) => {
      const spin = this.resolveSpin(rand, gameMode, {
        ...options,
        roundWincap: configuredCap,
        roundWinBefore: totalWin,
      });
      spins.push({ gameMode, ...spin });
      totalWin += spin.totalWin;
      uncappedWin += Number(spin.uncappedWin) || spin.totalWin;
      wincapHit ||= spin.wincapHit;
      return spin;
    };

    const runFreeSpins = (initialCount, requestedArchitectureTier = null, requestedStickyTier = null) => {
      architectureTier = resolveFeatureTier(this.project, requestedArchitectureTier);
      if (architectureTier?.spins) initialCount = Number(architectureTier.spins) || initialCount;
      featureRuntime = new FeatureArchitectureRuntime(this.project, {
        tier: architectureTier?.id || null,
        premiumSetup: profile.premiumSetup,
      });
      if (this.isEnabled('stickyReelMultipliers')) {
        featureTier = Number(requestedStickyTier) || this.stickyTierFromFreeSpins(initialCount);
        stickyReelState = this.createStickyReelState(rand, featureTier);
        const configuredSpins = Number(this.getStickyReelTierConfig(featureTier).freeSpins) || 0;
        if (requestedStickyTier && configuredSpins > 0) initialCount = configuredSpins;
      }
      let remaining = Math.max(0, Number(initialCount) || 0);
      freeSpinsAwarded += remaining;
      const retriggers = profile.retriggers !== false;
      const safetyLimit = Math.max(remaining, 500);
      while (remaining > 0 && freeSpinsPlayed < safetyLimit && !wincapHit) {
        remaining--;
        freeSpinsPlayed++;
        const spin = addSpin('freegame', {
          reelSet: profile.freeSpinReelSet || profile.reelSet || 'FR',
          payoutMultiplier: profile.freeSpinMultiplier || profile.multiplier || 1,
          expandingWilds: profile.freeSpinExpandingWilds === true,
          stickyReelState,
          featureTier: architectureTier?.id || featureTier,
          featureRuntime,
          premiumSetup: profile.premiumSetup,
          featureSpin: freeSpinsPlayed,
        });
        if (retriggers) {
          const awarded = this.awardedFreeSpins(spin.board, 'freegame');
          remaining += awarded;
          freeSpinsAwarded += awarded;
        }
        const tumbleAwarded = Number(spin.tumbleFreeSpinsAwarded) || 0;
        remaining += tumbleAwarded;
        freeSpinsAwarded += tumbleAwarded;
      }
    };

    if (entry === 'freeSpins') {
      const directStickyTier = this.isEnabled('stickyReelMultipliers')
        ? this.rollWeightedValue(profile.stickyTierWeights || this.getConfig('stickyReelMultipliers').directTierWeights, rand, 1)
        : null;
      runFreeSpins(profile.freeSpins || 10, profile.featureTier || null, directStickyTier);
    } else {
      const modeFeatureRuntime = profile.positionMultiplierGrid === true
        ? new FeatureArchitectureRuntime(this.project, {
          positionGridMode: true,
          gridModeId: mode.name,
          premiumSetup: profile.premiumSetup,
        })
        : null;
      if (modeFeatureRuntime) featureRuntime = modeFeatureRuntime;
      const spin = addSpin('basegame', {
        reelSet: profile.reelSet || 'BR',
        payoutMultiplier: profile.multiplier || 1,
        expandingWilds: profile.expandingWilds === true,
        scatterWeightMultiplier: profile.scatterWeightMultiplier,
        specialSymbolBoost: profile.specialSymbolBoost,
        positionGridMode: profile.positionMultiplierGrid === true,
        gridModeId: mode.name,
        featureRuntime: modeFeatureRuntime,
      });
      if (!wincapHit && profile.triggerFreeSpins !== false) {
        const scatterCount = this.countScatters(spin.board);
        const naturalTier = resolveFeatureTier(this.project, scatterCount);
        runFreeSpins(this.awardedFreeSpins(spin.board, 'basegame'), naturalTier?.id || null);
      }
    }

    const maxMorpheusHit = spins.some(spin => spin.maxMorpheusHit === true);
    const ordinaryCap = Number.isFinite(configuredCap) ? Math.max(0, configuredCap - 0.1) : configuredCap;
    const cappedWin = Math.min(totalWin, maxMorpheusHit ? configuredCap : ordinaryCap);
    return {
      mode: mode.name,
      wager,
      spins,
      board: spins[0]?.board || [],
      wins: spins[0]?.wins || [],
      totalWin: cappedWin,
      uncappedWin,
      normalizedWin: cappedWin / wager,
      freeSpinsPlayed,
      freeSpinsAwarded,
      wincapHit: wincapHit || totalWin > cappedWin,
      maxMorpheusHit,
      featureTier: architectureTier?.id || featureTier,
      featureState: featureRuntime?.snapshot() || null,
      stickyReels: { ...(stickyReelState?.stickyReels || {}) },
    };
  }

  /**
   * Explicit rare max-win outcome shared by preview, simulation and math-sdk.
   * Its probability is derived from the configured RTP allocation, so a 0.001
   * allocation contributes 0.10 percentage points in every bet mode.
   */
  resolveWincapRound(mode, wager, maxWin) {
    const paid = (this.project.theme.symbols || [])
      .filter(symbol => Object.values(symbol.payouts || {}).some(value => Number(value) > 0))
      .sort((a, b) => Number(b.payouts?.[this.math.grid.reels] || 0) - Number(a.payouts?.[this.math.grid.reels] || 0));
    const maxDefinition = (this.project.theme.symbols || []).find(symbol => (symbol.special || []).includes('maxWild'));
    if (Number(maxWin) === 100_000 && !maxDefinition) {
      throw new Error('The 100,000x terminal path requires a visible maxWild symbol such as MAX_MORPHEUS.');
    }
    const symbol = maxDefinition?.name || paid[0]?.name || this.fallbackPaidSymbol();
    const supportSymbol = paid[0]?.name || this.fallbackPaidSymbol();
    const board = this.math.grid.rows.map((rows, reel) =>
      Array.from({ length: this.math.grid.rows[reel] || rows }, () => supportSymbol)
    );
    const maxPosition = [0, Math.max(0, board[0].length - 1)];
    board[maxPosition[0]][maxPosition[1]] = symbol;
    const win = {
      symbol,
      count: 1,
      ways: 1,
      payout: maxWin,
      positions: [maxPosition],
      meta: { maxWildTriggered: true, terminalCause: 'MAX_MORPHEUS' },
    };
    const step = {
      board,
      wins: [win],
      stepWin: maxWin,
      globalMult: 1,
      symMult: 1,
      featureEvents: [{
        type: 'maxWinReached',
        amount: Math.round(maxWin * 100),
        multiplier: maxWin,
        terminalCause: 'MAX_MORPHEUS',
        sources: [maxPosition],
        positions: [maxPosition],
      }],
    };
    const spin = {
      gameMode: 'wincap', board, finalBoard: board, steps: [step], wins: [win],
      cascades: 0, totalWin: maxWin, uncappedWin: maxWin, wincapHit: true, maxMorpheusHit: true,
    };
    spin.state = compileSpinBook(spin, { gameType: 'basegame', wincap: maxWin });
    return {
      mode: mode.name, wager, spins: [spin], board, wins: [win],
      totalWin: maxWin, uncappedWin: maxWin, normalizedWin: maxWin / wager,
      freeSpinsPlayed: 0, freeSpinsAwarded: 0, wincapHit: true, maxMorpheusHit: true, state: spin.state,
    };
  }

  fallbackPaidSymbol() {
    return (this.project.theme.symbols || []).find(symbol => !(symbol.special || []).length)?.name || 'L1';
  }

  generateStakeSDKConfig() {
    const m = this.math;
    const mechanicConfig = {};
    for (const key of m.bonusMechanics || []) {
      mechanicConfig[key] = this.getConfig(key);
    }
    return {
      gameType: m.gameType,
      grid: m.grid,
      rtp: m.rtp,
      wincap: m.wincap,
      volatility: m.volatility,
      betModes: m.betModes,
      specialSymbols: m.specialSymbols,
      bonusMechanics: m.bonusMechanics,
      mechanicConfig,
      freespinTriggers: m.freespinTriggers,
    };
  }
}
