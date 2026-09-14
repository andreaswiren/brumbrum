import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      ['configuration', 'world-format', 'protocol'].map((name) => [
        `@brumbrum/${name}`,
        fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
      ]),
    ),
  },
  test: { testTimeout: 30000 },
});
