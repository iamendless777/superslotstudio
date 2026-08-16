import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { stakeStudioBridge } from '../server/bridge-plugin.mjs';

function harness() {
  const home = mkdtempSync(join(tmpdir(), 'studio-diagnostics-bridge-'));
  const sdkBin = join(home, 'reference', 'math-sdk', 'env', 'bin');
  mkdirSync(sdkBin, { recursive: true });
  writeFileSync(join(sdkBin, 'python'), 'fixture');
  let middleware;
  stakeStudioBridge({ home }).configureServer({ middlewares: { use(value) { middleware = value; } } });
  const request = async (method, path, body = null) => {
    const req = Readable.from(body === null ? [] : [Buffer.from(JSON.stringify(body))]);
    req.method = method;
    req.url = path;
    return new Promise((resolve, reject) => {
      const res = {
        statusCode: 0,
        headers: {},
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        end(value) { resolve({ status: this.statusCode, body: JSON.parse(String(value || '{}')) }); },
      };
      Promise.resolve(middleware(req, res, () => reject(new Error('Diagnostics route unexpectedly called next().')))).catch(reject);
    });
  };
  return { home, request };
}

test('the active Studio state atomically replaces the shared diagnostics ledger', async t => {
  const value = harness();
  t.after(() => rmSync(value.home, { recursive: true, force: true }));
  const obsolete = { signature: 'old:error', kind: 'old', message: 'obsolete' };

  let response = await value.request('POST', '/__stake_studio/errors', { errors: [obsolete] });
  assert.equal(response.status, 200);

  response = await value.request('POST', '/__stake_studio/state', {
    page: { title: 'StakeStudio', url: 'http://127.0.0.1:3000/' },
    diagnostics: { errorCount: 0, latestError: null, errors: [] },
  });
  assert.equal(response.status, 200);

  response = await value.request('GET', '/__stake_studio/errors');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.errors, []);

  response = await value.request('GET', '/__stake_studio/state');
  assert.equal(response.status, 200);
  assert.equal(response.body.diagnostics.errorCount, 0);
  assert.equal('errors' in response.body.diagnostics, false);
});
