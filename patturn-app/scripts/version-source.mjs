import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
export const appRoot = fileURLToPath(new URL('../', import.meta.url));
export function validateAppVersion(version) {
  if (
    typeof version !== 'string' ||
    version.trim() !== version ||
    !/^\d+\.\d+\.\d+(?:[-+]|$)/.test(version) ||
    !semver.valid(version)
  )
    throw Error('INVALID_RELEASE_VERSION');
  return version;
}
/** The only authoritative current version is this field, never an independently edited copy. */
export async function readAppVersion(folder = appRoot) {
  return validateAppVersion(
    JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8')).version,
  );
}
