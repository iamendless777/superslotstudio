import assert from 'node:assert/strict';
import test from 'node:test';

import { publishedRtpAuthority } from '../src/engines/build/BuildEngine.js';

const project = {
  math: { rtp: 0.96 },
  build: {
    mathPublish: {
      profile: 'production',
      totalBooks: 500000,
      officialVerification: true,
      fullStreamIntegrity: true,
      rtpAligned: true,
      contractFingerprint: 'math-current',
      modes: ['base'],
      modeReports: [{ mode: 'base', exactRtp: 0.96, declaredRtp: 0.96 }],
    },
  },
};

test('fresh exact production lookup weights are RTP authority', () => {
  const authority = publishedRtpAuthority(project, 'math-current', { name: 'base', rtp: 0.96 });
  assert.equal(authority.fresh, true);
  assert.equal(authority.exactRtp, 0.96);
});

test('stale, non-production, or misaligned publications cannot override simulation', () => {
  assert.equal(publishedRtpAuthority(project, 'math-stale', { name: 'base', rtp: 0.96 }).fresh, false);
  assert.equal(publishedRtpAuthority({ ...project, build: { mathPublish: { ...project.build.mathPublish, profile: 'draft' } } }, 'math-current', { name: 'base', rtp: 0.96 }).fresh, false);
  assert.equal(publishedRtpAuthority({ ...project, build: { mathPublish: { ...project.build.mathPublish, rtpAligned: false } } }, 'math-current', { name: 'base', rtp: 0.96 }).fresh, false);
  assert.equal(publishedRtpAuthority(project, 'math-current', { name: 'base', rtp: 0.95 }).fresh, false);
});
