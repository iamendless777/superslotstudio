import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createMorpheusDreamfallRenderProfile } from '../src/engines/presentation/morpheus/MorpheusDreamfallRenderProfile.js';

test('Dreamfall status HUD stays in the left safe-zone at desktop, mobile, and mini scales', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const rule = styles.match(/\.preview-stage\[data-dreamfall-world="active"\] #previewDreamfallHud \{[\s\S]*?\}/)?.[0] || '';

  assert.match(rule, /left:\s*2%\s*!important/);
  assert.match(rule, /right:\s*auto\s*!important/);

  for (const viewport of [
    { name: 'desktop', width: 1780, height: 902, hudRightInStage: (1280 * 0.02) + 300 },
    { name: 'mobile', width: 667, height: 375, hudRightInStage: 10 + 390 },
    { name: 'mini', width: 400, height: 250, hudRightInStage: 10 + 390 },
  ]) {
    const profile = createMorpheusDreamfallRenderProfile({
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    assert.ok(
      viewport.hudRightInStage * profile.stageScale < profile.renderedWorld.x,
      `${viewport.name} Dreamfall HUD must remain left of the reel bay`,
    );
  }
});
