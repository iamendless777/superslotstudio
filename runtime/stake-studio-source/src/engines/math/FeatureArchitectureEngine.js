const cloneBoard = board => (board || []).map(column => [...column]);

const positionKey = ([reel, row]) => `${reel},${row}`;

function tierEntries(project) {
  return Object.entries(project?.math?.featureArchitecture?.tiers || {})
    .map(([scatterCount, tier]) => ({ scatterCount: Number(scatterCount), ...tier }))
    .filter(tier => Number.isFinite(tier.scatterCount) && tier.id)
    .sort((left, right) => left.scatterCount - right.scatterCount);
}

export function resolveFeatureTier(project, reference) {
  const tiers = tierEntries(project);
  if (!tiers.length || reference === null || reference === undefined) return null;
  if (typeof reference === 'string') {
    return tiers.find(tier => tier.id === reference || tier.name === reference || String(tier.scatterCount) === reference) || null;
  }
  const count = Number(reference);
  if (!Number.isFinite(count)) return null;
  return [...tiers].reverse().find(tier => count >= tier.scatterCount) || null;
}

function definitionMap(project) {
  const map = new Map();
  for (const symbol of project?.theme?.symbols || []) {
    if (symbol?.name) map.set(symbol.name, symbol);
    if (symbol?.id) map.set(symbol.id, symbol);
  }
  return map;
}

function paidDefinitions(project) {
  const reels = Number(project?.math?.grid?.reels) || 6;
  return (project?.theme?.symbols || [])
    .filter(symbol => Object.values(symbol.payouts || {}).some(value => Number(value) > 0) && !(symbol.special || []).includes('wild'))
    .sort((left, right) => {
      const leftValue = Number(left.payouts?.[reels] || Math.max(0, ...Object.values(left.payouts || {}).map(Number)));
      const rightValue = Number(right.payouts?.[reels] || Math.max(0, ...Object.values(right.payouts || {}).map(Number)));
      return leftValue - rightValue || left.name.localeCompare(right.name);
    });
}

function randomItem(values, rand = Math.random) {
  return values.length ? values[Math.min(values.length - 1, Math.floor(rand() * values.length))] : null;
}

export class FeatureArchitectureRuntime {
  constructor(project, { tier = null, premiumSetup = false, positionGridMode = false, gridModeId = null } = {}) {
    this.project = project;
    this.definitions = definitionMap(project);
    this.paid = paidDefinitions(project);
    this.tier = resolveFeatureTier(project, tier);
    this.premiumSetup = Boolean(premiumSetup);
    this.positionGridMode = Boolean(positionGridMode);
    this.gridModeId = gridModeId || (this.positionGridMode ? 'trickster_dream' : 'oneiric_nexus');
    const gridConfig = project?.math?.mechanicConfig?.positionMultiplierGrid || {};
    this.positionGridAggregation = gridConfig.aggregation || 'additive-excess-v1';
    this.positionGridMaximum = Math.max(1, Number(gridConfig.maximumCellMultiplier) || 1024);
    if (this.hasPositionGrid() && this.positionGridAggregation !== 'additive-excess-v1') {
      throw new Error(`Unsupported position-grid aggregation: ${this.positionGridAggregation}.`);
    }
    const rows = project?.math?.grid?.rows || [];
    this.state = {
      tier: this.tier?.id || null,
      upgradeMeter: 0,
      upgradeCount: 0,
      symbolUpgrades: {},
      symbolMultipliers: {},
      reelRows: [...rows],
      multiplierGrid: rows.map(rowCount => Array(Number(rowCount) || 0).fill(1)),
      tumbleChainHit: 0,
      totalTumbleFreeSpinsAwarded: 0,
      gridStarted: false,
      accountingIdentityByPosition: {},
    };
  }

  beginSpin() {
    this.state.tumbleChainHit = 0;
  }

  isDreamfall() {
    return this.tier?.mechanic === 'winningCascadeReelExpansion';
  }

