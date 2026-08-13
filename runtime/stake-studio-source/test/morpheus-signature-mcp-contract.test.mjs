import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MCP_SERVER_URL = new URL('../mcp/server.mjs', import.meta.url);

test('MCP exposes the Morpheus signature capture audit through the matching StudioBridge command', async () => {
  const source = await readFile(MCP_SERVER_URL, 'utf8');

  assert.match(source, /name:\s*'run_morpheus_signature_capture_audit'/);
  assert.match(
    source,
    /studioCommand\('run_morpheus_signature_capture_audit',\s*\{\},\s*240000\)/,
  );
  assert.match(source, /function morpheusSignatureCaptureContent\(result = \{\}\)/);
  assert.match(source, /type:\s*'resource_link'/);
  assert.match(source, /uri:\s*frame\.resourceUri/);
  assert.doesNotMatch(
    source,
    /studioCommand\('run_morpheus_signature_capture_audit',[\s\S]{0,120}\b(?:capture|evaluate|archive)\s*:/,
    'the MCP layer must delegate instead of manufacturing capture evidence',
  );
});
