import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  MORPHEUS_DREAMFALL_CABINET_PROFILE,
} from '../src/engines/presentation/morpheus/MorpheusDreamfallCabinetProfile.js';
import {
  MORPHEUS_NEXUS_CABINET_PROFILE,
  resolveMorpheusNexusCabinetProfile,
} from '../src/engines/presentation/morpheus/MorpheusNexusCabinetProfile.js';
import {
  resolvePlayerComposition,
  listEditableCompositionLayers,
} from '../src/editor/composition/CabinetComposition.js';
import { FeatureArchitectureRuntime } from '../src/engines/math/FeatureArchitectureEngine.js';
import { createGameProject } from '../src/engines/schema.js';

const preview = () => readFileSync(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
const motion = () => readFileSync(new URL('../src/editor/preview/PreviewPanelMotion.js', import.meta.url), 'utf8');
const app = () => readFileSync(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
const styles = () => readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const compiledStyles = () => readFileSync(new URL('../server/frontend-template/styles.css', import.meta.url), 'utf8');

test('Dreamfall growth is chance: 48 is the cap, never a guaranteed fill', () => {
  const growth = MORPHEUS_DREAMFALL_CABINET_PROFILE.growth;
  assert.equal(growth.concept, 'per-reel-upward');
  assert.equal(growth.minimumRows, 4);
  assert.equal(growth.maximumRows, 8);
  assert.equal(growth.reels, 6);
  assert.equal(growth.maximumCells, 48);
  assert.equal(growth.guaranteedMax, false);
  assert.equal(growth.trigger, 'random-non-maxed-reel-on-positive-win');
  assert.equal(MORPHEUS_DREAMFALL_CABINET_PROFILE.layers.glow, 'motion-graphic');
  assert.equal(MORPHEUS_DREAMFALL_CABINET_PROFILE.layers.scene, 'authored-cabinet');
  assert.equal(MORPHEUS_DREAMFALL_CABINET_PROFILE.asset.zIndex, 38);
});

test('math grows one random non-maxed reel per win and will not force 48 tiles', () => {
  const project = createGameProject({ name: 'Dreamfall chance proof' });
  project.math.grid = { reels: 6, rows: [4, 4, 4, 4, 4, 4] };
  project.math.featureArchitecture = {
    selection: 'exactScatterCount',
    tiers: { 5: { id: 'expand', spins: 10, mechanic: 'winningCascadeReelExpansion', maximumRows: 8 } },
  };
  project.theme.symbols = [
    { id: 'A', name: 'A', payouts: { 3: 0.1 }, special: [] },
  ];
  const board = Array.from({ length: 6 }, () => ['A', 'A', 'A', 'A']);
  const win = { symbol: 'A', positions: [[0, 0], [1, 0], [2, 0]] };
  const runtime = new FeatureArchitectureRuntime(project, { tier: 'expand' });
  runtime.state.reelRows = [4, 4, 4, 4, 4, 4];
  const picked = [];
  let cursor = 0;
  const rand = () => {
    const values = [0, 0.4, 0.9, 0.2, 0.7];
    const value = values[cursor % values.length];
    cursor += 1;
    return value;
  };
  for (let hit = 0; hit < 5; hit += 1) {
    picked.push(runtime.afterWinStep(board, [win], rand).expansions[0]);
  }
  assert.deepEqual(picked, [0, 2, 5, 1, 4]);
  assert.ok(new Set(picked).size > 1);
  const cells = runtime.state.reelRows.reduce((sum, rows) => sum + Number(rows), 0);
  assert.equal(cells, 29);
  assert.ok(cells < 48);
  assert.ok(runtime.state.reelRows.some((rows) => rows === 4), 'some reels stay at the 6×4 start');
  assert.ok(runtime.state.reelRows.every((rows) => rows >= 4 && rows <= 8));

  const maxed = new FeatureArchitectureRuntime(project, { tier: 'expand' });
  maxed.state.reelRows = [8, 8, 8, 8, 8, 8];
  const blocked = maxed.afterWinStep(board, [win, win, win], () => 0);
  assert.deepEqual(blocked.expansions, []);
  assert.deepEqual(maxed.state.reelRows, [8, 8, 8, 8, 8, 8]);
});

test('Oneiric Nexus is a unique 6×4 sanctum and does not grow', () => {
  assert.equal(MORPHEUS_NEXUS_CABINET_PROFILE.growth, false);
  assert.deepEqual(MORPHEUS_NEXUS_CABINET_PROFILE.grid, { reels: 6, rows: 4, persistent: true });
  assert.notEqual(MORPHEUS_NEXUS_CABINET_PROFILE.id, MORPHEUS_DREAMFALL_CABINET_PROFILE.id);
  assert.equal(existsSync(new URL('../public/assets/morpheus-nexus-scene-matte-v1.png', import.meta.url)), false);
  assert.equal(resolveMorpheusNexusCabinetProfile({
    projectId: 'morpheus_dreamfall',
    nexusActive: true,
  }), MORPHEUS_NEXUS_CABINET_PROFILE);
  assert.equal(resolveMorpheusNexusCabinetProfile({
    projectId: 'morpheus_dreamfall',
    nexusActive: false,
  }), null);
  const composition = resolvePlayerComposition({
    name: 'MORPHEUS: DREAMFALL',
    theme: { cabinet: { width: 1280, height: 800, layers: [] } },
  }, { projectId: 'morpheus_dreamfall', worldActive: false, nexusActive: true });
  assert.equal(composition.nexusOverlay, null);
  assert.equal(composition.featureOverlay, null);
});

test('Play Motion Dreamfall grow rehearses a jagged chance bonus, not 48 tiles', () => {
  const source = motion();
  assert.match(source, /id: 'dreamfall-grow'/);
  assert.match(source, /id: 'nexus-grid'/);
  assert.match(source, /growths = \[0, 2, 5, 2, 3, 0\]/);
  assert.match(source, /growth is chance/);
  assert.match(source, /heights\.reduce\(\(sum, rows\) => sum \+ rows, 0\)/);
  assert.match(source, /playNexusGridRehearsal/);
  assert.doesNotMatch(source, /Array\(6\)\.fill\(8\)/);
});

test('special looks are type-specific, not a generic energy tap', () => {
  const source = preview();
  assert.match(source, /expandStickyReel: 'look-veil-expand'/);
  assert.match(source, /lucidWildMultiplier: 'look-lucid-badge'/);
  assert.match(source, /wildBomb: Number\(event\.size\) >= 3 \? 'look-golden-rift' : 'look-dream-rift'/);
  assert.match(source, /echoSplit: 'look-echo-split'/);
  assert.match(source, /symbolPurge: 'look-dawn-purge'/);
  assert.match(source, /wildStar: 'look-star-morph'/);
  assert.match(source, /mysteryTransform: 'look-mystery-flip'/);
  assert.match(source, /maxDream: 'look-max-takeover'/);
  assert.match(source, /expandReelHeight: 'look-shaft-grow'/);
  assert.match(source, /positionMultiplierGridUpdate: 'look-plate-stamp'/);
  const css = styles();
  assert.match(css, /@keyframes look-veil-expand/);
  assert.match(css, /@keyframes look-shaft-dust/);
  assert.match(css, /@keyframes look-plate-stamp/);
  assert.match(css, /@keyframes look-grid-awaken/);
  assert.match(css, /mix-blend-mode: screen/);
});

test('living cabinet layers keep glow as motion graphics in front of a matte plate', () => {
  const css = styles();
  assert.match(css, /\.living-colosseum-glow/);
  assert.match(css, /\.living-nexus-glow/);
  assert.match(css, /\.living-shaft/);
  assert.match(css, /\.shaft-cap-glow/);
  assert.match(css, /animation: colosseum-breathe/);
  const compiled = compiledStyles();
  assert.match(compiled, /\.living-cabinet-glow \{[\s\S]*z-index: 45/);
  assert.match(compiled, /\.board\.is-dreamfall-world,[\s\S]*z-index: 50/);
  assert.match(compiled, /\.authored-world-dreamfall-cabinet,[\s\S]*object-fit: cover/);
  assert.match(app(), /living-colosseum-glow/);
  assert.match(app(), /nexusWorldActive = false/);
  assert.match(app(), /ui\.dreamfallCabinet\.hidden = !dreamfallWorldActive;/);
  assert.doesNotMatch(app(), /dreamfallCabinet\.hidden = !dreamfallWorldActive \|\| fullCanvasComposition/);
});

test('Cabinet editor does not invent empty Dreamfall or Nexus plates', () => {
  const layers = listEditableCompositionLayers({
    name: 'MORPHEUS: DREAMFALL',
    theme: { cabinet: { width: 1280, height: 800, layers: [] } },
  });
  assert.equal(layers.some((layer) => layer.compositionBinding === 'feature:dreamfall'), false);
  assert.equal(layers.some((layer) => layer.compositionBinding === 'feature:nexus'), false);
});

test('live SPIN enters the 6×4 well and lifts a random reel instead of jumping to 48', () => {
  const source = preview();
  assert.match(source, /enterMorpheusFeatureWorld\(mode, event\.type\)/);
  assert.match(source, /enterMorpheusFeatureWorld\(presentationMode, 'feature-entry'\)/);
  assert.match(source, /async playLiveDreamfallGrowth\(event, board = this\.board\)/);
  assert.match(source, /if \(event\.type === 'expandReelHeight'\) \{\s*await this\.playLiveDreamfallGrowth/);
  assert.match(source, /createMorpheusReservedWorldLayout\(\{[\s\S]*reelRows: beforeHeights/);
  const liveGrow = source.slice(source.indexOf('async playLiveDreamfallGrowth'), source.indexOf('async playDerivedWinMechanics'));
  assert.match(liveGrow, /timeline\.to\(shaft, \{ top: after\.mask\.top, height: after\.mask\.height/);
  assert.doesNotMatch(liveGrow, /timeline\.to\(mask/);
  assert.match(source, /grownCounts/);
  assert.match(source, /tileCounts/);
  assert.match(source, /const customLook = \{[\s\S]*expandStickyReel: true[\s\S]*modeGridStart: true/);
  const mechanic = source.slice(source.indexOf('async playSpecialMechanicEvent'), source.indexOf('async playLiveDreamfallGrowth'));
  assert.match(mechanic, /if \(!customLook && uniqueTargets\.length\)/);
  assert.doesNotMatch(mechanic, /event\.type === 'expandReelHeight'[\s\S]{0,200}playEnergyTaps/);
  assert.match(source, /expansionReels\.map\(\(reel\) => this\.cellAt\(reel, 0\)\)/);

  const motionSource = motion();
  assert.match(motionSource, /id = 'previewLiveDreamfall'/);
  assert.match(motionSource, /id = 'previewLiveNexus'/);
  assert.match(motionSource, /playLiveForcedScatter\(5, 'Live Dreamfall'/);
  assert.match(motionSource, /playLiveForcedScatter\(6, 'Live Nexus'/);
  const bridge = readFileSync(new URL('../src/bridge/StudioBridge.js', import.meta.url), 'utf8');
  assert.match(bridge, /playLiveForcedScatter\(forcedScatters, liveLabel, \{ switchToBase: forcedScatters >= 5 \}\)/);

  const portable = app();
  assert.match(portable, /if \(\(dreamfallWorldActive \|\| nexusWorldActive\) && Array\.isArray\(currentBoard\)/);
  assert.match(portable, /visualRowCapacity - grownRows/);
  assert.match(portable, /shaft\.style\.height = `\$\{rows \/ maxRows \* 100\}%`/);
  assert.match(portable, /classList\.add\('is-growing', 'look-shaft-grow'\)/);
  const expansion = portable.match(/case 'expandReelHeight':[\s\S]*?case 'tumbleChainProgress':/)?.[0] || '';
  assert.match(expansion, /await new Promise\(\(resolve\) => window\.setTimeout\(resolve, 420\)\)/);
  assert.ok(
    expansion.indexOf('shaft.style.height') < expansion.indexOf('settleReelMotion'),
    'shaft must lift before any authoritative settle so the empty cave cell is visible',
  );
});
