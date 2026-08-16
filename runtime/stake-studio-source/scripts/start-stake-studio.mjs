import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, loadEnv } from 'vite';

import { stakeStudioBridge } from '../server/bridge-plugin.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = loadEnv('development', root, '');
const liveReload = process.env.STAKE_STUDIO_LIVE_RELOAD === '1';

// Build the development configuration in memory. The managed workspace can
// replay vite.config.js while tools are active; Vite occasionally read that
// file between writes and exited on a valid-but-temporarily-truncated config.
const server = await createServer({
  configFile: false,
  root,
  publicDir: 'public',
  plugins: [stakeStudioBridge({ openaiApiKey: env.OPENAI_API_KEY })],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    open: false,
    watch: liveReload ? undefined : null,
    hmr: liveReload,
  },
});

await server.listen();
server.printUrls();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
