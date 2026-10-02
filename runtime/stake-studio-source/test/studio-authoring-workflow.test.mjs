import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameProject, DEFAULT_SYMBOLS } from '../src/engines/schema.js';
import { applyGameBlueprint } from '../src/engines/blueprints/GameBlueprintEngine.js';
import { generateDefaultPaylines } from '../src/engines/math/WinTypeEngine.js';
import { MathEngine } from '../src/engines/math/MathEngine.js';
import { BuildEngine } from '../src/engines/build/BuildEngine.js';
import { Readable } from 'node:stream';
import { stakeStudioBridge } from '../server/bridge-plugin.mjs';
test('two independently authored play styles preserve art and configuration through save, reopen and export', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'studio-authoring-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const base = '/__stake_studio';
  let middleware;
  stakeStudioBridge({ home }).configureServer({
    middlewares: {
      use(value) {
        middleware = value;
      },
    },
  });
  async function req(path, method = 'GET', body) {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.method = method;
    req.url = base + path;
    return new Promise((resolve, reject) => {
      const res = {
        statusCode: 0,
        setHeader() {},
        end(value) {
          try {
            const data = JSON.parse(String(value || '{}'));
            assert.equal(this.statusCode, 200, JSON.stringify(data));
            resolve(data);
          } catch (error) {
            reject(error);
          }
        },
      };
      Promise.resolve(
        middleware(req, res, () => reject(new Error('Unexpected next'))),
      ).catch(reject);
    });
  }
  const result = [];
  for (const [id, name, blueprint, color] of [
    ['qa_citrus_lines', 'QA Citrus Lines', 'rapid_ways', '#fdc500'],
    ['qa_lunar_forge', 'QA Lunar Forge', 'wild_forge', '#645cff'],
  ]) {
    const p = createGameProject({ name });
    applyGameBlueprint(p, blueprint);
    p.build.stakeEngine.gameId = id;
    p.build.stakeEngine.providerName = 'Disposable QA';
    if (id === 'qa_citrus_lines') {
      p.math.gameType = 'lines';
      p.math.paylines = generateDefaultPaylines(p.math.grid, 10);
      p.blueprint = null;
    }
    p.theme.colorPalette = [color];
    p.theme.style = `Disposable ${name} authoring test`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${color}"/><circle cx="128" cy="128" r="70" fill="white"/></svg>`;
    p.theme.symbols[0].src =
      'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    p.theme.cabinet.layers.push({
      id: 'qa-reel-area',
      type: 'reel-area',
      x: 140,
      y: 160,
      width: 1000,
      height: 500,
    });
    await req('/projects/' + id, 'PUT', { project: p });
    const restored = (await req('/projects/' + id)).project;
    assert.deepEqual(restored, p);
    const board = new MathEngine(restored).generateBoard(() => 0.37);
    assert.equal(board.length, p.math.grid.reels);
    assert.deepEqual(
      board.map((r) => r.length),
      p.math.grid.rows,
    );
    const compiled = await req(
      '/projects/' + id + '/frontend-compiler/build',
      'POST',
      {},
    );
    const config = JSON.parse(
      readFileSync(compiled.root + '/game-config.json', 'utf8'),
    );
    assert.equal(config.gameId, id);
    assert.deepEqual(config.grid, p.math.grid);
    assert.ok(config.symbols.some((s) => s.src));
    const reopened = (await req('/projects/' + id)).project;
    const bundle = new BuildEngine(reopened).exportProjectBundle();
    assert.equal(bundle.project.name, name);
    assert.ok(Object.keys(bundle.mathSDK).length > 0);
    assert.equal(bundle.validation.valid, false);
    assert.ok(
      bundle.validation.errors.some((error) =>
        /production math books/i.test(error),
      ),
      'a prototype must not claim release readiness',
    );
    assert.deepEqual(reopened.theme.symbols, p.theme.symbols);
    assert.deepEqual(reopened.math, p.math);
    assert.ok(
      compiled.files.every(
        (file) => readFileSync(join(compiled.root, file)).length > 0,
      ),
    );
    const symbolFile = config.symbols[0].src;
    assert.equal(readFileSync(compiled.root + '/' + symbolFile, 'utf8'), svg);
    result.push({
      id,
      name,
      gameType: p.math.gameType,
      grid: p.math.grid,
      saveReopen: true,
      compiledFiles: compiled.files.length,
      previewBoard: board,
      releaseValid: bundle.validation.valid,
      releaseErrors: bundle.validation.errors,
    });
  }
  const projects = (await req('/projects')).projects;
  assert.equal(projects.length, 2);
  assert.notEqual(result[0].gameType, result[1].gameType);
  assert.notDeepEqual(result[0].grid, result[1].grid);
});


test('editing one project never changes another project or new-game symbol defaults', () => {
  const defaults = structuredClone(DEFAULT_SYMBOLS);
  const first = createGameProject({ name: 'First independent project' });
  const second = createGameProject({ name: 'Second independent project' });
  first.theme.symbols[0].payouts[3] = 123;
  first.theme.symbols[0].special.push('wild');
  assert.deepEqual(second.theme.symbols, defaults);
  assert.deepEqual(createGameProject().theme.symbols, defaults);
  assert.deepEqual(DEFAULT_SYMBOLS, defaults);
});