  hasPositionGrid() {
    return this.positionGridMode || this.tier?.mechanic === 'persistentPositionMultiplierGrid';
  }

  forbiddenRefillSymbols() {
    return this.isDreamfall() ? this.namesWithFlag('scatter') : new Set();
  }

  namesWithFlag(flag) {
    return new Set([...this.definitions.values()]
      .filter(symbol => (symbol.special || []).includes(flag))
      .map(symbol => symbol.name));
  }

  hasFlag(name, flag) {
    return (this.definitions.get(name)?.special || []).includes(flag);
  }

  spawnedWild() {
    const preferred = [...this.definitions.values()].find(symbol => (
      (symbol.special || []).includes('wild')
      && (symbol.special || []).includes('spawnOnly')
    ));
    if (preferred) return preferred.name;
    const neutral = [...this.definitions.values()].find(symbol => {
      const flags = symbol.special || [];
      return flags.includes('wild') && !flags.includes('expandingWild') && !flags.includes('maxWild') && !flags.includes('multiplier');
    });
    return neutral?.name || this.project?.math?.specialSymbols?.wild?.[0] || null;
  }

  applyUpgradeName(name) {
    let current = name;
    const visited = new Set();
    while (this.state.symbolUpgrades[current] && !visited.has(current)) {
      visited.add(current);
      current = this.state.symbolUpgrades[current];
    }
    return current;
  }

  lowestActivePaidFamily() {
    const active = new Set(this.paid.map(symbol => this.applyUpgradeName(symbol.name)));
    return this.paid.find(symbol => active.has(symbol.name)) || null;
  }

  upgradeActiveFamily(source, target) {
    for (const symbol of this.paid) {
      if (this.applyUpgradeName(symbol.name) === source) this.state.symbolUpgrades[symbol.name] = target;
    }
    this.state.symbolUpgrades[source] = target;
  }

  prepareBoard(inputBoard, rand = Math.random) {
    const board = cloneBoard(inputBoard).map(column => column.map(name => this.applyUpgradeName(name)));
    const events = [];
    this.state.accountingIdentityByPosition = {};

    if (this.hasPositionGrid() && !this.state.gridStarted) {
      this.state.gridStarted = true;
      events.push({
        type: 'modeGridStart',
        mode: this.gridModeId,
        cells: this.state.multiplierGrid.flatMap((column, reel) => column.map((value, row) => ({
          position: [reel, row],
          value,
        }))),
      });
    }

    return { board, events };
  }

