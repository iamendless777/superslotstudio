import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORST_CASE_LOAD,
  WORST_CASE_VIEWPORTS,
  calculateWorstCaseResources,
  runWorstCaseRuntimeSpike,
} from '../src/engines/factory/spikes/WorstCaseRuntimeSpike.js';

test('Morpheus worst-case spike deterministically budgets 48 cells, HUD and effect load', () => {
  const first = runWorstCaseRuntimeSpike();
  const second = runWorstCaseRuntimeSpike();
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.load.cells, 48);
  assert.equal(first.load.symbolFlipbooks, 48);
  assert.equal(first.load.positionMarkers, 48);
  assert.equal(first.load.particles, 120);
  assert.equal(first.evidence.viewports, 3);
  assert.equal(first.evidence.layoutFits, true);
  assert.equal(first.evidence.fixedWorldAcrossGrowth, true);
  assert.equal(first.evidence.resourceBudgets, true);
  assert.deepEqual(first.layouts.map(layout => layout.viewport.name), ['desktop', 'mobile', 'mini']);
  assert.ok(first.layouts.every(layout => layout.coordinateCells === 48));
  assert.ok(first.resources.every(resource => resource.passed));
});
test('Morpheus worst-case spike exposes compact 8-row legibility risk instead of hiding it', () => {
  const report = runWorstCaseRuntimeSpike();
  assert.equal(report.status, 'proven-with-compact-legibility-risk');
  assert.equal(report.layouts.find(layout => layout.viewport.name === 'desktop').symbolFloorPass, true);
  assert.equal(report.layouts.find(layout => layout.viewport.name === 'mobile').symbolFloorPass, true);
  assert.equal(report.layouts.find(layout => layout.viewport.name === 'mini').symbolFloorPass, false);
  assert.deepEqual(report.evidence.compactProofRequired, ['mini']);
  assert.match(report.layouts.find(layout => layout.viewport.name === 'mini').risks[0], /compact authored-symbol legibility/);
});

test('Morpheus worst-case resource calculation fails closed when a budget is exceeded', () => {
  const result = calculateWorstCaseResources(WORST_CASE_VIEWPORTS.desktop, {
    load: WORST_CASE_LOAD,
    budgets: { textureMemoryBytes: 32 * 1024 * 1024 },
  });
  assert.equal(result.checks.textureMemory, false);
  assert.equal(result.passed, false);
  assert.throws(() => calculateWorstCaseResources(WORST_CASE_VIEWPORTS.desktop, {
    load: { ...WORST_CASE_LOAD, cells: 47 },
  }), /all 48 world cells/);
});
