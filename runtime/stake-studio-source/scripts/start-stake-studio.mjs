import { existsSync, watch } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, loadEnv } from 'vite';

import { stakeStudioBridge } from '../server/bridge-plugin.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '../..');
const env = loadEnv('development', root, '');

// Ports:
//   3000 — ChatGPT / human lane (`npm run dev`)
//   3001 — agent lane (`npm run dev:agent`) with live reload so git pull
//          and planner edits do not require Ctrl+C + restart.
const port = Number(process.env.PORT || process.env.STAKE_STUDIO_PORT || 3000);
const host = process.env.HOST || process.env.STAKE_STUDIO_HOST || '127.0.0.1';
const liveReload =
  process.env.STAKE_STUDIO_LIVE_RELOAD === '1' ||
  process.env.STAKE_STUDIO_LIVE_RELOAD === 'true' ||
  process.env.STAKE_STUDIO_AGENT === '1';

function compileDomain() {
  const tsc = resolve(repoRoot, 'node_modules/typescript/bin/tsc');
  if (!existsSync(tsc)) return existsSync(resolve(repoRoot, 'dist/tools/studio/cli.js'));
  const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.warn('[stake-studio] domain tsc failed\n', result.stdout || result.stderr);
    return false;
  }
  return true;
}

function syncMotionFixtures() {
  const cli = resolve(repoRoot, 'dist/tools/studio/cli.js');
  if (!existsSync(cli)) {
    console.log(
      '[stake-studio] motion fixtures: committed JSON (repo-root npm run build regenerates)',
    );
    return;
  }
  const result = spawnSync(process.execPath, [cli, 'cues', '--all', '--quiet'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.warn('[stake-studio] motion fixture sync failed', result.stderr || result.stdout);
    return;
  }
  if (result.stderr) process.stderr.write(result.stderr);
}

function watchMotionPlanner() {
  if (!liveReload) return;
  const dirs = [resolve(repoRoot, 'src/motion'), resolve(repoRoot, 'src/studio')];
  let timer = null;
  const kick = (why) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`[stake-studio] motion planner changed (${why}) — rebuilding fixtures`);
      if (compileDomain()) syncMotionFixtures();
    }, 400);
  };
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    watch(dir, { recursive: true }, (_event, file) => {
      if (file && !String(file).endsWith('.ts')) return;
      kick(file || dir);
    });
  }
}

if (liveReload) compileDomain();
syncMotionFixtures();

const server = await createServer({
  configFile: false,
  root,
  publicDir: 'public',
  plugins: [stakeStudioBridge({ openaiApiKey: env.OPENAI_API_KEY })],
  server: {
    host,
    port,
    strictPort: true,
    open: false,
    watch:
      process.env.STAKE_STUDIO_LIVE_RELOAD === '0'
        ? null
        : liveReload
          ? undefined
          : null,
    hmr: process.env.STAKE_STUDIO_LIVE_RELOAD === '0' ? false : liveReload,
  },
});

await server.listen();
server.printUrls();
watchMotionPlanner();
console.log(
  `[stake-studio] port=${port} host=${host} liveReload=${liveReload ? 'on' : 'off'}  open http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/`,
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
