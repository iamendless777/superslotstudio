import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('agent lane polls git inbox and can inspect the live studio', () => {
  const starter = fs.readFileSync(new URL('../scripts/start-stake-studio.mjs', import.meta.url), 'utf8');
  const bridge = fs.readFileSync(new URL('../src/bridge/StudioBridge.js', import.meta.url), 'utf8');
  assert.match(starter, /function pollAgentInbox/);
  assert.match(starter, /STAKE_STUDIO_AGENT/);
  assert.match(starter, /agent\/inbox\.json/);
  assert.match(starter, /mcpToCommand/);
  assert.match(starter, /get_studio_state/);
  assert.match(starter, /command-results/);
  assert.match(bridge, /case 'inspect_studio'/);
  assert.match(bridge, /activePanel: this\.studio\.activePanel/);
});
