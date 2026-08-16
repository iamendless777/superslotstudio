import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPoseMechanicsManifest,
  getActiveAnchors,
  getActiveDrawOrderRules,
  getActiveSecondaryMotion,
  validatePoseMechanics,
} from '../src/engines/animation/PoseMechanicsEngine.js';

function project() {
  return {
    animation: { spineAssets: [{ name: 'hero', bones: ['root', 'foot', 'hair'], slots: ['body', 'arm', 'prop'], attachments: [] }] },
    production: { rig: { drawOrderRules: [], anchors: [], secondaryMotion: [] } },
  };
}

test('activates angle-driven layer rules by context and resolves slot conflicts by priority', () => {
  const value = project();
  value.production.rig.drawOrderRules = [
    { id: 'low', name: 'Low', asset: 'hero', bone: 'foot', slot: 'arm', relativeTo: 'body', position: 'after', minAngle: 30, maxAngle: 120, priority: 1 },
    { id: 'high', name: 'High', asset: 'hero', bone: 'foot', slot: 'arm', relativeTo: 'prop', position: 'before', minAngle: 45, maxAngle: 90, priority: 10, state: 'winBig' },
  ];
  const active = getActiveDrawOrderRules(value, { asset: 'hero', state: 'winBig', boneAngles: { foot: 60 } });
  assert.deepEqual(active.map(rule => rule.id), ['high']);
  assert.deepEqual(getActiveDrawOrderRules(value, { asset: 'hero', state: 'idle', boneAngles: { foot: 0 } }), []);
});

test('selects state-aware anchors and one highest-priority spring per bone', () => {
  const value = project();
  value.production.rig.anchors = [
    { id: 'foot', name: 'Foot plant', asset: 'hero', bone: 'foot', mode: 'plant', strength: 1 },
    { id: 'prop', name: 'Prop socket', asset: 'hero', bone: 'root', mode: 'socket', state: 'winBig' },
  ];
  value.production.rig.secondaryMotion = [
    { id: 'soft', name: 'Soft hair', asset: 'hero', bone: 'hair', stiffness: 50, damping: 10, maxAngle: 25, priority: 1 },
    { id: 'heroic', name: 'Heroic hair', asset: 'hero', bone: 'hair', stiffness: 90, damping: 14, maxAngle: 20, priority: 5, state: 'winBig' },
  ];
  assert.deepEqual(getActiveAnchors(value, { asset: 'hero', state: 'winBig' }).map(anchor => anchor.id), ['foot', 'prop']);
  assert.deepEqual(getActiveSecondaryMotion(value, { asset: 'hero', state: 'winBig' }).map(system => system.id), ['heroic']);
});

test('validates Spine references and exports the portable pose contract', () => {
  const value = project();
  value.production.rig.drawOrderRules = [{ id: 'layer', name: 'Arm crossing', asset: 'hero', bone: 'root', slot: 'arm', relativeTo: 'body', position: 'after', minAngle: -20, maxAngle: 60 }];
  value.production.rig.anchors = [{ id: 'foot', name: 'Foot plant', asset: 'hero', bone: 'foot', mode: 'plant', targetX: null, targetY: null, strength: 1 }];
  value.production.rig.secondaryMotion = [{ id: 'hair', name: 'Hair spring', asset: 'hero', bone: 'hair', stiffness: 90, damping: 14, maxAngle: 25 }];
  assert.deepEqual(validatePoseMechanics(value), []);

  const manifest = createPoseMechanicsManifest(value);
  assert.equal(manifest.format, 'stake-studio-pose-mechanics-v1');
  assert.equal(manifest.drawOrderRules[0].position, 'after');
  assert.equal(manifest.anchors[0].mode, 'plant');
  assert.equal(manifest.secondaryMotion[0].maxAngle, 25);

  value.production.rig.drawOrderRules[0].relativeTo = 'missing';
  value.production.rig.anchors[0].targetX = 100;
  value.production.rig.secondaryMotion[0].bone = 'missing';
  const issues = validatePoseMechanics(value);
  assert.ok(issues.some(issue => issue.message.includes('missing relative slot')));
  assert.ok(issues.some(issue => issue.message.includes('both target coordinates')));
  assert.ok(issues.some(issue => issue.message.includes('missing bone')));
});

test('rejects duplicate IDs across pose mechanic families', () => {
  const value = project();
  value.production.rig.anchors = [{ id: 'shared', name: 'Foot', asset: 'hero', bone: 'foot', strength: 1 }];
  value.production.rig.secondaryMotion = [{ id: 'shared', name: 'Hair', asset: 'hero', bone: 'hair', stiffness: 90, damping: 14, maxAngle: 25 }];
  assert.ok(validatePoseMechanics(value).some(issue => issue.message.includes('duplicated')));
});
