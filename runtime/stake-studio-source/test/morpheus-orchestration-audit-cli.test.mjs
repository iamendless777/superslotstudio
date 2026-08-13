import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('offline orchestration command records evidence without launching StakeStudio', () => {
  const source = readFileSync(new URL('../server/morpheus-orchestration-audit.mjs', import.meta.url), 'utf8');
  assert.match(source, /recordMorpheusAssetOrchestrationEvidence/);
  assert.match(source, /writeFileSync\(projectPath/);
  assert.match(source, /identities\.includes\('morpheus_dreamfall'\)/);
  assert.doesNotMatch(source, /open\(|electron|StudioBridge|localhost|127\.0\.0\.1/);
});
