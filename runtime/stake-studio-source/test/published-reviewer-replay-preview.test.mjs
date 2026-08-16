import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const preview = await readFile(new URL('../src/editor/preview/PreviewPanel.js', import.meta.url), 'utf8');
const studioBridge = await readFile(new URL('../src/bridge/StudioBridge.js', import.meta.url), 'utf8');
const bridgeServer = await readFile(new URL('../server/bridge-plugin.mjs', import.meta.url), 'utf8');
const mcp = await readFile(new URL('../mcp/server.mjs', import.meta.url), 'utf8');

test('verified final-LUT books enter Preview through the existing reel and event choreography', () => {
  assert.match(preview, /playPublishedReviewerReplay\(payload = \{\}\)/);
  assert.match(preview, /this\.spin\(\{\s*roundOverride: round,/);
  assert.match(preview, /source: publishedReplay \? 'published-book' : 'local-design-simulator'/);
  assert.match(preview, /await this\.playSpinEventBook\(res, \{ alreadyLanded: true/);
  assert.match(preview, /if \(!res\.publishedReplay\) this\.balance \+= this\.lastWin/);
  assert.match(preview, /canonicalSymbolKey\(symbol\.name\) === key/);
  assert.match(preview, /normalizePublishedBoard\(event\.newSymbols\)/);
});

test('Preview labels configured RTP as published authority', () => {
  assert.match(preview, /Published RTP \$\{\(math\.rtp \* 100\)\.toFixed\(1\)\}%/);
});

test('published replay endpoint fails closed on unverified math and reads the proven catalog book', () => {
  assert.match(bridgeServer, /published-replay/);
  assert.match(bridgeServer, /published\.profile === 'production'/);
  assert.match(bridgeServer, /published\.officialVerification/);
  assert.match(bridgeServer, /published\.fullStreamIntegrity/);
  assert.match(bridgeServer, /published\.rtpAligned/);
  assert.match(bridgeServer, /read_published_reviewer_replay\.py/);
  assert.match(bridgeServer, /spawnSync\(mathSdkPython/);
});

test('agent command exposes published loss, win, big-win, MAX, and bonus reviewer journeys', () => {
  assert.match(studioBridge, /case 'play_published_reviewer_replay'/);
  assert.match(studioBridge, /preview\.playPublishedReviewerReplay\(replay\)/);
  assert.match(studioBridge, /balanceUnchanged: true/);
  assert.match(mcp, /name: 'play_published_reviewer_replay'/);
  assert.match(mcp, /\['loss', 'normalWin', 'bigWin', 'wincap', 'bonusTrigger'\]/);
  assert.match(mcp, /studioCommand\('play_published_reviewer_replay'/);
});
