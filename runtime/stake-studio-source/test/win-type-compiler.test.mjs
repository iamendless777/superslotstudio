import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { createGameProject } from '../src/engines/schema.js';
import { MathEngine } from '../src/engines/math/MathEngine.js';
import { generateDefaultPaylines, getExecutableWinType } from '../src/engines/math/WinTypeEngine.js';
import { getMathSDKContractFingerprint, MathSDKExporter } from '../src/engines/build/MathSDKExporter.js';
import { applyGameBlueprint } from '../src/engines/blueprints/GameBlueprintEngine.js';
import { resolveMathSdkRoot } from '../server/studio-paths.mjs';

function projectFor(gameType, grid = { reels: 5, rows: [3, 3, 3, 3, 3] }) {
  const project = createGameProject({ name: `${gameType} compiler test` });
  project.math.gameType = gameType;
  project.math.grid = grid;
  project.math.specialSymbols = { wild: ['W'], scatter: ['S'], multiplier: [] };
  project.math.betModes = [{
    name: 'base', cost: 1, rtp: 0.965, maxWin: 5000,
    profile: { entry: 'base', reelSet: 'BR', triggerFreeSpins: false },
  }];
  project.math.reelStrips = { BR: Array.from({ length: grid.reels }, () => ['H1', 'H2', 'W', 'S', 'L1', 'L2']) };
  project.build.stakeEngine.gameId = `${gameType}_compiler_test`;
  return project;
}

test('production compiler exposes only honest executable win types', () => {
  assert.equal(getExecutableWinType('lines'), 'lines');
  assert.equal(getExecutableWinType('ways5x5'), 'ways');
  assert.equal(getExecutableWinType('cluster'), 'cluster');
  assert.equal(getExecutableWinType('scatter'), 'scatter');
  assert.equal(getExecutableWinType('megaways'), null);
  assert.equal(getExecutableWinType('holdAndSpin'), null);
});

test('math contract fingerprint tracks executable mechanics and reel bytes', () => {
  const project = projectFor('ways');
  const original = getMathSDKContractFingerprint(project);
  assert.equal(getMathSDKContractFingerprint(structuredClone(project)), original);
  project.math.betModes[0].profile.triggerFreeSpins = true;
  assert.notEqual(getMathSDKContractFingerprint(project), original);
  const mechanicFingerprint = getMathSDKContractFingerprint(project);
  project.math.reelStrips.BR[0][0] = 'CHANGED';
  assert.notEqual(getMathSDKContractFingerprint(project), mechanicFingerprint);
});

test('default lines contract is the conventional deterministic 20-line set', () => {
  const paylines = generateDefaultPaylines({ reels: 5, rows: [3, 3, 3, 3, 3] });
  assert.equal(Object.keys(paylines).length, 20);
  assert.deepEqual(paylines[1], [0, 0, 0, 0, 0]);
  assert.deepEqual(paylines[4], [0, 1, 2, 1, 0]);
  assert.deepEqual(paylines[20], [1, 0, 0, 0, 1]);
});

test('Studio simulator evaluates authored paylines instead of ways', () => {
  const project = projectFor('lines');
  project.math.paylines = { 7: [0, 0, 0, 0, 0] };
  const board = [
    ['H1', 'L1', 'L2'], ['W', 'L1', 'L2'], ['H1', 'L1', 'L2'],
    ['H1', 'L1', 'L2'], ['H1', 'L1', 'L2'],
  ];
  const wins = new MathEngine(project).evaluateBoard(board);
  assert.equal(wins.length, 1);
  assert.equal(wins[0].lineIndex, 7);
  assert.equal(wins[0].symbol, 'H1');
  assert.equal(wins[0].payout, 20);
});

test('Studio simulator evaluates orthogonal clusters', () => {
  const project = projectFor('cluster', { reels: 3, rows: [3, 3, 3] });
  project.theme.symbols.find(symbol => symbol.name === 'H1').payouts = { 5: 2 };
  const board = [
    ['H1', 'H1', 'L1'],
    ['H1', 'W', 'L2'],
    ['H1', 'L2', 'L1'],
  ];
  const wins = new MathEngine(project).evaluateBoard(board);
  const win = wins.find(candidate => candidate.symbol === 'H1');
  assert.ok(win);
  assert.equal(win.clusterSize, 5);
  assert.equal(win.payout, 2);
});

