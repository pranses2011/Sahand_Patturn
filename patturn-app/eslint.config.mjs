import boundaries from './scripts/import-boundaries.mjs';
import tsParser from '@typescript-eslint/parser';

// Correctness checks, not formatting. TypeScript remains responsible for types.
const correctnessRules = {
  'constructor-super': 'error',
  'for-direction': 'error',
  'getter-return': 'error',
  'no-async-promise-executor': 'error',
  'no-compare-neg-zero': 'error',
  'no-cond-assign': ['error', 'always'],
  'no-constant-binary-expression': 'error',
  'no-debugger': 'error',
  'no-dupe-args': 'error',
  'no-dupe-else-if': 'error',
  'no-duplicate-case': 'error',
  'no-empty-pattern': 'error',
  'no-ex-assign': 'error',
  'no-fallthrough': 'error',
  'no-loss-of-precision': 'error',
  'no-promise-executor-return': 'error',
  'no-self-assign': 'error',
  'no-sparse-arrays': 'error',
  'no-unexpected-multiline': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
};

const platformGlobals = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'process',
  'Buffer',
  'Deno',
  'Bun',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      '**/gen/**',
      '**/.cache/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { architecture: { rules: { boundaries } } },
    rules: { ...correctnessRules, 'architecture/boundaries': 'error' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    // TypeScript checks constructor/super and permits overload declarations.
    rules: { 'constructor-super': 'off', 'no-dupe-args': 'off', 'getter-return': 'off' },
  },
  {
    files: ['packages/{kernel,patterns,schema,config}/src/**/*.{ts,tsx,js}'],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      'no-restricted-globals': ['error', ...platformGlobals],
      'no-restricted-properties': [
        'error',
        ...platformGlobals.map((property) => ({
          object: 'globalThis',
          property,
          message: 'Core packages must not access platform APIs.',
        })),
      ],
    },
  },
];
