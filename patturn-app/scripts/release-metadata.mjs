import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readAppVersion, validateAppVersion } from './version-source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function validateReleaseMetadata({ version, versions, changelog }) {
  validateAppVersion(version);
  for (const [source, actual] of Object.entries(versions)) {
    if (actual !== version) throw Error(`RELEASE_VERSION_MISMATCH: ${source}`);
  }
  const headings = [...changelog.matchAll(/^## \[([^\]\r\n]+)\]/gm)].map((match) => match[1]);
  if (headings.filter((entry) => entry === version).length !== 1)
    throw Error('RELEASE_CHANGELOG_ENTRY_MISSING_OR_DUPLICATE');
  const heading = new RegExp(
    `^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\].*$`,
    'm',
  ).exec(changelog);
  const section = changelog.slice(heading.index + heading[0].length).split(/^## /m)[0];
  if (!/[\u0600-\u06ff]/.test(section)) throw Error('RELEASE_CHANGELOG_PERSIAN_REQUIRED');
  return version;
}

export async function checkReleaseMetadata(folder = root) {
  const json = async (relative) => JSON.parse(await readFile(path.join(folder, relative), 'utf8'));
  const version = await readAppVersion(folder);
  const lock = await json('package-lock.json');
  if (Object.hasOwn(lock, 'version') || Object.hasOwn(lock.packages?.[''] ?? {}, 'version'))
    throw Error('DUPLICATE_ROOT_LOCK_VERSION');
  const packages = [];
  for (const group of ['apps', 'packages']) {
    for (const entry of await readdir(path.join(folder, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relative = `${group}/${entry.name}`;
      const data = await json(`${relative}/package.json`);
      if (
        data.private !== true ||
        Object.hasOwn(data, 'version') ||
        Object.hasOwn(lock.packages?.[relative] ?? {}, 'version')
      )
        throw Error(`DUPLICATE_WORKSPACE_VERSION: ${relative}`);
      packages.push(data);
    }
  }
  const names = new Set(packages.map((data) => data.name));
  for (const data of packages)
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ])
      for (const [name, range] of Object.entries(data[field] ?? {}))
        if (names.has(name) && range !== '*') throw Error(`PINNED_INTERNAL_VERSION: ${name}`);
  const config = await json('apps/desktop/src-tauri/tauri.conf.json');
  if (config.version !== '../../../package.json') throw Error('TAURI_VERSION_NOT_SINGLE_SOURCE');
  const cargo = await readFile(path.join(folder, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8');
  const packageSection = cargo.split(/^\[package\]\s*$/m)[1]?.split(/^\[/m)[0] ?? '';
  if (
    !/^version\.workspace\s*=\s*true\s*$/m.test(packageSection) ||
    /^version\s*=/m.test(packageSection)
  )
    throw Error('CARGO_VERSION_NOT_INHERITED');
  const versions = { tauri: version, cargo: version };
  const changelog = await readFile(path.join(folder, 'CHANGELOG.fa.md'), 'utf8');
  return validateReleaseMetadata({ version, versions, changelog });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`نسخه و تاریخچهٔ تغییرات هماهنگ‌اند: ${await checkReleaseMetadata()}`);
}
