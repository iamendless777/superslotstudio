#!/usr/bin/env node

const command = process.argv[2];
const timeoutMs = Math.max(1000, Number(process.argv[3]) || 15000);
const commandArguments = process.argv[4] ? JSON.parse(process.argv[4]) : {};
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

while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 150));
  const response = await fetch(`${baseUrl}/command-results/${queued.id}`);
  if (response.status === 404) continue;
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `${command} failed.`);
  console.log(JSON.stringify(result.result, null, 2));
  process.exit(0);
}

throw new Error(`${command} did not complete within ${timeoutMs}ms.`);
