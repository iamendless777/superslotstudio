import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import {
  SPINE_MOTION_FORMAT,
  getSpineMotionCases,
  getSpineMotionReviewSummary,
  getSpineMotionSampleTimes,
  recordSpineMotionQA,
} from '../src/engines/animation/SpineMotionReview.js';
import { QualityDirector } from '../src/engines/quality/QualityDirector.js';
import { getRigStressCasePlan, recordRigStressQA } from '../src/engines/quality/RigStressQA.js';
import { recordRigCertification } from '../src/engines/quality/RigCertificationQA.js';

const HEALTHY_METRICS = {
  sampledPixels: 16384, visiblePixels: 4800, alphaMass: 0.28,
  widthFraction: 0.5, heightFraction: 0.75, boundsAreaFraction: 0.375,
  occupancy: 0.78, centroidX: 0.5, centroidY: 0.52,
  edgeTouchFraction: 0, components: 1, largestComponentShare: 1,
};

function fixture() {
  const project = createGameProject({ name: 'Spine Motion Review' });
  const asset = {
    name: 'hero', version: '4.3.13', skins: ['base', 'armored'],
    animations: [{ name: 'idle', duration: 1 }, { name: 'win', duration: 0.8 }],
    rawJSON: {
      skeleton: { spine: '4.3.13' }, bones: [{ name: 'root' }],
      animations: { idle: {}, win: { events: [{ time: 0.4, name: 'impact' }] } },
    },
    atlasText: 'hero.png\nsize: 64,64\n\nbody\n  bounds: 0,0,64,64',
    atlasImages: { 'hero.png': 'data:image/png;base64,fixture' },
    bones: ['root'], slots: [], attachments: [],
  };
  project.animation.spineAssets = [asset];
  project.animation.stateAnimations.idle = 'hero:idle';
  project.animation.stateAnimations.winSmall = 'hero:win';
  return { project, asset };
}

function thumbnailAt(frameIndex, lastIndex, loopExpected) {
  const phase = loopExpected ? Math.sin(frameIndex / lastIndex * Math.PI * 2) : frameIndex / lastIndex;
  const offset = Math.max(0, Math.min(10, Math.round(5 + phase * 4)));
  const thumbnail = new Array(256).fill(0);
  for (let y = 5; y < 11; y++) for (let x = offset; x < Math.min(16, offset + 5); x++) thumbnail[y * 16 + x] = 255;
  return thumbnail;
}

function healthyMotionSamples(project, asset) {
  return getSpineMotionCases(asset, project).map(motionCase => {
    const times = getSpineMotionSampleTimes(motionCase.duration);
    return {
      id: motionCase.id,
      skin: motionCase.skin,
      animation: motionCase.animation,
      samples: times.map((time, index) => ({
        time,
        metrics: {
          ...HEALTHY_METRICS,
          centroidX: 0.5 + (motionCase.loopExpected ? Math.sin(index / (times.length - 1) * Math.PI * 2) * 0.04 : index * 0.002),
          thumbnail: thumbnailAt(index, times.length - 1, motionCase.loopExpected),
        },
      })),
      events: motionCase.animation === 'win' ? [{ name: 'impact', time: 0.4 }] : [],
    };
  });
}

test('motion QA expands every animation across every skin and marks mapped loops', () => {
  const { project, asset } = fixture();
  const cases = getSpineMotionCases(asset, project);
  assert.equal(cases.length, 4);
  assert.deepEqual(cases.map(item => item.id), [
    'base::idle', 'base::win', 'armored::idle', 'armored::win',
  ]);
  assert.equal(cases.find(item => item.animation === 'idle').loopExpected, true);
  assert.equal(cases.find(item => item.animation === 'win').loopExpected, false);
  assert.equal(getSpineMotionSampleTimes(1).length, 13);
});

test('measured motion evidence is complete only for the exact rig revision', () => {
  const { project, asset } = fixture();
  const summary = recordSpineMotionQA(project, asset.name, healthyMotionSamples(project, asset));
  assert.equal(project.production.rig.motionReviews.hero.format, SPINE_MOTION_FORMAT);
  assert.equal(summary.complete, true);
  assert.equal(summary.passed, 4);
  assert.equal(summary.framesMeasured, 52);
  assert.equal(summary.eventsObserved, 2);

  asset.rawJSON.animations.win.rotate = [{ time: 0.4, value: 25 }];
  const stale = getSpineMotionReviewSummary(project, asset.name);
  assert.equal(stale.complete, false);
  assert.equal(stale.stale, true);
  assert.equal(stale.passed, 0);
});

test('runtime mechanic and loop-contract changes make measured motion evidence stale', () => {
  const { project, asset } = fixture();
  recordSpineMotionQA(project, asset.name, healthyMotionSamples(project, asset));
  project.production.rig.anchors.push({ id: 'plant', asset: 'hero', bone: 'root', mode: 'plant', strength: 1 });
  let summary = getSpineMotionReviewSummary(project, asset.name);
  assert.equal(summary.stale, true);
  project.production.rig.anchors = [];
  recordSpineMotionQA(project, asset.name, healthyMotionSamples(project, asset));
  project.animation.stateAnimations.winSmall = { asset: 'hero', animation: 'win', loop: true };
  summary = getSpineMotionReviewSummary(project, asset.name);
  assert.equal(summary.stale, true);
});

test('static motion, loop seams, and missing runtime events produce concrete repairs', () => {
  const { project, asset } = fixture();
  const samples = healthyMotionSamples(project, asset);
  const idle = samples.find(item => item.animation === 'idle');
  const frozen = new Array(256).fill(0);
  for (let index = 0; index < 20; index++) frozen[index] = 255;
  idle.samples.forEach(frame => { frame.metrics.thumbnail = frozen; });
  const win = samples.find(item => item.animation === 'win');
  win.events = [];
  const summary = recordSpineMotionQA(project, asset.name, samples);
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.some(issue => /no meaningful rendered movement/.test(issue)));
  assert.ok(summary.issues.some(issue => /Event “impact” did not fire/.test(issue)));

  const loopSamples = healthyMotionSamples(project, asset);
  const loop = loopSamples.find(item => item.animation === 'idle');
  loop.samples.at(-1).metrics.thumbnail = new Array(256).fill(255);
  const loopSummary = recordSpineMotionQA(project, asset.name, loopSamples);
  assert.ok(loopSummary.issues.some(issue => /Loop endpoints do not match/.test(issue)));
});

test('the professional gate accepts automated motion plus measured extreme-pose evidence', () => {
  const { project, asset } = fixture();
  recordSpineMotionQA(project, asset.name, healthyMotionSamples(project, asset));
  let check = new QualityDirector(project).audit().checks.find(item => item.id === 'animation-rig-stress');
  assert.equal(check.passed, false);
  assert.match(check.evidence, /4\/4 animation\/skin cases · 52 motion frames/);

  recordRigStressQA(project, asset.name, getRigStressCasePlan(asset).map(item => ({
    ...item, anglesTested: item.angles, correctionsTriggered: [], poseMechanicsTriggered: [],
    measurements: item.angles.map(angle => ({ angle, metrics: HEALTHY_METRICS })),
  })));
  check = new QualityDirector(project).audit().checks.find(item => item.id === 'animation-rig-stress');
  assert.equal(check.passed, false);
  assert.match(check.remedy, /Certify Rig/);
  recordRigCertification(project, asset.name);
  check = new QualityDirector(project).audit().checks.find(item => item.id === 'animation-rig-stress');
  assert.equal(check.passed, true);
  assert.match(check.evidence, /9\/9 bone\/state sweeps/);
});
