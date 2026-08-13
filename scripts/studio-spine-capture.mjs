#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const outputPath = resolve(process.argv[2] || 'output/presentation-spine-layer.png');
const baseUrl = 'http://127.0.0.1:3000/__stake_studio';
const queuedResponse = await fetch(`${baseUrl}/commands`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ command: 'capture_spine_layer', arguments: {} }),
});
if (!queuedResponse.ok) throw new Error(`Could not queue Spine capture: HTTP ${queuedResponse.status}`);
const queued = await queuedResponse.json();
const deadline = Date.now() + 30000;
let result;
while (Date.now() < deadline) {
  await new Promise(resolveWait => setTimeout(resolveWait, 150));
  const response = await fetch(`${baseUrl}/command-results/${queued.id}`);
  if (response.status === 404) continue;
  result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Spine capture failed.');
  break;
}
if (!result) throw new Error('Spine capture timed out.');
const { dataUrl, width, height } = result.result;
const match = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
if (!match) throw new Error('Spine capture did not return a PNG.');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(match[1], 'base64'));
console.log(JSON.stringify({ frame: outputPath, width, height }, null, 2));