test('Studio simulator evaluates pay-anywhere counts', () => {
  const project = projectFor('scatter', { reels: 3, rows: [3, 3, 3] });
  project.theme.symbols.find(symbol => symbol.name === 'H1').payouts = { 5: 3 };
  const board = [
    ['H1', 'H1', 'L1'],
    ['H1', 'W', 'L2'],
    ['H1', 'L2', 'L1'],
  ];
  const wins = new MathEngine(project).evaluateBoard(board);
  const win = wins.find(candidate => candidate.symbol === 'H1');
  assert.ok(win);
  assert.equal(win.count, 5);
  assert.equal(win.payout, 3);
});

test('math-sdk export selects the official calculator for every compiled family', () => {
  const expected = {
    lines: ['from src.calculations.lines import Lines', 'Lines.get_lines', 'self.paylines ='],
    ways: ['from src.calculations.ways import Ways', 'Ways.get_ways_data'],
    cluster: ['from src.calculations.cluster import Cluster', 'Cluster.get_cluster_data'],
    scatter: ['from src.calculations.scatter import Scatter', 'Scatter.get_scatterpay_wins'],
  };
  for (const [gameType, fragments] of Object.entries(expected)) {
    const project = projectFor(gameType);
    if (gameType === 'lines') project.math.paylines = generateDefaultPaylines(project.math.grid);
    const files = new MathSDKExporter(project).generateFiles();
    const id = project.build.stakeEngine.gameId;
    const executable = files[`games/${id}/game_executables.py`];
    const config = files[`games/${id}/game_config.py`];
    for (const fragment of fragments) assert.ok(`${executable}\n${config}`.includes(fragment), `${gameType} export is missing ${fragment}`);
  }
});

test('math-sdk export canonicalizes authored symbol punctuation consistently', () => {
  const project = projectFor('ways');
  const moon = project.theme.symbols.find(symbol => symbol.name === 'H1');
  moon.name = 'MOON_MOTH';
  moon.id = 'MOON_MOTH';
  moon.special = ['dreamMessenger'];
  project.math.reelStrips.BR = project.math.reelStrips.BR
    .map(strip => strip.map(name => name === 'H1' ? 'MOON_MOTH' : name));
  const files = new MathSDKExporter(project).generateFiles();
  const config = files['games/ways_compiler_test/game_config.py'];
  const reels = files['games/ways_compiler_test/reels/BR0.csv'];
  assert.match(config, /"MOONMOTH"/);
  assert.match(config, /"dreamMessenger"/);
  assert.match(reels, /MOONMOTH/);
  assert.doesNotMatch(`${config}\n${reels}`, /MOON_MOTH/);
});

test('math-sdk export rejects symbol names that collide after canonicalization', () => {
  const project = projectFor('ways');
  project.theme.symbols[0].name = 'A_B';
  project.theme.symbols[1].name = 'AB';
  assert.throws(() => new MathSDKExporter(project).generateFiles(), /both compile to the official math-sdk name/);
});

test('compiled profiles carry executable cascade, multiplier and expanding-wild behavior', () => {
  const project = projectFor('ways');
  project.math.bonusMechanics = ['cascades', 'increasingMultipliers', 'multiplierSymbols', 'expandingWilds'];
  project.math.mechanicConfig = {
    cascades: { maxCascades: 7 },
    increasingMultipliers: { startValue: 2, increment: 3, maxValue: 50, persistInBonus: true },
    multiplierSymbols: { values: { basegame: { 2: 4 }, freegame: { 3: 2 } } },
  };
  const files = new MathSDKExporter(project).generateFiles();
  const source = Object.values(files).join('\n');
  for (const fragment of ['"cascades": True', '"max_cascades": 7', '"expanding_wilds": True', '"multiplier_increment": 3', '"mult_values"', 'tumble_game_board()', 'advance_profile_multiplier', 'emit_profile_board_selection', '"modeBoardSelection"', 'from game_events import add_feature_event, board_transform_event', 'self.get_current_betmode().set_force_keys()']) {
    assert.ok(source.includes(fragment), `compiled mechanic contract is missing ${fragment}`);
  }
  assert.match(source, /and not symbol\.check_attribute\("maxWild"\)/);
  assert.match(source, /ordinary_cap = max\(0, self\.config\.wincap - 0\.1\)/);
  assert.match(source, /maxWildTriggered/);
});

