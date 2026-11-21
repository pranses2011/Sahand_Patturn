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
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@patturn/config': path.resolve(import.meta.dirname, 'packages/config/src/index.ts'),
      '@patturn/schema': path.resolve(import.meta.dirname, 'packages/schema/src/index.ts'),
      '@patturn/kernel': path.resolve(import.meta.dirname, 'packages/kernel/src/index.ts'),
      '@patturn/patterns': path.resolve(import.meta.dirname, 'packages/patterns/src/index.ts'),
      '@patturn/molds': path.resolve(import.meta.dirname, 'packages/molds/src/index.ts'),
      '@patturn/exporters': path.resolve(import.meta.dirname, 'packages/exporters/src/index.ts'),
      '@patturn/storage': path.resolve(import.meta.dirname, 'packages/storage/src/index.ts'),
    },
  },
});
