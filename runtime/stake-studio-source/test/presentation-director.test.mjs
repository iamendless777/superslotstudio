import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PresentationDirectorRuntime,
  createPresentationDirectorManifest,
  createProfessionalPresentationDirector,
  getPresentationCoverage,
  validatePresentationDirector,
} from '../src/engines/presentation/PresentationDirector.js';

function project() {
  return { presentationDirector: createProfessionalPresentationDirector() };
}

test('factory recipes cover the official Stake presentation event set', () => {
  const value = project();
  const coverage = getPresentationCoverage(value);
  assert.equal(coverage.percent, 100);
  assert.deepEqual(coverage.missing, []);
  assert.deepEqual(validatePresentationDirector(value), []);
});

test('runtime executes cues in timeline order and settles to the declared state', async () => {
  const value = project();
  const executed = [];
  const waits = [];
  const runtime = new PresentationDirectorRuntime(value, {
    wait: async milliseconds => { waits.push(milliseconds); },
    execute: async cue => { executed.push(`${cue.channel}:${cue.action}:${cue.target}`); },
  });
  const result = await runtime.dispatch('reveal', { board: [] });
  assert.equal(result.status, 'completed');
  assert.deepEqual(executed, [
    'animation:state:spinStop',
    'world:pulse:reveal',
    'camera:pulse:reels',
  ]);
  assert.deepEqual(waits, [40, 380]);
});

test('replace recipes cancel an in-flight presentation before executing the next event', async () => {
  const value = project();
  const runtime = new PresentationDirectorRuntime(value, {
    wait: async () => { await Promise.resolve(); },
    execute: async () => { await Promise.resolve(); },
  });
  const first = runtime.dispatch('reveal');
  const second = runtime.dispatch('wincap');
  assert.equal((await first).status, 'cancelled');
  assert.equal((await second).status, 'completed');
});

test('validation catches empty, late, and duplicate cues and export stays portable', () => {
  const value = project();
  const reveal = value.presentationDirector.recipes.find(recipe => recipe.event === 'reveal');
  reveal.cues.push({ ...reveal.cues[0], at: reveal.duration + 1 });
  reveal.cues.push({ id: 'empty', at: 0, channel: 'audio', action: 'stinger', target: '' });
  const issues = validatePresentationDirector(value);
  assert.ok(issues.some(issue => issue.message.includes('after its')));
  assert.ok(issues.some(issue => issue.message.includes('duplicates cue ID')));
  assert.ok(issues.some(issue => issue.message.includes('empty audio/stinger target')));

  const manifest = createPresentationDirectorManifest(project());
  assert.equal(manifest.format, 'stake-studio-presentation-director-v1');
  assert.equal(manifest.recipes.some(recipe => recipe.event === 'wincap'), true);
});
