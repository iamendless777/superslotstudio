import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

import { probeStudioHealth, resolveStudioHome } from './studio-paths.mjs';

export function liveAppFile(studioHome) {
  return join(studioHome, '.stake-studio-runtime', 'live.json');
}

export function readLiveApp(studioHome) {
  const file = liveAppFile(studioHome);
  if (!existsSync(file)) return null;
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!value?.url) return null;
    return value;
  } catch {
    return null;
  }
}

export function writeLiveApp(studioHome, record) {
  const file = liveAppFile(studioHome);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({
    product: 'Stake Studio',
    url: String(record.url).replace(/\/$/, ''),
    pid: record.pid || process.pid,
    startedAt: record.startedAt || new Date().toISOString(),
  }, null, 2)}\n`);
  return file;
}

export function clearLiveApp(studioHome, pid = process.pid) {
  const current = readLiveApp(studioHome);
  if (!current) return;
  if (current.pid && current.pid !== pid) return;
  try { unlinkSync(liveAppFile(studioHome)); } catch { /* lock already gone */ }
}

export async function existingLiveApp(studioHome, options = {}) {
  const record = readLiveApp(studioHome);
  if (!record?.url) return null;
  const live = await probeStudioHealth(record.url, options);
  return live ? { ...record, url: live.url, health: live.health } : null;
}

function addrPort(addr) {
  const text = String(addr || '');
  const match = text.match(/:(\d+)\s*$/) || text.match(/localhost:(\d+)/i) || text.match(/127\.0\.0\.1:(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function detectExistingTunnelPort({ fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl('http://127.0.0.1:4040/api/tunnels', {
      signal: AbortSignal.timeout(400),
    });
    if (!response?.ok) return null;
    const body = await response.json();
    const ports = (body?.tunnels || [])
      .map(tunnel => addrPort(tunnel?.config?.addr))
      .filter(port => Number.isInteger(port) && port > 0);
    return ports[0] || null;
  } catch {
    return null;
  }
}

export function portIsFree(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const socket = createConnection({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(true));
  });
}

export async function chooseListenPort(options = {}) {
  const requested = Number(options.requested);
  if (Number.isInteger(requested) && requested > 0) return requested;
  const tunnel = await detectExistingTunnelPort(options);
  if (tunnel) return tunnel;
  for (const port of [3000, 3001, 3002, 3003, 3010]) {
    if (await portIsFree(port, options.host || '127.0.0.1')) return port;
  }
  throw new Error('Stake Studio could not find a free local door. Close leftover copies and open the app once.');
}

export function openStudioWindow(url) {
  const target = String(url || '').replace(/\/$/, '') || null;
  if (!target) return;
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', target] : [target];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

export async function resolveLiveStudioUrl(options = {}) {
  const studioHome = options.studioHome || resolveStudioHome(null, options);
  const live = await existingLiveApp(studioHome, options);
  if (live?.url) return live.url;
  return null;
}

export function defaultStudioHome() {
  return resolveStudioHome(null, { homeDirectory: homedir() });
}
