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
