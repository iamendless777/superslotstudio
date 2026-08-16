import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  PERFORMANCE_VIEWPORTS,
  estimateEmbeddedAssetBytes,
  getPerformanceProfileSummary,
  recordPerformanceProfile,
} from '../src/engines/quality/PerformanceProfiler.js';

function project() {
  const value = createGameProject({ name: 'Performance Fixture' });
  value.production.budgets.targetFps = 60;
  value.production.budgets.maxTextureMemoryMb = 96;
  return value;
}

function healthySamples() {
  return PERFORMANCE_VIEWPORTS.map((viewport, index) => ({
    viewport, frames: 48, averageMs: 16.6 + index * 0.2, p95Ms: 18 + index,
    maxMs: 24, longFrames: 0, fps: 60 - index,
    textureMemoryBytes: (24 + index) * 1024 * 1024,
    renderSurfaces: 75, domNodes: 220, viewportWidth: 1280, viewportHeight: 720,
  }));
}

test('a measured desktop, mobile, and mini profile satisfies the performance gate', () => {
  const value = project();
  const summary = recordPerformanceProfile(value, healthySamples(), { embeddedAssetBytes: 3 * 1024 * 1024 });
  assert.equal(summary.complete, true);
  assert.equal(summary.samples.length, 3);
  assert.equal(summary.slowest.viewport, 'mini');
  assert.equal(summary.peakTextureBytes, 26 * 1024 * 1024);
});

test('asset changes make a previously passing performance profile stale', () => {
  const value = project();
  recordPerformanceProfile(value, healthySamples());
  value.theme.symbols[0].src = 'data:image/png;base64,new-art-revision';
  const summary = getPerformanceProfileSummary(value);
  assert.equal(summary.complete, false);
  assert.equal(summary.stale, true);
});

test('unstable frame pacing and excess texture memory block the profile', () => {
  const value = project();
  const samples = healthySamples();
  samples[1].averageMs = 24;
  samples[1].p95Ms = 41;
  samples[1].longFrames = 8;
  samples[2].textureMemoryBytes = 110 * 1024 * 1024;
  const summary = recordPerformanceProfile(value, samples);
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => issue.includes('mobile average frame time')));
  assert.ok(summary.issues.some(issue => issue.includes('mini estimated texture memory')));
});

test('an isolated captured stall is retained without misreporting sustained frame pacing', () => {
  const value = project();
  const samples = healthySamples();
  samples[1].rawAverageMs = 34;
  samples[1].maxMs = 650;
  samples[1].longFrames = 1;
  const summary = recordPerformanceProfile(value, samples);
  assert.equal(summary.complete, true);
  assert.equal(summary.samples[1].rawAverageMs, 34);
  assert.equal(summary.samples[1].maxMs, 650);
});

test('embedded load estimate deduplicates repeated data URLs', () => {
  const value = project();
  const source = 'data:image/png;base64,QUJDRA==';
  value.theme.symbols[0].src = source;
  value.theme.symbols[1].src = source;
  assert.equal(estimateEmbeddedAssetBytes(value), 4);
});
