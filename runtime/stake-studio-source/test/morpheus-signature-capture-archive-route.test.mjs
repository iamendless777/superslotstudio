import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';

import { stakeStudioBridge } from '../server/bridge-plugin.mjs';

const temporaryRoots = [];
afterEach(() => {
  while (temporaryRoots.length) rmSync(temporaryRoots.pop(), { recursive: true, force: true });
});

function harness(project = {}) {
  const home = mkdtempSync(join(tmpdir(), 'morpheus-capture-route-'));
  temporaryRoots.push(home);
  const projectRoot = join(home, 'games', 'morpheus_dreamfall');
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(projectRoot, 'project.json'), JSON.stringify(project));
  const sdkBin = join(home, 'reference', 'math-sdk', 'env', 'bin');
  mkdirSync(sdkBin, { recursive: true });
  writeFileSync(join(sdkBin, 'python'), 'fixture');
  let middleware;
  stakeStudioBridge({ home }).configureServer({ middlewares: { use(value) { middleware = value; } } });
  const request = async (path, body) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.method = 'POST';
    req.url = path;
    const response = await new Promise((resolve, reject) => {
      const res = {
        statusCode: 0,
        headers: {},
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        end(value) { resolve({ status: this.statusCode, headers: this.headers, body: JSON.parse(String(value || '{}')) }); },
      };
      Promise.resolve(middleware(req, res, () => reject(new Error('QA capture route unexpectedly called next().')))).catch(reject);
    });
    return response;
  };
  return { home, projectRoot, request };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upperLeft)];
  return distances[0] <= distances[1] && distances[0] <= distances[2] ? left : (distances[1] <= distances[2] ? up : upperLeft);
}

function rgbaPng(width, height, pixel, filterForRow = () => 0) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let previous = Buffer.alloc(width * 4);
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    const filter = filterForRow(y);
    const raw = Buffer.alloc(width * 4);
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), x * 4);
    scanlines[row] = filter;
    for (let index = 0; index < raw.length; index++) {
      const left = index >= 4 ? raw[index - 4] : 0;
      const up = previous[index];
      const upperLeft = index >= 4 ? previous[index - 4] : 0;
      const predictor = filter === 1 ? left
        : filter === 2 ? up
          : filter === 3 ? Math.floor((left + up) / 2)
            : filter === 4 ? paeth(left, up, upperLeft) : 0;
      scanlines[row + 1 + index] = (raw[index] - predictor) & 0xff;
    }
    previous = raw;
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

const PNG_1X1 = rgbaPng(1, 1, () => [255, 0, 0, 255]);
const PNG_2X1 = rgbaPng(2, 1, x => x ? [0, 255, 0, 255] : [255, 0, 0, 255]);

function body(overrides = {}) {
  return {
    scenarioId: 'morpheus-dreamfall-signature-v2',
    runId: 'gate7-run-001',
    viewport: 'mini',
    checkpointId: 'mini-max-growth-8-row',
    width: 1,
    height: 1,
    capturedAt: '2026-08-11T20:00:00.000Z',
    data: PNG_1X1,
    ...overrides,
  };
}

