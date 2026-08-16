import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  RIG_STRESS_ANGLES,
  RIG_STRESS_FORMAT,
  analyzeRigPosePixels,
  compareRigPoseMetrics,
  getProjectRigStressSummary,
  getRigStressCasePlan,
  getRigStressSummary,
  recordRigStressQA,
} from '../src/engines/quality/RigStressQA.js';

const HEALTHY_METRICS = Object.freeze({
  sampledPixels: 16384, visiblePixels: 4800, alphaMass: 0.28,
  widthFraction: 0.5, heightFraction: 0.75, boundsAreaFraction: 0.375,
  occupancy: 0.78, centroidX: 0.5, centroidY: 0.52,
  edgeTouchFraction: 0, components: 1, largestComponentShare: 1,
});

function fixture() {
  const project = createGameProject({ name: 'Rig Stress Fixture' });
  const asset = {
    name: 'hero', version: '4.3.13', skins: ['base'],
    animations: [{ name: 'idle', duration: 1 }],
    rawJSON: { skeleton: { spine: '4.3.13' }, bones: [{ name: 'root' }, { name: 'arm' }, { name: 'hand' }], animations: { idle: {} } },
    atlasText: 'hero.png\nsize: 64,64\n\nbody\n  bounds: 0,0,64,64',
    atlasImages: { 'hero.png': 'data:image/png;base64,fixture' },
    bones: ['root', 'arm', 'hand'], slots: ['body'], attachments: [],
  };
  project.animation.spineAssets = [asset];
  return { project, asset };
}

const passingSamples = asset => getRigStressCasePlan(asset).map(item => ({
  id: item.id, bone: item.bone, state: item.state, anglesTested: item.angles,
  correctionsTriggered: [], poseMechanicsTriggered: [], error: '',
  measurements: item.angles.map(angle => ({
    angle, metrics: HEALTHY_METRICS, correctionsTriggered: [], poseMechanicsTriggered: [], error: '',
  })),
}));

test('pixel analysis measures silhouette geometry from rendered alpha', () => {
  const width = 8;
  const height = 8;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) pixels[(y * width + x) * 4 + 3] = 255;
  const metrics = analyzeRigPosePixels({ pixels, width, height });
  assert.equal(metrics.visiblePixels, 16);
  assert.equal(metrics.components, 1);
  assert.equal(metrics.largestComponentShare, 1);
  assert.equal(metrics.occupancy, 1);
  assert.equal(metrics.widthFraction, 0.5);
  assert.equal(metrics.heightFraction, 0.5);
  assert.equal(metrics.thumbnail.length, 256);
});

test('pixel comparisons classify deformation separately from pose mechanics', () => {
  const collapsed = { ...HEALTHY_METRICS, alphaMass: 0.1, boundsAreaFraction: 0.15, occupancy: 0.42, components: 5, largestComponentShare: 0.7 };
  const displaced = { ...HEALTHY_METRICS, centroidX: 0.82, edgeTouchFraction: 0.2 };
  const correctionFindings = compareRigPoseMetrics(collapsed, HEALTHY_METRICS);
  const mechanicFindings = compareRigPoseMetrics(displaced, HEALTHY_METRICS);
  assert.ok(correctionFindings.some(item => item.system === 'correction' && item.id === 'area-collapse'));
  assert.ok(correctionFindings.some(item => item.system === 'correction' && item.id === 'interior-gap'));
  assert.ok(mechanicFindings.some(item => item.system === 'pose-mechanic' && item.id === 'center-drift'));
  assert.ok(mechanicFindings.some(item => item.system === 'pose-mechanic' && item.id === 'stage-clipping'));
});

test('residual rendered deformation blocks release evidence', () => {
  const { project, asset } = fixture();
  const samples = passingSamples(asset);
  samples[0].measurements.find(item => item.angle === 90).metrics = {
    ...HEALTHY_METRICS, alphaMass: 0.08, boundsAreaFraction: 0.12,
  };
  const summary = recordRigStressQA(project, asset.name, samples);
  assert.equal(summary.complete, false);
  assert.ok(summary.correctionRequired > 0);
  assert.ok(summary.findings.some(item => item.angle === 90 && item.system === 'correction'));
});

test('stress plan covers every driven bone, production state, and extreme angle', () => {
  const { asset } = fixture();
  const plan = getRigStressCasePlan(asset);
  assert.equal(plan.length, 18);
  assert.deepEqual([...new Set(plan.map(item => item.bone))], ['arm', 'hand']);
  assert.ok(plan.every(item => item.angles.length === RIG_STRESS_ANGLES.length));
  assert.ok(plan.every(item => item.angles[0] === -180 && item.angles.at(-1) === 180));
});

test('complete runtime samples create fresh release evidence', () => {
  const { project, asset } = fixture();
  const summary = recordRigStressQA(project, asset.name, passingSamples(asset));
  assert.equal(project.production.rig.stressAudits.hero.format, RIG_STRESS_FORMAT);
  assert.equal(summary.complete, true);
  assert.equal(summary.passed, 18);
  assert.equal(summary.testedAngles, 18 * RIG_STRESS_ANGLES.length);
  assert.equal(getProjectRigStressSummary(project).complete, true);
});

test('missing angles and runtime errors block the audit', () => {
  const { project, asset } = fixture();
  const samples = passingSamples(asset);
  samples[0].anglesTested = [0];
  samples[1].error = 'renderer rejected pose';
  const summary = recordRigStressQA(project, asset.name, samples);
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => /missed angles/.test(issue)));
  assert.ok(summary.issues.some(issue => /renderer rejected pose/.test(issue)));
});

test('a runtime that never becomes ready cannot manufacture stress evidence', () => {
  const { project, asset } = fixture();
  const summary = recordRigStressQA(project, asset.name, passingSamples(asset), { runtimeStatus: 'error' });
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => /runtime finished in error state/.test(issue)));
});

test('rig, correction, or pose-mechanic changes make stress evidence stale', () => {
  const { project, asset } = fixture();
  recordRigStressQA(project, asset.name, passingSamples(asset));
  project.production.rig.drawOrderRules.push({ id: 'arm-cross', asset: 'hero', bone: 'arm', slot: 'body', relativeTo: 'body', minAngle: 45, maxAngle: 135 });
  const summary = getRigStressSummary(project, asset.name);
  assert.equal(summary.complete, false);
  assert.equal(summary.stale, true);
  assert.notEqual(summary.fingerprint, summary.storedFingerprint);
});
