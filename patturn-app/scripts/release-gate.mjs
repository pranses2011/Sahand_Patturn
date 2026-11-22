import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export const hash = (text) => createHash('sha256').update(text).digest('hex');
/** All manual checkboxes plus release metric rows are mandatory; never infer a pass. */
export function qaRequirements(markdown) {
  const requirements = [];
  let section = '',
    group = '',
    gate = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      group = line;
      section = line;
      gate = line.includes('Release Gate');
    } else if (line.startsWith('### ')) section = `${group} / ${line}`;
    const manual = /^- \[[ x]\] (.+)$/.exec(line);
    const metric = gate && line.startsWith('|') && !/^\|\s*(شاخص|[-:])/.test(line);
    if (manual || metric) {
      const text = manual ? manual[1] : line;
      const id = hash(section + '\n' + text).slice(0, 20);
      requirements.push({ id, text, section });
    }
  }
  if (
    !requirements.length ||
    new Set(requirements.map((item) => item.id)).size !== requirements.length
  )
    throw Error('GATE_INVALID_QA');
  return requirements;
}
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) =>
  object(value) && Object.keys(value).sort().join('|') === [...expected].sort().join('|');
const text = (value) =>
  typeof value === 'string' && value.trim().length >= 3 && value.length <= 2000;
export function validateGateReport(report, { qa, version, commit, now = Date.now() }) {
  if (
    !keys(report, [
      'format',
      'version',
      'commit',
      'qaSha256',
      'reviewer',
      'performedAt',
      'checks',
    ]) ||
    report.format !== 'patturn-release-gate-v1' ||
    report.version !== version ||
    report.commit !== commit ||
    !/^[a-f0-9]{40}$/.test(commit) ||
    report.qaSha256 !== hash(qa)
  )
    throw Error('GATE_IDENTITY_MISMATCH');
  const time = typeof report.performedAt === 'string' ? Date.parse(report.performedAt) : NaN;
  if (!text(report.reviewer) || !Number.isFinite(time) || time > now || now - time > 30 * 86400000)
    throw Error('GATE_INVALID_REVIEW');
  const required = qaRequirements(qa);
  if (!Array.isArray(report.checks) || report.checks.length !== required.length)
    throw Error('GATE_MISSING_CHECKS');
  const byId = new Map();
  for (const check of report.checks) {
    if (
      !keys(check, ['id', 'status', 'note', 'evidence']) ||
      byId.has(check.id) ||
      check.status !== 'passed' ||
      !text(check.note) ||
      !keys(check.evidence, ['path', 'sha256']) ||
      !text(check.evidence.path) ||
      !/^[a-f0-9]{64}$/.test(check.evidence.sha256)
    )
      throw Error('GATE_INVALID_CHECK');
    byId.set(check.id, check);
  }
  for (const item of required)
    if (!byId.has(item.id)) throw Error(`GATE_UNKNOWN_OR_MISSING_CHECK: ${item.id}`);
  return report.checks.map((check) => check.evidence);
}
export async function verifyEvidenceFiles(references, root) {
  const base = await realpath(root);
  for (const item of references) {
    if (
      path.isAbsolute(item.path) ||
      item.path.includes('\\') ||
      item.path.split('/').some((part) => part === '..' || part === '') ||
      item.path.startsWith('.git/')
    )
      throw Error('GATE_UNSAFE_EVIDENCE_PATH');
    const resolved = await realpath(path.resolve(base, item.path));
    if (!resolved.startsWith(base + path.sep)) throw Error('GATE_UNSAFE_EVIDENCE_PATH');
    const info = await stat(resolved);
    if (!info.isFile() || info.size > 5 * 1024 * 1024) throw Error('GATE_EVIDENCE_SIZE');
    if (hash(await readFile(resolved)) !== item.sha256) throw Error('GATE_EVIDENCE_HASH');
  }
}
async function main() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const qa = await readFile(path.join(root, 'patturn-rebuild/11-QA-ACCEPTANCE.md'), 'utf8');
  const { version } = JSON.parse(
    await readFile(path.join(root, 'patturn-app/package.json'), 'utf8'),
  );
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--template') {
    console.log(
      JSON.stringify(
        {
          format: 'patturn-release-gate-v1',
          version,
          commit,
          qaSha256: hash(qa),
          reviewer: '',
          performedAt: '',
          checks: qaRequirements(qa).map((item) => ({
            id: item.id,
            status: 'pending',
            note: `مدرک لازم: ${item.section} — ${item.text}`,
            evidence: { path: '', sha256: '' },
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (args.length !== 1)
    throw Error('گزارش شواهد لازم است: npm run release:gate -- مسیر-گزارش.json');
  // Working-tree edits would otherwise allow a report for HEAD to certify different source.
  if (
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  )
    throw Error('GATE_DIRTY_WORKTREE');
  const reportPath = path.resolve(process.cwd(), args[0]);
  const info = await stat(reportPath);
  if (!info.isFile() || info.size > 1024 * 1024) throw Error('GATE_REPORT_SIZE');
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const references = validateGateReport(report, { qa, version, commit });
  await verifyEvidenceFiles(references, root);
  console.log(
    `شواهد ساختاری انتشار برای ${version} / ${commit} معتبر است؛ صحت محتوای آزمون‌ها نیازمند بازبینی انسانی است.`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
