import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  getSpineMotionCases,
  getSpineMotionSampleTimes,
  recordSpineMotionQA,
} from '../src/engines/animation/SpineMotionReview.js';
import { getRigStressCasePlan, recordRigStressQA } from '../src/engines/quality/RigStressQA.js';
import {
  RIG_CERTIFICATION_FORMAT,
  getRigCertificationSummary,
  recordRigCertification,
} from '../src/engines/quality/RigCertificationQA.js';

const BASE_METRICS = {
  sampledPixels: 16384, visiblePixels: 4800, alphaMass: 0.28,
  widthFraction: 0.5, heightFraction: 0.75, boundsAreaFraction: 0.375,
  occupancy: 0.78, centroidX: 0.5, centroidY: 0.52,
  edgeTouchFraction: 0, components: 1, largestComponentShare: 1,
};

function fixture() {
  const project = createGameProject({ name: 'Rig Certification Fixture' });
  const asset = {
    name: 'hero', version: '4.3.13', skins: ['base'],
    animations: [{ name: 'idle', duration: 1 }],
    rawJSON: { skeleton: { spine: '4.3.13' }, bones: [{ name: 'root' }], animations: { idle: {} } },
    atlasText: 'hero.png\nsize: 64,64\n\nbody\n  bounds: 0,0,64,64',
    atlasImages: { 'hero.png': 'data:image/png;base64,fixture' },
    bones: ['root'], slots: [], attachments: [], regions: ['body'],
  };
  project.animation.spineAssets = [asset];
  project.animation.stateAnimations.idle = 'hero:idle';
  return { project, asset };
}

function motionSamples(project, asset) {
  return getSpineMotionCases(asset, project).map(motionCase => {
    const times = getSpineMotionSampleTimes(motionCase.duration);
    return {
      ...motionCase,
      samples: times.map((time, index) => {
        const thumbnail = new Array(256).fill(0);
        const offset = 4 + Math.round(Math.sin(index / (times.length - 1) * Math.PI * 2) * 3);
        for (let y = 5; y < 11; y++) for (let x = offset; x < offset + 5; x++) thumbnail[y * 16 + x] = 255;
        return { time, metrics: { ...BASE_METRICS, thumbnail } };
      }),
      events: [],
    };
  });
}

function stressSamples(asset) {
  return getRigStressCasePlan(asset).map(item => ({
    ...item,
    anglesTested: item.angles,
    correctionsTriggered: [],
    poseMechanicsTriggered: [],
    measurements: item.angles.map(angle => ({ angle, metrics: BASE_METRICS })),
  }));
}

function recordComponents(project, asset) {
  recordSpineMotionQA(project, asset.name, motionSamples(project, asset));
  recordRigStressQA(project, asset.name, stressSamples(asset));
}

test('certification refuses to replace missing component evidence', () => {
  const { project, asset } = fixture();
  const summary = recordRigCertification(project, asset.name);
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => /Automated Motion QA has not been run/.test(issue)));
  assert.ok(summary.issues.some(issue => /Pixel Deformation Audit has not been run/.test(issue)));
});

test('clean structure, motion, and deformation evidence produce one certification', () => {
  const { project, asset } = fixture();
  recordComponents(project, asset);
  const summary = recordRigCertification(project, asset.name);
  assert.equal(project.production.rig.certifications.hero.format, RIG_CERTIFICATION_FORMAT);
  assert.equal(summary.complete, true);
  assert.equal(summary.motion.framesMeasured, 13);
  assert.equal(summary.stress.testedAngles, 81);
});

test('runtime changes invalidate the combined certification automatically', () => {
  const { project, asset } = fixture();
  recordComponents(project, asset);
  recordRigCertification(project, asset.name);
  project.production.rig.secondaryMotion.push({ id: 'spring', asset: 'hero', bone: 'root', stiffness: 8, damping: 3, maxAngle: 10 });
  const summary = getRigCertificationSummary(project, asset.name);
  assert.equal(summary.complete, false);
  assert.equal(summary.stale, true);
});

test('rerunning either component audit invalidates the combined certificate', () => {
  const { project, asset } = fixture();
  recordComponents(project, asset);
  recordRigCertification(project, asset.name);
  const failedMotion = motionSamples(project, asset);
  const frozen = failedMotion[0].samples[0].metrics.thumbnail;
  failedMotion[0].samples.forEach(frame => { frame.metrics.thumbnail = frozen; });
  recordSpineMotionQA(project, asset.name, failedMotion);
  const summary = getRigCertificationSummary(project, asset.name);
  assert.equal(summary.complete, false);
  assert.equal(summary.stale, true);
});

test('a structural atlas defect blocks certification even when rendered samples pass', () => {
  const { project, asset } = fixture();
  asset.rawJSON.skins = [{ name: 'base', attachments: { body: { missing: { type: 'region', path: 'missing' } } } }];
  recordComponents(project, asset);
  const summary = recordRigCertification(project, asset.name);
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => /Structure: .*cannot be found in the atlas/.test(issue)));
});
