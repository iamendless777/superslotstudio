import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGameProject } from '../src/engines/schema.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function startMcp(home) {
  const child = spawn(process.execPath, ['mcp/server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, STAKE_STUDIO_HOME: home },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let sequence = 0;
  let stdout = '';
  let stderr = '';
  const pending = new Map();
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
    let newline;
    while ((newline = stdout.indexOf('\n')) !== -1) {
      const line = stdout.slice(0, newline).trim();
      stdout = stdout.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter.resolve(message);
      }
    }
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP request ${method} timed out. ${stderr}`));
    }, 5000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject,
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  return { child, request, stderr: () => stderr };
}

function toolPayload(response) {
  assert.equal(response.result.isError, false, response.result.content?.[0]?.text);
  return JSON.parse(response.result.content[0].text);
}

test('MCP exposes an end-to-end claim, heartbeat, evidence, completion, and dependency workflow', async t => {
  const home = mkdtempSync(join(tmpdir(), 'stakestudio-agent-mcp-'));
  const projectId = 'agent_protocol';
  const projectPath = join(home, 'games', projectId, 'project.json');
  mkdirSync(dirname(projectPath), { recursive: true });
  writeFileSync(projectPath, JSON.stringify(createGameProject({ name: 'Agent Protocol' }), null, 2));
  const mcp = startMcp(home);
  t.after(() => {
    mcp.child.kill('SIGTERM');
    rmSync(home, { recursive: true, force: true });
  });

  const listedTools = await mcp.request('tools/list');
  const names = new Set(listedTools.result.tools.map(tool => tool.name));
  for (const name of [
    'create_agent_job', 'list_agent_jobs', 'claim_agent_job', 'heartbeat_agent_job',
    'update_agent_job', 'complete_agent_job', 'fail_agent_job', 'recover_stale_agent_jobs',
  ]) assert.equal(names.has(name), true, `${name} is exposed`);

  toolPayload(await mcp.request('tools/call', { name: 'create_agent_job', arguments: {
    id: projectId, jobId: 'contract', owner: 'mechanic', artifact: 'contract.rules',
  } }));
  toolPayload(await mcp.request('tools/call', { name: 'create_agent_job', arguments: {
    id: projectId, jobId: 'frontend', owner: 'frontend', artifact: 'frontend.runtime', dependencies: ['contract'],
  } }));
  const availableBefore = toolPayload(await mcp.request('tools/call', { name: 'list_agent_jobs', arguments: {
    id: projectId, availableOnly: true,
  } }));
  assert.deepEqual(availableBefore.jobs.map(job => job.id), ['contract']);

  const claimed = toolPayload(await mcp.request('tools/call', { name: 'claim_agent_job', arguments: {
    id: projectId, jobId: 'contract', agentId: 'mechanic-codex-1', role: 'mechanic', leaseSeconds: 60,
  } }));
  assert.equal(claimed.job.status, 'claimed');
  assert.equal(claimed.leaseToken, claimed.job.lease.token);
  const heartbeat = toolPayload(await mcp.request('tools/call', { name: 'heartbeat_agent_job', arguments: {
    id: projectId, jobId: 'contract', agentId: 'mechanic-codex-1', leaseToken: claimed.leaseToken,
  } }));
  assert.equal(heartbeat.job.status, 'in-progress');
  toolPayload(await mcp.request('tools/call', { name: 'update_agent_job', arguments: {
    id: projectId, jobId: 'contract', agentId: 'mechanic-codex-1', leaseToken: claimed.leaseToken,
    progress: 'Contract compiled', evidence: ['test:contract'],
  } }));
  const completed = toolPayload(await mcp.request('tools/call', { name: 'complete_agent_job', arguments: {
    id: projectId, jobId: 'contract', agentId: 'mechanic-codex-1', leaseToken: claimed.leaseToken,
    result: 'Ready for frontend', evidence: ['artifact:contract-v1'],
  } }));
  assert.equal(completed.job.status, 'completed');

  const availableAfter = toolPayload(await mcp.request('tools/call', { name: 'list_agent_jobs', arguments: {
    id: projectId, availableOnly: true,
  } }));
  assert.deepEqual(availableAfter.jobs.map(job => job.id), ['frontend']);
});
