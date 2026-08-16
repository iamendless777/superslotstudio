import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { generateReviewerReplayEventCatalog } from '../server/math-publisher.mjs';
import { resolveMathSdkRoot } from '../server/studio-paths.mjs';

const python = join(resolveMathSdkRoot(), 'env', 'bin', 'python');
const replayReader = fileURLToPath(new URL('../server/read_published_reviewer_replay.py', import.meta.url));

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('reviewer replay catalog selects real weighted books and marks an impossible bonus trigger not applicable', () => {
  const root = mkdtempSync(join(tmpdir(), 'reviewer-replay-catalog-'));
  const configs = join(root, 'configs');
  const publish = join(root, 'publish_files');
  const forces = join(root, 'forces');
  mkdirSync(configs); mkdirSync(publish); mkdirSync(forces);
  const books = [
    { id: 0, payoutMultiplier: 0, criteria: '0', events: [] },
    { id: 1, payoutMultiplier: 100, criteria: 'basegame', events: [{ index: 0, type: 'winInfo' }] },
    { id: 2, payoutMultiplier: 5000, criteria: 'basegame', events: [{ index: 0, type: 'winInfo' }] },
    { id: 3, payoutMultiplier: 10000000, criteria: 'wincap', events: [{ index: 0, type: 'maxDream' }, { index: 1, type: 'wincap' }] },
  ];
  const raw = join(root, 'books.jsonl');
  const events = join(publish, 'books_trickster.jsonl.zst');
  writeFileSync(raw, `${books.map(value => JSON.stringify(value)).join('\n')}\n`);
  const compressed = spawnSync(python, ['-c', 'import sys,zstandard;open(sys.argv[2],"wb").write(zstandard.ZstdCompressor().compress(open(sys.argv[1],"rb").read()))', raw, events], { encoding: 'utf8' });
  assert.equal(compressed.status, 0, compressed.stderr);
  writeFileSync(join(publish, 'lookUpTable_trickster_0.csv'), '0,10,0\n1,10,100\n2,10,5000\n3,1,10000000\n');
  writeFileSync(join(publish, 'index.json'), JSON.stringify({
    modes: [{ name: 'trickster', events: 'books_trickster.jsonl.zst', weights: 'lookUpTable_trickster_0.csv' }],
  }));
  writeFileSync(join(forces, 'force_record_trickster.json'), '[]');
  writeFileSync(join(configs, 'config.json'), JSON.stringify({
    gameID: 'proof', providerNumber: 0,
    bookShelfConfig: [{
      name: 'trickster', cost: 75, maxWin: 100000,
      tables: [{ file: 'lookUpTable_trickster_0.csv' }],
      booksFile: { file: 'books_trickster.jsonl.zst', sha256: sha(events) },
      forceFile: { file: 'force_record_trickster.json' },
    }],
  }));
  try {
    const project = { math: { betModes: [{ name: 'trickster', profile: { entry: 'base', triggerFreeSpins: false } }] } };
    const catalog = generateReviewerReplayEventCatalog(root, project, python);
    assert.equal(catalog.complete, true);
    assert.deepEqual(Object.fromEntries(Object.entries(catalog.modes[0].entries).map(([key, value]) => [key, value.bookId])), {
      loss: 0, normalWin: 1, bigWin: 2, wincap: 3, bonusTrigger: null,
    });
    assert.equal(catalog.modes[0].entries.bonusTrigger.status, 'notApplicable');
    assert.equal(catalog.modes[0].entries.wincap.eventTypes.includes('maxDream'), true);
    assert.equal(JSON.parse(readFileSync(join(root, 'reviewer-replay-event-catalog.json'), 'utf8')).catalogSha256, catalog.catalogSha256);
    const replayRun = spawnSync(python, [replayReader, root, 'trickster', 'normalWin'], { encoding: 'utf8' });
    assert.equal(replayRun.status, 0, replayRun.stderr || replayRun.stdout);
    const replay = JSON.parse(replayRun.stdout);
    assert.equal(replay.format, 'stake-studio-published-reviewer-replay-v1');
    assert.equal(replay.catalogSha256, catalog.catalogSha256);
    assert.equal(replay.book.id, 1);
    assert.equal(replay.book.payoutMultiplier, 100);
    assert.deepEqual(replay.book.events, [{ index: 0, type: 'winInfo' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
