import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  clearLiveApp,
  detectExistingTunnelPort,
  liveAppFile,
  readLiveApp,
  writeLiveApp,
} from '../server/studio-live-app.mjs';

test('the running app writes a lockfile models can find', () => {
  const studioHome = mkdtempSync(join(tmpdir(), 'live-app-'));
  writeLiveApp(studioHome, { url: 'http://127.0.0.1:5555/', pid: 42 });
  const live = readLiveApp(studioHome);
  assert.equal(live.product, 'Stake Studio');
  assert.equal(live.url, 'http://127.0.0.1:5555');
  assert.equal(live.pid, 42);
  assert.ok(readFileSync(liveAppFile(studioHome), 'utf8').includes('Stake Studio'));
  clearLiveApp(studioHome, 42);
  assert.equal(readLiveApp(studioHome), null);
  rmSync(studioHome, { recursive: true, force: true });
});

test('an existing tunnel is a door to reuse, not a model identity', async () => {
  const port = await detectExistingTunnelPort({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ tunnels: [{ config: { addr: 'http://localhost:3001' } }] }),
    }),
  });
  assert.equal(port, 3001);
});