test('official math expanding wilds stop before protected specials and disclose the blocker', () => {
  const project = projectFor('ways');
  project.math.bonusMechanics = ['expandingWilds'];
  const files = new MathSDKExporter(project).generateFiles();
  const state = files[`games/${project.build.stakeEngine.gameId}/gamestate.py`];
  assert.match(state, /row > expanding_row and bool\(symbol\.defn\.special_flags\)/);
  assert.match(state, /stopped_by = \{"position": \{"reel": reel, "row": row\}, "symbol": symbol\.name\}/);
  assert.match(state, /stoppedBy=stopped_by/);
});

test('sticky reel contracts compile into round-scoped Stake math and explicit events', () => {
  const project = createGameProject({ name: 'Sticky Reel Compiler Test' });
  project.build.stakeEngine.gameId = 'sticky_reel_compiler_test';
  applyGameBlueprint(project, 'sticky_reel_forge');
  const files = new MathSDKExporter(project).generateFiles();
  const source = Object.values(files).join('\n');
  for (const fragment of [
    '"sticky_reel_multipliers": True',
    'self.sticky_reels = {}',
    'prepare_sticky_reels',
    'apply_sticky_reel_win_multipliers',
    '"expandStickyReel"',
    '"upgradeStickyReel"',
    '"clearTemporaryReels"',
    '"contributingStickyReels"',
  ]) assert.ok(source.includes(fragment), `compiled sticky-reel contract is missing ${fragment}`);
});

