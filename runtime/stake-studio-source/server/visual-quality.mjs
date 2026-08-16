import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const analysisScript = join(dirname(fileURLToPath(import.meta.url)), 'analyze-visual-asset.py');
const MAX_ANALYSIS_INPUT_BYTES = 70 * 1024 * 1024;

export function analyzeVisualAsset(payload, { run = execFileSync } = {}) {
  const input = JSON.stringify(payload || {});
  if (Buffer.byteLength(input) > MAX_ANALYSIS_INPUT_BYTES) throw new Error('Visual QA input is too large.');
  const inputDirectory = mkdtempSync(join(tmpdir(), 'stake-studio-visual-qa-'));
  const inputPath = join(inputDirectory, 'payload.json');
  writeFileSync(inputPath, input, 'utf8');
  let output;
  try {
    output = run('python3', [analysisScript, inputPath], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const detail = String(error.stdout || error.stderr || '').trim();
    let message = '';
    try {
      const parsed = JSON.parse(detail);
      message = parsed.error || '';
    } catch {}
    throw new Error(message || detail || error.message || 'Local visual analysis failed.');
  } finally {
    rmSync(inputDirectory, { recursive: true, force: true });
  }
  const result = JSON.parse(String(output || '{}'));
  if (result.error) throw new Error(result.error);
  if (result.format !== 'stake-studio-visual-analysis-v1') throw new Error('Local visual analysis returned an invalid report.');
  return result;
}
