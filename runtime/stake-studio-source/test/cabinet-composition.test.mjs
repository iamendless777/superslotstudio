import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  FULL_CANVAS_CABINET_MODE,
  LEGACY_PAGE_COMPOSITION_MODE,
  listEditableCompositionLayers,
  resolvePlayerComposition,
  stripGeneratedOverlayArt,
  updateCompositionLayer,
  updatePlayerControlArt,
} from '../src/editor/composition/CabinetComposition.js';

const project = () => ({
  name: 'MORPHEUS: DREAMFALL',
  theme: {
    cabinet: { width: 1280, height: 800, layers: [{ id: 'reels', type: 'reel-area', x: 320, y: 104, width: 640, height: 496, zIndex: 45, visible: true }] },
    character: { poses: { idle: 'data:image/png;base64,idle' }, placement: { x: 872, y: 70, width: 350, height: 620 } },
    environmentAssets: { floraLeft: { src: 'data:image/png;base64,flora', x: 0, y: 445, width: 420, height: 385 } },
  },
});

test('legacy Morpheus composition resolves without migrating the project', () => {
  const value = project();
  const base = resolvePlayerComposition(value, { projectId: 'morpheus_dreamfall', worldActive: false });
  assert.equal(base.character.placement.x, 872);
  assert.equal(base.mode, FULL_CANVAS_CABINET_MODE);
  assert.match(base.hud.art.menu, /morpheus-control-menu/);
  assert.equal(base.featureOverlay.visible, false);
  assert.equal(value.theme.playerInterface, undefined);
  assert.equal(value.theme.featureOverlays, undefined);

  const dreamfall = resolvePlayerComposition(value, { projectId: 'morpheus_dreamfall', worldActive: true });
  assert.equal(dreamfall.featureOverlay.visible, true);
  assert.equal(dreamfall.featureOverlay.src, '');
  assert.equal(dreamfall.featureOverlay.replacesBaseForeground, false);
});

test('existing non-Morpheus projects retain working compatibility control art', () => {
  const value = project();
  value.name = 'Other Game';
  const resolved = resolvePlayerComposition(value, { projectId: 'other_game' });
  assert.match(resolved.hud.art.spin, /morpheus-spin-control/);
  assert.equal(resolved.featureOverlay, null);
  assert.equal(resolved.mode, LEGACY_PAGE_COMPOSITION_MODE);
});

test('explicit Full-Canvas Cabinet mode is stable project data', () => {
  const value = project();
  value.name = 'Other Game';
  value.theme.cabinet.compositionMode = FULL_CANVAS_CABINET_MODE;
  const resolved = resolvePlayerComposition(value, { projectId: 'other_game' });
  assert.equal(resolved.format, 'stake-studio-player-composition-v1');
  assert.equal(resolved.mode, FULL_CANVAS_CABINET_MODE);
});

test('Cabinet linked layers write the exact fields Preview resolves', () => {
  const value = project();
  const character = listEditableCompositionLayers(value).find(layer => layer.compositionBinding === 'character');
  Object.assign(character, { x: 740, y: 82, width: 390, height: 610 });
  updateCompositionLayer(value, character);

  const environment = listEditableCompositionLayers(value).find(layer => layer.compositionBinding === 'environment:floraLeft');
  Object.assign(environment, { x: 12, visible: false });
  updateCompositionLayer(value, environment);

  updatePlayerControlArt(value, 'spin', 'data:image/png;base64,new-spin');
  const resolved = resolvePlayerComposition(value, { projectId: 'morpheus_dreamfall' });
  assert.deepEqual(resolved.character.placement, { x: 740, y: 82, width: 390, height: 610 });
  assert.equal(resolved.environment.floraLeft.x, 12);
  assert.equal(resolved.environment.floraLeft.visible, false);
  assert.equal(resolved.hud.art.spin, 'data:image/png;base64,new-spin');
});

test('linked character placement follows and updates the active Spine rig', () => {
  const value = project();
  value.animation = {
    runtime: { activeSpineAsset: 'hero' },
    spineAssets: [{ name: 'hero', placement: { x: 925, y: 66, width: 355, height: 650, anchorX: 0.5 } }],
  };
  let resolved = resolvePlayerComposition(value);
  assert.equal(resolved.character.placement.x, 925);
  const character = listEditableCompositionLayers(value).find(layer => layer.compositionBinding === 'character');
  Object.assign(character, { x: 800, y: 72 });
  updateCompositionLayer(value, character);
  resolved = resolvePlayerComposition(value);
  assert.equal(resolved.character.placement.x, 800);
  assert.equal(value.animation.spineAssets[0].placement.x, 800);
  assert.equal(value.animation.spineAssets[0].placement.anchorX, 0.5);
});

test('Preview and Cabinet consume the shared composition contract', () => {
  const preview = fs.readFileSync(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
  const cabinet = fs.readFileSync(new URL('../src/editor/cabinet/CabinetEditor.js', import.meta.url), 'utf8');
  assert.match(preview, /resolvePlayerComposition/);
  assert.match(preview, /hud\.art\.spin/);
  assert.match(preview, /featureCabinet\?\.visible/);
  assert.match(cabinet, /listEditableCompositionLayers/);
  assert.match(cabinet, /updateCompositionLayer/);
  assert.match(cabinet, /data-control-art/);
  assert.match(cabinet, /renderReelGhost/);
  assert.match(cabinet, /cabinet-reel-ghost/);
});

test('authored temple cabinet is the game — do not swap in a scene-matte well', () => {
  const value = project();
  value.theme.cabinet.layers.push({
    id: 'temple', type: 'image', src: '/assets/temple.png', x: 0, y: 0, width: 1280, height: 800, visible: true, zIndex: 1,
  });
  const dreamfall = resolvePlayerComposition(value, { projectId: 'morpheus', worldActive: true });
  assert.equal(dreamfall.featureOverlay.src, '');
  assert.equal(dreamfall.featureOverlay.replacesBaseForeground, false);
  assert.equal(dreamfall.cabinet.layers.find(layer => layer.type === 'reel-area').width, 640);
});

test('loading a project strips generated well plates off the authored cabinet', () => {
  const value = project();
  value.theme.featureOverlays = {
    dreamfall: { src: '/assets/morpheus-dreamfall-scene-matte-v1.png', replacesBaseForeground: true },
  };
  value.theme.cabinet.layers.push({
    id: 'shaft', type: 'image', src: '/assets/morpheus-dreamfall-shaft-pillars-v1.png', visible: true,
  });
  stripGeneratedOverlayArt(value);
  assert.equal(value.theme.featureOverlays.dreamfall.src, '');
  assert.equal(value.theme.featureOverlays.dreamfall.replacesBaseForeground, false);
  assert.equal(value.theme.cabinet.layers.at(-1).src, '');
});
