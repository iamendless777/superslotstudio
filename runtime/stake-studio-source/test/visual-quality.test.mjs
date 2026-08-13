import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { analyzeVisualAsset } from '../server/visual-quality.mjs';

function fixture(kind) {
  const program = `
import base64, io, json, sys
from PIL import Image, ImageDraw
kind = json.load(sys.stdin)['kind']
image = Image.new('RGBA', (768, 768), (0, 0, 0, 0) if kind == 'symbol' else (92, 0, 92, 255))
draw = ImageDraw.Draw(image)
if kind == 'symbol':
    draw.ellipse((190, 150, 578, 618), fill=(211, 175, 100, 255), outline=(17, 24, 46, 255), width=42)
    draw.polygon(((384, 210), (500, 520), (268, 520)), fill=(130, 216, 232, 255))
output = io.BytesIO()
image.save(output, format='PNG')
print('data:image/png;base64,' + base64.b64encode(output.getvalue()).decode())
`;
  return execFileSync('python3', ['-c', program], {
    input: JSON.stringify({ kind }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

test('local visual QA passes a clean transparent symbol and returns measurable evidence', () => {
  const report = analyzeVisualAsset({
    image: fixture('symbol'), slot: 'symbol',
    palette: 'polar night #11182E, glacier #82D8E8, oath gold #D3AF64, white #FFFFFF',
  });
  assert.equal(report.format, 'stake-studio-visual-analysis-v1');
  assert.equal(report.passed, true);
  assert.equal(report.blockers.length, 0);
  assert.ok(report.metrics.transparentFraction > 0.4);
  assert.ok(report.metrics.dominantColors.length >= 2);
});

test('local visual QA blocks an opaque foreground that covers gameplay', () => {
  const report = analyzeVisualAsset({ image: fixture('blocked'), slot: 'foreground', palette: '#11182E, #82D8E8, #D3AF64, #FFFFFF' });
  assert.equal(report.passed, false);
  assert.deepEqual(report.blockers.map(item => item.id).sort(), ['alpha', 'center-clearance']);
  assert.ok(report.score < 70);
});

test('visual QA runner rejects malformed analyzer output', () => {
  assert.throws(() => analyzeVisualAsset({}, { run: () => '{}' }), /invalid report/);
});

test('visual QA stages payloads in a file instead of piping embedded images to Python', () => {
  const payload = { image: 'data:image/png;base64,AAAA', slot: 'symbol', references: [] };
  let stagedPayload = null;
  const report = analyzeVisualAsset(payload, {
    run: (binary, args, options) => {
      assert.equal(binary, 'python3');
      assert.equal(options.input, undefined);
      stagedPayload = JSON.parse(readFileSync(args[1], 'utf8'));
      return JSON.stringify({ format: 'stake-studio-visual-analysis-v1', passed: true });
    },
  });
  assert.deepEqual(stagedPayload, payload);
  assert.equal(report.passed, true);
});
