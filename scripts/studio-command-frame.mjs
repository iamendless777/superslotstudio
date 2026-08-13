#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const command = process.argv[2];
const outputPath = resolve(process.argv[3] || 'output/studio-command-frame.png');
const timeoutMs = Math.max(1000, Number(process.argv[4]) || 15000);
const commandArguments = process.argv[5] ? JSON.parse(process.argv[5]) : {};
const baseUrl = 'http://127.0.0.1:3000/__stake_studio';
if (!command) throw new Error('A StakeStudio bridge command is required.');

const queuedResponse = await fetch(`${baseUrl}/commands`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ command, arguments: commandArguments }),
});
if (!queuedResponse.ok) throw new Error(`Could not queue ${command}: HTTP ${queuedResponse.status}`);
const queued = await queuedResponse.json();
const deadline = Date.now() + timeoutMs;
let result;

while (Date.now() < deadline) {
  await new Promise(resolveWait => setTimeout(resolveWait, 100));
  const response = await fetch(`${baseUrl}/command-results/${queued.id}`);
  if (response.status === 404) continue;
  result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `${command} failed.`);
  break;
}

if (!result) throw new Error(`${command} did not complete within ${timeoutMs}ms.`);
const frameResponse = await fetch(`${baseUrl}/frame`);
if (!frameResponse.ok) throw new Error(`Could not fetch captured frame: HTTP ${frameResponse.status}`);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(await frameResponse.arrayBuffer()));
console.log(JSON.stringify({ result: result.result, frame: outputPath }, null, 2));