test('feature architecture compiles into executable official-SDK mechanics', () => {
  const project = projectFor('ways', { reels: 6, rows: [4, 4, 4, 4, 4, 4] });
  project.theme.symbols[0].special = ['mystery'];
  project.theme.symbols[1].special = ['wildBomb'];
  project.math.reelStrips.BR = project.math.reelStrips.BR.map(strip => [
    project.theme.symbols[0].name,
    project.theme.symbols[1].name,
    ...strip,
  ]);
  project.math.featureArchitecture = {
    tiers: {
      3: { id: 'upgrade', spins: 10, mechanic: 'progressiveSymbolUpgrade', meterThreshold: 4, maximumUpgrades: 4 },
      4: { id: 'symbolMult', spins: 10, mechanic: 'persistentSymbolMultipliers' },
      5: { id: 'grow', spins: 10, mechanic: 'winningCascadeReelExpansion', maximumRows: 8 },
      6: { id: 'grid', spins: 10, mechanic: 'persistentPositionMultiplierGrid' },
    },
  };
  project.math.betModes[0].profile.featureTier = 'grid';
  const source = Object.values(new MathSDKExporter(project).generateFiles()).join('\n');
  for (const fragment of [
    'prepare_feature_board', 'mysteryTransform', 'wildBomb',
    'specialTargetSelected', 'specialPositionsResolved',
    'boardTransform', 'symbolUpgradeApply', 'lucidWildMultiplier', 'echoSplit', 'maxDream',
    'dreamTierStart', 'symbolBarProgress',
    'progressiveSymbolUpgrade', 'persistentSymbolMultipliers',
    'winningCascadeReelExpansion', 'persistentPositionMultiplierGrid',
    'modeGridStart',
    'apply_feature_expansions', 'awarded_free_spins',
    'remove_dreamfall_scatters_from_board', 'dreamfall_refill_symbol',
    'tumbleChainProgress', 'awardTumbleFreeSpins',
  ]) assert.ok(source.includes(fragment), `feature architecture export is missing ${fragment}`);
  const gamestate = new MathSDKExporter(project).generateFiles()['games/ways_compiler_test/gamestate.py'];
  const drawProfile = gamestate.slice(gamestate.indexOf('    def draw_profile_board'), gamestate.indexOf('    def apply_expanding_wilds'));
  assert.ok(drawProfile.indexOf('self.remove_dreamfall_scatters_from_board()') < drawProfile.indexOf('reveal_event(self)'), 'Dreamfall scatter exclusions must be final before authoritative reveal');
  assert.ok(drawProfile.indexOf('self.prepare_feature_board()') < drawProfile.indexOf('reveal_event(self)'), 'mode-scoped instruments must initialize before authoritative reveal');
  assert.match(gamestate, /self\.emit_profile_win_events\(\)\n\s+self\.advance_feature_after_settled_win\(profile\)/);
  assert.match(gamestate, /self\.emit_tumble_win_events\(\)\n\s+self\.advance_feature_after_settled_win\(profile\)/);
  const executable = new MathSDKExporter(project).generateFiles()['games/ways_compiler_test/game_executables.py'];
  const trigger = executable.slice(executable.indexOf('    def update_freespin_amount'), executable.indexOf('    def update_fs_retrigger_amt'));
  assert.ok(trigger.indexOf('fs_trigger_event(') < trigger.indexOf('self.emit_feature_tier_start()'), 'tier identity must follow the authoritative trigger and precede free spin one');
  assert.match(executable, /hits_by_family\.setdefault\(family, set\(\)\)\.update/);
  assert.match(executable, /gained=len\(hits\)/);
  assert.match(executable, /target = random\.choice\(self\.config\.paid_symbols\[index \+ 1:\]\)/);
  assert.match(executable, /"symbolMultiplierUpdate"/);
  assert.match(executable, /symbol in self\.config\.special_symbols\.get\("wild", \[\]\)/);
  assert.match(executable, /self\.tot_fs \+= 1/);
  assert.match(executable, /if symbol\.name in scatters/);
  assert.match(executable, /incoming\[index\] = replacement/);
  assert.match(executable, /position=\{"reel": reel, "row": row\}/);
  assert.match(executable, /split_multiplier = 2 \*\* len\(split_sources\)/);
  assert.match(executable, /waysAfter=ways_before \* split_multiplier/);
  assert.match(executable, /originalIdentity="MYSTERY_VEIL"/);
  assert.match(executable, /accountingIdentities=accounting_identities/);
  assert.match(executable, /emptyPositions=self\.dawn_purge_positions/);
  assert.match(executable, /refillExcludesTiers=\["low"\]/);
  assert.match(executable, /\.explode = True/);
  assert.match(executable, /name for name in self\.reelstrip\[reel\] if name not in low_symbols/);
});

