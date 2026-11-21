import { defineConfig } from 'vitest/config';
import path from 'node:path';

/** Allow TS sources to import each other with .js extension (NodeNext style). */
const tsExtensions = {
  name: 'ts-ext-resolver',
  enforce: 'pre' as const,
  resolveId(source: string, importer: string | undefined) {
    if (importer && source.endsWith('.js') && (source.startsWith('./') || source.startsWith('../'))) {
      const abs = path.resolve(path.dirname(importer), source.replace(/\.js$/, '.ts'));
      return abs;
    }
    return null;
  },
};

export default defineConfig({
  plugins: [tsExtensions],
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@patturn/config': path.resolve(__dirname, 'packages/config/src/index.ts'),
      '@patturn/schema': path.resolve(__dirname, 'packages/schema/src/index.ts'),
      '@patturn/kernel': path.resolve(__dirname, 'packages/kernel/src/index.ts'),
      '@patturn/patterns': path.resolve(__dirname, 'packages/patterns/src/index.ts'),
      '@patturn/molds': path.resolve(__dirname, 'packages/molds/src/index.ts'),
      '@patturn/exporters': path.resolve(__dirname, 'packages/exporters/src/index.ts'),
      '@patturn/storage': path.resolve(__dirname, 'packages/storage/src/index.ts'),
    },
  },
});
