import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function usableStudioHome(path) {
  return Boolean(path
    && existsSync(join(path, 'games'))
    && existsSync(join(path, 'reference', 'math-sdk', 'env', 'bin', 'python')));
}

export function resolveStudioHome(explicit = null, { cwd = process.cwd(), environment = process.env, homeDirectory = homedir() } = {}) {
  const requested = explicit || environment.STAKE_STUDIO_HOME;
  if (requested) return resolve(requested);
  const candidates = [
    resolve(cwd, '..'),
    resolve(cwd, '../..'),
    join(homeDirectory, 'Developer', 'Game Studio Home'),
    join(homeDirectory, 'Desktop', 'Game Studio Home'),
  ];
  return candidates.find(usableStudioHome) || candidates[0];
}

export function resolveMathSdkRoot(options = {}) {
  const studioHome = resolveStudioHome(options.studioHome, options);
  const homeDirectory = options.homeDirectory || homedir();
  const candidates = [
    join(studioHome, 'reference', 'math-sdk'),
    join(homeDirectory, 'Slots_recovery', 'reference', 'math-sdk'),
  ];
  return candidates.find(path => existsSync(join(path, 'env', 'bin', 'python'))) || candidates[0];
}

function normalizeStudioUrl(value) {
  const text = String(value || '').trim().replace(/\/$/, '');
  return text || null;
}

export function studioUrlCandidates({ environment = process.env } = {}) {
  const unique = [];
  for (const value of [
    environment.STAKE_STUDIO_URL,
    environment.PORT ? `http://127.0.0.1:${environment.PORT}` : null,
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ]) {
    const url = normalizeStudioUrl(value);
    if (url && !unique.includes(url)) unique.push(url);
  }
  return unique;
}

export async function probeStudioHealth(url, { fetchImpl = fetch, timeoutMs = 800 } = {}) {
  const target = normalizeStudioUrl(url);
  if (!target) return null;
  try {
    const response = await fetchImpl(`${target}/__stake_studio/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response?.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.ok === true ? { url: target, health: body } : null;
  } catch {
    return null;
  }
}

/** Find the running Stake Studio app. Models plug into that window. They do not own ports. */
export async function resolveStudioUrl(options = {}) {
  const environment = options.environment || process.env;
  const live = [];
  for (const url of studioUrlCandidates({ environment })) {
    const found = await probeStudioHealth(url, options);
    if (found && !live.includes(found.url)) live.push(found.url);
  }
  if (live.includes('http://127.0.0.1:3000')) return 'http://127.0.0.1:3000';
  if (live.length) return live[0];
  return normalizeStudioUrl(environment.STAKE_STUDIO_URL) || 'http://127.0.0.1:3000';
}