test('QA capture route archives a content-addressed PNG and returns server-derived evidence', async () => {
  const value = harness();
  const response = await value.request('/__stake_studio/projects/morpheus_dreamfall/qa-captures', body());
  assert.equal(response.status, 200);
  assert.equal(response.body.archived, true);
  assert.equal(response.body.reused, false);
  assert.match(response.body.sha256, /^[0-9a-f]{64}$/);
  assert.equal(response.body.width, 1);
  assert.equal(response.body.height, 1);
  assert.equal(response.body.mimeType, 'image/png');
  assert.equal(response.body.visualMetrics.format, 'stake-studio-png-visual-metrics-v1');
  assert.equal(response.body.visualMetrics.authority, 'server-decoded-png');
  assert.equal(response.body.visualMetrics.sampleCount, 1);
  assert.deepEqual(Object.keys(response.body.visualMetrics).sort(), [
    'alphaCoverage', 'authority', 'colorBucketCount', 'detailGridHeight', 'detailGridWidth',
    'detailHash', 'detailLumaGridHex', 'edgeDensity', 'entropyBits', 'format',
    'luminanceRange', 'luminanceStdDev', 'nonUniformPixelRatio', 'perceptualHash', 'sampleCount',
  ]);
  assert.match(response.body.projectRelativePath, /^qa-captures\/morpheus-dreamfall-signature-v2\/gate7-run-001\/mini\/mini-max-growth-8-row-[0-9a-f]{12}\.png$/);
  const archived = join(value.projectRoot, response.body.projectRelativePath);
  assert.equal(existsSync(archived), true);
  assert.equal(readFileSync(archived).toString('base64'), PNG_1X1);
  assert.equal(existsSync(`${archived}.json`), true);

  const repeated = await value.request('/__stake_studio/projects/morpheus_dreamfall/qa-captures', body({
    capturedAt: '2026-08-11T21:00:00.000Z',
  }));
  assert.equal(repeated.body.reused, true);
  assert.equal(repeated.body.sha256, response.body.sha256);
  assert.equal(repeated.body.projectRelativePath, response.body.projectRelativePath);
  assert.equal(repeated.body.capturedAt, response.body.capturedAt, 'immutable metadata retains the original capture time');
});

test('QA capture route preserves an earlier logical checkpoint when new pixels arrive', async () => {
  const value = harness();
  const first = await value.request('/__stake_studio/projects/morpheus_dreamfall/qa-captures', body());
  const second = await value.request('/__stake_studio/projects/morpheus_dreamfall/qa-captures', body({ data: PNG_2X1, width: 2 }));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.notEqual(first.body.sha256, second.body.sha256);
  assert.notEqual(first.body.projectRelativePath, second.body.projectRelativePath);
  assert.equal(existsSync(join(value.projectRoot, first.body.projectRelativePath)), true);
  assert.equal(existsSync(join(value.projectRoot, second.body.projectRelativePath)), true);
});

test('QA capture route rejects traversal and declared-dimension drift', async () => {
  const value = harness();
  const traversal = await value.request('/__stake_studio/projects/morpheus_dreamfall/qa-captures', body({ checkpointId: '../escape' }));
  assert.equal(traversal.status, 500);
  assert.match(traversal.body.error, /safe letters/);
  const drift = await value.request('/__stake_studio/projects/morpheus_dreamfall/qa-captures', body({ width: 400, height: 250 }));
  assert.equal(drift.status, 500);
  assert.match(drift.body.error, /do not match/);
});

test('QA capture route emits decoded evidence that distinguishes rich, blank, and near-blank PNGs without byte heuristics', async () => {
  const value = harness();
  const blank = rgbaPng(64, 64, () => [8, 8, 8, 255]);
  const nearBlank = rgbaPng(64, 64, (x, y) => (x === 31 && y === 31 ? [12, 12, 12, 255] : [8, 8, 8, 255]));
  const rich = rgbaPng(64, 64, (x, y) => {
    const level = ((Math.floor(x / 4) + Math.floor(y / 4) * 5) % 16) * 17;
    return [level, 255 - level, (level * 7) % 256, 255];
  }, y => y % 5);
  const archive = (checkpointId, data) => value.request('/__stake_studio/projects/morpheus_dreamfall/qa-captures', body({
    checkpointId, data, width: 64, height: 64,
  }));
  const blankReceipt = await archive('blank', blank);
  const nearBlankReceipt = await archive('near-blank', nearBlank);
  const richReceipt = await archive('rich', rich);
  assert.equal(blankReceipt.status, 200);
  assert.equal(nearBlankReceipt.status, 200);
  assert.equal(richReceipt.status, 200);
  assert.equal(blankReceipt.body.visualMetrics.luminanceStdDev, 0);
  assert.ok(nearBlankReceipt.body.visualMetrics.luminanceStdDev < 0.025);
  assert.ok(nearBlankReceipt.body.visualMetrics.entropyBits < 1.5);
  assert.ok(richReceipt.body.visualMetrics.sampleCount >= 4096);
  assert.ok(richReceipt.body.visualMetrics.luminanceRange >= 0.12);
  assert.ok(richReceipt.body.visualMetrics.luminanceStdDev >= 0.025);
  assert.ok(richReceipt.body.visualMetrics.entropyBits >= 1.5);
  assert.ok(richReceipt.body.visualMetrics.colorBucketCount >= 12);
  assert.ok(richReceipt.body.visualMetrics.nonUniformPixelRatio >= 0.05);
  assert.ok(richReceipt.body.visualMetrics.edgeDensity >= 0.002);
  assert.match(richReceipt.body.visualMetrics.perceptualHash, /^[0-9a-f]{16}$/);
  assert.equal(richReceipt.body.visualMetrics.detailGridWidth, 64);
  assert.equal(richReceipt.body.visualMetrics.detailGridHeight, 64);
  assert.match(richReceipt.body.visualMetrics.detailLumaGridHex, /^[0-9a-f]{8192}$/);
  assert.match(richReceipt.body.visualMetrics.detailHash, /^[0-9a-f]{64}$/);
  assert.notEqual(blankReceipt.body.sha256, nearBlankReceipt.body.sha256);
  assert.notEqual(blankReceipt.body.bytes, nearBlankReceipt.body.bytes);
});

