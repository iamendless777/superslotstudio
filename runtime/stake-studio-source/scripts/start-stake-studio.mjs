import { existsSync, watch, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
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

function compactAgentResult(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(compactAgentResult);
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'dataUrl' && typeof item === 'string') {
      next.dataUrl = `[omitted ${item.length} chars]`;
      continue;
    }
    next[key] = compactAgentResult(item);
  }
  return next;
}

function pollAgentInbox() {
  if (process.env.STAKE_STUDIO_AGENT !== '1' && process.env.STAKE_STUDIO_AGENT !== 'true') return;
  const inboxRef = 'agent/inbox.json';
  const outboxPath = join(repoRoot, 'agent/outbox.json');
  const mcpToCommand = {
    select_studio_panel: args => ({ command: 'select_panel', arguments: args }),
    capture_studio_view: () => ({ command: 'capture_view', arguments: {} }),
    spin_preview: args => ({ command: 'spin_preview', arguments: args }),
    open_project_in_studio: args => ({ command: 'open_project', arguments: args }),
    inspect_studio: () => ({ command: 'inspect_studio', arguments: {} }),
  };
  let lastId = '';
  const git = (args, extra = {}) => spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: extra.timeout || 15000,
  });
  const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));
  const tick = async () => {
    try {
      const branch = (git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout || '').trim() || 'integrate/studio-motion';
      git(['fetch', 'origin', branch], { timeout: 20000 });
      const shown = git(['show', `origin/${branch}:${inboxRef}`]);
      if (shown.status !== 0) return;
      const inbox = JSON.parse(shown.stdout);
      if (!inbox?.id || inbox.id === lastId) return;
      lastId = inbox.id;
      const items = Array.isArray(inbox.commands) && inbox.commands.length
        ? inbox.commands
        : [{ mcp: inbox.mcp, command: inbox.command, arguments: inbox.arguments || {} }];
      const results = [];
      for (const item of items) {
        if (item?.mcp === 'get_studio_state') {
          const response = await fetch(`http://127.0.0.1:${port}/__stake_studio/state`);
          results.push({ mcp: 'get_studio_state', ok: response.ok, result: compactAgentResult(await response.json().catch(() => ({}))) });
          console.log(`[stake-studio] agent inbox ${inbox.id}: get_studio_state`);
          continue;
        }
        const mapped = item?.mcp && mcpToCommand[item.mcp]
          ? mcpToCommand[item.mcp](item.arguments || {})
          : { command: item.command, arguments: item.arguments || {} };
        if (!mapped.command) continue;
        const queued = await fetch(`http://127.0.0.1:${port}/__stake_studio/commands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: mapped.command, arguments: mapped.arguments || {} }),
        });
        const body = await queued.json().catch(() => ({}));
        let result = null;
        const deadline = Date.now() + 20000;
        while (body.id && Date.now() < deadline) {
          await wait(250);
          const pending = await fetch(`http://127.0.0.1:${port}/__stake_studio/command-results/${body.id}`);
          if (pending.status === 404) continue;
          result = compactAgentResult(await pending.json().catch(() => ({})));
          break;
        }
        results.push({
          mcp: item.mcp || null,
          command: mapped.command,
          queued: queued.ok,
          id: body.id || null,
          result,
        });
        console.log(`[stake-studio] agent inbox ${inbox.id}: ${item.mcp || mapped.command}`);
      }
      const outbox = { id: inbox.id, at: new Date().toISOString(), results };
      writeFileSync(outboxPath, `${JSON.stringify(outbox, null, 2)}\n`);
      // Do not commit/push outbox onto the game branch. That is what made every pull diverge.
    } catch (error) {
      console.warn('[stake-studio] agent inbox', error.message || error);
    }
  };
  setTimeout(tick, 2500);
  setInterval(tick, 5000);
  console.log('[stake-studio] agent inbox polling origin agent/inbox.json every 5s · MCP tools mapped');
}

if (liveReload) compileDomain();
syncMotionFixtures();

const server = await createServer({
  configFile: false,
  root,
  publicDir: 'public',
  plugins: [
    stakeStudioBridge({ openaiApiKey: env.OPENAI_API_KEY }),
    {
      name: 'preview-no-vite-client',
      transformIndexHtml(html) {
        return html.replace(/<script type="module" src="\/@vite\/client"><\/script>\s*/g, '');
      },
    },
  ],
  optimizeDeps: {
    include: ['gsap', 'html2canvas', 'howler', 'pixi.js'],
    exclude: ['@esotericsoftware/spine-pixi-v8'],
  },
  server: {
    host,
    port,
    strictPort: true,
    open: false,
    allowedHosts: true,
    cors: true,
    watch:
      process.env.STAKE_STUDIO_LIVE_RELOAD === '0'
        ? null
        : liveReload
          ? undefined
          : null,
    hmr: false,
  },
});

await server.listen();
server.printUrls();
watchMotionPlanner();
pollAgentInbox();
console.log(
  `[stake-studio] port=${port} host=${host} liveReload=${liveReload ? 'on' : 'off'}  open http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/`,
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
