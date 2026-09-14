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
  server: { port: 5173, strictPort: true },
});
