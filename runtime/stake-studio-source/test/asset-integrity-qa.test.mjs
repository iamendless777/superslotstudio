import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  buildAssetIntegrityInventory,
  getAssetIntegritySummary,
  recordAssetIntegrityQA,
} from '../src/engines/quality/AssetIntegrityQA.js';
import { normalizeProductionProfile } from '../src/engines/quality/QualityDirector.js';

function project() {
  const value = createGameProject({ name: 'Asset Integrity Fixture' });
  value.theme.symbols.forEach(symbol => { symbol.src = `data:image/png;base64,${symbol.name}`; });
  value.theme.submission = {
    background: 'data:image/jpeg;base64,background',
    foreground: 'data:image/png;base64,foreground',
    providerLogo: 'data:image/png;base64,logo',
  };
  return value;
}

function healthySamples(value) {
  return buildAssetIntegrityInventory(value).map(asset => ({
    id: asset.id, loaded: true, sourceFingerprint: asset.id,
    mime: asset.role === 'submission-background' ? 'image/jpeg' : 'image/png', portable: true,
    width: Math.max(asset.minWidth, 256), height: Math.max(asset.minHeight, 256),
    byteLength: 96 * 1024, decodedBytes: Math.max(asset.minWidth, 256) * Math.max(asset.minHeight, 256) * 4,
    hasTransparency: asset.requiredAlpha, opaqueEdgeRatio: 0.02, croppedEdgeRatio: 0.03, transparentColorRisk: 0,
  }));
}

test('decoded production images and a safe atlas satisfy the integrity gate', () => {
  const value = project();
  const summary = recordAssetIntegrityQA(value, healthySamples(value));
  assert.equal(summary.complete, true);
  assert.equal(summary.passedAssets, summary.totalAssets);
  assert.equal(summary.atlasReady, true);
});

test('decode, resolution, alpha, format, and halo defects are blocking', () => {
  const value = project();
  const samples = healthySamples(value);
  const symbol = samples.find(sample => sample.id === `symbol:${value.theme.symbols[0].name}`);
  symbol.mime = 'image/jpeg';
  symbol.width = 64;
  symbol.height = 64;
  symbol.hasTransparency = false;
  symbol.opaqueEdgeRatio = 1;
  symbol.transparentColorRisk = 0.2;
  const logo = samples.find(sample => sample.id === 'submission:providerLogo');
  logo.loaded = false;
  logo.error = 'decoder rejected source';
  const summary = recordAssetIntegrityQA(value, samples);
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => issue.includes('requires at least 128×128')));
  assert.ok(summary.issues.some(issue => issue.includes('requires transparency but uses JPEG')));
  assert.ok(summary.issues.some(issue => issue.includes('Provider logo could not be decoded')));
});

test('unpacked atlas sources and unsafe padding block the audit', () => {
  const value = project();
  value.atlas.assets = [{ name: 'H1', src: value.theme.symbols[0].src, width: 256, height: 256 }];
  value.atlas.padding = 0;
  const summary = recordAssetIntegrityQA(value, healthySamples(value));
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => issue.includes('no current packed sheet')));
  assert.ok(summary.issues.some(issue => issue.includes('production requires at least 2px')));
});

test('art replacement makes previous integrity evidence stale', () => {
  const value = project();
  recordAssetIntegrityQA(value, healthySamples(value));
  value.theme.symbols[0].src = 'data:image/png;base64,replacement';
  const summary = getAssetIntegritySummary(value);
  assert.equal(summary.complete, false);
  assert.equal(summary.stale, true);
});

test('adding the default production budget does not invalidate equivalent integrity evidence', () => {
  const value = project();
  delete value.production.budgets.maxTextureMemoryMb;
  recordAssetIntegrityQA(value, healthySamples(value));
  value.production = normalizeProductionProfile(value.production);
  const summary = getAssetIntegritySummary(value);
  assert.equal(summary.fresh, true);
  assert.equal(summary.complete, true);
});
