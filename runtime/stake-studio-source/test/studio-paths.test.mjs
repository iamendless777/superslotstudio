import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveStudioHome } from '../server/studio-paths.mjs';

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
