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
    cwd: ROOT, env: { ...process.env, STAKE_STUDIO_HOME: home }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let sequence = 0;
  let output = '';
  const pending = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    output += chunk;
    while (output.includes('\n')) {
      const end = output.indexOf('\n');
      const line = output.slice(0, end).trim();
      output = output.slice(end + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  return {
    child,
    request(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => reject(new Error(`MCP request ${method} timed out.`)), 5000);
        pending.set(id, response => { clearTimeout(timer); resolve(response); });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
  };
}

function payload(response) {
  assert.equal(response.result.isError, false, response.result.content?.[0]?.text);
  return JSON.parse(response.result.content[0].text);
}

const brief = {
  id: 'tile-proof', type: 'tile-connections', title: 'Tile connection clarity', status: 'approved',
  objective: 'Make authoritative winning relationships immediately legible.',
  playerNeed: 'See which exact tiles connect and why they won.', intensity: 'normal',
  phases: [
    { id: 'interaction', intent: 'Focus the source.' },
    { id: 'propagation', intent: 'Trace the event-supplied relationship.' },
    { id: 'resolution', intent: 'Resolve without obscuring the board.' },
  ],
  authoritativeEventInputs: [{
    event: 'winInfo', schema: 'stake-round-book-win-info', positionSource: 'wins[].positions',
    ordering: 'event-and-position-order', requiredFields: ['wins'],
  }],
  compositionObjectives: ['Preserve symbol readability.'],
  motionObjectives: ['Use a restrained relationship trace.'],
  frontendCapabilities: ['Variable-row coordinate resolution.'],
  acceptance: ['Desktop, mobile, fast, and reduced motion are legible.'],
};

test('MCP exposes governed visual briefs and dependency-ordered department jobs', async t => {
  const home = mkdtempSync(join(tmpdir(), 'visual-excellence-mcp-'));
  const id = 'visual_department';
  const path = join(home, 'games', id, 'project.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(createGameProject({ name: 'Visual Department' }), null, 2));
  const mcp = startMcp(home);
  t.after(() => { mcp.child.kill('SIGTERM'); rmSync(home, { recursive: true, force: true }); });

  const tools = await mcp.request('tools/list');
  for (const name of [
    'get_visual_excellence_department', 'upsert_visual_sequence_brief',
    'record_visual_specialist_delivery', 'record_visual_director_review', 'record_human_visual_signoff',
  ]) assert.equal(tools.result.tools.some(tool => tool.name === name), true, `${name} is exposed`);

  const created = payload(await mcp.request('tools/call', {
    name: 'upsert_visual_sequence_brief', arguments: { id, brief },
  }));
  assert.equal(created.brief.id, brief.id);
  assert.equal(created.jobs.length, 7);
  assert.equal(created.jobs.some(job => job.owner === 'audio'), false);
  assert.deepEqual(created.summary.roles, ['presentation', 'visual', 'motion_vfx']);

  const jobs = payload(await mcp.request('tools/call', {
    name: 'list_agent_jobs', arguments: { id, availableOnly: true },
  }));
  assert.deepEqual(jobs.jobs.map(job => job.owner), ['protocol']);

  const department = payload(await mcp.request('tools/call', {
    name: 'get_visual_excellence_department', arguments: { id },
  }));
  assert.equal(department.summary.nextAction.role, 'visual');
  assert.equal(department.department.hierarchy.humanFinalAuthority, true);
});
