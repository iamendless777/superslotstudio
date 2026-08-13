/**
 * Exports a StakeStudio project as a math-sdk game folder.
 *
 * Target layout (math-sdk resolves every path from `game_id`, so the folder
 * name and `self.game_id` must agree):
 *
 *   games/<game_id>/
 *     game_config.py  gamestate.py  game_override.py  game_executables.py
 *     game_calculations.py  game_events.py  game_optimization.py  run.py
 *     reels/<every referenced reel set>0.csv
 *
 * Structure verified against reference/math-sdk/games/template.
 */

import { getExecutableWinType, resolvePaylines } from '../math/WinTypeEngine.js';
import { maximumWinRtpForMode } from '../math/MaximumWinPolicy.js';

export const MATH_SDK_CONTRACT_FORMAT = 'stake-studio-math-sdk-contract-v1';

/**
 * Fingerprint the exact executable sources and reel strips handed to the
 * official SDK. Documentation is deliberately excluded: changing prose must
 * not invalidate millions of verified books, while changing any Python or
 * reel byte must.
 */
export function mathSDKFilesFingerprint(files = {}) {
  const entries = Object.entries(files)
    .filter(([path]) => path.endsWith('.py') || path.endsWith('.csv'))
    .sort(([left], [right]) => left.localeCompare(right));
  let hash = 0x811c9dc5;
  const input = `${MATH_SDK_CONTRACT_FORMAT}\n${entries.map(([path, contents]) => (
    `${path.length}:${path}\n${String(contents).length}:${String(contents)}`
  )).join('\n')}`;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `math-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export class MathSDKExporter {
  constructor(project) {
    this.project = project;
  }

  get math() { return this.project.math; }

  gameId() {
    const id = this.project.build?.stakeEngine?.gameId;
    if (id) return id;
    return this.project.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled_game';
  }

  /** @returns {Record<string,string>} path -> file contents */
  generateFiles() {
    if (!getExecutableWinType(this.math.gameType)) {
      throw new Error(`StakeStudio does not yet have a production math compiler for game type "${this.math.gameType}".`);
    }
    this.assertSDKSymbolNames();
    const id = this.gameId();
    const base = `games/${id}`;
    const files = {
      [`${base}/game_config.py`]: this.genGameConfig(),
      [`${base}/gamestate.py`]: this.genGameState(),
      [`${base}/game_override.py`]: this.genGameOverride(),
      [`${base}/game_executables.py`]: this.genGameExecutables(),
      [`${base}/game_calculations.py`]: this.genGameCalculations(),
      [`${base}/game_events.py`]: this.genGameEvents(),
      [`${base}/game_optimization.py`]: this.genGameOptimization(),
      [`${base}/run.py`]: this.genRun(),
      [`${base}/README.md`]: this.genReadme(),
    };
    for (const key of this.reelSetKeys()) {
      files[`${base}/reels/${key}0.csv`] = this.genReelCSV(key);
    }
    return files;
  }

  modes() {
    return this.math.betModes?.length
      ? this.math.betModes
      : [{ name: 'base', cost: 1, rtp: this.math.rtp, maxWin: this.math.wincap, profile: { entry: 'base' } }];
  }

  /**
   * The official math-sdk's CSV reader deliberately keeps only alphanumeric
   * characters. Use the same canonical name everywhere in the generated SDK
   * so authored names such as MOON_MOTH cannot diverge between reel strips and
   * the symbol registry. The frontend retains the authored display name and
   * resolves this canonical alias when it consumes published books.
   */
  sdkSymbolName(name) {
    return String(name || '').replace(/[^a-z0-9]/gi, '') || 'SYM';
  }

  assertSDKSymbolNames() {
    const owners = new Map();
    for (const symbol of this.project.theme.symbols || []) {
      const canonical = this.sdkSymbolName(symbol.name);
      const existing = owners.get(canonical);
      if (existing && existing !== symbol.name) {
        throw new Error(`Symbols "${existing}" and "${symbol.name}" both compile to the official math-sdk name "${canonical}".`);
      }
      owners.set(canonical, symbol.name);
    }
  }

  freeReelSet(profile = {}) {
    const available = this.math.reelStrips || {};
    const requested = profile.freeSpinReelSet || profile.reelSet;
    if (requested && Array.isArray(available[requested]) && available[requested].length > 0) return requested;
    if (Array.isArray(available.FR) && available.FR.length > 0) return 'FR';
    return 'BR';
  }

  reelSetKeys() {
    const available = this.math.reelStrips || {};
    const keys = new Set(['BR']);
    for (const mode of this.modes()) {
      const profile = mode.profile || {};
      if (profile.reelSet) keys.add(profile.reelSet);
      keys.add(this.freeReelSet(profile));
    }
    if (Object.hasOwn(available, 'FR')) keys.add('FR');
    return [...keys].filter(key => Array.isArray(available[key]) && available[key].length > 0);
  }

  // --- reels ---

  /**
   * math-sdk reads reel CSVs column-per-reel (`read_reels_csv` indexes columns
   * and asserts no cell is empty), so the grid must be rectangular. Strips of
   * unequal length are cycled rather than blank-padded.
   */
  genReelCSV(setKey) {
    const strips = this.math.reelStrips?.[setKey] || this.math.reelStrips?.BR || [];
    const reels = this.math.grid.reels;

    const columns = [];
    for (let r = 0; r < reels; r++) {
      const strip = strips[r] && strips[r].length ? strips[r] : this.fallbackStrip();
      columns.push(strip);
    }

    const depth = Math.max(...columns.map(c => c.length));
    const lines = [];
    for (let row = 0; row < depth; row++) {
      lines.push(columns.map(col => this.sdkSymbolName(col[row % col.length])).join(','));
    }
    return lines.join('\n') + '\n';
  }

  fallbackStrip() {
    const syms = (this.project.theme.symbols || []).filter(s => !s.special?.includes('scatter'));
    return syms.length ? syms.map(s => this.sdkSymbolName(s.name)) : ['L1'];
  }

  // --- python helpers ---

  py(value, indent = 0) {
    const pad = '    '.repeat(indent);
    if (value === true) return 'True';
    if (value === false) return 'False';
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(v => this.py(v, indent)).join(', ')}]`;
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    const inner = entries.map(([k, v]) => `${pad}    ${JSON.stringify(k)}: ${this.py(v, indent + 1)},`);
    return `{\n${inner.join('\n')}\n${pad}}`;
  }

  // --- game_config.py ---

  genGameConfig() {
    const m = this.math;
    const se = this.project.build?.stakeEngine || {};
    const winType = getExecutableWinType(m.gameType);

    const paytableRows = [];
    for (const sym of this.project.theme.symbols || []) {
      const payouts = sym.payouts || {};
      const kinds = Object.keys(payouts).map(Number).filter(k => payouts[k] > 0).sort((a, b) => b - a);
      for (const kind of kinds) {
        paytableRows.push(`            (${kind}, "${this.sdkSymbolName(sym.name)}"): ${payouts[kind]},`);
      }
    }

    const specialSets = new Map([
      ['wild', new Set(m.specialSymbols?.wild || [])],
      ['scatter', new Set(m.specialSymbols?.scatter || [])],
      ['multiplier', new Set(m.specialSymbols?.multiplier || [])],
    ]);
    for (const symbol of this.project.theme.symbols || []) {
      for (const flag of symbol.special || []) {
        if (!specialSets.has(flag)) specialSets.set(flag, new Set());
        specialSets.get(flag).add(symbol.name);
      }
    }
    const special = Object.fromEntries([...specialSets]
      .map(([flag, names]) => [flag, [...names].map(name => this.sdkSymbolName(name))]));

    const triggers = m.freespinTriggers || {};
    const baseTrig = triggers.basegame || {};
    const freeTrig = triggers.freegame || {};
    const reelKeys = this.reelSetKeys();
    const reelFiles = Object.fromEntries(reelKeys.map(key => [`${key}0`, `${key}0.csv`]));
    const mechanics = new Set(m.bonusMechanics || []);
    const cascadeConfig = m.mechanicConfig?.cascades || {};
    const increasingConfig = m.mechanicConfig?.increasingMultipliers || {};
    const stickyReelConfig = m.mechanicConfig?.stickyReelMultipliers || {};
    const positionGridConfig = m.mechanicConfig?.positionMultiplierGrid || {};
    const profiles = Object.fromEntries(this.modes().map(mode => [mode.name, {
      entry: mode.profile?.entry || (mode.isBuyBonus ? 'freeSpins' : 'base'),
      reel_set: `${mode.profile?.reelSet || 'BR'}0`,
      free_reel_set: `${this.freeReelSet(mode.profile || {})}0`,
      free_spins: Number(mode.profile?.freeSpins) || 10,
      multiplier: Number(mode.profile?.multiplier) || 1,
      free_multiplier: Number(mode.profile?.freeSpinMultiplier || mode.profile?.multiplier) || 1,
      trigger_free_spins: mode.profile?.triggerFreeSpins !== false,
      retriggers: mode.profile?.retriggers !== false,
      cascades: mechanics.has('cascades'),
      max_cascades: Math.max(1, Number(cascadeConfig.maxCascades) || 100),
      expanding_wilds: mechanics.has('expandingWilds') || mode.profile?.freeSpinExpandingWilds === true,
      increasing_multiplier: mechanics.has('increasingMultipliers'),
      multiplier_start: Number(increasingConfig.startValue) || 1,
      multiplier_increment: Number(increasingConfig.increment) || 1,
      multiplier_max: Math.max(0, Number(increasingConfig.maxValue) || 0),
      persist_multiplier_bonus: increasingConfig.persistInBonus !== false,
      symbol_multipliers: mechanics.has('multiplierSymbols'),
      sticky_reel_multipliers: mechanics.has('stickyReelMultipliers'),
      sticky_tier_weights: mode.profile?.stickyTierWeights || stickyReelConfig.directTierWeights || { 1: 55, 2: 30, 3: 15 },
      feature_tier: mode.profile?.featureTier || null,
      position_grid_mode: mode.profile?.positionMultiplierGrid === true,
      grid_mode_id: mode.name,
      position_grid_aggregation: positionGridConfig.aggregation || 'additive-excess-v1',
      position_grid_maximum: Math.max(1, Number(positionGridConfig.maximumCellMultiplier) || 1024),
      premium_setup: mode.profile?.premiumSetup === true,
      scatter_weight_multiplier: Math.max(1, Number(mode.profile?.scatterWeightMultiplier) || 1),
      special_symbol_boost: Math.max(1, Number(mode.profile?.specialSymbolBoost) || 1),
      target_feature_entry_hit_rate: Number(mode.profile?.targetFeatureEntryHitRate) > 0
        ? Number(mode.profile.targetFeatureEntryHitRate)
        : null,
    }]));

    const paidSymbols = (this.project.theme.symbols || [])
      .filter(sym => Object.values(sym.payouts || {}).some(value => Number(value) > 0));
    const paidNonWild = paidSymbols
      .filter(symbol => !(symbol.special || []).includes('wild'))
      .sort((left, right) => {
        const leftValue = Number(left.payouts?.[m.grid.reels] || Math.max(0, ...Object.values(left.payouts || {}).map(Number)));
        const rightValue = Number(right.payouts?.[m.grid.reels] || Math.max(0, ...Object.values(right.payouts || {}).map(Number)));
        return leftValue - rightValue || left.name.localeCompare(right.name);
      });
    const symbolTiers = Object.fromEntries((this.project.theme.symbols || [])
      .map(symbol => [this.sdkSymbolName(symbol.name), symbol.tier || null]));
    const spawnedWildDefinition = (this.project.theme.symbols || []).find(symbol => (
      (symbol.special || []).includes('wild') && (symbol.special || []).includes('spawnOnly')
    )) || (this.project.theme.symbols || []).find(symbol => {
      const flags = symbol.special || [];
      return flags.includes('wild') && !flags.includes('expandingWild') && !flags.includes('maxWild') && !flags.includes('multiplier');
    });
    const spawnedWild = this.sdkSymbolName(spawnedWildDefinition?.name || m.specialSymbols?.wild?.[0] || 'W');
    const featureTiers = Object.fromEntries(Object.entries(m.featureArchitecture?.tiers || {})
      .map(([count, tier]) => [Number(count), tier]));
    const maxWildDefinition = (this.project.theme.symbols || []).find(symbol => (symbol.special || []).includes('maxWild'));
    const wincapSymbol = this.sdkSymbolName(maxWildDefinition?.name
      || paidSymbols.sort((a, b) => Number(b.payouts?.[m.grid.reels] || 0) - Number(a.payouts?.[m.grid.reels] || 0))[0]?.name
      || this.fallbackStrip()[0]);

    const lucidSupportValues = [...new Set((m.mechanicConfig?.multiplierSymbols?.approvedValueLadder || [])
      .map(Number).filter(value => Number.isFinite(value) && value > 0))];
    const multiplierSymbols = new Set(m.specialSymbols?.multiplier || []);
    const lucidSupportSymbol = (this.project.theme.symbols || []).find(symbol => multiplierSymbols.has(symbol.name));
    const lucidSupportName = this.sdkSymbolName(lucidSupportSymbol?.name || '');
    const lucidSupportReel = Math.max(0, (m.reelStrips?.BR || [])
      .findIndex(strip => (strip || []).some(symbol => this.sdkSymbolName(symbol) === lucidSupportName)));

    return `"""Auto-generated by StakeStudio — game configuration.

Regenerate from the StakeStudio project rather than hand-editing where possible;
hand edits are lost on the next export.
"""

import os

from src.config.config import Config
from src.config.distributions import Distribution
from src.config.config import BetMode


class GameConfig(Config):
    """${this.project.name} — ${winType} game."""

    def __init__(self):
        super().__init__()
        self.game_id = "${this.gameId()}"
        # NOTE: math-sdk's own template misspells this as \`provider_numer\`, which
        # silently leaves provider_number at its default. The correct name is below.
        self.provider_number = ${Number(se.providerNumber) || 0}
        self.provider_name = ${JSON.stringify(se.providerName || '')}
        self.game_name = ${JSON.stringify(se.gameName || this.project.name)}
        self.working_name = ${JSON.stringify(this.project.name)}
        self.min_denomination = ${Number(m.minDenomination) || 0.01}
        self.wincap = ${m.wincap}
        self.win_type = "${winType}"
        self.rtp = ${m.rtp}
        self.construct_paths()

        # Game Dimensions
        self.num_reels = ${m.grid.reels}
        self.num_rows = ${JSON.stringify(m.grid.rows)}
        self.initial_num_rows = list(self.num_rows)

        # Board and Symbol Properties
        self.paytable = {
${paytableRows.join('\n') || '            # no paid combinations defined in StakeStudio'}
        }
${winType === 'lines' ? `        self.paylines = ${this.py(resolvePaylines(m), 2)}\n` : ''}

        self.include_padding = False
        self.special_symbols = ${this.py(special, 2)}

        self.freespin_triggers = {
            self.basegame_type: ${this.pyIntKeyed(baseTrig)},
            self.freegame_type: ${this.pyIntKeyed(freeTrig)},
        }
        self.anticipation_triggers = {
            self.basegame_type: ${Math.max(0, (Object.keys(baseTrig).map(Number).sort((a, b) => a - b)[0] || 1) - 1)},
            self.freegame_type: ${Math.max(0, (Object.keys(freeTrig).map(Number).sort((a, b) => a - b)[0] || 1) - 1)},
        }

        # Executable mode profiles. These mirror StakeStudio's round resolver;
        # changing a mode in the editor changes both simulation and export.
        self.mode_profiles = ${this.py(profiles, 2)}
        self.sticky_reel_config = ${this.py(stickyReelConfig, 2)}
        self.wincap_symbol = ${JSON.stringify(wincapSymbol)}
        self.paid_symbols = ${this.py(paidNonWild.map(symbol => this.sdkSymbolName(symbol.name)), 2)}
        self.symbol_tiers = ${this.py(symbolTiers, 2)}
        self.spawned_wild = ${JSON.stringify(spawnedWild)}
        self.feature_tiers = ${this.py(featureTiers, 2)}
        # Publisher-only stratified support makes every approved rare multiplier
        # observable in the candidate corpus. Final rarity remains entirely LUT-
        # weighted and exact-RTP verified; ordinary runtime draws stay unchanged.
        self.stratified_support = os.getenv("STAKE_STUDIO_STRATIFIED_SUPPORT", "0").strip().lower() in {"1", "true", "yes", "on"}
        self.lucid_support_values = ${this.py(lucidSupportValues, 2)}
        self.lucid_support_symbol = ${JSON.stringify(lucidSupportName)}
        self.lucid_support_reel = ${lucidSupportReel}

        # Reels
        reels = ${this.py(reelFiles, 2)}
        self.reels = {}
        for r, f in reels.items():
            self.reels[r] = self.read_reels_csv(str.join("/", [self.reels_path, f]))

        self.bet_modes = [
${this.genBetModes()}
        ]
`;
  }

  /** freespin_triggers keys are scatter counts — ints, not strings. */
  pyIntKeyed(obj) {
    const entries = Object.entries(obj || {});
    if (!entries.length) return '{}';
    return `{${entries.map(([k, v]) => `${Number(k)}: ${v}`).join(', ')}}`;
  }

  pyNumberMap(obj, fallback = { 1: 1 }) {
    const entries = Object.entries(obj || {}).filter(([key, value]) => Number.isFinite(Number(key)) && Number.isFinite(Number(value)));
    const source = entries.length ? entries : Object.entries(fallback);
    return `{${source.map(([key, value]) => `${Number(key)}: ${Number(value)}`).join(', ')}}`;
  }

  genBetModes() {
    return this.modes().map(mode => {
      return `            BetMode(
                name="${mode.name}",
                cost=${Number(mode.cost) || 1.0},
                rtp=${mode.rtp ?? this.math.rtp},
                max_win=${mode.maxWin ?? this.math.wincap},
                auto_close_disabled=${mode.autoCloseDisabled ? 'True' : 'False'},
                is_feature=${mode.isFeature ? 'True' : 'False'},
                is_buybonus=${mode.isBuyBonus ? 'True' : 'False'},
                distributions=[
${this.genDistributions(mode)}
                ],
            ),`;
    }).join('\n');
  }

  /**
   * Quotas are the proportion of simulations drawn per criteria; they are a
   * starting point for the optimizer, not a final tuning.
   */
  genDistributions(mode) {
    const profile = mode.profile || {};
    const entry = profile.entry || (mode.isBuyBonus ? 'freeSpins' : 'base');
    const hasNaturalFreegame = entry === 'base'
      && profile.triggerFreeSpins !== false
      && Object.keys(this.math.freespinTriggers?.basegame || {}).length > 0;
    const isDirectFreegame = entry === 'freeSpins';
    const supportsZeroCriterion = !isDirectFreegame;
    const baseReel = `${profile.reelSet || 'BR'}0`;
    const freeReel = `${this.freeReelSet(profile)}0`;
    const scatterNames = new Set(this.math.specialSymbols?.scatter || []);
    const sourceStrips = this.math.reelStrips?.[profile.reelSet || 'BR'] || this.math.reelStrips?.BR || [];
    const scatterCapableReels = sourceStrips.filter(strip => (strip || []).some(symbol => scatterNames.has(symbol))).length;
    const scatterCounts = Object.keys(this.math.freespinTriggers?.basegame || {})
      .map(Number)
      .filter(count => Number.isFinite(count) && count <= scatterCapableReels);
    const scatterWeights = Object.fromEntries(scatterCounts.map(count => [count, 1]));
    const multiplierValues = this.math.mechanicConfig?.multiplierSymbols?.values || {};
    const multWeights = `{
                                    self.basegame_type: ${this.pyNumberMap(multiplierValues.basegame)},
                                    self.freegame_type: ${this.pyNumberMap(multiplierValues.freegame || multiplierValues.basegame)},
                                }`;
    const reelWeights = `{
                                    self.basegame_type: {"${baseReel}": 1},
                                    self.freegame_type: {"${freeReel}": 1},
                                }`;
    const conditions = (forceWincap, forceFreegame, weights = reelWeights) => `{
                            "reel_weights": ${weights},
                            "scatter_triggers": ${this.pyIntKeyed(scatterWeights)},
                            "mult_values": ${multWeights},
                            "force_wincap": ${forceWincap ? 'True' : 'False'},
                            "force_freegame": ${forceFreegame ? 'True' : 'False'},
                        }`;

    const blocks = [
      `                    Distribution(
                        criteria="wincap",
                        quota=0.001,
                        win_criteria=self.wincap,
                        conditions=${conditions(true, false)},
                    ),`,
    ];

    if (hasNaturalFreegame || isDirectFreegame) {
      blocks.push(`                    Distribution(
                        criteria="freegame",
                        quota=${isDirectFreegame ? 0.999 : 0.099},
                        conditions=${conditions(false, true)},
                    ),`);
    }

    if (supportsZeroCriterion) blocks.push(`                    Distribution(
                        criteria="0",
                        quota=${hasNaturalFreegame ? 0.4 : 0.45},
                        win_criteria=0.0,
                        conditions=${conditions(false, false, `{self.basegame_type: {"${baseReel}": 1}, self.freegame_type: {"${freeReel}": 1}}`)},
                    ),`);

    if (!isDirectFreegame) blocks.push(`                    Distribution(
                        criteria="basegame",
                        quota=${hasNaturalFreegame ? 0.5 : 0.549},
                        conditions=${conditions(false, false, `{self.basegame_type: {"${baseReel}": 1}, self.freegame_type: {"${freeReel}": 1}}`)},
                    ),`);

    return blocks.join('\n');
  }

  // --- the remaining seven files ---

  genGameState() {
    return `"""Handles the state and output for a single simulation round."""

from game_events import add_feature_event, board_transform_event, fs_trigger_event, reveal_event
from game_override import GameStateOverride
from src.events.events import set_total_event, set_win_event, win_info_event


class GameState(GameStateOverride):
    """Handle all game-logic and event updates for a given simulation number."""

    def run_spin(self, sim, simulation_seed=None):
        self.reset_seed(sim, simulation_seed)
        # The official SDK locks force keys after every multiprocessing batch.
        # Each child receives that locked tuple on the next batch, so reopen its
        # local collector exactly once before the child begins recording books.
        if getattr(self, "num_sims", 0) and sim % self.num_sims == 0:
            self.get_current_betmode().set_force_keys()
        self.repeat = True
        while self.repeat:
            self.reset_book()
            profile = self.config.mode_profiles[self.betmode]
            entry = profile["entry"]
            self.sticky_reels = {}
            self.temporary_reels = {}
            self.feature_tier = None
            self.guaranteed_sticky_spin = None
            self.guaranteed_sticky_reel = None
            self.ordinary_cap_triggered = False
            self.initialize_feature_architecture(
                profile.get("feature_tier"),
                profile.get("position_grid_mode", False),
                profile.get("grid_mode_id"),
                profile.get("position_grid_aggregation", "additive-excess-v1"),
                profile.get("position_grid_maximum", 1024),
            )

            lucid_support_value = self.lucid_support_value_for_sim()
            if self.criteria == "wincap":
                self.run_forced_wincap(profile)
            elif lucid_support_value is not None:
                self.run_lucid_support_spin(profile, lucid_support_value)
                self.win_manager.update_gametype_wins(self.gametype)
            elif entry == "freeSpins":
                self.start_direct_freegame(profile)
            else:
                self.global_multiplier = profile["multiplier_start"]
                self.play_profile_spin(profile, profile["multiplier"])
                self.win_manager.update_gametype_wins(self.gametype)
                if (not self.ordinary_cap_triggered and profile["trigger_free_spins"]
                        and self.has_freespin_trigger() and self.check_freespin_entry()):
                    self.initialize_feature_architecture(self.feature_tier_from_scatter())
                    self.run_freespin_from_base()

            self.evaluate_finalwin()
            self.check_repeat()

        self.imprint_wins()

    def run_freespin(self):
        profile = self.config.mode_profiles[self.betmode]
        self.reset_fs_spin()
        self.global_multiplier = profile["multiplier_start"]
        if profile["sticky_reel_multipliers"]:
            if self.feature_tier is None:
                self.feature_tier = self.sticky_tier_from_free_spins(self.tot_fs)
            self.initialize_sticky_feature()
        while self.fs < self.tot_fs and not self.wincap_triggered and not self.ordinary_cap_triggered:
            self.update_freespin()
            if not profile["persist_multiplier_bonus"]:
                self.global_multiplier = profile["multiplier_start"]
            self.dreamfall_tumble_hit = 0
            self.play_profile_spin(profile, profile["free_multiplier"])
            self.win_manager.update_gametype_wins(self.gametype)
            if profile["retriggers"] and self.has_freespin_trigger():
                self.update_fs_retrigger_amt()

        self.end_freespin()

    def has_freespin_trigger(self):
        return bool(self.config.freespin_triggers[self.gametype]) and self.check_fs_condition()

    def lucid_support_value_for_sim(self):
        values = self.config.lucid_support_values
        if not self.config.stratified_support or self.criteria != "basegame" or not values:
            return None
        slot = self.sim % 1000
        return values[slot] if slot < len(values) else None

    def run_lucid_support_spin(self, profile, value):
        """Create a valid low-frequency candidate book for an approved Lucid value."""
        paying = list(self.config.paid_symbols)
        if not paying or not self.config.lucid_support_symbol:
            raise RuntimeError("Lucid support requires a multiplier symbol and paying symbols.")
        primary = paying[0]
        fillers = paying[1:] or paying
        self.board = [
            [self.create_symbol(fillers[(reel + row) % len(fillers)]) for row in range(self.config.num_rows[reel])]
            for reel in range(self.config.num_reels)
        ]
        for reel in range(self.config.num_reels):
            self.board[reel][0] = self.create_symbol(primary)
        source_reel = min(self.config.lucid_support_reel, self.config.num_reels - 1)
        lucid = self.create_symbol(self.config.lucid_support_symbol)
        lucid.multiplier = int(value)
        self.board[source_reel][0] = lucid
        self.reel_positions = [0] * self.config.num_reels
        self.anticipation = [0] * self.config.num_reels
        self.get_special_symbols_on_board()
        self.prepare_feature_board()
        reveal_event(self)
        self.evaluate_profile_board(profile["multiplier"] * self.global_multiplier, profile)
        if profile["cascades"]:
            self.emit_tumble_win_events()
        else:
            self.emit_profile_win_events()
        self.advance_feature_after_settled_win(profile)
        if profile["cascades"]:
            self.set_end_tumble_event()

    def draw_profile_board(self, profile):
        self.draw_boosted_profile_board(profile)
        self.apply_persistent_feature_upgrades()
        self.remove_dreamfall_scatters_from_board()
        # Mode-scoped instruments exist before the symbols land. Board-changing
        # specials remain post-settlement reactions.
        self.prepare_feature_board()
        reveal_event(self)
        self.emit_profile_board_selection(profile)

    def apply_expanding_wilds(self):
        for reel, symbols in enumerate(self.board):
            expanding_row = next((row for row, symbol in enumerate(symbols) if symbol.check_attribute("expandingWild")), None)
            if expanding_row is not None:
                wild = symbols[expanding_row]
                positions = []
                changes = []
                stopped_by = None
                for row, symbol in enumerate(symbols):
                    if row < expanding_row:
                        continue
                    if row > expanding_row and bool(symbol.defn.special_flags):
                        stopped_by = {"position": {"reel": reel, "row": row}, "symbol": symbol.name}
                        break
                    positions.append({"reel": reel, "row": row})
                    previous = self.replace_feature_symbol(reel, row, wild.name)
                    changes.append({"reel": reel, "row": row, "from": previous, "to": wild.name})
                add_feature_event(self, "expandingWild", source=wild.name,
                    sources=[{"reel": reel, "row": expanding_row}], positions=positions,
                    stoppedBy=stopped_by)
                board_transform_event(self, changes)
        self.get_special_symbols_on_board()

    def play_profile_spin(self, profile, mode_multiplier):
        self.draw_profile_board(profile)
        if profile["sticky_reel_multipliers"]:
            self.prepare_sticky_reels(profile)
        self.evaluate_profile_board(mode_multiplier * self.global_multiplier, profile)
        if not profile["cascades"]:
            self.emit_profile_win_events()
            self.advance_feature_after_settled_win(profile)
            if profile["sticky_reel_multipliers"]:
                self.clear_temporary_reels()
            return

        self.emit_tumble_win_events()
        self.advance_feature_after_settled_win(profile)
        cascade_count = 0
        while (
            self.win_data["totalWin"] > 0
            and not self.wincap_triggered
            and not self.ordinary_cap_triggered
            and cascade_count < profile["max_cascades"]
        ):
            self.tumble_game_board()
            self.apply_feature_expansions()
            upgrade_changes = self.apply_persistent_feature_upgrades()
            if upgrade_changes:
                add_feature_event(self, "symbolUpgradeApply", positions=[
                    {"reel": change["reel"], "row": change["row"]} for change in upgrade_changes
                ])
                board_transform_event(self, upgrade_changes)
            self.prepare_feature_board()
            cascade_count += 1
            if profile["increasing_multiplier"]:
                self.advance_profile_multiplier(profile)
            self.evaluate_profile_board(mode_multiplier * self.global_multiplier, profile)
            self.emit_tumble_win_events()
            self.advance_feature_after_settled_win(profile)
        self.set_end_tumble_event()
        if profile["sticky_reel_multipliers"]:
            self.clear_temporary_reels()

    def start_direct_freegame(self, profile):
        architecture = self.feature_architecture_rule()
        if architecture:
            self.tot_fs = int(architecture.get("spins", profile["free_spins"]))
        elif profile["sticky_reel_multipliers"]:
            self.feature_tier = self.choose_direct_sticky_tier(profile)
            self.tot_fs = self.sticky_tier_rule()["freeSpins"]
        else:
            self.tot_fs = profile["free_spins"]
        self.special_syms_on_board = {key: [] for key in self.config.special_symbols}
        fs_trigger_event(self, basegame_trigger=True, freegame_trigger=False, include_padding_index=False)
        self.emit_feature_tier_start()
        self.run_freespin()

    def draw_wincap_board(self):
        self.board = [
            [self.create_symbol(self.config.wincap_symbol) for _ in range(self.config.num_rows[reel])]
            for reel in range(self.config.num_reels)
        ]
        self.reel_positions = [0] * self.config.num_reels
        self.anticipation = [0] * self.config.num_reels
        self.get_special_symbols_on_board()
        reveal_event(self)

    def run_forced_wincap(self, profile):
        entry = profile["entry"]
        if entry == "freeSpins":
            architecture = self.feature_architecture_rule()
            self.tot_fs = int(architecture.get("spins", profile["free_spins"])) if architecture else profile["free_spins"]
            self.special_syms_on_board = {key: [] for key in self.config.special_symbols}
            fs_trigger_event(self, basegame_trigger=True, freegame_trigger=False, include_padding_index=False)
            self.emit_feature_tier_start()
            self.reset_fs_spin()
            self.update_freespin()
            self.draw_wincap_board()
            self.emit_forced_wincap()
            self.win_manager.update_gametype_wins(self.gametype)
            self.end_freespin()
            return

        self.draw_wincap_board()
        self.emit_forced_wincap()
        self.win_manager.update_gametype_wins(self.gametype)

    def emit_forced_wincap(self):
        positions = [
            {"reel": reel, "row": row}
            for reel in range(self.config.num_reels)
            for row in range(self.config.num_rows[reel])
        ]
        self.win_data = {
            "totalWin": self.config.wincap,
            "wins": [{
                "symbol": self.config.wincap_symbol,
                "kind": len(positions),
                "clusterSize": len(positions),
                "win": self.config.wincap,
                "positions": positions,
                "meta": {"ways": 1, "globalMult": 1, "winWithoutMult": self.config.wincap},
            }],
        }
        self.win_manager.update_spinwin(self.config.wincap)
        add_feature_event(self, "maxDream", sources=positions, positions=positions,
            multiplier=self.config.wincap)
        win_info_event(self, include_padding_index=self.config.include_padding)
        self.evaluate_wincap()
        set_win_event(self)
        set_total_event(self)
`;
  }

  genGameOverride() {
    const mult = this.math.specialSymbols?.multiplier || [];
    const wild = this.math.specialSymbols?.wild || [];
    const withMult = [...new Set(mult.length
      ? mult
      : (this.math.bonusMechanics?.includes('multiplierSymbols') ? wild : []))]
      .map(name => this.sdkSymbolName(name));

    return `from game_executables import GameExecutables
from src.calculations.statistics import get_random_outcome


class GameStateOverride(GameExecutables):
    """Override or extend universal state.py functions for this game."""

    def reset_book(self):
        """Reset game-specific properties."""
        super().reset_book()

    def assign_special_sym_function(self):
        self.special_symbol_functions = {
${withMult.length
  ? withMult.map(s => `            "${s}": [self.assign_mult_property],`).join('\n')
  : '            # no multiplier-bearing symbols configured in StakeStudio'}
        }

    def assign_mult_property(self, symbol):
        multiplier_value = get_random_outcome(
            self.get_current_distribution_conditions()["mult_values"][self.gametype]
        )
        symbol.multiplier = multiplier_value

    def check_game_repeat(self):
        if self.repeat == False:
            win_criteria = self.get_current_betmode_distributions().get_win_criteria()
            if win_criteria is not None and self.final_win != win_criteria:
                self.repeat = True
`;
  }

  genGameExecutables() {
    const winType = getExecutableWinType(this.math.gameType);
    const calculation = {
      ways: {
        import: 'from src.calculations.ways import Ways',
        evaluate: `        if profile["sticky_reel_multipliers"]:
            self.win_data = Ways.get_ways_data(self.config, self.board)
            self.apply_sticky_reel_win_multipliers(multiplier)
        elif profile["symbol_multipliers"]:
            self.win_data = Ways.get_ways_data(
                self.config, self.board, multiplier_strategy="symbol"
            )
            self.scale_win_data(multiplier)
        else:
            self.win_data = Ways.get_ways_data(
                self.config, self.board, global_multiplier=multiplier,
                multiplier_strategy="global",
            )`,
        record: 'Ways.record_ways_wins(self)',
      },
      lines: {
        import: 'from src.calculations.lines import Lines',
        evaluate: `        strategy = "combined" if profile["symbol_multipliers"] else "global"
        self.win_data = Lines.get_lines(
            self.board, self.config, multiplier_method=strategy,
            global_multiplier=multiplier,
        )`,
        record: 'Lines.record_lines_wins(self)',
      },
      cluster: {
        import: 'from src.calculations.cluster import Cluster',
        evaluate: `        self.win_data = Cluster.get_cluster_data(
            self.config, self.board, global_multiplier=multiplier
        )`,
        record: 'Cluster.record_cluster_wins(self)',
      },
      scatter: {
        import: 'from src.calculations.scatter import Scatter',
        evaluate: `        self.win_data = Scatter.get_scatterpay_wins(
            self.config, self.board, global_multiplier=multiplier
        )`,
        record: 'Scatter.record_scatter_wins(self)',
      },
    }[winType];

    return `import math
import random

from game_calculations import GameCalculations
from game_events import add_feature_event, board_transform_event, clear_temporary_reels_event, expand_sticky_reel_event, fs_trigger_event, upgrade_sticky_reel_event
from src.calculations.statistics import get_random_outcome
${calculation.import}
from src.events.events import set_total_event, set_win_event, tumble_board_event, update_global_mult_event, update_tumble_win_event, win_info_event


class GameExecutables(GameCalculations):

    def awarded_free_spins(self, scatter_key="scatter"):
        count = self.count_special_symbols(scatter_key)
        table = self.config.freespin_triggers[self.gametype]
        thresholds = sorted((int(value) for value in table.keys()), reverse=True)
        threshold = next((value for value in thresholds if count >= value), None)
        return int(table[threshold]) if threshold is not None else 0

    def update_freespin_amount(self, scatter_key="scatter"):
        self.tot_fs = self.awarded_free_spins(scatter_key)
        fs_trigger_event(
            self,
            include_padding_index=self.config.include_padding,
            basegame_trigger=self.gametype == self.config.basegame_type,
            freegame_trigger=self.gametype != self.config.basegame_type,
        )
        self.emit_feature_tier_start()

    def update_fs_retrigger_amt(self, scatter_key="scatter"):
        self.tot_fs += self.awarded_free_spins(scatter_key)
        fs_trigger_event(
            self,
            include_padding_index=self.config.include_padding,
            freegame_trigger=True,
            basegame_trigger=False,
        )

    def emit_tumble_win_events(self):
        """Keep win positions on the same zero-based grid as reveal and tumble events."""
        if self.win_data["totalWin"] > 0:
            win_info_event(self, include_padding_index=self.config.include_padding)
            update_tumble_win_event(self)
            self.evaluate_wincap()

    def draw_boosted_profile_board(self, profile):
        scatter_boost = max(1.0, float(profile.get("scatter_weight_multiplier", 1)))
        special_boost = max(1.0, float(profile.get("special_symbol_boost", 1)))
        candidate_count = min(16, max(1, int(math.ceil(max(scatter_boost, special_boost)))))

        def draw_once():
            if self.config.freespin_triggers[self.gametype]:
                self.draw_board(emit_event=False)
            else:
                self.create_board_reelstrips()

        if candidate_count == 1:
            draw_once()
            return

        candidates = []
        weights = []
        for _ in range(candidate_count):
            draw_once()
            names = [[symbol.name for symbol in reel] for reel in self.board]
            scatter_count = sum(symbol.check_attribute("scatter") for reel in self.board for symbol in reel)
            special_count = sum(
                bool(symbol.defn.special_flags)
                and not symbol.check_attribute("scatter")
                and not symbol.check_attribute("spawnOnly")
                and not symbol.check_attribute("maxWild")
                for reel in self.board for symbol in reel
            )
            candidates.append({
                "board": names,
                "reelstrip_id": self.reelstrip_id,
                "reel_positions": list(self.reel_positions),
                "anticipation": list(self.anticipation),
            })
            weights.append((scatter_boost ** scatter_count) * (special_boost ** special_count))

        selected = random.choices(candidates, weights=weights, k=1)[0]
        self.reelstrip_id = selected["reelstrip_id"]
        self.reelstrip = self.config.reels[self.reelstrip_id]
        self.reel_positions = selected["reel_positions"]
        self.anticipation = selected["anticipation"]
        self.board = [
            [self.create_symbol(name) for name in reel]
            for reel in selected["board"]
        ]
        self.get_special_symbols_on_board()

    def emit_profile_board_selection(self, profile):
        scatter_boost = max(1.0, float(profile.get("scatter_weight_multiplier", 1)))
        special_boost = max(1.0, float(profile.get("special_symbol_boost", 1)))
        candidate_count = min(16, max(1, int(math.ceil(max(scatter_boost, special_boost)))))
        if candidate_count <= 1:
            return
        if scatter_boost > 1 and special_boost > 1:
            kind = "scatterAndSpecial"
        elif scatter_boost > 1:
            kind = "scatter"
        else:
            kind = "special"
        positions = []
        for reel, symbols in enumerate(self.board):
            for row, symbol in enumerate(symbols):
                is_scatter = symbol.check_attribute("scatter")
                is_special = bool(symbol.defn.special_flags) and not is_scatter and not symbol.check_attribute("spawnOnly")
                if (kind != "special" and is_scatter) or (kind != "scatter" and is_special):
                    positions.append({"reel": reel, "row": row})
        if not positions and self.board:
            reel = max(0, (len(self.board) - 1) // 2)
            positions = [{"reel": reel, "row": max(0, (len(self.board[reel]) - 1) // 2)}]
        add_feature_event(
            self,
            "modeBoardSelection",
            kind=kind,
            candidateCount=candidate_count,
            multiplier=max(scatter_boost, special_boost),
            fromMoon=True,
            sources=[],
            positions=positions,
        )

    def initialize_feature_architecture(self, requested_tier=None, position_grid_mode=False, grid_mode_id=None,
            position_grid_aggregation="additive-excess-v1", position_grid_maximum=1024):
        self.config.num_rows = list(self.config.initial_num_rows)
        self.architecture_tier = requested_tier
        self.position_grid_mode = bool(position_grid_mode)
        self.grid_mode_id = grid_mode_id or ("trickster_dream" if self.position_grid_mode else "oneiric_nexus")
        self.position_grid_aggregation = position_grid_aggregation
        self.position_grid_maximum = max(1, int(position_grid_maximum))
        if self.position_grid_mode and self.position_grid_aggregation != "additive-excess-v1":
            raise RuntimeError(f"Unsupported position-grid aggregation: {self.position_grid_aggregation}")
        self.feature_upgrade_meter = 0
        self.feature_upgrade_count = 0
        self.feature_symbol_upgrades = {}
        self.feature_symbol_multipliers = {}
        self.feature_multiplier_grid = [
            [1 for _ in range(rows)] for rows in self.config.num_rows
        ]
        self.feature_reel_rows = list(self.config.num_rows)
        self.feature_expansions = []
        self.dreamfall_tumble_hit = 0
        self.dreamfall_total_awarded = 0
        self.feature_grid_started = False
        self.feature_accounting_identities = {}
        self.dawn_purge_positions = []

    def feature_architecture_rule(self):
        if self.position_grid_mode:
            return {"id": self.grid_mode_id, "mechanic": "persistentPositionMultiplierGrid"}
        if not self.architecture_tier:
            return None
        for rule in self.config.feature_tiers.values():
            if rule.get("id") == self.architecture_tier or rule.get("name") == self.architecture_tier:
                return rule
        return None

    def feature_tier_from_scatter(self):
        count = self.count_special_symbols("scatter")
        selected = None
        for threshold, rule in sorted(
            ((int(key), value) for key, value in self.config.feature_tiers.items()),
            key=lambda item: item[0],
        ):
            if count >= threshold:
                selected = rule.get("id")
        return selected

    def emit_feature_tier_start(self):
        rule = self.feature_architecture_rule()
        if not rule:
            return
        board_ready = bool(self.board) and all(
            hasattr(symbol, "check_attribute")
            for reel in self.board for symbol in reel
        )
        positions = self.feature_positions("scatter") if board_ready else []
        add_feature_event(
            self,
            "dreamTierStart",
            tierId=rule.get("id"),
            tierName=rule.get("name", rule.get("id", "Dream Feature")),
            mechanic=rule.get("mechanic"),
            totalFs=int(self.tot_fs),
            sources=positions,
            positions=positions,
        )

    def choose_paid_symbol(self, names=None):
        choices = names if names is not None else self.config.paid_symbols
        return random.choice(choices) if choices else None

    def board_has_flag(self, flag):
        return any(symbol.check_attribute(flag) for reel in self.board for symbol in reel)

    def feature_positions(self, flag):
        return [
            {"reel": reel, "row": row}
            for reel, symbols in enumerate(self.board)
            for row, symbol in enumerate(symbols)
            if symbol.check_attribute(flag)
        ]

    def apply_persistent_feature_upgrades(self):
        changes = []
        for reel, symbols in enumerate(self.board):
            for row, symbol in enumerate(symbols):
                upgraded = self.feature_symbol_upgrades.get(symbol.name)
                if upgraded:
                    changes.append({"reel": reel, "row": row, "from": symbol.name, "to": upgraded})
                    self.board[reel][row] = self.create_symbol(upgraded)
        return changes

    def replace_feature_symbol(self, reel, row, name):
        previous = self.board[reel][row]
        replacement = self.create_symbol(name)
        replacement.explode = bool(getattr(previous, "explode", False))
        self.board[reel][row] = replacement
        return previous.name

    def prepare_feature_board(self):
        rule = self.feature_architecture_rule() or {}
        if rule.get("mechanic") == "persistentPositionMultiplierGrid" and not self.feature_grid_started:
            self.feature_grid_started = True
            add_feature_event(self, "modeGridStart", mode=self.grid_mode_id, cells=[
                {"position": {"reel": reel, "row": row}, "value": value}
                for reel, column in enumerate(self.feature_multiplier_grid)
                for row, value in enumerate(column)
            ])

    def resolve_post_settlement_specials(self):

        mystery_positions = self.feature_positions("mystery")
        if mystery_positions:
            target = self.choose_paid_symbol()
            if target:
                changes = []
                accounting_identities = []
                for position in mystery_positions:
                    source = self.replace_feature_symbol(position["reel"], position["row"], target)
                    key = (int(position["reel"]), int(position["row"]))
                    identity = {"position": position, "originalIdentity": "MYSTERY_VEIL",
                        "revealedFamily": target}
                    self.feature_accounting_identities[key] = identity
                    accounting_identities.append(identity)
                    changes.append({**position, "from": source, "to": target})
                add_feature_event(self, "mysteryTransform", target=target,
                    revealedAs=target, originalIdentity="MYSTERY_VEIL",
                    originalPositions=mystery_positions, accountingIdentities=accounting_identities,
                    sources=mystery_positions, positions=mystery_positions)
                board_transform_event(self, changes)

        bombs = []
        for reel, symbols in enumerate(self.board):
            for row, symbol in enumerate(symbols):
                if symbol.check_attribute("goldWildBomb"):
                    bombs.append((reel, row, 3, symbol.name))
                elif symbol.check_attribute("wildBomb"):
                    bombs.append((reel, row, 2, symbol.name))
        for source_reel, source_row, size, source in bombs:
            positions = []
            changes = []
            for reel in range(source_reel, min(len(self.board), source_reel + size)):
                for row in range(source_row, min(len(self.board[reel]), source_row + size)):
                    previous = self.replace_feature_symbol(reel, row, self.config.spawned_wild)
                    positions.append({"reel": reel, "row": row})
                    changes.append({"reel": reel, "row": row, "from": previous, "to": self.config.spawned_wild})
            add_feature_event(self, "wildBomb", source=source,
                sources=[{"reel": source_reel, "row": source_row}], size=size, positions=positions)
            board_transform_event(self, changes)

        star_sources = self.feature_positions("wildStar")
        if star_sources:
            present = [
                name for name in self.config.paid_symbols
                if any(symbol.name == name for reel in self.board for symbol in reel)
            ]
            target = self.choose_paid_symbol(present)
            positions = []
            changes = []
            if target:
                add_feature_event(self, "specialTargetSelected",
                    special="ONEIRIC_STAR", target=target, targetFamily=target,
                    sources=star_sources, positions=star_sources)
                for reel, symbols in enumerate(self.board):
                    for row, symbol in enumerate(symbols):
                        if symbol.name == target or symbol.check_attribute("wildStar"):
                            previous = self.replace_feature_symbol(reel, row, self.config.spawned_wild)
                            changes.append({"reel": reel, "row": row, "from": previous, "to": self.config.spawned_wild})
                            positions.append({"reel": reel, "row": row})
                add_feature_event(self, "specialPositionsResolved",
                    special="ONEIRIC_STAR", target=target, targetFamily=target,
                    sources=star_sources, positions=positions)
                board_transform_event(self, changes)

        self.get_special_symbols_on_board()

    def apply_feature_win_multipliers(self):
        rule = self.feature_architecture_rule() or {}
        total = 0
        for win in self.win_data["wins"]:
            positions = {
                (int(position["reel"]), int(position["row"]))
                for position in win.get("positions", [])
            }
            multiplier_wild_positions = []
            multiplier_wild_values = []
            for reel, row in sorted(positions):
                symbol = self.board[reel][row]
                if symbol.check_attribute("multiplier"):
                    multiplier_wild_positions.append({"reel": reel, "row": row})
                    multiplier_wild_values.append(max(1, int(getattr(symbol, "multiplier", 1))))
            multiplier_wild = sum(multiplier_wild_values) if multiplier_wild_values else 1
            split_sources = [
                {"reel": reel, "row": row}
                for reel, row in sorted(positions)
                if self.board[reel][row].check_attribute("split")
            ]
            split_multiplier = 2 ** len(split_sources)
            ways_before = max(1, int(win.get("meta", {}).get("ways", win.get("ways", 1))))
            persistent_symbol = 1
            if rule.get("mechanic") == "persistentSymbolMultipliers":
                persistent_symbol = max(1, int(self.feature_symbol_multipliers.get(win.get("symbol"), 1)))
            position_multiplier = 1
            if rule.get("mechanic") == "persistentPositionMultiplierGrid":
                position_multiplier = 1 + sum(
                    max(0, int(self.feature_multiplier_grid[reel][row]) - 1)
                    for reel, row in positions
                    if reel < len(self.feature_multiplier_grid) and row < len(self.feature_multiplier_grid[reel])
                )
            multiplier = multiplier_wild * split_multiplier * persistent_symbol * position_multiplier
            win["win"] *= multiplier
            win.setdefault("meta", {})["multiplierWild"] = multiplier_wild
            win["meta"]["multiplierWildValues"] = multiplier_wild_values
            win["meta"]["multiplierWildPositions"] = multiplier_wild_positions
            win.setdefault("meta", {})["splitMultiplier"] = split_multiplier
            win["meta"]["splitPositions"] = split_sources
            win["meta"]["waysBeforeSplit"] = ways_before
            win["meta"]["waysAfterSplit"] = ways_before * split_multiplier
            win["meta"]["persistentSymbolMultiplier"] = persistent_symbol
            win["meta"]["positionMultiplier"] = position_multiplier
            total += win["win"]
            if multiplier_wild > 1:
                add_feature_event(self, "lucidWildMultiplier", multiplier=multiplier_wild,
                    sources=multiplier_wild_positions, positions=win.get("positions", []))
            if split_multiplier > 1:
                add_feature_event(self, "echoSplit", symbolFamily=win.get("symbol"),
                    multiplier=split_multiplier, waysBefore=ways_before,
                    waysAfter=ways_before * split_multiplier,
                    sources=split_sources, positions=win.get("positions", []))
        self.win_data["totalWin"] = total

    def apply_current_feature_win_step(self):
        wins = self.win_data["wins"]
        unique_positions = {
            (int(position["reel"]), int(position["row"]))
            for win in wins for position in win.get("positions", [])
        }
        max_wild = any(
            self.board[reel][row].check_attribute("maxWild")
            for reel, row in unique_positions
        )
        if max_wild and wins:
            remaining = max(0, self.config.wincap - self.win_manager.spin_win)
            for win in wins:
                win["win"] = 0
            wins[0]["win"] = remaining
            wins[0].setdefault("meta", {})["maxWildTriggered"] = True
            self.win_data["totalWin"] = remaining
            max_sources = [
                {"reel": reel, "row": row} for reel, row in sorted(unique_positions)
                if self.board[reel][row].check_attribute("maxWild")
            ]
            add_feature_event(self, "maxDream", sources=max_sources,
                positions=wins[0].get("positions", []), multiplier=self.config.wincap)

    def advance_feature_after_settled_win(self, profile):
        if self.win_data["totalWin"] <= 0 or not self.win_data["wins"] or self.wincap_triggered:
            return
        self.resolve_post_settlement_specials()
        if profile["expanding_wilds"]:
            self.apply_expanding_wilds()
        rule = self.feature_architecture_rule() or {}
        wins = self.win_data["wins"]
        unique_positions = {
            (int(position["reel"]), int(position["row"]))
            for win in wins for position in win.get("positions", [])
        }

        purge_sources = self.feature_positions("royalRemover")
        self.dawn_purge_positions = []
        if purge_sources:
            self.dawn_purge_positions = [
                {"reel": reel, "row": row}
                for reel, symbols in enumerate(self.board)
                for row, symbol in enumerate(symbols)
                if self.config.symbol_tiers.get(symbol.name) == "low" or symbol.check_attribute("royalRemover")
            ]
            add_feature_event(self, "symbolPurge", sources=purge_sources,
                positions=self.dawn_purge_positions, emptyPositions=self.dawn_purge_positions,
                refillExcludesTiers=["low"])

        if rule.get("mechanic") == "progressiveSymbolUpgrade":
            threshold = max(1, int(rule.get("meterThreshold", 4)))
            maximum = max(1, int(rule.get("maximumUpgrades", 4)))
            hits_by_family = {}
            for win in wins:
                family = win.get("symbol")
                if not family:
                    continue
                hits_by_family.setdefault(family, set()).update(
                    (int(position["reel"]), int(position["row"]))
                    for position in win.get("positions", [])
                )
            for family, family_hits in sorted(hits_by_family.items()):
                hits = [{"reel": reel, "row": row} for reel, row in sorted(family_hits)]
                previous_meter = self.feature_upgrade_meter
                self.feature_upgrade_meter += len(hits)
                add_feature_event(self, "symbolBarProgress", symbolFamily=family,
                    hits=hits, previous=previous_meter, gained=len(hits),
                    current=min(threshold, self.feature_upgrade_meter), threshold=threshold,
                    upgradeCount=self.feature_upgrade_count, maximumUpgrades=maximum,
                    accountingIdentities=[
                        self.feature_accounting_identities[(hit["reel"], hit["row"])]
                        for hit in hits if (hit["reel"], hit["row"]) in self.feature_accounting_identities
                    ])
            while self.feature_upgrade_meter >= threshold and self.feature_upgrade_count < maximum:
                self.feature_upgrade_meter -= threshold
                active = [self.feature_symbol_upgrades.get(name, name) for name in self.config.paid_symbols]
                source = next((name for name in self.config.paid_symbols if name in active), None)
                if not source:
                    break
                index = self.config.paid_symbols.index(source)
                if index + 1 >= len(self.config.paid_symbols):
                    break
                target = random.choice(self.config.paid_symbols[index + 1:])
                for name in self.config.paid_symbols:
                    if self.feature_symbol_upgrades.get(name, name) == source:
                        self.feature_symbol_upgrades[name] = target
                self.feature_symbol_upgrades[source] = target
                self.feature_upgrade_count += 1
                add_feature_event(self, "symbolUpgrade", source=source, target=target,
                    fromFamily=source, toFamily=target,
                    upgradeCount=self.feature_upgrade_count, maximumUpgrades=maximum,
                    meterCurrent=self.feature_upgrade_meter, meterThreshold=threshold)

        if rule.get("mechanic") == "persistentSymbolMultipliers":
            for symbol in sorted({win.get("symbol") for win in wins if win.get("symbol")}):
                if symbol in self.config.special_symbols.get("wild", []):
                    continue
                previous = max(1, int(self.feature_symbol_multipliers.get(symbol, 1)))
                multiplier = min(1000, previous * 2)
                self.feature_symbol_multipliers[symbol] = multiplier
                add_feature_event(self, "symbolMultiplierUpdate", symbol=symbol,
                    symbolFamily=symbol, previous=previous, multiplier=multiplier,
                    current=multiplier)

        if rule.get("mechanic") == "persistentPositionMultiplierGrid":
            for reel, row in sorted(unique_positions):
                while row >= len(self.feature_multiplier_grid[reel]):
                    self.feature_multiplier_grid[reel].insert(0, 1)
                previous = max(1, int(self.feature_multiplier_grid[reel][row]))
                multiplier = min(self.position_grid_maximum, previous * 2)
                self.feature_multiplier_grid[reel][row] = multiplier
                update = {"reel": reel, "row": row, "previous": previous,
                    "multiplier": multiplier, "current": multiplier}
                add_feature_event(self, "positionMultiplierGridUpdate",
                    position={"reel": reel, "row": row}, previous=previous,
                    current=multiplier, multiplier=multiplier, updates=[update])

        self.feature_expansions = []
        if rule.get("mechanic") == "winningCascadeReelExpansion":
            maximum_rows = max(4, int(rule.get("maximumRows", 8)))
            for _ in wins:
                candidates = [reel for reel, rows in enumerate(self.feature_reel_rows) if rows < maximum_rows]
                if not candidates:
                    break
                reel = random.choice(candidates)
                self.feature_reel_rows[reel] += 1
                self.feature_expansions.append(reel)
                add_feature_event(self, "expandReelHeight", reel=reel,
                    rows=self.feature_reel_rows[reel], maximumRows=maximum_rows)
            self.dreamfall_tumble_hit += 1
            add_feature_event(self, "tumbleChainProgress",
                chainHit=self.dreamfall_tumble_hit, threshold=5)
            if self.dreamfall_tumble_hit >= 5:
                self.tot_fs += 1
                self.dreamfall_total_awarded += 1
                add_feature_event(self, "awardTumbleFreeSpins",
                    chainHit=self.dreamfall_tumble_hit, amount=1,
                    totalAwarded=self.dreamfall_total_awarded,
                    freeSpinsRemaining=max(0, self.tot_fs - self.fs))

    def dreamfall_refill_symbol(self, reel):
        scatters = set(self.config.special_symbols.get("scatter", []))
        allowed = [name for name in self.reelstrip[reel] if name not in scatters]
        if not allowed:
            raise RuntimeError(f"Dreamfall reel {reel + 1} has no scatter-free refill symbols")
        return self.create_symbol(random.choice(allowed))

    def remove_dreamfall_scatters_from_board(self):
        rule = self.feature_architecture_rule() or {}
        if rule.get("mechanic") != "winningCascadeReelExpansion":
            return
        scatters = set(self.config.special_symbols.get("scatter", []))
        for reel, symbols in enumerate(self.board):
            for row, symbol in enumerate(symbols):
                if symbol.name in scatters:
                    self.board[reel][row] = self.dreamfall_refill_symbol(reel)

    def tumble_game_board(self):
        for position in self.dawn_purge_positions:
            self.board[position["reel"]][position["row"]].explode = True
        self.tumble_board()
        rule = self.feature_architecture_rule() or {}
        if rule.get("mechanic") == "winningCascadeReelExpansion":
            scatters = set(self.config.special_symbols.get("scatter", []))
            for reel, incoming in enumerate(self.new_symbols_from_tumble):
                for index, symbol in enumerate(incoming):
                    if symbol.name not in scatters:
                        continue
                    replacement = self.dreamfall_refill_symbol(reel)
                    for row, board_symbol in enumerate(self.board[reel]):
                        if board_symbol is symbol:
                            self.board[reel][row] = replacement
                            break
                    incoming[index] = replacement
            self.get_special_symbols_on_board()
        if self.dawn_purge_positions:
            low_symbols = {
                name for name, tier in self.config.symbol_tiers.items() if tier == "low"
            }
            for reel, incoming in enumerate(self.new_symbols_from_tumble):
                allowed = [name for name in self.reelstrip[reel] if name not in low_symbols]
                if not allowed:
                    raise RuntimeError(f"Dawn Purge reel {reel + 1} has no non-low refill symbols")
                for index, symbol in enumerate(incoming):
                    if symbol.name not in low_symbols:
                        continue
                    replacement = self.create_symbol(random.choice(allowed))
                    for row, board_symbol in enumerate(self.board[reel]):
                        if board_symbol is symbol:
                            self.board[reel][row] = replacement
                            break
                    incoming[index] = replacement
            self.dawn_purge_positions = []
            self.get_special_symbols_on_board()
        tumble_board_event(self)

    def apply_feature_expansions(self):
        for reel in self.feature_expansions:
            self.board[reel].insert(0, self.dreamfall_refill_symbol(reel))
            self.feature_multiplier_grid[reel].insert(0, 1)
            self.config.num_rows[reel] = len(self.board[reel])
        self.feature_expansions = []
        self.get_special_symbols_on_board()

    def sticky_tier_rule(self):
        tiers = self.config.sticky_reel_config.get("tiers", {})
        return tiers.get(str(self.feature_tier), tiers.get(self.feature_tier, {}))

    def sticky_tier_from_free_spins(self, free_spins):
        tiers = self.config.sticky_reel_config.get("tiers", {})
        ranked = sorted(
            ((int(tier), int(rule.get("freeSpins", 0))) for tier, rule in tiers.items()),
            key=lambda item: item[1],
            reverse=True,
        )
        return next((tier for tier, spins in ranked if free_spins >= spins), 1)

    def choose_direct_sticky_tier(self, profile):
        return int(get_random_outcome(profile["sticky_tier_weights"]))

    def initialize_sticky_feature(self):
        rule = self.sticky_tier_rule()
        guarantee_by = int(rule.get("guaranteedStickyBySpin", 0))
        if guarantee_by > 0:
            self.guaranteed_sticky_spin = random.randint(1, guarantee_by)
            self.guaranteed_sticky_reel = random.randrange(self.config.num_reels)

    def sticky_value_table(self):
        values = self.config.sticky_reel_config.get("valueWeights", {})
        key = "basegame" if self.gametype == self.config.basegame_type else f"tier{self.feature_tier}"
        return values.get(key, values.get("basegame", {2: 1}))

    def draw_sticky_value(self, minimum=2):
        return max(minimum, int(get_random_outcome(self.sticky_value_table())))

    def claim_sticky_reel(self, reel, persistence):
        multiplier = self.draw_sticky_value()
        if persistence == "sticky":
            self.sticky_reels[reel] = multiplier
        else:
            self.temporary_reels[reel] = multiplier
        wild_name = self.config.special_symbols["wild"][0]
        self.board[reel] = [self.create_symbol(wild_name) for _ in self.board[reel]]
        expand_sticky_reel_event(self, reel, multiplier, persistence)

    def prepare_sticky_reels(self, profile):
        self.temporary_reels = {}
        rule = self.sticky_tier_rule() if self.gametype == self.config.freegame_type else {}
        newly_sticky = set()
        if (
            self.gametype == self.config.freegame_type
            and self.fs == self.guaranteed_sticky_spin
            and self.guaranteed_sticky_reel not in self.sticky_reels
        ):
            reel = self.guaranteed_sticky_reel
            self.claim_sticky_reel(reel, "sticky")
            newly_sticky.add(reel)

        for reel in range(self.config.num_reels):
            if reel in self.sticky_reels:
                if reel not in newly_sticky and random.random() < float(rule.get("upgradeChance", 0)):
                    previous = self.sticky_reels[reel]
                    multiplier = self.draw_sticky_value(previous)
                    if multiplier > previous:
                        self.sticky_reels[reel] = multiplier
                        upgrade_sticky_reel_event(self, reel, previous, multiplier)
                self.board[reel] = [self.create_symbol(self.config.special_symbols["wild"][0]) for _ in self.board[reel]]
                continue

            sticky_chance = float(rule.get("stickyChance", 0)) if self.gametype == self.config.freegame_type else 0
            temporary_chance = (
                float(rule.get("temporaryChance", 0))
                if self.gametype == self.config.freegame_type
                else float(self.config.sticky_reel_config.get("baseTemporaryChance", 0))
            )
            if random.random() < sticky_chance:
                self.claim_sticky_reel(reel, "sticky")
            elif random.random() < temporary_chance:
                self.claim_sticky_reel(reel, "spin")

        self.get_special_symbols_on_board()

    def apply_sticky_reel_win_multipliers(self, mode_multiplier):
        active = {**self.sticky_reels, **self.temporary_reels}
        total = 0
        for win in self.win_data["wins"]:
            base_win = win["win"]
            contributing = [
                {"reel": reel, "multiplier": value}
                for reel, value in sorted(active.items())
                if reel < win["kind"]
            ]
            sticky_multiplier = sum(item["multiplier"] for item in contributing) or 1
            applied_multiplier = sticky_multiplier * mode_multiplier
            win["win"] = base_win * applied_multiplier
            win["meta"]["winWithoutMult"] = base_win
            win["meta"]["globalMult"] = applied_multiplier
            win["meta"]["stickyReelMultiplier"] = sticky_multiplier
            win["meta"]["contributingStickyReels"] = contributing
            total += win["win"]
        self.win_data["totalWin"] = total

    def clear_temporary_reels(self):
        if self.temporary_reels:
            clear_temporary_reels_event(self, sorted(self.temporary_reels))
        self.temporary_reels = {}

    def evaluate_profile_board(self, multiplier, profile):
${calculation.evaluate}
        self.apply_feature_win_multipliers()
        if self.win_data["wins"]:
            self.apply_current_feature_win_step()
        self.quantize_win_data()
        self.cap_ordinary_win_data()
        if self.win_data["totalWin"] > 0 and self.win_data["wins"]:
            ${calculation.record}
            if profile["cascades"]:
                for win in self.win_data["wins"]:
                    for position in win["positions"]:
                        self.board[position["reel"]][position["row"]].explode = True
            self.win_manager.update_spinwin(self.win_data["totalWin"])
        self.win_manager.tumble_win = self.win_data["totalWin"]

    def scale_win_data(self, multiplier):
        if multiplier == 1:
            return
        self.win_data["totalWin"] *= multiplier
        for win in self.win_data["wins"]:
            win["win"] *= multiplier
            win["meta"]["globalMult"] = multiplier

    def quantize_win_data(self):
        raw_total = self.win_data["totalWin"]
        quantized_total = round(raw_total * 10) / 10
        if quantized_total <= 0:
            self.win_data = {"totalWin": 0, "wins": []}
            return
        positive_wins = [win for win in self.win_data["wins"] if win.get("win", 0) > 0]
        if not positive_wins:
            self.win_data = {"totalWin": 0, "wins": []}
            return
        adjustment = quantized_total - raw_total
        positive_wins[0]["win"] = round(positive_wins[0]["win"] + adjustment, 10)
        self.win_data["wins"] = positive_wins
        self.win_data["totalWin"] = quantized_total

    def cap_ordinary_win_data(self):
        if self.win_data["totalWin"] <= 0 or not self.win_data["wins"]:
            return
        if any(win.get("meta", {}).get("maxWildTriggered") for win in self.win_data["wins"]):
            return
        ordinary_cap = max(0, self.config.wincap - 0.1)
        remaining = max(0, ordinary_cap - self.win_manager.running_bet_win)
        if self.win_data["totalWin"] <= remaining:
            return
        self.ordinary_cap_triggered = True
        if remaining <= 0:
            self.win_data = {"totalWin": 0, "wins": []}
            return
        first = self.win_data["wins"][0]
        first["win"] = remaining
        first.setdefault("meta", {})["ordinaryCapApplied"] = True
        self.win_data["wins"] = [first]
        self.win_data["totalWin"] = remaining

    def emit_profile_win_events(self):
        if self.win_data["totalWin"] > 0:
            win_info_event(self, include_padding_index=self.config.include_padding)
            self.evaluate_wincap()
            set_win_event(self)
        set_total_event(self)

    def advance_profile_multiplier(self, profile):
        next_value = self.global_multiplier + profile["multiplier_increment"]
        if profile["multiplier_max"] > 0:
            next_value = min(next_value, profile["multiplier_max"])
        self.global_multiplier = next_value
        update_global_mult_event(self)
`;
  }

  genGameCalculations() {
    return `from src.executables.executables import Executables


class GameCalculations(Executables):
    pass
`;
  }

  genGameEvents() {
    return `from src.events.events import *


def add_sticky_reel_event(gamestate, event_type, **payload):
    gamestate.book.add_event({
        "index": len(gamestate.book.events),
        "type": event_type,
        **payload,
    })


def add_feature_event(gamestate, event_type, **payload):
    add_sticky_reel_event(gamestate, event_type, **payload)


def feature_board(gamestate):
    special_attributes = list(gamestate.config.special_symbols.keys())
    return [
        [json_ready_sym(symbol, special_attributes) for symbol in reel]
        for reel in gamestate.board
    ]


def board_transform_event(gamestate, changes):
    if not changes:
        return
    add_sticky_reel_event(
        gamestate,
        "boardTransform",
        board=feature_board(gamestate),
        changes=changes,
    )


def expand_sticky_reel_event(gamestate, reel, multiplier, persistence):
    add_sticky_reel_event(
        gamestate,
        "expandStickyReel",
        reel=reel,
        multiplier=multiplier,
        persistence=persistence,
    )


def upgrade_sticky_reel_event(gamestate, reel, previous, multiplier):
    add_sticky_reel_event(
        gamestate,
        "upgradeStickyReel",
        reel=reel,
        previousMultiplier=previous,
        multiplier=multiplier,
    )


def clear_temporary_reels_event(gamestate, reels):
    add_sticky_reel_event(gamestate, "clearTemporaryReels", reels=reels)
`;
  }

  /**
   * Per-criteria RTPs must sum to the bet mode's RTP or the optimizer rejects
   * the setup. Split here is a starting point and needs tuning against real
   * simulation output.
   */
  genGameOptimization() {
    const modeBlocks = this.modes().map(mode => {
      const profile = mode.profile || {};
      const entry = profile.entry || (mode.isBuyBonus ? 'freeSpins' : 'base');
      const rtp = mode.rtp ?? this.math.rtp;
      const wincapRtp = maximumWinRtpForMode(this.math, mode);
      const hasFree = entry === 'freeSpins' || (entry === 'base' && profile.triggerFreeSpins !== false && Object.keys(this.math.freespinTriggers?.basegame || {}).length > 0);
      const directFree = entry === 'freeSpins';
      const supportsZeroCriterion = !directFree;
      const freegameHitRate = Number(profile.targetFeatureEntryHitRate) > 0
        ? +Number(profile.targetFeatureEntryHitRate).toFixed(6)
        : +(200 / Math.max(1, Number(profile.scatterWeightMultiplier) || 1)).toFixed(6);
      const freeRtp = hasFree ? +(directFree ? rtp - wincapRtp : rtp * 0.4).toFixed(6) : 0;
      const baseRtp = +Math.max(0, rtp - wincapRtp - freeRtp).toFixed(6);
      const conditions = [
        `                    "wincap": ConstructConditions(rtp=${wincapRtp}, av_win=${this.math.wincap}, search_conditions=${this.math.wincap}).return_dict(),`,
      ];
      if (supportsZeroCriterion) conditions.push(`                    "0": ConstructConditions(rtp=0, av_win=0, search_conditions=0).return_dict(),`);
      if (hasFree) conditions.push(directFree
        ? `                    "freegame": ConstructConditions(rtp=${freeRtp}, hr="x").return_dict(),`
        : `                    "freegame": ConstructConditions(rtp=${freeRtp}, hr=${freegameHitRate}, search_conditions={"symbol": "scatter"}).return_dict(),`);
      if (!directFree) conditions.push(`                    "basegame": ConstructConditions(rtp=${baseRtp}, hr=3.5).return_dict(),`);
      const scalingCriteria = directFree ? ['freegame'] : hasFree ? ['basegame', 'freegame'] : ['basegame'];
      return `            ${JSON.stringify(mode.name)}: {
                "conditions": {
${conditions.join('\n')}
                },
                "scaling": ConstructScaling(
                    [
${scalingCriteria.map(c => `                        {
                            "criteria": "${c}",
                            "scale_factor": 1,
                            "win_range": (0.01, ${this.math.wincap}),
                            "probability": 1.0,
                        },`).join('\n')}
                    ]
                ).return_dict(),
                "parameters": parameters,
            },`;
    });

    return `"""Set conditions/parameters for the optimization program.

Auto-generated by StakeStudio. The per-criteria RTP split below is a STARTING
POINT: each mode's values sum to its declared RTP, and the optimizer's
fence solver additionally requires 2*min_win < av_win < max_win/2 for each
criteria or it will fail to converge. Tune against real simulation output.
"""

from optimization_program.optimization_config import (
    ConstructScaling,
    ConstructParameters,
    ConstructConditions,
    verify_optimization_input,
)


class OptimizationSetup:
    """Game specific optimization setup."""

    def __init__(self, game_config: object):
        self.game_config = game_config
        parameters = ConstructParameters(
            num_show=5000,
            num_per_fence=10000,
            min_m2m=4,
            max_m2m=8,
            pmb_rtp=1.0,
            sim_trials=5000,
            test_spins=[50, 100, 200],
            test_weights=[0.3, 0.4, 0.3],
            score_type="rtp",
        ).return_dict()
        self.game_config.opt_params = {
${modeBlocks.join('\n')}
        }

        verify_optimization_input(self.game_config, self.game_config.opt_params)
`;
  }

  genRun() {
    const modes = (this.math.betModes?.length ? this.math.betModes : [{ name: 'base' }]).map(m => m.name);
    const sims = this.project.build?.simulations?.base || 100000;
    const modeSims = Object.fromEntries(modes.map(mode => [mode, Number(this.project.build?.simulations?.[mode]) || sims]));
    const envName = mode => String(mode).toUpperCase().replace(/[^A-Z0-9]+/g, '_');

    return `"""Entry point — auto-generated by StakeStudio."""

import os

from gamestate import GameState
from game_config import GameConfig
from game_optimization import OptimizationSetup
from optimization_program.run_script import OptimizationExecution
from utils.rgs_verification import execute_all_tests
from src.state.run_sims import create_books
from src.write_data.write_configs import generate_configs

if __name__ == "__main__":

    def env_flag(name, default):
        value = os.getenv(name)
        return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}

    num_threads = int(os.getenv("STAKE_STUDIO_NUM_THREADS", "10"))
    rust_threads = int(os.getenv("STAKE_STUDIO_RUST_THREADS", "20"))
    batching_size = int(os.getenv("STAKE_STUDIO_BATCH_SIZE", "50000"))
    compression = env_flag("STAKE_STUDIO_COMPRESSION", True)
    profiling = env_flag("STAKE_STUDIO_PROFILING", False)

    all_num_sim_args = {
${modes.map(m => `        "${m}": int(os.getenv("STAKE_STUDIO_SIMS_${envName(m)}", "${modeSims[m]}")),`).join('\n')}
    }

    # StakeStudio's publisher controls these explicitly. Direct CLI runs keep
    # the production defaults, while smoke/draft jobs skip Rust optimization.
    run_conditions = {
        "run_sims": env_flag("STAKE_STUDIO_RUN_SIMS", True),
        "run_optimization": env_flag("STAKE_STUDIO_RUN_OPTIMIZATION", True),
        "run_analysis": env_flag("STAKE_STUDIO_RUN_ANALYSIS", False),
        "upload_data": env_flag("STAKE_STUDIO_UPLOAD_DATA", False),
    }
    requested_modes = [value.strip() for value in os.getenv("STAKE_STUDIO_TARGET_MODES", "").split(",") if value.strip()]
    target_modes = requested_modes or ${JSON.stringify(modes).replace(/"/g, '"')}
    unknown_modes = sorted(set(target_modes) - set(all_num_sim_args))
    if unknown_modes:
        raise ValueError(f"Unknown STAKE_STUDIO_TARGET_MODES: {unknown_modes}")
    num_sim_args = {name: all_num_sim_args[name] for name in target_modes}

    config = GameConfig()
    gamestate = GameState(config)
    if run_conditions["run_optimization"] or run_conditions["run_analysis"]:
        optimization_setup_class = OptimizationSetup(config)

    if run_conditions["run_sims"]:
        create_books(
            gamestate,
            config,
            num_sim_args,
            batching_size,
            num_threads,
            compression,
            profiling,
        )

    generate_configs(gamestate)

    if run_conditions["run_optimization"]:
        OptimizationExecution().run_all_modes(config, target_modes, rust_threads)
        generate_configs(gamestate)

    if run_conditions["run_analysis"]:
        execute_all_tests(config)
`;
  }

  genReadme() {
    const id = this.gameId();
    return `# ${this.project.name}

Auto-generated by StakeStudio for the Stake Engine math-sdk.

## Install

Copy this folder into your math-sdk checkout:

    cp -R games/${id} <math-sdk>/games/${id}

The folder name must stay \`${id}\` — math-sdk derives \`reels/\`, \`library/\` and
\`library/publish_files/\` from \`game_id\`.

## Run

    cd <math-sdk>
    make run GAME=${id}

Outputs land in \`games/${id}/library/publish_files/\`.

## Before you trust the numbers

- \`game_optimization.py\` carries a **starting-point** RTP split. Per-criteria RTPs
  must sum to the bet mode RTP (${this.math.rtp}), and each criteria needs
  \`2*min_win < av_win < max_win/2\` or the fence solver will not converge.
- Every configured mode and referenced reel set is exported. Reel strips came
  from StakeStudio and are **not** RTP-calibrated. The Rust
  optimizer sets the final lookup-table weights; the strips only need to be sane.
- \`gamestate.py\` mirrors the configured base and direct-free-spin lifecycles,
  compiles the selected core mechanics, and evaluates \`${getExecutableWinType(this.math.gameType)}\` wins.
- The explicit maximum-win book uses an all-${this.project.theme.symbols?.find(s => Object.values(s.payouts || {}).some(v => Number(v) > 0))?.name || 'paid-symbol'} board. Its
  Maximum-win probability follows StakeStudio's shared explicit-hit-rate policy when configured; otherwise it uses the legacy RTP allocation. The optimizer controls the final lookup-table probability.
`;
  }
}

export function getMathSDKContractFingerprint(project) {
  return mathSDKFilesFingerprint(new MathSDKExporter(project).generateFiles());
}
