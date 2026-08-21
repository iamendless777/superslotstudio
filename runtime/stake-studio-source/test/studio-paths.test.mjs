import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveStudioHome, resolveStudioUrl, studioUrlCandidates } from '../server/studio-paths.mjs';

test('plain Developer checkout resolves the Developer Game Studio Home without an environment override', t => {
  const root = mkdtempSync(join(tmpdir(), 'studio-paths-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const checkout = join(root, 'Developer', 'superslotstudio', 'runtime', 'stake-studio-source');
  const studioHome = join(root, 'Developer', 'Game Studio Home');
  mkdirSync(checkout, { recursive: true });
  mkdirSync(join(studioHome, 'games'), { recursive: true });
  mkdirSync(join(studioHome, 'reference', 'math-sdk', 'env', 'bin'), { recursive: true });
  writeFileSync(join(studioHome, 'reference', 'math-sdk', 'env', 'bin', 'python'), 'fixture');

  assert.equal(resolveStudioHome(null, {
    cwd: checkout, environment: {}, homeDirectory: root,
  }), studioHome);
});

test('an explicit StakeStudio home remains authoritative', () => {
  assert.equal(resolveStudioHome('/tmp/explicit-studio-home', {
    cwd: '/tmp/ignored', environment: {}, homeDirectory: '/tmp/ignored-home',
  }), '/tmp/explicit-studio-home');
});

test('MCP file tools share resolveStudioHome with the live studio', () => {
  const source = readFileSync(new URL('../mcp/server.mjs', import.meta.url), 'utf8');
  assert.match(source, /resolveStudioHome\(\)/);
  assert.match(source, /resolveStudioUrl\(\)/);
  assert.doesNotMatch(source, /STAKE_STUDIO_HOME \|\| join\(STUDIO/);
  assert.doesNotMatch(source, /STAKE_STUDIO_AGENT === '1'/);
});

test('studio URL candidates never assign a port to a model', () => {
  assert.deepEqual(studioUrlCandidates({ environment: {} }), [
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ]);
  assert.equal(studioUrlCandidates({ environment: { STAKE_STUDIO_URL: 'http://127.0.0.1:3001/' } })[0],
    'http://127.0.0.1:3001');
});

test('MCP attaches to the live studio app instead of a model-owned port', async () => {
  const fetchImpl = async (url) => {
    if (String(url).startsWith('http://127.0.0.1:3000/')) {
      return { ok: true, json: async () => ({ ok: true, service: 'StakeStudio shared bridge' }) };
    }
    return { ok: false, json: async () => ({}) };
  };
  assert.equal(await resolveStudioUrl({ environment: {}, fetchImpl }), 'http://127.0.0.1:3000');
  const only3001 = async (url) => {
    if (String(url).startsWith('http://127.0.0.1:3001/')) {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    throw new Error('offline');
  };
  assert.equal(await resolveStudioUrl({ environment: {}, fetchImpl: only3001 }), 'http://127.0.0.1:3001');
});

test('when two copies are running, MCP attaches to the app on 3000', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true }) });
  assert.equal(await resolveStudioUrl({
    environment: { STAKE_STUDIO_URL: 'http://127.0.0.1:3001' },
    fetchImpl,
  }), 'http://127.0.0.1:3000');
});
