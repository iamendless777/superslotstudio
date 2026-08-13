import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createMorpheusReservedWorldLayout } from '../src/engines/presentation/morpheus/MorpheusDreamfallPreviewDriver.js';
import {
  MORPHEUS_DREAMFALL_RENDER_PROFILE,
  createMorpheusContentSafeRect,
  createMorpheusDreamfallRenderProfile,
  createMorpheusDreamfallWorldState,
  createMorpheusMotionSafeRect,
  evaluateMorpheusRenderAspectMetrics,
  resolveMorpheusMotionRowCount,
} from '../src/engines/presentation/morpheus/MorpheusDreamfallRenderProfile.js';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Dreamfall active render profile produces exact square design and mini cells without HUD collision', () => {
  const design = createMorpheusDreamfallRenderProfile();
  assert.deepEqual(design.world, { x: 413, y: 16, width: 470, height: 600 });
  assert.deepEqual(design.cell, { width: 75, height: 75, aspectRatio: 1 });
  assert.equal(design.world.y + design.world.height, 616);
  assert.equal(MORPHEUS_DREAMFALL_RENDER_PROFILE.hudTop, 624);

  const mini = createMorpheusDreamfallRenderProfile({ viewportWidth: 400, viewportHeight: 250 });
  assert.equal(mini.stageScale, 0.3125);
  assert.deepEqual(mini.renderedCell, { width: 23.4375, height: 23.4375, aspectRatio: 1 });
  assert.deepEqual(mini.renderedWorld, { x: 129.0625, y: 5, width: 146.875, height: 187.5 });
});

test('Dreamfall world activation is explicit, serializable, and carries checkpoint reel state', () => {
  const base = createMorpheusDreamfallWorldState();
  assert.equal(base.active, false);
  assert.equal(base.status, 'inactive');
  assert.equal(base.checkpointHash, null);

  const checkpoint = createMorpheusDreamfallWorldState({
    active: true,
    reason: 'checkpoint-resume',
    status: 'playing',
    checkpointHash: 'cafef00d',
    reelRows: [4, 5, 6, 7, 8, 4],
  });
  assert.equal(checkpoint.active, true);
  assert.equal(checkpoint.checkpointHash, 'cafef00d');
  assert.deepEqual(checkpoint.reelRows, [4, 5, 6, 7, 8, 4]);
  assert.throws(() => createMorpheusDreamfallWorldState({ active: true, reelRows: [4, 4, 4] }), /six reel heights/);
});

test('Dreamfall square world keeps independent 4 to 5 to 8 masks bottom aligned', () => {
  const sequences = [
    [4, 4, 4, 4, 4, 4],
    [4, 4, 5, 4, 4, 4],
    [4, 4, 8, 4, 4, 4],
  ].map(reelRows => createMorpheusReservedWorldLayout({ worldHeight: 600, reelRows }));
  const masks = sequences.map(layout => layout.reels[2].mask);
  assert.deepEqual(masks.map(mask => mask.bottom), [600, 600, 600]);
  assert.deepEqual(masks.map(mask => mask.height), [300, 375, 600]);
  assert.deepEqual(masks.map(mask => mask.top), [300, 225, 0]);
  assert.ok(sequences.every(layout => layout.cellHeight === 75));
  assert.ok(sequences.every(layout => layout.reels.filter(reel => reel.reel !== 2).every(reel => reel.rows === 4)));
});

test('Dreamfall content and motion safe rectangles preserve authored aspect', () => {
  const square = createMorpheusContentSafeRect({ cellWidth: 75, cellHeight: 75, sourceWidth: 512, sourceHeight: 512 });
  assert.deepEqual(square, { x: 0, y: 0, width: 75, height: 75, aspectRatio: 1, sourceAspectRatio: 1 });

  const portrait = createMorpheusContentSafeRect({ cellWidth: 75, cellHeight: 75, sourceWidth: 314, sourceHeight: 512 });
  assert.equal(portrait.height, 75);
  assert.ok(Math.abs(portrait.width / portrait.height - 314 / 512) < 1e-12);

  const motion = createMorpheusMotionSafeRect({
    cellRect: { x: 100, y: 50, width: 75, height: 75 },
    overlay: { left: 22, top: 4, width: 56, height: 48 },
    sourceAspectRatio: 1,
  });
  assert.equal(motion.safe.width, motion.safe.height);
  assert.ok(motion.safe.x >= motion.bounds.x && motion.safe.y >= motion.bounds.y);
});

