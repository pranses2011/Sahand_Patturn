import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';

const eslint = new ESLint();
test('lint parses TypeScript, JSX and JavaScript without type-aware or formatting requirements', async () => {
  for (const [filePath, source] of [
    [
      'apps/web/src/lint-probe.tsx',
      'const Title = ({name}:{name:string}) => <h1>{name}</h1>; export { Title };',
    ],
    [
      'packages/kernel/src/lint-probe.ts',
      'export function size(n:number):number { return n * 2; }',
    ],
    ['scripts/lint-probe.mjs', 'export const task = async () => { await Promise.resolve(); };'],
  ]) {
    const [result] = await eslint.lintText(source, { filePath });
    assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
    assert.equal(result.warningCount, 0);
  }
});
test('lint rejects representative correctness defects in both TS and JS', async () => {
  for (const filePath of ['packages/kernel/src/lint-probe.ts', 'scripts/lint-probe.mjs']) {
    for (const [source, rule] of [
      ['debugger;', 'no-debugger'],
      ['new Promise(async (resolve) => { resolve(1); });', 'no-async-promise-executor'],
      ['function bad() { try { throw Error(); } finally { return 1; } }', 'no-unsafe-finally'],
      ['function bad() { return 1; throw Error(); }', 'no-unreachable'],
      ['const bad = [,1];', 'no-sparse-arrays'],
      ['new Promise((resolve) => resolve(1));', 'no-promise-executor-return'],
    ]) {
      const [result] = await eslint.lintText(source, { filePath });
      assert.ok(
        result.messages.some((message) => message.ruleId === rule && message.severity === 2),
        `${filePath}: ${rule}`,
      );
    }
  }
});
test('lint ignores generated artifacts and dependencies, but includes production, tests and config', async () => {
  for (const path of [
    'node_modules/probe.js',
    'apps/web/dist/probe.js',
    'apps/desktop/src-tauri/target/probe.js',
    'apps/desktop/src-tauri/gen/probe.js',
    '.cache/probe.js',
    'test-results/probe.js',
  ]) {
    assert.equal(await eslint.isPathIgnored(path), true, path);
  }
  for (const path of [
    'apps/web/src/App.tsx',
    'packages/kernel/src/index.ts',
    'e2e/editor.spec.ts',
    'scripts/lint-config.test.mjs',
    'eslint.config.mjs',
  ]) {
    assert.equal(await eslint.isPathIgnored(path), false, path);
  }
});

test('package import boundaries reject reverse, app and cross-layer dependencies in all import forms', async () => {
  for (const source of [
    "import { thing } from '@patturn/exporters';",
    "export * from '@patturn/storage';",
    "export { thing } from '../../storage/src/index.js';",
    "const x = import('@patturn/molds');",
    "const x = require('@patturn/schema');",
    "import type { Thing } from '../../../apps/web/src/App';",
  ]) {
    const [result] = await eslint.lintText(source, {
      filePath: 'packages/kernel/src/boundary-probe.ts',
    });
    assert.ok(
      result.messages.some((message) => message.ruleId === 'architecture/boundaries'),
      source,
    );
  }
});
test('package boundaries allow lower layers, local modules and test-only integration imports', async () => {
  for (const [filePath, source] of [
    ['packages/molds/src/probe.ts', "import type { Mesh } from '@patturn/kernel';"],
    ['packages/storage/src/probe.ts', "export * from '@patturn/schema';"],
    ['packages/kernel/src/probe.ts', "export * from './profile.js';"],
    ['packages/kernel/src/probe.test.ts', "import { output } from '@patturn/exporters';"],
    ['apps/web/src/probe.ts', "import { output } from '@patturn/exporters';"],
  ]) {
    const [result] = await eslint.lintText(source, { filePath });
    assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
  }
});
test('format policy detects drift and produces idempotent TypeScript, JSX, CSS and JSON', async () => {
  const prettier = await import('prettier');
  const config = await prettier.resolveConfig('apps/web/src/App.tsx');
  for (const [filepath, source] of [
    ['probe.ts', 'export const x={value:1};'],
    ['probe.tsx', 'export const Title=()=> <h1>سلام</h1>;'],
    ['probe.css', 'body{color:red}'],
    ['probe.json', '{"value":1}'],
  ]) {
    const options = { ...config, filepath };
    assert.equal(await prettier.check(source, options), false);
    const formatted = await prettier.format(source, options);
    assert.equal(await prettier.check(formatted, options), true);
    assert.equal(await prettier.format(formatted, options), formatted);
  }
});
