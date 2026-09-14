import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      ['configuration', 'world-format', 'protocol'].map((name) => [
        `@brumbrum/${name}`,
        fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url)),
      ]),
    ),
  },
  build: { chunkSizeWarningLimit: 1800 },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/multiplayer': { target: 'ws://127.0.0.1:8080', ws: true },
      '/api/network': { target: 'http://127.0.0.1:8080' },
    },
  },
  preview: {
    host: '0.0.0.0',
    proxy: {
      '/multiplayer': { target: 'ws://127.0.0.1:8080', ws: true },
      '/api/network': { target: 'http://127.0.0.1:8080' },
    },
  },
});