  resolvePostSettlementSpecials(inputBoard, rand = Math.random) {
    const board = cloneBoard(inputBoard);
    const events = [];
    const wild = this.spawnedWild();

    const mysteryPositions = [];
    board.forEach((column, reel) => column.forEach((name, row) => {
      if (this.hasFlag(name, 'mystery')) mysteryPositions.push([reel, row]);
    }));
    if (mysteryPositions.length) {
      const target = randomItem(this.paid, rand)?.name;
      if (target) {
        for (const [reel, row] of mysteryPositions) {
          this.state.accountingIdentityByPosition[positionKey([reel, row])] = {
            originalIdentity: 'MYSTERY_VEIL',
            revealedFamily: target,
          };
          board[reel][row] = target;
        }
        events.push({
          type: 'mysteryTransform',
          target,
          revealedAs: target,
          originalIdentity: 'MYSTERY_VEIL',
          originalPositions: mysteryPositions,
          positions: mysteryPositions,
          accountingIdentities: mysteryPositions.map(position => ({
            position,
            originalIdentity: 'MYSTERY_VEIL',
            revealedFamily: target,
          })),
          board: cloneBoard(board),
        });
      }
    }

    const bombs = [];
    board.forEach((column, reel) => column.forEach((name, row) => {
      if (this.hasFlag(name, 'goldWildBomb')) bombs.push({ reel, row, size: 3, symbol: name });
      else if (this.hasFlag(name, 'wildBomb')) bombs.push({ reel, row, size: 2, symbol: name });
    }));
    for (const bomb of bombs) {
      const positions = [];
      for (let reel = bomb.reel; reel < Math.min(board.length, bomb.reel + bomb.size); reel++) {
        for (let row = bomb.row; row < Math.min(board[reel].length, bomb.row + bomb.size); row++) {
          if (wild) board[reel][row] = wild;
          positions.push([reel, row]);
        }
      }
      events.push({
        type: 'wildBomb',
        source: bomb.symbol,
        sources: [[bomb.reel, bomb.row]],
        size: bomb.size,
        positions,
        board: cloneBoard(board),
      });
    }

    const starPositions = [];
    board.forEach((column, reel) => column.forEach((name, row) => {
      if (this.hasFlag(name, 'wildStar')) starPositions.push([reel, row]);
    }));
    if (starPositions.length && wild) {
      const presentPaid = this.paid.filter(symbol => board.some(column => column.includes(symbol.name)));
      const target = randomItem(presentPaid, rand)?.name;
      const transformed = [];
      if (target) {
        events.push({
          type: 'specialTargetSelected',
          special: 'ONEIRIC_STAR',
          target,
          targetFamily: target,
          sources: starPositions,
          positions: starPositions,
        });
        const boardBefore = cloneBoard(board);
        board.forEach((column, reel) => column.forEach((name, row) => {
          if (name === target || this.hasFlag(name, 'wildStar')) {
            board[reel][row] = wild;
            transformed.push([reel, row]);
          }
        }));
        events.push({
          type: 'specialPositionsResolved',
          special: 'ONEIRIC_STAR',
          target,
          targetFamily: target,
          sources: starPositions,
          positions: transformed,
          boardBefore,
          boardAfter: cloneBoard(board),
          board: cloneBoard(board),
        });
      }
    }

    return { board, events };
  }

  multiplierForWin(board, win, { rand = Math.random, gameMode = 'basegame', rollSymbolMultiplier = () => 1 } = {}) {
    const positions = win.positions || [];
    const unique = [...new Map(positions.map(position => [positionKey(position), position])).values()];
    const multiplierWildPositions = unique.filter(([reel, row]) => this.hasFlag(board[reel]?.[row], 'multiplier'));
    const multiplierWildValues = multiplierWildPositions.map(() => Math.max(1, Number(rollSymbolMultiplier(rand, gameMode)) || 1));
    const multiplierWild = multiplierWildValues.length
      ? multiplierWildValues.reduce((sum, value) => sum + value, 0)
      : 1;
    const splitPositions = unique.filter(([reel, row]) => this.hasFlag(board[reel]?.[row], 'split'));
    const splitMultiplier = 2 ** splitPositions.length;
    const waysBefore = Math.max(1, Number(win.ways) || 1);
    const persistentSymbolMultiplier = this.tier?.mechanic === 'persistentSymbolMultipliers'
      ? Math.max(1, Number(this.state.symbolMultipliers[win.symbol]) || 1)
      : 1;
    const positionMultiplier = this.hasPositionGrid()
      ? Math.max(1, 1 + unique.reduce((sum, [reel, row]) => sum + Math.max(0, Number(this.state.multiplierGrid[reel]?.[row]) - 1 || 0), 0))
      : 1;
    return {
      multiplier: multiplierWild * splitMultiplier * persistentSymbolMultiplier * positionMultiplier,
      meta: {
        multiplierWild,
        multiplierWildValues,
        multiplierWildPositions,
        splitMultiplier,
        splitPositions,
        waysBefore,
        waysAfter: waysBefore * splitMultiplier,
        persistentSymbolMultiplier,
        positionMultiplier,
      },
    };
  }

