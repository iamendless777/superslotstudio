import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { inventoryFrontendSourceAssets, stageFrontendAssets } from '../server/frontend-compiler.mjs';

test('local project asset URLs are copied into the portable frontend package', () => {
  const home = mkdtempSync(join(tmpdir(), 'stakestudio-local-asset-package-'));
  try {
    const projectId = 'local_asset_proof';
    const projectRoot = join(home, 'games', projectId);
    const sourceDir = join(projectRoot, 'assets', 'motion');
    const staged = join(projectRoot, 'staged');
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(staged, { recursive: true });
    const sourceBytes = Buffer.from('local-motion-atlas-proof');
    writeFileSync(join(sourceDir, 'ambient-proof.png'), sourceBytes);
    const config = {
      background: '',
      symbols: [],
      playerInformation: { symbols: [] },
      visualEffects: {
        motionAssets: [{
          id: 'ambient-proof',
          src: `/__stake_studio/projects/${projectId}/assets/motion/ambient-proof.png`,
        }],
      },
    };
    const written = [];

    const result = stageFrontendAssets(config, staged, written, { projectRoot, projectId });

    assert.equal(result.strategy, 'hashed-files');
    assert.equal(result.fileCount, 1);
    assert.equal(result.lineage.format, 'stake-studio-frontend-asset-lineage-v1');
    assert.deepEqual(result.lineage.assets, [{
      id: 'motion.ambient-proof',
      role: 'motion',
      category: 'motion',
      path: config.visualEffects.motionAssets[0].src,
      sha256: written[0].sha256,
      bytes: sourceBytes.length,
    }]);
    assert.match(config.visualEffects.motionAssets[0].src, /^assets\/motion\/[a-f0-9]{24}\.png$/);
    assert.deepEqual(readFileSync(join(staged, config.visualEffects.motionAssets[0].src)), sourceBytes);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('source asset inventory hashes every saved file and binds identical packaged content', () => {
  const root = mkdtempSync(join(tmpdir(), 'stake-source-inventory-'));
  try {
    mkdirSync(join(root, 'assets', 'visual'), { recursive: true });
    mkdirSync(join(root, 'assets', 'runtime'), { recursive: true });
    const source = Buffer.from('authoritative-art');
    const stale = Buffer.from('stale-derivative');
    writeFileSync(join(root, 'assets', 'visual', 'symbol.png'), source);
    writeFileSync(join(root, 'assets', 'runtime', 'symbol.png'), stale);
    const digest = createHash('sha256').update(source).digest('hex');
    const inventory = inventoryFrontendSourceAssets(root, [{ id: 'symbol.SYMBOL', role: 'symbol', sha256: digest }]);
    assert.equal(inventory.fileCount, 2);
    assert.equal(inventory.contentBoundFileCount, 1);
    assert.equal(inventory.staleRuntimeDerivativeCount, 1);
    assert.equal(inventory.unboundFileCount, 0);
    assert.deepEqual(inventory.files.find(file => file.path === 'assets/visual/symbol.png').semanticIds, ['symbol.SYMBOL']);
    assert.equal(inventory.files.find(file => file.path === 'assets/runtime/symbol.png').status, 'stale-runtime-derivative');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
