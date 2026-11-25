import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appRoot, readAppVersion } from './version-source.mjs';
export function cargoWorkspace(version) {
  return `# Generated from package.json by scripts/desktop-version.mjs; DO NOT EDIT.\n[workspace]\nmembers = ["apps/desktop/src-tauri"]\nresolver = "2"\n\n[workspace.package]\nversion = "${version}"\n`;
}
/** Cargo cannot read JSON variables, so its inherited workspace version is a build artifact. */
export async function prepareDesktopVersion(folder = appRoot) {
  const version = await readAppVersion(folder);
  const output = path.join(folder, 'Cargo.toml'),
    expected = cargoWorkspace(version);
  let current;
  try {
    current = await readFile(output, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Protect a real user-created Cargo workspace from accidental overwrite.
  if (
    current !== undefined &&
    !current.startsWith(
      '# Generated from package.json by scripts/desktop-version.mjs; DO NOT EDIT.\n',
    )
  )
    throw Error('REFUSE_TO_OVERWRITE_UNMANAGED_CARGO_WORKSPACE');
  if (current !== expected) {
    await mkdir(folder, { recursive: true });
    await writeFile(output, expected);
  }
  return version;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(`Cargo version: ${await prepareDesktopVersion()}`);
