import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hash, qaRequirements, validateGateReport, verifyEvidenceFiles } from './release-gate.mjs';
const qa =
  '## ۶. Release Gate\n### عملکرد\n| شاخص | هدف |\n|---|---|\n| LCP | < 2s |\n## دستی\n- [ ] نصب ویندوز\n- [ ] آزمون CAD\n';
const context = {
  qa,
  version: '0.1.0',
  commit: 'a'.repeat(40),
  now: Date.parse('2026-11-20T12:00:00Z'),
};
function report() {
  return {
    format: 'patturn-release-gate-v1',
    version: context.version,
    commit: context.commit,
    qaSha256: hash(qa),
    reviewer: 'بازبین آزمون',
    performedAt: '2026-11-20T10:00:00Z',
    checks: qaRequirements(qa).map((item) => ({
      id: item.id,
      status: 'passed',
      note: 'آزمون واقعی و گزارش پیوست بررسی شد',
      evidence: { path: 'evidence/result.txt', sha256: hash('real test report') },
    })),
  };
}
test('gate enumerates metric and manual requirements deterministically and accepts a complete matching report', () => {
  assert.equal(qaRequirements(qa).length, 3);
  assert.deepEqual(qaRequirements(qa), qaRequirements(qa));
  assert.equal(validateGateReport(report(), context).length, 3);
  assert.throws(() => qaRequirements('# empty'));
});
test('gate rejects missing, pending, duplicate, stale and unknown requirements without exceptions for N/A', () => {
  for (const mutate of [
    (r) => r.checks.pop(),
    (r) => {
      r.checks[0].status = 'pending';
    },
    (r) => {
      r.checks[0].status = 'not-applicable';
    },
    (r) => {
      r.checks[1] = r.checks[0];
    },
    (r) => {
      r.checks[0].id = 'unknown';
    },
    (r) => {
      r.checks[0].note = '';
    },
  ]) {
    const value = report();
    mutate(value);
    assert.throws(() => validateGateReport(value, context));
  }
});
test('gate binds reports to commit, version, QA content and a recent named review', () => {
  for (const override of [
    { commit: 'b'.repeat(40) },
    { version: '0.2.0' },
    { qaSha256: '0'.repeat(64) },
    { performedAt: '2027-01-01' },
    { performedAt: '2020-01-01' },
    { reviewer: '' },
    { extra: true },
  ])
    assert.throws(() => validateGateReport({ ...report(), ...override }, context));
});
test('gate verifies evidence bytes and rejects tampering, traversal, directories and missing files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'patturn-gate-'));
  try {
    await mkdir(path.join(root, 'evidence'));
    await writeFile(path.join(root, 'evidence/result.txt'), 'real test report');
    const refs = validateGateReport(report(), context);
    await verifyEvidenceFiles(refs, root);
    for (const evidencePath of [
      '../outside',
      '/absolute',
      'evidence\\result.txt',
      'evidence',
      'missing.txt',
    ])
      await assert.rejects(
        verifyEvidenceFiles([{ path: evidencePath, sha256: hash('real test report') }], root),
      );
    await writeFile(path.join(root, 'evidence/result.txt'), 'changed');
    await assert.rejects(verifyEvidenceFiles(refs, root), /GATE_EVIDENCE_HASH/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('gate rejects symlink evidence escaping the repository', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'patturn-gate-')),
    outside = await mkdtemp(path.join(tmpdir(), 'patturn-gate-external-'));
  try {
    await writeFile(path.join(outside, 'proof.txt'), 'real test report');
    await symlink(
      outside,
      path.join(root, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(
      verifyEvidenceFiles([{ path: 'escape/proof.txt', sha256: hash('real test report') }], root),
      /GATE_UNSAFE_EVIDENCE_PATH/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
