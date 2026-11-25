import { optionalMessages } from './tooling/optional-messages';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const pkgs = ['config', 'schema', 'kernel', 'patterns', 'molds', 'exporters', 'storage'] as const;
const alias = Object.fromEntries(
  pkgs.map((p) => [
    `@patturn/${p}`,
    path.resolve(import.meta.dirname, `../../packages/${p}/src/index.ts`),
  ]),
);

export default defineConfig({
  base: './',
  plugins: [optionalMessages(), react()],
  resolve: {
    alias: {
      '@patturn/molds/analysis': path.resolve(
        import.meta.dirname,
        '../../packages/molds/src/analysis.ts',
      ),
      ...alias,
    },
  },
  worker: { format: 'es' },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true as unknown as string[], // allow preview tunnel hosts
  },
  build: { outDir: 'dist', sourcemap: false, manifest: true },
});
