import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  LAYOUT_VIEWPORTS,
  getViewportLayoutSummary,
  recordViewportLayoutQA,
} from '../src/engines/quality/ViewportLayoutQA.js';

function project() {
  return createGameProject({ name: 'Viewport Layout Fixture' });
}

function healthySamples() {
  const sizes = {
    desktop: [1500, 760, 118, 50, 150, 150, 10, 19],
    mobile: [667, 375, 103, 45, 70, 75, 8.4, 14],
    mini: [400, 250, 88, 45, 47, 50, 7.5, 12.5],
  };
  return LAYOUT_VIEWPORTS.map(viewport => {
    const [viewportWidth, viewportHeight, spinWidth, spinHeight, symbolWidth, symbolHeight, labelFont, valueFont] = sizes[viewport];
    return {
      viewport, viewportWidth, viewportHeight, overflowX: 0, overflowY: 0, stageScale: 0.5,
      stage: { x: 0, y: 0, width: viewportWidth, height: viewportHeight },
      reels: { x: viewportWidth * 0.12, y: viewportHeight * 0.12, width: viewportWidth * 0.76, height: viewportHeight * 0.6 },
      hud: { x: 0, y: viewportHeight * 0.78, width: viewportWidth, height: viewportHeight * 0.22 },
      spin: { x: viewportWidth / 2 - spinWidth / 2, y: viewportHeight * 0.82, width: spinWidth, height: spinHeight },
      controlTargets: [
        { id: 'menu', x: 10, y: viewportHeight * 0.82, width: 48, height: 48 },
        { id: 'spin', x: viewportWidth / 2 - spinWidth / 2, y: viewportHeight * 0.82, width: spinWidth, height: spinHeight },
        { id: 'turbo', x: viewportWidth - 58, y: viewportHeight * 0.82, width: 48, height: 48 },
      ],
      minimumSymbolWidth: symbolWidth, minimumSymbolHeight: symbolHeight,
      hudLabelFontPx: labelFont, hudValueFontPx: valueFont, controlsOverlap: false,
    };
  });
}

test('all three measured layouts satisfy safe-zone and accessibility budgets', () => {
  const value = project();
  const summary = recordViewportLayoutQA(value, healthySamples());
  assert.equal(summary.complete, true);
  assert.equal(summary.samples.length, 3);
  assert.equal(summary.tightestSpin.viewport, 'mobile');
  assert.equal(summary.tightestControl.id, 'spin');
  assert.equal(summary.smallestSymbol.viewport, 'mini');
});

test('cropping, tiny controls, illegible symbols, and collisions block layout approval', () => {
  const value = project();
  const samples = healthySamples();
  samples[1].overflowX = 12;
  samples[1].stage.width += 20;
  samples[2].controlTargets[2].width = 24;
  samples[2].minimumSymbolWidth = 22;
  samples[2].hudLabelFontPx = 5;
  samples[2].controlsOverlap = true;
  const summary = recordViewportLayoutQA(value, samples);
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => issue.includes('mobile scrolls')));
  assert.ok(summary.issues.some(issue => issue.includes('mini turbo control')));
  assert.ok(summary.issues.some(issue => issue.includes('mini HUD typography')));
  assert.ok(summary.issues.some(issue => issue.includes('mini HUD controls overlap')));
});

test('cabinet changes make previous viewport evidence stale', () => {
  const value = project();
  recordViewportLayoutQA(value, healthySamples());
  value.theme.cabinet.width += 100;
  const summary = getViewportLayoutSummary(value);
  assert.equal(summary.complete, false);
  assert.equal(summary.stale, true);
});
