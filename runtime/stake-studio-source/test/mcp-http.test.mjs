import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('agent studio serves HTTP JSON-RPC MCP on /mcp', () => {
  const plugin = fs.readFileSync(new URL('../server/bridge-plugin.mjs', import.meta.url), 'utf8');
  const mcp = fs.readFileSync(new URL('../mcp/server.mjs', import.meta.url), 'utf8');
  assert.match(plugin, /url\.pathname === '\/mcp'/);
  assert.match(plugin, /handleMcpMessage/);
  assert.match(mcp, /export async function handleMcpMessage/);
  assert.match(mcp, /const isStdioMain/);
});

test('MCP initialize and tools/list work without stdio', async () => {
  const { handleMcpMessage } = await import('../mcp/server.mjs');
  const init = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(init.result.serverInfo.name, 'stakestudio');
  const listed = await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listed.result.tools.some((tool) => tool.name === 'get_studio_state'), true);
  assert.equal(listed.result.tools.some((tool) => tool.name === 'select_studio_panel'), true);
});