test('high-resolution decoded signature detects localized changes missed by the whole-frame 8x8 hash', async () => {
  const value = harness();
  const background = (x, y) => {
    const level = ((Math.floor(x / 4) + Math.floor(y / 4) * 5) % 16) * 17;
    return [level, 255 - level, (level * 7) % 256, 255];
  };
  const before = rgbaPng(64, 64, background, y => y % 5);
  const after = rgbaPng(64, 64, (x, y) => (
    x >= 26 && x < 31 && y >= 30 && y < 35 ? [255, 255, 255, 255] : background(x, y)
  ), y => y % 5);
  const archive = (checkpointId, data) => value.request('/__stake_studio/projects/morpheus_dreamfall/qa-captures', body({
    checkpointId, data, width: 64, height: 64,
  }));
  const first = await archive('localized-before', before);
  const second = await archive('localized-after', after);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.visualMetrics.perceptualHash, second.body.visualMetrics.perceptualHash);
  assert.notEqual(first.body.visualMetrics.detailHash, second.body.visualMetrics.detailHash);
  const firstGrid = first.body.visualMetrics.detailLumaGridHex;
  const secondGrid = second.body.visualMetrics.detailLumaGridHex;
  let changed = 0;
  let totalDelta = 0;
  for (let offset = 0; offset < firstGrid.length; offset += 2) {
    const delta = Math.abs(Number.parseInt(firstGrid.slice(offset, offset + 2), 16)
      - Number.parseInt(secondGrid.slice(offset, offset + 2), 16));
    if (delta >= 3) changed++;
    totalDelta += delta;
  }
  assert.ok(changed / 4096 >= 0.001);
  assert.ok(totalDelta / (4096 * 255) >= 0.0001);
});

test('QA capture route fails closed on a corrupted PNG image stream', async () => {
  const value = harness();
  const corrupted = Buffer.from(PNG_1X1, 'base64');
  const idat = corrupted.indexOf(Buffer.from('IDAT'));
  corrupted[idat + 5] ^= 0xff;
  const response = await value.request('/__stake_studio/projects/morpheus_dreamfall/qa-captures', body({
    data: corrupted.toString('base64'),
  }));
  assert.equal(response.status, 500);
  assert.match(response.body.error, /CRC is invalid/);
});

