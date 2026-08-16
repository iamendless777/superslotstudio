import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { forgeArtBible, lockArtBible } from '../src/engines/assets/VisualAssetFactory.js';
import { buildAssetIntegrityInventory, recordAssetIntegrityQA } from '../src/engines/quality/AssetIntegrityQA.js';
import {
  buildVisualCohesionInventory,
  getVisualCohesionQASummary,
  getVisualSourceFingerprint,
  recordVisualCohesionQA,
} from '../src/engines/quality/VisualCohesionQA.js';

const image = name => `data:image/png;base64,${name}`;

function project() {
  const value = createGameProject({ name: 'Visual Cohesion Fixture' });
  value.theme.style = 'Graphic arctic fantasy with carved silhouettes';
  value.theme.lore = 'A frostbound oath hall surrounds the reels.';
  value.theme.colorPalette = ['#11182E', '#82D8E8', '#71859A', '#D3AF64'];
  value.theme.symbols.forEach(symbol => { symbol.src = image(`symbol-${symbol.name}`); });
  value.theme.cabinet.layers = [
    { id: 'bg', name: 'Background', assetPackRole: 'background', src: image('background') },
    { id: 'fg', name: 'Foreground', assetPackRole: 'foreground', src: image('foreground') },
  ];
  value.theme.submission = {
    background: image('background'), foreground: image('foreground'), providerLogo: image('provider-logo'),
  };
  value.visualFactory.artBible = forgeArtBible(value);
  lockArtBible(value);
  const integritySamples = buildAssetIntegrityInventory(value).map(asset => ({
    id: asset.id, loaded: true, sourceFingerprint: asset.id, mime: 'image/png', portable: true,
    width: Math.max(asset.minWidth, 768), height: Math.max(asset.minHeight, 768), byteLength: 1000,
    decodedBytes: 768 * 768 * 4, hasTransparency: asset.requiredAlpha,
    opaqueEdgeRatio: 0, croppedEdgeRatio: 0, transparentColorRisk: 0,
  }));
  recordAssetIntegrityQA(value, integritySamples);
  return value;
}

function cleanVisualSamples(value) {
  return buildVisualCohesionInventory(value).map(asset => ({
    id: asset.id,
    sourceFingerprint: getVisualSourceFingerprint(asset.src),
    analysis: {
      format: 'stake-studio-visual-analysis-v1', slot: asset.slot, score: 100, passed: true,
      blockers: [], warnings: [], checks: [
        { id: 'palette', name: 'Art Bible palette relationship', passed: true },
        { id: 'thumbnail-contrast', name: 'Readable thumbnail contrast', passed: true },
      ], metrics: {},
    },
  }));
}

test('a complete distinct pack earns fingerprinted visual cohesion evidence', () => {
  const value = project();
  const summary = recordVisualCohesionQA(value, cleanVisualSamples(value));
  assert.equal(summary.complete, true);
  assert.equal(summary.passedAssets, summary.totalAssets);
  assert.equal(summary.checks.every(check => check.passed), true);
});

test('duplicated symbol art and disconnected submission art fail whole-pack contracts', () => {
  const value = project();
  value.theme.symbols[1].src = value.theme.symbols[0].src;
  value.theme.submission.foreground = image('different-foreground');
  recordAssetIntegrityQA(value, buildAssetIntegrityInventory(value).map(asset => ({
    id: asset.id, loaded: true, sourceFingerprint: asset.id, mime: 'image/png', portable: true,
    width: 768, height: 768, byteLength: 1000, decodedBytes: 768 * 768 * 4,
    hasTransparency: asset.requiredAlpha, opaqueEdgeRatio: 0, croppedEdgeRatio: 0, transparentColorRisk: 0,
  })));
  const summary = recordVisualCohesionQA(value, cleanVisualSamples(value));
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => issue.includes('distinct visual source')));
  assert.ok(summary.issues.some(issue => issue.includes('Submission art')));
});

test('missing provider branding does not falsely disconnect matching submission art', () => {
  const value = project();
  value.theme.submission.providerLogo = '';
  recordAssetIntegrityQA(value, buildAssetIntegrityInventory(value).map(asset => ({
    id: asset.id, loaded: Boolean(asset.src), sourceFingerprint: asset.id, mime: asset.src ? 'image/png' : 'external',
    portable: Boolean(asset.src), width: asset.src ? 768 : 0, height: asset.src ? 768 : 0,
    byteLength: asset.src ? 1000 : 0, decodedBytes: asset.src ? 768 * 768 * 4 : 0,
    hasTransparency: asset.requiredAlpha, opaqueEdgeRatio: 0, croppedEdgeRatio: 0,
    transparentColorRisk: 0, error: asset.src ? '' : 'missing source',
  })));
  const summary = recordVisualCohesionQA(value, cleanVisualSamples(value));
  const lineage = summary.checks.find(check => check.id === 'submission-lineage');
  const localAnalysis = summary.checks.find(check => check.id === 'local-visual-analysis');
  assert.equal(lineage.passed, true);
  assert.equal(localAnalysis.passed, true);
  assert.equal(summary.passedAssets, summary.totalAssets - 1);
  assert.ok(summary.issues.some(issue => issue.includes('Provider logo')));
  assert.ok(!summary.issues.some(issue => issue.includes('Submission art')));
});

test('a visual warning blocks the professional pack gate even if the per-asset report passed', () => {
  const value = project();
  const samples = cleanVisualSamples(value);
  samples[0].analysis.score = 93;
  samples[0].analysis.checks[0].passed = false;
  samples[0].analysis.warnings = [{ id: 'palette', name: 'Art Bible palette relationship' }];
  const summary = recordVisualCohesionQA(value, samples);
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => issue.includes('Art Bible palette relationship')));
});

test('replacing any visual source makes prior cohesion evidence stale', () => {
  const value = project();
  recordVisualCohesionQA(value, cleanVisualSamples(value));
  value.theme.symbols[0].src = image('replacement');
  const summary = getVisualCohesionQASummary(value);
  assert.equal(summary.complete, false);
  assert.equal(summary.stale, true);
});
