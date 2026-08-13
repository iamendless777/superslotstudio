import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('compiled frontend awaits Stake tumble and motion channels', async () => {
  const source = await readFile(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  const effects = await readFile(new URL('../server/frontend-runtime/visual-effects-entry.js', import.meta.url), 'utf8');
  assert.match(source, /case 'tumbleBoard': await playTumbleBoard\(event, instant\)/);
  assert.match(source, /case 'boardTransform': await playBoardTransform\(event, instant\)/);
  assert.match(source, /case 'wildBomb': showStatus/);
  assert.match(source, /case 'positionMultiplierGridUpdate':/);
  assert.match(source, /symbolMultipliers\.set\(event\.symbol/);
  assert.match(source, /await Promise\.all\(channelMotions\)/);
  assert.match(source, /controller\?\.clearSymbols\?\.\(\)/);
  assert.doesNotMatch(source, /case 'tumbleBoard': showStatus\('Cascade'\)/);
  assert.match(effects, /clearSymbols/);
  assert.match(effects, /runtime\.clearSymbolFlipbooks\?\.\(\)/);
  assert.match(effects, /'lucidWildMultiplier'/);
  assert.match(effects, /runtime\.playEnergyTaps\(tap\.points, tap\.options\)/);
});

test('enhanced wager modes present their board-selection cause with authored motion', async () => {
  const app = await readFile(new URL('../server/frontend-template/game-app.js', import.meta.url), 'utf8');
  const effects = await readFile(new URL('../server/frontend-runtime/visual-effects-entry.js', import.meta.url), 'utf8');
  assert.match(app, /case 'modeBoardSelection'/);
  assert.match(app, /Chosen from \$\{event\.candidateCount/);
  assert.match(effects, /'modeBoardSelection'/);
});
