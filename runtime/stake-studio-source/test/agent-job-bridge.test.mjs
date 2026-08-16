import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { stakeStudioBridge } from '../server/bridge-plugin.mjs';
import { createGameProject } from '../src/engines/schema.js';

function harness() {
  const home = mkdtempSync(join(tmpdir(), 'agent-job-bridge-'));
  const id = 'agent_protocol';
  const root = join(home, 'games', id);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'project.json'), JSON.stringify(createGameProject({ name: 'Agent Protocol' }), null, 2));
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
      Promise.resolve(middleware(req, res, () => reject(new Error('Agent-job route unexpectedly called next().')))).catch(reject);
    });
  };
  return { home, id, request };
}

test('shared bridge exposes semantic agent-job creation, listing, claim, and completion', async t => {
  const value = harness();
  t.after(() => rmSync(value.home, { recursive: true, force: true }));
  let response = await value.request('POST', `/__stake_studio/projects/${value.id}/agent-jobs`, {
    jobId: 'qa-job', owner: 'qa', artifact: 'qa.release', stage: 'certification',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.job.id, 'qa-job');

  response = await value.request('GET', `/__stake_studio/projects/${value.id}/agent-jobs?availableOnly=true`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.jobs.map(job => job.id), ['qa-job']);

  response = await value.request('POST', `/__stake_studio/projects/${value.id}/agent-jobs/qa-job/claim`, {
    agentId: 'qa-codex-1', role: 'qa', leaseSeconds: 60,
  });
  assert.equal(response.status, 200);
  const leaseToken = response.body.leaseToken;
  assert.equal(response.body.job.lease.holder, 'qa-codex-1');

  response = await value.request('POST', `/__stake_studio/projects/${value.id}/agent-jobs/qa-job/complete`, {
    agentId: 'qa-codex-1', leaseToken, result: 'Certified', evidence: ['test:release'],
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.job.status, 'completed');
  assert.equal(response.body.job.lease, null);
});
