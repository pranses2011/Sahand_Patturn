import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function writeInstallerChecksums(folder) {
  const names = (await readdir(folder))
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .sort();
  if (!names.length) throw new Error('NO_NSIS_INSTALLER');
  const lines = [];
  for (const name of names) {
    if (/[\r\n\\/]/.test(name)) throw new Error('UNSAFE_INSTALLER_NAME');
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(path.join(folder, name))) hash.update(bytes);
    lines.push(`${hash.digest('hex')}  ${name}`);
  }
  await writeFile(path.join(folder, 'SHA256SUMS.txt'), lines.join('\n') + '\n', 'utf8');
  await copyFile(
    path.join(root, 'docs/windows-test-guide.txt'),
    path.join(folder, 'README-WINDOWS-TEST.txt'),
  );
  await writeFile(
    path.join(folder, 'build-info.json'),
    JSON.stringify(
      {
        commit: process.env.GITHUB_SHA ?? null,
        runUrl:
          process.env.GITHUB_SERVER_URL &&
          process.env.GITHUB_REPOSITORY &&
          process.env.GITHUB_RUN_ID
            ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
            : null,
        unsigned: true,
        installationTested: false,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  return lines;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const folder = path.resolve(
    process.argv[2] ?? path.join(root, 'apps/desktop/src-tauri/target/release/bundle/nsis'),
  );
  console.log((await writeInstallerChecksums(folder)).join('\n'));
}
