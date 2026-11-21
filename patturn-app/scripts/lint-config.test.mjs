import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';

const eslint = new ESLint();
test('lint parses TypeScript, JSX and JavaScript without type-aware or formatting requirements',async()=>{
  for (const [filePath,source] of [
    ['apps/web/src/lint-probe.tsx','const Title = ({name}:{name:string}) => <h1>{name}</h1>; export { Title };'],
    ['packages/kernel/src/lint-probe.ts','export function size(n:number):number { return n * 2; }'],
    ['scripts/lint-probe.mjs','export const task = async () => { await Promise.resolve(); };'],
  ]) {
    const [result] = await eslint.lintText(source,{filePath});
    assert.equal(result.errorCount,0,JSON.stringify(result.messages));
    assert.equal(result.warningCount,0);
  }
});
test('lint rejects representative correctness defects in both TS and JS',async()=>{
  for (const filePath of ['packages/kernel/src/lint-probe.ts','scripts/lint-probe.mjs']) {
    for (const [source,rule] of [
      ['debugger;', 'no-debugger'],
      ['new Promise(async (resolve) => { resolve(1); });','no-async-promise-executor'],
      ['function bad() { try { throw Error(); } finally { return 1; } }','no-unsafe-finally'],
      ['function bad() { return 1; throw Error(); }','no-unreachable'],
      ['const bad = [,1];','no-sparse-arrays'],
      ['new Promise((resolve) => resolve(1));','no-promise-executor-return'],
    ]) {
      const [result] = await eslint.lintText(source,{filePath});
      assert.ok(result.messages.some((message)=>message.ruleId===rule && message.severity===2),`${filePath}: ${rule}`);
    }
  }
});
test('lint ignores generated artifacts and dependencies, but includes production, tests and config',async()=>{
  for (const path of ['node_modules/probe.js','apps/web/dist/probe.js','apps/desktop/src-tauri/target/probe.js','apps/desktop/src-tauri/gen/probe.js','.cache/probe.js','test-results/probe.js']) {
    assert.equal(await eslint.isPathIgnored(path),true,path);
  }
  for (const path of ['apps/web/src/App.tsx','packages/kernel/src/index.ts','e2e/editor.spec.ts','scripts/lint-config.test.mjs','eslint.config.mjs']) {
    assert.equal(await eslint.isPathIgnored(path),false,path);
  }
});