test('QA archive receipt binds server-decoded cell crops to project symbol references', async () => {
  const red = rgbaPng(32, 32, (x, y) => {
    const active = x >= 6 && x <= 25 && y >= 6 && y <= 25 && ((x + y) % 5 < 3);
    return active ? [230, 40, 70, 255] : [0, 0, 0, 0];
  });
  const blue = rgbaPng(32, 32, (x, y) => {
    const active = x >= 8 && x <= 23 && y >= 5 && y <= 26 && ((x * 2 + y) % 7 < 3);
    return active ? [40, 160, 240, 255] : [0, 0, 0, 0];
  });
  const project = { theme: { symbols: [
    { name: 'RED', src: `data:image/png;base64,${red}` },
    { name: 'BLUE', src: `data:image/png;base64,${blue}` },
  ] } };
  const value = harness(project);
  const redBytes = Buffer.from(red, 'base64');
  const blueBytes = Buffer.from(blue, 'base64');
  const screen = rgbaPng(64, 32, (x, y) => {
    // The two source patterns are reproduced directly over the capture background.
    const active = x < 32
      ? x >= 6 && x <= 25 && y >= 6 && y <= 25 && ((x + y) % 5 < 3)
      : x - 32 >= 8 && x - 32 <= 23 && y >= 5 && y <= 26 && (((x - 32) * 2 + y) % 7 < 3);
    return active ? (x < 32 ? [230, 40, 70, 255] : [40, 160, 240, 255]) : [8, 12, 20, 255];
  });
  assert.ok(redBytes.length > 0 && blueBytes.length > 0);
  const response = await value.request('/__stake_studio/projects/morpheus_dreamfall/qa-captures', body({
    checkpointId: 'recognition', data: screen, recognitionData: screen, width: 64, height: 32,
    renderedCellRecognition: {
      format: 'stake-studio-rendered-cell-recognition-request-v1', minimumScore: .52, minimumMargin: .012,
      cells: [
        { reel: 0, row: 0, expectedSymbol: 'RED', sourceAspect: 1, rect: { left: 0, top: 0, width: 32, height: 32 } },
        { reel: 1, row: 0, expectedSymbol: 'BLUE', sourceAspect: 1, rect: { left: 32, top: 0, width: 32, height: 32 } },
      ],
    },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.body.renderedCellRecognition.passed, true, JSON.stringify(response.body.renderedCellRecognition, null, 2));
  assert.equal(response.body.renderedCellRecognition.cellCount, 2);
  assert.deepEqual(response.body.renderedCellRecognition.cells.map(cell => cell.topSymbol), ['RED', 'BLUE']);
  assert.equal(response.body.staticIdentityRecognition.passed, true);
  assert.match(response.body.staticIdentityFrame.projectRelativePath, /static-identity/);
  const metadata = JSON.parse(readFileSync(`${join(value.projectRoot, response.body.projectRelativePath)}.json`, 'utf8'));
  assert.equal(metadata.renderedCellRecognition.requestHash, response.body.renderedCellRecognition.requestHash);
  assert.equal(metadata.staticIdentityRecognition.requestHash, response.body.staticIdentityRecognition.requestHash);

  const reevaluated = await value.request(
    '/__stake_studio/projects/morpheus_dreamfall/qa-captures/re-evaluate',
    { projectRelativePath: `${response.body.projectRelativePath}.json` },
  );
  assert.equal(reevaluated.status, 200);
  assert.equal(reevaluated.body.format, 'stake-studio-offline-rendered-cell-reevaluation-v1');
  assert.equal(reevaluated.body.authority, 'server-decoded-immutable-archive');
  assert.equal(reevaluated.body.sourceCompositeSha256, response.body.sha256);
  assert.equal(reevaluated.body.sourceIdentitySha256, response.body.staticIdentityFrame.sha256);
  assert.equal(reevaluated.body.passed, true);
  assert.match(reevaluated.body.evaluationHash, /^[a-f0-9]{64}$/);
});

test('offline QA re-evaluation rejects paths outside immutable capture metadata', async () => {
  const value = harness();
  const traversal = await value.request(
    '/__stake_studio/projects/morpheus_dreamfall/qa-captures/re-evaluate',
    { projectRelativePath: '../project.json' },
  );
  assert.equal(traversal.status, 500);
  assert.match(traversal.body.error, /qa-captures/);
});
