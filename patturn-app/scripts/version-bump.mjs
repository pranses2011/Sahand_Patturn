import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import semver from 'semver';
import { readAppVersion } from './version-source.mjs';
export function nextVersion(current, level) {
  if (!['patch', 'minor', 'major'].includes(level) || !semver.valid(current))
    throw Error('INVALID_VERSION_BUMP');
  return semver.inc(current, level);
}
/** Change exactly one authoritative field. Release notes are maintained separately. */
export async function bumpVersion(folder, level) {
  const version = nextVersion(await readAppVersion(folder), level);
  const file = path.join(folder, 'package.json'),
    metadata = JSON.parse(await readFile(file, 'utf8'));
  metadata.version = version;
  await writeFile(file, JSON.stringify(metadata, null, 2) + '\n');
  return version;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(await bumpVersion(fileURLToPath(new URL('../', import.meta.url)), process.argv[2]));
