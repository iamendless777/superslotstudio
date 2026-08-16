import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { stakeStudioBridge } from '../server/bridge-plugin.mjs';
import { createGameProject } from '../src/engines/schema.js';

function harness() {
  const home = mkdtempSync(join(tmpdir(), 'visual-excellence-bridge-'));
  const id = 'visual_department';
  const root = join(home, 'games', id);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'project.json'), JSON.stringify(createGameProject({ name: 'Visual Department' }), null, 2));
  const sdkBin = join(home, 'reference', 'math-sdk', 'env', 'bin');
  mkdirSync(sdkBin, { recursive: true });
  writeFileSync(join(sdkBin, 'python'), 'fixture');
  let middleware;
  stakeStudioBridge({ home }).configureServer({ middlewares: { use(value) { middleware = value; } } });
  return {
    home, id,
    request(method, path, body = null) {
      const req = Readable.from(body === null ? [] : [Buffer.from(JSON.stringify(body))]);
      req.method = method; req.url = path;
      return new Promise((resolve, reject) => {
        const res = {
          statusCode: 0, headers: {},
          setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
          end(value) { resolve({ status: this.statusCode, body: JSON.parse(String(value || '{}')) }); },
        };
        Promise.resolve(middleware(req, res, () => reject(new Error('Visual Excellence route called next().')))).catch(reject);
      });
    },
  };
}

test('shared bridge initializes and reads the Visual Excellence Department', async t => {
  const value = harness();
  t.after(() => rmSync(value.home, { recursive: true, force: true }));
  const brief = {
    id: 'tumble-proof', type: 'tumble', title: 'Tumble clarity', status: 'approved',
    objective: 'Make each cascade phase readable.', playerNeed: 'Understand what cleared and what moved.',
    phases: [{ id: 'clear', intent: 'Clear exact event positions.' }, { id: 'settle', intent: 'Settle the canonical board.' }],
    authoritativeEventInputs: [{
      event: 'tumbleBoard', schema: 'stake-round-book-tumble', positionSource: 'explodingSymbols', ordering: 'event-order',
    }],
  };
  let response = await value.request('POST', `/__stake_studio/projects/${value.id}/visual-excellence/briefs`, { brief });
  assert.equal(response.status, 200);
  assert.equal(response.body.summary.briefCount, 1);
  assert.equal(response.body.department.hierarchy.specialists.includes('motion_vfx'), true);

  response = await value.request('GET', `/__stake_studio/projects/${value.id}/visual-excellence`);
  assert.equal(response.status, 200);
  assert.equal(response.body.department.briefs[0].id, 'tumble-proof');
  assert.equal(response.body.summary.humanSignoff.status, 'required');
});
