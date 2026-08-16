import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engineSource = readFileSync(new URL('../src/engines/audio/AudioEngine.js', import.meta.url), 'utf8');
const frontendSource = readFileSync(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');

test('Preview soundscape suspension does not disable stinger loading or playback', () => {
  assert.match(engineSource, /get soundscapeEnabled\(\) \{ return this\.project\.audio\?\.soundscapeEnabled !== false; \}/);
  assert.match(engineSource, /if \(this\.soundscapeEnabled\) \{[\s\S]*?Object\.entries\(this\.layers\)/);
  assert.match(engineSource, /for \(const \[event, stinger\] of Object\.entries\(this\.stingers\)\)/);
  assert.match(engineSource, /startSoundscape\(musicLayer = 'baseMusic'\) \{[\s\S]{0,240}if \(!this\.soundscapeEnabled\)/);
  assert.match(engineSource, /playStinger\(event, index\)/);
});

test('portable frontend refuses every music transition when soundscape is suspended', () => {
  assert.match(frontendSource, /function setMusic\(key\) \{[\s\S]{0,260}config\?\.audio\?\.soundscapeEnabled === false[\s\S]{0,180}audioMusic\?\.pause\(\)/);
  assert.match(frontendSource, /function playStinger\(key\)/);
});
