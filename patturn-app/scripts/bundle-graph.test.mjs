import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staticGraph, graphFiles } from './bundle-graph.mjs';

test('static closure deduplicates shared chunks and excludes dynamic imports',()=>{
  const manifest={entry:{file:'entry.js',imports:['a','b'],dynamicImports:['pdf']},a:{file:'a.js',imports:['shared']},b:{file:'b.js',imports:['shared']},shared:{file:'shared.js'},pdf:{file:'pdf.js'}};
  assert.deepEqual([...staticGraph(manifest,'entry')],['entry','a','shared','b']);
});
test('cyclic manifest edges terminate without double counting',()=>{
  const manifest={a:{file:'a.js',imports:['b']},b:{file:'b.js',imports:['a']}};
  assert.deepEqual(graphFiles(manifest,staticGraph(manifest,'a')),['a.js','b.js']);
});
test('counts duplicate output paths once and excludes CSS or assets',()=>{
  const manifest={a:{file:'shared.js'},b:{file:'shared.js'},css:{file:'style.css'},font:{file:'font.ttf'}};
  assert.deepEqual(graphFiles(manifest,new Set(Object.keys(manifest))),['shared.js']);
});
test('missing entries and imports fail instead of returning an undercount',()=>{
  assert.throws(()=>staticGraph({},'missing'),/BUILD_CHUNK_MISSING:missing/);
  assert.throws(()=>staticGraph({entry:{imports:['lost']}},'entry'),/BUILD_CHUNK_MISSING:lost/);
  assert.throws(()=>graphFiles({},new Set(['lost'])),/BUILD_CHUNK_MISSING:lost/);
});
test('prototype keys do not count as manifest chunks',()=>{
  assert.throws(()=>staticGraph({},'constructor'),/BUILD_CHUNK_MISSING/);
});
