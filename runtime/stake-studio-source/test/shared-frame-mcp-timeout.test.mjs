import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../mcp/server.mjs', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../src/bridge/StudioBridge.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server/bridge-plugin.mjs', import.meta.url), 'utf8');

test('shared-frame capture allows production render and archive latency', () => {
  assert.match(source, /studioCommand\('capture_view',\s*\{\},\s*45000\)/);
});

test('ordinary Studio renders invalidate evidence without rasterizing on the UI thread', () => {
  const schedule = bridge.slice(
    bridge.indexOf("scheduleCapture(reason = 'update'"),
    bridge.indexOf('\n  async saveProject', bridge.indexOf("scheduleCapture(reason = 'update'")),
  );
  assert.match(schedule, /request\('\/frame-stale'/);
  assert.doesNotMatch(schedule, /captureView\(/);
  assert.match(bridge, /const SHARED_FRAME_MAX_WIDTH = 1100/);
  assert.match(bridge, /const SHARED_FRAME_MAX_HEIGHT = 800/);
  assert.match(bridge, /imageTimeout: 4000/);
  assert.match(server, /url\.pathname === '\/__stake_studio\/frame-stale'/);
  assert.match(server, /staleReason: `command:\$\{body\.command\}`/);
  assert.match(source, /if \(metadata\.stale && context\.command !== 'capture_view'\)/);
  assert.match(source, /await studioCommand\('capture_view', \{\}, 45000\)/);
});
