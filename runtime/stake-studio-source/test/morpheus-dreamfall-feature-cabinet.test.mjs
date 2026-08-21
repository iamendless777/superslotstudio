import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import {
  MORPHEUS_DREAMFALL_CABINET_PROFILE,
  resolveMorpheusDreamfallCabinetProfile,
} from '../src/engines/presentation/morpheus/MorpheusDreamfallCabinetProfile.js';

test('Dreamfall owns a tall safe-opening cabinet without changing Base', () => {
  assert.equal(resolveMorpheusDreamfallCabinetProfile({
    projectId: 'morpheus_dreamfall',
    worldActive: false,
    renderProfile: 'morpheus-dreamfall-render-profile-v1',
  }), null);
  const profile = resolveMorpheusDreamfallCabinetProfile({
    projectId: 'morpheus_dreamfall',
    worldActive: true,
    renderProfile: 'morpheus-dreamfall-render-profile-v1',
  });
  assert.equal(profile, MORPHEUS_DREAMFALL_CABINET_PROFILE);
  assert.ok(profile.safeOpening.x <= profile.reelBay.x);
  assert.ok(profile.safeOpening.y <= profile.reelBay.y);
  assert.ok(profile.safeOpening.x + profile.safeOpening.width >= profile.reelBay.x + profile.reelBay.width);
  assert.ok(profile.safeOpening.y + profile.safeOpening.height >= profile.reelBay.y + profile.reelBay.height);
  assert.ok(profile.reelBay.y + profile.reelBay.height < profile.hudBoundaryY);
  assert.equal(existsSync(new URL('../public/assets/morpheus-dreamfall-scene-matte-v1.png', import.meta.url)), false);
  assert.equal(existsSync(new URL('../public/assets/morpheus-nexus-scene-matte-v1.png', import.meta.url)), false);
  assert.equal(profile.layers.glow, 'motion-graphic');
  assert.equal(profile.growth.maximumCells, 48);
  assert.equal(profile.growth.guaranteedMax, false);
  assert.equal(profile.growth.minimumRows, 4);
  assert.equal(profile.growth.maximumRows, 8);
});

test('feature cabinet refuses accidental activation outside its typed project/profile', () => {
  assert.equal(resolveMorpheusDreamfallCabinetProfile({ projectId: 'other', worldActive: true, renderProfile: 'morpheus-dreamfall-render-profile-v1' }), null);
  assert.equal(resolveMorpheusDreamfallCabinetProfile({ projectId: 'morpheus_dreamfall', worldActive: true, renderProfile: 'base' }), null);
});

test('Preview and compiled frontend share the same active-only cabinet contract', () => {
  const preview = readFileSync(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
  const compiler = readFileSync(new URL('../server/frontend-compiler.mjs', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  assert.match(preview, /resolveMorpheusDreamfallCabinetProfile/);
  assert.match(preview, /replacesBaseForeground/);
  assert.match(compiler, /MORPHEUS_DREAMFALL_CABINET_PROFILE/);
  assert.match(app, /authored-world-dreamfall-cabinet/);
  assert.match(app, /ui\.dreamfallCabinet\.hidden = !dreamfallWorldActive/);
});