  afterWinStep(board, wins, rand = Math.random) {
    const reactions = this.resolvePostSettlementSpecials(board, rand);
    const reactionBoard = reactions.board;
    const events = [...reactions.events];
    const allPositions = [...new Map(wins.flatMap(win => win.positions || []).map(position => [positionKey(position), position])).values()];
    const maxWildTriggered = allPositions.some(([reel, row]) => this.hasFlag(board[reel]?.[row], 'maxWild'));
    if (maxWildTriggered) {
      return {
        events: [], expansions: [], maxWildTriggered: true, awardedFreeSpins: 0,
        purgePositions: [], restrictedRefillSymbols: new Set(), reactionBoard: cloneBoard(board),
      };
    }
    const purgeSources = [];
    reactionBoard.forEach((column, reel) => column.forEach((name, row) => {
      if (this.hasFlag(name, 'royalRemover')) purgeSources.push([reel, row]);
    }));
    const purgePositions = [];
    if (purgeSources.length) {
      reactionBoard.forEach((column, reel) => column.forEach((name, row) => {
        if (this.definitions.get(name)?.tier === 'low' || this.hasFlag(name, 'royalRemover')) purgePositions.push([reel, row]);
      }));
      const boardAfter = cloneBoard(reactionBoard);
      for (const [reel, row] of purgePositions) boardAfter[reel][row] = null;
      events.push({
        type: 'symbolPurge',
        sources: purgeSources,
        positions: purgePositions,
        boardBefore: cloneBoard(reactionBoard),
        boardAfter,
        board: boardAfter,
        refillExcludesTiers: ['low'],
      });
    }

    for (const win of wins) {
      const splitPositions = [...new Map((win.positions || [])
        .filter(([reel, row]) => this.hasFlag(board[reel]?.[row], 'split'))
        .map(position => [positionKey(position), position])).values()];
      if (!splitPositions.length) continue;
      const multiplier = 2 ** splitPositions.length;
      const waysBefore = Math.max(1, Number(win.ways) || 1);
      events.push({
        type: 'echoSplit',
        symbolFamily: win.symbol,
        sources: splitPositions,
        positions: win.positions || [],
        multiplier,
        waysBefore,
        waysAfter: waysBefore * multiplier,
      });
    }

    if (this.tier?.mechanic === 'progressiveSymbolUpgrade') {
      const hitsByFamily = new Map();
      for (const win of wins) {
        if (!win.symbol || !this.definitions.has(win.symbol)) continue;
        const family = this.applyUpgradeName(win.symbol);
        const positions = hitsByFamily.get(family) || new Map();
        for (const position of win.positions || []) positions.set(positionKey(position), position);
        hitsByFamily.set(family, positions);
      }
      const threshold = Math.max(1, Number(this.tier.meterThreshold) || 4);
      const maximumUpgrades = Math.max(1, Number(this.tier.maximumUpgrades) || 4);
      for (const [symbolFamily, positions] of hitsByFamily) {
        const hits = [...positions.values()];
        if (!hits.length) continue;
        const previous = this.state.upgradeMeter;
        this.state.upgradeMeter += hits.length;
        events.push({
          type: 'symbolBarProgress',
          symbolFamily,
          hits,
          previous,
          current: Math.min(threshold, this.state.upgradeMeter),
          threshold,
          gained: hits.length,
          accountingIdentities: hits
            .map(position => ({ position, ...this.state.accountingIdentityByPosition[positionKey(position)] }))
            .filter(identity => identity.originalIdentity),
        });
      }
      while (this.state.upgradeMeter >= threshold && this.state.upgradeCount < maximumUpgrades) {
        this.state.upgradeMeter -= threshold;
        const source = this.lowestActivePaidFamily();
        const sourceIndex = this.paid.findIndex(symbol => symbol.name === source?.name);
        const target = source ? randomItem(this.paid.slice(sourceIndex + 1), rand) : null;
        if (!source || !target) break;
        this.upgradeActiveFamily(source.name, target.name);
        this.state.upgradeCount += 1;
        const positions = [];
        board.forEach((column, reel) => column.forEach((name, row) => {
          if (this.applyUpgradeName(name) === target.name && (name === source.name || this.state.symbolUpgrades[name] === target.name)) {
            positions.push([reel, row]);
          }
        }));
        events.push({
          type: 'symbolUpgrade',
          source: source.name,
          target: target.name,
          fromFamily: source.name,
          toFamily: target.name,
          positions,
          upgradeCount: this.state.upgradeCount,
          maximumUpgrades,
          meterCurrent: this.state.upgradeMeter,
          meterThreshold: threshold,
        });
      }
    }

    if (this.tier?.mechanic === 'persistentSymbolMultipliers') {
      for (const symbol of new Set(wins.map(win => win.symbol).filter(name => name && !this.hasFlag(name, 'wild')))) {
        const previous = Math.max(1, Number(this.state.symbolMultipliers[symbol]) || 1);
        const multiplier = Math.min(1000, previous * 2);
        this.state.symbolMultipliers[symbol] = multiplier;
        events.push({
          type: 'symbolMultiplierUpdate',
          symbol,
          symbolFamily: symbol,
          previous,
          multiplier,
          current: multiplier,
        });
      }
    }

    if (this.hasPositionGrid()) {
      for (const [reel, row] of allPositions) {
        this.state.multiplierGrid[reel] ||= [];
        const previous = Math.max(1, Number(this.state.multiplierGrid[reel][row]) || 1);
        const multiplier = Math.min(this.positionGridMaximum, previous * 2);
        this.state.multiplierGrid[reel][row] = multiplier;
        const update = { reel, row, previous, multiplier, current: multiplier };
        events.push({
          type: 'positionMultiplierGridUpdate',
          position: [reel, row],
          previous,
          current: multiplier,
          multiplier,
          updates: [update],
        });
      }
    }

    const expansions = [];
    if (this.tier?.mechanic === 'winningCascadeReelExpansion') {
      const maximumRows = Math.max(4, Number(this.tier.maximumRows) || 8);
      for (let index = 0; index < wins.length; index++) {
        const candidates = this.state.reelRows
          .map((rows, reel) => ({ rows: Number(rows) || 0, reel }))
          .filter(item => item.rows < maximumRows);
        const selected = randomItem(candidates, rand);
        if (!selected) break;
        this.state.reelRows[selected.reel] = selected.rows + 1;
        expansions.push(selected.reel);
        events.push({ type: 'expandReelHeight', reel: selected.reel, rows: selected.rows + 1, maximumRows });
      }
      this.state.tumbleChainHit += 1;
      events.push({
        type: 'tumbleChainProgress',
        chainHit: this.state.tumbleChainHit,
        threshold: 5,
      });
      if (this.state.tumbleChainHit >= 5) {
        this.state.totalTumbleFreeSpinsAwarded += 1;
        events.push({
          type: 'awardTumbleFreeSpins',
          chainHit: this.state.tumbleChainHit,
          amount: 1,
          totalAwarded: this.state.totalTumbleFreeSpinsAwarded,
        });
      }
    }

    return {
      events,
      expansions,
      maxWildTriggered,
      awardedFreeSpins: events.filter(event => event.type === 'awardTumbleFreeSpins').length,
      purgePositions,
      reactionBoard,
      restrictedRefillSymbols: purgePositions.length
        ? new Set([...this.definitions.values()].filter(symbol => symbol.tier === 'low').map(symbol => symbol.name))
        : new Set(),
    };
  }

  applyExpansions(inputBoard, expansions, drawSymbol) {
    const board = cloneBoard(inputBoard);
    for (const reel of expansions || []) {
      board[reel].unshift(drawSymbol(reel));
      this.state.multiplierGrid[reel] ||= [];
      this.state.multiplierGrid[reel].unshift(1);
    }
    return board;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }
}
