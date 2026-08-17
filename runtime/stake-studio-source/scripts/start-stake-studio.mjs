import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, loadEnv } from 'vite';

import { stakeStudioBridge } from '../server/bridge-plugin.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = loadEnv('development', root, '');

// Ports:
//   3000 — default / ChatGPT lane (npm run dev)
//   3001 — agent lane (npm run dev:agent) with live reload so git pull
//          does not require Ctrl+C + restart.
const port = Number(process.env.PORT || process.env.STAKE_STUDIO_PORT || 3000);
const liveReload =
  process.env.STAKE_STUDIO_LIVE_RELOAD === '1' ||
  process.env.STAKE_STUDIO_LIVE_RELOAD === 'true' ||
  process.env.STAKE_STUDIO_AGENT === '1';

const server = await createServer({
  configFile: false,
  root,
  publicDir: 'public',
  plugins: [stakeStudioBridge({ openaiApiKey: env.OPENAI_API_KEY })],
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    open: false,
    // Live-reload watches source so pulled agent commits appear without
    // killing the process. Disable only with STAKE_STUDIO_LIVE_RELOAD=0.
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
console.log(
  `[stake-studio] port=${port} liveReload=${liveReload ? 'on' : 'off'} (agent lane: PORT=3001 npm run dev:agent)`,
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
