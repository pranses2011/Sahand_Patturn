import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import semver from 'semver';
import { checkReleaseMetadata } from './release-metadata.mjs';
export function nextVersion(current, level) {
  if (!['patch', 'minor', 'major'].includes(level) || !semver.valid(current))
    throw Error('INVALID_VERSION_BUMP');
  return semver.inc(current, level);
}
export async function bumpVersion(folder, level) {
  const old = await checkReleaseMetadata(folder),
    version = nextVersion(old, level);
  const load = async (file) => JSON.parse(await readFile(path.join(folder, file), 'utf8'));
  const files = ['package.json'];
  for (const group of ['apps', 'packages'])
    for (const entry of await readdir(path.join(folder, group), { withFileTypes: true }))
      if (entry.isDirectory()) files.push(`${group}/${entry.name}/package.json`);
  const documents = await Promise.all(
    files.map(async (file) => ({ file, data: await load(file) })),
  );
  const names = new Set(documents.map((item) => item.data.name));
  const lock = await load('package-lock.json');
  const update = (data) => {
    data.version = version;
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ])
      for (const name of Object.keys(data[field] ?? {})) {
        if (
          names.has(name) &&
          !['*'].includes(data[field][name]) &&
          !data[field][name].startsWith('workspace:')
        )
          data[field][name] = `^${version}`;
      }
  };
  for (const item of documents) {
    update(item.data);
    update(lock.packages[item.file === 'package.json' ? '' : path.posix.dirname(item.file)]);
  }
  lock.version = version;
  const tauri = await load('apps/desktop/src-tauri/tauri.conf.json');
  tauri.version = version;
  const cargoFile = 'apps/desktop/src-tauri/Cargo.toml';
  const cargo = (await readFile(path.join(folder, cargoFile), 'utf8')).replace(
    /(\[package\][\s\S]*?^version\s*=\s*")[^"]+("\s*$)/m,
    `$1${version}$2`,
  );
  const changelogFile = 'CHANGELOG.fa.md';
  const original = await readFile(path.join(folder, changelogFile), 'utf8');
  const unreleased = original.split('## [منتشرنشده]')[1]?.split(/^## /m)[0];
  if (!unreleased || !/[\u0600-\u06ff]/.test(unreleased))
    throw Error('UNRELEASED_CHANGES_REQUIRED');
  const changelog = original.replace(
    '## [منتشرنشده]',
    `## [منتشرنشده]\n\n## [${version}] — نسخهٔ آزمایشی`,
  );
  const outputs = [
    ...documents,
    { file: 'package-lock.json', data: lock },
    { file: 'apps/desktop/src-tauri/tauri.conf.json', data: tauri },
  ].map(({ file, data }) => [file, JSON.stringify(data, null, 2) + '\n']);
  outputs.push([cargoFile, cargo], [changelogFile, changelog]);
  for (const [file, text] of outputs) await writeFile(path.join(folder, file), text);
  return version;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(await bumpVersion(fileURLToPath(new URL('../', import.meta.url)), process.argv[2]));