test('a configured max wild is the visible cause of every forced max-win book', () => {
  const project = projectFor('ways', { reels: 6, rows: [4, 4, 4, 4, 4, 4] });
  const maxWild = project.theme.symbols.find(symbol => symbol.name === 'H1');
  maxWild.special = ['wild', 'maxWild'];
  maxWild.payouts = { 6: 10 };
  project.math.specialSymbols.wild.push(maxWild.name);
  const files = new MathSDKExporter(project).generateFiles();
  const config = files['games/ways_compiler_test/game_config.py'];
  const gamestate = files['games/ways_compiler_test/gamestate.py'];
  assert.match(config, /self\.wincap_symbol = "H1"/);
  assert.match(gamestate, /add_feature_event\(self, "maxDream", sources=positions, positions=positions/);
  const ordinaryEmit = gamestate.slice(gamestate.indexOf('def emit_profile_win_events'), gamestate.indexOf('def advance_profile_multiplier'));
  assert.doesNotMatch(ordinaryEmit, /maxDream/);
  assert.match(gamestate, /if entry == "freeSpins":[\s\S]*self\.tot_fs = int\(architecture\.get\("spins", profile\["free_spins"\]\)\)/);
  assert.doesNotMatch(gamestate, /if entry == "freeSpins":\n\s+self\.tot_fs = 1/);
});

test('direct-feature max books announce their tier before the first of ten spins', () => {
  const project = projectFor('ways', { reels: 6, rows: [4, 4, 4, 4, 4, 4] });
  project.theme.symbols.find(symbol => symbol.name === 'H1').special = ['wild', 'maxWild'];
  project.math.specialSymbols.wild.push('H1');
  project.math.featureArchitecture = {
    tiers: { 6: { id: 'grid', name: 'The Nexus', spins: 10, mechanic: 'persistentPositionMultiplierGrid' } },
  };
  project.math.betModes = [{
    name: 'bonus', cost: 100, rtp: 0.96, maxWin: 5000, isBuyBonus: true,
    profile: { entry: 'freeSpins', reelSet: 'BR', freeSpins: 10, featureTier: 'grid' },
  }];
  const temp = mkdtempSync(join(tmpdir(), 'stakestudio-direct-max-'));
  const sdkRoot = resolveMathSdkRoot();
  const gameDir = join(temp, 'games', project.build.stakeEngine.gameId);
  const runner = `
import os, sys
root, game_dir, sdk_root = sys.argv[1:4]
os.chdir(root)
sys.path.insert(0, game_dir)
sys.path.insert(0, sdk_root)
import src.config.paths as sdk_paths
import src.config.config as sdk_config
import src.config.output_filenames as sdk_output
sdk_paths.PATH_TO_GAMES = os.path.join(root, "games")
sdk_config.PATH_TO_GAMES = sdk_paths.PATH_TO_GAMES
sdk_output.PATH_TO_GAMES = sdk_paths.PATH_TO_GAMES
from game_config import GameConfig
from gamestate import GameState
state = GameState(GameConfig())
state.betmode = "bonus"
state.criteria = "wincap"
state.run_spin(71)
types = [event["type"] for event in state.book.events]
trigger = next(event for event in state.book.events if event["type"] == "freeSpinTrigger")
assert trigger["totalFs"] == 10, trigger
assert types.index("freeSpinTrigger") < types.index("dreamTierStart") < types.index("updateFreeSpin"), types
assert types.index("maxDream") < types.index("winInfo") < types.index("wincap"), types
`;
  try {
    for (const [relative, contents] of Object.entries(new MathSDKExporter(project).generateFiles())) {
      const target = join(temp, relative);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    const python = join(sdkRoot, 'env', 'bin', 'python');
    const result = spawnSync(python, ['-c', runner, temp, gameDir, sdkRoot], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('scatter-board enhancement compiles to a stronger final feature-entry target', () => {
  const project = projectFor('ways');
  project.math.freespinTriggers = { basegame: { 3: 10 }, freegame: { 3: 5 } };
  project.math.betModes = [
    { name: 'base', cost: 1, rtp: 0.96, maxWin: 5000, profile: { entry: 'base', reelSet: 'BR', triggerFreeSpins: true } },
    { name: 'enhancer', cost: 3, rtp: 0.96, maxWin: 5000, profile: { entry: 'base', reelSet: 'BR', triggerFreeSpins: true, scatterWeightMultiplier: 3 } },
  ];
  const optimization = new MathSDKExporter(project).generateFiles()['games/ways_compiler_test/game_optimization.py'];
  const base = optimization.slice(optimization.indexOf('            "base":'), optimization.indexOf('            "enhancer":'));
  const enhancer = optimization.slice(optimization.indexOf('            "enhancer":'));
  assert.match(base, /"freegame": ConstructConditions\(rtp=[^,]+, hr=200,/);
  assert.match(enhancer, /"freegame": ConstructConditions\(rtp=[^,]+, hr=66\.666667,/);
});

test('official SDK executes Trickster as one grid spin with no free-spin lifecycle', () => {
  const project = projectFor('ways', { reels: 6, rows: [1, 1, 1, 1, 1, 1] });
  project.build.stakeEngine.gameId = 'trickster_grid_runtime_test';
  project.math.bonusMechanics = ['cascades'];
  project.math.mechanicConfig = { cascades: { maxCascades: 1 } };
  project.math.reelStrips.BR = [['H1'], ['H1'], ['H1'], ['H2'], ['H2'], ['H2']];
  project.math.betModes = [{
    name: 'trickster_dream', cost: 75, rtp: 0.96, maxWin: 5000,
    profile: {
      entry: 'base', triggerFreeSpins: false, positionMultiplierGrid: true,
      specialSymbolBoost: 4, multiplier: 1,
    },
  }];
  const temp = mkdtempSync(join(tmpdir(), 'stakestudio-trickster-grid-'));
  const sdkRoot = resolveMathSdkRoot();
  const python = join(sdkRoot, 'env', 'bin', 'python');
  const gameDir = join(temp, 'games', project.build.stakeEngine.gameId);
  const runner = `
import os, sys
root, game_dir, sdk_root = sys.argv[1:4]
os.chdir(root)
sys.path.insert(0, game_dir)
sys.path.insert(0, sdk_root)
import src.config.paths as sdk_paths
import src.config.config as sdk_config
import src.config.output_filenames as sdk_output
sdk_paths.PATH_TO_GAMES = os.path.join(root, "games")
sdk_config.PATH_TO_GAMES = sdk_paths.PATH_TO_GAMES
sdk_output.PATH_TO_GAMES = sdk_paths.PATH_TO_GAMES
from game_config import GameConfig
from gamestate import GameState
state = GameState(GameConfig())
state.betmode = "trickster_dream"
state.criteria = "basegame"
state.run_spin(91)
types = [event["type"] for event in state.book.events]
assert types[0:2] == ["modeGridStart", "reveal"], types
assert "freeSpinTrigger" not in types and "updateFreeSpin" not in types, types
assert "positionMultiplierGridUpdate" in types, types
assert state.position_grid_mode is True, state.position_grid_mode
assert state.grid_mode_id == "trickster_dream", state.grid_mode_id
`;
  try {
    for (const [relative, contents] of Object.entries(new MathSDKExporter(project).generateFiles())) {
      const target = join(temp, relative);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    const result = spawnSync(python, ['-c', runner, temp, gameDir, sdkRoot], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('official books keep one zero-based position contract and advance features only after settled wins', () => {
  const project = projectFor('ways', { reels: 6, rows: [4, 4, 4, 4, 4, 4] });
  project.math.bonusMechanics = ['cascades'];
  project.math.mechanicConfig = { cascades: { maxCascades: 4 } };
  project.math.featureArchitecture = {
    tiers: { 3: { id: 'upgrade', spins: 10, mechanic: 'progressiveSymbolUpgrade', meterThreshold: 4, maximumUpgrades: 4 } },
  };
  const files = new MathSDKExporter(project).generateFiles();
  const executable = files['games/ways_compiler_test/game_executables.py'];
  const gamestate = files['games/ways_compiler_test/gamestate.py'];
  const play = gamestate.slice(gamestate.indexOf('    def play_profile_spin'), gamestate.indexOf('    def start_direct_freegame'));
  const evaluate = executable.slice(executable.indexOf('    def evaluate_profile_board'), executable.indexOf('    def scale_win_data'));

  assert.match(executable, /def emit_tumble_win_events[\s\S]*win_info_event\(self, include_padding_index=self\.config\.include_padding\)/);
  assert.match(executable, /def update_freespin_amount[\s\S]*include_padding_index=self\.config\.include_padding/);
  assert.match(executable, /def update_fs_retrigger_amt[\s\S]*include_padding_index=self\.config\.include_padding/);
  assert.match(play, /self\.emit_tumble_win_events\(\)\n\s+self\.advance_feature_after_settled_win\(profile\)/);
  assert.match(executable, /def advance_feature_after_settled_win[\s\S]*self\.win_data\["totalWin"\] <= 0/);
  assert.ok(evaluate.indexOf('self.quantize_win_data()') < evaluate.indexOf('self.win_manager.update_spinwin'));
  assert.doesNotMatch(evaluate, /advance_feature_after_settled_win/);
  assert.match(executable, /if quantized_total <= 0:[\s\S]*self\.win_data = \{"totalWin": 0, "wins": \[\]\}/);
  assert.match(executable, /def replace_feature_symbol[\s\S]*replacement\.explode = bool\(getattr\(previous, "explode", False\)\)/);
  assert.match(executable, /previous = self\.replace_feature_symbol\(reel, row, self\.config\.spawned_wild\)/);
});

test('official math-sdk books reveal an effect tile before its mechanic and board transform', () => {
  const project = projectFor('ways', { reels: 5, rows: [3, 3, 3, 3, 3] });
  project.build.stakeEngine.gameId = 'effect_event_order_test';
  project.math.bonusMechanics = ['cascades'];
  project.math.mechanicConfig = { cascades: { maxCascades: 1 } };
  const mystery = project.theme.symbols.find(symbol => symbol.name === 'H1');
  mystery.special = ['mystery'];
  project.math.reelStrips.BR = [['H1'], ['H1'], ['H1'], ['H2'], ['H2']];
  const temp = mkdtempSync(join(tmpdir(), 'stakestudio-effect-book-'));
  const sdkRoot = resolveMathSdkRoot();
  const python = join(sdkRoot, 'env', 'bin', 'python');
  const gameDir = join(temp, 'games', project.build.stakeEngine.gameId);
  const runner = `
import os
import sys
root, game_dir, sdk_root = sys.argv[1:4]
os.chdir(root)
sys.path.insert(0, game_dir)
sys.path.insert(0, sdk_root)
import src.config.paths as sdk_paths
import src.config.config as sdk_config
import src.config.output_filenames as sdk_output
sdk_paths.PATH_TO_GAMES = os.path.join(root, "games")
sdk_config.PATH_TO_GAMES = sdk_paths.PATH_TO_GAMES
sdk_output.PATH_TO_GAMES = sdk_paths.PATH_TO_GAMES
from game_config import GameConfig
from gamestate import GameState
state = GameState(GameConfig())
state.betmode = "base"
state.criteria = "basegame"
state.run_spin(31)
types = [event["type"] for event in state.book.events]
assert types.index("reveal") < types.index("winInfo") < types.index("mysteryTransform") < types.index("boardTransform") < types.index("tumbleBoard"), types
reveal = next(event for event in state.book.events if event["type"] == "reveal")
assert all(symbol["name"] == "H1" for reel in reveal["board"][:3] for symbol in reel), reveal
assert all(symbol["name"] == "H2" for reel in reveal["board"][3:] for symbol in reel), reveal
state.get_current_betmode().lock_force_keys()
assert isinstance(state.get_current_betmode().get_force_keys(), tuple)
state.num_sims = 1
state.criteria = "basegame"
state.run_spin(32)
assert isinstance(state.get_current_betmode().get_force_keys(), list)
`;
  try {
    for (const [relative, contents] of Object.entries(new MathSDKExporter(project).generateFiles())) {
      const target = join(temp, relative);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    const result = spawnSync(python, ['-c', runner, temp, gameDir, sdkRoot], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('free spins reuse the base strip when no dedicated free-spin strip is authored', () => {
  const project = projectFor('ways');
  project.math.betModes[0].profile.triggerFreeSpins = true;
  project.math.freespinTriggers = { basegame: { 3: 10, 4: 15, 5: 20 }, freegame: {} };
  const files = new MathSDKExporter(project).generateFiles();
  const config = files['games/ways_compiler_test/game_config.py'];
  assert.match(config, /"free_reel_set": "BR0"/);
  assert.doesNotMatch(config, /FR0/);
  assert.ok(files['games/ways_compiler_test/reels/BR0.csv']);
  assert.equal(files['games/ways_compiler_test/reels/FR0.csv'], undefined);
});

test('generated Python is syntax-valid and prototype-only game types fail closed', () => {
  assert.throws(() => new MathSDKExporter(projectFor('holdAndSpin')).generateFiles(), /does not yet have a production math compiler/);

  const temp = mkdtempSync(join(tmpdir(), 'stakestudio-python-'));
  try {
    for (const gameType of ['lines', 'ways', 'cluster', 'scatter']) {
      const project = projectFor(gameType);
      if (gameType === 'lines') project.math.paylines = generateDefaultPaylines(project.math.grid);
      for (const [relative, contents] of Object.entries(new MathSDKExporter(project).generateFiles())) {
        if (!relative.endsWith('.py')) continue;
        const target = join(temp, relative);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, contents);
      }
    }
    const pythonFiles = [];
    for (const gameType of ['lines', 'ways', 'cluster', 'scatter']) {
      const id = `${gameType}_compiler_test`;
      for (const name of ['game_config.py', 'gamestate.py', 'game_override.py', 'game_executables.py', 'game_calculations.py', 'game_events.py', 'game_optimization.py', 'run.py']) {
        pythonFiles.push(join(temp, 'games', id, name));
      }
    }
    const result = spawnSync('python3', ['-m', 'py_compile', ...pythonFiles], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('generated win families execute a real max-win round against the official math-sdk', () => {
  const temp = mkdtempSync(join(tmpdir(), 'stakestudio-runtime-'));
  const sdkRoot = resolveMathSdkRoot();
  const python = join(sdkRoot, 'env', 'bin', 'python');
  const runner = `
import os
import sys

root, game_dir, sdk_root = sys.argv[1:4]
os.chdir(root)
sys.path.insert(0, game_dir)
sys.path.insert(0, sdk_root)

import src.config.paths as sdk_paths
import src.config.config as sdk_config
import src.config.output_filenames as sdk_output
sdk_paths.PATH_TO_GAMES = os.path.join(root, "games")
sdk_config.PATH_TO_GAMES = sdk_paths.PATH_TO_GAMES
sdk_output.PATH_TO_GAMES = sdk_paths.PATH_TO_GAMES

from game_config import GameConfig
from gamestate import GameState

config = GameConfig()
state = GameState(config)
state.betmode = "base"
state.criteria = "wincap"
state.run_spin(17)
assert state.final_win == config.wincap, (state.final_win, config.wincap)
assert len(state.book.events) >= 4, len(state.book.events)

state.criteria = "basegame"
state.run_spin(18)
assert len(state.book.events) >= 2, len(state.book.events)
`;
  try {
    for (const gameType of ['lines', 'ways', 'cluster', 'scatter']) {
      const project = projectFor(gameType);
      if (gameType === 'lines') project.math.paylines = generateDefaultPaylines(project.math.grid);
      if (gameType === 'ways') {
        project.math.bonusMechanics = ['cascades', 'increasingMultipliers', 'multiplierSymbols', 'expandingWilds'];
        project.math.mechanicConfig = {
          cascades: { maxCascades: 3 },
          increasingMultipliers: { startValue: 1, increment: 1, maxValue: 10, persistInBonus: true },
          multiplierSymbols: { values: { basegame: { 1: 8, 2: 2 }, freegame: { 2: 1 } } },
        };
      }
      const gameDir = join(temp, 'games', project.build.stakeEngine.gameId);
      for (const [relative, contents] of Object.entries(new MathSDKExporter(project).generateFiles())) {
        const target = join(temp, relative);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, contents);
      }
      const result = spawnSync(python, ['-c', runner, temp, gameDir, sdkRoot], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${gameType}: ${result.stderr || result.stdout}`);
    }

    const stickyProject = createGameProject({ name: 'Sticky Runtime Test' });
    stickyProject.build.stakeEngine.gameId = 'sticky_runtime_test';
    applyGameBlueprint(stickyProject, 'sticky_reel_forge');
    stickyProject.math.betModes.find(mode => mode.name === 'bonus').profile.stickyTierWeights = { 3: 1 };
    const stickyGameDir = join(temp, 'games', stickyProject.build.stakeEngine.gameId);
    for (const [relative, contents] of Object.entries(new MathSDKExporter(stickyProject).generateFiles())) {
      const target = join(temp, relative);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    const stickyRunner = `${runner}
state.betmode = "bonus"
state.criteria = "freegame"
state.run_spin(19)
event_types = [event["type"] for event in state.book.events]
assert "expandStickyReel" in event_types, event_types
assert state.feature_tier == 3, state.feature_tier
`;
    const stickyResult = spawnSync(python, ['-c', stickyRunner, temp, stickyGameDir, sdkRoot], { encoding: 'utf8' });
    assert.equal(stickyResult.status, 0, `sticky: ${stickyResult.stderr || stickyResult.stdout}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
