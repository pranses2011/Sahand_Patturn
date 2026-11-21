// Same checks on Linux, macOS and Windows; no shell globbing or Bash loop.
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/lib/tsc.js');
const projects = ['apps/web', 'e2e', ...readdirSync(path.join(root, 'packages')).sort().map((p) => `packages/${p}`)]
  .filter((p) => existsSync(path.join(root, p, 'tsconfig.json')));
for (const project of projects) {
  console.log(`Typecheck: ${project}`);
  const result = spawnSync(process.execPath, [tsc, '-p', project, '--noEmit'], { cwd: root, stdio: 'inherit' });
  if (result.error) { console.error(result.error); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
