import test from 'node:test';
import assert from 'node:assert/strict';

import { auditSpineAsset } from '../src/engines/animation/SpineAssetAudit.js';

function asset() {
  return {
    name: 'hero', regions: ['body', 'cape'],
    rawJSON: {
      bones: [{ name: 'root' }, { name: 'cape' }],
      slots: [{ name: 'body', bone: 'root' }, { name: 'cape', bone: 'cape' }],
      physics: [{ name: 'cape-physics', bone: 'cape' }],
      skins: [{
        name: 'default', attachments: {
          body: { body: { type: 'mesh', uvs: [0, 0, 1, 0, 1, 1, 0, 1], vertices: [1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1] } },
          cape: { cape: { type: 'region' } },
        },
      }],
      animations: {
        idle: {
          bones: { cape: { rotate: [{ time: 0, value: 0 }, { time: 1, value: 6 }] } },
          events: [{ time: 0.5, name: 'cloth' }],
        },
      },
    },
  };
}

test('Spine audit reports meshes, weights, physics, timelines, and event keys', () => {
  const report = auditSpineAsset(asset());
  assert.equal(report.valid, true);
  assert.equal(report.metrics.meshes, 1);
  assert.equal(report.metrics.weightedMeshes, 1);
  assert.equal(report.metrics.constraints.physics, 1);
  assert.equal(report.metrics.eventKeys, 1);
  assert.ok(report.metrics.timelines >= 2);
  assert.ok(report.features.includes('1 physics constraint'));
});

test('Spine audit blocks rendered attachments missing from the atlas', () => {
  const value = asset();
  value.regions = ['cape'];
  const report = auditSpineAsset(value);
  assert.equal(report.valid, false);
  assert.equal(report.issues[0].id, 'missing-atlas-regions');
  assert.deepEqual(report.metrics.missingRegions, ['body/body']);
});

test('Spine audit flags expensive clipping geometry', () => {
  const value = asset();
  value.rawJSON.skins[0].attachments.mask = {
    mask: { type: 'clipping', vertexCount: 5, vertices: [0, 0, 5, 0, 2, 2, 5, 5, 0, 5] },
  };
  const report = auditSpineAsset(value);
  assert.ok(report.issues.some(item => item.id === 'expensive-clipping'));
});
