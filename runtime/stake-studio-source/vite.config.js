import { defineConfig, loadEnv } from 'vite';
import { stakeStudioBridge } from './server/bridge-plugin.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const liveReload = env.STAKE_STUDIO_LIVE_RELOAD === '1';
  return {
    root: '.',
    publicDir: 'public',
    plugins: [stakeStudioBridge({ openaiApiKey: env.OPENAI_API_KEY })],
    server: {
      // Keep the browser, launcher, and MCP bridge on one unambiguous local
      // address. macOS may otherwise resolve `localhost` to IPv6 while the MCP
      // connector uses IPv4, leaving both healthy but unable to see each other.
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      open: false,
      // Stable by default. The managed workspace can replay file writes while
      // tools are active; watching those writes caused restart storms and left
      // the browser attached to a half-restarted server. Opt in to HMR only
      // during an intentional editing session with STAKE_STUDIO_LIVE_RELOAD=1.
      watch: liveReload ? undefined : null,
      hmr: liveReload,
    },
    build: {
      outDir: 'dist',
      target: 'esnext'
    }
  };
});
