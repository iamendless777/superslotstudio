import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRigCorrectionManifest,
  getActiveRigCorrections,
  isAngleInRange,
  normalizeBoneAngle,
  validateRigCorrections,
} from '../src/engines/animation/RigCorrectionEngine.js';

function project() {
  return {
    animation: {
      spineAssets: [{
        name: 'hero', bones: ['root', 'upper-arm'], slots: ['elbow-patch'],
        attachments: [
          { skin: 'default', slot: 'elbow-patch', name: 'elbow-straight' },
          { skin: 'default', slot: 'elbow-patch', name: 'elbow-bent' },
        ],
      }],
    },
    production: { rig: { corrections: [], boneLimits: [], drawOrderRules: [], anchors: [], secondaryMotion: [] } },
  };
}

test('normalizes bone rotations and evaluates ranges that cross 180 degrees', () => {
  assert.equal(normalizeBoneAngle(270), -90);
  assert.equal(normalizeBoneAngle(-270), 90);
  assert.equal(isAngleInRange(60, 45, 135), true);
  assert.equal(isAngleInRange(0, 45, 135), false);
  assert.equal(isAngleInRange(175, 160, -160), true);
  assert.equal(isAngleInRange(-175, 160, -160), true);
  assert.equal(isAngleInRange(0, 160, -160), false);
});

test('selects active corrections by asset, state, angle, and priority', () => {
  const value = project();
  value.production.rig.corrections = [
    { id: 'low', name: 'Low', type: 'attachment', asset: 'hero', bone: 'upper-arm', slot: 'elbow-patch', attachment: 'elbow-straight', minAngle: 40, maxAngle: 120, priority: 1 },
    { id: 'high', name: 'High', type: 'attachment', asset: 'hero', bone: 'upper-arm', slot: 'elbow-patch', attachment: 'elbow-bent', minAngle: 60, maxAngle: 140, priority: 10, state: 'winBig' },
    { id: 'overlay', name: 'Fold fill', type: 'overlay', asset: 'hero', bone: 'upper-arm', image: 'data:image/png;base64,eA==', minAngle: 45, maxAngle: 135 },
  ];
  const active = getActiveRigCorrections(value, { asset: 'hero', state: 'winBig', boneAngles: { 'upper-arm': 80 } });
  assert.deepEqual(active.map(item => item.id), ['high', 'overlay']);
  assert.deepEqual(getActiveRigCorrections(value, { asset: 'hero', state: 'idle', boneAngles: { 'upper-arm': 0 } }), []);
});

test('validates correction artwork and Spine references', () => {
  const value = project();
  value.production.rig.corrections = [
    { id: 'swap', name: 'Bent elbow', type: 'attachment', asset: 'hero', bone: 'upper-arm', slot: 'elbow-patch', attachment: 'elbow-bent', minAngle: 40, maxAngle: 130 },
    { id: 'fill', name: 'Elbow fill', type: 'overlay', asset: 'hero', bone: 'upper-arm', image: 'data:image/png;base64,eA==', minAngle: 45, maxAngle: 135, anchorX: 0.5, anchorY: 0.5, scale: 1 },
  ];
  assert.deepEqual(validateRigCorrections(value), []);

  value.production.rig.corrections[0].bone = 'missing';
  value.production.rig.corrections[1].image = null;
  const errors = validateRigCorrections(value);
  assert.ok(errors.some(issue => issue.message.includes('missing bone')));
  assert.ok(errors.some(issue => issue.message.includes('missing embedded overlay artwork')));
});

test('exports a portable correction contract without embedded image payloads', () => {
  const value = project();
  value.production.rig.corrections = [{
    id: 'fill', name: 'Elbow fill', type: 'overlay', asset: 'hero', bone: 'upper-arm', image: 'data:image/png;base64,eA==', imageName: 'elbow.png', minAngle: 45, maxAngle: 135,
  }];
  const manifest = createRigCorrectionManifest(value);
  assert.equal(manifest.format, 'stake-studio-rig-corrections-v1');
  assert.equal(manifest.corrections[0].image, undefined);
  assert.equal(manifest.corrections[0].imageName, 'elbow.png');
});
