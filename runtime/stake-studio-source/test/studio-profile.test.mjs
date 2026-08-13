import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStudioProfileToLaunch,
  getStudioProfileReadiness,
  normalizeStudioProfile,
  STUDIO_PROFILE_FORMAT,
} from '../src/engines/factory/StudioProfile.js';

test('studio profile sanitizes identity and keeps Spine optional', () => {
  const profile = normalizeStudioProfile({
    providerName: '  Phantom   Factory  ',
    brandPillars: 'cinematic, tactile, cinematic, dangerous',
    animationPipeline: 'invalid',
  });
  assert.equal(profile.format, STUDIO_PROFILE_FORMAT);
  assert.equal(profile.providerName, 'Phantom Factory');
  assert.deepEqual(profile.brandPillars, ['cinematic', 'tactile', 'dangerous']);
  assert.equal(profile.animationPipeline, 'native-spine-ready');
});

test('production can start before the provider number but release cannot', () => {
  assert.deepEqual(getStudioProfileReadiness({ providerName: '' }).missing, ['providerName', 'providerNumber']);
  const readiness = getStudioProfileReadiness({ providerName: 'Phantom Factory' });
  assert.equal(readiness.productionReady, true);
  assert.equal(readiness.releaseReady, false);
  assert.deepEqual(readiness.missing, ['providerNumber']);
});

test('factory launch inherits profile defaults without overriding explicit choices', () => {
  const profile = normalizeStudioProfile({
    providerName: 'Phantom Factory',
    defaultTone: 'brutal',
    defaultFactoryProfile: 'review',
    defaultProductionTrack: 'flagship',
  });
  const inherited = applyStudioProfileToLaunch(profile, { name: 'Launch Test', premise: 'A clockwork trial.' });
  assert.equal(inherited.providerName, 'Phantom Factory');
  assert.equal(inherited.tone, 'brutal');
  assert.equal(inherited.profile, 'review');
  assert.equal(inherited.productionTrack, 'flagship');
  const explicit = applyStudioProfileToLaunch(profile, { providerName: 'Other', tone: 'playful', profile: 'prototype', productionTrack: 'blueprint' });
  assert.equal(explicit.providerName, 'Other');
  assert.equal(explicit.tone, 'playful');
  assert.equal(explicit.profile, 'prototype');
  assert.equal(explicit.productionTrack, 'blueprint');
});
