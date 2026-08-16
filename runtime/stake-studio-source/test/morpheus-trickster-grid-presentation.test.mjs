import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('Studio Preview primes the complete Trickster grid before physical reel motion', async () => {
  const preview = await source('../src/editor/preview/PreviewPanel.js');
  assert.match(preview, /for \(const event of visibleSpin\.state \|\| \[\]\) \{/);
  assert.match(preview, /if \(event\.type === 'reveal'\) break;/);
  assert.match(preview, /if \(event\.type !== 'modeGridStart'\) continue;/);
  assert.match(preview, /this\.applyPersistentMechanicState\(event\);[\s\S]*this\.syncFeatureStateMarkers\(\);/);
  assert.match(preview, /this\.prePresentedMechanicEvents\.add\(event\);/);
  assert.match(preview, /this\.prePresentedMechanicEvents\.has\(event\)/);
});

test('Studio Preview renders every 1x position and mode-aware charged values', async () => {
  const [preview, styles] = await Promise.all([
    source('../src/editor/preview/PreviewPanel.js'),
    source('../src/styles.css'),
  ]);
  assert.match(preview, /this\.featurePositionGridMode = event\.mode \|\| 'oneiric_nexus'/);
  assert.match(preview, /if \(this\.featurePositionGridMode\) addGridPlate\(reel, row, multiplier\)/);
  assert.doesNotMatch(preview, /for \(const \[key, multiplier\] of this\.featurePositionMultipliers\) \{\s*if \(multiplier <= 1\) continue;/);
  assert.match(preview, /TRICKSTER DREAM/);
  assert.match(preview, /collectPositionGridLayoutProof\(\)/);
  assert.match(preview, /morpheus-position-grid-layout-proof-v1/);
  assert.match(preview, /plate\.position === 'absolute'/);
  assert.match(preview, /plate\.valuePosition === 'absolute'/);
  assert.match(preview, /new Set\(coordinateKeys\)\.size === plates\.length/);
  assert.match(preview, /overlaps\.length === 0/);
  assert.match(styles, /\.preview-position-grid-plate/);
  assert.match(styles, /data-position-grid-mode="trickster_dream"/);
  assert.match(styles, /preview-position-grid-charge/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test('the live Studio cache key advances with the governed per-cell grid stylesheet', async () => {
  const [index, styles] = await Promise.all([
    source('../index.html'),
    source('../src/styles.css'),
  ]);
  assert.match(index, /styles\.css\?v=control-targets-20260815-9/);
  assert.match(styles, /\.preview-position-grid-plate\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(styles, /\.preview-position-grid-plate b\s*\{[\s\S]*?position:\s*absolute/);
});

test('portable frontend preserves the same visible grid and clears it at each round boundary', async () => {
  const [app, styles] = await Promise.all([
    source('../server/frontend-template/game-app.js'),
    source('../server/frontend-template/styles.css'),
  ]);
  assert.match(app, /let positionGridMode = ''/);
  assert.match(app, /positionGridMode = event\.mode \|\| 'oneiric_nexus'/);
  assert.match(app, /if \(positionGridMode\) \{/);
  assert.match(app, /position-grid-plate/);
  assert.match(app, /highlightWins\(\[\]\); clearMechanicState\(\);/);
  assert.match(app, /Trickster Dream/);
  assert.match(styles, /\.position-grid-plate/);
  assert.match(styles, /data-position-grid-mode="trickster_dream"/);
  assert.match(styles, /compiled-position-grid-charge/);
});
