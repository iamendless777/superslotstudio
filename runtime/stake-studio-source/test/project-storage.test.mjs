import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  PROJECT_SIDECAR_FORMAT,
  persistProjectDocument,
  readProjectDocument,
} from '../server/project-storage.mjs';

const imageDataUrl = bytes => `data:image/png;base64,${Buffer.alloc(bytes, 0x5a).toString('base64')}`;
const largeRuns = () => Array.from({ length: 80 }, (_, index) => ({
  id: `route-${index}`,
  frameHashes: Array.from({ length: 140 }, (__, frame) => `${index}-${frame}-abcdef0123456789`),
}));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'stake-studio-storage-'));
  const projectPath = join(root, 'games', 'sidecar_test', 'project.json');
  mkdirSync(join(root, 'games', 'sidecar_test'), { recursive: true });
  return { root, projectPath, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('new binary assets and duplicate large evidence persist once and hydrate transparently', async t => {
  const value = await fixture();
  t.after(value.cleanup);
  const asset = imageDataUrl(48 * 1024);
  const runs = largeRuns();
  const project = {
    name: 'Sidecar Test',
    theme: { symbols: [{ name: 'A', src: asset }], submission: { background: asset } },
    production: { qa: { routeDraft: { runs }, routeAudit: { runs } } },
  };

  const result = persistProjectDocument(value.projectPath, project, { evidenceThreshold: 32 * 1024 });
  const rawText = readFileSync(value.projectPath, 'utf8');
  const raw = JSON.parse(rawText);
  assert.equal(rawText.includes('data:image/png;base64,'), false);
  assert.equal(rawText.includes('frameHashes'), false);
  assert.equal(raw.theme.symbols[0].src.$stakeStudioSidecar.format, PROJECT_SIDECAR_FORMAT);
  assert.equal(raw.theme.symbols[0].src.$stakeStudioSidecar.path, raw.theme.submission.background.$stakeStudioSidecar.path);
  assert.equal(raw.production.qa.routeDraft.runs.$stakeStudioSidecar.path, raw.production.qa.routeAudit.runs.$stakeStudioSidecar.path);
  assert.equal(readdirSync(join(value.root, 'games', 'sidecar_test', '.stake-studio/project-sidecars/blobs')).length, 1);
  assert.equal(readdirSync(join(value.root, 'games', 'sidecar_test', '.stake-studio/project-sidecars/evidence')).length, 1);
  assert.ok(result.bytes < Buffer.byteLength(JSON.stringify(project)) * 0.02);
  assert.deepEqual(readProjectDocument(value.projectPath).project, project);
  assert.equal(readdirSync(join(value.root, 'games', 'sidecar_test')).some(name => name.endsWith('.tmp')), false);
});

test('an existing embedded project is not migrated by an unrelated save', async t => {
  const value = await fixture();
  t.after(value.cleanup);
  const legacyAsset = imageDataUrl(24 * 1024);
  const legacyRuns = largeRuns();
  const legacy = {
    name: 'Legacy',
    theme: { symbols: [{ name: 'A', src: legacyAsset }] },
    production: { qa: { historicalAudit: { runs: legacyRuns } } },
  };
  writeFileSync(value.projectPath, JSON.stringify(legacy, null, 2), { recursive: false });

  const updated = structuredClone(legacy);
  updated.name = 'Legacy renamed';
  const result = persistProjectDocument(value.projectPath, updated, { evidenceThreshold: 32 * 1024 });
  const raw = JSON.parse(readFileSync(value.projectPath, 'utf8'));
  assert.equal(raw.theme.symbols[0].src, legacyAsset);
  assert.deepEqual(raw.production.qa.historicalAudit.runs, legacyRuns);
  assert.equal(result.stats.dataUrlReferences, 0);
  assert.equal(result.stats.evidenceReferences, 0);
  assert.equal(existsSync(join(value.root, 'games', 'sidecar_test', '.stake-studio')), false);
});

test('only newly imported content is externalized beside legacy embedded content', async t => {
  const value = await fixture();
  t.after(value.cleanup);
  const legacyAsset = imageDataUrl(24 * 1024);
  const legacy = { name: 'Mixed', theme: { symbols: [{ name: 'A', src: legacyAsset }] } };
  writeFileSync(value.projectPath, JSON.stringify(legacy, null, 2));
  const addedAsset = imageDataUrl(32 * 1024);
  const updated = structuredClone(legacy);
  updated.theme.symbols.push({ name: 'B', src: addedAsset });

  persistProjectDocument(value.projectPath, updated);
  const raw = JSON.parse(readFileSync(value.projectPath, 'utf8'));
  assert.equal(raw.theme.symbols[0].src, legacyAsset);
  assert.equal(raw.theme.symbols[1].src.$stakeStudioSidecar.format, PROJECT_SIDECAR_FORMAT);
  assert.deepEqual(readProjectDocument(value.projectPath).project, updated);
});

test('tampered content-addressed sidecars fail closed', async t => {
  const value = await fixture();
  t.after(value.cleanup);
  persistProjectDocument(value.projectPath, { theme: { src: imageDataUrl(8 * 1024) } });
  const raw = JSON.parse(readFileSync(value.projectPath, 'utf8'));
  const sidecar = join(value.root, 'games', 'sidecar_test', raw.theme.src.$stakeStudioSidecar.path);
  writeFileSync(sidecar, Buffer.from('tampered'));
  assert.throws(() => readProjectDocument(value.projectPath), /hash mismatch/);
});