test('Dreamfall aspect gate rejects the legacy 1.70 cell and non-uniform motion stretch', () => {
  const legacy = evaluateMorpheusRenderAspectMetrics({
    cellRect: { width: 33, height: 19.375 },
    contentRect: { width: 19.375, height: 19.375 },
    contentSourceAspectRatio: 1,
    motionRect: { width: 33, height: 19.375 },
    motionSourceAspectRatio: 1,
  });
  assert.equal(legacy.passed, false);
  assert.ok(legacy.cellAspectRatio > 1.7);
  assert.ok(legacy.motionAspectError > 0.7);

  const safe = evaluateMorpheusRenderAspectMetrics({
    cellRect: { width: 23.4375, height: 23.4375 },
    contentRect: { width: 23.4375, height: 23.4375 },
    contentSourceAspectRatio: 1,
    motionRect: { width: 23.4375, height: 23.4375 },
    motionSourceAspectRatio: 1,
  });
  assert.equal(safe.passed, true);
});

test('Dreamfall motion row resolver includes grown rows and exposes the legacy omission as a negative control', () => {
  const legacyStaticGridRows = resolveMorpheusMotionRowCount({ worldActive: false, boardRows: 8, baseRows: 4 });
  const activeDreamfallRows = resolveMorpheusMotionRowCount({ worldActive: true, boardRows: 8, baseRows: 4 });
  assert.equal(legacyStaticGridRows, 4);
  assert.equal(activeDreamfallRows, 8);
  assert.deepEqual(Array.from({ length: activeDreamfallRows }, (_, row) => row).slice(4), [4, 5, 6, 7]);
});

test('Preview integrates the active-only square profile without a second renderer or width-only mini reflow', async () => {
  const [preview, styles] = await Promise.all([
    source('../src/editor/preview/PreviewPanel.js'),
    source('../src/styles.css'),
  ]);
  assert.match(preview, /data-dreamfall-world="\$\{this\.isMorpheusDreamfallWorldActive\(\) \? 'active' : 'inactive'\}"/);
  assert.match(preview, /const reservedWorld = this\.isMorpheusDreamfallWorldActive\(\)/);
  assert.match(preview, /createMorpheusDreamfallRenderProfile/);
  assert.match(preview, /resolveMorpheusMotionRowCount/);
  assert.match(preview, /grownRowMotionCoveragePassed/);
  assert.match(preview, /renderAspectIntegrityPassed/);
  assert.match(preview, /createMorpheusContentSafeRect/);
  assert.match(preview, /createMorpheusMotionSafeRect/);
  assert.match(preview, /this\.isMorpheusDreamfallWorldActive\(\) \? '' : `<button class="preview-mode-chip/);
  assert.match(preview, /modeChipReels/);
  assert.match(preview, /'#previewModeChip'/);
  assert.doesNotMatch(preview, /minimumCellWidth|minimumReelWidth/);
  assert.doesNotMatch(preview, /new (?:Pixi|PIXI)\.(?:Application|Container)/);
  assert.match(styles, /data-dreamfall-world="active".*reel-symbol-content-safe/s);
  assert.match(styles, /data-dreamfall-world="active"\] \.reel-sym img[\s\S]*animation: none !important;[\s\S]*transform: none !important;/);
});

test('explicit mode selection exits the retained Dreamfall audit world before Base is rendered', async () => {
  const preview = await source('../src/editor/preview/PreviewPanel.js');
  const selectPlayerMode = preview.match(/selectPlayerMode\(name\) \{[\s\S]*?\n  \}/)?.[0] || '';
  const commitFinal = preview.match(/async commitMorpheusDreamfallFinal\([\s\S]*?\n  \}/)?.[0] || '';

  assert.match(commitFinal, /this\.retainMorpheusDreamfallWorldForAudit/);
  assert.match(preview, /reason: 'signature-audit-retained'/);
  assert.match(selectPlayerMode, /if \(this\.isMorpheusDreamfallWorldActive\(\)\)/);
  assert.match(selectPlayerMode, /this\.deactivateMorpheusDreamfallWorld\(`mode-selection:\$\{mode\.name\}`\)/);
  assert.ok(
    selectPlayerMode.indexOf('deactivateMorpheusDreamfallWorld') < selectPlayerMode.indexOf('this.render()'),
    'Dreamfall must deactivate before Base or another selected mode renders',
  );
});

test('max-growth evidence declares the exact square-safe render-profile format', async () => {
  const preview = await source('../src/editor/preview/PreviewPanel.js');
  const maxGrowth = preview.match(/async presentMorpheusMaxGrowthForAudit\(\) \{[\s\S]*?\n  \}/)?.[0] || '';

  assert.match(maxGrowth, /renderProfileFormat: MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT/);
});
