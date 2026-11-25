import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { measureGraph, budgetResult, incrementalGraph } from './bundle-metrics.mjs';

const manifest = {
  entry: { file: 'entry.js' },
  shared: { file: 'shared.js' },
  alias: { file: 'shared.js' },
  viewer: { file: 'viewer.js' },
  css: { file: 'style.css' },
};
const data = {
  'entry.js': Buffer.from('small'),
  'shared.js': Buffer.from('shared code'),
  'viewer.js': Buffer.from('viewer code'),
};
const read = (file) => data[file];
test('metrics count emitted JS once, with independent gzip per file', () => {
  const result = measureGraph(manifest, new Set(Object.keys(manifest)), read);
  assert.equal(
    result.rawBytes,
    Object.values(data).reduce((n, bytes) => n + bytes.length, 0),
  );
  assert.equal(
    result.gzipBytes,
    Object.values(data).reduce((n, bytes) => n + gzipSync(bytes).length, 0),
  );
  assert.deepEqual(
    result.chunks.map((chunk) => chunk.file),
    ['shared.js', 'viewer.js', 'entry.js'],
  );
});
test('chunk ordering is stable regardless of graph insertion order', () => {
  assert.deepEqual(
    measureGraph(manifest, new Set(['entry', 'shared', 'viewer']), read),
    measureGraph(manifest, new Set(['viewer', 'shared', 'entry']), read),
  );
});
test('viewer incremental cost excludes shared output aliases', () => {
  const core = new Set(['entry', 'shared']);
  const additional = incrementalGraph(manifest, new Set(['viewer', 'alias']), core);
  assert.deepEqual([...additional], ['viewer']);
  assert.equal(
    measureGraph(manifest, core, read).rawBytes + measureGraph(manifest, additional, read).rawBytes,
    measureGraph(manifest, new Set([...core, 'viewer', 'alias']), read).rawBytes,
  );
});
test('empty graph has no chunks or compressed overhead', () => {
  assert.deepEqual(
    measureGraph({}, new Set(), () => {
      throw Error('unexpected read');
    }),
    { rawBytes: 0, gzipBytes: 0, chunks: [] },
  );
});
test('missing emitted files fail instead of silently lowering the report', () => {
  assert.throws(
    () =>
      measureGraph(manifest, new Set(['entry']), () => {
        throw Error('ENOENT');
      }),
    /ENOENT/,
  );
  assert.throws(() => measureGraph(manifest, new Set(['missing']), read), /BUILD_CHUNK_MISSING/);
});
test('budget is strictly below the roadmap limit, opt-in and explicit about excess', () => {
  assert.equal(budgetResult(599999).met, true);
  assert.equal(budgetResult(600000).met, false);
  assert.equal(budgetResult(600001).excessRawBytes, 1);
  assert.equal(budgetResult(1).enforcing, false);
  assert.equal(budgetResult(1, 600000, true).enforcing, true);
});
test('invalid limits and measurements cannot produce a passing report', () => {
  for (const [actual, limit] of [
    [NaN, 1],
    [Infinity, 1],
    [-1, 1],
    [1, 0],
    [1, -1],
    [1, 1.5],
    [0.5, 1],
    [Number.MAX_SAFE_INTEGER + 1, 1],
  ])
    assert.throws(() => budgetResult(actual, limit), /INVALID_BUNDLE_BUDGET/);
});

test('incremental graph rejects missing baseline and viewer chunks', () => {
  assert.throws(
    () => incrementalGraph(manifest, new Set(['missing']), new Set()),
    /BUILD_CHUNK_MISSING/,
  );
  assert.throws(
    () => incrementalGraph(manifest, new Set(), new Set(['missing'])),
    /BUILD_CHUNK_MISSING/,
  );
});
