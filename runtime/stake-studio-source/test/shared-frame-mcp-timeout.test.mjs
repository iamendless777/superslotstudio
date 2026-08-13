import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../mcp/server.mjs', import.meta.url), 'utf8');

test('shared-frame capture allows production render and archive latency', () => {
  assert.match(source, /studioCommand\('capture_view',\s*\{\},\s*45000\)/);
});
