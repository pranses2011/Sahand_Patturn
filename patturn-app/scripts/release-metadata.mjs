import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import semver from 'semver';

const root = fileURLToPath(new URL('../', import.meta.url));
export function validateReleaseMetadata({ version, versions, changelog }) {
  if (
    typeof version !== 'string' ||
    version.trim() !== version ||
    !/^\d+\.\d+\.\d+(?:[-+]|$)/.test(version) ||
    semver.valid(version) === null
  )
    throw Error('INVALID_RELEASE_VERSION');
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
  const { version } = await json('package.json');
  const lock = await json('package-lock.json');
  const versions = {
    'package-lock.json': lock.version,
    'package-lock.json root': lock.packages?.['']?.version,
  };
  for (const group of ['apps', 'packages']) {
    for (const entry of await readdir(path.join(folder, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relative = `${group}/${entry.name}`;
      versions[`${relative}/package.json`] = (await json(`${relative}/package.json`)).version;
      versions[`package-lock.json ${relative}`] = lock.packages?.[relative]?.version;
    }
  }
  versions['tauri.conf.json'] = (await json('apps/desktop/src-tauri/tauri.conf.json')).version;
  const cargo = await readFile(path.join(folder, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8');
  const packageSection = cargo.split(/^\[package\]\s*$/m)[1]?.split(/^\[/m)[0];
  versions['Cargo.toml package'] = /^version\s*=\s*"([^"]+)"\s*$/m.exec(packageSection ?? '')?.[1];
  const changelog = await readFile(path.join(folder, 'CHANGELOG.fa.md'), 'utf8');
  return validateReleaseMetadata({ version, versions, changelog });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`نسخه و تاریخچهٔ تغییرات هماهنگ‌اند: ${await checkReleaseMetadata()}`);
}
